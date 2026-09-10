import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const HANDOFF_TTL_MINUTES = 60;
const MAX_QUESTIONS = 300;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;
type StaffActor = { id: string; ma_gv: string; truong_id: string; mon_id: string | null; quyen: string };
type CleanQuestion = {
  phan: string;
  noi_dung: string;
  A: string;
  B: string;
  C: string;
  D: string;
  dap_an_dung: string;
  loi_giai: string;
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

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object_invalid");
  return value as JsonObject;
}

function asInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
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
    .select("id,ma_gv,truong_id,mon_id,quyen,mat_khau")
    .eq("id", session.gv_id)
    .maybeSingle();
  if (teacherError || !teacher || !isUuid(teacher.id) || !isUuid(teacher.truong_id)) throw new Error("staff_session_invalid");
  if (teacher.ma_gv !== maGv) throw new Error("staff_identity_mismatch");
  if (teacher.mat_khau === "123456" || teacher.mat_khau === DEFAULT_PASSWORD_HASH) throw new Error("staff_session_invalid");
  return { id: teacher.id, ma_gv: teacher.ma_gv, truong_id: teacher.truong_id, mon_id: teacher.mon_id, quyen: teacher.quyen };
}

function optionalUuidArray(value: unknown) {
  if (value == null) return null;
  if (!Array.isArray(value)) throw new Error("knowledge_documents_invalid");
  const unique = Array.from(new Set(value.map((item) => cleanString(item, 80))));
  if (unique.some((item) => !isUuid(item))) throw new Error("knowledge_documents_invalid");
  return unique;
}

async function createGenerationRequest(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const maPhong = cleanString(body.ma_phong, 120);
  const examSpec = asObject(body.exam_spec ?? {});
  const knowledgeIds = optionalUuidArray(body.knowledge_document_ids);
  const targetTruong = cleanString(body.truong_id, 80) || actor.truong_id;
  const targetMon = cleanString(body.mon_id, 80) || actor.mon_id || "";
  if (!isUuid(targetTruong) || !isUuid(targetMon) || !maPhong) throw new Error("target_invalid");

  const { data: created, error: createError } = await admin.rpc("rpc_ai_exam_create_request_service", {
    p_requested_by: actor.id,
    p_truong_id: targetTruong,
    p_mon_id: targetMon,
    p_ma_phong: maPhong,
    p_exam_spec: examSpec,
    p_knowledge_document_ids: knowledgeIds,
  });
  if (createError || !created || created.status !== "success") {
    console.error("ai exam request creation failed", createError ?? created);
    throw new Error("request_create_failed");
  }

  const capability = randomCapability();
  const capabilityHash = await sha256Hex(capability);
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MINUTES * 60 * 1000).toISOString();
  const { data: issued, error: issueError } = await admin.rpc("rpc_ai_exam_issue_handoff_service", {
    p_request_id: created.request_id,
    p_requested_by: actor.id,
    p_capability_hash: capabilityHash,
    p_expires_at: expiresAt,
  });
  if (issueError || !issued || issued.status !== "success") {
    console.error("ai exam handoff issue failed", issueError ?? issued);
    throw new Error("handoff_issue_failed");
  }

  return json(req, 200, {
    status: "success",
    action: "create_generation_request",
    request_id: created.request_id,
    ma_phong: created.ma_phong,
    assessment_type: created.assessment_type,
    variant_count: created.variant_count,
    knowledge_document_count: created.knowledge_document_count,
    capability_token: capability,
    expires_at: issued.expires_at,
    ai_endpoint: `${SUPABASE_URL}/functions/v1/exam-ai-bridge`,
  });
}

async function claimCapability(body: JsonObject) {
  const capability = cleanString(body.capability_token, 512);
  if (!capability) throw new Error("capability_invalid");
  const capabilityHash = await sha256Hex(capability);
  const workerId = cleanString(body.worker_id, 200) || "web-ai-exam-generator";
  const { data, error } = await admin.rpc("rpc_ai_exam_claim_handoff_service", {
    p_capability_hash: capabilityHash,
    p_worker_id: workerId,
  });
  if (error || !data || data.status !== "success") throw new Error(data?.code || "capability_invalid");
  return { capability, capabilityHash, claim: data as JsonObject };
}

function generationInstructions(examSpec: JsonObject) {
  return {
    objective: "Create a complete exam strictly grounded in the supplied knowledge units. Do not add unsupported model knowledge.",
    output_schema: "DAMSAN_EXAM_V1",
    required_root_fields: ["schema_version", "title", "assessment_type", "scoring_config", "questions"],
    question_fields: ["phan", "noi_dung", "A", "B", "C", "D", "dap_an_dung", "loi_giai", "source_refs"],
    part_1: "Multiple choice. A/B/C/D are all required; dap_an_dung must be exactly A, B, C, or D.",
    part_2: "True/false cluster. A/B/C/D are four statements; dap_an_dung is four D/S positions separated by hyphens, for example D-D-S-S (Đ is also accepted).",
    part_3: "Short answer. dap_an_dung is the canonical answer string. A/B/C/D may be empty strings.",
    grounding: "Every question must contain source_refs with one or more unit_key values from the supplied knowledge pack. Never invent a unit_key.",
    quality: [
      "Exactly one unambiguous correct answer for Part 1.",
      "Avoid answer-length clues and obviously implausible distractors.",
      "Avoid double negatives unless the exam specification explicitly requires them.",
      "Use natural teacher language and preserve the requested cognitive levels and content distribution.",
      "For numerical short answers, state the required unit or rounding rule in the question when needed.",
    ],
    exam_spec: examSpec,
    publication_rule: "AI submission creates a draft only. It never publishes. The teacher must explicitly approve the complete preview.",
  };
}

async function getGenerationInput(req: Request, body: JsonObject) {
  const { claim } = await claimCapability(body);
  const requestId = cleanString(claim.request_id, 80);
  const offset = asInt(body.offset, 0, 0, 1000000);
  const limit = asInt(body.limit, 80, 1, 120);
  const { data: pack, error: packError } = await admin.rpc("rpc_ai_exam_knowledge_pack_service", {
    p_request_id: requestId,
    p_offset: offset,
    p_limit: limit,
  });
  if (packError || !pack || pack.status !== "success") throw new Error("knowledge_pack_failed");

  return json(req, 200, {
    status: "success",
    action: "get_generation_input",
    schema_version: "DAMSAN_EXAM_GENERATION_INPUT_V1",
    request: {
      request_id: requestId,
      ma_phong: claim.ma_phong,
      exam_spec: claim.exam_spec,
    },
    instructions: generationInstructions(asObject(claim.exam_spec)),
    knowledge_pack: {
      offset: pack.offset,
      limit: pack.limit,
      total_units: pack.total_units,
      units: pack.units,
      has_more: pack.has_more,
      next_offset: pack.next_offset,
    },
  });
}

function normalizePart2Answer(value: unknown) {
  const raw = cleanString(value, 40).toUpperCase().replaceAll(" ", "");
  const slots = raw.split("-");
  if (slots.length !== 4 || slots.some((s) => !["D", "Đ", "S"].includes(s))) throw new Error("part2_answer_invalid");
  return slots.map((s) => s === "D" ? "Đ" : s).join("-");
}

function sourceRefs(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) throw new Error("source_refs_invalid");
  const refs = value.map((item) => {
    if (typeof item === "string") return item.trim();
    if (item && typeof item === "object" && !Array.isArray(item)) return cleanString((item as JsonObject).unit_key, 300);
    return "";
  }).filter(Boolean);
  if (!refs.length) throw new Error("source_refs_invalid");
  return Array.from(new Set(refs));
}

function cleanQuestion(rawValue: unknown, knownUnitKeys: Set<string>) {
  const raw = asObject(rawValue);
  const phan = cleanString(raw.phan ?? raw.Phan, 8);
  if (!["1", "2", "3"].includes(phan)) throw new Error("question_part_invalid");
  const noiDung = cleanString(raw.noi_dung ?? raw.NoiDung, 16000);
  if (!noiDung) throw new Error("question_text_required");

  const refs = sourceRefs(raw.source_refs);
  if (refs.some((ref) => !knownUnitKeys.has(ref))) throw new Error("source_ref_unknown");

  let A = cleanString(raw.A ?? raw.a, 8000);
  let B = cleanString(raw.B ?? raw.b, 8000);
  let C = cleanString(raw.C ?? raw.c, 8000);
  let D = cleanString(raw.D ?? raw.d, 8000);
  let answer = cleanString(raw.dap_an_dung ?? raw.DapAnDung, 500);
  if (phan === "1") {
    if (![A, B, C, D].every(Boolean)) throw new Error("part1_options_required");
    answer = answer.toUpperCase();
    if (!/^[ABCD]$/.test(answer)) throw new Error("part1_answer_invalid");
  } else if (phan === "2") {
    if (![A, B, C, D].every(Boolean)) throw new Error("part2_statements_required");
    answer = normalizePart2Answer(answer);
  } else {
    if (!answer) throw new Error("part3_answer_required");
    A = ""; B = ""; C = ""; D = "";
  }

  return {
    canonical: {
      phan,
      noi_dung: noiDung,
      A, B, C, D,
      dap_an_dung: answer,
      loi_giai: cleanString(raw.loi_giai, 16000),
    } as CleanQuestion,
    source_refs: refs,
    muc_do: cleanString(raw.muc_do, 120),
    bai_hoc: cleanString(raw.bai_hoc, 500),
  };
}

function expectedCount(spec: JsonObject, part: string) {
  const counts = spec.counts && typeof spec.counts === "object" && !Array.isArray(spec.counts) ? spec.counts as JsonObject : {};
  const candidate = counts[`p${part}`] ?? spec[`p${part}_count`];
  if (candidate == null || candidate === "") return null;
  const n = Number(candidate);
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_QUESTIONS) throw new Error("exam_spec_count_invalid");
  return n;
}

function validateScoring(profile: string, value: unknown, counts: Record<string, number>) {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
  if (profile !== "CUSTOM") {
    if (Object.keys(config).length) throw new Error("scoring_config_must_be_empty");
    return {};
  }
  const p1 = Number(config.p1_weight);
  const p2 = Number(config.p2_weight);
  const p3 = Number(config.p3_weight);
  if (![p1, p2, p3].every((n) => Number.isFinite(n) && n >= 0 && n <= 10)) throw new Error("custom_weights_invalid");
  if (Math.abs((p1 + p2 + p3) - 10) > 1e-9) throw new Error("custom_weights_invalid");
  if ((counts.p1 === 0 && p1 !== 0) || (counts.p2 === 0 && p2 !== 0) || (counts.p3 === 0 && p3 !== 0)) {
    throw new Error("custom_weights_absent_part_invalid");
  }
  return { p1_weight: p1, p2_weight: p2, p3_weight: p3 };
}

function rotate<T>(items: T[], shift: number) {
  if (items.length < 2) return [...items];
  const n = shift % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}

function variantCodes(spec: JsonObject, count: number) {
  if (Array.isArray(spec.variant_codes)) {
    const codes = spec.variant_codes.map((v) => cleanString(v, 80));
    if (codes.length !== count || codes.some((v) => !v) || new Set(codes).size !== codes.length) throw new Error("variant_codes_invalid");
    return codes;
  }
  return Array.from({ length: count }, (_, i) => String(101 + i));
}

async function knownKnowledgeUnitKeys(documentIds: string[]) {
  const keys = new Set<string>();
  for (const documentId of documentIds) {
    const { data: doc, error: docError } = await admin
      .from("knowledge_documents").select("active_revision").eq("id", documentId).maybeSingle();
    if (docError || !doc?.active_revision) throw new Error("knowledge_document_unavailable");
    const { data: units, error: unitsError } = await admin
      .from("knowledge_units").select("unit_key").eq("document_id", documentId)
      .eq("revision", doc.active_revision).eq("is_usable", true);
    if (unitsError) throw new Error("knowledge_unit_lookup_failed");
    for (const unit of units || []) if (unit.unit_key) keys.add(String(unit.unit_key));
  }
  return keys;
}

function validateAndBuildExam(payloadValue: unknown, spec: JsonObject, knownUnitKeys: Set<string>) {
  const payload = asObject(payloadValue);
  if (payload.schema_version !== "DAMSAN_EXAM_V1") throw new Error("exam_schema_invalid");
  const title = cleanString(payload.title, 500);
  if (!title) throw new Error("exam_title_required");
  const profile = cleanString(payload.assessment_type, 40).toUpperCase();
  const expectedProfile = cleanString(spec.assessment_type, 40).toUpperCase();
  const allowedProfiles = ["LEGACY", "TOT_NGHIEP", "MCQ_ONLY", "TRUE_FALSE_ONLY", "SHORT_ONLY", "CUSTOM"];
  if (!allowedProfiles.includes(profile) || profile !== expectedProfile) throw new Error("assessment_type_mismatch");
  if (!Array.isArray(payload.questions) || payload.questions.length < 1 || payload.questions.length > MAX_QUESTIONS) throw new Error("questions_invalid");

  const canonical: CleanQuestion[] = [];
  const provenance: JsonObject[] = [];
  const counts = { p1: 0, p2: 0, p3: 0 };
  for (let index = 0; index < payload.questions.length; index += 1) {
    const cleaned = cleanQuestion(payload.questions[index], knownUnitKeys);
    canonical.push(cleaned.canonical);
    counts[`p${cleaned.canonical.phan}` as keyof typeof counts] += 1;
    provenance.push({ question_no: index + 1, source_refs: cleaned.source_refs, muc_do: cleaned.muc_do, bai_hoc: cleaned.bai_hoc });
  }

  for (const part of ["1", "2", "3"]) {
    const expected = expectedCount(spec, part);
    if (expected !== null && counts[`p${part}` as keyof typeof counts] !== expected) throw new Error("question_count_mismatch");
  }
  if (profile === "MCQ_ONLY" && (counts.p1 !== canonical.length || counts.p1 < 1)) throw new Error("profile_structure_invalid");
  if (profile === "TRUE_FALSE_ONLY" && (counts.p2 !== canonical.length || counts.p2 < 1)) throw new Error("profile_structure_invalid");
  if (profile === "SHORT_ONLY" && (counts.p3 !== canonical.length || counts.p3 < 1)) throw new Error("profile_structure_invalid");

  const scoringConfig = validateScoring(profile, payload.scoring_config, counts);
  const variantCount = asInt(spec.variant_count, 4, 1, 8);
  const codes = variantCodes(spec, variantCount);
  const groups = {
    p1: canonical.filter((q) => q.phan === "1"),
    p2: canonical.filter((q) => q.phan === "2"),
    p3: canonical.filter((q) => q.phan === "3"),
  };
  const variants = codes.map((code, i) => ({
    ma_de: code,
    assessment_type: profile,
    scoring_config: scoringConfig,
    cau_so: [...rotate(groups.p1, i), ...rotate(groups.p2, i), ...rotate(groups.p3, i)],
  }));

  const normalizedPayload = {
    ...payload,
    schema_version: "DAMSAN_EXAM_V1",
    title,
    assessment_type: profile,
    scoring_config: scoringConfig,
    questions: payload.questions,
    _validated_provenance: provenance,
  };
  const validationReport = {
    valid: true,
    validator_version: "031A1",
    question_count: canonical.length,
    counts,
    grounded_question_count: provenance.length,
    known_source_unit_count: knownUnitKeys.size,
    variant_count: variantCount,
    variant_codes: codes,
    shuffle_mode: "ROTATE_QUESTION_ORDER_WITHIN_PARTS",
    canonical_save_rpc: "rpc_luu_de_thi_len_phong",
  };
  return { normalizedPayload, variants, validationReport };
}

async function submitExamDraft(req: Request, body: JsonObject) {
  const { capabilityHash, claim } = await claimCapability(body);
  const spec = asObject(claim.exam_spec);
  const documentIds = Array.isArray(claim.knowledge_document_ids)
    ? claim.knowledge_document_ids.map((v) => cleanString(v, 80)).filter(isUuid)
    : [];
  if (!documentIds.length) throw new Error("knowledge_documents_invalid");
  const knownKeys = await knownKnowledgeUnitKeys(documentIds);
  if (!knownKeys.size) throw new Error("knowledge_pack_empty");
  const built = validateAndBuildExam(body.exam, spec, knownKeys);

  const { data, error } = await admin.rpc("rpc_ai_exam_store_draft_service", {
    p_capability_hash: capabilityHash,
    p_ai_provider: cleanString(body.ai_provider, 120) || "WEB_AI",
    p_ai_model: cleanString(body.ai_model, 160) || "unspecified",
    p_exam_payload: built.normalizedPayload,
    p_variants_payload: built.variants,
    p_validation_report: built.validationReport,
  });
  if (error || !data || data.status !== "success") throw new Error(data?.code || "draft_store_failed");

  return json(req, 200, {
    status: "success",
    action: "submit_exam_draft",
    request_id: data.request_id,
    revision: data.revision,
    request_status: data.request_status,
    validation: built.validationReport,
  });
}

function clientStatus(code: string) {
  if (["staff_session_invalid", "staff_identity_mismatch"].includes(code)) return 401;
  if (code.startsWith("capability_") || code.includes("unavailable")) return 409;
  if (code.includes("invalid") || code.includes("required") || code.includes("mismatch") || code.includes("empty")) return 400;
  return 500;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { status: "error", code: "method_not_allowed", message: "Chỉ hỗ trợ POST." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, 500, { status: "error", code: "server_not_configured", message: "Dịch vụ tạo đề AI chưa được cấu hình." });

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
    if (action === "create_generation_request") return await createGenerationRequest(req, body);
    if (action === "get_generation_input") return await getGenerationInput(req, body);
    if (action === "submit_exam_draft") return await submitExamDraft(req, body);
    return json(req, 400, { status: "error", code: "action_invalid", message: "Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    const status = clientStatus(code);
    if (status >= 500) console.error("exam-ai-bridge unexpected error", error);
    return json(req, status, {
      status: "error",
      code,
      message: status >= 500 ? "Không thể xử lý yêu cầu tạo đề AI." : "Yêu cầu tạo đề AI không hợp lệ hoặc đã hết hiệu lực.",
    });
  }
});
