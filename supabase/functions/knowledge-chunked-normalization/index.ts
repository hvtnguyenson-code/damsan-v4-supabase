import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NORMALIZED_BUCKET = "knowledge-normalized";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const PLAN_SCHEMA = "DAMSAN_SOURCE_PLAN_V1";
const SOURCE_SCHEMA = "DAMSAN_SOURCE_V2";
const MAX_PLAN_BYTES = 512 * 1024;
const MAX_CHUNK_BYTES = 1024 * 1024;
const MAX_ASSEMBLED_BYTES = 7 * 1024 * 1024;
const MAX_PLAN_RECORDS = 500;
const MAX_CHUNK_RECORDS = 2000;
const TARGET_CHUNK_PAGES = 12;

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
  grade: number | null;
  source_role: string | null;
  title: string;
  original_filename: string;
  page_count: number | null;
  pipeline_status: string;
  document_type: string | null;
};
type PlanRange = {
  kind: "LESSON" | "NON_LESSON" | "UNRESOLVED";
  page_start: number;
  page_end: number;
  lesson_code?: string;
  lesson_no?: number;
  lesson_title?: string;
  label?: string;
  confidence?: number | null;
};
type ChunkRow = {
  id: string;
  plan_id: string;
  chunk_key: string;
  chunk_no: number;
  chunk_type: string;
  lesson_code: string | null;
  lesson_no: number | null;
  lesson_title: string | null;
  lesson_page_start: number | null;
  lesson_page_end: number | null;
  part_no: number | null;
  part_count: number | null;
  page_start: number;
  page_end: number;
  range_label: string | null;
  status: string;
  processed_pages: number[] | null;
  missing_pages: number[] | null;
  uncertain_pages: number[] | null;
  records?: JsonObject[] | null;
  payload_storage_path?: string | null;
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

function safeInt(value: unknown, min = 1) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min ? number : null;
}

function confidenceValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function uniqueSortedPages(value: unknown, min: number, max: number) {
  if (!Array.isArray(value)) throw new Error("chunk_page_list_invalid");
  const pages = value.map((item) => Number(item));
  if (pages.some((page) => !Number.isSafeInteger(page) || page < min || page > max)) throw new Error("chunk_page_list_invalid");
  return [...new Set(pages)].sort((a, b) => a - b);
}

function rangePages(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
    .select("id,owner_gv_id,truong_id,mon_id,grade,source_role,title,original_filename,page_count,pipeline_status,document_type")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !data) throw new Error("document_unavailable");
  if (actor.quyen !== "Admin" && data.owner_gv_id !== actor.id) throw new Error("document_unavailable");
  if (actor.quyen !== "Admin" && data.truong_id !== actor.truong_id) throw new Error("document_unavailable");
  return data as OwnedDocument;
}

async function subjectName(monId: string | null) {
  if (!monId || !isUuid(monId)) throw new Error("subject_binding_required");
  const { data, error } = await admin.from("mon_hoc").select("ten_mon").eq("id", monId).maybeSingle();
  if (error || !data) throw new Error("subject_binding_required");
  const name = cleanString(data.ten_mon, 200);
  if (!name) throw new Error("subject_binding_required");
  return name;
}

function requireKnowledgeIdentity(doc: OwnedDocument, requestedGrade: unknown) {
  const grade = safeInt(requestedGrade, 10);
  if (!grade || grade > 12) throw new Error("grade_invalid");
  if (!doc.mon_id) throw new Error("subject_binding_required");
  if (Number(doc.grade || 0) !== grade) throw new Error("grade_binding_mismatch");
  if ((doc.source_role || "KNOWLEDGE_SOURCE") !== "KNOWLEDGE_SOURCE") throw new Error("chunked_role_invalid");
  if (!safeInt(doc.page_count, 1)) throw new Error("source_page_count_invalid");
  return grade;
}

function parseJsonLines(text: string, maxBytes: number, maxRecords: number, prefix: string) {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (!text.trim() || bytes > maxBytes) throw new Error(`${prefix}_payload_size_invalid`);
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > maxRecords) throw new Error(`${prefix}_record_count_invalid`);
  const records: JsonObject[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    try {
      records.push(asObject(JSON.parse(lines[index])));
    } catch {
      throw new Error(`${prefix}_json_invalid_line_${index + 1}`);
    }
  }
  return { records, bytes };
}

function splitRange(start: number, end: number) {
  const length = end - start + 1;
  const partCount = Math.ceil(length / TARGET_CHUNK_PAGES);
  const base = Math.floor(length / partCount);
  const extra = length % partCount;
  const parts: Array<{ page_start: number; page_end: number; part_no: number; part_count: number }> = [];
  let cursor = start;
  for (let index = 0; index < partCount; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    parts.push({ page_start: cursor, page_end: cursor + size - 1, part_no: index + 1, part_count: partCount });
    cursor += size;
  }
  return parts;
}

function buildStructurePrompt(doc: OwnedDocument, subject: string, grade: number) {
  const pageCount = Number(doc.page_count);
  return [
    "Bạn là DOCUMENT STRUCTURE SCANNER cho hệ thống Đam San V4.",
    "Người dùng sẽ đính kèm đúng file PDF nguồn cùng prompt này.",
    "NHIỆM VỤ DUY NHẤT: lập BẢN ĐỒ CẤU TRÚC của tài liệu. Không trích xuất toàn bộ nội dung bài học và không tạo knowledge_block ở bước này.",
    "Hãy đọc mục lục và kiểm tra trực tiếp các trang bắt đầu bài để ánh xạ đúng SỐ TRANG VẬT LÝ CỦA PDF (trang vật lý bắt đầu từ 1, không phải số trang in trên sách).",
    "Đầu ra nhỏ gọn giúp hệ thống chia workload; tuyệt đối không cố chuẩn hóa cả cuốn trong một lượt.",
    "",
    "ĐẦU RA: JSONL/NDJSON thuần; mỗi dòng đúng một JSON object; không Markdown fence, không lời giải thích ngoài JSONL.",
    "",
    "METADATA KHÓA:",
    `schema_version=${PLAN_SCHEMA}`,
    `subject_name=${subject}`,
    `grade=${grade}`,
    "source_role=KNOWLEDGE_SOURCE",
    `source_filename=${doc.original_filename}`,
    `source_page_count=${pageCount}`,
    "",
    "DÒNG 1:",
    JSON.stringify({
      record_type: "plan_manifest",
      schema_version: PLAN_SCHEMA,
      source_role: "KNOWLEDGE_SOURCE",
      subject_name: subject,
      grade,
      source_filename: doc.original_filename,
      source_page_count: pageCount,
      notes: [],
    }),
    "",
    "SAU ĐÓ dùng các record sau để phủ KÍN trang vật lý 1..source_page_count, không chồng lấn và không để khoảng trống:",
    JSON.stringify({ record_type: "lesson_plan", lesson_code: "BAI_01", lesson_no: 1, lesson_title: "Tên bài", page_start: 7, page_end: 11, confidence: 0.99 }),
    JSON.stringify({ record_type: "non_lesson_range", range_code: "FRONT_01", label: "Bìa / lời nói đầu / mục lục", page_start: 1, page_end: 6, confidence: 0.99 }),
    JSON.stringify({ record_type: "unresolved_range", range_code: "UNRESOLVED_01", label: "Không xác định chắc chắn", page_start: 40, page_end: 41, confidence: 0.3 }),
    "",
    "QUY TẮC:",
    "1) lesson_plan phải có lesson_code, lesson_no, lesson_title và phạm vi trang vật lý đầy đủ của bài.",
    "2) page_end của một bài là trang vật lý ngay trước bài kế tiếp, trừ khi tài liệu thể hiện ranh giới khác rõ ràng.",
    "3) Các trang bìa, lời nói đầu, mục lục, phụ lục, tài liệu tham khảo... phải được ghi thành non_lesson_range thay vì bỏ qua.",
    "4) Nếu không xác định chắc một khoảng trang, dùng unresolved_range; không đoán. Server sẽ chặn lắp ráp cuối cho đến khi khoảng đó được giải quyết.",
    "5) Tất cả range phải nằm trong 1..source_page_count, không chồng lấn và tổng hợp lại phải phủ đúng toàn bộ PDF.",
    "6) Không cần tự chia bài thành chunk 8–15 trang. Server sẽ chia lesson_plan một cách xác định, tối đa 12 trang/chunk.",
    "7) Không dùng kiến thức nền để bịa tên bài/range. Chỉ lấy từ PDF.",
    "8) Chỉ xuất JSONL.",
  ].join("\n");
}

function parsePlan(text: string, doc: OwnedDocument, subject: string, grade: number) {
  const { records, bytes } = parseJsonLines(text, MAX_PLAN_BYTES, MAX_PLAN_RECORDS, "plan");
  if (records.length < 2) throw new Error("plan_record_count_invalid");
  const manifest = records[0];
  if (cleanString(manifest.record_type, 40).toLowerCase() !== "plan_manifest") throw new Error("plan_manifest_first_required");
  if (cleanString(manifest.schema_version, 80) !== PLAN_SCHEMA) throw new Error("plan_schema_invalid");
  if (cleanString(manifest.source_role, 80) !== "KNOWLEDGE_SOURCE") throw new Error("plan_role_invalid");
  if (Number(manifest.grade) !== grade) throw new Error("plan_grade_mismatch");
  if (cleanString(manifest.subject_name, 200) !== subject) throw new Error("plan_subject_mismatch");
  if (Number(manifest.source_page_count) !== Number(doc.page_count)) throw new Error("plan_source_page_count_mismatch");

  const ranges: PlanRange[] = [];
  const lessonCodes = new Set<string>();
  const lessonNos = new Set<number>();
  for (const record of records.slice(1)) {
    const type = cleanString(record.record_type, 60).toLowerCase();
    const start = safeInt(record.page_start);
    const end = safeInt(record.page_end);
    if (!start || !end || end < start || end > Number(doc.page_count)) throw new Error("plan_page_range_invalid");
    const confidence = confidenceValue(record.confidence);
    if (type === "lesson_plan") {
      const lessonCode = cleanString(record.lesson_code, 120);
      const lessonNo = safeInt(record.lesson_no);
      const lessonTitle = cleanString(record.lesson_title, 500);
      if (!lessonCode || !lessonNo || !lessonTitle) throw new Error("plan_lesson_invalid");
      if (lessonCodes.has(lessonCode) || lessonNos.has(lessonNo)) throw new Error("plan_lesson_duplicate");
      lessonCodes.add(lessonCode);
      lessonNos.add(lessonNo);
      ranges.push({ kind: "LESSON", page_start: start, page_end: end, lesson_code: lessonCode, lesson_no: lessonNo, lesson_title: lessonTitle, confidence });
    } else if (type === "non_lesson_range") {
      ranges.push({ kind: "NON_LESSON", page_start: start, page_end: end, label: cleanString(record.label, 500) || cleanString(record.range_code, 120) || "Ngoài bài học", confidence });
    } else if (type === "unresolved_range") {
      ranges.push({ kind: "UNRESOLVED", page_start: start, page_end: end, label: cleanString(record.label, 500) || cleanString(record.range_code, 120) || "Chưa xác định", confidence });
    } else {
      throw new Error(`plan_record_type_unsupported_${type || "empty"}`);
    }
  }
  if (!ranges.some((range) => range.kind === "LESSON")) throw new Error("plan_lessons_missing");

  ranges.sort((a, b) => a.page_start - b.page_start || a.page_end - b.page_end);
  let cursor = 1;
  for (const range of ranges) {
    if (range.page_start !== cursor) throw new Error("plan_coverage_gap_or_overlap");
    cursor = range.page_end + 1;
  }
  if (cursor !== Number(doc.page_count) + 1) throw new Error("plan_coverage_gap_or_overlap");

  const lessons = ranges.filter((range) => range.kind === "LESSON");
  const lessonsByNo = [...lessons].sort((a, b) => Number(a.lesson_no) - Number(b.lesson_no));
  for (let index = 1; index < lessonsByNo.length; index += 1) {
    if (Number(lessonsByNo[index].lesson_no) <= Number(lessonsByNo[index - 1].lesson_no)) throw new Error("plan_lesson_order_invalid");
    if (lessonsByNo[index].page_start <= lessonsByNo[index - 1].page_start) throw new Error("plan_lesson_order_invalid");
  }

  const chunks: Omit<ChunkRow, "id" | "plan_id" | "records" | "payload_storage_path">[] = [];
  let chunkNo = 0;
  for (const range of ranges) {
    if (range.kind === "LESSON") {
      const parts = splitRange(range.page_start, range.page_end);
      for (const part of parts) {
        chunkNo += 1;
        const lessonCode = String(range.lesson_code);
        const chunkKey = `${lessonCode}_C${String(part.part_no).padStart(2, "0")}`;
        chunks.push({
          chunk_key: chunkKey,
          chunk_no: chunkNo,
          chunk_type: "LESSON",
          lesson_code: lessonCode,
          lesson_no: Number(range.lesson_no),
          lesson_title: String(range.lesson_title),
          lesson_page_start: range.page_start,
          lesson_page_end: range.page_end,
          part_no: part.part_no,
          part_count: part.part_count,
          page_start: part.page_start,
          page_end: part.page_end,
          range_label: null,
          status: "PENDING",
          processed_pages: [],
          missing_pages: [],
          uncertain_pages: [],
          attempt_no: 0,
        } as never);
      }
    } else {
      chunkNo += 1;
      chunks.push({
        chunk_key: `${range.kind}_${String(chunkNo).padStart(3, "0")}`,
        chunk_no: chunkNo,
        chunk_type: range.kind,
        lesson_code: null,
        lesson_no: null,
        lesson_title: null,
        lesson_page_start: null,
        lesson_page_end: null,
        part_no: null,
        part_count: null,
        page_start: range.page_start,
        page_end: range.page_end,
        range_label: range.label || null,
        status: range.kind === "NON_LESSON" ? "ACCOUNTED" : "PENDING",
        processed_pages: range.kind === "NON_LESSON" ? rangePages(range.page_start, range.page_end) : [],
        missing_pages: [],
        uncertain_pages: [],
        attempt_no: 0,
      } as never);
    }
  }

  const canonicalPlan = {
    schema_version: PLAN_SCHEMA,
    source_role: "KNOWLEDGE_SOURCE",
    subject_name: subject,
    grade,
    source_filename: doc.original_filename,
    source_page_count: Number(doc.page_count),
    lessons: lessonsByNo.map((range) => ({
      lesson_code: range.lesson_code,
      lesson_no: range.lesson_no,
      lesson_title: range.lesson_title,
      page_start: range.page_start,
      page_end: range.page_end,
      confidence: range.confidence,
    })),
    non_lesson_ranges: ranges.filter((range) => range.kind === "NON_LESSON").map((range) => ({ page_start: range.page_start, page_end: range.page_end, label: range.label, confidence: range.confidence })),
    unresolved_ranges: ranges.filter((range) => range.kind === "UNRESOLVED").map((range) => ({ page_start: range.page_start, page_end: range.page_end, label: range.label, confidence: range.confidence })),
    chunk_policy: { target_max_pages: TARGET_CHUNK_PAGES, generated_by: "SERVER_042" },
  };
  return { canonicalPlan, chunks, bytes, recordCount: records.length, unresolvedCount: canonicalPlan.unresolved_ranges.length };
}

function buildChunkPrompt(doc: OwnedDocument, subject: string, grade: number, chunk: ChunkRow) {
  const prefix = String(chunk.chunk_key);
  const pageList = rangePages(chunk.page_start, chunk.page_end);
  return [
    "Bạn là LESSON NORMALIZATION WORKER cho hệ thống Đam San V4.",
    "Người dùng sẽ đính kèm đúng file PDF nguồn cùng prompt này.",
    "Chỉ đọc trực tiếp phạm vi TRANG VẬT LÝ được giao. Không xử lí trang ngoài phạm vi, không dùng kiến thức nền, không đoán trang chưa đọc.",
    "KHÔNG XUẤT MANIFEST TOÀN SÁCH và KHÔNG XUẤT record_type=lesson. Manifest và lesson record sẽ do ASSEMBLER tạo từ kế hoạch server đã khóa.",
    "",
    "ĐẦU RA: JSONL/NDJSON UTF-8 thuần; mỗi dòng đúng một JSON object; không Markdown fence, không lời giải thích ngoài JSONL.",
    "",
    "METADATA KHÓA — KHÔNG ĐƯỢC THAY ĐỔI:",
    `schema_version=${SOURCE_SCHEMA}`,
    "source_role=KNOWLEDGE_SOURCE",
    `subject_name=${subject}`,
    `grade=${grade}`,
    `source_filename=${doc.original_filename}`,
    `lesson_code=${chunk.lesson_code}`,
    `lesson_no=${chunk.lesson_no}`,
    `lesson_title=${chunk.lesson_title}`,
    `lesson_page_start=${chunk.lesson_page_start}`,
    `lesson_page_end=${chunk.lesson_page_end}`,
    `chunk_key=${chunk.chunk_key}`,
    `part_no=${chunk.part_no}`,
    `part_count=${chunk.part_count}`,
    `assigned_page_start=${chunk.page_start}`,
    `assigned_page_end=${chunk.page_end}`,
    "",
    "DÒNG 1 BẮT BUỘC — chunk_status (processed_pages phải do bạn điền SAU KHI thực sự đọc):",
    JSON.stringify({
      record_type: "chunk_status",
      schema_version: SOURCE_SCHEMA,
      source_filename: doc.original_filename,
      lesson_code: chunk.lesson_code,
      lesson_no: chunk.lesson_no,
      lesson_title: chunk.lesson_title,
      chunk_key: chunk.chunk_key,
      assigned_page_start: chunk.page_start,
      assigned_page_end: chunk.page_end,
      processed_pages: [],
      missing_pages: pageList,
      uncertain_pages: [],
    }),
    "Mẫu trên cố ý bắt đầu với processed_pages=[] và missing_pages=toàn bộ phạm vi. Chỉ chuyển một trang sang processed_pages sau khi đã thực sự đọc trang đó. uncertain_pages phải là tập con của processed_pages.",
    "",
    "SAU chunk_status chỉ dùng các record sau khi phù hợp:",
    JSON.stringify({ record_type: "knowledge_block", unit_key: `${prefix}_U001`, unit_type: "SECTION", lesson_code: chunk.lesson_code, lesson_title: chunk.lesson_title, section_title: "Tên mục", page_start: chunk.page_start, page_end: chunk.page_start, content: { text: "Nội dung đầy đủ cần thiết để tạo câu hỏi kiểm tra.", facts: ["..."] }, confidence: 0.98 }),
    JSON.stringify({ record_type: "table", unit_key: `${prefix}_T001`, lesson_code: chunk.lesson_code, lesson_title: chunk.lesson_title, section_title: "Tên bảng", page_start: chunk.page_start, page_end: chunk.page_start, content: { title: "Tên bảng", headers: ["..."], rows: [["..."]] }, confidence: 0.99 }),
    JSON.stringify({ record_type: "figure", unit_key: `${prefix}_F001`, lesson_code: chunk.lesson_code, lesson_title: chunk.lesson_title, section_title: "Tên hình", page_start: chunk.page_start, page_end: chunk.page_start, content: { title: "Tên hình/bản đồ/biểu đồ", figure_type: "MAP|CHART|DIAGRAM|PHOTO|OTHER", description: "Mô tả thông tin có giá trị học tập thể hiện trên hình.", facts: ["..."] }, confidence: 0.95 }),
    JSON.stringify({ record_type: "learning_outcome", unit_key: `${prefix}_LO001`, lesson_code: chunk.lesson_code, lesson_title: chunk.lesson_title, page_start: chunk.page_start, page_end: chunk.page_start, content: { text: "Yêu cầu cần đạt nếu thực sự có trên trang được giao." }, confidence: 0.99 }),
    "",
    "QUY TẮC CHI TIẾT:",
    "1) Phải đọc tất cả trang vật lý trong phạm vi được giao trước khi kết thúc.",
    "2) processed_pages chỉ liệt kê trang thực sự đã đọc. Trang không đọc được phải ở missing_pages; trang đã đọc nhưng còn nghi ngờ phải đồng thời nằm trong processed_pages và uncertain_pages.",
    "3) Không tóm tắt quá mức. Giữ khái niệm, định nghĩa, đặc điểm, nguyên nhân, biểu hiện, hệ quả, quan hệ nhân quả, điều kiện, ngoại lệ, phân bố không gian, số liệu, mốc thời gian, địa danh, bảng, chú thích hình/bản đồ và ví dụ có ý nghĩa kiểm tra.",
    "4) Một mục lớn có thể chia thành nhiều knowledge_block. Không ép toàn bộ mục dài vào một record.",
    "5) Không trộn nội dung bài khác. lesson_code và lesson_title phải đúng metadata khóa.",
    `6) Mọi unit_key phải bắt đầu bằng ${prefix}_ và duy nhất trong chunk. Dùng ${prefix}_U001, ${prefix}_T001, ${prefix}_F001, ${prefix}_LO001...`,
    "7) Với bảng, bảo toàn tiêu đề, đơn vị, năm, hàng/cột và số liệu đọc chắc chắn. Không biến bảng thành mô tả chung nếu có thể trích cấu trúc.",
    "8) Với biểu đồ/bản đồ/sơ đồ, mô tả thông tin học tập đọc được; không suy đoán chi tiết không nhìn rõ.",
    "9) Không đưa câu hỏi luyện tập của sách vào facts như thể đó là kiến thức.",
    "10) page_start/page_end của mọi record phải nằm trong assigned_page_start..assigned_page_end.",
    "11) Không được tự ý kết thúc trước assigned_page_end.",
    "12) Chỉ xuất JSONL.",
  ].join("\n");
}

function parseChunkPayload(text: string, chunk: ChunkRow) {
  const { records, bytes } = parseJsonLines(text, MAX_CHUNK_BYTES, MAX_CHUNK_RECORDS, "chunk");
  if (records.length < 2) throw new Error("chunk_records_empty");
  const status = records[0];
  if (cleanString(status.record_type, 40).toLowerCase() !== "chunk_status") throw new Error("chunk_status_first_required");
  if (cleanString(status.schema_version, 80) !== SOURCE_SCHEMA) throw new Error("chunk_schema_invalid");
  if (cleanString(status.chunk_key, 160) !== chunk.chunk_key) throw new Error("chunk_identity_mismatch");
  if (cleanString(status.lesson_code, 120) !== chunk.lesson_code || Number(status.lesson_no) !== Number(chunk.lesson_no) || cleanString(status.lesson_title, 500) !== chunk.lesson_title) throw new Error("chunk_lesson_mismatch");
  if (Number(status.assigned_page_start) !== chunk.page_start || Number(status.assigned_page_end) !== chunk.page_end) throw new Error("chunk_range_mismatch");
  if (records.slice(1).some((record) => ["manifest", "lesson", "chunk_status"].includes(cleanString(record.record_type, 40).toLowerCase()))) throw new Error("chunk_record_type_forbidden");

  const processedPages = uniqueSortedPages(status.processed_pages, chunk.page_start, chunk.page_end);
  const missingPages = uniqueSortedPages(status.missing_pages, chunk.page_start, chunk.page_end);
  const uncertainPages = uniqueSortedPages(status.uncertain_pages, chunk.page_start, chunk.page_end);
  const processed = new Set(processedPages);
  const missing = new Set(missingPages);
  if (processedPages.some((page) => missing.has(page))) throw new Error("chunk_coverage_overlap");
  if (uncertainPages.some((page) => !processed.has(page))) throw new Error("chunk_uncertain_not_processed");
  for (const page of rangePages(chunk.page_start, chunk.page_end)) {
    if (!processed.has(page) && !missing.has(page)) throw new Error("chunk_coverage_gap");
  }

  const prefix = `${chunk.chunk_key}_`;
  const keys = new Set<string>();
  const canonicalRecords: JsonObject[] = [];
  for (const record of records.slice(1)) {
    const type = cleanString(record.record_type, 60).toLowerCase();
    if (!["knowledge_block", "table", "figure", "learning_outcome"].includes(type)) throw new Error(`chunk_record_type_unsupported_${type || "empty"}`);
    const unitKey = cleanString(record.unit_key, 500);
    if (!unitKey.startsWith(prefix) || keys.has(unitKey)) throw new Error(unitKey ? "chunk_unit_key_invalid" : "chunk_unit_key_required");
    keys.add(unitKey);
    if (cleanString(record.lesson_code, 120) !== chunk.lesson_code || cleanString(record.lesson_title, 500) !== chunk.lesson_title) throw new Error("chunk_lesson_mismatch");
    const pageStart = safeInt(record.page_start);
    const pageEnd = safeInt(record.page_end ?? record.page_start);
    if (!pageStart || !pageEnd || pageEnd < pageStart || pageStart < chunk.page_start || pageEnd > chunk.page_end) throw new Error("chunk_unit_page_invalid");
    const content = record.content;
    if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("chunk_unit_content_invalid");
    canonicalRecords.push({
      ...record,
      record_type: type,
      unit_key: unitKey,
      lesson_code: chunk.lesson_code,
      lesson_title: chunk.lesson_title,
      page_start: pageStart,
      page_end: pageEnd,
      confidence: confidenceValue(record.confidence),
    });
  }
  if (!canonicalRecords.length) throw new Error("chunk_units_empty");
  const chunkStatus = missingPages.length ? "INCOMPLETE" : uncertainPages.length ? "NEEDS_REVIEW" : "IMPORTED";
  return { canonicalRecords, processedPages, missingPages, uncertainPages, chunkStatus, bytes, recordCount: records.length };
}

function recordsToUnits(records: JsonObject[], sourcePageCount: number) {
  const units: JsonObject[] = [];
  const keys = new Set<string>();
  let ordinal = 0;
  for (const record of records) {
    ordinal += 1;
    const type = cleanString(record.record_type, 60).toLowerCase();
    const pageStart = safeInt(record.page_start);
    const pageEnd = safeInt(record.page_end ?? record.page_start);
    if (!pageStart || !pageEnd || pageEnd < pageStart || pageEnd > sourcePageCount) throw new Error("assembly_unit_page_invalid");
    if (type === "lesson") {
      const lessonCode = cleanString(record.lesson_code, 120);
      const lessonNo = safeInt(record.lesson_no);
      const lessonTitle = cleanString(record.lesson_title, 500);
      if (!lessonCode || !lessonNo || !lessonTitle) throw new Error("assembly_lesson_invalid");
      const unitKey = `LESSON:${lessonCode}`;
      if (keys.has(unitKey)) throw new Error("assembly_unit_key_duplicate");
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
        provenance: { source: "DAMSAN_SOURCE_V2/CHUNKED_042", physical_pdf_pages: [pageStart, pageEnd] },
        confidence: confidenceValue(record.confidence),
        is_usable: true,
      });
      continue;
    }
    const unitKey = cleanString(record.unit_key, 500);
    if (!unitKey || keys.has(unitKey)) throw new Error(unitKey ? "assembly_unit_key_duplicate" : "assembly_unit_key_required");
    keys.add(unitKey);
    const lessonCode = cleanString(record.lesson_code, 120);
    const lessonTitle = cleanString(record.lesson_title, 500);
    if (!lessonCode || !lessonTitle) throw new Error("assembly_lesson_mismatch");
    const content = asObject(record.content);
    let unitType = "SECTION";
    if (type === "knowledge_block") {
      const requested = cleanString(record.unit_type, 80).toUpperCase();
      unitType = ["SECTION", "PARAGRAPH", "FACT", "LEARNING_OUTCOME", "FIGURE"].includes(requested) ? requested : "SECTION";
    } else if (type === "table") unitType = "TABLE";
    else if (type === "figure") unitType = "FIGURE";
    else if (type === "learning_outcome") unitType = "LEARNING_OUTCOME";
    else throw new Error(`assembly_record_type_unsupported_${type || "empty"}`);
    units.push({
      unit_key: unitKey,
      unit_type: unitType,
      ordinal_no: ordinal,
      hierarchy: { path: [lessonTitle] },
      lesson_code: lessonCode,
      lesson_title: lessonTitle,
      section_title: cleanString(record.section_title ?? record.title, 700) || null,
      page_start: pageStart,
      page_end: pageEnd,
      content,
      provenance: { source: "DAMSAN_SOURCE_V2/CHUNKED_042", physical_pdf_pages: [pageStart, pageEnd] },
      confidence: confidenceValue(record.confidence),
      is_usable: true,
    });
  }
  return units;
}

async function loadPlanOwned(actor: StaffActor, planId: string) {
  if (!isUuid(planId)) throw new Error("plan_id_invalid");
  const { data: plan, error } = await admin.from("knowledge_normalization_plans").select("*").eq("id", planId).maybeSingle();
  if (error || !plan) throw new Error("plan_unavailable");
  const doc = await ownedDocument(actor, plan.document_id);
  return { plan, doc };
}

async function prepareStructure(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const doc = await ownedDocument(actor, cleanString(body.document_id, 80));
  const grade = requireKnowledgeIdentity(doc, body.grade);
  const subject = await subjectName(doc.mon_id);
  return json(req, 200, {
    status: "success",
    action: "prepare_structure_prompt",
    schema_version: PLAN_SCHEMA,
    document: { id: doc.id, title: doc.title, original_filename: doc.original_filename, page_count: doc.page_count },
    selected_metadata: { subject_name: subject, grade, source_role: "KNOWLEDGE_SOURCE" },
    prompt: buildStructurePrompt(doc, subject, grade),
  });
}

async function importPlan(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const doc = await ownedDocument(actor, cleanString(body.document_id, 80));
  const grade = requireKnowledgeIdentity(doc, body.grade);
  const subject = await subjectName(doc.mon_id);
  const payloadText = typeof body.payload_text === "string" ? body.payload_text : "";
  const parsed = parsePlan(payloadText, doc, subject, grade);
  const hash = await sha256Hex(payloadText);
  const storagePath = `${doc.truong_id}/${actor.id}/${doc.id}/plans/${Date.now()}-${hash.slice(0, 20)}-plan.jsonl`;
  const { error: uploadError } = await admin.storage.from(NORMALIZED_BUCKET).upload(storagePath, new Blob([payloadText], { type: "application/x-ndjson" }), { contentType: "application/x-ndjson", upsert: false });
  if (uploadError) throw new Error("plan_storage_failed");

  const planStatus = parsed.unresolvedCount ? "NEEDS_REVIEW" : "ACTIVE";
  const { data: plan, error: planError } = await admin.from("knowledge_normalization_plans").insert({
    document_id: doc.id,
    requested_by: actor.id,
    mon_id: doc.mon_id,
    subject_name: subject,
    grade,
    source_role: "KNOWLEDGE_SOURCE",
    schema_version: PLAN_SCHEMA,
    source_page_count: doc.page_count,
    plan_status: planStatus,
    plan_json: parsed.canonicalPlan,
    plan_storage_path: storagePath,
    payload_sha256: hash,
    ai_provider: cleanString(body.ai_provider, 120) || "WEB_AI",
    ai_model: cleanString(body.ai_model, 240) || null,
  }).select("id").single();
  if (planError || !plan?.id) {
    await admin.storage.from(NORMALIZED_BUCKET).remove([storagePath]);
    throw new Error("plan_commit_failed");
  }

  const rows = parsed.chunks.map((chunk) => ({ ...chunk, plan_id: plan.id }));
  const { error: chunkError } = await admin.from("knowledge_normalization_chunks").insert(rows);
  if (chunkError) {
    await admin.from("knowledge_normalization_plans").delete().eq("id", plan.id);
    await admin.storage.from(NORMALIZED_BUCKET).remove([storagePath]);
    throw new Error("plan_chunk_commit_failed");
  }
  await admin.from("knowledge_normalization_plans")
    .update({ plan_status: "SUPERSEDED", updated_at: new Date().toISOString() })
    .eq("document_id", doc.id)
    .neq("id", plan.id)
    .in("plan_status", ["ACTIVE", "NEEDS_REVIEW"]);

  return json(req, 200, {
    status: "success",
    action: "import_structure_plan",
    plan_id: plan.id,
    plan_status: planStatus,
    lesson_count: parsed.canonicalPlan.lessons.length,
    lesson_chunk_count: parsed.chunks.filter((chunk) => chunk.chunk_type === "LESSON").length,
    non_lesson_range_count: parsed.canonicalPlan.non_lesson_ranges.length,
    unresolved_range_count: parsed.unresolvedCount,
    record_count: parsed.recordCount,
    payload_sha256: hash,
  });
}

async function readPlan(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const doc = await ownedDocument(actor, cleanString(body.document_id, 80));
  const { data: plans, error } = await admin.from("knowledge_normalization_plans")
    .select("id,document_id,subject_name,grade,source_page_count,plan_status,plan_json,ai_provider,ai_model,created_at,updated_at,assembled_at")
    .eq("document_id", doc.id)
    .in("plan_status", ["ACTIVE", "NEEDS_REVIEW", "ASSEMBLED"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("plan_read_failed");
  const plan = plans?.[0] || null;
  if (!plan) return json(req, 200, { status: "success", action: "read_plan", document_id: doc.id, plan: null, chunks: [] });
  const { data: chunks, error: chunkError } = await admin.from("knowledge_normalization_chunks")
    .select("id,plan_id,chunk_key,chunk_no,chunk_type,lesson_code,lesson_no,lesson_title,lesson_page_start,lesson_page_end,part_no,part_count,page_start,page_end,range_label,status,processed_pages,missing_pages,uncertain_pages,attempt_no,updated_at")
    .eq("plan_id", plan.id)
    .order("chunk_no", { ascending: true });
  if (chunkError) throw new Error("plan_read_failed");
  return json(req, 200, { status: "success", action: "read_plan", document_id: doc.id, plan, chunks: chunks || [] });
}

async function prepareChunk(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const { plan, doc } = await loadPlanOwned(actor, cleanString(body.plan_id, 80));
  if (!["ACTIVE", "NEEDS_REVIEW"].includes(plan.plan_status)) throw new Error("plan_not_editable");
  const chunkId = cleanString(body.chunk_id, 80);
  if (!isUuid(chunkId)) throw new Error("chunk_id_invalid");
  const { data: chunk, error } = await admin.from("knowledge_normalization_chunks").select("*").eq("id", chunkId).eq("plan_id", plan.id).maybeSingle();
  if (error || !chunk) throw new Error("chunk_unavailable");
  if (chunk.chunk_type !== "LESSON") throw new Error("chunk_not_lesson");
  const subject = await subjectName(doc.mon_id);
  return json(req, 200, {
    status: "success",
    action: "prepare_chunk_prompt",
    plan_id: plan.id,
    chunk: {
      id: chunk.id,
      chunk_key: chunk.chunk_key,
      lesson_code: chunk.lesson_code,
      lesson_no: chunk.lesson_no,
      lesson_title: chunk.lesson_title,
      part_no: chunk.part_no,
      part_count: chunk.part_count,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
    },
    prompt: buildChunkPrompt(doc, subject, Number(plan.grade), chunk as ChunkRow),
  });
}

async function importChunk(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const { plan, doc } = await loadPlanOwned(actor, cleanString(body.plan_id, 80));
  if (!["ACTIVE", "NEEDS_REVIEW"].includes(plan.plan_status)) throw new Error("plan_not_editable");
  const chunkId = cleanString(body.chunk_id, 80);
  if (!isUuid(chunkId)) throw new Error("chunk_id_invalid");
  const { data: chunk, error } = await admin.from("knowledge_normalization_chunks").select("*").eq("id", chunkId).eq("plan_id", plan.id).maybeSingle();
  if (error || !chunk) throw new Error("chunk_unavailable");
  if (chunk.chunk_type !== "LESSON") throw new Error("chunk_not_lesson");
  const payloadText = typeof body.payload_text === "string" ? body.payload_text : "";
  const parsed = parseChunkPayload(payloadText, chunk as ChunkRow);
  const hash = await sha256Hex(payloadText);
  const storagePath = `${doc.truong_id}/${actor.id}/${doc.id}/chunks/${plan.id}/${chunk.chunk_key}/${Date.now()}-${hash.slice(0, 20)}.jsonl`;
  const { error: uploadError } = await admin.storage.from(NORMALIZED_BUCKET).upload(storagePath, new Blob([payloadText], { type: "application/x-ndjson" }), { contentType: "application/x-ndjson", upsert: false });
  if (uploadError) throw new Error("chunk_storage_failed");
  const previousPath = cleanString(chunk.payload_storage_path, 2000);
  const { error: updateError } = await admin.from("knowledge_normalization_chunks").update({
    status: parsed.chunkStatus,
    processed_pages: parsed.processedPages,
    missing_pages: parsed.missingPages,
    uncertain_pages: parsed.uncertainPages,
    records: parsed.canonicalRecords,
    payload_storage_path: storagePath,
    payload_sha256: hash,
    ai_provider: cleanString(body.ai_provider, 120) || "WEB_AI",
    ai_model: cleanString(body.ai_model, 240) || null,
    attempt_no: Number(chunk.attempt_no || 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", chunk.id).eq("plan_id", plan.id);
  if (updateError) {
    await admin.storage.from(NORMALIZED_BUCKET).remove([storagePath]);
    throw new Error("chunk_commit_failed");
  }
  if (previousPath && previousPath !== storagePath) await admin.storage.from(NORMALIZED_BUCKET).remove([previousPath]);
  return json(req, 200, {
    status: "success",
    action: "import_chunk_jsonl",
    plan_id: plan.id,
    chunk_id: chunk.id,
    chunk_key: chunk.chunk_key,
    chunk_status: parsed.chunkStatus,
    record_count: parsed.recordCount,
    unit_count: parsed.canonicalRecords.length,
    processed_page_count: parsed.processedPages.length,
    missing_pages: parsed.missingPages,
    uncertain_pages: parsed.uncertainPages,
    payload_sha256: hash,
  });
}

async function assemble(req: Request, body: JsonObject) {
  const actor = await requireStaff(body);
  const { plan, doc } = await loadPlanOwned(actor, cleanString(body.plan_id, 80));
  if (!["ACTIVE", "NEEDS_REVIEW"].includes(plan.plan_status)) throw new Error("plan_not_assemblable");
  const canonicalPlan = asObject(plan.plan_json);
  const unresolvedRanges = Array.isArray(canonicalPlan.unresolved_ranges) ? canonicalPlan.unresolved_ranges : [];
  if (unresolvedRanges.length) throw new Error("assembly_unresolved_ranges");
  const lessons = Array.isArray(canonicalPlan.lessons) ? canonicalPlan.lessons.map(asObject) : [];
  if (!lessons.length) throw new Error("assembly_lessons_missing");
  const { data: rows, error } = await admin.from("knowledge_normalization_chunks").select("*").eq("plan_id", plan.id).order("chunk_no", { ascending: true });
  if (error || !rows) throw new Error("assembly_chunks_unavailable");
  const chunks = rows as ChunkRow[];
  const lessonChunks = chunks.filter((chunk) => chunk.chunk_type === "LESSON");
  const pending = lessonChunks.filter((chunk) => !["IMPORTED", "NEEDS_REVIEW"].includes(chunk.status));
  if (pending.length) throw new Error(`assembly_chunks_incomplete_${pending.length}`);
  if (lessonChunks.some((chunk) => Array.isArray(chunk.missing_pages) && chunk.missing_pages.length)) throw new Error("assembly_missing_pages");

  const accountedPages = new Set<number>();
  const uncertainPages = new Set<number>();
  for (const chunk of chunks) {
    if (chunk.chunk_type === "NON_LESSON") {
      rangePages(chunk.page_start, chunk.page_end).forEach((page) => accountedPages.add(page));
    } else if (chunk.chunk_type === "LESSON") {
      const processed = Array.isArray(chunk.processed_pages) ? chunk.processed_pages : [];
      processed.forEach((page) => accountedPages.add(Number(page)));
      (Array.isArray(chunk.uncertain_pages) ? chunk.uncertain_pages : []).forEach((page) => uncertainPages.add(Number(page)));
    }
  }
  const sourcePageCount = Number(plan.source_page_count);
  const missingFinal = rangePages(1, sourcePageCount).filter((page) => !accountedPages.has(page));
  if (missingFinal.length) throw new Error(`assembly_page_coverage_incomplete_${missingFinal.length}`);

  const subject = await subjectName(doc.mon_id);
  const finalRecords: JsonObject[] = [];
  for (const lesson of lessons) {
    finalRecords.push({
      record_type: "lesson",
      lesson_code: cleanString(lesson.lesson_code, 120),
      lesson_no: Number(lesson.lesson_no),
      lesson_title: cleanString(lesson.lesson_title, 500),
      page_start: Number(lesson.page_start),
      page_end: Number(lesson.page_end),
      confidence: confidenceValue(lesson.confidence),
    });
  }
  for (const chunk of lessonChunks) {
    const records = Array.isArray(chunk.records) ? chunk.records : [];
    records.forEach((record) => finalRecords.push(asObject(record)));
  }

  const manifest: JsonObject = {
    record_type: "manifest",
    schema_version: SOURCE_SCHEMA,
    source_role: "KNOWLEDGE_SOURCE",
    subject_name: subject,
    grade: Number(plan.grade),
    title: doc.title || doc.original_filename,
    document_type: doc.document_type || "TEXTBOOK",
    curriculum_code: "GDPT_2018",
    book_series: null,
    authority_code: null,
    assessment_profile_ids: [],
    coverage: {
      source_page_count: sourcePageCount,
      processed_pages_count: accountedPages.size,
      missing_pages: [],
      uncertain_pages: [...uncertainPages].sort((a, b) => a - b),
    },
    notes: [
      "CHUNKED_NORMALIZATION_042",
      { structure_plan_id: plan.id, lesson_count: lessons.length, lesson_chunk_count: lessonChunks.length },
      { non_lesson_ranges: Array.isArray(canonicalPlan.non_lesson_ranges) ? canonicalPlan.non_lesson_ranges : [] },
    ],
  };
  const units = recordsToUnits(finalRecords, sourcePageCount);
  const assembledText = [JSON.stringify(manifest), ...finalRecords.map((record) => JSON.stringify(record))].join("\n") + "\n";
  const assembledBytes = new TextEncoder().encode(assembledText).byteLength;
  if (assembledBytes > MAX_ASSEMBLED_BYTES) throw new Error("assembly_payload_too_large");
  const hash = await sha256Hex(assembledText);
  const storagePath = `${doc.truong_id}/${actor.id}/${doc.id}/assembled/${Date.now()}-${hash.slice(0, 20)}-source-v2.jsonl`;
  const { error: uploadError } = await admin.storage.from(NORMALIZED_BUCKET).upload(storagePath, new Blob([assembledText], { type: "application/x-ndjson" }), { contentType: "application/x-ndjson", upsert: false });
  if (uploadError) throw new Error("assembly_storage_failed");

  const { data, error: commitError } = await admin.rpc("rpc_knowledge_import_normalized_source_service", {
    p_requested_by: actor.id,
    p_document_id: doc.id,
    p_grade: Number(plan.grade),
    p_source_role: "KNOWLEDGE_SOURCE",
    p_manifest: manifest,
    p_units: units,
    p_normalized_storage_path: storagePath,
    p_payload_sha256: hash,
    p_ai_provider: "CHUNKED_WEB_AI",
    p_ai_model: cleanString(body.ai_model, 240) || cleanString(plan.ai_model, 240) || null,
  });
  if (commitError || !data || data.status !== "success") {
    await admin.storage.from(NORMALIZED_BUCKET).remove([storagePath]);
    throw new Error(commitError?.message || data?.code || "assembly_commit_failed");
  }
  await admin.from("knowledge_normalization_plans").update({ plan_status: "ASSEMBLED", assembled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", plan.id);
  return json(req, 200, {
    status: "success",
    action: "assemble_chunks",
    plan_id: plan.id,
    document_id: doc.id,
    lesson_count: lessons.length,
    lesson_chunk_count: lessonChunks.length,
    unit_count: data.unit_count,
    revision: data.revision,
    active_revision: data.active_revision,
    quality_status: data.quality_status,
    uncertain_page_count: data.uncertain_page_count,
    processed_pages_count: accountedPages.size,
    payload_sha256: hash,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { status: "error", code: "method_not_allowed", message: "Chỉ hỗ trợ POST." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, 500, { status: "error", code: "server_not_configured", message: "Dịch vụ chunked normalization chưa được cấu hình." });
  let body: JsonObject;
  try { body = asObject(await req.json()); } catch { return json(req, 400, { status: "error", code: "body_invalid", message: "Dữ liệu yêu cầu không hợp lệ." }); }
  const action = cleanString(body.action, 80).toLowerCase();
  try {
    if (action === "prepare_structure_prompt") return await prepareStructure(req, body);
    if (action === "import_structure_plan") return await importPlan(req, body);
    if (action === "read_plan") return await readPlan(req, body);
    if (action === "prepare_chunk_prompt") return await prepareChunk(req, body);
    if (action === "import_chunk_jsonl") return await importChunk(req, body);
    if (action === "assemble_chunks") return await assemble(req, body);
    return json(req, 400, { status: "error", code: "action_invalid", message: "Thao tác không hợp lệ." });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_error";
    const status = code === "staff_session_invalid" || code === "staff_identity_mismatch" ? 401
      : code.includes("unavailable") ? 404
      : code.includes("storage") || code.includes("commit") || code.includes("not_editable") || code.includes("not_assemblable") ? 409
      : code.startsWith("plan_") || code.startsWith("chunk_") || code.startsWith("assembly_") || code.endsWith("_invalid") || code.endsWith("_mismatch") || code.endsWith("_required") ? 400
      : 500;
    if (status >= 500) console.error("knowledge-chunked-normalization error", error);
    return json(req, status, { status: "error", code, message: "Không thể xử lý chuẩn hóa theo chunk.", detail: status < 500 ? code : undefined });
  }
});
