import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const ORCHESTRATOR_URL = `${SUPABASE_URL}/functions/v1/exam-ai-orchestrator`;
const MAX_PROMPT_CHARS = 7_500_000;
const MAX_ROUTE_CANDIDATES = 6;
const MAX_ROUTE_ATTEMPTS = 10;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth:{persistSession:false,autoRefreshToken:false} });

type Obj = Record<string, unknown>;
type Actor = { id:string; ma_gv:string; truong_id:string; quyen:string };
type RouteCandidate = { provider:Obj; model:Obj; score:number };

function cors(req:Request){const origin=req.headers.get("origin")||"*";return{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"content-type, x-client-info, apikey","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function json(req:Request,status:number,body:Obj){return new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function s(v:unknown,max=1000){return typeof v==="string"?v.trim().slice(0,max):"";}
function obj(v:unknown):Obj{return v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:{};}
function isUuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
async function sha256Hex(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}

async function requireStaff(body:Obj):Promise<Actor>{
  const token=s(body.staff_token,2048),maGv=s(body.ma_gv,160);if(!token||!maGv)throw new Error("staff_session_invalid");
  const hash=await sha256Hex(token);
  const q=await admin.from("staff_sessions").select("gv_id,expires_at,revoked_at").eq("token_hash",hash).is("revoked_at",null).maybeSingle();
  if(q.error||!q.data||!isUuid(q.data.gv_id)||!q.data.expires_at||new Date(q.data.expires_at).getTime()<=Date.now())throw new Error("staff_session_invalid");
  const t=await admin.from("giao_vien").select("id,ma_gv,truong_id,quyen,mat_khau").eq("id",q.data.gv_id).maybeSingle();
  if(t.error||!t.data||!isUuid(t.data.id)||!isUuid(t.data.truong_id)||t.data.ma_gv!==maGv)throw new Error("staff_session_invalid");
  if(t.data.mat_khau==="123456"||t.data.mat_khau===DEFAULT_PASSWORD_HASH)throw new Error("staff_session_invalid");
  return{id:t.data.id,ma_gv:t.data.ma_gv,truong_id:t.data.truong_id,quyen:t.data.quyen};
}

function readable(actor:Actor,p:Obj){return p.owner_scope==="SYSTEM"||(p.owner_scope==="SCHOOL"&&p.truong_id===actor.truong_id)||(p.owner_scope==="PERSONAL"&&p.owner_gv_id===actor.id);}
function routeScore(p:Obj,m:Obj){
  const test = p.last_test_status==="OK"?0:(p.last_test_status==="FAILED"?40:10);
  const scope = p.owner_scope==="PERSONAL"?0:(p.owner_scope==="SCHOOL"?3:6);
  const caps=obj(m.capabilities);const priority=Number(caps.route_priority);const custom=Number.isFinite(priority)?Math.max(-20,Math.min(20,priority)):0;
  return test+scope+custom;
}

async function routeCandidates(actor:Actor):Promise<RouteCandidate[]>{
  const pRes=await admin.from("ai_provider_connections").select("*").eq("enabled",true);
  if(pRes.error)throw new Error("ai_route_provider_read_failed");
  const providers=(pRes.data||[]).filter((p)=>readable(actor,p as Obj));
  if(!providers.length)return[];
  const ids=providers.map((p)=>p.id).filter(Boolean);
  const mRes=await admin.from("ai_model_profiles").select("*").in("provider_connection_id",ids).eq("enabled",true);
  if(mRes.error)throw new Error("ai_route_model_read_failed");
  const byId=new Map(providers.map((p)=>[p.id,p as Obj]));
  return (mRes.data||[]).map((m)=>{const p=byId.get(m.provider_connection_id);return p?{provider:p,model:m as Obj,score:routeScore(p,m as Obj)}:null;}).filter(Boolean).sort((a,b)=>a!.score-b!.score||String(a!.model.created_at||"").localeCompare(String(b!.model.created_at||""))).slice(0,MAX_ROUTE_CANDIDATES) as RouteCandidate[];
}

function publicCandidate(candidate:RouteCandidate){return{provider_id:s(candidate.provider.id,80),model_profile_id:s(candidate.model.id,80)};}
async function routeStatus(req:Request,actor:Actor){const candidates=await routeCandidates(actor);return json(req,200,{status:"success",action:"route_status",ready:candidates.length>0,candidate_count:candidates.length});}
async function routePlan(req:Request,actor:Actor){const candidates=await routeCandidates(actor);if(!candidates.length)return json(req,409,{status:"error",code:"ai_route_unavailable",message:"Chưa có kết nối AI/model khả dụng."});return json(req,200,{status:"success",action:"route_plan",candidate_count:candidates.length,candidates:candidates.map(publicCandidate)});}

// Compatibility path for cached clients from 066. New clients use route_plan and invoke one
// orchestrator worker per attempt so a long provider call does not consume two nested workers.
async function callOrchestrator(body:Obj){
  const res=await fetch(ORCHESTRATOR_URL,{method:"POST",headers:{"Content-Type":"application/json","apikey":SERVICE_ROLE_KEY},cache:"no-store",redirect:"manual",body:JSON.stringify(body)});
  let data:Obj={};try{data=obj(await res.json());}catch{data={};}
  return{ok:res.ok&&data.status==="success",status:res.status,data};
}
function safeValidationMessage(data:Obj){const x=obj(data.validation);let raw="";try{raw=JSON.stringify(x);}catch{raw="";}return raw.slice(0,6000);}
function repairPrompt(prompt:string,data:Obj){const code=s(data.code,200)||"validation_failed",detail=safeValidationMessage(data);return `${prompt}\n\n---\nLẦN TẠO TRƯỚC CHƯA VƯỢT KIỂM ĐỊNH SERVER.\nMã lỗi: ${code}\n${detail?`Chi tiết kiểm định: ${detail}\n`:""}Hãy tạo lại TOÀN BỘ đề, sửa triệt để các lỗi trên nhưng vẫn tuân thủ nguyên vẹn ASSESSMENT AUTHORITY, KNOWLEDGE PACKAGE, source_refs và DAMSAN_EXAM_V1. Chỉ trả về một JSON object hoàn chỉnh.`;}
function shouldRepair(data:Obj){const code=s(data.code,200);if(/^WORKER_|^worker_|^orchestrator_http_|^provider_|^staff_|^generation_|^handoff_|^provider_or_model_invalid$|^model_not_found$/.test(code))return false;return !code.startsWith("request_forbidden")&&!code.startsWith("provider_forbidden");}

async function generateAuto(req:Request,actor:Actor,body:Obj){
  const requestId=s(body.request_id,80),prompt=typeof body.prompt==="string"?body.prompt.trim():"";
  if(!isUuid(requestId))throw new Error("request_invalid");if(!prompt||prompt.length>MAX_PROMPT_CHARS)throw new Error("prompt_invalid");
  const candidates=await routeCandidates(actor);if(!candidates.length)return json(req,409,{status:"error",code:"ai_route_unavailable",message:"Chưa có kết nối AI/model khả dụng."});
  let attemptNo=0;const failures:Obj[]=[];
  for(const candidate of candidates){
    let workingPrompt=prompt;
    for(let localAttempt=0;localAttempt<2&&attemptNo<MAX_ROUTE_ATTEMPTS;localAttempt++){
      attemptNo++;
      const providerId=s(candidate.provider.id,80),modelProfileId=s(candidate.model.id,80);
      const result=await callOrchestrator({action:"generate_exam",request_id:requestId,provider_id:providerId,model_profile_id:modelProfileId,prompt:workingPrompt,staff_token:s(body.staff_token,2048),ma_gv:actor.ma_gv});
      if(result.ok){return json(req,200,{...result.data,action:"generate_exam_auto",route_attempts:attemptNo,route_candidate_count:candidates.length});}
      const code=s(result.data.code,200)||`orchestrator_http_${result.status}`;
      failures.push({provider:s(candidate.provider.display_name,120),model:s(candidate.model.model_id,300),code});
      if(localAttempt===0&&shouldRepair(result.data)){workingPrompt=repairPrompt(prompt,result.data);continue;}
      break;
    }
  }
  return json(req,422,{status:"error",code:"ai_route_exhausted",message:"Tất cả model khả dụng đều chưa tạo được đề hợp lệ.",attempts:attemptNo,failures:failures.slice(0,10)});
}

function clientStatus(code:string){if(code.includes("staff_session"))return 401;if(code.includes("forbidden"))return 403;if(code.includes("not_found"))return 404;if(code.startsWith("request_")||code.startsWith("prompt_"))return 400;return 500;}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});if(req.method!=="POST")return json(req,405,{status:"error",code:"method_not_allowed"});try{const body=obj(await req.json()),actor=await requireStaff(body),action=s(body.action,80);if(action==="route_status")return await routeStatus(req,actor);if(action==="route_plan")return await routePlan(req,actor);if(action==="generate_exam_auto")return await generateAuto(req,actor,body);return json(req,400,{status:"error",code:"action_invalid"});}catch(e){const code=e instanceof Error?e.message:"ai_router_failed";if(clientStatus(code)>=500)console.error("exam-ai-router",e);return json(req,clientStatus(code),{status:"error",code,message:code});}});