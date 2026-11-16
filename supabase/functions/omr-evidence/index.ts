import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUCKET = "omr-evidence";
const OFFICIAL_ENABLED = Deno.env.get("OMR_EVIDENCE_OFFICIAL_ENABLED") === "true";
const MAX_IMAGE = 1_500_000;
const MAX_BODY = 5_000_000;
const DEFAULT_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const uuid = (v: unknown): v is string => typeof v === "string" &&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const safe = (v: unknown) => typeof v === "string" ? v.trim() : "";
const adminRole = (role: unknown) => role === "Admin";
type Json = Record<string, unknown>;
type Actor = { id: string; school: string; subject: string | null; role: string };
function originHeaders(req: Request) {
 const origin=req.headers.get("origin")||"";
 const allowed=origin==="https://hvtnguyenson-code.github.io" ||
   /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
 return { "Access-Control-Allow-Origin": allowed?origin:"null",
  "Access-Control-Allow-Headers":"apikey,authorization,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin" };
}
function respond(req: Request,status:number,payload:Json) {
 return new Response(JSON.stringify(payload),{status,headers:originHeaders(req)});
}
function error(req:Request,status:number,code:string) {
 return respond(req,status,{status:"error",code});
}
async function tokenHash(v:string) {
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
 return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function actorFrom(token:unknown): Promise<Actor> {
 if(typeof token!=="string"||token.length<20||token.length>1024)throw Error("staff_session_invalid");
 const hash=await tokenHash(token);
 const {data:session,error:se}=await db.from("staff_sessions")
   .select("gv_id,expires_at,revoked_at").eq("token_hash",hash)
   .is("revoked_at",null).maybeSingle();
 if(se||!session||!uuid(session.gv_id)||!session.expires_at||
   new Date(session.expires_at).getTime()<=Date.now())throw Error("staff_session_invalid");
 const {data:teacher,error:te}=await db.from("giao_vien")
   .select("id,truong_id,mon_id,quyen,mat_khau").eq("id",session.gv_id).maybeSingle();
 if(te||!teacher||!uuid(teacher.id)||!uuid(teacher.truong_id)||
   teacher.mat_khau===DEFAULT_HASH||teacher.mat_khau==="123456")
   throw Error("staff_session_invalid");
 return {id:teacher.id,school:teacher.truong_id,subject:teacher.mon_id,
   role:teacher.quyen||""};
}
async function roomFor(actor:Actor,roomId:unknown) {
 if(!uuid(roomId))throw Error("room_invalid");
 const {data:room,error:e}=await db.from("phong_thi")
  .select("id,truong_id,mon_id,ma_phong,doi_tuong").eq("id",roomId).maybeSingle();
 if(e||!room||room.truong_id!==actor.school||
  (!adminRole(actor.role)&&(!actor.subject||room.mon_id!==actor.subject)))
  throw Error("room_forbidden");
 return room;
}
async function studentFor(room:Json,id:unknown) {
 if(id==null||id==="")return null;
 if(!uuid(id))throw Error("student_invalid");
 const {data:student,error:e}=await db.from("hoc_sinh")
  .select("id,truong_id,lop,ma_hs").eq("id",id).maybeSingle();
 if(e||!student||student.truong_id!==room.truong_id)throw Error("student_forbidden");
 const scope=safe(room.doi_tuong);
 if(scope&&scope!=="TatCa"&&!scope.split(",").map(x=>x.trim())
    .some(x=>x===student.lop||x===student.ma_hs))throw Error("student_not_in_room");
 return student;
}
function image(input:unknown) {
 if(typeof input!=="string"||input.length>2_100_000||
    !/^data:image\/(webp|jpeg);base64,/.test(input))throw Error("image_format_invalid");
 const match=/^data:image\/(webp|jpeg);base64,/.exec(input)!;
 const content=input.slice(match[0].length);
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(content))throw Error("image_base64_invalid");
 const binary=atob(content),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 if(!bytes.length||bytes.length>MAX_IMAGE)throw Error("image_size_invalid");
 const mime=match[1]==="webp"?"image/webp":"image/jpeg";
 if(mime==="image/webp"&&!(binary.slice(0,4)==="RIFF"&&binary.slice(8,12)==="WEBP"))
   throw Error("webp_signature_invalid");
 if(mime==="image/jpeg"&&!(bytes[0]===255&&bytes[1]===216&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217))
   throw Error("jpeg_signature_invalid");
 return {bytes,mime,ext:mime==="image/webp"?"webp":"jpg"};
}
async function sha256(bytes:Uint8Array) {
 const buffer=new ArrayBuffer(bytes.byteLength);
 new Uint8Array(buffer).set(bytes);
 const hash=await crypto.subtle.digest("SHA-256",buffer);
 return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function boundedJson(v:unknown,limit=60000) {
 if(!v||typeof v!=="object"||Array.isArray(v))throw Error("evidence_invalid");
 const json=JSON.stringify(v);
 if(json.length>limit)throw Error("evidence_too_large");
 return v as Json;
}
async function save(req:Request,body:Json,actor:Actor) {
 const room=await roomFor(actor,body.room_id);
 const mode=body.mode==="official"?"official":"test";
 if(mode==="test"&&room.ma_phong!=="OMR_V7_TEST")throw Error("test_room_only");
 if(mode==="official"&&!OFFICIAL_ENABLED)throw Error("official_evidence_disabled");
 const student=await studentFor(room,body.student_id);
 const scanId=body.scan_id,revision=Number(body.revision);
 if(!uuid(scanId)||!Number.isInteger(revision)||revision<1||revision>1000)
   throw Error("scan_revision_invalid");
 const meta=boundedJson(body.evidence,90000);
 if(meta.scan_id!==scanId||meta.room_id!==room.id||meta.mode!==mode||
   (student?.id||null)!==(meta.student_id||null)||meta.revision!==revision)
   throw Error("evidence_link_mismatch");
 if(meta.version!=="OMR_EVIDENCE_01")throw Error("evidence_version_invalid");
 const previewScore=Number((meta.grade as Json|undefined)?.total);
 if(!Number.isFinite(previewScore)||previewScore<0||previewScore>10)
   throw Error("evidence_score_invalid");
 const annotated=image(body.annotated_image),capture=image(body.capture_image);
 const digest=await sha256(annotated.bytes);
 const {data:old,error:oldError}=await db.from("omr_artifacts")
   .select("id,sha256,status").eq("scan_id",scanId).eq("revision",revision).maybeSingle();
 if(oldError)throw Error("artifact_lookup_failed");
 if(old){
  if(old.sha256!==digest)throw Error("artifact_revision_conflict");
  return respond(req,200,{status:"success",artifact_id:old.id,idempotent:true,phase:old.status});
 }
 // A test evidence is no longer a stored draft: it must reflect an
 // already confirmed canonical OMR submission, including all 28 answers.
 // Old/offline clients that still auto-upload previews are rejected.
 let canonicalTest=null;
 if(mode==="test"){
  if(!student)throw Error("test_student_required");
  const {data:s,error:e}=await db.from("exam_submissions")
   .select("id,source,truong_id,phong_id,hs_id,ma_de,raw_answers,status,score,submitted_by_staff_id")
   .eq("phong_id",room.id).eq("hs_id",student.id).maybeSingle();
  if(e||!s||s.source!=="OMR"||s.status!=="graded"||
    s.truong_id!==actor.school||s.phong_id!==room.id||s.hs_id!==student.id||
    s.ma_de!==safe(body.exam_code)||s.ma_de!==meta.exam_code||
    (!adminRole(actor.role)&&s.submitted_by_staff_id!==actor.id))
    throw Error("test_submission_not_confirmed");
  if(!Number.isFinite(Number(s.score))||Math.abs(previewScore-Number(s.score))>.001)
    throw Error("test_score_mismatch");
  const confirmed=meta.confirmed as Json|undefined;
  const p1=typeof confirmed?.p1==="string"?Array.from(confirmed.p1):[];
  const p2=Array.isArray(confirmed?.p2)?confirmed.p2:[];
  const p3=Array.isArray(confirmed?.p3)?confirmed.p3:[];
  const expected=[...p1,...p2,...p3].map(x=>String(x??""));
  const submitted=Array.isArray(s.raw_answers)?
    s.raw_answers.map((x:{chon?:unknown})=>String(x?.chon??"")):[];
  if(expected.length!==28||submitted.length!==28||
     JSON.stringify(expected)!==JSON.stringify(submitted))
    throw Error("test_answers_mismatch");
  canonicalTest=s;
  const {count,error:countError}=await db.from("omr_artifacts")
    .select("id",{count:"exact",head:true}).eq("mode","test");
  if(countError)throw Error("test_quota_check_failed");
  if((count||0)>=200)throw Error("test_evidence_quota_reached");
 }
 let submission=null;
 if(mode==="official"){
  if(!student||!uuid(body.submission_id))throw Error("official_submission_required");
  const {data:s,error:e}=await db.from("exam_submissions")
   .select("id,source,truong_id,phong_id,hs_id,ma_de,raw_answers,status,score,submitted_by_staff_id")
   .eq("id",body.submission_id).maybeSingle();
  if(e||!s||s.source!=="OMR"||s.status!=="graded"||
    s.truong_id!==actor.school||s.phong_id!==room.id||
    s.hs_id!==student.id||s.ma_de!==safe(body.exam_code)||
    s.ma_de!==meta.exam_code||
    (!adminRole(actor.role)&&s.submitted_by_staff_id!==actor.id))
    throw Error("official_submission_forbidden");
  if(!Number.isFinite(Number(s.score))||Math.abs(previewScore-Number(s.score))>.001)
    throw Error("official_score_mismatch");
  // Evidence is always derived from the confirmed answers actually submitted
  // to the canonical server writer, not merely a coincidentally equal score.
  const confirmed=meta.confirmed as Json|undefined;
  const p1=typeof confirmed?.p1==="string"?confirmed.p1:[];
  const p2=Array.isArray(confirmed?.p2)?confirmed.p2:[];
  const p3=Array.isArray(confirmed?.p3)?confirmed.p3:[];
  const submitted=Array.isArray(s.raw_answers)
    ?s.raw_answers.map((entry:{chon?:unknown})=>String(entry?.chon??""))
    :null;
  const answers=[...(typeof p1==="string"?Array.from(p1):[]),...p2,...p3]
    .map(value=>String(value??""));
  if(!submitted||submitted.length!==28||answers.length!==28||
     JSON.stringify(submitted)!==JSON.stringify(answers))
    throw Error("official_answers_mismatch");
  submission=s;
 }
 const prefix=(mode==="test"?"test":"official")+"/"+actor.school+"/"+room.id+"/"+scanId+"/"+revision;
 const capturePath=prefix+"/capture."+capture.ext;
 const annotatedPath=prefix+"/annotated."+annotated.ext;
 // Immutable paths: a retry may encounter an already-uploaded object if the
 // network failed between Storage upload and DB registration. Verify SHA-256
 // rather than overwriting another request's image or deleting shared paths.
 const freshUploads:string[]=[];
 for(const f of [{path:capturePath,body:capture},{path:annotatedPath,body:annotated}]){
  const {error:e}=await db.storage.from(BUCKET).upload(f.path,f.body.bytes,
    {contentType:f.body.mime,cacheControl:"3600",upsert:false});
  if(!e)freshUploads.push(f.path);
  if(e){
   const msg=String(e.message||"")+" "+String((e as {statusCode?:string|number}).statusCode||"");
   if(!/exists|duplicate|409/i.test(msg)){
    if(freshUploads.length)await db.storage.from(BUCKET).remove(freshUploads);
    throw Error("storage_upload_failed");
   }
   const {data:existing,error:downloadError}=await db.storage.from(BUCKET).download(f.path);
   if(downloadError||!existing)throw Error("storage_retry_unavailable");
   const prior=new Uint8Array(await existing.arrayBuffer());
   if(await sha256(prior)!==await sha256(f.body.bytes))
      throw Error("storage_revision_content_conflict");
  }
 }
 const row={scan_id:scanId,revision,room_id:room.id,student_id:student?.id||null,
  school_id:actor.school,created_by_staff_id:actor.id,submission_id:submission?.id||null,
  exam_code:safe(body.exam_code),mode,status:submission?"COMPLETE":"TEST",
  capture_path:capturePath,annotated_path:annotatedPath,
  sha256:digest,file_bytes:annotated.bytes.byteLength,engine_version:meta.version,
  preview_score:previewScore,final_score:submission?.score??canonicalTest?.score??null,
  evidence:meta};
 const {data:inserted,error:ie}=await db.from("omr_artifacts")
   .insert(row).select("id,status").single();
 if(ie){
  // A concurrent, byte-identical request may have registered first.
  const {data:existing}=await db.from("omr_artifacts")
    .select("id,sha256,status").eq("scan_id",scanId).eq("revision",revision).maybeSingle();
  if(existing&&existing.sha256===digest)
   return respond(req,200,{status:"success",artifact_id:existing.id,
     phase:existing.status,idempotent:true});
  // E.g. the room was deleted after image upload but before DB insertion.
  // Remove ONLY objects created by this request; never remove pre-existing
  // paths from an idempotent retry or another confirmed artifact.
  if(freshUploads.length){
   const {error:cleanupError}=await db.storage.from(BUCKET).remove(freshUploads);
   if(cleanupError)throw Error("artifact_registration_orphan_cleanup_failed");
  }
  throw Error("artifact_registration_failed");
 }
 return respond(req,200,{status:"success",artifact_id:inserted.id,phase:inserted.status,
   idempotent:false});
}
async function list(req:Request,body:Json,actor:Actor){
 const room=await roomFor(actor,body.room_id);
 const offset=Number(body.offset??0);
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw Error("list_offset_invalid");
 const {data, error:e}=await db.from("omr_artifacts")
   .select("id,scan_id,revision,mode,status,student_id,exam_code,preview_score,final_score,file_bytes,created_at,submission_id")
   .eq("room_id",room.id).eq("school_id",actor.school)
   .order("created_at",{ascending:false}).order("id",{ascending:false})
   .range(offset,offset+199);
 if(e)throw Error("artifact_list_failed");
 const ids=[...new Set((data||[]).map(item=>item.student_id).filter(uuid))];
 const names=new Map<string,{ma_hs:string;ho_ten:string;lop:string}>();
 if(ids.length){
  const {data:students,error:se}=await db.from("hoc_sinh")
   .select("id,ma_hs,ho_ten,lop").eq("truong_id",actor.school).in("id",ids);
  if(se)throw Error("artifact_student_lookup_failed");
  for(const student of students||[])names.set(student.id,student);
 }
 const items=(data||[]).map(item=>{
  const student=names.get(item.student_id);
  return {...item,student_code:student?.ma_hs||"",
   student_name:student?.ho_ten||"",class_name:student?.lop||""};
 });
 return respond(req,200,{status:"success",items,next_offset:(data||[]).length===200?offset+200:null});
}
async function get(req:Request,body:Json,actor:Actor){
 if(!uuid(body.artifact_id))throw Error("artifact_invalid");
 const {data:record,error:e}=await db.from("omr_artifacts").select("*")
   .eq("id",body.artifact_id).maybeSingle();
 if(e||!record)throw Error("artifact_not_found");
 await roomFor(actor,record.room_id);
 if(record.school_id!==actor.school)throw Error("artifact_forbidden");
 const kind=body.kind==="capture"?"capture":"annotated";
 const path=kind==="capture"?record.capture_path:record.annotated_path;
 const {data:signed,error:se}=await db.storage.from(BUCKET).createSignedUrl(path,60);
 if(se||!signed?.signedUrl)throw Error("signed_url_failed");
 return respond(req,200,{status:"success",url:signed.signedUrl,
   record:{id:record.id,scan_id:record.scan_id,revision:record.revision,
     evidence:record.evidence,mode:record.mode,status:record.status}});
}
// Remove private Storage objects for ONE authorized room. SQL deletion is a
// separate transaction guarded by a storage-empty check, preventing orphaning.
async function cleanupRoom(req:Request,body:Json,actor:Actor){
 if(!uuid(body.room_id)||!uuid(body.school_id)||!safe(body.teacher_code))
  throw Error("cleanup_room_invalid");
 if(actor.role!=="Admin"&&actor.school!==body.school_id)
  throw Error("room_forbidden");
 const args={p_staff_token:body.staff_token,p_ma_gv:safe(body.teacher_code),
  p_truong_id:body.school_id,p_phong_id:body.room_id};
 const inventory=async()=>{
  const {data,error}=await db.rpc("rpc_omr_room_delete_inventory",args);
  if(error)throw Error("cleanup_inventory_unavailable");
  if(data?.status!=="success")throw Error(safe(data?.code)||"cleanup_room_forbidden");
  return data as Json;
 };
 const first=await inventory();
 if(!Array.isArray(first.paths)||first.paths.length>1000)
  throw Error("cleanup_inventory_invalid");
 const school=String(body.school_id),room=String(body.room_id);
 const allowed=["test/","official/"].map(mode=>mode+school+"/"+room+"/");
 const paths=first.paths.map(path=>{
  if(typeof path!=="string"||!allowed.some(prefix=>path.startsWith(prefix))||
     path.includes("..")||path.length>512)throw Error("cleanup_path_invalid");
  return path;
 });
 if(new Set(paths).size!==paths.length)throw Error("cleanup_duplicate_path");
 // Fail closed on any Storage API error. Repeating the same deletion is safe:
 // the SQL inventory returns only objects still present in Storage.
 for(let i=0;i<paths.length;i+=100){
  const {error}=await db.storage.from(BUCKET).remove(paths.slice(i,i+100));
  if(error)throw Error("cleanup_storage_failed");
 }
 const remaining=await inventory();
 if(!Array.isArray(remaining.paths)||remaining.paths.length!==0)
  throw Error("cleanup_storage_not_empty");
 return respond(req,200,{status:"success",deleted_files:paths.length,
  estimated_bytes:Number(first.file_bytes)||0});
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:originHeaders(req)});
 if(req.method!=="POST")return error(req,405,"method_not_allowed");
 try{
  const raw=await req.text();
  if(raw.length>MAX_BODY)return error(req,413,"payload_too_large");
  const body=JSON.parse(raw) as Json;
  const actor=await actorFrom(body.staff_token);
  switch(body.action){
   case "save":return await save(req,body,actor);
   case "list":return await list(req,body,actor);
   case "get":return await get(req,body,actor);
   case "cleanup_room":return await cleanupRoom(req,body,actor);
   default:return error(req,400,"action_not_supported");
  }
 }catch(e){
  const code=e instanceof Error?e.message:"unexpected_failure";
  const forbidden=/session|forbidden|not_in_room|disabled|test_room_only/.test(code);
  const invalid=/invalid|mismatch|too_large|not_supported|not_drawable/.test(code);
  return error(req,forbidden?403:invalid?400:409,code);
 }
});