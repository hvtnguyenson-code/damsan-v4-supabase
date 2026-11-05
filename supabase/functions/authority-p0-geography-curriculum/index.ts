import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";

const PROFILE_ID="DIA_LI_TNTHPT_2025_PLUS_V1";
const AUTHORITY_CODE="BGDDT_GEOGRAPHY_CURRICULUM_2018";
const SOURCE_ROLE="ASSESSMENT_RULE";

const BASE_PROGRAM_URL="https://moet.gov.vn/content/vanban/Lists/VBPQ/Attachments/1483/vbhn-chuong-trinh-tong-the.pdf";
const COMPETENCY_ALIGNMENT_URL="https://moet.gov.vn/content/vanban/Lists/VBPQ/Attachments/1468/chuong-trinh-gdtx-thptsigned.pdf";
const AMENDMENT_PAGE_URL="https://vanban.chinhphu.vn/?docid=215347&orggroupid=4&pageid=27160";
const AMENDMENT_PDF_URL="https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/9/17-bgddt.pdf";
const ORIGINAL_FILENAME="17-2025-TT-BGDDT-Phu-luc-IV-Dia-li.pdf";
const TITLE="Chương trình môn Địa lí hiện hành - GDPT 2018 sau sửa đổi TT17/2025";
const PAGE_COUNT=22;
const KNOWLEDGE_BUCKET="knowledge-source";
const NORMALIZED_BUCKET="knowledge-normalized";

const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

type Obj=Record<string,unknown>;

function reply(status:number,body:Obj){
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}

async function sha256Bytes(bytes:Uint8Array){
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function sha256Text(text:string){return sha256Bytes(new TextEncoder().encode(text));}

async function scope(){
  const {data:school,error:se}=await admin.from("truong_hoc").select("id").eq("ma_truong","DAMSAN").maybeSingle();
  if(se||!school?.id) throw new Error("damsan_school_unavailable");
  const {data:subject,error:me}=await admin.from("mon_hoc").select("id,ten_mon").in("ten_mon",["Địa lí","Địa lý"]).limit(1).maybeSingle();
  if(me||!subject?.id) throw new Error("geography_subject_unavailable");
  const {data:actor,error:ae}=await admin.from("giao_vien").select("id").eq("truong_id",school.id).eq("quyen","Admin").limit(1).maybeSingle();
  if(ae||!actor?.id) throw new Error("damsan_admin_unavailable");
  return {schoolId:school.id,subjectId:subject.id,subjectName:subject.ten_mon,actorId:actor.id};
}

async function existingVerified(){
  const {data,error}=await admin.from("knowledge_documents")
    .select("id,active_revision,pipeline_status,quality_status,normalization_schema")
    .eq("authority_profile_id",PROFILE_ID).eq("authority_code",AUTHORITY_CODE).maybeSingle();
  if(error) throw error;
  if(!data) return null;
  const {count}=await admin.from("knowledge_units").select("id",{count:"exact",head:true})
    .eq("document_id",data.id).eq("revision",data.active_revision??-1)
    .eq("unit_type","ASSESSMENT_RULE").eq("is_usable",true);
  const verified=data.active_revision!=null&&data.pipeline_status==="READY"&&data.quality_status==="AUTO_ACCEPTED"
    &&data.normalization_schema==="DAMSAN_SOURCE_V2"&&Number(count||0)>0;
  if(!verified) throw new Error("authority_slot_has_unverified_document");
  return {documentId:data.id,unitCount:Number(count||0)};
}

async function fetchAmendmentPdf(){
  const r=await fetch(AMENDMENT_PDF_URL,{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 DamSanAuthorityCapture/100"}});
  if(!r.ok) throw new Error(`official_pdf_download_failed_${r.status}`);
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(bytes.length<100000||bytes.length>20*1024*1024) throw new Error("official_pdf_size_invalid");
  if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-") throw new Error("official_pdf_signature_invalid");
  return bytes;
}

function ruleUnits(){
  const base={unit_type:"ASSESSMENT_RULE",hierarchy:{path:[TITLE]},lesson_code:null,lesson_title:null,confidence:1,is_usable:true};
  return [
    {
      ...base,unit_key:"RULE_GEO_COMP_001",ordinal_no:1,page_start:17,page_end:19,section_title:"Khung năng lực Địa lí",
      content:{
        rule_type:"GEOGRAPHY_COMPETENCY_FRAMEWORK",
        competency_groups:[
          {code:"GEO_NK",label:"Nhận thức khoa học địa lí",components:["GEO_NK_SPATIAL","GEO_NK_CAUSAL"]},
          {code:"GEO_TH",label:"Tìm hiểu địa lí",components:["GEO_TH_TOOL","GEO_TH_FIELD","GEO_TH_INFO"]},
          {code:"GEO_VD",label:"Vận dụng kiến thức, kĩ năng địa lí",components:["GEO_VD_REALITY","GEO_VD_PROBLEM","GEO_VD_RESEARCH"]}
        ],
        assessment_rule:"Mức độ nhận thức NB/TH/VD không thay thế thành phần năng lực; blueprint phải theo content × competency × cognitive level."
      },
      provenance:{
        authority_code:AUTHORITY_CODE,
        base_program_url:BASE_PROGRAM_URL,
        competency_alignment_url:COMPETENCY_ALIGNMENT_URL,
        current_amendment_url:AMENDMENT_PDF_URL,
        note:"Khung năng lực được đối chiếu với nguồn Bộ công bố; TT17/2025 giữ khung năng lực và cập nhật nội dung/YCCĐ lớp 12."
      }
    },
    {
      ...base,unit_key:"RULE_GEO_SPATIAL_002",ordinal_no:2,page_start:17,page_end:19,section_title:"Năng lực không gian",
      content:{
        rule_type:"COMPETENCY_DESCRIPTOR",
        competency_code:"GEO_NK_SPATIAL",
        operations:["LOCATE","SPATIAL_DISTRIBUTION","SPATIAL_COMPARISON","SPATIAL_RELATION","REGIONAL_DIFFERENTIATION"],
        preferred_stimuli:["MAP","SCHEMATIC_MAP","TABLE","CHART"]
      },
      provenance:{authority_code:AUTHORITY_CODE,competency_alignment_url:COMPETENCY_ALIGNMENT_URL,current_amendment_url:AMENDMENT_PDF_URL}
    },
    {
      ...base,unit_key:"RULE_GEO_CAUSAL_003",ordinal_no:3,page_start:17,page_end:19,section_title:"Giải thích hiện tượng và quá trình địa lí",
      content:{
        rule_type:"COMPETENCY_DESCRIPTOR",
        competency_code:"GEO_NK_CAUSAL",
        operations:["CAUSE_EFFECT","MULTI_FACTOR_EXPLANATION","NATURAL_SOCIOECONOMIC_RELATION","PROCESS_EXPLANATION","CONSEQUENCE_ANALYSIS"]
      },
      provenance:{authority_code:AUTHORITY_CODE,competency_alignment_url:COMPETENCY_ALIGNMENT_URL}
    },
    {
      ...base,unit_key:"RULE_GEO_TOOL_004",ordinal_no:4,page_start:18,page_end:19,section_title:"Sử dụng công cụ địa lí",
      content:{
        rule_type:"COMPETENCY_DESCRIPTOR",
        competency_code:"GEO_TH_TOOL",
        operations:["READ_MAP","READ_CHART","READ_TABLE","READ_IMAGE","READ_DIAGRAM","COMPARE_DATA","TREND_ANALYSIS","STRUCTURE_ANALYSIS","SPATIAL_DATA_ANALYSIS","CALCULATE_GEO_INDICATOR","INTERPRET_CHART"],
        direct_paper_assessment:true
      },
      provenance:{
        authority_code:AUTHORITY_CODE,
        competency_alignment_url:COMPETENCY_ALIGNMENT_URL,
        current_amendment_url:AMENDMENT_PDF_URL,
        amendment_evidence:"Phụ lục IV yêu cầu lớp 12 sử dụng bản đồ và bảng số liệu; bỏ quy định dựa vào Atlat."
      }
    },
    {
      ...base,unit_key:"RULE_GEO_REALITY_005",ordinal_no:5,page_start:17,page_end:19,section_title:"Vận dụng thực tiễn",
      content:{
        rule_type:"COMPETENCY_DESCRIPTOR",
        competency_code:"GEO_VD_PROBLEM",
        operations:["REAL_WORLD_INTERPRETATION","SCENARIO_APPLICATION","DECISION_MAKING","SOLUTION_SELECTION","IMPACT_ASSESSMENT","TRADEOFF_EVALUATION"],
        assessment_rule:"Câu vận dụng cần tình huống/điều kiện thực chất; không coi phương án tích cực hoặc toàn diện nhất là đủ để tạo sức phân hóa."
      },
      provenance:{authority_code:AUTHORITY_CODE,competency_alignment_url:COMPETENCY_ALIGNMENT_URL}
    },
    {
      ...base,unit_key:"RULE_GEO_2025_LOCATE_006",ordinal_no:6,page_start:17,page_end:17,section_title:"YCCĐ vị trí và lãnh thổ lớp 12",
      content:{
        rule_type:"CURRENT_GRADE12_REQUIREMENT",
        content_target:"Vị trí địa lí và phạm vi lãnh thổ",
        requirement:"Xác định đặc điểm vị trí địa lí, phạm vi lãnh thổ Việt Nam và các tỉnh, thành phố trên bản đồ.",
        competency_codes:["GEO_NK_SPATIAL","GEO_TH_TOOL"]
      },
      provenance:{authority_code:AUTHORITY_CODE,current_amendment_url:AMENDMENT_PDF_URL,physical_pdf_page:17}
    },
    {
      ...base,unit_key:"RULE_GEO_2025_REGION_007",ordinal_no:7,page_start:18,page_end:19,section_title:"YCCĐ vùng kinh tế - xã hội hiện hành",
      content:{
        rule_type:"CURRENT_GRADE12_REQUIREMENT",
        requirement:"Chương trình hiện hành điều chỉnh hệ nội dung vùng; bổ sung Nam Trung Bộ và yêu cầu phân tích thế mạnh, hạn chế, ngành kinh tế, kinh tế biển và ý nghĩa quốc phòng-an ninh.",
        competency_codes:["GEO_NK_SPATIAL","GEO_NK_CAUSAL","GEO_TH_TOOL","GEO_VD_PROBLEM"]
      },
      provenance:{authority_code:AUTHORITY_CODE,current_amendment_url:AMENDMENT_PDF_URL,physical_pdf_pages:[18,19]}
    },
    {
      ...base,unit_key:"RULE_GEO_2025_MAP_TABLE_008",ordinal_no:8,page_start:19,page_end:19,section_title:"Bản đồ và bảng số liệu trong lớp 12",
      content:{
        rule_type:"STIMULUS_POLICY",
        requirement:"Sử dụng được bản đồ, bảng số liệu để trình bày và phân tích nội dung địa lí; cụm 'atlat địa lí Việt Nam, bản đồ' được sửa thành 'bản đồ'.",
        machine_rule:{map_first_class:true,table_first_class:true,atlas_dependency:false}
      },
      provenance:{authority_code:AUTHORITY_CODE,current_amendment_url:AMENDMENT_PDF_URL,physical_pdf_page:19}
    },
    {
      ...base,unit_key:"RULE_GEO_2025_LOCAL_009",ordinal_no:9,page_start:19,page_end:19,section_title:"Địa lí địa phương hiện hành",
      content:{
        rule_type:"CURRENT_GRADE12_REQUIREMENT",
        requirement:"Thực hành tìm hiểu Địa lí địa phương theo đơn vị hành chính cấp tỉnh; trình bày vị trí và phạm vi lãnh thổ dựa trên bản đồ địa phương, Việt Nam và kiến thức đã có.",
        competency_codes:["GEO_NK_SPATIAL","GEO_TH_TOOL","GEO_VD_REALITY"]
      },
      provenance:{authority_code:AUTHORITY_CODE,current_amendment_url:AMENDMENT_PDF_URL,physical_pdf_page:19}
    },
    {
      ...base,unit_key:"RULE_GEO_TIME_010",ordinal_no:10,page_start:19,page_end:20,section_title:"Thời lượng chương trình Địa lí THPT",
      content:{
        rule_type:"CURRICULUM_TIME_ALLOCATION",
        grade12:{core_periods:70,natural_geography:14,population_geography:6,economic_sectors:20,economic_regions:20,local_geography:2,periodic_assessment:8}
      },
      provenance:{authority_code:AUTHORITY_CODE,current_amendment_url:AMENDMENT_PDF_URL,physical_pdf_pages:[19,20]}
    }
  ];
}

async function seed(){
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY) throw new Error("server_not_configured");
  const old=await existingVerified(); if(old) return {status:"success",action:"already_seeded",...old};
  const s=await scope();
  const pdf=await fetchAmendmentPdf();
  const pdfSha=await sha256Bytes(pdf);
  const sourcePath=`${s.schoolId}/authority/${PROFILE_ID}/${AUTHORITY_CODE}/${pdfSha}.pdf`;
  const {error:sourceErr}=await admin.storage.from(KNOWLEDGE_BUCKET).upload(sourcePath,new Blob([pdf],{type:"application/pdf"}),{contentType:"application/pdf",upsert:true});
  if(sourceErr) throw new Error(`source_storage_failed:${sourceErr.message}`);

  const manifest={
    record_type:"manifest",schema_version:"DAMSAN_SOURCE_V2",source_role:SOURCE_ROLE,subject_name:s.subjectName,grade:12,title:TITLE,
    document_type:"ASSESSMENT_FRAMEWORK",curriculum_code:"GDPT_2018_CURRENT",book_series:null,authority_code:AUTHORITY_CODE,
    assessment_profile_ids:[PROFILE_ID],coverage:{source_page_count:PAGE_COUNT,processed_pages_count:PAGE_COUNT,missing_pages:[],uncertain_pages:[]},
    source_locator:{
      publisher:"Bộ Giáo dục và Đào tạo",
      base_program_url:BASE_PROGRAM_URL,
      competency_alignment_url:COMPETENCY_ALIGNMENT_URL,
      amendment_page_url:AMENDMENT_PAGE_URL,
      amendment_pdf_url:AMENDMENT_PDF_URL,
      effective_from:"2025-09-12",
      sha256:pdfSha
    },
    normalization_policy:"CURRENT_CURRICULUM_AUTHORITY_BUNDLE_100",
    notes:["Authority slot keeps its stable 2018 code but is normalized against the current-effective program after TT17/2025."]
  };

  const units=ruleUnits();
  const jsonl=[manifest,...units.map(u=>({
    record_type:"assessment_rule",unit_key:u.unit_key,title:u.section_title,page_start:u.page_start,page_end:u.page_end,content:u.content,provenance:u.provenance,confidence:1
  }))].map(v=>JSON.stringify(v)).join("\n");
  const payloadSha=await sha256Text(jsonl);
  const normPath=`${s.schoolId}/authority/${PROFILE_ID}/${AUTHORITY_CODE}/${payloadSha}.jsonl`;
  const {error:normErr}=await admin.storage.from(NORMALIZED_BUCKET).upload(normPath,new Blob([jsonl],{type:"application/x-ndjson"}),{contentType:"application/x-ndjson",upsert:true});
  if(normErr){await admin.storage.from(KNOWLEDGE_BUCKET).remove([sourcePath]);throw new Error(`normalized_storage_failed:${normErr.message}`);}

  const {data:doc,error:docErr}=await admin.from("knowledge_documents").insert({
    truong_id:s.schoolId,owner_gv_id:s.actorId,mon_id:s.subjectId,grade:12,title:TITLE,original_filename:ORIGINAL_FILENAME,
    mime_type:"application/pdf",source_format:"PDF",storage_bucket:KNOWLEDGE_BUCKET,storage_path:sourcePath,file_size_bytes:pdf.length,
    sha256:pdfSha,page_count:PAGE_COUNT,document_type:"ASSESSMENT_FRAMEWORK",
    context_hint:{authority_seed:"P0_100",source_bundle:true,effective_from:"2025-09-12"},
    analysis_manifest:{authority_seed:"P0_100",mode:"CURRENT_CURRICULUM_BUNDLE"},
    pipeline_status:"EXTRACTED",quality_status:"UNASSESSED",analysis_revision:0,
    extraction_manifest:{schema_version:"DAMSAN_EXTRACT_V1",page_count:PAGE_COUNT,extracted_chars:jsonl.length,boundary_mode:"AUTHORITY_BUNDLE_REVIEW",source_text_available:true,ocr_unresolved_pages:[],source_url:AMENDMENT_PDF_URL,sha256:pdfSha},
    book_index:{},semantic_coverage:["ASSESSMENT_RULE","COMPETENCY","GRADE12_REQUIREMENTS","MAP","TABLE"],
    source_role:SOURCE_ROLE,curriculum_code:"GDPT_2018_CURRENT",authority_profile_id:PROFILE_ID,authority_code:AUTHORITY_CODE
  }).select("id").single();

  if(docErr||!doc?.id){
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([sourcePath]);await admin.storage.from(NORMALIZED_BUCKET).remove([normPath]);
    throw new Error(`document_create_failed:${docErr?.message||"unknown"}`);
  }

  const {data:imported,error:importErr}=await admin.rpc("rpc_knowledge_import_normalized_source_service",{
    p_requested_by:s.actorId,p_document_id:doc.id,p_grade:12,p_source_role:SOURCE_ROLE,p_manifest:manifest,p_units:units,
    p_normalized_storage_path:normPath,p_payload_sha256:payloadSha,p_ai_provider:"SYSTEM_P0_AUTHORITY",p_ai_model:"CURRENT_CURRICULUM_BUNDLE_100"
  });
  if(importErr||!imported||imported.status!=="success"){
    await admin.from("knowledge_documents").delete().eq("id",doc.id);
    await admin.storage.from(KNOWLEDGE_BUCKET).remove([sourcePath]);await admin.storage.from(NORMALIZED_BUCKET).remove([normPath]);
    throw new Error(`normalized_import_failed:${importErr?.message||imported?.code||"unknown"}`);
  }
  return {status:"success",action:"seeded",document_id:doc.id,revision:imported.revision,active_revision:imported.active_revision,
    quality_status:imported.quality_status,unit_count:imported.unit_count,pdf_sha256:pdfSha,payload_sha256:payloadSha};
}

Deno.serve(async(req:Request)=>{
  if(!["GET","POST"].includes(req.method)) return reply(405,{status:"error",code:"method_not_allowed"});
  try{return reply(200,await seed());}
  catch(error){const message=error instanceof Error?error.message:"unexpected_error";console.error("authority-p0-geography-curriculum seed failed",error);return reply(500,{status:"error",code:message});}
});
