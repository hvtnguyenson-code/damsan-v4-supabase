import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KNOWLEDGE_BUCKET = "knowledge-source";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;

type StaffActor = {
  id: string;
  ma_gv: string;
  truong_id: string;
  mon_id: string | null;
  quyen: string | null;
};

function corsHeaders(req: Request) {
  // CORS is intentionally not used as an authentication boundary. The endpoint
  // requires the existing opaque staff token on every state-changing request.
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

function safeFilename(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return normalized || "document";
}

function cleanContextHint(value: unknown): JsonObject {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("context_hint_invalid");
  const encoded = JSON.stringify(value);
  if (encoded.length > 4000) throw new Error("context_hint_too_large");
  return value as JsonObject;
}

function validateFileDescriptor(body: JsonObject) {
  const originalFilename = typeof body.original_filename === "string" ? body.original_filename.trim() : "";
  const mimeType = typeof body.mime_type === "string" ? body.mime_type.trim().toLowerCase() : "";
  const fileSize = Number(body.file_size_bytes);
  const sha256 = body.sha256 == null ? null : String(body.sha256).trim().toLowerCase();

  if (!originalFilename || originalFilename.length > 255) throw new Error("filename_invalid");
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error("mime_type_unsupported");
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) throw new Error("file_size_invalid");
  if (sha256 !== null && !/^[0-9a-f]{64}$/.test(sha256)) throw new Error("sha256_invalid");

  return { originalFilename, mimeType, fileSize, sha256 };
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
    .select("id,ma_gv,truong_id,mon_id,quyen,mat_khau")
    .eq("id", session.gv_id)
    .maybeSingle();

  if (teacherError || !teacher || !isUuid(teacher.id) || !isUuid(teacher.truong_id)) throw new Error("staff_session_invalid");
  if (teacher.ma_gv !== maGv) throw new Error("staff_identity_mismatch");
  if (teacher.mat_khau === "123456" || teacher.mat_khau === DEFAULT_PASSWORD_HASH) throw new Error("staff_session_invalid");

  return {
    id: teacher.id,
    ma_gv: teacher.ma_gv,
    truong_id: teacher.truong_id,
    mon_id: isUuid(teacher.mon_id) ? teacher.mon_id : null,
    quyen: teacher.quyen ?? null,
  };
}

function storagePrefix(actor: StaffActor) {
  return `${actor.truong_id}/${actor.id}/`;
}

async function prepareUpload(req: Request, body: JsonObject, actor: StaffActor) {
  const descriptor = validateFileDescriptor(body);
  const contextHint = cleanContextHint(body.context_hint);
  const storagePath = `${storagePrefix(actor)}${Date.now()}-${crypto.randomUUID()}-${safeFilename(descriptor.originalFilename)}`;

  const { data, error } = await admin.storage
    .from(KNOWLEDGE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.token) {
    console.error("knowledge prepare signed-upload failed", error);
    return json(req, 500, { status: "error", code: "signed_upload_failed", message: "Không thể khởi tạo phiên tải tài liệu." });
  }

  return json(req, 200, {
    status: "success",
    action: "prepare",
    bucket: KNOWLEDGE_BUCKET,
    storage_path: storagePath,
    upload_token: data.token,
    original_filename: descriptor.originalFilename,
    mime_type: descriptor.mimeType,
    file_size_bytes: descriptor.fileSize,
    sha256: descriptor.sha256,
    context_hint: contextHint,
  });
}

async function findUploadedObject(storagePath: string) {
  const slash = storagePath.lastIndexOf("/");
  const folder = slash >= 0 ? storagePath.slice(0, slash) : "";
  const filename = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
  const { data, error } = await admin.storage
    .from(KNOWLEDGE_BUCKET)
    .list(folder, { limit: 100, search: filename });
  if (error) throw error;
  return (data || []).find((entry) => entry.name === filename) || null;
}

async function completeUpload(req: Request, body: JsonObject, actor: StaffActor) {
  const descriptor = validateFileDescriptor(body);
  const contextHint = cleanContextHint(body.context_hint);
  const storagePath = typeof body.storage_path === "string" ? body.storage_path.trim() : "";
  if (!storagePath || !storagePath.startsWith(storagePrefix(actor))) {
    return json(req, 403, { status: "error", code: "storage_scope_invalid", message: "Tài liệu không thuộc phạm vi phiên giáo viên hiện tại." });
  }

  const uploaded = await findUploadedObject(storagePath);
  if (!uploaded) {
    return json(req, 409, { status: "error", code: "upload_not_found", message: "Chưa xác nhận được tệp đã tải lên Storage." });
  }

  const storedSize = Number((uploaded as { metadata?: { size?: number } }).metadata?.size ?? descriptor.fileSize);
  if (Number.isFinite(storedSize) && storedSize > 0 && storedSize !== descriptor.fileSize) {
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
    return json(req, 409, { status: "error", code: "upload_size_mismatch", message: "Kích thước tệp tải lên không khớp thông tin đăng ký." });
  }

  const { data: existing } = await admin
    .from("knowledge_documents")
    .select("id,pipeline_status")
    .eq("storage_path", storagePath)
    .eq("owner_gv_id", actor.id)
    .maybeSingle();

  if (existing?.id) {
    return json(req, 200, {
      status: "success",
      action: "complete",
      idempotent: true,
      document_id: existing.id,
      pipeline_status: existing.pipeline_status,
    });
  }

  const { data, error } = await admin.rpc("rpc_knowledge_register_upload_service", {
    p_owner_gv_id: actor.id,
    p_storage_path: storagePath,
    p_original_filename: descriptor.originalFilename,
    p_mime_type: descriptor.mimeType,
    p_file_size_bytes: descriptor.fileSize,
    p_sha256: descriptor.sha256,
    p_context_hint: contextHint,
  });

  if (error || !data || data.status !== "success") {
    console.error("knowledge registration failed", error ?? data);
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
    return json(req, 500, { status: "error", code: "knowledge_registration_failed", message: "Tệp đã tải nhưng không thể đăng ký vào hàng đợi xử lý." });
  }

  return json(req, 200, {
    status: "success",
    action: "complete",
    document_id: data.document_id,
    job_id: data.job_id,
    pipeline_status: data.pipeline_status,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { status: "error", code: "method_not_allowed", message: "Chỉ hỗ trợ POST." });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(req, 500, { status: "error", code: "server_not_configured", message: "Dịch vụ tải tài liệu chưa được cấu hình." });
  }

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
    const isIdentity = code === "staff_identity_mismatch";
    return json(req, 401, {
      status: "error",
      code: isIdentity ? code : "staff_session_invalid",
      message: isIdentity ? "Tài khoản không khớp phiên làm việc." : "Phiên giáo viên không hợp lệ hoặc đã hết hạn.",
    });
  }

  try {
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    if (action === "prepare") return await prepareUpload(req, body, actor);
    if (action === "complete") return await completeUpload(req, body, actor);
    return json(req, 400, { status: "error", code: "action_invalid", message: "Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    if (["filename_invalid", "mime_type_unsupported", "file_size_invalid", "sha256_invalid", "context_hint_invalid", "context_hint_too_large"].includes(code)) {
      return json(req, 400, { status: "error", code, message: "Thông tin tệp tải lên không hợp lệ." });
    }
    console.error("knowledge-upload unexpected error", error);
    return json(req, 500, { status: "error", code: "unexpected_error", message: "Không thể xử lý yêu cầu tải tài liệu." });
  }
});
