import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARTIFACT_BUCKET = "knowledge-artifacts";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const HANDOFF_TTL_MINUTES = 60;
const MAX_CHUNK_PAGES = 30;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;
type StaffActor = { id: string; ma_gv: string; truong_id: string; quyen: string };
type ExtractPage = { page_number?: number; text?: string; method?: string; confidence?: number | null; direct_chars?: number };

type Segment = {
  segment_code: string;
  lesson_no: number;
  title: string;
  page_start: number;
  page_end: number;
  ordinal_no: number;
  confidence: number;
};

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCapability() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object_invalid");
  return value as JsonObject;
}

async function requireStaff(body: JsonObject): Promise<StaffActor> {
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

async function ownedDocument(actor: StaffActor, documentId: string) {
  if (!isUuid(documentId)) throw new Error("document_invalid");
  const { data, error } = await admin.from("knowledge_documents").select(
    "id,owner_gv_id,truong_id,mon_id,title,original_filename,source_format,mime_type,page_count,pipeline_status,active_revision,context_hint,extraction_manifest,book_index,semantic_coverage"
  ).eq("id", documentId).maybeSingle();
  if (error || !data) throw new Error("document_unavailable");
  if (actor.quyen !== "Admin" && data.owner_gv_id !== actor.id) throw new Error("document_unavailable");
  return data;
}

async function readArtifact(storagePath: string) {
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).download(storagePath);
  if (error || !data) throw new Error("extraction_artifact_unavailable");
  const text = await data.text();
  if (!text || text.length > 8 * 1024 * 1024) throw new Error("extraction_artifact_invalid");
  let artifact: JsonObject;
  try { artifact = asObject(JSON.parse(text)); } catch { throw new Error("extraction_artifact_invalid"); }
  if (artifact.schema_version !== "DAMSAN_EXTRACT_V1" || !Array.isArray(artifact.pages)) throw new Error("extraction_artifact_invalid");
  return artifact;
}

function romanToInt(raw: string) {
  if (/^\d{1,3}$/.test(raw)) return Number(raw);
  const values: Record<string, number> = { I:1,V:5,X:10,L:50,C:100,D:500,M:1000 };
  let total = 0;
  let prev = 0;
  for (const ch of raw.toUpperCase().split("").reverse()) {
    const value = values[ch] || 0;
    if (!value) return 0;
    if (value < prev) total -= value; else { total += value; prev = value; }
  }
  return total;
}

function cleanTitle(raw: string, lessonNo: number) {
  let title = raw.replace(/\s+/g, " ").trim();
  title = title.replace(/[.·•]+\s*\d{1,3}\s*$/u, "").trim();
  title = title.replace(/^[:.\-–—\s]+/u, "").trim();
  if (title.length < 4) return `Bài ${lessonNo}`;
  return `Bài ${lessonNo}. ${title}`.slice(0, 300);
}

export function detectBookIndex(pages: ExtractPage[]) {
  const candidates: Array<{ lessonNo:number; page:number; title:string }> = [];
  const perPage = new Map<number, number>();
  const rx = /(?:^|\n)\s*b[àa]i\s+(\d{1,3}|[ivxlcdm]{1,8})\s*[.:\-–—]?\s*([^\n]{0,140})/giu;

  for (const page of pages) {
    const pageNo = Number(page.page_number || 0);
    const text = String(page.text || "");
    if (!pageNo || !text) continue;
    rx.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rx.exec(text)) !== null) {
      const lessonNo = romanToInt(match[1]);
      if (lessonNo < 1 || lessonNo > 300) continue;
      candidates.push({ lessonNo, page: pageNo, title: cleanTitle(match[2] || "", lessonNo) });
      perPage.set(pageNo, (perPage.get(pageNo) || 0) + 1);
    }
  }

  // A table-of-contents page typically mentions many lesson headings. Do not use
  // those occurrences as physical lesson starts.
  const bodyCandidates = candidates.filter((c) => (perPage.get(c.page) || 0) < 3);
  const byLesson = new Map<number, { lessonNo:number; page:number; title:string }>();
  for (const item of bodyCandidates.sort((a,b) => a.page-b.page || a.lessonNo-b.lessonNo)) {
    if (!byLesson.has(item.lessonNo)) byLesson.set(item.lessonNo, item);
  }
  const starts = Array.from(byLesson.values()).sort((a,b) => a.page-b.page || a.lessonNo-b.lessonNo);
  if (starts.length < 2) return null;

  const segments: Segment[] = starts.map((item, index) => ({
    segment_code: `BAI_${String(item.lessonNo).padStart(2,"0")}`,
    lesson_no: item.lessonNo,
    title: item.title,
    page_start: item.page,
    page_end: index + 1 < starts.length ? starts[index + 1].page - 1 : pages.length,
    ordinal_no: index + 1,
    confidence: 0.9,
  })).filter((segment) => segment.page_end >= segment.page_start);

  if (segments.length < 2) return null;
  return {
    schema_version: "DAMSAN_BOOK_INDEX_V1",
    detector_version: "036B",
    boundary_mode: "PDF_PAGE",
    segment_type: "LESSON",
    segment_count: segments.length,
    generated_at: new Date().toISOString(),
    segments,
  };
}

async function ensureBookIndex(actor: StaffActor, documentId: string) {
  const doc = await ownedDocument(actor, documentId);
  const stored = doc.book_index as JsonObject | null;
  if (stored?.schema_version === "DAMSAN_BOOK_INDEX_V1" && Array.isArray(stored.segments) && stored.segments.length >= 2) {
    return { doc, bookIndex: stored };
  }
  const manifest = (doc.extraction_manifest || {}) as JsonObject;
  const artifactPath = cleanString(manifest.artifact_path, 1200);
  if (!artifactPath) throw new Error("extraction_artifact_missing");
  const artifact = await readArtifact(artifactPath);
  if (cleanString(artifact.boundary_mode, 40).toUpperCase() !== "PDF_PAGE") return { doc, bookIndex: null };
  const bookIndex = detectBookIndex((artifact.pages || []) as ExtractPage[]);
  if (!bookIndex) return { doc, bookIndex: null };
  const { data, error } = await admin.rpc("rpc_knowledge_store_book_index_service", {
    p_document_id: documentId,
    p_book_index: bookIndex,
  });
  if (error || !data || data.status !== "success") throw new Error("book_index_store_failed");
  return { doc: await ownedDocument(actor, documentId), bookIndex };
}

async function inspectDocument(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const documentId = cleanString(body.document_id, 80);
  const { doc, bookIndex } = await ensureBookIndex(actor, documentId);
  const coverage = Array.isArray(doc.semantic_coverage) ? doc.semantic_coverage : [];
  const segments = bookIndex && Array.isArray(bookIndex.segments) ? bookIndex.segments as JsonObject[] : [];
  const pending = segments.filter((s) => !coverage.includes(String(s.segment_code || "").toUpperCase()));
  return json(req, 200, {
    status: "success",
    action: "inspect_document",
    document_id: documentId,
    is_book: segments.length >= 2,
    book_index: bookIndex,
    semantic_coverage: coverage,
    pending_segments: pending,
    pipeline_status: doc.pipeline_status,
    active_revision: doc.active_revision,
  });
}

async function createSegmentHandoff(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const documentId = cleanString(body.document_id, 80);
  const { bookIndex } = await ensureBookIndex(actor, documentId);
  if (!bookIndex) throw new Error("book_index_unavailable");
  const rawCodes = Array.isArray(body.segment_codes) ? body.segment_codes : [];
  const codes = Array.from(new Set(rawCodes.map((x) => cleanString(x, 40).toUpperCase()).filter(Boolean)));
  if (!codes.length || codes.length > 50) throw new Error("segment_selection_invalid");
  const capability = randomCapability();
  const capabilityHash = await sha256Hex(capability);
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await admin.rpc("rpc_knowledge_issue_segment_handoff_service", {
    p_document_id: documentId,
    p_requested_by: actor.id,
    p_segment_codes: codes,
    p_capability_hash: capabilityHash,
    p_expires_at: expiresAt,
  });
  if (error || !data || data.status !== "success") throw new Error("segment_handoff_issue_failed");
  return json(req, 200, {
    status: "success",
    action: "create_segment_handoff",
    handoff_id: data.handoff_id,
    job_id: data.job_id,
    document_id: data.document_id,
    analysis_scope: data.analysis_scope,
    capability_token: capability,
    expires_at: data.expires_at,
  });
}

async function claimCapability(body: JsonObject) {
  const capability = cleanString(body.capability_token, 512);
  if (!capability) throw new Error("capability_invalid");
  const hash = await sha256Hex(capability);
  const workerId = cleanString(body.worker_id, 200) || "segment-web-ai";
  const { data, error } = await admin.rpc("rpc_knowledge_claim_segment_handoff_service", {
    p_capability_hash: hash,
    p_worker_id: workerId,
  });
  if (error || !data || data.status !== "success") throw new Error(data?.code || "capability_invalid");
  return { hash, claim: data as JsonObject };
}

function scopeRanges(scope: JsonObject) {
  const segments = Array.isArray(scope.segments) ? scope.segments as JsonObject[] : [];
  return segments.map((s) => ({
    start: Number(s.page_start || 0), end: Number(s.page_end || 0), code: String(s.segment_code || ""), title: String(s.title || ""),
  })).filter((r) => Number.isSafeInteger(r.start) && Number.isSafeInteger(r.end) && r.start > 0 && r.end >= r.start);
}

function buildScopedChunk(artifact: JsonObject, scope: JsonObject, body: JsonObject) {
  const pages = (artifact.pages || []) as ExtractPage[];
  const ranges = scopeRanges(scope);
  if (!ranges.length) throw new Error("analysis_scope_invalid");
  const selected = pages.filter((p) => {
    const n = Number(p.page_number || 0);
    return ranges.some((r) => n >= r.start && n <= r.end);
  });
  if (!selected.length) throw new Error("analysis_scope_empty");
  const requestedStart = Number(body.page_start || selected[0].page_number || 1);
  const start = Number.isSafeInteger(requestedStart) && requestedStart > 0 ? requestedStart : Number(selected[0].page_number || 1);
  const remaining = selected.filter((p) => Number(p.page_number || 0) >= start);
  const chunkPages = remaining.slice(0, MAX_CHUNK_PAGES);
  if (!chunkPages.length) throw new Error("analysis_scope_exhausted");
  const next = remaining.length > chunkPages.length ? Number(remaining[chunkPages.length].page_number || 0) : null;
  return {
    boundary_mode: "PDF_PAGE",
    page_start: Number(chunkPages[0].page_number || 0),
    page_end: Number(chunkPages[chunkPages.length - 1].page_number || 0),
    page_count: selected.length,
    source_page_count: pages.length,
    pages: chunkPages,
    has_more: next !== null,
    next_page_start: next,
    selected_ranges: ranges,
  };
}

function analysisInstructions(scope: JsonObject) {
  return {
    objective: "Compile only the selected lesson segments into DAMSAN_KNOWLEDGE_V1. Do not add model knowledge.",
    final_schema_version: "DAMSAN_KNOWLEDGE_V1",
    analysis_scope: scope,
    unit_rule: "Every unit must belong to one selected segment and include unit_key, unit_type, ordinal_no, hierarchy, content, provenance, confidence, is_usable, lesson_code and lesson_title.",
    lesson_rule: "lesson_code must equal the selected segment_code (for example BAI_03). lesson_title must preserve the title visible in the selected source pages.",
    provenance_rule: "Preserve physical PDF page numbers. Do not emit units from pages outside the selected_ranges.",
    merge_rule: "The server merges these selected lessons with previously accepted lessons. Do not recreate lessons outside the analysis_scope.",
  };
}

async function getAnalysisInput(req: Request, body: JsonObject) {
  const { claim } = await claimCapability(body);
  const manifest = asObject(claim.extraction_manifest || {});
  const artifactPath = cleanString(manifest.artifact_path, 1200);
  if (!artifactPath) throw new Error("extraction_artifact_missing");
  const artifact = await readArtifact(artifactPath);
  const scope = asObject(claim.analysis_scope || {});
  const chunk = buildScopedChunk(artifact, scope, body);
  return json(req, 200, {
    status: "success",
    action: "get_analysis_input",
    schema_version: "DAMSAN_ANALYSIS_INPUT_V1",
    document: {
      document_id: claim.document_id,
      job_id: claim.job_id,
      original_filename: claim.original_filename,
      title: claim.title,
      source_format: claim.source_format,
      mime_type: claim.mime_type,
      page_count: claim.page_count,
      context_hint: claim.context_hint,
      analysis_scope: scope,
      semantic_coverage: claim.semantic_coverage,
      extraction: { ...manifest, artifact_path: undefined },
    },
    instructions: analysisInstructions(scope),
    source_chunk: chunk,
  });
}

async function submitAnalysis(req: Request, body: JsonObject) {
  const capability = cleanString(body.capability_token, 512);
  if (!capability) throw new Error("capability_invalid");
  const hash = await sha256Hex(capability);
  const analysis = body.analysis;
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) throw new Error("payload_invalid");
  const bytes = new TextEncoder().encode(JSON.stringify(analysis)).byteLength;
  if (bytes > 6 * 1024 * 1024) throw new Error("payload_too_large");
  const { data, error } = await admin.rpc("rpc_knowledge_complete_segment_handoff_service", {
    p_capability_hash: hash,
    p_pipeline_version: cleanString(body.pipeline_version, 120) || "DAMSAN_KNOWLEDGE_V1/036B",
    p_ai_provider: cleanString(body.ai_provider, 120) || "WEB_AI",
    p_ai_model: cleanString(body.ai_model, 160) || "unspecified",
    p_payload: analysis,
  });
  if (error || !data || data.status !== "success") throw new Error(data?.code || "segment_analysis_commit_failed");
  return json(req, 200, {
    status: "success",
    action: "submit_analysis",
    document_id: data.document_id,
    revision: data.revision,
    quality_status: data.quality_status,
    active_revision: data.active_revision,
    validation: data.validation,
    semantic_coverage: data.semantic_coverage,
    remaining_segments: data.remaining_segments,
    pipeline_status: data.pipeline_status,
  });
}

function clientStatus(code: string) {
  if (code === "staff_session_invalid" || code === "staff_identity_mismatch") return 401;
  if (code.startsWith("capability_") || code.includes("unavailable") || code.includes("artifact") || code.includes("scope")) return 409;
  if (code.includes("invalid") || code.includes("selection") || code === "payload_too_large") return 400;
  return 500;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { status:"error", code:"method_not_allowed", message:"Chỉ hỗ trợ POST." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, 500, { status:"error", code:"server_not_configured", message:"Dịch vụ phân tích theo bài chưa được cấu hình." });
  let body: JsonObject;
  try { body = asObject(await req.json()); } catch { return json(req, 400, { status:"error", code:"body_invalid", message:"Dữ liệu yêu cầu không hợp lệ." }); }
  const action = cleanString(body.action, 80).toLowerCase();
  try {
    if (action === "inspect_document") return await inspectDocument(req, body);
    if (action === "create_segment_handoff") return await createSegmentHandoff(req, body);
    if (action === "get_analysis_input") return await getAnalysisInput(req, body);
    if (action === "submit_analysis") return await submitAnalysis(req, body);
    return json(req, 400, { status:"error", code:"action_invalid", message:"Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    const status = clientStatus(code);
    if (status >= 500) console.error("knowledge-segment-bridge error", error);
    const messages: Record<string,string> = {
      book_index_unavailable: "Không nhận diện được ít nhất hai bài học trong tài liệu này; hãy dùng luồng phân tích tài liệu thông thường.",
      segment_selection_invalid: "Hãy chọn ít nhất một bài cần phân tích.",
      unit_outside_segment_scope: "Kết quả AI chứa tri thức ngoài phạm vi bài đã chọn.",
      segment_analysis_commit_failed: "Không thể lưu kết quả phân tích theo bài.",
    };
    return json(req, status, { status:"error", code, message: messages[code] || "Không thể xử lý phân tích theo phạm vi bài học." });
  }
});
