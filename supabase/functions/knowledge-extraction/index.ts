import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARTIFACT_BUCKET = "knowledge-artifacts";
const MAX_ARTIFACT_SIZE = 8 * 1024 * 1024;
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;
type StaffActor = {
  id: string;
  ma_gv: string;
  truong_id: string;
};
type OwnedJob = {
  job_id: string;
  document_id: string;
  job_status: string;
  current_stage: string;
  pipeline_status: string;
  extraction_manifest: JsonObject;
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
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeInteger(value: unknown, min: number, max: number, code: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(code);
  return parsed;
}

function cleanString(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, maxLength);
}

function cleanPageArray(value: unknown, pageCount: number) {
  if (!Array.isArray(value)) throw new Error("manifest_invalid");
  const unique = new Set<number>();
  for (const item of value) {
    const page = Number(item);
    if (!Number.isSafeInteger(page) || page < 1 || page > pageCount) throw new Error("manifest_invalid");
    unique.add(page);
  }
  return Array.from(unique).sort((a, b) => a - b);
}

function cleanManifest(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("manifest_invalid");
  const input = value as JsonObject;
  if (input.schema_version !== "DAMSAN_EXTRACT_V1") throw new Error("manifest_invalid");

  const pageCount = safeInteger(input.page_count, 1, 5000, "manifest_invalid");
  const extractedChars = safeInteger(input.extracted_chars, 0, 8000000, "manifest_invalid");
  const ocrPages = cleanPageArray(input.ocr_pages ?? [], pageCount);
  const unresolved = cleanPageArray(input.ocr_unresolved_pages ?? [], pageCount);
  const quality = cleanString(input.quality, 24).toUpperCase();
  if (!["COMPLETE", "PARTIAL"].includes(quality)) throw new Error("manifest_invalid");

  return {
    schema_version: "DAMSAN_EXTRACT_V1",
    reader_version: cleanString(input.reader_version, 64) || "030B2",
    source_format: cleanString(input.source_format, 16).toUpperCase(),
    boundary_mode: cleanString(input.boundary_mode, 32).toUpperCase(),
    method: cleanString(input.method, 80),
    page_count: pageCount,
    extracted_chars: extractedChars,
    ocr_pages: ocrPages,
    ocr_unresolved_pages: unresolved,
    quality,
    generated_at: cleanString(input.generated_at, 64),
  };
}

async function requireStaff(body: JsonObject): Promise<StaffActor> {
  const staffToken = typeof body.staff_token === "string" ? body.staff_token.trim() : "";
  const maGv = typeof body.ma_gv === "string" ? body.ma_gv.trim() : "";
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
    .select("id,ma_gv,truong_id,mat_khau")
    .eq("id", session.gv_id)
    .maybeSingle();

  if (teacherError || !teacher || !isUuid(teacher.id) || !isUuid(teacher.truong_id)) throw new Error("staff_session_invalid");
  if (teacher.ma_gv !== maGv) throw new Error("staff_identity_mismatch");
  if (teacher.mat_khau === "123456" || teacher.mat_khau === DEFAULT_PASSWORD_HASH) throw new Error("staff_session_invalid");

  return { id: teacher.id, ma_gv: teacher.ma_gv, truong_id: teacher.truong_id };
}

async function requireOwnedJob(actor: StaffActor, body: JsonObject): Promise<OwnedJob> {
  const documentId = typeof body.document_id === "string" ? body.document_id.trim() : "";
  const jobId = typeof body.job_id === "string" ? body.job_id.trim() : "";
  if (!isUuid(documentId) || !isUuid(jobId)) throw new Error("job_identity_invalid");

  const { data: job, error: jobError } = await admin
    .from("knowledge_ingestion_jobs")
    .select("id,document_id,status,current_stage")
    .eq("id", jobId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (jobError || !job) throw new Error("knowledge_job_not_found");

  const { data: document, error: documentError } = await admin
    .from("knowledge_documents")
    .select("id,owner_gv_id,truong_id,pipeline_status,extraction_manifest")
    .eq("id", documentId)
    .maybeSingle();
  if (documentError || !document) throw new Error("knowledge_document_not_found");
  if (document.owner_gv_id !== actor.id || document.truong_id !== actor.truong_id) throw new Error("knowledge_scope_invalid");

  return {
    job_id: job.id,
    document_id: document.id,
    job_status: String(job.status || ""),
    current_stage: String(job.current_stage || ""),
    pipeline_status: String(document.pipeline_status || ""),
    extraction_manifest: document.extraction_manifest && typeof document.extraction_manifest === "object"
      ? document.extraction_manifest as JsonObject
      : {},
  };
}

function artifactPrefix(actor: StaffActor, owned: OwnedJob) {
  return `${actor.truong_id}/${actor.id}/${owned.document_id}/${owned.job_id}/`;
}

function ensureExtractionEligible(owned: OwnedJob) {
  if (!["QUEUED", "RUNNING"].includes(owned.job_status) || !["EXTRACT", "OCR"].includes(owned.current_stage)) {
    if (owned.pipeline_status === "EXTRACTED" && owned.current_stage === "ANALYZE") return false;
    throw new Error("knowledge_job_not_extractable");
  }
  return true;
}

async function prepareArtifact(req: Request, body: JsonObject, actor: StaffActor) {
  const owned = await requireOwnedJob(actor, body);
  const eligible = ensureExtractionEligible(owned);
  if (!eligible) {
    return json(req, 200, {
      status: "success",
      action: "prepare_artifact",
      idempotent: true,
      pipeline_status: "EXTRACTED",
    });
  }

  const artifactSize = safeInteger(body.artifact_size_bytes, 1, MAX_ARTIFACT_SIZE, "artifact_size_invalid");
  const storagePath = `${artifactPrefix(actor, owned)}${Date.now()}-${crypto.randomUUID()}-extract-v1.json`;
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.token) {
    console.error("knowledge extraction signed artifact failed", error);
    return json(req, 500, { status: "error", code: "signed_artifact_failed", message: "Không thể tạo phiên lưu kết quả đọc tài liệu." });
  }

  return json(req, 200, {
    status: "success",
    action: "prepare_artifact",
    bucket: ARTIFACT_BUCKET,
    storage_path: storagePath,
    upload_token: data.token,
    artifact_size_bytes: artifactSize,
  });
}

async function findObject(storagePath: string) {
  const slash = storagePath.lastIndexOf("/");
  const folder = slash >= 0 ? storagePath.slice(0, slash) : "";
  const filename = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).list(folder, { limit: 100, search: filename });
  if (error) throw error;
  return (data || []).find((entry) => entry.name === filename) || null;
}

async function completeArtifact(req: Request, body: JsonObject, actor: StaffActor) {
  const owned = await requireOwnedJob(actor, body);
  const storagePath = typeof body.storage_path === "string" ? body.storage_path.trim() : "";
  const artifactSize = safeInteger(body.artifact_size_bytes, 1, MAX_ARTIFACT_SIZE, "artifact_size_invalid");
  const manifest = cleanManifest(body.manifest);

  if (!storagePath || !storagePath.startsWith(artifactPrefix(actor, owned))) throw new Error("artifact_scope_invalid");

  if (owned.pipeline_status === "EXTRACTED" && owned.current_stage === "ANALYZE") {
    const activePath = typeof owned.extraction_manifest.artifact_path === "string" ? owned.extraction_manifest.artifact_path : "";
    if (activePath && activePath !== storagePath) await admin.storage.from(ARTIFACT_BUCKET).remove([storagePath]);
    return json(req, 200, {
      status: "success",
      action: "complete_artifact",
      idempotent: true,
      document_id: owned.document_id,
      pipeline_status: "EXTRACTED",
      next_stage: "ANALYZE",
    });
  }

  ensureExtractionEligible(owned);
  const uploaded = await findObject(storagePath);
  if (!uploaded) throw new Error("artifact_not_found");
  const storedSize = Number((uploaded as { metadata?: { size?: number } }).metadata?.size ?? artifactSize);
  if (Number.isFinite(storedSize) && storedSize > 0 && storedSize !== artifactSize) {
    await admin.storage.from(ARTIFACT_BUCKET).remove([storagePath]);
    throw new Error("artifact_size_mismatch");
  }

  const { data, error } = await admin.rpc("rpc_knowledge_commit_extraction_service", {
    p_job_id: owned.job_id,
    p_artifact_path: storagePath,
    p_manifest: manifest,
  });
  if (error || !data || data.status !== "success") {
    console.error("knowledge extraction commit failed", error ?? data);
    await admin.storage.from(ARTIFACT_BUCKET).remove([storagePath]);
    return json(req, 500, { status: "error", code: "extraction_commit_failed", message: "Không thể ghi nhận kết quả đọc tài liệu." });
  }

  return json(req, 200, {
    status: "success",
    action: "complete_artifact",
    document_id: data.document_id,
    pipeline_status: data.pipeline_status,
    next_stage: data.next_stage,
    page_count: data.page_count,
    extracted_chars: data.extracted_chars,
    ocr_pages: data.ocr_pages,
    ocr_unresolved_pages: data.ocr_unresolved_pages,
  });
}

async function failExtraction(req: Request, body: JsonObject, actor: StaffActor) {
  const owned = await requireOwnedJob(actor, body);
  const errorCode = cleanString(body.error_code, 80) || "browser_extraction_failed";
  const errorMessage = cleanString(body.error_message, 500) || "Không thể đọc nội dung tài liệu.";

  if (owned.job_status === "FAILED" && owned.pipeline_status === "FAILED") {
    return json(req, 200, {
      status: "success",
      action: "fail_extraction",
      idempotent: true,
      document_id: owned.document_id,
      job_id: owned.job_id,
      pipeline_status: "FAILED",
    });
  }

  ensureExtractionEligible(owned);
  const { data, error } = await admin.rpc("rpc_knowledge_fail_extraction_service", {
    p_job_id: owned.job_id,
    p_error_code: errorCode,
    p_error_message: errorMessage,
  });
  if (error || !data || data.status !== "success") {
    console.error("knowledge extraction failure commit failed", error ?? data);
    return json(req, 500, {
      status: "error",
      code: "extraction_failure_commit_failed",
      message: "Không thể ghi nhận trạng thái đọc thất bại.",
    });
  }

  return json(req, 200, {
    status: "success",
    action: "fail_extraction",
    idempotent: Boolean(data.idempotent),
    document_id: data.document_id,
    job_id: data.job_id,
    pipeline_status: data.pipeline_status,
    error_code: data.error_code || errorCode,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { status: "error", code: "method_not_allowed", message: "Chỉ hỗ trợ POST." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, 500, { status: "error", code: "server_not_configured", message: "Dịch vụ lưu kết quả đọc chưa được cấu hình." });

  let body: JsonObject;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body_invalid");
    body = parsed as JsonObject;
  } catch {
    return json(req, 400, { status: "error", code: "body_invalid", message: "Dữ liệu yêu cầu không hợp lệ." });
  }

  let actor: StaffActor;
  try {
    actor = await requireStaff(body);
  } catch (error) {
    const code = error instanceof Error ? error.message : "staff_session_invalid";
    return json(req, 401, {
      status: "error",
      code: code === "staff_identity_mismatch" ? code : "staff_session_invalid",
      message: code === "staff_identity_mismatch" ? "Tài khoản không khớp phiên làm việc." : "Phiên giáo viên không hợp lệ hoặc đã hết hạn.",
    });
  }

  try {
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    if (action === "prepare_artifact") return await prepareArtifact(req, body, actor);
    if (action === "complete_artifact") return await completeArtifact(req, body, actor);
    if (action === "fail_extraction") return await failExtraction(req, body, actor);
    return json(req, 400, { status: "error", code: "action_invalid", message: "Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    const clientErrors = new Set([
      "job_identity_invalid", "knowledge_job_not_found", "knowledge_document_not_found",
      "knowledge_scope_invalid", "knowledge_job_not_extractable", "artifact_size_invalid",
      "artifact_scope_invalid", "artifact_not_found", "artifact_size_mismatch", "manifest_invalid",
    ]);
    if (clientErrors.has(code)) {
      const status = code === "knowledge_scope_invalid" || code === "artifact_scope_invalid" ? 403 : 409;
      return json(req, status, { status: "error", code, message: "Không thể xác nhận kết quả đọc tài liệu cho phiên hiện tại." });
    }
    console.error("knowledge-extraction unexpected error", error);
    return json(req, 500, { status: "error", code: "unexpected_error", message: "Không thể xử lý kết quả đọc tài liệu." });
  }
});
