import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_PASSWORD_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
const MAX_PROMPT_CHARS = 7_500_000;
const MAX_PROVIDER_RESPONSE_CHARS = 3_000_000;
const MAX_PROVIDER_RESPONSE_BYTES = 4_000_000;
const DEFAULT_TIMEOUT_MS = 180_000;
const STALE_RUN_MS = 8 * 60 * 1000;
const HEARTBEAT_MS = 15_000;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth:{persistSession:false,autoRefreshToken:false} });

type Obj = Record<string, unknown>;
type Actor = { id:string; ma_gv:string; truong_id:string; quyen:string };
type ProviderResult = {
  text:string; providerRequestId?:string; inputTokens?:number; outputTokens?:number;
  finishReason?:string; httpStatus:number; durationMs:number;
};

function cors(req:Request){const origin=req.headers.get("origin")||"*";return{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"content-type, x-client-info, apikey","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function json(req:Request,status:number,body:Obj){return new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function s(v:unknown,max=1000){return typeof v==="string"?v.trim().slice(0,max):"";}
function obj(v:unknown):Obj{return v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:{};}
function isUuid(v:unknown):v is string{return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function num(v:unknown,min:number,max:number){const n=Number(v);return Number.isFinite(n)?Math.min(Math.max(n,min),max):undefined;}
async function sha256Hex(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function randomCapability(){const b=new Uint8Array(32);crypto.getRandomValues(b);let x="";for(const n of b)x+=String.fromCharCode(n);return btoa(x).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");}

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

function ipv4Private(host:string){const m=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);if(!m)return false;const a=m.slice(1).map(Number);if(a.some(n=>n<0||n>255))return true;return a[0]===10||a[0]===127||a[0]===0||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168)||(a[0]===100&&a[1]>=64&&a[1]<=127);}
function ipv6Private(host:string){const h=host.toLowerCase().replace(/^\[|\]$/g,"");return h==="::1"||h==="::"||h.startsWith("fc")||h.startsWith("fd")||h.startsWith("fe8")||h.startsWith("fe9")||h.startsWith("fea")||h.startsWith("feb");}
function checkedUrl(raw:string){let u:URL;try{u=new URL(raw);}catch{throw new Error("provider_url_invalid");}if(u.protocol!=="https:"||u.username||u.password)throw new Error("provider_url_invalid");const h=u.hostname.toLowerCase();if(!h||h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h==="metadata.google.internal"||ipv4Private(h)||ipv6Private(h))throw new Error("provider_url_private_forbidden");u.hash="";return u;}
function joinUrl(base:string,path:string){const b=checkedUrl(base);const suffix=path.replace(/^\/+/,"");if(!suffix)return b;if(!b.pathname.endsWith("/"))b.pathname+="/";return new URL(suffix,b);}

function authHeaders(provider:Obj,secret:string){const h:Record<string,string>={"Content-Type":"application/json","Accept":"application/json"};const t=s(provider.auth_type,20)||"BEARER",prefix=String(provider.auth_prefix??"");if(t==="BEARER")h.Authorization=`${prefix||"Bearer "}${secret}`;else if(t==="HEADER")h[s(provider.auth_header,100)||"X-API-Key"]=`${prefix}${secret}`;if(provider.adapter_type==="ANTHROPIC_MESSAGES")h["anthropic-version"]="2023-06-01";return h;}
function applyQueryAuth(url:URL,provider:Obj,secret:string){if(provider.auth_type==="QUERY")url.searchParams.set(s(provider.auth_header,100)||"key",`${String(provider.auth_prefix??"")}${secret}`);if(provider.adapter_type==="GEMINI_GENERATE_CONTENT"&&provider.auth_type!=="NONE"&&provider.auth_type!=="HEADER")url.searchParams.set(s(provider.auth_header,100)||"key",secret);}
async function providerSecret(provider:Obj){if(provider.auth_type==="NONE")return"";const sid=s(provider.secret_id,80);if(!isUuid(sid))throw new Error("provider_secret_missing");const r=await admin.rpc("_ai_provider_vault_read_065a",{p_secret_id:sid});if(r.error||typeof r.data!=="string"||!r.data)throw new Error("provider_secret_missing");return r.data;}

async function loadProviderModel(actor:Actor,providerId:string,modelProfileId:string){
  if(!isUuid(providerId)||!isUuid(modelProfileId))throw new Error("provider_or_model_invalid");
  const p=await admin.from("ai_provider_connections").select("*").eq("id",providerId).maybeSingle();if(p.error||!p.data||p.data.enabled===false)throw new Error("provider_not_found");
  const readable=p.data.owner_scope==="SYSTEM"||(p.data.owner_scope==="SCHOOL"&&p.data.truong_id===actor.truong_id)||(p.data.owner_scope==="PERSONAL"&&p.data.owner_gv_id===actor.id);if(!readable)throw new Error("provider_forbidden");
  const m=await admin.from("ai_model_profiles").select("*").eq("id",modelProfileId).eq("provider_connection_id",providerId).maybeSingle();if(m.error||!m.data||m.data.enabled===false)throw new Error("model_not_found");
  return{provider:p.data as Obj,model:m.data as Obj};
}
async function loadRequest(actor:Actor,requestId:string){if(!isUuid(requestId))throw new Error("request_invalid");const r=await admin.from("ai_exam_requests").select("id,requested_by,status,ma_phong,exam_spec").eq("id",requestId).maybeSingle();if(r.error||!r.data)throw new Error("request_not_found");if(r.data.requested_by!==actor.id)throw new Error("request_forbidden");if(!["AWAITING_AI","AI_WORKING"].includes(r.data.status))throw new Error("request_not_ai_writable");return r.data as Obj;}

function mergeParameters(model:Obj,body:Obj){const base=obj(model.default_parameters),extra=obj(body.parameters);const merged={...base,...extra};const out:Obj={};const temperature=num(merged.temperature,0,2),topP=num(merged.top_p,0,1),maxOut=num(merged.max_output_tokens??merged.max_tokens,512,65536);if(temperature!==undefined)out.temperature=temperature;if(topP!==undefined)out.top_p=topP;if(maxOut!==undefined)out.max_output_tokens=Math.trunc(maxOut);const reasoning=s(merged.reasoning_effort,20);if(["minimal","low","medium","high","xhigh"].includes(reasoning))out.reasoning_effort=reasoning;return out;}
function replaceTemplate(v:unknown,model:string,prompt:string):unknown{if(typeof v==="string")return v.replaceAll("{{model}}",model).replaceAll("{{prompt}}",prompt);if(Array.isArray(v))return v.map(x=>replaceTemplate(x,model,prompt));if(v&&typeof v==="object"){const out:Obj={};for(const[k,x]of Object.entries(v as Obj))out[k]=replaceTemplate(x,model,prompt);return out;}return v;}
function getPath(root:unknown,path:string):unknown{let cur:unknown=root;for(const part of path.split(".").filter(Boolean)){if(cur==null)return undefined;if(/^\d+$/.test(part)&&Array.isArray(cur))cur=cur[Number(part)];else if(typeof cur==="object"&&!Array.isArray(cur))cur=(cur as Obj)[part];else return undefined;}return cur;}
function textFromContent(v:unknown){if(typeof v==="string")return v;if(Array.isArray(v))return v.map(x=>{if(typeof x==="string")return x;const o=obj(x);return s(o.text,3_000_000);}).join("");return"";}

function providerRequest(provider:Obj,model:Obj,prompt:string,params:Obj){
  const adapter=s(provider.adapter_type,60),modelId=s(model.model_id,300),base=s(provider.base_url,1000),options=obj(provider.provider_options);let url:URL,body:Obj;
  if(adapter==="OPENAI_RESPONSES"){
    url=joinUrl(base,"responses");body={model:modelId,input:prompt};if(params.max_output_tokens)body.max_output_tokens=params.max_output_tokens;if(params.temperature!==undefined)body.temperature=params.temperature;if(params.top_p!==undefined)body.top_p=params.top_p;if(params.reasoning_effort)body.reasoning={effort:params.reasoning_effort};
  }else if(adapter==="OPENAI_CHAT"||adapter==="OPENAI_COMPAT"){
    url=joinUrl(base,"chat/completions");body={model:modelId,messages:[{role:"user",content:prompt}],stream:false};if(params.max_output_tokens)body.max_tokens=params.max_output_tokens;if(params.temperature!==undefined)body.temperature=params.temperature;if(params.top_p!==undefined)body.top_p=params.top_p;if(params.reasoning_effort)body.reasoning_effort=params.reasoning_effort;const caps=obj(model.capabilities);if(caps.json_mode===true)body.response_format={type:"json_object"};
  }else if(adapter==="ANTHROPIC_MESSAGES"){
    url=joinUrl(base,"messages");body={model:modelId,max_tokens:params.max_output_tokens||32768,messages:[{role:"user",content:prompt}]};if(params.temperature!==undefined)body.temperature=params.temperature;if(params.top_p!==undefined)body.top_p=params.top_p;
  }else if(adapter==="GEMINI_GENERATE_CONTENT"){
    const cleanModel=modelId.replace(/^models\//,"");url=joinUrl(base,`models/${encodeURIComponent(cleanModel)}:generateContent`);const generationConfig:Obj={};if(params.max_output_tokens)generationConfig.maxOutputTokens=params.max_output_tokens;if(params.temperature!==undefined)generationConfig.temperature=params.temperature;if(params.top_p!==undefined)generationConfig.topP=params.top_p;const caps=obj(model.capabilities);if(caps.json_mode===true)generationConfig.responseMimeType="application/json";body={contents:[{role:"user",parts:[{text:prompt}]}],generationConfig};
  }else if(adapter==="CUSTOM_JSON_HTTP"){
    const path=s(options.generation_path,500);if(!path)throw new Error("custom_generation_path_missing");url=joinUrl(base,path.replaceAll("{model}",encodeURIComponent(modelId)));const tmpl=options.request_template;if(!tmpl||typeof tmpl!=="object"||Array.isArray(tmpl))throw new Error("custom_request_template_missing");body=replaceTemplate(tmpl,modelId,prompt) as Obj;
  }else throw new Error("provider_adapter_unsupported");
  return{adapter,url,body,options};
}

function extractProviderResult(adapter:string,payload:unknown,options:Obj):{text:string;inputTokens?:number;outputTokens?:number;finishReason?:string;providerRequestId?:string}{
  const r=obj(payload);let text="",inputTokens:undefined|number,outputTokens:undefined|number,finishReason="",providerRequestId=s(r.id,300)||undefined;
  if(adapter==="OPENAI_RESPONSES"){
    text=s(r.output_text,MAX_PROVIDER_RESPONSE_CHARS);if(!text&&Array.isArray(r.output))text=(r.output as unknown[]).flatMap(x=>{const o=obj(x);return Array.isArray(o.content)?o.content as unknown[]:[];}).map(x=>s(obj(x).text,MAX_PROVIDER_RESPONSE_CHARS)).join("");const u=obj(r.usage);inputTokens=Number(u.input_tokens)||undefined;outputTokens=Number(u.output_tokens)||undefined;finishReason=s(r.status,80);
  }else if(adapter==="OPENAI_CHAT"||adapter==="OPENAI_COMPAT"){
    const choices=Array.isArray(r.choices)?r.choices as unknown[]:[];const first=obj(choices[0]);text=textFromContent(obj(first.message).content);finishReason=s(first.finish_reason,80);const u=obj(r.usage);inputTokens=Number(u.prompt_tokens??u.input_tokens)||undefined;outputTokens=Number(u.completion_tokens??u.output_tokens)||undefined;
  }else if(adapter==="ANTHROPIC_MESSAGES"){
    text=textFromContent(r.content);finishReason=s(r.stop_reason,80);const u=obj(r.usage);inputTokens=Number(u.input_tokens)||undefined;outputTokens=Number(u.output_tokens)||undefined;
  }else if(adapter==="GEMINI_GENERATE_CONTENT"){
    const candidates=Array.isArray(r.candidates)?r.candidates as unknown[]:[];const first=obj(candidates[0]);const parts=Array.isArray(obj(first.content).parts)?obj(first.content).parts as unknown[]:[];text=parts.map(x=>s(obj(x).text,MAX_PROVIDER_RESPONSE_CHARS)).join("");finishReason=s(first.finishReason,80);const u=obj(r.usageMetadata);inputTokens=Number(u.promptTokenCount)||undefined;outputTokens=Number(u.candidatesTokenCount)||undefined;
  }else if(adapter==="CUSTOM_JSON_HTTP"){
    const path=s(options.response_text_path,500);if(!path)throw new Error("custom_response_text_path_missing");text=textFromContent(getPath(payload,path));const idPath=s(options.response_id_path,500);if(idPath)providerRequestId=s(getPath(payload,idPath),300)||providerRequestId;
  }
  text=text.trim().slice(0,MAX_PROVIDER_RESPONSE_CHARS);if(!text)throw new Error("provider_response_text_missing");return{text,inputTokens,outputTokens,finishReason:finishReason||undefined,providerRequestId};
}

async function readResponseTextBounded(res:Response,maxBytes:number){
  if(!res.body)return"";
  const reader=res.body.getReader();const chunks:Uint8Array[]=[];let total=0;
  try{
    while(true){
      const next=await reader.read();if(next.done)break;if(!next.value)continue;
      if(total+next.value.byteLength>maxBytes){try{await reader.cancel("provider_response_too_large");}catch{/* noop */}throw new Error("provider_response_too_large");}
      chunks.push(next.value);total+=next.value.byteLength;
    }
  }finally{try{reader.releaseLock();}catch{/* noop */}}
  const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(merged);
}

async function callProvider(provider:Obj,model:Obj,prompt:string,params:Obj):Promise<ProviderResult>{
  const secret=await providerSecret(provider);const built=providerRequest(provider,model,prompt,params);applyQueryAuth(built.url,provider,secret);const timeout=Math.trunc(num(obj(provider.provider_options).timeout_ms,10_000,240_000)||DEFAULT_TIMEOUT_MS);const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeout);const started=Date.now();
  try{
    const res=await fetch(built.url,{method:"POST",headers:authHeaders(provider,secret),body:JSON.stringify(built.body),redirect:"manual",signal:ctrl.signal});
    if(res.status>=300&&res.status<400)throw new Error("provider_redirect_forbidden");const raw=await readResponseTextBounded(res,MAX_PROVIDER_RESPONSE_BYTES);let payload:unknown;try{payload=JSON.parse(raw);}catch{throw new Error(`provider_response_json_invalid_${res.status}`);}if(!res.ok)throw new Error(`provider_http_${res.status}`);const parsed=extractProviderResult(built.adapter,payload,built.options);return{...parsed,httpStatus:res.status,durationMs:Date.now()-started,providerRequestId:parsed.providerRequestId||res.headers.get("x-request-id")||undefined};
  }catch(e){if(e instanceof DOMException&&e.name==="AbortError")throw new Error("provider_timeout");throw e;}finally{clearTimeout(timer);}
}

function parseExam(text:string){let x=text.trim();const fenced=x.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);if(fenced)x=fenced[1].trim();try{const p=JSON.parse(x);if(p&&typeof p==="object"&&!Array.isArray(p))return p as Obj;}catch{/* fallback */}const a=x.indexOf("{"),b=x.lastIndexOf("}");if(a>=0&&b>a){const p=JSON.parse(x.slice(a,b+1));if(p&&typeof p==="object"&&!Array.isArray(p))return p as Obj;}throw new Error("model_output_not_exam_json");}

async function issueCapability(requestId:string,actorId:string){const token=randomCapability(),hash=await sha256Hex(token),expires=new Date(Date.now()+45*60*1000).toISOString();const r=await admin.rpc("rpc_ai_exam_issue_handoff_service",{p_request_id:requestId,p_requested_by:actorId,p_capability_hash:hash,p_expires_at:expires});if(r.error||!r.data||r.data.status!=="success")throw new Error("handoff_issue_failed");return token;}
async function submitToCanonicalBridge(capability:string,providerLabel:string,modelId:string,exam:Obj){const res=await fetch(`${SUPABASE_URL}/functions/v1/exam-ai-bridge`,{method:"POST",headers:{"Content-Type":"application/json","apikey":SERVICE_ROLE_KEY},body:JSON.stringify({action:"submit_exam_draft",capability_token:capability,ai_provider:providerLabel,ai_model:modelId,exam}),redirect:"manual"});let data:Obj={};try{data=obj(await res.json());}catch{data={};}if(!res.ok||data.status!=="success"){const err=new Error(s(data.code,200)||`bridge_http_${res.status}`);(err as Error&{detail?:Obj}).detail=data;throw err;}return data;}

async function reconcileStaleRuns(requestId:string,actorId:string){
  const cutoff=new Date(Date.now()-STALE_RUN_MS).toISOString();
  const r=await admin.from("ai_generation_runs").select("id").eq("request_id",requestId).eq("requested_by",actorId).in("status",["RUNNING","PROVIDER_SUCCEEDED"]).lt("created_at",cutoff);
  if(r.error||!r.data?.length)return;
  const ids=r.data.map(x=>x.id).filter(isUuid);if(!ids.length)return;const finished=new Date().toISOString();
  await admin.from("ai_generation_attempts").update({status:"FAILED",error_class:"worker_interrupted_stale",finished_at:finished}).in("run_id",ids).eq("status","STARTED");
  await admin.from("ai_generation_runs").update({status:"FAILED",error_code:"worker_interrupted_stale",error_detail_safe:"Previous Edge worker ended before terminal telemetry was written.",finished_at:finished}).in("id",ids);
}

async function safeRunUpdate(runId:string,patch:Obj){await admin.from("ai_generation_runs").update(patch).eq("id",runId);}
async function generate(req:Request,actor:Actor,body:Obj){
  const requestId=s(body.request_id,80),providerId=s(body.provider_id,80),modelProfileId=s(body.model_profile_id,80);const prompt=typeof body.prompt==="string"?body.prompt.trim():"";if(!prompt||prompt.length>MAX_PROMPT_CHARS)throw new Error("prompt_invalid");
  const request=await loadRequest(actor,requestId);await reconcileStaleRuns(requestId,actor.id);const{provider,model}=await loadProviderModel(actor,providerId,modelProfileId);const params=mergeParameters(model,body);const promptHash=await sha256Hex(prompt);
  const ins=await admin.from("ai_generation_runs").insert({request_id:requestId,requested_by:actor.id,provider_connection_id:providerId,model_profile_id:modelProfileId,provider_name_snapshot:s(provider.display_name,120),adapter_type_snapshot:s(provider.adapter_type,60),model_id_snapshot:s(model.model_id,300),prompt_sha256:promptHash,parameters_snapshot:params,status:"RUNNING"}).select("id").single();if(ins.error||!ins.data)throw new Error("generation_run_create_failed");const runId=ins.data.id as string;
  const attempt=await admin.from("ai_generation_attempts").insert({run_id:runId,attempt_no:1,provider_connection_id:providerId,model_profile_id:modelProfileId,status:"STARTED"}).select("id").single();const attemptId=attempt.data?.id as string|undefined;
  try{
    const pr=await callProvider(provider,model,prompt,params);if(attemptId)await admin.from("ai_generation_attempts").update({status:"SUCCEEDED",http_status:pr.httpStatus,duration_ms:pr.durationMs,provider_request_id:pr.providerRequestId||null,finished_at:new Date().toISOString()}).eq("id",attemptId);
    await safeRunUpdate(runId,{status:"PROVIDER_SUCCEEDED",provider_request_id:pr.providerRequestId||null,input_tokens:pr.inputTokens||null,output_tokens:pr.outputTokens||null,finish_reason:pr.finishReason||null,duration_ms:pr.durationMs});
    const exam=parseExam(pr.text);const capability=await issueCapability(requestId,actor.id);const bridge=await submitToCanonicalBridge(capability,`API:${s(provider.display_name,110)}`,s(model.model_id,160),exam);
    await safeRunUpdate(runId,{status:"VALIDATED",result_request_status:s(bridge.request_status,80)||"READY_FOR_REVIEW",result_revision:Number(bridge.revision)||null,finished_at:new Date().toISOString()});
    return json(req,200,{status:"success",action:"generate_exam",run_id:runId,request_id:requestId,ma_phong:request.ma_phong,provider:s(provider.display_name,120),model:s(model.model_id,300),request_status:bridge.request_status||"READY_FOR_REVIEW",revision:bridge.revision,validation:bridge.validation||null,quality:bridge.quality||null});
  }catch(e){const code=e instanceof Error?e.message:"api_generation_failed";if(attemptId)await admin.from("ai_generation_attempts").update({status:"FAILED",error_class:code.slice(0,160),finished_at:new Date().toISOString()}).eq("id",attemptId);await safeRunUpdate(runId,{status:"FAILED",error_code:code.slice(0,160),error_detail_safe:code.slice(0,1000),finished_at:new Date().toISOString()});const detail=(e as Error&{detail?:Obj})?.detail;return json(req,code.startsWith("provider_")?502:422,{status:"error",code,run_id:runId,request_id:requestId,validation:detail||null});}
}

function streamGenerate(req:Request,actor:Actor,body:Obj){
  const encoder=new TextEncoder();let heartbeat:number|undefined;let closed=false;
  const stream=new ReadableStream({
    start(controller){
      const push=(text:string)=>{if(closed)return;try{controller.enqueue(encoder.encode(text));}catch{closed=true;}};
      push(" \n");heartbeat=setInterval(()=>push(" \n"),HEARTBEAT_MS);
      const task=(async()=>{
        try{const response=await generate(req,actor,body);push(await response.text());}
        catch(e){const code=e instanceof Error?e.message:"api_orchestrator_failed";push(JSON.stringify({status:"error",code,message:code}));}
        finally{if(heartbeat!==undefined)clearInterval(heartbeat);if(!closed){closed=true;try{controller.close();}catch{/* noop */}}}
      })();
      const edge=(globalThis as unknown as {EdgeRuntime?:{waitUntil?:(promise:Promise<unknown>)=>void}}).EdgeRuntime;edge?.waitUntil?.(task);
    },
    cancel(){closed=true;if(heartbeat!==undefined)clearInterval(heartbeat);}
  });
  return new Response(stream,{status:200,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

async function listRuns(req:Request,actor:Actor,body:Obj){const requestId=s(body.request_id,80);let q=admin.from("ai_generation_runs").select("id,request_id,provider_name_snapshot,adapter_type_snapshot,model_id_snapshot,status,provider_request_id,input_tokens,output_tokens,finish_reason,duration_ms,error_code,result_request_status,result_revision,created_at,finished_at").eq("requested_by",actor.id).order("created_at",{ascending:false}).limit(30);if(isUuid(requestId))q=q.eq("request_id",requestId);const r=await q;if(r.error)throw r.error;return json(req,200,{status:"success",action:"list_runs",runs:r.data||[]});}
function clientStatus(code:string){if(code.includes("staff_session"))return 401;if(code.includes("forbidden"))return 403;if(code.includes("not_found"))return 404;if(code.startsWith("request_")||code.startsWith("prompt_")||code.startsWith("provider_")||code.startsWith("model_")||code.startsWith("custom_"))return 400;return 500;}

Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});if(req.method!=="POST")return json(req,405,{status:"error",code:"method_not_allowed"});try{const body=obj(await req.json()),actor=await requireStaff(body),action=s(body.action,80);if(action==="generate_exam_stream")return streamGenerate(req,actor,body);if(action==="generate_exam")return await generate(req,actor,body);if(action==="list_runs")return await listRuns(req,actor,body);return json(req,400,{status:"error",code:"action_invalid"});}catch(e){const code=e instanceof Error?e.message:"api_orchestrator_failed";if(clientStatus(code)>=500)console.error("exam-ai-orchestrator",e);return json(req,clientStatus(code),{status:"error",code,message:code});}});