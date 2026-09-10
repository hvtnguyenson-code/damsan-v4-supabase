import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARTIFACT_BUCKET = "knowledge-artifacts";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const HANDOFF_TTL_MINUTES = 60;
const MAX_CHUNK_PAGES = 30;
const MAX_LOGICAL_CHARS = 120000;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;
type StaffActor = { id: string; ma_gv: string; truong_id: string };

type ExtractPage = {
  page_number?: number;
  text?: string;
  method?: string;
  confidence?: number | null;
  direct_chars?: number;
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

function randomCapability() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function requireStaff(body: JsonObject): Promise<StaffActor> {
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
    .select("id,ma_gv,truong_id,mat_khau")
    .eq("id", session.gv_id)
    .maybeSingle();

  if (teacherError || !teacher || !isUuid(teacher.id) || !isUuid(teacher.truong_id)) throw new Error("staff_session_invalid");
  if (teacher.ma_gv !== maGv) throw new Error("staff_identity_mismatch");
  if (teacher.mat_khau === "123456" || teacher.mat_khau === DEFAULT_PASSWORD_HASH) throw new Error("staff_session_invalid");

  return { id: teacher.id, ma_gv: teacher.ma_gv, truong_id: teacher.truong_id };
}

async function createAnalysisHandoff(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const jobId = cleanString(body.job_id, 80);
  if (!isUuid(jobId)) throw new Error("job_identity_invalid");

  const capability = randomCapability();
  const capabilityHash = await sha256Hex(capability);
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await admin.rpc("rpc_knowledge_issue_analysis_handoff_service", {
    p_job_id: jobId,
    p_requested_by: actor.id,
    p_capability_hash: capabilityHash,
    p_expires_at: expiresAt,
  });
  if (error || !data || data.status !== "success") {
    console.error("knowledge analysis handoff issue failed", error ?? data);
    throw new Error("handoff_issue_failed");
  }

  return json(req, 200, {
    status: "success",
    action: "create_analysis_handoff",
    handoff_id: data.handoff_id,
    document_id: data.document_id,
    job_id: data.job_id,
    capability_token: capability,
    expires_at: data.expires_at,
    ai_endpoint: `${SUPABASE_URL}/functions/v1/knowledge-ai-bridge`,
  });
}

async function claimByCapability(body: JsonObject) {
  const capability = cleanString(body.capability_token, 512);
  if (!capability) throw new Error("capability_invalid");
  const capabilityHash = await sha256Hex(capability);
  const workerId = cleanString(body.worker_id, 200) || "web-ai-client";
  const { data, error } = await admin.rpc("rpc_knowledge_claim_analysis_handoff_service", {
    p_capability_hash: capabilityHash,
    p_worker_id: workerId,
  });
  if (error || !data || data.status !== "success") {
    const code = data?.code || "capability_invalid";
    throw new Error(code);
  }
  return { capabilityHash, claim: data as JsonObject };
}

function analysisInstructions(boundaryMode: string) {
  return {
    objective: "Transform only the supplied source into DAMSAN_KNOWLEDGE_V1. Do not add model knowledge unless the source explicitly contains it.",
    required_document_fields: ["schema_version", "title", "document_type", "grade", "subject_name", "units"],
    allowed_document_types: ["TEXTBOOK", "CURRICULUM", "LEARNING_OUTCOMES", "ASSESSMENT_FRAMEWORK", "SUPPLEMENTARY", "PERSONAL_RULES", "OTHER"],
    allowed_unit_types: ["DOCUMENT", "LESSON", "SECTION", "PARAGRAPH", "FACT", "TABLE", "FIGURE", "LEARNING_OUTCOME", "ASSESSMENT_RULE", "PERSONAL_RULE", "OTHER"],
    unit_rule: "Each unit must have unit_key, unit_type, ordinal_no, hierarchy, content, provenance, confidence, and is_usable. Prefer small factual/structural units rather than one giant blob.",
    provenance_rule: boundaryMode === "PHYSICAL_PAGE"
      ? "Preserve physical source page numbers whenever the unit can be localized. Never invent a page number."
      : "This source has logical-document boundaries. Do not invent physical page numbers; use source_document plus a meaningful logical location in provenance/hierarchy.",
    hierarchy_rule: "Infer chapter, lesson, section, subsection, learning outcomes, tables, figures, and assessment rules from the source itself.",
    confidence_rule: "Use confidence from 0 to 1 to represent certainty that the unit is faithfully grounded in the supplied source.",
    final_schema_version: "DAMSAN_KNOWLEDGE_V1",
  };
}

async function readArtifact(storagePath: string) {
  const { data, error } = await admin.storage.from(ARTIFACT_BUCKET).download(storagePath);
  if (error || !data) throw new Error("extraction_artifact_unavailable");
  const text = await data.text();
  if (!text || text.length > 8 * 1024 * 1024) throw new Error("extraction_artifact_invalid");
  let artifact: JsonObject;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    artifact = parsed as JsonObject;
  } catch {
    throw new Error("extraction_artifact_invalid");
  }
  if (artifact.schema_version !== "DAMSAN_EXTRACT_V1" || !Array.isArray(artifact.pages)) {
    throw new Error("extraction_artifact_invalid");
  }
  return artifact;
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildArtifactChunk(artifact: JsonObject, body: JsonObject) {
  const pages = artifact.pages as ExtractPage[];
  const boundaryMode = cleanString(artifact.boundary_mode, 40).toUpperCase() || "UNKNOWN";

  if (boundaryMode === "LOGICAL_DOCUMENT") {
    const text = typeof pages[0]?.text === "string" ? pages[0].text : "";
    const start = Math.min(nonNegativeInt(body.char_start, 0), text.length);
    const requested = Math.min(positiveInt(body.char_limit, MAX_LOGICAL_CHARS), MAX_LOGICAL_CHARS);
    const end = Math.min(start + requested, text.length);
    return {
      boundary_mode: boundaryMode,
      logical_chunk: {
        char_start: start,
        char_end: end,
        total_chars: text.length,
        text: text.slice(start, end),
        method: pages[0]?.method ?? null,
        confidence: pages[0]?.confidence ?? null,
      },
      has_more: end < text.length,
      next_char_start: end < text.length ? end : null,
    };
  }

  const startPage = Math.min(positiveInt(body.page_start, 1), Math.max(pages.length, 1));
  const requestedEnd = positiveInt(body.page_end, startPage + MAX_CHUNK_PAGES - 1);
  const endPage = Math.min(requestedEnd, startPage + MAX_CHUNK_PAGES - 1, pages.length);
  return {
    boundary_mode: boundaryMode,
    page_start: startPage,
    page_end: endPage,
    page_count: pages.length,
    pages: pages.slice(startPage - 1, endPage),
    has_more: endPage < pages.length,
    next_page_start: endPage < pages.length ? endPage + 1 : null,
  };
}

async function getAnalysisInput(req: Request, body: JsonObject) {
  const { claim } = await claimByCapability(body);
  const extractionManifest = claim.extraction_manifest as JsonObject;
  const artifactPath = cleanString(extractionManifest?.artifact_path, 1200);
  if (!artifactPath) throw new Error("extraction_artifact_missing");
  const artifact = await readArtifact(artifactPath);
  const chunk = buildArtifactChunk(artifact, body);
  const boundaryMode = cleanString(artifact.boundary_mode, 40).toUpperCase() || "UNKNOWN";

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
      extraction: { ...extractionManifest, artifact_path: undefined },
    },
    instructions: analysisInstructions(boundaryMode),
    source_chunk: chunk,
  });
}

async function submitAnalysis(req: Request, body: JsonObject) {
  const capability = cleanString(body.capability_token, 512);
  if (!capability) throw new Error("capability_invalid");
  const capabilityHash = await sha256Hex(capability);
  const analysis = body.analysis;
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) throw new Error("payload_invalid");

  const serializedSize = new TextEncoder().encode(JSON.stringify(analysis)).byteLength;
  if (serializedSize > 6 * 1024 * 1024) throw new Error("payload_too_large");

  const { data, error } = await admin.rpc("rpc_knowledge_complete_analysis_handoff_service", {
    p_capability_hash: capabilityHash,
    p_pipeline_version: cleanString(body.pipeline_version, 120) || "DAMSAN_KNOWLEDGE_V1",
    p_ai_provider: cleanString(body.ai_provider, 120) || "WEB_AI",
    p_ai_model: cleanString(body.ai_model, 160) || "unspecified",
    p_payload: analysis,
  });
  if (error || !data || data.status !== "success") {
    console.error("knowledge analysis completion failed", error ?? data);
    const code = data?.code || "analysis_commit_failed";
    throw new Error(code);
  }

  return json(req, 200, {
    status: "success",
    action: "submit_analysis",
    document_id: data.document_id,
    revision: data.revision,
    quality_status: data.quality_status,
    active_revision: data.active_revision,
    validation: data.validation,
  });
}

function clientStatus(code: string) {
  if (code === "staff_session_invalid" || code === "staff_identity_mismatch") return 401;
  if (code.startsWith("capability_") || code === "analysis_job_unavailable") return 409;
  if (code === "payload_invalid" || code === "payload_too_large" || code === "job_identity_invalid") return 400;
  if (code.includes("artifact")) return 409;
  return 500;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { status: "error", code: "method_not_allowed", message: "Chỉ hỗ trợ POST." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, 500, { status: "error", code: "server_not_configured", message: "Dịch vụ AI bridge chưa được cấu hình." });

  let body: JsonObject;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body_invalid");
    body = parsed as JsonObject;
  } catch {
    return json(req, 400, { status: "error", code: "body_invalid", message: "Dữ liệu yêu cầu không hợp lệ." });
  }

  const action = cleanString(body.action, 80).toLowerCase();
  try {
    if (action === "create_analysis_handoff") return await createAnalysisHandoff(req, body);
    if (action === "get_analysis_input") return await getAnalysisInput(req, body);
    if (action === "submit_analysis") return await submitAnalysis(req, body);
    return json(req, 400, { status: "error", code: "action_invalid", message: "Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    const status = clientStatus(code);
    if (status >= 500) console.error("knowledge-ai-bridge unexpected error", error);
    return json(req, status, {
      status: "error",
      code,
      message: status >= 500 ? "Không thể xử lý yêu cầu AI bridge." : "Yêu cầu AI bridge không hợp lệ hoặc đã hết hiệu lực.",
    });
  }
});
