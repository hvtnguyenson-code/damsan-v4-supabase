import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NORMALIZED_BUCKET = "knowledge-normalized";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const MAX_JSONL_BYTES = 7 * 1024 * 1024;
const MAX_JSONL_RECORDS = 15000;
const SOURCE_SCHEMA = "DAMSAN_SOURCE_V2";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;
type StaffActor = { id: string; ma_gv: string; truong_id: string; mon_id: string | null; quyen: string };
type OwnedDocument = {
  id: string;
  owner_gv_id: string | null;
  truong_id: string;
  mon_id: string | null;
  title: string;
  original_filename: string;
  page_count: number | null;
  pipeline_status: string;
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

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object_invalid");
  return value as JsonObject;
}

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sourceRole(value: unknown) {
  const role = cleanString(value, 80).toUpperCase();
  if (!["KNOWLEDGE_SOURCE", "ASSESSMENT_RULE", "ASSESSMENT_BENCHMARK"].includes(role)) {
    throw new Error("source_role_invalid");
  }
  return role;
}

function gradeValue(value: unknown) {
  const grade = Number(value);
  if (!Number.isSafeInteger(grade) || grade < 10 || grade > 12) throw new Error("grade_invalid");
  return grade;
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

async function ownedDocument(actor: StaffActor, documentId: string): Promise<OwnedDocument> {
  if (!isUuid(documentId)) throw new Error("document_invalid");
  const { data, error } = await admin
    .from("knowledge_documents")
    .select("id,owner_gv_id,truong_id,mon_id,title,original_filename,page_count,pipeline_status")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !data) throw new Error("document_unavailable");
  if (actor.quyen !== "Admin" && data.owner_gv_id !== actor.id) throw new Error("document_unavailable");
  if (actor.quyen !== "Admin" && data.truong_id !== actor.truong_id) throw new Error("document_unavailable");
  return data as OwnedDocument;
}

async function subjectName(monId: string | null) {
  if (!monId || !isUuid(monId)) return "Môn học";
  const { data } = await admin.from("mon_hoc").select("ten_mon").eq("id", monId).maybeSingle();
  return cleanString(data?.ten_mon, 200) || "Môn học";
}

function roleInstructions(role: string) {
  if (role === "ASSESSMENT_RULE") {
    return [
      "Mục tiêu là trích xuất QUY ĐỊNH KHẢO THÍ thành các rule máy đọc được, không phải nguồn kiến thức để đặt câu hỏi.",
      "Sau manifest, chỉ dùng record_type=assessment_rule.",
      "Mỗi assessment_rule phải có unit_key, title, rule_type, page_start/page_end và content là object mô tả quy tắc chính xác.",
      "Nếu tài liệu quy định số lượng câu, thời gian, cách chấm, cấu trúc phần, yêu cầu ngữ liệu hoặc định dạng đáp án, phải biểu diễn thành trường có kiểu dữ liệu rõ ràng; không chỉ viết văn xuôi.",
      "Không suy diễn quy định không có trong tài liệu. Mâu thuẫn/điểm chưa rõ phải ghi trong manifest.notes và coverage.uncertain_pages.",
    ];
  }
  if (role === "ASSESSMENT_BENCHMARK") {
    return [
      "Mục tiêu là trích xuất MẪU/KỸ THUẬT RA ĐỀ, không biến đề mẫu thành nguồn kiến thức và không sao chép câu hỏi để tái sử dụng.",
      "Sau manifest, chỉ dùng record_type=benchmark_pattern.",
      "Mỗi benchmark_pattern phải mô tả phần thi, dạng stimulus, thao tác nhận thức, cấu trúc phương án/nhận định, kiểu dữ liệu, mức độ và kỹ thuật ra câu; không chép nguyên văn stem/options/đáp án của đề mẫu.",
      "Giữ provenance page_start/page_end để hệ thống audit được mẫu tham chiếu.",
    ];
  }
  return [
    "Mục tiêu là chuyển toàn bộ nội dung học tập thành corpus chi tiết để ra đề; KHÔNG phải tóm tắt ngắn.",
    "Sau manifest, tạo record_type=lesson cho MỌI bài theo thứ tự, sau đó knowledge_block/table/figure/learning_outcome khi phù hợp.",
    "Mọi knowledge_block/table/figure/learning_outcome phải có lesson_code và lesson_title tương ứng; không trộn hai bài trong một record.",
    "Bảo toàn định nghĩa, cơ chế, nguyên nhân, biểu hiện, hệ quả, số liệu, bảng, chú thích, ví dụ và các điều kiện/ngoại lệ có ý nghĩa để kiểm tra.",
    "Không bổ sung kiến thức ngoài PDF. Nếu không chắc, ghi trang vào coverage.uncertain_pages thay vì đoán.",
  ];
}

function buildPrompt(doc: OwnedDocument, subject: string, grade: number, role: string) {
  const pageCount = Number(doc.page_count || 0);
  const profileHint = role === "KNOWLEDGE_SOURCE"
    ? "assessment_profile_ids phải là []"
    : "Nếu biết profile đích, assessment_profile_ids là mảng ID do người dùng/hệ thống cung cấp; nếu không biết để [].";
  return [
    "Bạn là DOCUMENT NORMALIZATION WORKER cho hệ thống Đam San V4.",
    "Người dùng sẽ đính kèm đúng file PDF nguồn cùng prompt này. Hãy đọc trực tiếp toàn bộ PDF, không dựa vào kiến thức nền của mô hình.",
    "ĐẦU RA BẮT BUỘC: một file JSONL/NDJSON UTF-8 hoặc nội dung JSONL thuần. Mỗi dòng là đúng một JSON object; không Markdown fence, không lời giải thích ngoài JSONL.",
    "Không được bỏ trang âm thầm. Số trang trong provenance là SỐ TRANG VẬT LÝ CỦA PDF, bắt đầu từ 1, không phải số trang in trên sách.",
    "",
    "METADATA DO HỆ THỐNG CHỐT — KHÔNG ĐƯỢC THAY ĐỔI:",
    `subject_name=${subject}`,
    `grade=${grade}`,
    `source_role=${role}`,
    `source_filename=${doc.original_filename}`,
    `source_page_count=${pageCount || "UNKNOWN"}`,
    "schema_version=DAMSAN_SOURCE_V2",
    "",
    "DÒNG 1 — MANIFEST BẮT BUỘC:",
    JSON.stringify({
      record_type: "manifest",
      schema_version: SOURCE_SCHEMA,
      source_role: role,
      subject_name: subject,
      grade,
      title: doc.title || doc.original_filename,
      document_type: role === "KNOWLEDGE_SOURCE" ? "TEXTBOOK" : role === "ASSESSMENT_RULE" ? "ASSESSMENT_FRAMEWORK" : "SUPPLEMENTARY",
      curriculum_code: "GDPT_2018",
      book_series: null,
      authority_code: null,
      assessment_profile_ids: [],
      coverage: {
        source_page_count: pageCount || 0,
        processed_pages_count: pageCount || 0,
        missing_pages: [],
        uncertain_pages: [],
      },
      notes: [],
    }),
    `Quy tắc: coverage.source_page_count phải bằng ${pageCount || "tổng số trang vật lý của PDF"}; processed_pages_count phải phản ánh số trang đã thực sự đọc; missing_pages không được che giấu. ${profileHint}.`,
    "",
    "SCHEMA RECORD CHO NGUỒN KIẾN THỨC:",
    JSON.stringify({ record_type: "lesson", lesson_code: "BAI_01", lesson_no: 1, lesson_title: "Tên bài", page_start: 5, page_end: 10, confidence: 0.99 }),
    JSON.stringify({ record_type: "knowledge_block", unit_key: "BAI_01_U001", unit_type: "SECTION", lesson_code: "BAI_01", lesson_title: "Tên bài", section_title: "Tên mục", page_start: 5, page_end: 6, content: { text: "Nội dung chi tiết", facts: ["..."] }, confidence: 0.98 }),
    JSON.stringify({ record_type: "table", unit_key: "BAI_01_T001", lesson_code: "BAI_01", lesson_title: "Tên bài", section_title: "Tên bảng", page_start: 7, page_end: 7, content: { title: "Tên bảng", headers: ["Cột 1", "Cột 2"], rows: [["...", "..."]] }, confidence: 0.99 }),
    "SCHEMA RECORD CHO QUY ĐỊNH:",
    JSON.stringify({ record_type: "assessment_rule", unit_key: "RULE_001", title: "Quy tắc", rule_type: "BLUEPRINT", page_start: 1, page_end: 2, content: { description: "...", machine_rule: { key: "value" } }, confidence: 1 }),
    "SCHEMA RECORD CHO ĐỀ MẪU/BENCHMARK:",
    JSON.stringify({ record_type: "benchmark_pattern", unit_key: "BENCH_001", title: "Mẫu kỹ thuật", page_start: 1, page_end: 1, content: { part: "1", stimulus_type: "TABLE", cognitive_action: "NHẬN_XÉT", item_writing_pattern: "Mô tả pattern, không chép câu hỏi" }, confidence: 0.99 }),
    "",
    ...roleInstructions(role),
    "",
    "KIỂM TRA TRƯỚC KHI XUẤT:",
    "1) Dòng đầu là manifest duy nhất; schema/grade/source_role khớp metadata hệ thống.",
    "2) coverage.missing_pages=[] nếu và chỉ nếu đã đọc đủ tất cả trang; nếu còn trang chưa đọc phải liệt kê trung thực.",
    "3) page_start/page_end nằm trong phạm vi PDF và page_end >= page_start.",
    "4) unit_key duy nhất trong toàn file.",
    "5) Không dùng kiến thức ngoài nguồn, không bịa số liệu, không gộp hai bài khác nhau.",
    "6) Chỉ xuất JSONL.",
  ].join("\n");
}

function parseJsonl(text: string, expectedRole: string, expectedGrade: number, doc: OwnedDocument, subject: string) {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (!text.trim() || bytes > MAX_JSONL_BYTES) throw new Error("normalized_payload_size_invalid");
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rawLines.length < 2 || rawLines.length > MAX_JSONL_RECORDS) throw new Error("normalized_record_count_invalid");

  const records: JsonObject[] = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    let parsed: unknown;
    try { parsed = JSON.parse(rawLines[index]); } catch { throw new Error(`normalized_json_invalid_line_${index + 1}`); }
    try { records.push(asObject(parsed)); } catch { throw new Error(`normalized_record_invalid_line_${index + 1}`); }
  }

  const manifest = { ...records[0] } as JsonObject;
  if (cleanString(manifest.record_type, 40).toLowerCase() !== "manifest") throw new Error("normalized_manifest_first_required");
  if (cleanString(manifest.schema_version, 80) !== SOURCE_SCHEMA) throw new Error("normalized_schema_invalid");
  if (sourceRole(manifest.source_role) !== expectedRole) throw new Error("normalized_manifest_role_mismatch");
  if (gradeValue(manifest.grade) !== expectedGrade) throw new Error("normalized_manifest_grade_mismatch");
  if (records.slice(1).some((record) => cleanString(record.record_type, 40).toLowerCase() === "manifest")) throw new Error("normalized_manifest_duplicate");

  const coverage = asObject(manifest.coverage ?? {});
  const sourcePageCount = Number(coverage.source_page_count);
  const processedPageCount = Number(coverage.processed_pages_count);
  if (!Number.isSafeInteger(sourcePageCount) || sourcePageCount < 1) throw new Error("normalized_coverage_invalid");
  if (doc.page_count && sourcePageCount !== Number(doc.page_count)) throw new Error("normalized_source_page_count_mismatch");
  if (!Number.isSafeInteger(processedPageCount) || processedPageCount < 1 || processedPageCount > sourcePageCount) throw new Error("normalized_coverage_invalid");
  if (!Array.isArray(coverage.missing_pages) || !Array.isArray(coverage.uncertain_pages)) throw new Error("normalized_coverage_invalid");
  if (coverage.missing_pages.length > 0) throw new Error("normalized_coverage_incomplete");
  if (processedPageCount !== sourcePageCount) throw new Error("normalized_coverage_incomplete");

  manifest.subject_name = subject;
  manifest.grade = expectedGrade;
  manifest.source_role = expectedRole;
  manifest.schema_version = SOURCE_SCHEMA;
  manifest.coverage = coverage;

  const units: JsonObject[] = [];
  const keys = new Set<string>();
  let ordinal = 0;
  for (const record of records.slice(1)) {
    ordinal += 1;
    const recordType = cleanString(record.record_type, 60).toLowerCase();
    const pageStartRaw = Number(record.page_start);
    const pageEndRaw = Number(record.page_end ?? record.page_start);
    const pageStart = Number.isSafeInteger(pageStartRaw) && pageStartRaw > 0 ? pageStartRaw : null;
    const pageEnd = Number.isSafeInteger(pageEndRaw) && pageEndRaw > 0 ? pageEndRaw : pageStart;
    if (pageStart && pageEnd && pageEnd < pageStart) throw new Error("normalized_page_range_invalid");
    if (doc.page_count && ((pageStart && pageStart > doc.page_count) || (pageEnd && pageEnd > doc.page_count))) throw new Error("normalized_page_range_invalid");
    const confidenceValue = Number(record.confidence);
    const confidence = Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : null;

    if (recordType === "lesson") {
      if (expectedRole !== "KNOWLEDGE_SOURCE") throw new Error("normalized_record_role_mismatch");
      const lessonNo = Number(record.lesson_no);
      const lessonCode = cleanString(record.lesson_code, 120);
      const lessonTitle = cleanString(record.lesson_title, 500);
      if (!Number.isSafeInteger(lessonNo) || lessonNo < 1 || !lessonCode || !lessonTitle || !pageStart || !pageEnd) throw new Error("normalized_lesson_invalid");
      const unitKey = `LESSON:${lessonCode}`;
      if (keys.has(unitKey)) throw new Error("normalized_unit_key_duplicate");
      keys.add(unitKey);
      units.push({
        unit_key: unitKey,
        unit_type: "LESSON",
        ordinal_no: ordinal,
        hierarchy: { path: [`Bài ${lessonNo}. ${lessonTitle}`], lesson_no: lessonNo },
        lesson_code: lessonCode,
        lesson_title: lessonTitle,
        section_title: null,
        page_start: pageStart,
        page_end: pageEnd,
        content: { lesson_no: lessonNo, title: lessonTitle },
        provenance: { source: "DAMSAN_SOURCE_V2", physical_pdf_pages: [pageStart, pageEnd] },
        confidence,
        is_usable: true,
      });
      continue;
    }

    const unitKey = cleanString(record.unit_key, 500);
    if (!unitKey || keys.has(unitKey)) throw new Error(unitKey ? "normalized_unit_key_duplicate" : "normalized_unit_key_required");
    keys.add(unitKey);
    const contentValue = record.content;
    const content = contentValue && typeof contentValue === "object" && !Array.isArray(contentValue)
      ? contentValue as JsonObject
      : { text: cleanString(contentValue, 500000) };
    const lessonCode = cleanString(record.lesson_code, 120) || null;
    const lessonTitle = cleanString(record.lesson_title, 500) || null;
    const sectionTitle = cleanString(record.section_title ?? record.title, 700) || null;

    let unitType = "OTHER";
    if (recordType === "knowledge_block") {
      if (expectedRole !== "KNOWLEDGE_SOURCE" || !lessonCode || !lessonTitle) throw new Error("normalized_knowledge_block_invalid");
      const requested = cleanString(record.unit_type, 80).toUpperCase();
      unitType = ["SECTION", "PARAGRAPH", "FACT", "LEARNING_OUTCOME", "FIGURE"].includes(requested) ? requested : "SECTION";
    } else if (recordType === "table") {
      if (expectedRole !== "KNOWLEDGE_SOURCE" || !lessonCode || !lessonTitle) throw new Error("normalized_table_invalid");
      unitType = "TABLE";
    } else if (recordType === "figure") {
      if (expectedRole !== "KNOWLEDGE_SOURCE" || !lessonCode || !lessonTitle) throw new Error("normalized_figure_invalid");
      unitType = "FIGURE";
    } else if (recordType === "learning_outcome") {
      if (expectedRole !== "KNOWLEDGE_SOURCE" || !lessonCode || !lessonTitle) throw new Error("normalized_learning_outcome_invalid");
      unitType = "LEARNING_OUTCOME";
    } else if (recordType === "assessment_rule") {
      if (expectedRole !== "ASSESSMENT_RULE") throw new Error("normalized_record_role_mismatch");
      unitType = "ASSESSMENT_RULE";
    } else if (recordType === "benchmark_pattern") {
      if (expectedRole !== "ASSESSMENT_BENCHMARK") throw new Error("normalized_record_role_mismatch");
      unitType = "BENCHMARK_PATTERN";
    } else {
      throw new Error(`normalized_record_type_unsupported_${recordType || "empty"}`);
    }

    units.push({
      unit_key: unitKey,
      unit_type: unitType,
      ordinal_no: ordinal,
      hierarchy: lessonTitle ? { path: [lessonTitle] } : {},
      lesson_code: lessonCode,
      lesson_title: lessonTitle,
      section_title: sectionTitle,
      page_start: pageStart,
      page_end: pageEnd,
      content,
      provenance: { source: "DAMSAN_SOURCE_V2", physical_pdf_pages: pageStart ? [pageStart, pageEnd || pageStart] : [] },
      confidence,
      is_usable: true,
    });
  }

  if (!units.length) throw new Error("normalized_units_empty");
  if (expectedRole === "KNOWLEDGE_SOURCE" && !units.some((unit) => unit.unit_type === "LESSON")) throw new Error("normalized_lessons_missing");
  return { manifest, units, recordCount: records.length, bytes };
}

async function preparePrompt(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const documentId = cleanString(body.document_id, 80);
  const grade = gradeValue(body.grade);
  const role = sourceRole(body.source_role);
  const doc = await ownedDocument(actor, documentId);
  const subject = await subjectName(doc.mon_id || actor.mon_id);
  return json(req, 200, {
    status: "success",
    action: "prepare_prompt",
    schema_version: SOURCE_SCHEMA,
    document: { id: doc.id, title: doc.title, original_filename: doc.original_filename, page_count: doc.page_count },
    selected_metadata: { subject_name: subject, grade, source_role: role },
    prompt: buildPrompt(doc, subject, grade, role),
  });
}

async function importJsonl(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const documentId = cleanString(body.document_id, 80);
  const grade = gradeValue(body.grade);
  const role = sourceRole(body.source_role);
  const provider = cleanString(body.ai_provider, 120) || "WEB_AI";
  const model = cleanString(body.ai_model, 240) || "";
  const payloadText = typeof body.payload_text === "string" ? body.payload_text : "";
  const doc = await ownedDocument(actor, documentId);
  const subject = await subjectName(doc.mon_id || actor.mon_id);
  const parsed = parseJsonl(payloadText, role, grade, doc, subject);
  const hash = await sha256Hex(payloadText);
  const storagePath = `${doc.truong_id}/${actor.id}/${doc.id}/${Date.now()}-${hash.slice(0, 20)}.jsonl`;
  const { error: uploadError } = await admin.storage.from(NORMALIZED_BUCKET).upload(
    storagePath,
    new Blob([payloadText], { type: "application/x-ndjson" }),
    { contentType: "application/x-ndjson", upsert: false }
  );
  if (uploadError) {
    console.error("normalized source upload failed", uploadError);
    throw new Error("normalized_storage_failed");
  }

  const { data, error } = await admin.rpc("rpc_knowledge_import_normalized_source_service", {
    p_requested_by: actor.id,
    p_document_id: doc.id,
    p_grade: grade,
    p_source_role: role,
    p_manifest: parsed.manifest,
    p_units: parsed.units,
    p_normalized_storage_path: storagePath,
    p_payload_sha256: hash,
    p_ai_provider: provider,
    p_ai_model: model || null,
  });
  if (error || !data || data.status !== "success") {
    console.error("normalized source commit failed", error ?? data);
    await admin.storage.from(NORMALIZED_BUCKET).remove([storagePath]);
    throw new Error(error?.message || data?.code || "normalized_commit_failed");
  }

  return json(req, 200, {
    status: "success",
    action: "import_jsonl",
    schema_version: SOURCE_SCHEMA,
    document_id: doc.id,
    grade,
    source_role: role,
    record_count: parsed.recordCount,
    unit_count: data.unit_count,
    revision: data.revision,
    active_revision: data.active_revision,
    quality_status: data.quality_status,
    uncertain_page_count: data.uncertain_page_count,
    payload_sha256: hash,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { status: "error", code: "method_not_allowed", message: "Chỉ hỗ trợ POST." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, 500, { status: "error", code: "server_not_configured", message: "Dịch vụ nguồn chuẩn hóa chưa được cấu hình." });

  let body: JsonObject;
  try { body = asObject(await req.json()); } catch { return json(req, 400, { status: "error", code: "body_invalid", message: "Dữ liệu yêu cầu không hợp lệ." }); }
  const action = cleanString(body.action, 80).toLowerCase();
  try {
    if (action === "prepare_prompt") return await preparePrompt(req, body);
    if (action === "import_jsonl") return await importJsonl(req, body);
    return json(req, 400, { status: "error", code: "action_invalid", message: "Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    const status = code === "staff_session_invalid" || code === "staff_identity_mismatch" ? 401
      : code.includes("unavailable") ? 404
      : code.includes("storage") || code.includes("commit") || code.includes("processing_busy") ? 409
      : code.startsWith("normalized_") || code.endsWith("_invalid") || code.endsWith("_mismatch") ? 400
      : 500;
    if (status >= 500) console.error("knowledge-normalized-source error", error);
    return json(req, status, { status: "error", code, message: "Không thể xử lý nguồn AI chuẩn hóa.", detail: status < 500 ? code : undefined });
  }
});
