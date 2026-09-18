import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const MAX_MODELS = 500;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false } });

type Obj = Record<string, unknown>;
type Actor = { id:string; ma_gv:string; truong_id:string; quyen:string };

const ADAPTERS = new Set([
  "OPENAI_RESPONSES","OPENAI_CHAT","OPENAI_COMPAT",
  "ANTHROPIC_MESSAGES","GEMINI_GENERATE_CONTENT","CUSTOM_JSON_HTTP"
]);
const OWNER_SCOPES = new Set(["PERSONAL","SCHOOL","SYSTEM"]);
const AUTH_TYPES = new Set(["BEARER","HEADER","QUERY","NONE"]);
const DISCOVERY = new Set(["AUTO","MANUAL","HYBRID"]);

function cors(req:Request) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":"content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Vary":"Origin"
  };
}
function response(req:Request,status:number,body:Obj) {
  return new Response(JSON.stringify(body), { status, headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"} });
}
function s(v:unknown,max=1000){ return typeof v === "string" ? v.trim().slice(0,max) : ""; }
function obj(v:unknown):Obj { return v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {}; }
function isUuid(v:unknown):v is string { return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
async function sha256Hex(value:string){ const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)); return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join(""); }

async function requireStaff(body:Obj):Promise<Actor>{
  const token=s(body.staff_token,2048), maGv=s(body.ma_gv,160);
  if(!token||!maGv) throw new Error("staff_session_invalid");
  const hash=await sha256Hex(token);
  const {data:session,error:se}=await admin.from("staff_sessions").select("gv_id,expires_at,revoked_at").eq("token_hash",hash).is("revoked_at",null).maybeSingle();
  if(se||!session||!isUuid(session.gv_id)||!session.expires_at||new Date(session.expires_at).getTime()<=Date.now()) throw new Error("staff_session_invalid");
  const {data:teacher,error:te}=await admin.from("giao_vien").select("id,ma_gv,truong_id,quyen,mat_khau").eq("id",session.gv_id).maybeSingle();
  if(te||!teacher||!isUuid(teacher.id)||!isUuid(teacher.truong_id)||teacher.ma_gv!==maGv) throw new Error("staff_session_invalid");
  if(teacher.mat_khau==="123456"||teacher.mat_khau===DEFAULT_PASSWORD_HASH) throw new Error("staff_session_invalid");
  return {id:teacher.id,ma_gv:teacher.ma_gv,truong_id:teacher.truong_id,quyen:teacher.quyen};
}

function ipv4Private(host:string){
  const m=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); if(!m) return false;
  const a=m.slice(1).map(Number); if(a.some(n=>n<0||n>255)) return true;
  return a[0]===10||a[0]===127||a[0]===0||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168)||(a[0]===100&&a[1]>=64&&a[1]<=127);
}
function ipv6Private(host:string){ const h=host.toLowerCase().replace(/^\[|\]$/g,""); return h==="::1"||h==="::"||h.startsWith("fc")||h.startsWith("fd")||h.startsWith("fe8")||h.startsWith("fe9")||h.startsWith("fea")||h.startsWith("feb"); }
function checkedUrl(raw:string){
  let u:URL; try{u=new URL(raw);}catch{throw new Error("provider_url_invalid");}
  if(u.protocol!=="https:"||u.username||u.password) throw new Error("provider_url_invalid");
  const h=u.hostname.toLowerCase();
  if(!h||h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h==="metadata.google.internal"||ipv4Private(h)||ipv6Private(h)) throw new Error("provider_url_private_forbidden");
  u.hash=""; return u;
}
function joinUrl(base:string,path:string){ const b=checkedUrl(base); const suffix=path.replace(/^\/+/,""); if(!suffix) return b; if(!b.pathname.endsWith("/")) b.pathname += "/"; return new URL(suffix,b); }

function authHeaders(provider:Obj,secret:string){
  const headers:Record<string,string>={"Accept":"application/json"};
  const t=s(provider.auth_type,20)||"BEARER", prefix=String(provider.auth_prefix??"");
  if(t==="BEARER") headers.Authorization=`${prefix||"Bearer "}${secret}`;
  else if(t==="HEADER") headers[s(provider.auth_header,100)||"X-API-Key"]=`${prefix}${secret}`;
  if(provider.adapter_type==="ANTHROPIC_MESSAGES") headers["anthropic-version"]="2023-06-01";
  return headers;
}
function applyQueryAuth(url:URL,provider:Obj,secret:string){
  if(provider.auth_type==="QUERY") url.searchParams.set(s(provider.auth_header,100)||"key",`${String(provider.auth_prefix??"")}${secret}`);
  if(provider.adapter_type==="GEMINI_GENERATE_CONTENT" && provider.auth_type!=="NONE" && provider.auth_type!=="HEADER") url.searchParams.set(s(provider.auth_header,100)||"key",secret);
}
function defaultModelsPath(adapter:string){ return adapter==="CUSTOM_JSON_HTTP"?"": "models"; }
function normalizeModels(payload:unknown){
  const root=obj(payload); let arr:unknown[]=[];
  if(Array.isArray(root.data)) arr=root.data;
  else if(Array.isArray(root.models)) arr=root.models;
  else if(Array.isArray(root.items)) arr=root.items;
  return arr.slice(0,MAX_MODELS).map((x)=>{
    if(typeof x==="string") return {model_id:x,display_name:x};
    const o=obj(x); const id=s(o.id??o.name??o.model,300).replace(/^models\//,"");
    return id?{model_id:id,display_name:s(o.display_name??o.displayName??o.name??o.id,300).replace(/^models\//,"")||id}:null;
  }).filter(Boolean) as {model_id:string;display_name:string}[];
}
async function providerSecret(provider:Obj){
  if(provider.auth_type==="NONE") return "";
  const sid=s(provider.secret_id,80); if(!isUuid(sid)) throw new Error("provider_secret_missing");
  const {data,error}=await admin.rpc("_ai_provider_vault_read_065a",{p_secret_id:sid});
  if(error||typeof data!=="string"||!data) throw new Error("provider_secret_missing"); return data;
}
async function assertProviderAccess(actor:Actor,id:string,write=false){
  if(!isUuid(id)) throw new Error("provider_invalid");
  const {data:p,error}=await admin.from("ai_provider_connections").select("*").eq("id",id).maybeSingle();
  if(error||!p) throw new Error("provider_not_found");
  const readable=p.owner_scope==="SYSTEM"||(p.owner_scope==="SCHOOL"&&p.truong_id===actor.truong_id)||(p.owner_scope==="PERSONAL"&&p.owner_gv_id===actor.id);
  const writable=(p.owner_scope==="PERSONAL"&&p.owner_gv_id===actor.id)||(p.owner_scope==="SCHOOL"&&actor.quyen==="Admin"&&p.truong_id===actor.truong_id);
  if(!(write?writable:readable)) throw new Error("provider_forbidden"); return p as Obj;
}

async function listProviders(req:Request,actor:Actor){
  const {data,error}=await admin.from("ai_provider_connections")
    .select("id,owner_scope,owner_gv_id,truong_id,display_name,adapter_type,base_url,auth_type,auth_header,auth_prefix,secret_hint,discovery_mode,models_path,provider_options,enabled,last_tested_at,last_test_status,last_test_message,created_at,updated_at")
    .or(`owner_gv_id.eq.${actor.id},truong_id.eq.${actor.truong_id},owner_scope.eq.SYSTEM`).order("created_at",{ascending:true});
  if(error) throw error;
  const ids=(data||[]).map((p)=>p.id); let models:Obj[]=[];
  if(ids.length){ const r=await admin.from("ai_model_profiles").select("id,provider_connection_id,model_id,display_name,capabilities,default_parameters,enabled,discovered_at,created_at,updated_at").in("provider_connection_id",ids).order("display_name"); if(r.error) throw r.error; models=r.data||[]; }
  const providers=(data||[]).filter((p)=>p.owner_scope==="SYSTEM"||(p.owner_scope==="SCHOOL"&&p.truong_id===actor.truong_id)||(p.owner_scope==="PERSONAL"&&p.owner_gv_id===actor.id)).map((p)=>({...p,has_secret:p.auth_type==="NONE"||!!p.secret_hint,models:models.filter((m)=>m.provider_connection_id===p.id)}));
  return response(req,200,{status:"success",action:"list",providers});
}

async function saveProvider(req:Request,actor:Actor,body:Obj){
  const id=s(body.provider_id,80); const existing=id?await assertProviderAccess(actor,id,true):null;
  const scope=s(body.owner_scope,20)||"PERSONAL"; if(!OWNER_SCOPES.has(scope)||scope==="SYSTEM") throw new Error("provider_scope_invalid");
  if(scope==="SCHOOL"&&actor.quyen!=="Admin") throw new Error("provider_scope_forbidden");
  const adapter=s(body.adapter_type,60); if(!ADAPTERS.has(adapter)) throw new Error("provider_adapter_invalid");
  const auth=s(body.auth_type,20)||"BEARER"; if(!AUTH_TYPES.has(auth)) throw new Error("provider_auth_invalid");
  const discovery=s(body.discovery_mode,20)||"HYBRID"; if(!DISCOVERY.has(discovery)) throw new Error("provider_discovery_invalid");
  const base=checkedUrl(s(body.base_url,1000)).toString().replace(/\/$/,"");
  const display=s(body.display_name,120); if(!display) throw new Error("provider_name_required");
  const apiKey=s(body.api_key,8000); if(auth!=="NONE"&&!apiKey&&!existing?.secret_id) throw new Error("provider_secret_required");
  const targetSchool=scope==="SCHOOL"?actor.truong_id:null;
  const row:Obj={owner_scope:scope,owner_gv_id:scope==="PERSONAL"?actor.id:null,truong_id:targetSchool,created_by:existing?.created_by||actor.id,display_name:display,adapter_type:adapter,base_url:base,auth_type:auth,auth_header:s(body.auth_header,100)||null,auth_prefix:typeof body.auth_prefix==="string"?body.auth_prefix.slice(0,60):"",discovery_mode:discovery,models_path:s(body.models_path,300)||null,provider_options:obj(body.provider_options),enabled:body.enabled!==false,updated_at:new Date().toISOString()};
  let providerId=id;
  if(existing){ const r=await admin.from("ai_provider_connections").update(row).eq("id",id).select("id,secret_id").single(); if(r.error) throw r.error; }
  else { const r=await admin.from("ai_provider_connections").insert(row).select("id,secret_id").single(); if(r.error) throw r.error; providerId=r.data.id; }
  if(apiKey){
    const current=existing?.secret_id;
    if(current){ const r=await admin.rpc("_ai_provider_vault_update_065a",{p_secret_id:current,p_provider_id:providerId,p_secret:apiKey}); if(r.error) throw r.error; }
    else { const r=await admin.rpc("_ai_provider_vault_create_065a",{p_provider_id:providerId,p_secret:apiKey}); if(r.error||!isUuid(r.data)) throw r.error||new Error("provider_secret_store_failed"); await admin.from("ai_provider_connections").update({secret_id:r.data,secret_hint:`••••${apiKey.slice(-4)}`}).eq("id",providerId); }
    if(current) await admin.from("ai_provider_connections").update({secret_hint:`••••${apiKey.slice(-4)}`}).eq("id",providerId);
  } else if(auth==="NONE"&&existing?.secret_id){ await admin.rpc("_ai_provider_vault_delete_065a",{p_secret_id:existing.secret_id}); await admin.from("ai_provider_connections").update({secret_id:null,secret_hint:null}).eq("id",providerId); }
  return response(req,200,{status:"success",action:"save_provider",provider_id:providerId});
}

async function deleteProvider(req:Request,actor:Actor,body:Obj){
  const id=s(body.provider_id,80); const p=await assertProviderAccess(actor,id,true);
  const {error}=await admin.from("ai_provider_connections").delete().eq("id",id); if(error) throw error;
  if(isUuid(p.secret_id)) await admin.rpc("_ai_provider_vault_delete_065a",{p_secret_id:p.secret_id});
  return response(req,200,{status:"success",action:"delete_provider",provider_id:id});
}

async function saveModel(req:Request,actor:Actor,body:Obj){
  const providerId=s(body.provider_id,80); await assertProviderAccess(actor,providerId,true);
  const modelId=s(body.model_id,300), name=s(body.display_name,300)||modelId; if(!modelId) throw new Error("model_id_required");
  const row={provider_connection_id:providerId,model_id:modelId,display_name:name,capabilities:obj(body.capabilities),default_parameters:obj(body.default_parameters),enabled:body.enabled!==false,updated_at:new Date().toISOString()};
  const {data,error}=await admin.from("ai_model_profiles").upsert(row,{onConflict:"provider_connection_id,model_id"}).select("id").single(); if(error) throw error;
  return response(req,200,{status:"success",action:"save_model",model_profile_id:data.id});
}
async function deleteModel(req:Request,actor:Actor,body:Obj){
  const id=s(body.model_profile_id,80); if(!isUuid(id)) throw new Error("model_invalid");
  const r=await admin.from("ai_model_profiles").select("id,provider_connection_id").eq("id",id).maybeSingle(); if(r.error||!r.data) throw new Error("model_not_found"); await assertProviderAccess(actor,r.data.provider_connection_id,true);
  const d=await admin.from("ai_model_profiles").delete().eq("id",id); if(d.error) throw d.error;
  return response(req,200,{status:"success",action:"delete_model",model_profile_id:id});
}

async function callModels(provider:Obj){
  const secret=await providerSecret(provider); const path=s(provider.models_path,300)||defaultModelsPath(s(provider.adapter_type,60));
  if(!path) return {verified:false,models:[] as {model_id:string;display_name:string}[],message:"Provider ở chế độ thủ công và chưa cấu hình models_path."};
  const url=joinUrl(s(provider.base_url,1000),path); applyQueryAuth(url,provider,secret);
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),20000);
  try{
    const res=await fetch(url,{method:"GET",headers:authHeaders(provider,secret),redirect:"manual",signal:ctrl.signal});
    if(res.status>=300&&res.status<400) throw new Error("provider_redirect_forbidden");
    const text=await res.text(); let payload:unknown=null; try{payload=JSON.parse(text);}catch{payload=null;}
    if(!res.ok) throw new Error(`provider_http_${res.status}`);
    const models=normalizeModels(payload); return {verified:true,models,message:models.length?`Kết nối thành công; phát hiện ${models.length} model.`:"Kết nối thành công; endpoint không trả danh sách model chuẩn."};
  } finally {clearTimeout(timer);}
}
async function testProvider(req:Request,actor:Actor,body:Obj){
  const id=s(body.provider_id,80); const p=await assertProviderAccess(actor,id,false);
  let result:{verified:boolean;models:{model_id:string;display_name:string}[];message:string};
  try{ result=await callModels(p); await admin.from("ai_provider_connections").update({last_tested_at:new Date().toISOString(),last_test_status:result.verified?"OK":"UNVERIFIED",last_test_message:result.message}).eq("id",id); }
  catch(e){ const msg=e instanceof Error?e.message:"provider_test_failed"; await admin.from("ai_provider_connections").update({last_tested_at:new Date().toISOString(),last_test_status:"FAILED",last_test_message:msg.slice(0,500)}).eq("id",id); throw e; }
  if(result.models.length && s(p.discovery_mode,20)!=="MANUAL"){
    const rows=result.models.map(m=>({provider_connection_id:id,model_id:m.model_id,display_name:m.display_name,capabilities:{},default_parameters:{},enabled:true,discovered_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
    const u=await admin.from("ai_model_profiles").upsert(rows,{onConflict:"provider_connection_id,model_id"}); if(u.error) throw u.error;
  }
  return response(req,200,{status:"success",action:"test_provider",verified:result.verified,message:result.message,model_count:result.models.length});
}

function clientStatus(code:string){ if(code.includes("staff_session"))return 401; if(code.includes("forbidden")||code.includes("scope"))return 403; if(code.includes("not_found"))return 404; if(code.startsWith("provider_")||code.startsWith("model_"))return 400; return 500; }
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST") return response(req,405,{status:"error",code:"method_not_allowed"});
  try{
    const body=obj(await req.json()); const actor=await requireStaff(body); const action=s(body.action,80);
    if(action==="list") return await listProviders(req,actor);
    if(action==="save_provider") return await saveProvider(req,actor,body);
    if(action==="delete_provider") return await deleteProvider(req,actor,body);
    if(action==="save_model") return await saveModel(req,actor,body);
    if(action==="delete_model") return await deleteModel(req,actor,body);
    if(action==="test_provider") return await testProvider(req,actor,body);
    throw new Error("action_invalid");
  }catch(e){ const code=e instanceof Error?e.message:"provider_control_failed"; if(clientStatus(code)>=500) console.error("ai-provider-control",e); return response(req,clientStatus(code),{status:"error",code,message:code}); }
});
