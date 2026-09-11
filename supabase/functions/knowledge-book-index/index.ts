import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARTIFACT_BUCKET = "knowledge-artifacts";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(req) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object_invalid");
  return value;
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function requireStaff(body) {
  const staffToken = cleanString(body.staff_token, 2048);
  const maGv = cleanString(body.ma_gv, 160);
  if (!staffToken || !maGv) throw new Error("staff_session_invalid");
  const tokenHash = await sha256Hex(staffToken);
  const { data: session, error: sessionError } = await admin
    .from("staff_sessions").select("gv_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
  if (sessionError || !session || !isUuid(session.gv_id)) throw new Error("staff_session_invalid");
  if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) throw new Error("staff_session_invalid");
  const { data: teacher, error: teacherError } = await admin
    .from("giao_vien").select("id,ma_gv,truong_id,quyen,mat_khau")
    .eq("id", session.gv_id).maybeSingle();
  if (teacherError || !teacher || !isUuid(teacher.id) || !isUuid(teacher.truong_id)) throw new Error("staff_session_invalid");
  if (teacher.ma_gv !== maGv) throw new Error("staff_identity_mismatch");
  if (teacher.mat_khau === "123456" || teacher.mat_khau === DEFAULT_PASSWORD_HASH) throw new Error("staff_session_invalid");
  return { id: teacher.id, ma_gv: teacher.ma_gv, truong_id: teacher.truong_id, quyen: teacher.quyen };
}

async function ownedDocument(actor, documentId) {
  if (!isUuid(documentId)) throw new Error("document_invalid");
  const { data, error } = await admin.from("knowledge_documents").select(
    "id,owner_gv_id,truong_id,title,original_filename,page_count,pipeline_status,extraction_manifest,book_index"
  ).eq("id", documentId).maybeSingle();
  if (error || !data) throw new Error("document_unavailable");
  if (actor.quyen !== "Admin" && data.owner_gv_id !== actor.id) throw new Error("document_unavailable");
  if (!data.extraction_manifest?.artifact_path) throw new Error("extraction_artifact_missing");
  return data;
}

async function readArtifact(storagePath) {
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).download(storagePath);
  if (error || !data) throw new Error("extraction_artifact_unavailable");
  const text = await data.text();
  if (!text || text.length > 8 * 1024 * 1024) throw new Error("extraction_artifact_invalid");
  let artifact;
  try { artifact = asObject(JSON.parse(text)); } catch { throw new Error("extraction_artifact_invalid"); }
  if (artifact.schema_version !== "DAMSAN_EXTRACT_V1" || artifact.boundary_mode !== "PDF_PAGE" || !Array.isArray(artifact.pages)) {
    throw new Error("extraction_artifact_invalid");
  }
  return artifact;
}

function foldOcr(value) {
  return String(value || "").normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[|¦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function romanToInt(raw) {
  if (/^\d{1,3}$/.test(raw)) return Number(raw);
  const values = { I:1,V:5,X:10,L:50,C:100,D:500,M:1000 };
  let total = 0;
  let prev = 0;
  for (const ch of String(raw || "").toUpperCase().split("").reverse()) {
    const value = values[ch] || 0;
    if (!value) return 0;
    if (value < prev) total -= value; else { total += value; prev = value; }
  }
  return total;
}

function cleanTitle(raw, lessonNo) {
  let title = String(raw || "").replace(/\s+/g, " ").trim();
  title = title.replace(/[.·•…]+\s*\d{1,3}\s*$/u, "").trim();
  title = title.replace(/^[:.\-–—\s]+/u, "").trim();
  if (title.length < 3) return `Bài ${lessonNo}`;
  return `Bài ${lessonNo}. ${title}`.slice(0, 300);
}

function extractRawTitle(rawLine, lessonNo, printedPage) {
  let text = String(rawLine || "").normalize("NFC");
  text = text.replace(/^.*?b\s*[àáảãạaăâ]\s*i\s+(?:\d{1,3}|[ivxlcdm]{1,8})\s*[.:\-–—]?\s*/iu, "");
  text = text.replace(new RegExp(`(?:[.·•…\\s]+)${printedPage}\\s*$`, "u"), "").trim();
  return cleanTitle(text, lessonNo);
}

function collectTocEntries(pages) {
  const earlyLimit = Math.min(32, Math.max(12, Math.ceil(pages.length * 0.18)));
  const byPhysicalPage = new Map();
  for (const page of pages) {
    const physicalPage = Number(page?.page_number || 0);
    if (!physicalPage || physicalPage > earlyLimit) continue;
    const rows = [];
    const lines = String(page?.text || "").split(/\r?\n/);
    for (const rawLine of lines) {
      const folded = foldOcr(rawLine);
      if (!folded) continue;
      const match = /\bb\s*a\s*i\s+(\d{1,3}|[ivxlcdm]{1,8})\s*[.:\-]?\s*(.*?)\s+(?:[.·•…]+\s*)?(\d{1,3})\s*$/iu.exec(folded);
      if (!match) continue;
      const lessonNo = romanToInt(match[1]);
      const printedPage = Number(match[3]);
      if (lessonNo < 1 || lessonNo > 300 || printedPage < 1 || printedPage > pages.length + 20) continue;
      rows.push({
        lessonNo,
        printedPage,
        physicalTocPage: physicalPage,
        title: extractRawTitle(rawLine, lessonNo, printedPage),
      });
    }
    if (rows.length) byPhysicalPage.set(physicalPage, rows);
  }

  const tocPages = Array.from(byPhysicalPage.entries())
    .filter(([, rows]) => new Set(rows.map((x) => x.lessonNo)).size >= 2)
    .map(([pageNo]) => pageNo)
    .sort((a, b) => a - b);
  const tocPageSet = new Set(tocPages);
  const deduped = new Map();
  for (const [pageNo, rows] of byPhysicalPage.entries()) {
    if (!tocPageSet.has(pageNo)) continue;
    for (const row of rows) {
      const current = deduped.get(row.lessonNo);
      if (!current || row.printedPage < current.printedPage) deduped.set(row.lessonNo, row);
    }
  }
  const entries = Array.from(deduped.values())
    .sort((a, b) => a.lessonNo - b.lessonNo)
    .filter((entry, index, array) => index === 0 || entry.printedPage > array[index - 1].printedPage);
  return { entries, tocPages };
}

function collectBodyAnchors(pages, tocPages) {
  const tocSet = new Set(tocPages);
  const byLesson = new Map();
  for (const page of pages) {
    const physicalPage = Number(page?.page_number || 0);
    if (!physicalPage || tocSet.has(physicalPage)) continue;
    const text = String(page?.text || "");
    const lines = text.split(/\r?\n/).slice(0, 18);
    for (let i = 0; i < lines.length; i += 1) {
      const folded = foldOcr(lines[i]);
      const match = /\bb\s*a\s*i\s+(\d{1,3}|[ivxlcdm]{1,8})\b/iu.exec(folded);
      if (!match) continue;
      const lessonNo = romanToInt(match[1]);
      if (lessonNo < 1 || lessonNo > 300) continue;
      const prefix = folded.slice(0, match.index).trim();
      if (prefix.length > 90) continue;
      const score = (i < 8 ? 4 : 2) + (match.index < 40 ? 3 : 1) + (prefix.length < 15 ? 2 : 0);
      const current = byLesson.get(lessonNo);
      const candidate = { lessonNo, physicalPage, score };
      if (!current || score > current.score || (score === current.score && physicalPage < current.physicalPage)) {
        byLesson.set(lessonNo, candidate);
      }
    }
  }
  return Array.from(byLesson.values()).sort((a, b) => a.lessonNo - b.lessonNo);
}

function collectPrintedPageOffsets(pages) {
  const counts = new Map();
  for (const page of pages) {
    const physicalPage = Number(page?.page_number || 0);
    if (!physicalPage) continue;
    const lines = String(page?.text || "").split(/\r?\n/).map((x) => foldOcr(x)).filter(Boolean);
    const edgeLines = [...lines.slice(0, 5), ...lines.slice(-7)];
    for (const line of edgeLines) {
      const match = /^[^0-9]{0,4}(\d{1,3})[^0-9]{0,4}$/.exec(line);
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

function chooseOffset(tocEntries, bodyAnchors, pageOffset) {
  const tocMap = new Map(tocEntries.map((x) => [x.lessonNo, x]));
  const offsets = [];
  for (const anchor of bodyAnchors) {
    const toc = tocMap.get(anchor.lessonNo);
    if (!toc) continue;
    const offset = anchor.physicalPage - toc.printedPage;
    if (offset >= -3 && offset <= 30) offsets.push({ offset, lessonNo: anchor.lessonNo, physicalPage: anchor.physicalPage, printedPage: toc.printedPage });
  }
  const counts = new Map();
  for (const item of offsets) counts.set(item.offset, (counts.get(item.offset) || 0) + 1);
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]));
  const bestAnchor = ranked[0] || null;

  if (bestAnchor && bestAnchor[1] >= 2) {
    return { offset: bestAnchor[0], source: "BODY_ANCHORS", support: bestAnchor[1], anchor_offsets: offsets };
  }
  if (pageOffset && pageOffset.support >= 5 && (!bestAnchor || Math.abs(pageOffset.offset - bestAnchor[0]) <= 1)) {
    return { offset: pageOffset.offset, source: "PRINTED_PAGE_NUMBERS", support: pageOffset.support, anchor_offsets: offsets };
  }
  if (bestAnchor && bestAnchor[1] >= 1) {
    return { offset: bestAnchor[0], source: "SINGLE_BODY_ANCHOR", support: bestAnchor[1], anchor_offsets: offsets };
  }
  if (pageOffset && pageOffset.support >= 8) {
    return { offset: pageOffset.offset, source: "PRINTED_PAGE_NUMBERS", support: pageOffset.support, anchor_offsets: offsets };
  }
  return null;
}

function buildBookIndex(pages) {
  const { entries: tocEntries, tocPages } = collectTocEntries(pages);
  const bodyAnchors = collectBodyAnchors(pages, tocPages);
  const pageOffset = collectPrintedPageOffsets(pages);
  const chosen = chooseOffset(tocEntries, bodyAnchors, pageOffset);
  const diagnostics = {
    detector_version: "036B3",
    method: "TOC_CALIBRATED",
    page_count: pages.length,
    toc_pages: tocPages,
    toc_entry_count: tocEntries.length,
    toc_lessons: tocEntries.map((x) => x.lessonNo),
    body_anchor_count: bodyAnchors.length,
    body_anchor_lessons: bodyAnchors.map((x) => x.lessonNo),
    page_number_offset: pageOffset,
    chosen_offset: chosen?.offset ?? null,
    offset_source: chosen?.source ?? null,
    offset_support: chosen?.support ?? 0,
    status: "BOOK_INDEX_UNRESOLVED",
  };
  if (tocEntries.length < 2 || !chosen) return { bookIndex: null, diagnostics };

  const starts = [];
  let previousStart = 0;
  for (const entry of tocEntries) {
    const pageStart = entry.printedPage + chosen.offset;
    if (!Number.isSafeInteger(pageStart) || pageStart < 1 || pageStart > pages.length || pageStart <= previousStart) continue;
    starts.push({ ...entry, pageStart });
    previousStart = pageStart;
  }
  if (starts.length < 2) return { bookIndex: null, diagnostics };

  const segments = starts.map((entry, index) => ({
    segment_code: `BAI_${String(entry.lessonNo).padStart(2, "0")}`,
    lesson_no: entry.lessonNo,
    title: entry.title,
    page_start: entry.pageStart,
    page_end: index + 1 < starts.length ? starts[index + 1].pageStart - 1 : pages.length,
    ordinal_no: index + 1,
    confidence: chosen.source === "BODY_ANCHORS" ? 0.96 : chosen.source === "PRINTED_PAGE_NUMBERS" ? 0.92 : 0.86,
  })).filter((x) => x.page_end >= x.page_start);
  if (segments.length < 2) return { bookIndex: null, diagnostics };

  diagnostics.status = "BOOK_INDEX_DETECTED";
  diagnostics.selected_count = segments.length;
  diagnostics.selected_lessons = segments.map((x) => x.lesson_no);
  const bookIndex = {
    schema_version: "DAMSAN_BOOK_INDEX_V1",
    detector_version: "036B3",
    boundary_mode: "PDF_PAGE",
    segment_type: "LESSON",
    segment_count: segments.length,
    generated_at: new Date().toISOString(),
    diagnostics,
    segments,
  };
  return { bookIndex, diagnostics };
}

async function repairBookIndex(req, body) {
  const actor = await requireStaff(body);
  const documentId = cleanString(body.document_id, 80);
  const doc = await ownedDocument(actor, documentId);
  const artifact = await readArtifact(cleanString(doc.extraction_manifest?.artifact_path, 1200));
  const result = buildBookIndex(artifact.pages);
  if (!result.bookIndex) {
    return json(req, 409, {
      status: "error",
      code: "toc_index_unresolved",
      message: "Chưa dựng được chỉ mục bài từ mục lục và số trang OCR.",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { status: "error", code: "method_not_allowed", message: "Chỉ hỗ trợ POST." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, 500, { status: "error", code: "server_not_configured", message: "Dịch vụ chỉ mục sách chưa được cấu hình." });
  let body;
  try { body = asObject(await req.json()); } catch { return json(req, 400, { status: "error", code: "body_invalid", message: "Dữ liệu yêu cầu không hợp lệ." }); }
  const action = cleanString(body.action, 80).toLowerCase();
  try {
    if (action === "repair_book_index") return await repairBookIndex(req, body);
    return json(req, 400, { status: "error", code: "action_invalid", message: "Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    const status = code === "staff_session_invalid" || code === "staff_identity_mismatch" ? 401
      : code.includes("invalid") ? 400
      : code.includes("unavailable") || code.includes("artifact") ? 409
      : 500;
    if (status >= 500) console.error("knowledge-book-index error", error);
    return json(req, status, { status: "error", code, message: "Không thể dựng chỉ mục bài học từ tài liệu." });
  }
});
