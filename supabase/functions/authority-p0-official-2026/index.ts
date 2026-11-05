import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const PROFILE_ID="DIA_LI_TNTHPT_2025_PLUS_V1";
const AUTHORITY_CODE="BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY";
const SOURCE_ROLE="ASSESSMENT_BENCHMARK";
const SOURCE_URL="https://xaydungchinhsach.chinhphu.vn/thi-tot-nghiep-thpt-2026-de-thi-mon-dia-li-va-goi-y-dap-an-119260612141919076.htm";
const TITLE="Đề thi chính thức môn Địa lí - Kỳ thi tốt nghiệp THPT 2026 - mã 0921";
const ORIGINAL_FILENAME="official-geography-2026-code-0921.html";
const KNOWLEDGE_BUCKET="knowledge-source";
const NORMALIZED_BUCKET="knowledge-normalized";
const IMAGE_URLS=[
  "https://xdcs.cdnchinhphu.vn/446259493575335936/2026/6/12/de-dia-1-1781248339286-17812483397321884321791.jpg",
  "https://xdcs.cdnchinhphu.vn/446259493575335936/2026/6/12/de-dia-2-1781248340247-17812483404201435324098.jpg",
  "https://xdcs.cdnchinhphu.vn/446259493575335936/2026/6/12/de-dia-3-1781248340837-17812483409771230335140.jpg",
  "https://xdcs.cdnchinhphu.vn/446259493575335936/2026/6/12/de-dia-4-1781248341409-17812483415571702270283.jpg"
];

const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
type Obj=Record<string,unknown>;

function reply(status:number,body:Obj){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
async function sha256Bytes(bytes:Uint8Array){const d=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function sha256Text(text:string){return sha256Bytes(new TextEncoder().encode(text));}

async function scope(){
  const {data:school}=await admin.from("truong_hoc").select("id").eq("ma_truong","DAMSAN").maybeSingle();
  const {data:subject}=await admin.from("mon_hoc").select("id,ten_mon").in("ten_mon",["Địa lí","Địa lý"]).limit(1).maybeSingle();
  const {data:actor}=await admin.from("giao_vien").select("id").eq("truong_id",school?.id).eq("quyen","Admin").limit(1).maybeSingle();
  if(!school?.id||!subject?.id||!actor?.id) throw new Error("authority_scope_unavailable");
  return {schoolId:school.id,subjectId:subject.id,subjectName:subject.ten_mon,actorId:actor.id};
}

async function existingVerified(){
  const {data,error}=await admin.from("knowledge_documents").select("id,active_revision,pipeline_status,quality_status,normalization_schema")
    .eq("authority_profile_id",PROFILE_ID).eq("authority_code",AUTHORITY_CODE).maybeSingle();
  if(error) throw error;
  if(!data) return null;
  const {count}=await admin.from("knowledge_units").select("id",{count:"exact",head:true}).eq("document_id",data.id)
    .eq("revision",data.active_revision??-1).eq("unit_type","BENCHMARK_PATTERN").eq("is_usable",true);
  const verified=data.active_revision!=null&&data.pipeline_status==="READY"&&data.quality_status==="AUTO_ACCEPTED"
    &&data.normalization_schema==="DAMSAN_SOURCE_V2"&&Number(count||0)>0;
  if(!verified) throw new Error("authority_slot_has_unverified_document");
  return {documentId:data.id,unitCount:Number(count||0)};
}

async function fetchPage(){
  const r=await fetch(SOURCE_URL,{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 DamSanAuthorityCapture/101","Accept":"text/html"}});
  if(!r.ok) throw new Error(`official_exam_page_failed_${r.status}`);
  const text=await r.text();
  for(const marker of ["ĐỀ THI, ĐÁP ÁN môn ĐỊA LÍ","mã đề 0921","Đề thi môn Địa Lí, kỳ thi tốt nghiệp THPT 2026"]){
    if(!text.includes(marker)) throw new Error("official_exam_page_marker_missing");
  }
  for(const url of IMAGE_URLS){if(!text.includes(url.split("/").pop()!)) throw new Error("official_exam_image_marker_missing");}
  return text;
}

function fingerprints(){
  const base={unit_type:"BENCHMARK_PATTERN",hierarchy:{path:[TITLE]},lesson_code:null,lesson_title:null,confidence:1,is_usable:true};
  const p=(unit_key:string,ordinal_no:number,section_title:string,content:Obj,page_start:number,page_end:number)=>({
    ...base,unit_key,ordinal_no,section_title,content,page_start,page_end,
    provenance:{authority_code:AUTHORITY_CODE,source_url:SOURCE_URL,exam_code:"0921",exam_image_urls:IMAGE_URLS,review_mode:"FULL_VISUAL_4_PAGE_REVIEW"}
  });
  return [
    p("BENCH_2026_FRAME_001",1,"Khung đề chính thức Địa lí 2026",{part:"ALL",stimulus_type:"MIXED",pattern:"18 MCQ + 4 True/False clusters + 6 numeric short answers, 50 minutes, 4 exam pages.",reuse_policy:"STYLE_ONLY_NO_COPY"},1,4),
    p("BENCH_2026_P1_MIX_002",2,"Phần I - kiến thức và công cụ đa dạng",{part:"1",stimulus_type:"MIXED",cognitive_action:"KNOWLEDGE_TO_INTERPRETATION",pattern:"Short factual items are mixed with causal, regional and application items; the set also includes map-method knowledge, chart interpretation and a statistical table.",reuse_policy:"STYLE_ONLY_NO_COPY"},1,3),
    p("BENCH_2026_P1_CHART_003",3,"Phần I - biểu đồ lao động",{part:"1",stimulus_type:"CHART",cognitive_action:"READ_COMPARE_CHANGE",pattern:"A grouped age-structure chart requires comparison between two years rather than simple recall.",reuse_policy:"STYLE_ONLY_NO_COPY"},1,1),
    p("BENCH_2026_P1_TABLE_004",4,"Phần I - bảng dân số",{part:"1",stimulus_type:"TABLE",cognitive_action:"DERIVE_POPULATION_CHANGE",pattern:"A compact demographic table requires distinguishing natural increase from actual population increase.",reuse_policy:"STYLE_ONLY_NO_COPY"},2,2),
    p("BENCH_2026_P2_TEXT_005",5,"Phần II - stimulus văn bản",{part:"2",stimulus_type:"TEXT",cognitive_action:"MIXED_DIRECT_CAUSAL_APPLICATION",pattern:"Shared geographic text supports four statements combining direct evidence, causal explanation and applied judgement.",reuse_policy:"STYLE_ONLY_NO_COPY"},3,4),
    p("BENCH_2026_P2_CHART_006",6,"Phần II - biểu đồ hai trục",{part:"2",stimulus_type:"CHART",cognitive_action:"DERIVE_COMPARE_EXPLAIN",pattern:"A dual-measure chart requires deriving GDP per capita and evaluating differences; numeric reading alone is insufficient.",reuse_policy:"STYLE_ONLY_NO_COPY"},3,3),
    p("BENCH_2026_P3_GROWTH_007",7,"Phần III - tăng trưởng theo lần",{part:"3",stimulus_type:"TEXT_NUMERIC",cognitive_action:"CALCULATE_GROWTH_MULTIPLE",operation_family:"RATIO_GROWTH",pattern:"Two time-point values are converted to a multiplicative growth result with explicit rounding.",reuse_policy:"STYLE_ONLY_NO_COPY"},4,4),
    p("BENCH_2026_P3_TABLE_008",8,"Phần III - tăng trưởng từ bảng",{part:"3",stimulus_type:"TABLE",cognitive_action:"DERIVE_AND_COMPARE_GROWTH",operation_family:"GROWTH_RATE",pattern:"A two-mode transport table asks for the difference between derived growth rates, requiring multiple calculations.",reuse_policy:"STYLE_ONLY_NO_COPY"},4,4),
    p("BENCH_2026_P3_SHARE_009",9,"Phần III - tỉ trọng",{part:"3",stimulus_type:"TEXT_NUMERIC",cognitive_action:"CALCULATE_SHARE",operation_family:"SHARE_PERCENT",pattern:"Component and total values are used to calculate an economic share with one-decimal rounding.",reuse_policy:"STYLE_ONLY_NO_COPY"},4,4),
    p("BENCH_2026_P3_DENSITY_010",10,"Phần III - suy dân số từ mật độ",{part:"3",stimulus_type:"TEXT_NUMERIC",cognitive_action:"INVERSE_DENSITY_RELATION",operation_family:"COMPONENT_FROM_RATE",pattern:"Area and population density are combined to infer total population, including scale conversion.",reuse_policy:"STYLE_ONLY_NO_COPY"},4,4),
    p("BENCH_2026_P3_BALANCE_011",11,"Phần III - cán cân thương mại",{part:"3",stimulus_type:"TEXT_NUMERIC",cognitive_action:"CALCULATE_BALANCE",operation_family:"BALANCE",pattern:"Import and export values are combined into a trade balance with sign/interpretation discipline.",reuse_policy:"STYLE_ONLY_NO_COPY"},4,4),
    p("BENCH_2026_P3_LAPSE_012",12,"Phần III - quy luật nhiệt theo độ cao",{part:"3",stimulus_type:"TEXT_NUMERIC",cognitive_action:"APPLY_GEOGRAPHIC_RATE",operation_family:"LAPSE_RATE",pattern:"A geographic physical rule is applied across elevation difference, not merely read from a table.",reuse_policy:"STYLE_ONLY_NO_COPY"},4,4)
  ];
}

async function seed(){
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY) throw new Error("server_not_configured");
  const old=await existingVerified(); if(old) return {status:"success",action:"already_seeded",...old};
  const s=await scope();
  const html=await fetchPage();
  const bytes=new TextEncoder().encode(html), sourceSha=await sha256Bytes(bytes);
  const sourcePath=`${s.schoolId}/authority/${PROFILE_ID}/${AUTHORITY_CODE}/${sourceSha}.html`;
  const {error:sourceErr}=await admin.storage.from(KNOWLEDGE_BUCKET).upload(sourcePath,new Blob([html],{type:"text/html; charset=utf-8"}),{contentType:"text/html; charset=utf-8",upsert:true});
  if(sourceErr) throw new Error(`source_storage_failed:${sourceErr.message}`);

  const manifest={record_type:"manifest",schema_version:"DAMSAN_SOURCE_V2",source_role:SOURCE_ROLE,subject_name:s.subjectName,grade:12,title:TITLE,
    document_type:"SUPPLEMENTARY",curriculum_code:"GDPT_2018_CURRENT",book_series:null,authority_code:AUTHORITY_CODE,assessment_profile_ids:[PROFILE_ID],
    coverage:{source_page_count:4,processed_pages_count:4,missing_pages:[],uncertain_pages:[]},
    source_locator:{publisher:"Báo điện tử Chính phủ / Cổng TTĐT Chính phủ",source_url:SOURCE_URL,exam_code:"0921",exam_image_urls:IMAGE_URLS,sha256:sourceSha},
    normalization_policy:"OFFICIAL_EXAM_2026_VISUAL_FINGERPRINT_STYLE_ONLY_NO_COPY",
    notes:["Only the four exam pages are used for calibration. Suggested-answer images are excluded from the generation corpus."]};
  const units=fingerprints();
  const jsonl=[manifest,...units.map(u=>({record_type:"benchmark_pattern",unit_key:u.unit_key,title:u.section_title,page_start:u.page_start,page_end:u.page_end,content:u.content,confidence:1}))].map(x=>JSON.stringify(x)).join("\n");
  const payloadSha=await sha256Text(jsonl), normPath=`${s.schoolId}/authority/${PROFILE_ID}/${AUTHORITY_CODE}/${payloadSha}.jsonl`;
  const {error:normErr}=await admin.storage.from(NORMALIZED_BUCKET).upload(normPath,new Blob([jsonl],{type:"application/x-ndjson"}),{contentType:"application/x-ndjson",upsert:true});
  if(normErr){await admin.storage.from(KNOWLEDGE_BUCKET).remove([sourcePath]);throw new Error(`normalized_storage_failed:${normErr.message}`);}

  const {data:doc,error:docErr}=await admin.from("knowledge_documents").insert({
    truong_id:s.schoolId,owner_gv_id:s.actorId,mon_id:s.subjectId,grade:12,title:TITLE,original_filename:ORIGINAL_FILENAME,
    mime_type:"text/html",source_format:"HTML",storage_bucket:KNOWLEDGE_BUCKET,storage_path:sourcePath,file_size_bytes:bytes.length,sha256:sourceSha,page_count:4,
    document_type:"SUPPLEMENTARY",context_hint:{authority_seed:"P0_101",exam_code:"0921"},analysis_manifest:{authority_seed:"P0_101",review_mode:"FULL_VISUAL_4_PAGE_REVIEW"},
    pipeline_status:"EXTRACTED",quality_status:"UNASSESSED",analysis_revision:0,
    extraction_manifest:{schema_version:"DAMSAN_EXTRACT_V1",page_count:4,extracted_chars:jsonl.length,boundary_mode:"FULL_PAGE_VISUAL_REVIEW",source_text_available:true,visual_review_complete:true,reviewed_pages:[1,2,3,4],ocr_unresolved_pages:[],source_url:SOURCE_URL,sha256:sourceSha},
    book_index:{},semantic_coverage:["ASSESSMENT_BENCHMARK","P1","P2","P3","CHART","TABLE","MULTISTEP_NUMERIC"],
    source_role:SOURCE_ROLE,curriculum_code:"GDPT_2018_CURRENT",authority_profile_id:PROFILE_ID,authority_code:AUTHORITY_CODE
  }).select("id").single();
  if(docErr||!doc?.id){await admin.storage.from(KNOWLEDGE_BUCKET).remove([sourcePath]);await admin.storage.from(NORMALIZED_BUCKET).remove([normPath]);throw new Error(`document_create_failed:${docErr?.message||"unknown"}`);}

  const {data:imported,error:importErr}=await admin.rpc("rpc_knowledge_import_normalized_source_service",{
    p_requested_by:s.actorId,p_document_id:doc.id,p_grade:12,p_source_role:SOURCE_ROLE,p_manifest:manifest,p_units:units,
    p_normalized_storage_path:normPath,p_payload_sha256:payloadSha,p_ai_provider:"SYSTEM_P0_AUTHORITY",p_ai_model:"OFFICIAL_EXAM_2026_VISUAL_REVIEW_101"
  });
  if(importErr||!imported||imported.status!=="success"){
    await admin.from("knowledge_documents").delete().eq("id",doc.id);await admin.storage.from(KNOWLEDGE_BUCKET).remove([sourcePath]);await admin.storage.from(NORMALIZED_BUCKET).remove([normPath]);
    throw new Error(`normalized_import_failed:${importErr?.message||imported?.code||"unknown"}`);
  }
  return {status:"success",action:"seeded",document_id:doc.id,revision:imported.revision,active_revision:imported.active_revision,quality_status:imported.quality_status,unit_count:imported.unit_count,source_sha256:sourceSha,payload_sha256:payloadSha};
}

Deno.serve(async(req:Request)=>{
  if(!["GET","POST"].includes(req.method)) return reply(405,{status:"error",code:"method_not_allowed"});
  try{return reply(200,await seed());}catch(error){const message=error instanceof Error?error.message:"unexpected_error";console.error("authority-p0-official-2026 seed failed",error);return reply(500,{status:"error",code:message});}
});
