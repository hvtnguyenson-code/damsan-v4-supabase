'use strict';

const SUPABASE_URL='https://xcervjnwlchwfqvbeahy.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZXJ2am53bGNod2ZxdmJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NjksImV4cCI6MjA5MDY1Mjg2OX0.xjrY4YPDb5Q9BTenHrh2dUOnmZbegtKSZQPqzyJdxBo';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let gvData=null;
let gvLogoutInProgress=false;
let activeWorkspaceMonId=null;
let activeWorkspaceTruongId=null;
let allRoomsData=[];
let deferredInstallPrompt=null;
let pendingLoginData=null;
let pendingCurrentPasswordHash=null;

const GV_SESSION_FIELDS=['id','ma_gv','ho_ten','quyen','truong_id','truong_ten','mon_id'];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function safeGvProfile(source){
  return GV_SESSION_FIELDS.reduce((p,k)=>{if(source&&Object.prototype.hasOwnProperty.call(source,k))p[k]=source[k];return p;},{});
}
function isStoredSessionExpired(expiry){
  const t=new Date(expiry).getTime();
  return !expiry||Number.isNaN(t)||t<=Date.now();
}
function getStaffToken(){
  const token=sessionStorage.getItem('damSan_StaffToken');
  return token&&!isStoredSessionExpired(sessionStorage.getItem('damSan_StaffExpiresAt'))?token:null;
}
function getAdminToken(){
  const token=sessionStorage.getItem('damSan_AdminToken');
  return token&&!isStoredSessionExpired(sessionStorage.getItem('damSan_AdminExpiresAt'))?token:null;
}
function clearControlSessions(){
  ['damSan_StaffToken','damSan_StaffExpiresAt','damSan_AdminToken','damSan_AdminExpiresAt'].forEach(k=>sessionStorage.removeItem(k));
}
function clearLocalSession(){
  clearControlSessions();
  sessionStorage.removeItem('damSan_GVSession');
  gvData=null;
}
function ensureControlSession(){
  const token=getStaffToken();
  if(!token){
    clearLocalSession();
    showLogin('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
    throw new Error('staff_session_invalid');
  }
  return token;
}
async function staffRpc(rpcName,args={}){
  const token=ensureControlSession();
  const {data,error}=await sb.rpc(rpcName,{p_staff_token:token,...args});
  if(data?.code==='staff_session_invalid'){
    clearLocalSession();
    showLogin('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
    throw new Error('staff_session_invalid');
  }
  if(error) throw error;
  return data;
}
async function hashPassword(message){
  const msg=new TextEncoder().encode(message);
  const hash=await crypto.subtle.digest('SHA-256',msg);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function setLoginBusy(busy){
  $('loginBtn').disabled=busy;
  $('loginBtn').textContent=busy?'Đang xác thực…':'Đăng nhập';
}
function showLogin(message=''){
  $('appShell').hidden=true;
  $('forcePassScreen').hidden=true;
  $('loginScreen').hidden=false;
  $('loginMsg').textContent=message;
}
function showForcePass(){
  $('loginScreen').hidden=true;
  $('appShell').hidden=true;
  $('forcePassScreen').hidden=false;
}
function saveLoginSession(loginData){
  const user=safeGvProfile(loginData.user||loginData);
  if(!loginData.staff_token||isStoredSessionExpired(loginData.staff_expires_at)) throw new Error('Phiên đăng nhập không hợp lệ.');
  if(user.quyen==='Admin'&&(!loginData.admin_token||isStoredSessionExpired(loginData.admin_expires_at))) throw new Error('Phiên quản trị không hợp lệ.');
  clearControlSessions();
  gvData=user;
  sessionStorage.setItem('damSan_StaffToken',loginData.staff_token);
  sessionStorage.setItem('damSan_StaffExpiresAt',loginData.staff_expires_at);
  if(user.quyen==='Admin'){
    sessionStorage.setItem('damSan_AdminToken',loginData.admin_token);
    sessionStorage.setItem('damSan_AdminExpiresAt',loginData.admin_expires_at);
  }
  sessionStorage.setItem('damSan_GVSession',JSON.stringify(user));
}
async function login(user,pass){
  const hash=await hashPassword(pass);
  const {data,error}=await sb.rpc('rpc_login_giao_vien',{p_ma_gv:user,p_mat_khau:hash});
  if(error||!data||data.status!=='success') throw new Error('Sai tài khoản hoặc mật khẩu.');
  if(data.must_change_password===true||data.user?.must_change_password===true){
    pendingLoginData=data;
    pendingCurrentPasswordHash=hash;
    showForcePass();
    return false;
  }
  saveLoginSession(data);
  return true;
}
async function forceChangePassword(pass){
  if(!pendingLoginData?.user||!pendingCurrentPasswordHash) throw new Error('Không còn phiên đổi mật khẩu.');
  const newHash=await hashPassword(pass);
  const user=pendingLoginData.user;
  const {data:changed,error}=await sb.rpc('rpc_change_giao_vien_password',{
    p_gv_id:user.id,p_truong_id:user.truong_id,p_current_password:pendingCurrentPasswordHash,p_new_password:newHash
  });
  if(error||changed?.status!=='success') throw error||new Error(changed?.message||'Không đổi được mật khẩu.');
  const {data:loginData,error:loginError}=await sb.rpc('rpc_login_giao_vien',{p_ma_gv:user.ma_gv,p_mat_khau:newHash});
  if(loginError||loginData?.status!=='success') throw loginError||new Error('Không tạo được phiên mới.');
  pendingLoginData=null;pendingCurrentPasswordHash=null;
  saveLoginSession(loginData);
}
async function logout(){
  if(gvLogoutInProgress)return;
  gvLogoutInProgress=true;
  const staff=getStaffToken(),admin=getAdminToken();
  clearLocalSession();
  try{
    const calls=[];
    if(staff)calls.push(sb.rpc('rpc_staff_logout',{p_staff_token:staff}));
    if(admin)calls.push(sb.rpc('rpc_admin_logout',{p_admin_token:admin}));
    await Promise.allSettled(calls);
  }finally{
    gvLogoutInProgress=false;
    showLogin();
  }
}

async function loadAdminWorkspace(){
  if(gvData?.quyen!=='Admin'){
    activeWorkspaceTruongId=gvData?.truong_id||null;
    activeWorkspaceMonId=gvData?.mon_id||null;
    $('workspaceCard').hidden=true;
    return;
  }
  $('workspaceCard').hidden=false;
  const [schoolsRes,subjectsRes]=await Promise.all([
    sb.from('truong_hoc').select('id,ten_truong').order('ten_truong',{ascending:true}),
    sb.from('mon_hoc').select('id,ten_mon').order('created_at',{ascending:true})
  ]);
  if(schoolsRes.error)throw schoolsRes.error;
  if(subjectsRes.error)throw subjectsRes.error;
  const schools=schoolsRes.data||[],subjects=subjectsRes.data||[];
  $('schoolSelect').innerHTML='<option value="ALL">Tất cả trường</option>'+schools.map(x=>`<option value="${esc(x.id)}">${esc(x.ten_truong)}</option>`).join('');
  $('subjectSelect').innerHTML='<option value="ALL">Tất cả môn</option>'+subjects.map(x=>`<option value="${esc(x.id)}">${esc(x.ten_mon)}</option>`).join('');
  activeWorkspaceTruongId=gvData.truong_id||'ALL';
  activeWorkspaceMonId=gvData.mon_id||'ALL';
  $('schoolSelect').value=activeWorkspaceTruongId;
  if(!$('schoolSelect').value) $('schoolSelect').value='ALL';
  $('subjectSelect').value=activeWorkspaceMonId;
  if(!$('subjectSelect').value) $('subjectSelect').value='ALL';
}
function sortRoomsNewestFirst(rooms){
  const copy=[...(rooms||[])];
  if(copy.every(r=>!Number.isNaN(new Date(r.created_at||0).getTime()))){
    copy.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
  }
  return copy;
}
async function rpcLayDanhSachPhongThi(){
  const monId=(activeWorkspaceMonId&&activeWorkspaceMonId!=='ALL')?activeWorkspaceMonId:null;
  const schoolId=gvData.quyen==='Admin'
    ? ((activeWorkspaceTruongId&&activeWorkspaceTruongId!=='ALL')?activeWorkspaceTruongId:null)
    : gvData.truong_id;
  const data=await staffRpc('rpc_lay_danh_sach_phong_thi_gv',{
    p_ma_gv:gvData.ma_gv,
    p_truong_id:schoolId,
    p_mon_id:monId,
    p_xem_toan_bo:gvData.quyen==='Admin'&&!schoolId
  });
  if(!data||data.status!=='success')throw new Error(data?.message||'Không tải được phòng thi.');
  return sortRoomsNewestFirst(data.rooms||[]);
}
async function loadRooms(){
  $('roomList').innerHTML='<div class="card empty">Đang tải phòng thi…</div>';
  allRoomsData=await rpcLayDanhSachPhongThi();
  renderRooms();
  syncRoomSelects();
  return allRoomsData;
}
function roomCode(r){return r.ma_phong??r.MaPhong??'';}
function roomTarget(r){return r.doi_tuong??r.DoiTuong??'TatCa';}
function roomState(r){return r.trang_thai??r.TrangThai??'';}
function renderRooms(){
  if(!allRoomsData.length){
    $('roomList').innerHTML='<div class="card empty">Không có phòng thi trong bộ lọc hiện tại.</div>';
    return;
  }
  $('roomList').innerHTML=allRoomsData.slice(0,8).map(r=>`
    <div class="card room">
      <div><b>${esc(roomCode(r))}</b><small>${esc(roomTarget(r))}</small></div>
      <span class="pill">${esc(roomState(r)||'—')}</span>
    </div>`).join('');
}
function syncRoomSelects(){
  const html='<option value="">— Chọn phòng —</option>'+allRoomsData.map(r=>`<option value="${esc(r.id)}">${esc(roomCode(r))} — ${esc(roomTarget(r))}</option>`).join('');
  $('scoreRoomSelect').innerHTML=html;
}
async function loadScores(roomId){
  const room=allRoomsData.find(r=>String(r.id)===String(roomId));
  if(!room){
    $('scoreList').innerHTML='<div class="card empty">Chọn phòng để xem điểm.</div>';
    $('scoreSummary').textContent='';
    return;
  }
  $('scoreList').innerHTML='<div class="card empty">Đang tải bảng điểm…</div>';
  const data=await staffRpc('rpc_lay_ket_qua_phong_gv',{p_phong_id:room.id});
  if(!data||data.status!=='success')throw new Error(data?.message||'Không tải được bảng điểm.');
  const rows=data.results||[];
  const numeric=rows.map(x=>Number(x.diem)).filter(Number.isFinite);
  const avg=numeric.length?(numeric.reduce((a,b)=>a+b,0)/numeric.length).toFixed(2):'—';
  $('scoreSummary').textContent=`${rows.length} kết quả • Điểm TB: ${avg}`;
  if(!rows.length){
    $('scoreList').innerHTML='<div class="card empty">Phòng chưa có kết quả.</div>';
    return;
  }
  const sorted=[...rows].sort((a,b)=>String(a.hoc_sinh?.ma_hs||'').localeCompare(String(b.hoc_sinh?.ma_hs||''),undefined,{numeric:true}));
  $('scoreList').innerHTML=sorted.map(r=>`
    <div class="card score-row">
      <div><b>${esc(r.hoc_sinh?.ma_hs||'—')} — ${esc(r.hoc_sinh?.ho_ten||'Không rõ')}</b>
      <small>${esc(r.hoc_sinh?.lop||'')} • Mã đề ${esc(r.ma_de||'—')}</small></div>
      <div class="score">${esc(r.diem??'—')}</div>
    </div>`).join('');
}

function setView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.bottom-nav button[data-view]').forEach(b=>b.classList.remove('active'));
  const map={home:'viewHome',scores:'viewScores',more:'viewMore'};
  $(map[name]||'viewHome').classList.add('active');
  const nav=document.querySelector(`.bottom-nav button[data-view="${name}"]`);
  if(nav)nav.classList.add('active');
  if(name==='scores'&&$('scoreRoomSelect').value) loadScores($('scoreRoomSelect').value).catch(showAppError);
}
async function openOmr(){
  if(!getStaffToken()){showLogin('Vui lòng đăng nhập lại.');return;}
  if(!window.DamSanOmrTeacher)throw new Error('Module OMR chưa sẵn sàng.');
  await window.DamSanOmrTeacher.open();
}
function showAppError(err){
  console.error(err);
  alert(err?.message||String(err));
}

async function bootstrapApp(){
  $('loginScreen').hidden=true;
  $('forcePassScreen').hidden=true;
  $('appShell').hidden=false;
  $('userName').textContent=gvData.ho_ten||gvData.ma_gv||'Giáo viên';
  $('helloTitle').textContent='Chào '+(gvData.ho_ten||'giáo viên');
  await loadAdminWorkspace();
  await loadRooms();
  updatePwaStatus();
  const desired=new URLSearchParams(location.search).get('view');
  if(desired==='scores')setView('scores');
  else if(desired==='omr')setTimeout(()=>openOmr().catch(showAppError),100);
  else setView('home');
}

function updatePwaStatus(){
  const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const camera=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
  const sw='serviceWorker' in navigator;
  $('pwaStatus').textContent=`Chế độ: ${standalone?'PWA độc lập':'trình duyệt'} • Camera: ${camera?'sẵn sàng':'không hỗ trợ'} • Service Worker: ${sw?'có':'không'}`;
}
async function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  try{await navigator.serviceWorker.register('./sw.js?v=20261106-teacher-pwa-006',{scope:'./',updateViaCache:'none'});}catch(e){console.warn('Teacher SW:',e);}
}
function setupInstall(){
  const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  if(standalone){$('installBanner').hidden=true;return;}
  const ua=navigator.userAgent||'';
  if(/iPhone|iPad|iPod/i.test(ua))$('iosInstallHint').hidden=false;
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();deferredInstallPrompt=e;$('installBtn').hidden=false;
  });
  $('installBtn').addEventListener('click',async()=>{
    if(!deferredInstallPrompt)return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;$('installBtn').hidden=true;
  });
}

document.addEventListener('DOMContentLoaded',async()=>{
  setupInstall();
  registerServiceWorker();
  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();$('loginMsg').textContent='';setLoginBusy(true);
    try{
      const ok=await login($('loginUser').value.trim(),$('loginPass').value);
      if(ok)await bootstrapApp();
    }catch(err){$('loginMsg').textContent=err.message||'Đăng nhập thất bại.';}
    finally{setLoginBusy(false);}
  });
  $('forcePassForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const p1=$('newPass1').value,p2=$('newPass2').value;
    $('forcePassMsg').textContent='';
    if(p1.length<6){$('forcePassMsg').textContent='Mật khẩu phải có ít nhất 6 ký tự.';return;}
    if(p1!==p2){$('forcePassMsg').textContent='Hai mật khẩu không khớp.';return;}
    if(p1==='123456'){$('forcePassMsg').textContent='Không được dùng lại mật khẩu mặc định.';return;}
    $('forcePassBtn').disabled=true;
    try{await forceChangePassword(p1);await bootstrapApp();}
    catch(err){$('forcePassMsg').textContent=err.message||'Không đổi được mật khẩu.';}
    finally{$('forcePassBtn').disabled=false;}
  });
  $('logoutBtn').onclick=()=>logout().catch(showAppError);
  $('homeOmrBtn').onclick=()=>openOmr().catch(showAppError);
  $('navOmrBtn').onclick=()=>openOmr().catch(showAppError);
  $('homeScoresBtn').onclick=()=>setView('scores');
  document.querySelectorAll('.bottom-nav button[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('scoreRoomSelect').onchange=()=>loadScores($('scoreRoomSelect').value).catch(showAppError);
  $('reloadScoresBtn').onclick=()=>loadScores($('scoreRoomSelect').value).catch(showAppError);
  $('schoolSelect').onchange=async()=>{activeWorkspaceTruongId=$('schoolSelect').value;await loadRooms();};
  $('subjectSelect').onchange=async()=>{activeWorkspaceMonId=$('subjectSelect').value;await loadRooms();};

  const stored=sessionStorage.getItem('damSan_GVSession');
  if(stored){
    try{
      gvData=safeGvProfile(JSON.parse(stored));
      if(!getStaffToken()||(gvData.quyen==='Admin'&&!getAdminToken()))throw new Error('expired');
      await bootstrapApp();
      return;
    }catch(_){clearLocalSession();}
  }
  showLogin();
});
