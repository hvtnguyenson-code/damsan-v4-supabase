import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARTIFACT_BUCKET = "knowledge-artifacts";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const DETECTOR_VERSION = "036B5B";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;
type PageRow = { page_number?: number; text?: string };
type TocEntry = {
  lessonNo: number;
  printedPage: number;
  physicalTocPage: number;
  title: string;
  score: number;
  source: string;
};
type BodyAnchor = { lessonNo: number; physicalPage: number; score: number };

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object_invalid");
  return value as JsonObject;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function requireStaff(body: JsonObject) {
  const staffToken = cleanString(body.staff_token, 2048);
  const maGv = cleanString(body.ma_gv, 160);
  if (!staffToken || !maGv) throw new Error("staff_session_invalid");
  const tokenHash = await sha256Hex(staffToken);
  const { data: session, error: sessionError } = await admin
    .from("staff_sessions")
    .select("gv_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (sessionError || !session || !isUuid(session.gv_id)) throw new Error("staff_session_invalid");
  if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) throw new Error("staff_session_invalid");
  const { data: teacher, error: teacherError } = await admin
    .from("giao_vien")
    .select("id,ma_gv,truong_id,quyen,mat_khau")
    .eq("id", session.gv_id)
    .maybeSingle();
  if (teacherError || !teacher || !isUuid(teacher.id) || !isUuid(teacher.truong_id)) throw new Error("staff_session_invalid");
  if (teacher.ma_gv !== maGv) throw new Error("staff_identity_mismatch");
  if (teacher.mat_khau === "123456" || teacher.mat_khau === DEFAULT_PASSWORD_HASH) throw new Error("staff_session_invalid");
  return { id: teacher.id, quyen: teacher.quyen };
}

async function ownedDocument(actor: { id: string; quyen: string }, documentId: string) {
  if (!isUuid(documentId)) throw new Error("document_invalid");
  const { data, error } = await admin
    .from("knowledge_documents")
    .select("id,owner_gv_id,title,original_filename,page_count,pipeline_status,extraction_manifest,book_index")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !data) throw new Error("document_unavailable");
  if (actor.quyen !== "Admin" && data.owner_gv_id !== actor.id) throw new Error("document_unavailable");
  if (!data.extraction_manifest?.artifact_path) throw new Error("extraction_artifact_missing");
  return data;
}

async function readArtifact(storagePath: string) {
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).download(storagePath);
  if (error || !data) throw new Error("extraction_artifact_unavailable");
  const text = await data.text();
  if (!text || text.length > 8 * 1024 * 1024) throw new Error("extraction_artifact_invalid");
  let artifact: JsonObject;
  try {
    artifact = asObject(JSON.parse(text));
  } catch {
    throw new Error("extraction_artifact_invalid");
  }
  if (artifact.schema_version !== "DAMSAN_EXTRACT_V1" || artifact.boundary_mode !== "PDF_PAGE" || !Array.isArray(artifact.pages)) {
    throw new Error("extraction_artifact_invalid");
  }
  return artifact;
}

function foldOcr(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[|¦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function foldOcrLines(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[|¦]/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean);
}

function lessonMarkerRegex() {
  // Numeric lessons only. Roman numerals are deliberately excluded because
  // OCR turns ordinary Vietnamese words such as "vì" into false lesson VI hits.
  return /\bb\s*[a4]\s*[i1l|]\s*[:.\-]?\s*(\d{1,3})\b/giu;
}

function cleanTitle(raw: string, lessonNo: number) {
  let title = String(raw || "").replace(/\s+/g, " ").trim();
  title = title.replace(/^[.:\-–—\s]+/u, "").replace(/[.·•…\s]+$/u, "").trim();
  title = title.replace(/\b\d{1,3}\s*$/u, "").trim();
  if (title.length < 3) return `Bài ${lessonNo}`;
  return `Bài ${lessonNo}. ${title}`.slice(0, 300);
}

function lastPageToken(text: string, startIndex: number, totalPages: number) {
  const tail = text.slice(startIndex);
  const matches = Array.from(tail.matchAll(/\b(\d{1,3})\b/g));
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const candidate = Number(matches[i][1]);
    if (candidate < 1 || candidate > totalPages + 20) continue;
    const absoluteIndex = startIndex + Number(matches[i].index || 0);
    return { value: candidate, index: absoluteIndex };
  }
  return null;
}

function parseTocBlocks(text: string, physicalPage: number, totalPages: number) {
  const folded = foldOcr(text);
  const headingRx = lessonMarkerRegex();
  const hits: Array<{ index: number; end: number; lessonNo: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRx.exec(folded)) !== null) {
    const lessonNo = Number(match[1]);
    if (lessonNo >= 1 && lessonNo <= 120) hits.push({ index: match.index, end: headingRx.lastIndex, lessonNo });
  }
  const rows: TocEntry[] = [];
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    const next = hits[i + 1]?.index ?? Math.min(folded.length, hit.index + 900);
    const block = folded.slice(hit.end, next).trim();
    if (!block || block.length > 900) continue;
    const pageToken = lastPageToken(block, 0, totalPages);
    if (!pageToken) continue;
    const printedPage = pageToken.value;
    if (printedPage < hit.lessonNo) continue;
    const titleRaw = block.slice(0, pageToken.index).replace(/[.·•…\s]+$/u, "").trim();
    if (titleRaw.length < 2 || titleRaw.length > 500) continue;
    rows.push({
      lessonNo: hit.lessonNo,
      printedPage,
      physicalTocPage: physicalPage,
      title: cleanTitle(titleRaw, hit.lessonNo),
      score: 8,
      source: "EXPLICIT_BLOCK",
    });
  }
  return rows;
}

function parseTocLines(text: string, physicalPage: number, totalPages: number) {
  const lines = foldOcrLines(text);
  const rows: TocEntry[] = [];

  for (let start = 0; start < lines.length; start += 1) {
    for (let width = 1; width <= 4 && start + width <= lines.length; width += 1) {
      const window = lines.slice(start, start + width).join(" ");
      if (window.length < 8 || window.length > 520) continue;
      const rx = lessonMarkerRegex();
      const marker = rx.exec(window);
      if (!marker || marker.index > 48) continue;
      if (rx.exec(window)) continue;
      const lessonNo = Number(marker[1]);
      if (lessonNo < 1 || lessonNo > 120) continue;
      const markerEnd = marker.index + marker[0].length;
      const pageToken = lastPageToken(window, markerEnd, totalPages);
      if (!pageToken || pageToken.value < lessonNo) continue;
      const titleRaw = window.slice(markerEnd, pageToken.index).replace(/[.·•…\s]+$/u, "").trim();
      if (titleRaw.length < 3 || titleRaw.length > 320) continue;
      rows.push({
        lessonNo,
        printedPage: pageToken.value,
        physicalTocPage: physicalPage,
        title: cleanTitle(titleRaw, lessonNo),
        score: width === 1 ? 10 : 9,
        source: width === 1 ? "EXPLICIT_LINE" : "EXPLICIT_LINE_WINDOW",
      });
    }

    const line = lines[start];
    if (line.length < 8 || line.length > 280) continue;
    const orphan = /^(\d{1,2})\s*[.):\-]?\s+(.{3,220}?)\s+(\d{1,3})\s*$/.exec(line);
    if (!orphan) continue;
    const lessonNo = Number(orphan[1]);
    const printedPage = Number(orphan[3]);
    const titleRaw = orphan[2].replace(/[.·•…\s]+$/u, "").trim();
    const letters = (titleRaw.match(/[a-z]/giu) || []).length;
    if (lessonNo < 1 || lessonNo > 120 || printedPage < lessonNo || printedPage > totalPages + 20 || letters < 4) continue;
    rows.push({
      lessonNo,
      printedPage,
      physicalTocPage: physicalPage,
      title: cleanTitle(titleRaw, lessonNo),
      score: 5,
      source: "ORPHAN_NUMERIC_ROW",
    });
  }
  return rows;
}

function dedupeCandidates(rows: TocEntry[]) {
  const best = new Map<string, TocEntry>();
  for (const row of rows) {
    const key = `${row.lessonNo}:${row.printedPage}`;
    const current = best.get(key);
    if (!current || row.score > current.score || (row.score === current.score && row.title.length > current.title.length)) {
      best.set(key, row);
    }
  }
  return Array.from(best.values());
}

function selectMonotonicSequence(rows: TocEntry[]) {
  const candidates = dedupeCandidates(rows)
    .filter((row) => row.lessonNo >= 1 && row.lessonNo <= 120 && row.printedPage >= row.lessonNo)
    .sort((a, b) => a.lessonNo - b.lessonNo || a.printedPage - b.printedPage || b.score - a.score);
  if (!candidates.length) return [];

  const dp = candidates.map((candidate) => ({ value: candidate.score, count: 1, previous: -1 }));
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const prev = candidates[j];
      const cur = candidates[i];
      if (prev.lessonNo >= cur.lessonNo || prev.printedPage >= cur.printedPage) continue;
      const lessonGap = cur.lessonNo - prev.lessonNo;
      const transition = lessonGap === 1 ? 4 : lessonGap <= 3 ? 1.5 : -Math.min(4, lessonGap * 0.15);
      const value = dp[j].value + cur.score + transition;
      const count = dp[j].count + 1;
      if (value > dp[i].value || (Math.abs(value - dp[i].value) < 0.001 && count > dp[i].count)) {
        dp[i] = { value, count, previous: j };
      }
    }
  }

  let bestIndex = 0;
  for (let i = 1; i < dp.length; i += 1) {
    if (dp[i].value > dp[bestIndex].value || (Math.abs(dp[i].value - dp[bestIndex].value) < 0.001 && dp[i].count > dp[bestIndex].count)) {
      bestIndex = i;
    }
  }
  const sequence: TocEntry[] = [];
  let cursor = bestIndex;
  while (cursor >= 0) {
    sequence.push(candidates[cursor]);
    cursor = dp[cursor].previous;
  }
  return sequence.reverse();
}

function collectTocEntries(pages: PageRow[]) {
  const earlyLimit = Math.min(40, Math.max(14, Math.ceil(pages.length * 0.22)));
  const pageRows = new Map<number, TocEntry[]>();
  const pageCandidates: Array<{ page: number; count: number; explicit_count: number; orphan_count: number }> = [];

  for (const page of pages) {
    const physicalPage = Number(page?.page_number || 0);
    if (!physicalPage || physicalPage > earlyLimit) continue;
    const text = String(page?.text || "");
    const rows = dedupeCandidates([...parseTocBlocks(text, physicalPage, pages.length), ...parseTocLines(text, physicalPage, pages.length)]);
    if (!rows.length) continue;
    pageRows.set(physicalPage, rows);
    pageCandidates.push({
      page: physicalPage,
      count: rows.length,
      explicit_count: rows.filter((row) => row.source.startsWith("EXPLICIT")).length,
      orphan_count: rows.filter((row) => row.source === "ORPHAN_NUMERIC_ROW").length,
    });
  }

  const strongPages = pageCandidates
    .filter((item) => item.count >= 3 || item.explicit_count >= 2)
    .map((item) => item.page);
  const selectedPages = new Set<number>();
  for (const page of strongPages) {
    selectedPages.add(page);
    if (pageRows.has(page - 1)) selectedPages.add(page - 1);
    if (pageRows.has(page + 1)) selectedPages.add(page + 1);
  }
  if (!selectedPages.size) {
    for (const item of pageCandidates.filter((item) => item.count >= 2)) selectedPages.add(item.page);
  }

  const candidates: TocEntry[] = [];
  for (const [page, rows] of pageRows.entries()) {
    if (!selectedPages.has(page)) continue;
    candidates.push(...rows);
  }
  const entries = selectMonotonicSequence(candidates);
  return {
    entries,
    tocPages: Array.from(selectedPages).sort((a, b) => a - b),
    pageCandidates: pageCandidates.sort((a, b) => a.page - b.page),
    candidateCount: candidates.length,
    recoverySources: Array.from(new Set(entries.map((entry) => entry.source))).sort(),
  };
}

function collectBodyAnchors(pages: PageRow[], tocPages: number[]) {
  const tocSet = new Set(tocPages);
  const byLesson = new Map<number, BodyAnchor>();
  for (const page of pages) {
    const physicalPage = Number(page?.page_number || 0);
    if (!physicalPage || tocSet.has(physicalPage)) continue;
    const prefix = foldOcr(String(page?.text || "").slice(0, 2200));
    const rx = lessonMarkerRegex();
    let match: RegExpExecArray | null;
    while ((match = rx.exec(prefix)) !== null) {
      const lessonNo = Number(match[1]);
      if (lessonNo < 1 || lessonNo > 120) continue;
      const score = match.index < 500 ? 6 : match.index < 1200 ? 4 : 2;
      if (score < 4) continue;
      const current = byLesson.get(lessonNo);
      const candidate = { lessonNo, physicalPage, score };
      if (!current || score > current.score || (score === current.score && physicalPage < current.physicalPage)) byLesson.set(lessonNo, candidate);
    }
  }
  return Array.from(byLesson.values()).sort((a, b) => a.lessonNo - b.lessonNo);
}

function collectPrintedPageOffsets(pages: PageRow[]) {
  const counts = new Map<number, number>();
  for (const page of pages) {
    const physicalPage = Number(page?.page_number || 0);
    if (!physicalPage) continue;
    const lines = String(page?.text || "").split(/\r?\n/).map((line) => foldOcr(line)).filter(Boolean);
    const edgeLines = [...lines.slice(0, 6), ...lines.slice(-8)];
    for (const line of edgeLines) {
      const match = /^[^0-9]{0,5}(\d{1,3})[^0-9]{0,5}$/.exec(line);
      if (!match) continue;
      const printed = Number(match[1]);
      if (printed < 1 || printed > pages.length + 20) continue;
      const offset = physicalPage - printed;
      if (offset < -3 || offset > 30) continue;
      counts.set(offset, (counts.get(offset) || 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]));
  return ranked.length ? { offset: ranked[0][0], support: ranked[0][1], alternatives: ranked.slice(0, 5) } : null;
}

function chooseOffset(tocEntries: TocEntry[], bodyAnchors: BodyAnchor[], pageOffset: { offset: number; support: number } | null) {
  const tocMap = new Map(tocEntries.map((entry) => [entry.lessonNo, entry]));
  const offsets: Array<{ offset: number; lessonNo: number; physicalPage: number; printedPage: number }> = [];
  for (const anchor of bodyAnchors) {
    const toc = tocMap.get(anchor.lessonNo);
    if (!toc) continue;
    const offset = anchor.physicalPage - toc.printedPage;
    if (offset >= -3 && offset <= 30) offsets.push({ offset, lessonNo: anchor.lessonNo, physicalPage: anchor.physicalPage, printedPage: toc.printedPage });
  }
  const counts = new Map<number, number>();
  for (const item of offsets) counts.set(item.offset, (counts.get(item.offset) || 0) + 1);
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]));
  const bestAnchor = ranked[0] || null;
  if (bestAnchor && bestAnchor[1] >= 2) return { offset: bestAnchor[0], source: "BODY_ANCHORS", support: bestAnchor[1], anchor_offsets: offsets };
  if (pageOffset && pageOffset.support >= 5 && (!bestAnchor || Math.abs(pageOffset.offset - bestAnchor[0]) <= 1)) {
    return { offset: pageOffset.offset, source: "PRINTED_PAGE_NUMBERS", support: pageOffset.support, anchor_offsets: offsets };
  }
  if (bestAnchor && bestAnchor[1] >= 1) return { offset: bestAnchor[0], source: "SINGLE_BODY_ANCHOR", support: bestAnchor[1], anchor_offsets: offsets };
  if (pageOffset && pageOffset.support >= 8) return { offset: pageOffset.offset, source: "PRINTED_PAGE_NUMBERS", support: pageOffset.support, anchor_offsets: offsets };
  return null;
}

function buildBookIndex(pages: PageRow[]) {
  const toc = collectTocEntries(pages);
  const bodyAnchors = collectBodyAnchors(pages, toc.tocPages);
  const pageOffset = collectPrintedPageOffsets(pages);
  const chosen = chooseOffset(toc.entries, bodyAnchors, pageOffset);
  const diagnostics: JsonObject = {
    detector_version: DETECTOR_VERSION,
    method: "OCR_TOC_LINE_SEQUENCE",
    page_count: pages.length,
    toc_pages: toc.tocPages,
    toc_page_candidates: toc.pageCandidates,
    toc_candidate_count: toc.candidateCount,
    toc_entry_count: toc.entries.length,
    toc_lessons: toc.entries.map((entry) => entry.lessonNo),
    toc_recovery_sources: toc.recoverySources,
    roman_lesson_tokens_ignored: true,
    body_anchor_count: bodyAnchors.length,
    body_anchor_lessons: bodyAnchors.map((anchor) => anchor.lessonNo),
    page_number_offset: pageOffset,
    chosen_offset: chosen?.offset ?? null,
    offset_source: chosen?.source ?? null,
    offset_support: chosen?.support ?? 0,
    status: "BOOK_INDEX_UNRESOLVED",
  };
  if (toc.entries.length < 2 || !chosen) return { bookIndex: null, diagnostics };

  const starts: Array<TocEntry & { pageStart: number }> = [];
  let previousStart = 0;
  for (const entry of toc.entries) {
    const pageStart = entry.printedPage + chosen.offset;
    if (!Number.isSafeInteger(pageStart) || pageStart < 1 || pageStart > pages.length || pageStart <= previousStart) continue;
    starts.push({ ...entry, pageStart });
    previousStart = pageStart;
  }
  if (starts.length < 2) return { bookIndex: null, diagnostics };

  const largeBook = pages.length >= 40;
  const first = starts[0];
  const last = starts[starts.length - 1];
  const lessonSpan = last.lessonNo - first.lessonNo + 1;
  const contiguousRatio = lessonSpan > 0 ? starts.length / lessonSpan : 0;
  const startsEarlyEnough = first.pageStart <= Math.max(30, Math.ceil(pages.length * 0.25));
  const beginsNearFirstLesson = first.lessonNo <= 3;
  const sufficientCount = !largeBook || starts.length >= 8;
  const sequencePlausible = !largeBook || contiguousRatio >= 0.72;
  const substantialSpan = !largeBook || last.lessonNo - first.lessonNo >= 7;
  Object.assign(diagnostics, {
    starts_early_enough: startsEarlyEnough,
    begins_near_first_lesson: beginsNearFirstLesson,
    contiguous_ratio: contiguousRatio,
    selected_count: starts.length,
    selected_first_lesson: first.lessonNo,
    selected_last_lesson: last.lessonNo,
  });
  if (!startsEarlyEnough || !beginsNearFirstLesson || !sufficientCount || !sequencePlausible || !substantialSpan) {
    diagnostics.status = "BOOK_INDEX_PARTIAL_REJECTED";
    return { bookIndex: null, diagnostics };
  }

  const confidence = chosen.source === "BODY_ANCHORS" ? 0.96 : chosen.source === "PRINTED_PAGE_NUMBERS" ? 0.94 : 0.88;
  const segments = starts
    .map((entry, index) => ({
      segment_code: `BAI_${String(entry.lessonNo).padStart(2, "0")}`,
      lesson_no: entry.lessonNo,
      title: entry.title,
      page_start: entry.pageStart,
      page_end: index + 1 < starts.length ? starts[index + 1].pageStart - 1 : pages.length,
      ordinal_no: index + 1,
      confidence,
      detector_source: entry.source,
    }))
    .filter((segment) => segment.page_end >= segment.page_start);
  if (segments.length < 2) return { bookIndex: null, diagnostics };

  diagnostics.status = "BOOK_INDEX_DETECTED";
  diagnostics.selected_count = segments.length;
  diagnostics.selected_lessons = segments.map((segment) => segment.lesson_no);
  return {
    bookIndex: {
      schema_version: "DAMSAN_BOOK_INDEX_V1",
      detector_version: DETECTOR_VERSION,
      boundary_mode: "PDF_PAGE",
      segment_type: "LESSON",
      segment_count: segments.length,
      generated_at: new Date().toISOString(),
      diagnostics,
      segments,
    },
    diagnostics,
  };
}

async function repairBookIndex(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const documentId = cleanString(body.document_id, 80);
  const doc = await ownedDocument(actor, documentId);
  const artifact = await readArtifact(cleanString(doc.extraction_manifest?.artifact_path, 1200));
  const result = buildBookIndex(artifact.pages as PageRow[]);
  if (!result.bookIndex) {
    return json(req, 409, {
      status: "error",
      code: "toc_index_unresolved",
      message: "Chưa dựng được chỉ mục bài đầy đủ từ mục lục OCR và số trang in.",
      document_id: documentId,
      detection: result.diagnostics,
    });
  }
  const { data, error } = await admin.rpc("rpc_knowledge_store_book_index_service", {
    p_document_id: documentId,
    p_book_index: result.bookIndex,
  });
  if (error || !data || data.status !== "success") throw new Error("book_index_store_failed");
  return json(req, 200, {
    status: "success",
    action: "repair_book_index",
    document_id: documentId,
    book_index: result.bookIndex,
    detection: result.diagnostics,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { status: "error", code: "method_not_allowed", message: "Chỉ hỗ trợ POST." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, 500, { status: "error", code: "server_not_configured", message: "Dịch vụ chỉ mục sách chưa được cấu hình." });
  let body: JsonObject;
  try {
    body = asObject(await req.json());
  } catch {
    return json(req, 400, { status: "error", code: "body_invalid", message: "Dữ liệu yêu cầu không hợp lệ." });
  }
  const action = cleanString(body.action, 80).toLowerCase();
  try {
    if (action === "repair_book_index") return await repairBookIndex(req, body);
    return json(req, 400, { status: "error", code: "action_invalid", message: "Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    const status = code === "staff_session_invalid" || code === "staff_identity_mismatch" ? 401 : code.includes("invalid") ? 400 : code.includes("unavailable") || code.includes("artifact") ? 409 : 500;
    if (status >= 500) console.error("knowledge-book-index-v2 error", error);
    return json(req, status, { status: "error", code, message: "Không thể dựng chỉ mục bài học từ tài liệu." });
  }
});
