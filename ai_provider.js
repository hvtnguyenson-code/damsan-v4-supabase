const AIP_SUPABASE_URL='https://xcervjnwlchwfqvbeahy.supabase.co';
// Only the site's public anon key is present in browser code. Provider API keys are sent once to the
// control Edge Function and thereafter remain server-side in Supabase Vault.
const AIP_PUBLIC_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InhjZXJ2am53bGNod2ZxdmJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NjksImV4cCI6MjA5MDY1Mjg2OX0.xjrY4YPDb5Q9BTenHrh2dUOnmZbegtKSZQPqzyJdxBo';
const AIP_ENDPOINT=`${AIP_SUPABASE_URL}/functions/v1/ai-provider-control`;
let aipProviders=[];
let aipCurrentId='';
let aipBusy=false;

function aipSession(){
  const token=sessionStorage.getItem('damSan_StaffToken');
  const expiresAt=sessionStorage.getItem('damSan_StaffExpiresAt');
  let profile=null;try{profile=JSON.parse(sessionStorage.getItem('damSan_GVSession')||'null');}catch{profile=null;}
  const expiryMs=new Date(expiresAt||'').getTime();
  if(!token||!profile?.ma_gv||!Number.isFinite(expiryMs)||expiryMs<=Date.now())return null;
  return{token,profile};
}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function notice(msg,kind='info'){const e=document.getElementById('notice');e.textContent=msg||'';e.className=msg?`notice ${kind}`:'notice';}
function setBusy(v){aipBusy=v;for(const id of ['btnNew','btnRefresh','btnSave','btnTest','btnDelete','btnCancel','btnAddModel']){const e=document.getElementById(id);if(e)e.disabled=v;}}
function sessionOrFail(){const x=aipSession();if(!x){notice('Phiên giáo viên không còn hợp lệ. Hãy đăng nhập lại ở Cổng giáo viên.','error');setBusy(true);return null;}return x;}
function parseObjectField(id,label){
  const raw=document.getElementById(id)?.value?.trim()||'';
  if(!raw)return{};
  let parsed;try{parsed=JSON.parse(raw);}catch(e){throw new Error(`${label} không phải JSON hợp lệ: ${e.message}`);}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(`${label} phải là một JSON object.`);
  return parsed;
}
function pretty(value){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length?JSON.stringify(value,null,2):'';}

async function gateway(payload){
  const s=sessionOrFail();if(!s)throw new Error('staff_session_invalid');
  const r=await fetch(AIP_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','apikey':AIP_PUBLIC_ANON_KEY},cache:'no-store',body:JSON.stringify({...payload,staff_token:s.token,ma_gv:s.profile.ma_gv})});
  let data=null;try{data=await r.json();}catch{data=null;}
  if(!r.ok||!data||data.status!=='success'){const e=new Error(data?.message||`Dịch vụ AI Provider trả mã ${r.status}`);e.code=data?.code||'provider_control_failed';throw e;}return data;
}
function currentProvider(){return aipProviders.find(p=>p.id===aipCurrentId)||null;}
function testBadge(p){if(p.last_test_status==='OK')return '<span class="pill ok">✓ OK</span>';if(p.last_test_status==='FAILED')return '<span class="pill bad">FAILED</span>';if(p.last_test_status==='UNVERIFIED')return '<span class="pill">UNVERIFIED</span>';return '<span class="pill">CHƯA TEST</span>';}
function renderProviders(){
  const box=document.getElementById('providerList');
  if(!aipProviders.length){box.innerHTML='<div class="provider">Chưa có kết nối API nào.</div>';return;}
  box.innerHTML=aipProviders.map(p=>`<div class="provider ${p.id===aipCurrentId?'active':''}" data-provider-id="${esc(p.id)}"><div class="provider-head"><div><strong>${esc(p.display_name)}</strong><div class="meta">${esc(p.owner_scope)} · ${esc(p.adapter_type)} · ${esc(p.base_url)}<br>Auth: ${esc(p.auth_type)} ${p.secret_hint?`· key ${esc(p.secret_hint)}`:''} · ${p.models?.length||0} model · discovery ${esc(p.discovery_mode||'HYBRID')}</div></div>${testBadge(p)}</div></div>`).join('');
  box.querySelectorAll('[data-provider-id]').forEach(el=>el.addEventListener('click',()=>openProvider(el.dataset.providerId)));
}
function loadModelEditor(model){
  document.getElementById('manualModelId').value=model?.model_id||'';
  document.getElementById('manualModelName').value=model?.display_name||'';
  document.getElementById('modelCapabilities').value=pretty(model?.capabilities||{});
  document.getElementById('modelParameters').value=pretty(model?.default_parameters||{});
  document.getElementById('manualModelId').focus();
}
function renderModels(){
  const p=currentProvider(),card=document.getElementById('modelsCard'),box=document.getElementById('modelList');
  if(!p){card.classList.add('hidden');box.innerHTML='';return;}card.classList.remove('hidden');
  const models=Array.isArray(p.models)?p.models:[];
  box.innerHTML=models.length?models.map(m=>`<div class="model"><div><strong>${esc(m.display_name||m.model_id)}</strong><div class="small">${esc(m.model_id)} ${m.discovered_at?'· discovered':''}${m.capabilities?.json_mode?' · JSON mode':''}</div></div><div class="actions" style="margin-top:0"><button class="secondary" data-model-edit="${esc(m.id)}">Nạp sửa</button><button class="danger" data-model-delete="${esc(m.id)}">Xóa</button></div></div>`).join(''):'<div class="small">Chưa có model. Bấm “Kiểm tra kết nối” để dò tự động hoặc nhập Model ID thủ công.</div>';
  box.querySelectorAll('[data-model-edit]').forEach(b=>b.addEventListener('click',()=>loadModelEditor(models.find(m=>m.id===b.dataset.modelEdit))));
  box.querySelectorAll('[data-model-delete]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Xóa model này?'))return;await run(async()=>{await gateway({action:'delete_model',model_profile_id:b.dataset.modelDelete});await loadProviders();notice('Đã xóa model.','ok');});}));
}
function blankEditor(){
  aipCurrentId='';document.getElementById('editorTitle').textContent='Thêm nhà cung cấp';
  document.getElementById('ownerScope').value='PERSONAL';document.getElementById('displayName').value='';document.getElementById('adapterType').value='OPENAI_COMPAT';document.getElementById('baseUrl').value='';document.getElementById('discoveryMode').value='HYBRID';document.getElementById('authType').value='BEARER';document.getElementById('authHeader').value='';document.getElementById('authPrefix').value='Bearer ';document.getElementById('apiKey').value='';document.getElementById('apiKey').placeholder='Nhập API key';document.getElementById('modelsPath').value='';document.getElementById('providerOptions').value='';document.getElementById('enabled').checked=true;document.getElementById('editorStatus').textContent='';document.getElementById('btnDelete').classList.add('hidden');document.getElementById('btnTest').classList.add('hidden');
  document.getElementById('editorCard').classList.remove('hidden');renderProviders();renderModels();
}
function openProvider(id){
  const p=aipProviders.find(x=>x.id===id);if(!p)return;aipCurrentId=id;
  document.getElementById('editorTitle').textContent=`Sửa: ${p.display_name}`;document.getElementById('ownerScope').value=p.owner_scope;document.getElementById('displayName').value=p.display_name||'';document.getElementById('adapterType').value=p.adapter_type;document.getElementById('baseUrl').value=p.base_url||'';document.getElementById('discoveryMode').value=p.discovery_mode||'HYBRID';document.getElementById('authType').value=p.auth_type||'BEARER';document.getElementById('authHeader').value=p.auth_header||'';document.getElementById('authPrefix').value=p.auth_prefix||'';document.getElementById('apiKey').value='';document.getElementById('apiKey').placeholder=p.secret_hint?`Đã lưu ${p.secret_hint}; để trống để giữ nguyên`:'Nhập API key';document.getElementById('modelsPath').value=p.models_path||'';document.getElementById('providerOptions').value=pretty(p.provider_options||{});document.getElementById('enabled').checked=p.enabled!==false;document.getElementById('editorStatus').textContent=p.last_test_message||'';document.getElementById('btnDelete').classList.remove('hidden');document.getElementById('btnTest').classList.remove('hidden');document.getElementById('editorCard').classList.remove('hidden');renderProviders();renderModels();
}
async function loadProviders(){
  const data=await gateway({action:'list'});aipProviders=Array.isArray(data.providers)?data.providers:[];
  if(aipCurrentId&&!aipProviders.some(p=>p.id===aipCurrentId))aipCurrentId='';renderProviders();renderModels();
}
function providerPayload(){
  return{action:'save_provider',provider_id:aipCurrentId||undefined,owner_scope:document.getElementById('ownerScope').value,display_name:document.getElementById('displayName').value.trim(),adapter_type:document.getElementById('adapterType').value,base_url:document.getElementById('baseUrl').value.trim(),auth_type:document.getElementById('authType').value,auth_header:document.getElementById('authHeader').value.trim(),auth_prefix:document.getElementById('authPrefix').value,api_key:document.getElementById('apiKey').value,discovery_mode:document.getElementById('discoveryMode').value,models_path:document.getElementById('modelsPath').value.trim(),provider_options:parseObjectField('providerOptions','Provider options'),enabled:document.getElementById('enabled').checked};
}
async function run(fn){if(aipBusy)return;setBusy(true);try{await fn();}catch(e){notice(e.message||'Thao tác thất bại.','error');}finally{setBusy(false);}}
function adapterDefaults(){
  const a=document.getElementById('adapterType').value,auth=document.getElementById('authType'),base=document.getElementById('baseUrl'),header=document.getElementById('authHeader'),prefix=document.getElementById('authPrefix');
  if(a==='OPENAI_RESPONSES'||a==='OPENAI_CHAT'){if(!base.value)base.value='https://api.openai.com/v1';auth.value='BEARER';prefix.value='Bearer ';header.value='';}
  else if(a==='ANTHROPIC_MESSAGES'){if(!base.value)base.value='https://api.anthropic.com/v1';auth.value='HEADER';header.value='x-api-key';prefix.value='';}
  else if(a==='GEMINI_GENERATE_CONTENT'){if(!base.value)base.value='https://generativelanguage.googleapis.com/v1beta';auth.value='QUERY';header.value='key';prefix.value='';}
  else if(a==='OPENAI_COMPAT'){auth.value='BEARER';if(!prefix.value)prefix.value='Bearer ';}
}

window.addEventListener('DOMContentLoaded',()=>{
  const s=sessionOrFail();if(!s)return;
  if(s.profile.quyen!=='Admin')document.getElementById('schoolScopeOption').disabled=true;
  document.getElementById('adapterType').addEventListener('change',adapterDefaults);
  document.getElementById('btnNew').addEventListener('click',blankEditor);
  document.getElementById('btnRefresh').addEventListener('click',()=>run(async()=>{await loadProviders();notice('Đã làm mới danh sách provider.','info');}));
  document.getElementById('btnCancel').addEventListener('click',()=>document.getElementById('editorCard').classList.add('hidden'));
  document.getElementById('btnSave').addEventListener('click',()=>run(async()=>{const data=await gateway(providerPayload());aipCurrentId=data.provider_id;document.getElementById('apiKey').value='';await loadProviders();openProvider(aipCurrentId);notice('Đã lưu provider. API key không được trả về trình duyệt.','ok');}));
  document.getElementById('btnTest').addEventListener('click',()=>run(async()=>{if(!aipCurrentId)throw new Error('Hãy lưu provider trước khi kiểm tra.');const data=await gateway({action:'test_provider',provider_id:aipCurrentId});await loadProviders();openProvider(aipCurrentId);notice(data.message||'Đã kiểm tra kết nối.',data.verified?'ok':'info');}));
  document.getElementById('btnDelete').addEventListener('click',()=>run(async()=>{if(!aipCurrentId||!confirm('Xóa provider, toàn bộ model và secret trong Vault?'))return;await gateway({action:'delete_provider',provider_id:aipCurrentId});aipCurrentId='';document.getElementById('editorCard').classList.add('hidden');await loadProviders();notice('Đã xóa provider và secret liên quan.','ok');}));
  document.getElementById('btnAddModel').addEventListener('click',()=>run(async()=>{
    if(!aipCurrentId)throw new Error('Chưa chọn provider.');
    const modelId=document.getElementById('manualModelId').value.trim();if(!modelId)throw new Error('Cần nhập Model ID.');
    await gateway({action:'save_model',provider_id:aipCurrentId,model_id:modelId,display_name:document.getElementById('manualModelName').value.trim()||modelId,capabilities:parseObjectField('modelCapabilities','Capabilities'),default_parameters:parseObjectField('modelParameters','Default parameters'),enabled:true});
    document.getElementById('manualModelId').value='';document.getElementById('manualModelName').value='';document.getElementById('modelCapabilities').value='';document.getElementById('modelParameters').value='';await loadProviders();openProvider(aipCurrentId);notice('Đã thêm / cập nhật model.','ok');
  }));
  run(async()=>{await loadProviders();notice('Đã tải Provider Control Plane 065C.','info');});
});
