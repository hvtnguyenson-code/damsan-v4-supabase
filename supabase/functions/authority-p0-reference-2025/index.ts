import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PROFILE_ID = "DIA_LI_TNTHPT_2025_PLUS_V1";
const AUTHORITY_CODE = "BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY";
const SOURCE_ROLE = "ASSESSMENT_BENCHMARK";
const SOURCE_PAGE_URL = "https://vqa.moet.gov.vn/vi/news/tin-tuc-su-kien/de-thi-tham-khao-ky-thi-tot-nghiep-thpt-tu-nam-2025-159.html";
const DRIVE_FILE_ID = "1F_UfWJSW04Y52Wq90YANGvHjmu9bZHBb";
const DRIVE_ARTIFACT_URL = `https://drive.google.com/file/d/${DRIVE_FILE_ID}/view`;
const DRIVE_DOWNLOAD_URL = `https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}`;
const ORIGINAL_FILENAME = "07_DiaLi.pdf";
const TITLE = "Đề tham khảo chính thức môn Địa lí - Kỳ thi tốt nghiệp THPT từ năm 2025";
const PAGE_COUNT = 5;
const KNOWLEDGE_BUCKET = "knowledge-source";
const NORMALIZED_BUCKET = "knowledge-normalized";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;

function response(status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(text: string) {
  return sha256Bytes(new TextEncoder().encode(text));
}

function benchmarkRecords() {
  return [
    {
      unit_key: "BENCH_2025_FRAME_001",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 1,
      page_start: 1,
      page_end: 4,
      section_title: "Khung đề tham khảo Địa lí 2025",
      content: {
        part: "ALL",
        stimulus_type: "MIXED",
        cognitive_action: "BLUEPRINT_CALIBRATION",
        item_writing_pattern: "Đề gồm 18 câu nhiều lựa chọn, 4 cụm Đúng/Sai và 6 câu trả lời ngắn trong 50 phút; phần đề học sinh dài 4 trang.",
        observed_features: ["P1_MCQ", "P2_TRUE_FALSE_CLUSTER", "P3_NUMERIC_SHORT_ANSWER", "CHART", "TABLE"],
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P1_SHORT_002",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 2,
      page_start: 1,
      page_end: 2,
      section_title: "Phần I - stem ngắn, phương án đồng dạng",
      content: {
        part: "1",
        stimulus_type: "NONE",
        cognitive_action: "IDENTIFY_OR_EXPLAIN",
        item_writing_pattern: "Stem thường ngắn; bốn phương án cùng phạm trù và cùng kiểu ngữ pháp; không cần ngữ liệu dài cho câu nhận biết.",
        distractor_pattern: "HOMOGENEOUS_NEAR_DOMAIN",
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P1_CHART_003",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 3,
      page_start: 2,
      page_end: 2,
      section_title: "Phần I - khai thác biểu đồ",
      content: {
        part: "1",
        stimulus_type: "CHART",
        cognitive_action: "READ_COMPARE_STRUCTURE_CHANGE",
        item_writing_pattern: "Một câu Phần I dùng trực tiếp biểu đồ cơ cấu nhiều năm; học sinh phải đọc tỉ trọng và biến động để chọn nhận xét đúng.",
        visual_family: "100_PERCENT_STACKED_CHART",
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P1_REASON_004",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 4,
      page_start: 2,
      page_end: 2,
      section_title: "Phần I - giải thích và vận dụng",
      content: {
        part: "1",
        stimulus_type: "TEXT_SHORT",
        cognitive_action: "CAUSE_EFFECT_OR_APPLICATION",
        item_writing_pattern: "Các câu cuối Phần I chuyển dần từ nhận biết sang giải thích nguyên nhân, thế mạnh và lựa chọn định hướng phù hợp.",
        distractor_pattern: "RELATED_BUT_WRONG_CONDITION",
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P2_TEXT_005",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 5,
      page_start: 2,
      page_end: 3,
      section_title: "Phần II - stimulus văn bản chung",
      content: {
        part: "2",
        stimulus_type: "TEXT",
        cognitive_action: "MIXED_DIRECT_INFERENCE_APPLICATION",
        item_writing_pattern: "Một đoạn thông tin chung làm căn cứ cho bốn nhận định; các nhận định phối hợp đọc trực tiếp, giải thích và vận dụng.",
        cluster_size: 4,
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P2_CHART_006",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 6,
      page_start: 3,
      page_end: 4,
      section_title: "Phần II - stimulus biểu đồ",
      content: {
        part: "2",
        stimulus_type: "CHART",
        cognitive_action: "COMPARE_TREND_DERIVE",
        item_writing_pattern: "Một cụm Đúng/Sai sử dụng biểu đồ cột theo chuỗi năm; nhận định khai thác giá trị, xu hướng, cán cân/chênh lệch và tốc độ biến động.",
        visual_family: "GROUPED_COLUMN_CHART",
        cluster_size: 4,
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P3_SERIES_AVG_007",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 7,
      page_start: 4,
      page_end: 4,
      section_title: "Phần III - chuỗi tháng và giá trị trung bình",
      content: {
        part: "3",
        stimulus_type: "TABLE",
        cognitive_action: "CALCULATE_GEO_INDICATOR",
        data_form: "MONTHLY_SERIES",
        operation_family: "AVERAGE",
        item_writing_pattern: "Cung cấp đủ chuỗi số liệu theo tháng trong bảng; yêu cầu tính chỉ tiêu tổng hợp và làm tròn rõ ràng.",
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P3_RANGE_COMPARE_008",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 8,
      page_start: 4,
      page_end: 4,
      section_title: "Phần III - so sánh hai biên độ",
      content: {
        part: "3",
        stimulus_type: "TABLE",
        cognitive_action: "DERIVE_THEN_COMPARE",
        data_form: "MULTI_ENTITY_EXTREMES",
        operation_family: "RANGE_DIFFERENCE",
        item_writing_pattern: "Tính biên độ cho hai đối tượng từ cực trị rồi lấy chênh lệch; dữ liệu thô xuất hiện đầy đủ trong bảng.",
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P3_RATE_009",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 9,
      page_start: 4,
      page_end: 4,
      section_title: "Phần III - chỉ tiêu dân số",
      content: {
        part: "3",
        stimulus_type: "TEXT_NUMERIC",
        cognitive_action: "CALCULATE_RATE",
        data_form: "DIRECT_RELATION",
        operation_family: "RATE_DIFFERENCE",
        item_writing_pattern: "Câu ngắn cung cấp hai tỉ suất và yêu cầu suy ra chỉ tiêu dân số, kèm quy tắc làm tròn.",
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P3_SHARE_010",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 10,
      page_start: 4,
      page_end: 4,
      section_title: "Phần III - tính tỉ trọng",
      content: {
        part: "3",
        stimulus_type: "TEXT_NUMERIC",
        cognitive_action: "CALCULATE_SHARE",
        data_form: "DIRECT_RELATION",
        operation_family: "SHARE_PERCENT",
        item_writing_pattern: "Từ tổng và thành phần, tính tỉ trọng phần trăm; đơn vị và độ chính xác được nêu trong lệnh.",
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P3_PER_CAPITA_011",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 11,
      page_start: 4,
      page_end: 4,
      section_title: "Phần III - bình quân đầu người",
      content: {
        part: "3",
        stimulus_type: "TEXT_NUMERIC",
        cognitive_action: "CALCULATE_PER_CAPITA",
        data_form: "DIRECT_RELATION",
        operation_family: "PER_CAPITA",
        item_writing_pattern: "Kết hợp một đại lượng tổng với quy mô dân số để tính bình quân đầu người và xử lí bậc đơn vị.",
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_P3_SHARE_CHANGE_012",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 12,
      page_start: 4,
      page_end: 4,
      section_title: "Phần III - biến động tỉ trọng qua thời gian",
      content: {
        part: "3",
        stimulus_type: "TABLE",
        cognitive_action: "DERIVE_TWO_SHARES_COMPARE",
        data_form: "TWO_PERIOD_COMPONENT_TOTAL",
        operation_family: "SHARE_CHANGE",
        item_writing_pattern: "Từ bảng hai thời điểm, tính tỉ trọng ở từng năm rồi so sánh mức tăng/giảm; không cho sẵn chỉ tiêu dẫn xuất.",
        reuse_policy: "STYLE_ONLY_NO_COPY"
      },
    },
    {
      unit_key: "BENCH_2025_SCORING_013",
      unit_type: "BENCHMARK_PATTERN",
      ordinal_no: 13,
      page_start: 5,
      page_end: 5,
      section_title: "Đáp án và scoring",
      content: {
        part: "ALL",
        stimulus_type: "ANSWER_KEY",
        cognitive_action: "SCORING_CALIBRATION",
        item_writing_pattern: "Trang đáp án xác nhận P1 chấm 0,25 điểm/câu; P2 chấm theo số ý đúng 0,1/0,25/0,5/1,0; P3 chấm 0,25 điểm/câu.",
        reuse_policy: "STRUCTURE_ONLY"
      },
    }
  ].map((item, index) => ({
    ...item,
    hierarchy: { path: ["Đề tham khảo chính thức Địa lí 2025", item.section_title] },
    lesson_code: null,
    lesson_title: null,
    provenance: {
      source: "DAMSAN_SOURCE_V2",
      authority_code: AUTHORITY_CODE,
      source_page_url: SOURCE_PAGE_URL,
      artifact_url: DRIVE_ARTIFACT_URL,
      physical_pdf_pages: [item.page_start, item.page_end],
      normalization_mode: "P0_098_VISUAL_PATTERN_REVIEW"
    },
    confidence: 1,
    is_usable: true,
  }));
}

async function loadScope() {
  const { data: school, error: schoolError } = await admin
    .from("truong_hoc")
    .select("id")
    .eq("ma_truong", "DAMSAN")
    .maybeSingle();
  if (schoolError || !school?.id) throw new Error("damsan_school_unavailable");

  const { data: subject, error: subjectError } = await admin
    .from("mon_hoc")
    .select("id,ten_mon")
    .in("ten_mon", ["Địa lí", "Địa lý"])
    .limit(1)
    .maybeSingle();
  if (subjectError || !subject?.id) throw new Error("geography_subject_unavailable");

  const { data: actor, error: actorError } = await admin
    .from("giao_vien")
    .select("id")
    .eq("truong_id", school.id)
    .eq("quyen", "Admin")
    .limit(1)
    .maybeSingle();
  if (actorError || !actor?.id) throw new Error("damsan_admin_unavailable");

  return { schoolId: school.id, subjectId: subject.id, actorId: actor.id, subjectName: subject.ten_mon };
}

async function alreadySeeded() {
  const { data, error } = await admin
    .from("knowledge_documents")
    .select("id,active_revision,pipeline_status,quality_status,normalization_schema")
    .eq("authority_profile_id", PROFILE_ID)
    .eq("authority_code", AUTHORITY_CODE)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { count } = await admin
    .from("knowledge_units")
    .select("id", { count: "exact", head: true })
    .eq("document_id", data.id)
    .eq("revision", data.active_revision ?? -1)
    .eq("unit_type", "BENCHMARK_PATTERN")
    .eq("is_usable", true);

  const verified =
    data.active_revision != null &&
    data.pipeline_status === "READY" &&
    data.quality_status === "AUTO_ACCEPTED" &&
    data.normalization_schema === "DAMSAN_SOURCE_V2" &&
    Number(count || 0) > 0;

  if (!verified) throw new Error("authority_slot_has_unverified_document");
  return { documentId: data.id, unitCount: Number(count || 0) };
}

async function fetchOfficialPdf() {
  const result = await fetch(DRIVE_DOWNLOAD_URL, { redirect: "follow" });
  if (!result.ok) throw new Error(`official_pdf_download_failed_${result.status}`);
  const bytes = new Uint8Array(await result.arrayBuffer());
  if (bytes.length < 100000 || bytes.length > 10 * 1024 * 1024) throw new Error("official_pdf_size_invalid");
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") throw new Error("official_pdf_signature_invalid");
  return bytes;
}

async function seed() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("server_not_configured");

  const existing = await alreadySeeded();
  if (existing) return { status: "success", action: "already_seeded", ...existing };

  const scope = await loadScope();
  const pdfBytes = await fetchOfficialPdf();
  const pdfSha = await sha256Bytes(pdfBytes);
  const storagePath = `${scope.schoolId}/authority/${PROFILE_ID}/${AUTHORITY_CODE}/${pdfSha}.pdf`;

  const { error: sourceUploadError } = await admin.storage
    .from(KNOWLEDGE_BUCKET)
    .upload(storagePath, new Blob([pdfBytes], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (sourceUploadError) throw new Error(`source_storage_failed:${sourceUploadError.message}`);

  const manifest = {
    record_type: "manifest",
    schema_version: "DAMSAN_SOURCE_V2",
    source_role: SOURCE_ROLE,
    subject_name: scope.subjectName,
    grade: 12,
    title: TITLE,
    document_type: "SUPPLEMENTARY",
    curriculum_code: "GDPT_2018",
    book_series: null,
    authority_code: AUTHORITY_CODE,
    assessment_profile_ids: [PROFILE_ID],
    coverage: {
      source_page_count: PAGE_COUNT,
      processed_pages_count: PAGE_COUNT,
      missing_pages: [],
      uncertain_pages: [],
    },
    source_locator: {
      publisher: "Bộ Giáo dục và Đào tạo / Cục Quản lý chất lượng",
      source_page_url: SOURCE_PAGE_URL,
      artifact_url: DRIVE_ARTIFACT_URL,
      artifact_file_id: DRIVE_FILE_ID,
      original_filename: ORIGINAL_FILENAME,
      sha256: pdfSha,
    },
    normalization_policy: "BENCHMARK_FINGERPRINT_STYLE_ONLY_NO_COPY",
    notes: [
      "P0-098: reviewed all 4 exam pages plus the appended answer page.",
      "No question stem, option text or answer is stored as reusable content; only design fingerprints are retained."
    ],
  };

  const records = benchmarkRecords();
  const jsonl = [manifest, ...records.map((unit) => ({
    record_type: "benchmark_pattern",
    unit_key: unit.unit_key,
    title: unit.section_title,
    page_start: unit.page_start,
    page_end: unit.page_end,
    content: unit.content,
    confidence: unit.confidence,
  }))].map((item) => JSON.stringify(item)).join("\n");
  const payloadSha = await sha256Text(jsonl);
  const normalizedPath = `${scope.schoolId}/authority/${PROFILE_ID}/${AUTHORITY_CODE}/${payloadSha}.jsonl`;

  const { error: normalizedUploadError } = await admin.storage
    .from(NORMALIZED_BUCKET)
    .upload(normalizedPath, new Blob([jsonl], { type: "application/x-ndjson" }), {
      contentType: "application/x-ndjson",
      upsert: true,
    });
  if (normalizedUploadError) {
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
    throw new Error(`normalized_storage_failed:${normalizedUploadError.message}`);
  }

  const { data: document, error: documentError } = await admin
    .from("knowledge_documents")
    .insert({
      truong_id: scope.schoolId,
      owner_gv_id: scope.actorId,
      mon_id: scope.subjectId,
      grade: 12,
      title: TITLE,
      original_filename: ORIGINAL_FILENAME,
      mime_type: "application/pdf",
      source_format: "PDF",
      storage_bucket: KNOWLEDGE_BUCKET,
      storage_path: storagePath,
      file_size_bytes: pdfBytes.length,
      sha256: pdfSha,
      page_count: PAGE_COUNT,
      document_type: "SUPPLEMENTARY",
      context_hint: {
        authority_seed: "P0_098",
        source_page_url: SOURCE_PAGE_URL,
        artifact_url: DRIVE_ARTIFACT_URL,
      },
      analysis_manifest: {
        authority_seed: "P0_098",
        review_mode: "FULL_VISUAL_5_PAGES",
      },
      pipeline_status: "EXTRACTED",
      quality_status: "UNASSESSED",
      analysis_revision: 0,
      extraction_manifest: {
        source: "OFFICIAL_PUBLIC_ARTIFACT",
        source_page_url: SOURCE_PAGE_URL,
        artifact_url: DRIVE_ARTIFACT_URL,
        page_count: PAGE_COUNT,
        sha256: pdfSha,
      },
      book_index: {},
      semantic_coverage: ["ASSESSMENT_BENCHMARK", "P1", "P2", "P3", "CHART", "TABLE"],
      source_role: SOURCE_ROLE,
      curriculum_code: "GDPT_2018",
      authority_profile_id: PROFILE_ID,
      authority_code: AUTHORITY_CODE,
    })
    .select("id")
    .single();

  if (documentError || !document?.id) {
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
    await admin.storage.from(NORMALIZED_BUCKET).remove([normalizedPath]);
    throw new Error(`document_create_failed:${documentError?.message || "unknown"}`);
  }

  const { data: imported, error: importError } = await admin.rpc(
    "rpc_knowledge_import_normalized_source_service",
    {
      p_requested_by: scope.actorId,
      p_document_id: document.id,
      p_grade: 12,
      p_source_role: SOURCE_ROLE,
      p_manifest: manifest,
      p_units: records,
      p_normalized_storage_path: normalizedPath,
      p_payload_sha256: payloadSha,
      p_ai_provider: "SYSTEM_P0_AUTHORITY",
      p_ai_model: "VISUAL_PATTERN_REVIEW_098",
    }
  );

  if (importError || !imported || imported.status !== "success") {
    await admin.from("knowledge_documents").delete().eq("id", document.id);
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
    await admin.storage.from(NORMALIZED_BUCKET).remove([normalizedPath]);
    throw new Error(`normalized_import_failed:${importError?.message || imported?.code || "unknown"}`);
  }

  return {
    status: "success",
    action: "seeded",
    document_id: document.id,
    revision: imported.revision,
    active_revision: imported.active_revision,
    quality_status: imported.quality_status,
    unit_count: imported.unit_count,
    pdf_sha256: pdfSha,
    payload_sha256: payloadSha,
  };
}

Deno.serve(async (req: Request) => {
  if (!["GET", "POST"].includes(req.method)) return response(405, { status: "error", code: "method_not_allowed" });
  try {
    return response(200, await seed());
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    console.error("authority-p0-reference-2025 seed failed", error);
    return response(500, { status: "error", code: message });
  }
});
