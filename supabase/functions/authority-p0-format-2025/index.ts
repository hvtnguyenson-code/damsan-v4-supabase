import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PROFILE_ID = "DIA_LI_TNTHPT_2025_PLUS_V1";
const AUTHORITY_CODE = "BGDDT_FORMAT_RULE_2025";
const SOURCE_ROLE = "ASSESSMENT_RULE";
const SOURCE_URL = "https://vqa.moet.gov.vn/vi/news/thong-bao/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-74.html";
const ORIGINAL_FILENAME = "cau-truc-dinh-dang-de-thi-tu-2025.html";
const TITLE = "Cấu trúc định dạng đề thi tốt nghiệp THPT từ năm 2025";
const KNOWLEDGE_BUCKET = "knowledge-source";
const NORMALIZED_BUCKET = "knowledge-normalized";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type JsonObject = Record<string, unknown>;

function out(status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},
  });
}

async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2,"0")).join("");
}

async function sha256Text(text: string) {
  return sha256Bytes(new TextEncoder().encode(text));
}

async function scope() {
  const {data: school,error: schoolError}=await admin.from("truong_hoc").select("id").eq("ma_truong","DAMSAN").maybeSingle();
  if(schoolError||!school?.id) throw new Error("damsan_school_unavailable");

  const {data: subject,error: subjectError}=await admin.from("mon_hoc").select("id,ten_mon").in("ten_mon",["Địa lí","Địa lý"]).limit(1).maybeSingle();
  if(subjectError||!subject?.id) throw new Error("geography_subject_unavailable");

  const {data: actor,error: actorError}=await admin.from("giao_vien").select("id").eq("truong_id",school.id).eq("quyen","Admin").limit(1).maybeSingle();
  if(actorError||!actor?.id) throw new Error("damsan_admin_unavailable");

  return {schoolId:school.id,subjectId:subject.id,actorId:actor.id,subjectName:subject.ten_mon};
}

async function alreadySeeded() {
  const {data,error}=await admin.from("knowledge_documents")
    .select("id,active_revision,pipeline_status,quality_status,normalization_schema")
    .eq("authority_profile_id",PROFILE_ID)
    .eq("authority_code",AUTHORITY_CODE)
    .maybeSingle();
  if(error) throw error;
  if(!data) return null;

  const {count}=await admin.from("knowledge_units")
    .select("id",{count:"exact",head:true})
    .eq("document_id",data.id)
    .eq("revision",data.active_revision ?? -1)
    .eq("unit_type","ASSESSMENT_RULE")
    .eq("is_usable",true);

  const verified=data.active_revision!=null
    && data.pipeline_status==="READY"
    && data.quality_status==="AUTO_ACCEPTED"
    && data.normalization_schema==="DAMSAN_SOURCE_V2"
    && Number(count||0)>0;

  if(!verified) throw new Error("authority_slot_has_unverified_document");
  return {documentId:data.id,unitCount:Number(count||0)};
}

async function fetchOfficialHtml() {
  const res=await fetch(SOURCE_URL,{
    redirect:"follow",
    headers:{"User-Agent":"Mozilla/5.0 DamSanAuthorityCapture/099","Accept":"text/html,application/xhtml+xml"},
  });
  if(!res.ok) throw new Error(`official_html_download_failed_${res.status}`);
  const text=await res.text();
  if(text.length<5000 || text.length>2*1024*1024) throw new Error("official_html_size_invalid");
  for(const marker of [
    "Cấu trúc định dạng đề thi tốt nghiệp THPT từ năm 2025",
    "3 dạng thức câu hỏi thi trắc nghiệm",
    "50 phút",
    "40"
  ]) {
    if(!text.includes(marker)) throw new Error("official_html_marker_missing");
  }
  return text;
}

function rules() {
  const base={hierarchy:{path:[TITLE]},lesson_code:null,lesson_title:null,confidence:1,is_usable:true};
  return [
    {
      ...base,unit_key:"RULE_FORMAT_2025_001",unit_type:"ASSESSMENT_RULE",ordinal_no:1,page_start:1,page_end:1,
      section_title:"Định hướng đánh giá năng lực",
      content:{
        rule_type:"ASSESSMENT_PRINCIPLE",
        description:"Cấu trúc đề từ năm 2025 được thiết kế theo định hướng đánh giá năng lực, phù hợp Chương trình GDPT 2018 và thể hiện qua bảng năng lực - cấp độ tư duy.",
        machine_rule:{competency_oriented:true,competency_cognitive_matrix_expected:true}
      }
    },
    {
      ...base,unit_key:"RULE_FORMAT_2025_002",unit_type:"ASSESSMENT_RULE",ordinal_no:2,page_start:1,page_end:1,
      section_title:"Bối cảnh có ý nghĩa",
      content:{
        rule_type:"STIMULUS_POLICY",
        description:"Câu hỏi nên gắn với bối cảnh có ý nghĩa đối với đời sống, thực tiễn hoặc khoa học.",
        machine_rule:{meaningful_context_preferred:true}
      }
    },
    {
      ...base,unit_key:"RULE_FORMAT_2025_003",unit_type:"ASSESSMENT_RULE",ordinal_no:3,page_start:1,page_end:1,
      section_title:"Ba dạng thức trắc nghiệm",
      content:{
        rule_type:"ITEM_FORMAT",
        description:"Các môn trắc nghiệm ngoài Ngoại ngữ có thể dùng ba dạng: nhiều lựa chọn, Đúng/Sai và trả lời ngắn.",
        machine_rule:{allowed_formats:["MCQ_SINGLE","TRUE_FALSE_CLUSTER","SHORT_ANSWER"]}
      }
    },
    {
      ...base,unit_key:"RULE_FORMAT_2025_004",unit_type:"ASSESSMENT_RULE",ordinal_no:4,page_start:1,page_end:1,
      section_title:"Đúng/Sai bốn ý",
      content:{
        rule_type:"TRUE_FALSE_FORMAT",
        description:"Mỗi câu Đúng/Sai có bốn ý và thí sinh trả lời Đúng/Sai cho từng ý.",
        machine_rule:{statement_count:4,answer_type:"BOOLEAN_PER_STATEMENT"}
      }
    },
    {
      ...base,unit_key:"RULE_FORMAT_2025_005",unit_type:"ASSESSMENT_RULE",ordinal_no:5,page_start:1,page_end:1,
      section_title:"Trả lời ngắn",
      content:{
        rule_type:"SHORT_ANSWER_FORMAT",
        description:"Trả lời ngắn yêu cầu thí sinh tự điền kết quả cuối cùng thay vì chọn phương án.",
        machine_rule:{response_mode:"FINAL_RESULT_ENTRY"}
      }
    },
    {
      ...base,unit_key:"RULE_FORMAT_2025_006",unit_type:"ASSESSMENT_RULE",ordinal_no:6,page_start:1,page_end:1,
      section_title:"Thời gian thi",
      content:{
        rule_type:"TIME_LIMIT",
        description:"Các môn trắc nghiệm ngoài Toán và Ngoại ngữ có thời gian làm bài 50 phút; Địa lí thuộc nhóm này.",
        machine_rule:{minutes:50}
      }
    },
    {
      ...base,unit_key:"RULE_FORMAT_2025_007",unit_type:"ASSESSMENT_RULE",ordinal_no:7,page_start:1,page_end:1,
      section_title:"Số lượng lệnh hỏi",
      content:{
        rule_type:"QUESTION_COMMAND_COUNT",
        description:"Nhóm các môn học khác trong cấu trúc minh họa có 40 câu hỏi/lệnh hỏi.",
        machine_rule:{question_commands:40}
      }
    },
    {
      ...base,unit_key:"RULE_FORMAT_2025_008",unit_type:"ASSESSMENT_RULE",ordinal_no:8,page_start:1,page_end:1,
      section_title:"Điều chỉnh khi xây dựng đề chính thức",
      content:{
        rule_type:"AUTHORITY_CAVEAT",
        description:"Số câu/lệnh hỏi và vấn đề liên quan có thể được điều chỉnh khi xây dựng đề thi chính thức; benchmark không được ghi đè quy định mới hơn.",
        machine_rule:{later_official_rule_overrides:true}
      }
    }
  ].map(x=>({
    ...x,
    provenance:{
      source:"DAMSAN_SOURCE_V2",
      authority_code:AUTHORITY_CODE,
      source_url:SOURCE_URL,
      capture_mode:"OFFICIAL_HTML_CAPTURE",
      physical_pdf_pages:[],
    }
  }));
}

async function seed() {
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY) throw new Error("server_not_configured");
  const existing=await alreadySeeded();
  if(existing) return {status:"success",action:"already_seeded",...existing};

  const s=await scope();
  const html=await fetchOfficialHtml();
  const htmlBytes=new TextEncoder().encode(html);
  const sourceSha=await sha256Bytes(htmlBytes);
  const sourcePath=`${s.schoolId}/authority/${PROFILE_ID}/${AUTHORITY_CODE}/${sourceSha}.html`;

  const {error:sourceError}=await admin.storage.from(KNOWLEDGE_BUCKET).upload(
    sourcePath,new Blob([html],{type:"text/html; charset=utf-8"}),{contentType:"text/html; charset=utf-8",upsert:true}
  );
  if(sourceError) throw new Error(`source_storage_failed:${sourceError.message}`);

  const manifest={
    record_type:"manifest",
    schema_version:"DAMSAN_SOURCE_V2",
    source_role:SOURCE_ROLE,
    subject_name:s.subjectName,
    grade:12,
    title:TITLE,
    document_type:"ASSESSMENT_FRAMEWORK",
    curriculum_code:"GDPT_2018",
    book_series:null,
    authority_code:AUTHORITY_CODE,
    assessment_profile_ids:[PROFILE_ID],
    coverage:{source_page_count:1,processed_pages_count:1,missing_pages:[],uncertain_pages:[]},
    source_locator:{publisher:"Cục Quản lý chất lượng - Bộ Giáo dục và Đào tạo",source_url:SOURCE_URL,sha256:sourceSha},
    normalization_policy:"OFFICIAL_RULE_MACHINE_EXTRACTION_099",
    notes:["Captured from the official Cục QLCL HTML page; no third-party mirror is used."]
  };

  const units=rules();
  const jsonl=[manifest,...units.map(u=>({
    record_type:"assessment_rule",unit_key:u.unit_key,title:u.section_title,rule_type:(u.content as JsonObject).rule_type,
    page_start:1,page_end:1,content:u.content,confidence:1
  }))].map(x=>JSON.stringify(x)).join("\n");
  const payloadSha=await sha256Text(jsonl);
  const normalizedPath=`${s.schoolId}/authority/${PROFILE_ID}/${AUTHORITY_CODE}/${payloadSha}.jsonl`;

  const {error:normError}=await admin.storage.from(NORMALIZED_BUCKET).upload(
    normalizedPath,new Blob([jsonl],{type:"application/x-ndjson"}),{contentType:"application/x-ndjson",upsert:true}
  );
  if(normError){
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([sourcePath]);
    throw new Error(`normalized_storage_failed:${normError.message}`);
  }

  const extractionManifest={
    schema_version:"DAMSAN_EXTRACT_V1",
    page_count:1,
    extracted_chars:html.length,
    boundary_mode:"HTML_DOCUMENT",
    ocr_unresolved_pages:[],
    source_text_available:true,
    source_url:SOURCE_URL,
    sha256:sourceSha
  };

  const {data:doc,error:docError}=await admin.from("knowledge_documents").insert({
    truong_id:s.schoolId,owner_gv_id:s.actorId,mon_id:s.subjectId,grade:12,title:TITLE,
    original_filename:ORIGINAL_FILENAME,mime_type:"text/html",source_format:"HTML",
    storage_bucket:KNOWLEDGE_BUCKET,storage_path:sourcePath,file_size_bytes:htmlBytes.length,sha256:sourceSha,page_count:1,
    document_type:"ASSESSMENT_FRAMEWORK",context_hint:{authority_seed:"P0_099",source_url:SOURCE_URL},
    analysis_manifest:{authority_seed:"P0_099",capture_mode:"OFFICIAL_HTML_CAPTURE"},
    pipeline_status:"EXTRACTED",quality_status:"UNASSESSED",analysis_revision:0,
    extraction_manifest:extractionManifest,book_index:{},semantic_coverage:["ASSESSMENT_RULE","FORMAT","COMPETENCY","ITEM_FORMAT"],
    source_role:SOURCE_ROLE,curriculum_code:"GDPT_2018",authority_profile_id:PROFILE_ID,authority_code:AUTHORITY_CODE
  }).select("id").single();

  if(docError||!doc?.id){
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([sourcePath]);
    await admin.storage.from(NORMALIZED_BUCKET).remove([normalizedPath]);
    throw new Error(`document_create_failed:${docError?.message||"unknown"}`);
  }

  const {data:imported,error:importError}=await admin.rpc("rpc_knowledge_import_normalized_source_service",{
    p_requested_by:s.actorId,p_document_id:doc.id,p_grade:12,p_source_role:SOURCE_ROLE,p_manifest:manifest,p_units:units,
    p_normalized_storage_path:normalizedPath,p_payload_sha256:payloadSha,p_ai_provider:"SYSTEM_P0_AUTHORITY",p_ai_model:"OFFICIAL_HTML_RULE_CAPTURE_099"
  });

  if(importError||!imported||imported.status!=="success"){
    await admin.from("knowledge_documents").delete().eq("id",doc.id);
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([sourcePath]);
    await admin.storage.from(NORMALIZED_BUCKET).remove([normalizedPath]);
    throw new Error(`normalized_import_failed:${importError?.message||imported?.code||"unknown"}`);
  }

  return {status:"success",action:"seeded",document_id:doc.id,revision:imported.revision,active_revision:imported.active_revision,
    quality_status:imported.quality_status,unit_count:imported.unit_count,source_sha256:sourceSha,payload_sha256:payloadSha};
}

Deno.serve(async(req:Request)=>{
  if(!["GET","POST"].includes(req.method)) return out(405,{status:"error",code:"method_not_allowed"});
  try{return out(200,await seed());}
  catch(error){
    const message=error instanceof Error?error.message:"unexpected_error";
    console.error("authority-p0-format-2025 seed failed",error);
    return out(500,{status:"error",code:message});
  }
});
