const { createClient } = supabase;
const SUPABASE_URL = 'https://xcervjnwlchwfqvbeahy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZXJ2am53bGNod2ZxdmJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NjksImV4cCI6MjA5MDY1Mjg2OX0.xjrY4YPDb5Q9BTenHrh2dUOnmZbegtKSZQPqzyJdxBo';
const ADMIN_SECRET = 'DAMSAN_V4_SECURE_ADMIN_2026'; 
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
        headers: { 'x-admin-secret': ADMIN_SECRET }
    }
});

let gvData = null; 
let activeWorkspaceMonId = null; 

let danhSachDeThi = new Array(); let duLieuBangDiem = new Array(); let currentDashFilter = "TatCa"; let allStudents = new Array(); let allTeachers = new Array(); let currentStudentFilter = "TatCa"; let availableBaiHocs = new Array(); let fullBankData = new Array(); let allRoomsData = new Array();
let teacherTimerInterval = null; 
let danhSachThuCong = new Array();
let previewExamData = new Array(); 
let ketQuaChannel = null;
const chiTietCache = new Map(); // TỐI ƯU: Cache kết quả parse JSON ChiTiet
let g_danhSachLopCache = new Array(); 
let g_sysMonList = new Array(); 

// Biến cho Auto Refresh 5s
let autoRefreshInterval = null;
let globalFetchDashId = 0; 
let qrtState = { pending: new Array(), valid: new Array(), mode: '', params: {} };

function parseTimeSafely(timeVal) {
    if (!timeVal || timeVal === 'null') return 0;
    if (typeof timeVal === 'number') return timeVal;
    if (typeof timeVal === 'string' && new RegExp("^\\d+$").test(timeVal)) return parseInt(timeVal, 10); 
    let d = new Date(timeVal).getTime(); 
    return isNaN(d) ? 0 : d;
}

async function hashPassword(message) {
    if (window.crypto && window.crypto.subtle) {
        try {
            const msgBuffer = new TextEncoder().encode(message);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch(e) {}
    } 
    if (window.CryptoJS) {
        return window.CryptoJS.SHA256(message).toString(window.CryptoJS.enc.Hex);
    } 
    return message;
}
const DEFAULT_PASS_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"; 

function safeHTML(str) { 
    if (!str) return ""; 
    if (window.DOMPurify) { return DOMPurify.sanitize(str); }
    let doc = new DOMParser().parseFromString(str, 'text/html'); 
    return doc.body.innerHTML; 
}

function isSha256Hex(v) {
    return typeof v === "string" && new RegExp("^[a-fA-F0-9]{64}$").test(v);
}

function isLegacyPlainPassword(v) {
    if (typeof v !== "string") return false;
    let s = v.trim();
    if (!s) return false;
    return !isSha256Hex(s);
}

window.onload = function() { 
    let script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js";
    document.head.appendChild(script);

    let gvSession = sessionStorage.getItem('damSan_GVSession');
    if (gvSession) {
        gvData = JSON.parse(gvSession);
        document.getElementById('gvNameDisplay').innerText = gvData.ho_ten || "Giáo viên";
        document.getElementById('truongNameDisplay').innerText = gvData.truong_ten || "HỆ THỐNG V4";
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'block';
        khoiTaoDuLieu();
    } else {
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('mainContainer').style.display = 'none';
    }
};

/* ================================================   LOGIC ĐĂNG NHẬP & BẢO MẬT
======================================================= */
async function thucHienDangNhapGV() {
    let user = document.getElementById("gvUser").value.trim();
    let pass = document.getElementById("gvPass").value.trim();
    let msg = document.getElementById("gvLoginMsg");
    let btn = document.getElementById("btnDangNhapGV");

    if (!user || !pass) { msg.innerText = "⚠️ Vui lòng nhập đủ thông tin!"; return; }

    btn.innerText = "⏳ ĐANG XÁC THỰC..."; btn.disabled = true; msg.innerText = "";

    try {
        let hashedPass = await hashPassword(pass);
        
        const { data, error } = await sb
            .from('giao_vien')
            .select('*, truong_hoc(ten_truong)')
            .eq('ma_gv', user)
            .eq('mat_khau', hashedPass)
            .single();
        
        if (error || !data) {
            msg.innerText = "❌ Sai Tài khoản hoặc Mật khẩu!";
            btn.innerText = "🔐 QUẢN TRỊ HỆ THỐNG"; btn.disabled = false;
        } else {
            if (data.mat_khau === DEFAULT_PASS_HASH || data.mat_khau === '123456') {
                window.tempGvData = data; 
                document.getElementById('loginOverlay').style.display = 'none';
                document.getElementById('forceChangePassOverlay').style.display = 'flex';
                btn.innerText = "🔐 QUẢN TRỊ HỆ THỐNG"; btn.disabled = false; 
            } else {
                hoanTatDangNhap(data);
            }
        }
    } catch (err) {
        btn.innerText = "🔐 QUẢN TRỊ HỆ THỐNG"; btn.disabled = false;
        msg.innerText = "❌ Lỗi kết nối mạng Supabase!";
    }
}

function hoanTatDangNhap(data) {
    gvData = { 
        ma_gv: data.ma_gv, ho_ten: data.ho_ten, quyen: data.quyen, 
        truong_id: data.truong_id, truong_ten: data.truong_hoc.ten_truong,
        mon_id: data.mon_id, id: data.id 
    };
    sessionStorage.setItem('damSan_GVSession', JSON.stringify(gvData));
    document.getElementById('gvNameDisplay').innerText = gvData.ho_ten;
    document.getElementById('truongNameDisplay').innerText = gvData.truong_ten;
    
    let forceOverlay = document.getElementById('forceChangePassOverlay');
    if(forceOverlay) forceOverlay.style.display = 'none';
    document.getElementById('loginOverlay').style.display = 'none';
    
    document.getElementById('mainContainer').style.display = 'block';
    khoiTaoDuLieu();
}

async function xacNhanDoiMatKhauBatBuoc() {
    let pass1 = document.getElementById("newPassForce").value.trim();
    let pass2 = document.getElementById("confirmNewPassForce").value.trim();
    let msg = document.getElementById("forceChangeMsg");
    let btn = document.getElementById("btnForceChange");

    if (!pass1 || !pass2) { msg.innerText = "⚠️ Vui lòng nhập đủ 2 ô mật khẩu!"; return; }
    if (pass1.length < 6) { msg.innerText = "⚠️ Mật khẩu phải có ít nhất 6 ký tự!"; return; }
    if (pass1 !== pass2) { msg.innerText = "⚠️ Hai ô mật khẩu không khớp nhau!"; return; }
    if (pass1 === '123456') { msg.innerText = "⚠️ KHÔNG ĐƯỢC đặt lại mật khẩu mặc định (123456) vì lý do bảo mật!"; return; }

    btn.innerText = "⏳ ĐANG LƯU..."; btn.disabled = true; msg.innerText = "";

    try {
        let hashedNewPass = await hashPassword(pass1);
        let uid = window.tempGvData.id;
        
        let { error } = await sb.from('giao_vien').update({ mat_khau: hashedNewPass }).eq('id', uid);
        
        if (error) throw error;
        
        alert("✅ Đổi mật khẩu thành công! Chào mừng bạn đến với hệ thống.");
        hoanTatDangNhap(window.tempGvData);
        window.tempGvData = null; 
        
    } catch (err) {
        btn.innerText = "💾 LƯU VÀ VÀO HỆ THỐNG"; btn.disabled = false;
        msg.innerText = "❌ Lỗi khi lưu mật khẩu: " + err.message;
    }
}

function moModalDoiMatKhau() {
    document.getElementById('oldPassPro').value = '';
    document.getElementById('newPassPro').value = '';
    document.getElementById('confirmNewPassPro').value = '';
    document.getElementById('changePassModal').style.display = 'flex';
}

async function thucHienDoiMatKhau() {
    let oldPass = document.getElementById('oldPassPro').value.trim();
    let newPass = document.getElementById('newPassPro').value.trim();
    let confirmPass = document.getElementById('confirmNewPassPro').value.trim();

    if (!oldPass || !newPass || !confirmPass) { return alert("⚠️ Vui lòng nhập đầy đủ thông tin!"); }
    if (newPass.length < 6) { return alert("⚠️ Mật khẩu mới phải từ 6 ký tự trở lên!"); }
    if (newPass !== confirmPass) { return alert("⚠️ Mật khẩu mới không khớp với ô Xác nhận!"); }
    if (newPass === '123456') { return alert("⚠️ Không được đặt mật khẩu là 123456 để tránh rủi ro!"); }

    let btn = document.querySelector('#changePassModal button');
    let oldBtnText = btn.innerText;
    btn.innerText = "⏳ ĐANG XỬ LÝ..."; btn.disabled = true;

    try {
        let hashedOld = await hashPassword(oldPass);
        let hashedNew = await hashPassword(newPass);

        let { data, error: errCheck } = await sb
            .from('giao_vien')
            .select('id')
            .eq('id', gvData.id)
            .eq('mat_khau', hashedOld)
            .single();
        
        if (errCheck || !data) {
            throw new Error("Mật khẩu hiện tại không đúng!");
        }

        let { error: errUpdate } = await sb.from('giao_vien').update({ mat_khau: hashedNew }).eq('id', gvData.id);
        if (errUpdate) throw errUpdate;

        alert("✅ Đổi mật khẩu thành công! Vui lòng đăng nhập lại để hệ thống cập nhật kết nối bảo mật.");
        dangXuatGV();

    } catch (err) {
        alert("❌ Lỗi: " + err.message);
        btn.innerText = oldBtnText; btn.disabled = false;
    }
}

function dangXuatGV() {
    if(confirm("Bạn có chắc chắn muốn đăng xuất?")) {
        sessionStorage.removeItem('damSan_GVSession');
        localStorage.removeItem('damSan_Workspace');
        sessionStorage.clear(); 
        location.reload();
    }
}

/* ================================================   LOGIC KHỞI TẠO DỮ LIỆU CHUNG & GIAO DIỆN
======================================================= */
async function khoiTaoWorkspace() {
    let {data: mons} = await sb.from('mon_hoc').select('*').order('created_at', {ascending: true});
    let sysMonList = mons || new Array();

    let headerUser = document.querySelector('.header-user');
    if(!document.getElementById('workspaceContainer')) {
        let wsDiv = document.createElement('div');
        wsDiv.id = 'workspaceContainer';
        wsDiv.style.marginRight = '20px';
        wsDiv.style.display = 'flex';
        wsDiv.style.alignItems = 'center';
        wsDiv.style.gap = '10px';
        wsDiv.style.background = '#fff';
        wsDiv.style.padding = '5px 15px';
        wsDiv.style.borderRadius = '8px';
        wsDiv.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

        if(gvData.quyen === 'Admin') {
            let sel = `<select id="workspaceSelector" onchange="changeWorkspace(this.value)" style="padding: 6px; border-radius: 6px; border: 2px solid #1a73e8; font-weight: bold; color: #1a73e8; outline: none; background: #e8f0fe; cursor: pointer;">`;
            sel += `<option value="ALL">🌎 TỔNG QUAN TẤT CẢ CÁC MÔN</option>`;
            sysMonList.forEach(m => { sel += `<option value="${m.id}">📚 Môn: ${m.ten_mon}</option>`; });
            sel += `</select>`;
            wsDiv.innerHTML = `<span style="font-size: 13px; color: #5f6368; font-weight: bold;">Không gian:</span> ` + sel;
            
            activeWorkspaceMonId = localStorage.getItem('damSan_Workspace') || "ALL";
        } else {
            let tenMon = "Chưa phân công";
            let myMon = sysMonList.find(x => x.id === gvData.mon_id);
            if(myMon) tenMon = myMon.ten_mon;
            activeWorkspaceMonId = gvData.mon_id;
            
            wsDiv.innerHTML = `<span style="font-size: 13px; color: #5f6368; font-weight: bold;">Bộ môn:</span> <span style="background: #e8f5e9; color: #27ae60; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px dashed #27ae60;">${tenMon}</span>`;
        }
        headerUser.insertBefore(wsDiv, headerUser.firstChild);

        if(gvData.quyen === 'Admin') {
            document.getElementById('workspaceSelector').value = activeWorkspaceMonId;
        }
    }
}

function changeWorkspace(monId) {
    activeWorkspaceMonId = monId;
    localStorage.setItem('damSan_Workspace', monId);
    
    danhSachDeThi = new Array(); danhSachThuCong = new Array();
    if(document.getElementById('matrixBody')) document.getElementById('matrixBody').innerHTML = '';
    if(document.getElementById('manBody')) { document.getElementById('manBody').innerHTML = '<tr><td colspan="5">Chưa có câu hỏi nào được gõ...</td></tr>'; document.getElementById('manCount').innerText = '0'; }
    if(document.getElementById('dashBody')) document.getElementById('dashBody').innerHTML = '<tr><td colspan="10">Chưa có dữ liệu...</td></tr>';
    if(document.getElementById('analyticDashboard')) document.getElementById('analyticDashboard').style.display = 'none';

    loadBankMeta(true);
    fetchFullBank(true);
    fetchRadar();
    taiDanhSachPhong();
}

function checkWorkspaceAction() {
    if(gvData.quyen === 'Admin' && (!activeWorkspaceMonId || activeWorkspaceMonId === "ALL")) {
        alert("⚠️ HÀNH ĐỘNG BỊ CHẶN:\nBan Giám Hiệu đang ở chế độ 'Tổng quan toàn trường'.\n\nVui lòng chọn một BỘ MÔN CỤ THỂ trên thanh menu ở góc phải trên cùng trước khi thao tác Tạo Đề, Đẩy Đề hoặc Nạp Ngân Hàng!");
        return false;
    }
    return true;
}

function khoiTaoGiaoDienHeThong() {
    initQuarantineUI(); 
    initMultiClassModal(); 
}

// KHỞI TẠO UI TRẠM KIỂM DỊCH
function initQuarantineUI() {
    if (document.getElementById('quarantineModal')) return;
    let m = document.createElement('div');
    m.id = 'quarantineModal';
    m.className = 'modal-overlay';
    m.style.zIndex = '100000'; 
    m.innerHTML = `
        <div class="modal-content" style="max-width: 850px; width: 95%;">
            <div class="modal-header" style="border-bottom: 2px solid #e74c3c;">
                <span style="color: #e74c3c;">🚨 TRẠM KIỂM DỊCH (LỖI ĐỊNH DẠNG WORD)</span>
                <span style="cursor:pointer; color:#555;" onclick="closeQuarantine(true)">✖</span>
            </div>
            <div style="background: #fadbd8; color: #c0392b; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-weight: bold; font-size: 14px;">
                Hệ thống không thể bóc tách tự động do lỗi gõ phím trong file Word (dư khoảng trắng, thiếu dấu chấm, không chia dòng đáp án...). Vui lòng sửa thủ công để không làm hỏng đề!
                <br>👉 Còn lại: <span id="qrt-count" style="font-size: 18px; color: #8e44ad;">0</span> câu đang chờ xử lý.
            </div>
            
            <div style="display:flex; gap:15px; margin-bottom: 15px; flex-wrap: wrap;">
                <div style="flex:1; min-width: 300px; border: 1px solid #ccc; border-radius: 6px; padding: 10px; background: #f8f9fa; max-height: 420px; overflow-y: auto;">
                    <b style="color: #1a73e8; display:block; margin-bottom: 5px;">Văn bản gốc (Trích xuất từ Word):</b>
                    <div id="qrt-raw-html" style="font-size: 15px; line-height: 1.5; color: #333; background: #fff; padding: 10px; border: 1px dashed #aaa;"></div>
                </div>
                
                <div style="flex:1; min-width: 300px; display:flex; flex-direction:column; gap: 10px;">
                    <div style="display:flex; gap: 10px;">
                        <div style="flex:1"><label>Phần:</label><select id="qrt-phan" style="width:100%; padding:6px; font-weight:bold; color:#1a73e8;" onchange="changePhanQrt()"><option value="1">Phần I</option><option value="2">Phần II</option><option value="3">Phần III</option></select></div>
                        <div style="flex:1"><label>Mức độ:</label><select id="qrt-mucdo" style="width:100%; padding:6px;"><option value="NB">NB</option><option value="TH">TH</option><option value="VD">VD</option><option value="VDC">VDC</option></select></div>
                    </div>
                    <div><label>Nội dung câu hỏi:</label><div id="qrt-noidung" contenteditable="true" style="border: 2px solid #3498db; padding: 8px; min-height: 60px; border-radius: 4px; background: #fff; outline:none;"></div></div>
                    
                    <div id="qrt-area-p1">
                        <div style="display:flex; gap:10px; margin-bottom:10px;">
                            <div style="flex:1"><label>A:</label><textarea id="qrt-a1" rows="2" style="width:100%; padding:5px;"></textarea></div>
                            <div style="flex:1"><label>B:</label><textarea id="qrt-b1" rows="2" style="width:100%; padding:5px;"></textarea></div>
                        </div>
                        <div style="display:flex; gap:10px; margin-bottom:10px;">
                            <div style="flex:1"><label>C:</label><textarea id="qrt-c1" rows="2" style="width:100%; padding:5px;"></textarea></div>
                            <div style="flex:1"><label>D:</label><textarea id="qrt-d1" rows="2" style="width:100%; padding:5px;"></textarea></div>
                        </div>
                        <div><label>Đáp án Đúng (A/B/C/D):</label><select id="qrt-dapan1" style="width:100%; padding:6px; font-weight:bold; color:green;"><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></div>
                    </div>
                    
                    <div id="qrt-area-p2" style="display:none;">
                        <div style="display:flex; gap:10px; margin-bottom:10px;">
                            <div style="flex:1"><label>Ý a:</label><textarea id="qrt-a2" rows="2" style="width:100%; padding:5px;"></textarea></div>
                            <div style="flex:1"><label>Ý b:</label><textarea id="qrt-b2" rows="2" style="width:100%; padding:5px;"></textarea></div>
                        </div>
                        <div style="display:flex; gap:10px; margin-bottom:10px;">
                            <div style="flex:1"><label>Ý c:</label><textarea id="qrt-c2" rows="2" style="width:100%; padding:5px;"></textarea></div>
                            <div style="flex:1"><label>Ý d:</label><textarea id="qrt-d2" rows="2" style="width:100%; padding:5px;"></textarea></div>
                        </div>
                        <div><label>Đáp án (Đ-S-Đ-S):</label><input type="text" id="qrt-dapan2" placeholder="Ví dụ: Đ-S-S-Đ" style="width:100%; padding:6px; font-weight:bold; color:green; text-transform:uppercase;"></div>
                    </div>
                    
                    <div id="qrt-area-p3" style="display:none;">
                        <div><label>Đáp án Trả lời ngắn:</label><input type="text" id="qrt-dapan3" placeholder="Nhập đáp án số hoặc chữ..." style="width:100%; padding:6px; font-weight:bold; color:green;"></div>
                    </div>

                </div>
            </div>
            
            <div style="display:flex; gap: 10px; justify-content: flex-end; border-top: 1px dashed #ccc; padding-top: 15px;">
                <button onclick="skipQuarantineItem()" style="background: #95a5a6; color: white; padding: 12px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition:0.2s;">🗑️ Xóa bỏ câu này</button>
                <button onclick="saveQuarantineItem()" style="background: #27ae60; color: white; padding: 12px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition:0.2s; box-shadow: 0 3px 0 #1e8449;">💾 Đã sửa xong. Lưu & Tiếp tục!</button>
            </div>
        </div>
    `;
    document.body.appendChild(m);
}

function initMultiClassModal() {
    if(document.getElementById('multiClassModal')) return;
    let m = document.createElement('div');
    m.id = 'multiClassModal';
    m.className = 'modal-overlay';
    m.style.display = 'none';
    m.innerHTML = `
        <div class="modal-content" style="max-width: 550px; width: 90%;">
            <div class="modal-header" style="border-bottom: 2px solid #1a73e8; padding-bottom: 10px; margin-bottom: 15px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size: 18px; font-weight: bold; color: #1a73e8;">🏷️ Chọn Đối Tượng Tham Gia Thi</span>
                <span style="cursor: pointer; color: #e74c3c; font-size: 20px; font-weight: bold; padding:0 5px;" onclick="document.getElementById('multiClassModal').style.display='none'">✖</span>
            </div>
            <input type="hidden" id="mc_roomId">
            
            <div id="mc_quick_btns" style="margin-bottom:15px; display:flex; gap:8px; flex-wrap:wrap;">
                </div>

            <div id="mc_classList" style="display:flex; flex-wrap:wrap; gap:10px; max-height: 250px; overflow-y:auto; border:1px solid #eee; padding:15px; border-radius:6px; margin-bottom:15px; background:#fafafa;">
            </div>
            
            <div style="margin-bottom:15px; background: #fff3cd; padding: 15px; border-radius: 6px; border: 1px solid #ffe69c;">
                <label style="font-weight:bold; color:#d35400; font-size:14px; display:block; margin-bottom: 5px;">🎯 Chỉ định đích danh:</label>
                <input type="text" id="mc_sbd_thibu" placeholder="Nhập Mã HS (VD: HS015, HS092)..." style="width:100%; padding:10px; border:1px solid #f39c12; border-radius:4px; font-weight:bold; box-sizing: border-box; text-transform: uppercase;">
                <div style="font-size:12px; color:#856404; margin-top:5px; font-style: italic;">* Nhập các mã HS cách nhau bằng dấu phẩy. Các HS này sẽ được ưu tiên vào thi cùng với các lớp đã chọn.</div>
            </div>

            <button onclick="mc_luuChonLop()" style="width:100%; background:#27ae60; color:white; border:none; padding:12px; border-radius:5px; font-weight:bold; cursor:pointer; font-size:16px;">💾 XÁC NHẬN CHỌN</button>
        </div>
    `;
    document.body.appendChild(m);
}

function moModalChonLop(roomId, currentVal) {
    document.getElementById('mc_roomId').value = roomId;
    let container = document.getElementById('mc_classList');
    let quickBtnContainer = document.getElementById('mc_quick_btns');
    let sbdInput = document.getElementById('mc_sbd_thibu');
    container.innerHTML = '';
    quickBtnContainer.innerHTML = ''; 
    if(sbdInput) sbdInput.value = '';

    if(!g_danhSachLopCache || g_danhSachLopCache.length === 0) {
        container.innerHTML = '<span style="color:#d93025; font-weight:bold;">Chưa có dữ liệu lớp. Hãy Import danh sách Học sinh vào hệ thống trước!</span>';
    } else {
        let prefixes = new Set();
        g_danhSachLopCache.forEach(l => {
            if(!l) return;
            let match = String(l).trim().match(/^(\d+|[A-Za-z]+)/);
            if(match) prefixes.add(match[1]);
        });

        let qBtnsHtml = `<button onclick="mc_chonNhanh('TatCa')" style="padding:6px 12px; background:#f1f3f4; border:1px solid #ccc; border-radius:4px; font-weight:bold; cursor:pointer;">🌎 Tất cả trường</button>`;
        Array.from(prefixes).sort().forEach(p => {
            let tenNhan = /^\d+$/.test(p) ? "Khối" : "Nhóm";
            qBtnsHtml += `<button onclick="mc_chonNhanh('${p}')" style="padding:6px 12px; background:#e8f0fe; border:1px solid #1a73e8; color:#1a73e8; font-weight:bold; border-radius:4px; cursor:pointer;">${tenNhan} ${p}</button>`;
        });
        qBtnsHtml += `<button onclick="mc_chonNhanh('Clear')" style="padding:6px 12px; background:#fce8e6; border:1px solid #ea4335; color:#ea4335; font-weight:bold; border-radius:4px; cursor:pointer;">Bỏ chọn hết</button>`;
        quickBtnContainer.innerHTML = qBtnsHtml;

        let selectedArr = currentVal === 'TatCa' ? new Array() : currentVal.split(',').map(s=>s.trim());
        let isTatCa = currentVal === 'TatCa';
        
        let sbdArr = selectedArr.filter(item => !g_danhSachLopCache.includes(item));
        let lopArr = selectedArr.filter(item => g_danhSachLopCache.includes(item));
        
        if (sbdInput && sbdArr.length > 0 && !isTatCa) sbdInput.value = sbdArr.join(', ');

        let html = `
            <label style="width:100%; display:block; padding:8px 10px; background:#f1f3f4; border-radius:4px; font-weight:bold; border:1px solid #ccc; cursor:pointer;">
                <input type="checkbox" id="mc_chk_tatca" value="TatCa" ${isTatCa ? 'checked' : ''} onchange="mc_toggleTatCa(this.checked)" style="transform: scale(1.2); margin-right:8px;"> 🌎 GIAO ĐỀ CHO TẤT CẢ CÁC LỚP
            </label>
            <div style="width:100%; height:1px; background:#ddd; margin: 5px 0;"></div>
        `;

        g_danhSachLopCache.forEach(l => {
            if(!l) return;
            let checked = (!isTatCa && lopArr.includes(l)) ? 'checked' : '';
            html += `
                <label style="padding:6px 12px; border:1px solid #bdc3c7; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:5px; background:#fff; font-weight:bold; color:#2c3e50;">
                    <input type="checkbox" class="mc_class_item" value="${l}" ${checked} onchange="mc_uncheckTatCa()" style="transform: scale(1.2);"> ${l}
                </label>
            `;
        });
        container.innerHTML = html;
    }
    document.getElementById('multiClassModal').style.display = 'flex';
}

function mc_toggleTatCa(isChecked) { if(isChecked) { document.querySelectorAll('.mc_class_item').forEach(cb => cb.checked = false); } }
function mc_uncheckTatCa() { document.getElementById('mc_chk_tatca').checked = false; }
function mc_chonNhanh(khoi) {
    if(khoi === 'TatCa') { document.getElementById('mc_chk_tatca').checked = true; mc_toggleTatCa(true); } 
    else if(khoi === 'Clear') { document.getElementById('mc_chk_tatca').checked = false; document.querySelectorAll('.mc_class_item').forEach(cb => cb.checked = false); } 
    else { mc_uncheckTatCa(); document.querySelectorAll('.mc_class_item').forEach(cb => { if(String(cb.value).trim().startsWith(khoi)) cb.checked = true; }); }
}

async function mc_luuChonLop() {
    let roomId = document.getElementById('mc_roomId').value;
    let isTatCa = document.getElementById('mc_chk_tatca').checked;
    let finalVal = "TatCa";
    
    let sbdInput = document.getElementById('mc_sbd_thibu');
    let sbdVal = sbdInput ? sbdInput.value.trim().toUpperCase() : "";
    let sbdArr = sbdVal ? sbdVal.split(',').map(s => s.trim()).filter(Boolean) : [];

    if (!isTatCa) {
        let checkedClasses = new Array(); 
        document.querySelectorAll('.mc_class_item:checked').forEach(cb => checkedClasses.push(cb.value));
        
        let combined = checkedClasses.concat(sbdArr);
        if(combined.length > 0) finalVal = combined.join(', ');
        else finalVal = ""; 
    }
    
    if (!isTatCa && finalVal === "") return alert("Vui lòng chọn ít nhất 1 lớp hoặc nhập mã HS để giao đề!");

    let btn = document.querySelector('#multiClassModal button[onclick="mc_luuChonLop()"]');
    let oldText = btn.innerText; btn.innerText = "⏳ ĐANG LƯU..."; btn.disabled = true;
    await capNhatNhanhPhong(roomId, 'doi_tuong', finalVal);
    btn.innerText = oldText; btn.disabled = false; document.getElementById('multiClassModal').style.display = 'none'; fetchRadar(); 
}

function phanQuyenGiaoVien() {
    let roleDisplay = document.getElementById('gvRoleDisplay');
    let btnQuanLyTK = document.querySelector('.nav-btn[onclick*="quanLyTK"]');

    if (gvData.quyen !== 'Admin') {
        roleDisplay.innerText = "Giáo viên"; roleDisplay.style.color = "#27ae60"; roleDisplay.style.background = "#e8f5e9";
        if(btnQuanLyTK) btnQuanLyTK.style.display = 'none';
        if(document.getElementById('btnXoaSachKho')) document.getElementById('btnXoaSachKho').style.display = 'none';
        if(document.getElementById('btnSubSys')) document.getElementById('btnSubSys').style.display = 'none';
    } else {
        roleDisplay.innerText = "Quản trị viên"; roleDisplay.style.color = "#e74c3c"; roleDisplay.style.background = "#fadbd8";
        if(btnQuanLyTK) btnQuanLyTK.style.display = 'flex';
        if(document.getElementById('btnXoaSachKho')) document.getElementById('btnXoaSachKho').style.display = 'block';
        if(document.getElementById('btnSubSys')) document.getElementById('btnSubSys').style.display = 'flex';
    }
}

// KHỞI ĐỘNG HỆ THỐNG GIAO VIÊN
async function khoiTaoDuLieu() {
    try { 
        khoiTaoGiaoDienHeThong(); 
        await khoiTaoWorkspace(); 
        phanQuyenGiaoVien();
        loadBankMeta(); 
        loadMetaData(); 
        fetchRadar(); 
        fetchStudents(); 
        fetchTeachers(); 
        taiDanhSachPhong(); 
        
        // Kích hoạt ngay chức năng Auto-Refresh 5s từ giao diện HTML
        toggleAutoRefresh();

        // Kích hoạt thêm kênh Realtime dự phòng (nếu Supabase của bạn đã bật)
        kichHoatLienKetRealtimeGiaoVien();
    } catch(e){
        console.error("Lỗi khởi tạo:", e);
    }
}

// ================================================// CƠ CHẾ AUTO-REFRESH 5 GIÂY (CHỐNG MÙ BẢNG ĐIỂM)
// ================================================function toggleAutoRefresh() {
    let toggleBtn = document.getElementById('autoRefreshToggle');
    if (!toggleBtn) return;
    
    let isChecked = toggleBtn.checked;
    if (isChecked) {
        if(autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(() => {
            let dashTab = document.getElementById('thongKe');
            let maPhong = document.getElementById('dashMaPhong') ? document.getElementById('dashMaPhong').value : null;
            // Chỉ tải lại điểm khi Giáo viên ĐANG MỞ TAB BẢNG ĐIỂM và ĐÃ CHỌN PHÒNG
            if (dashTab && dashTab.classList.contains('active') && maPhong) {
                fetchDashboard(true);
            }
        }, 5000);
        console.log("Đã bật quét tự động 5s/lần");
    } else {
        if(autoRefreshInterval) clearInterval(autoRefreshInterval);
        console.log("Đã tắt quét tự động");
    }
}

// Hàm Live Search bị thiếu đã được khôi phục
function renderDashboardTable() { 
    let statBox = document.getElementById("analyticDashboard"); 
    const maPhong = document.getElementById('dashMaPhong').value.trim(); 
    let currentRoom = allRoomsData.find(r => String(r.MaPhong).trim() === maPhong); 
    
    if(duLieuBangDiem.length === 0) { 
        if(statBox) statBox.style.display = "none"; 
        document.getElementById('dashBody').innerHTML = '<tr><td colspan="10">Chưa có dữ liệu bài làm nào trong phòng này.</td></tr>'; 
        return; 
    } 

    let defaultLop = currentRoom && currentRoom.DoiTuong !== "TatCa" ? currentRoom.DoiTuong : null; let displayList = new Array(); let targetLop = currentDashFilter !== 'TatCa' ? currentDashFilter : defaultLop; 
    
    // TỐI ƯU: Sử dụng Map để tìm kiếm kết quả bài làm nhanh hơn (O(N) thay vì O(N*M))
    const ketQuaMap = new Map();
    duLieuBangDiem.forEach(r => ketQuaMap.set(String(r.MaHS).trim(), r));

    if (targetLop && targetLop !== "TatCa") { 
        let allowedClasses = targetLop.split(',').map(s => s.trim());
        let classStudents = allStudents.filter(s => allowedClasses.includes(String(s.Lop).trim())); 
        
        classStudents.forEach(stu => { 
            let key = String(stu.MaHS).trim();
            let result = ketQuaMap.get(key);
            if (result) {
                displayList.push({...result, MaHS: stu.MaHS, id: stu.id}); 
                ketQuaMap.delete(key); // Đã xử lý xong
            } else {
                displayList.push({ MaHS: stu.MaHS, HoTen: stu.HoTen, Lop: stu.Lop, TrangThai: "Chưa vào", MaDe: "-", Diem: "-", ThoiGian: null, ChiTiet: null, id: stu.id, ViPham: 0 }); 
            }
        }); 

        // Thêm những học sinh có bài làm nhưng không nằm trong danh sách lớp đã lọc (trường hợp vãng lai)
        ketQuaMap.forEach((r, key) => {
            let stu = allStudents.find(s => String(s.MaHS).trim() === key);
            displayList.push({...r, MaHS: stu ? stu.MaHS : r.MaHS, id: stu ? stu.id : null});
        });
    } else { 
        duLieuBangDiem.forEach(r => { 
            let stu = allStudents.find(s => String(s.MaHS).trim() === String(r.MaHS).trim()); 
            displayList.push({...r, MaHS: stu ? stu.MaHS : r.MaHS, id: stu ? stu.id : null}); 
        }); 
    } 
    if(currentDashFilter !== 'TatCa') { 
        let allowedClasses = currentDashFilter.split(',').map(s => s.trim());
        displayList = displayList.filter(d => allowedClasses.includes(String(d.Lop).trim())); 
    } 
    
    if(displayList.length === 0) { if(statBox) statBox.style.display = "none"; document.getElementById('dashBody').innerHTML = '<tr><td colspan="10">Chưa có dữ liệu.</td></tr>'; return; } 
    
    if(statBox) statBox.style.display = "block"; 
    let sum = 0, passed = 0, submittedCount = 0; 
    let failCount = {}; let html = ""; 
    
    let countGioi = 0, countKha = 0, countTB = 0, countYeu = 0;

    displayList.sort((a, b) => (String(a.MaHS) || '').localeCompare(String(b.MaHS) || '')); 

    displayList.forEach(hs => { 
        hs.p1Score = 0; hs.p2Score = 0; hs.p3Score = 0; 
        
        let isSubmitted = (hs.Diem !== null && hs.Diem !== undefined && hs.Diem !== "-");

        if(hs.ChiTiet && isSubmitted) { 
            try { 
                // TỐI ƯU: Chỉ parse JSON nếu nội dung thay đổi (so sánh với cache)
                let ct;
                if (chiTietCache.has(hs.ChiTiet)) {
                    ct = chiTietCache.get(hs.ChiTiet);
                } else {
                    ct = JSON.parse(hs.ChiTiet);
                    chiTietCache.set(hs.ChiTiet, ct);
                }

                for (let k in ct) { 
                    let item = ct[k]; let isDung = false; 
                    if(item.phan==="1") { 
                        let cVal = String(item.chon||"").toUpperCase().trim();
                        let dVal = String(item.dung||"").toUpperCase().trim();
                        isDung = (cVal === dVal); 
                        if(isDung) hs.p1Score += 0.25; 
                    } 
                    else if(item.phan==="2") { 
                        let cArr = String(item.chon||"").split('-'); 
                        let dStr = String(item.dung||"").toUpperCase().replace(/[ÐD]/g, 'Đ');
                        let dArr = dStr.match(/[ĐS]/g);
                        if (!dArr) dArr = [];
                        let match = 0; 
                        for(let i=0; i<4; i++) { 
                            let cValRaw = cArr[i] || "";
                            let cVal = String(cValRaw).toUpperCase().replace(/[ÐD]/g, 'Đ');
                            let cleanCVal = "";
                            if (cVal.includes("Đ")) cleanCVal = "Đ";
                            if (cVal.includes("S")) cleanCVal = "S";
                            let dVal = dArr[i] || "";
                            if(cleanCVal !== "" && cleanCVal === dVal) match++; 
                        } 
                        if(match===1) hs.p2Score += 0.1; else if(match===2) hs.p2Score += 0.25; else if(match===3) hs.p2Score += 0.5; else if(match===4) hs.p2Score += 1.0; 
                        isDung = (match === 4); 
                    } 
                    else if(item.phan==="3") { 
                        let aClean = String(item.chon).replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
                        let dClean = String(item.dung).replace(/'/g, '').replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
                        isDung = (aClean !== "" && aClean === dClean);
                        if(isDung) hs.p3Score += 0.25; 
                    } 
                    if(!isDung) { 
                        failCount[k] = (failCount[k] || 0) + 1; 
                        failCount[k+"_txt"] = item.noiDungCau; 
                    } 
                }
            } catch(e){} 
        } 

        hs.p1Score = parseFloat(hs.p1Score).toFixed(2);
        hs.p2Score = parseFloat(hs.p2Score).toFixed(2);
        hs.p3Score = parseFloat(hs.p3Score).toFixed(2);

        if (isSubmitted) { 
            submittedCount++; 
            let diemFloat = parseFloat(hs.Diem) || 0;
            sum += diemFloat; 
            if(diemFloat >= 5.0) passed++; 

            if (diemFloat >= 8.0) countGioi++;
            else if (diemFloat >= 6.5) countKha++;
            else if (diemFloat >= 5.0) countTB++;
            else countYeu++;
        } 
        
        let total = isSubmitted ? parseFloat(hs.Diem).toFixed(2) : "-"; 
        
        let badgeClass = '';
        if(isSubmitted) {
            let score = parseFloat(total);
            if(score >= 8.0) badgeClass = 'bg-gioi';
            else if(score >= 6.5) badgeClass = 'bg-kha';
            else if(score >= 5.0) badgeClass = 'bg-tb';
            else badgeClass = 'bg-yeu';
        }
        
        let scoreHtml = isSubmitted ? `<span class="badge-score ${badgeClass}">${total}</span>` : `<span style="color:#95a5a6; font-weight:bold;">${total}</span>`;
        let trStyle = isSubmitted && parseFloat(total) < 5.0 ? 'background-color: #fdf2e9;' : ''; 
        
        let sttHtml = isSubmitted ? '<span style="color:#27ae60;font-weight:bold;">✅ Đã nộp</span>' : '<span style="color:#95a5a6;">Chưa nộp</span>';

        const txtSBD = (hs.MaHS || "").toString().toUpperCase();
        const txtTen = (hs.HoTen || "").toString().toUpperCase();

        // KIỂM TRA VI PHẠM & GẮN CỜ CẢNH BÁO (DEEP SCAN + SIGNAL 88)
        let flagHtml = "";
        let violationColor = "#d93025"; 
        const ctStr = (hs.ChiTiet || "").toUpperCase();
        // Cờ đỏ nếu: Có tag kỹ thuật HOẶC số vi phạm là 88 (mã đặc biệt)
        let isFatalP2 = ctStr.includes("PART_II") || ctStr.includes("PHẦN II") || ctStr.includes("FATAL_P2") || hs.ViPham >= 88;
        
        if (isFatalP2) {
            // Trường hợp 1: Vi phạm nghiêm trọng Phần II (Ép thu bài ngay lập tức)
            violationColor = "#d93025"; // Đỏ đậm
            flagHtml = '<span title="VI PHẠM NGHIÊM TRỌNG (PHẦN II) - HỆ THỐNG ĐÃ ÉP THU BÀI" style="color:#d93025; cursor:help; font-size:18px; margin-left:5px;">🚩</span>';
        } else if (hs.ViPham >= 3) {
            // Trường hợp 2: Vi phạm đủ 3 lần (Ép thu bài do quá số lần)
            violationColor = "#f39c12"; // Màu cam
            flagHtml = '<span title="VI PHẠM ĐỦ 3 LẦN - HỆ THỐNG ĐÃ ÉP THU BÀI" style="color:#f39c12; cursor:help; font-size:18px; margin-left:5px;">🚩</span>';
        }

        let displayViPham = hs.ViPham >= 88 ? "X" : hs.ViPham;
        let viPhamDisplay = (hs.ViPham > 0 ? `<b style="color: ${violationColor}; font-size: 16px;">${displayViPham}</b>` : "") + flagHtml;
        
        html += `<tr style="${trStyle}">
            <td><b>${hs.MaHS || '-'}</b></td>
            <td style="text-align:left;"><b>${hs.HoTen}</b></td>
            <td>${hs.Lop}</td>
            <td id="live-status-${hs.id}">${sttHtml}</td>
            <td>${hs.MaDe || '-'}</td>
            <td>${scoreHtml}</td>
            <td>${isSubmitted ? parseFloat(hs.p1Score) : '-'}</td>
            <td>${isSubmitted ? parseFloat(hs.p2Score) : '-'}</td>
            <td>${isSubmitted ? parseFloat(hs.p3Score) : '-'}</td>
            <td>${viPhamDisplay}</td>
        </tr>`; 
    }); 
    
    if(document.getElementById("statSiSo")) document.getElementById("statSiSo").innerText = `${submittedCount} / ${displayList.length}`; 
    if(document.getElementById("statAvg")) document.getElementById("statAvg").innerText = submittedCount > 0 ? (sum/submittedCount).toFixed(2) : "0.0"; 
    if(document.getElementById("statPass")) document.getElementById("statPass").innerText = submittedCount > 0 ? Math.round((passed/submittedCount)*100) + "%" : "0%"; 
    if(document.getElementById("statPassDetail")) document.getElementById("statPassDetail").innerText = `${passed} học sinh đạt từ 5.0 trở lên`; 

    if(document.getElementById("distGioi")) document.getElementById("distGioi").innerText = countGioi;
    document.getElementById('dashBody').innerHTML = html; 
    
    // Áp dụng bộ lọc tìm kiếm ngay sau khi render xong
    xuLyLiveSearch();

    if(document.getElementById("distKha")) document.getElementById("distKha").innerText = countKha;
    if(document.getElementById("distTB")) document.getElementById("distTB").innerText = countTB;
    if(document.getElementById("distYeu")) document.getElementById("distYeu").innerText = countYeu;
    
    let maxFail = 0; let killerQ = "Chưa có dữ liệu"; 
    Object.keys(failCount).forEach(k => { 
        if(!k.includes("_txt")) {
            let val = Reflect.get(failCount, k);
            if (val > maxFail) {
                maxFail = val; 
                killerQ = Reflect.get(failCount, k+"_txt");
            }
        } 
    }); 
    if(document.getElementById("statKiller")) {
        if(maxFail > 0) document.getElementById("statKiller").innerHTML = `Có <b>${maxFail} học sinh</b> làm sai câu hỏi sau:<br/> <span style="font-style:italic; font-weight:normal; color:#555;">"${(killerQ || "").substring(0, 90)}..."</span>`; 
        else document.getElementById("statKiller").innerHTML = `Đang thu thập dữ liệu...`;
    }
    
}

// BỘ BẮT SÓNG REALTIME DỰ PHÒNG
function kichHoatLienKetRealtimeGiaoVien() {
    if (ketQuaChannel) {
        sb.removeChannel(ketQuaChannel);
    }
    
    ketQuaChannel = sb.channel('gv-ket-qua-master')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ket_qua' }, payload => {
            if (document.getElementById('dashMaPhong') && document.getElementById('dashMaPhong').value) {
                if (window.autoDashTimeout) clearTimeout(window.autoDashTimeout);
                window.autoDashTimeout = setTimeout(() => {
                    fetchDashboard(true);
                }, 1000); 
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'phong_thi' }, payload => {
            if (window.autoRadarTimeout) clearTimeout(window.autoRadarTimeout);
            window.autoRadarTimeout = setTimeout(() => fetchRadar(), 1500);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hoc_sinh' }, payload => {
            if (window.autoStudentTimeout) clearTimeout(window.autoStudentTimeout);
            window.autoStudentTimeout = setTimeout(() => {
                if(allStudents.length > 0) fetchStudents(true);
            }, 1000);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'giao_vien' }, payload => {
            if (window.autoTeacherTimeout) clearTimeout(window.autoTeacherTimeout);
            window.autoTeacherTimeout = setTimeout(() => {
                if(allTeachers.length > 0) fetchTeachers(true);
            }, 1000);
        })
        .subscribe();
}

/* ================================================   LOGIC CHUYỂN TAB VÀ SIDEBAR MENU 
======================================================= */
function switchTab(tabId) {
    let clickedBtn = document.querySelector(`.nav-btn[onclick*="${tabId}"]`);
    let isAlreadyActive = clickedBtn ? clickedBtn.classList.contains('active') : false;

    if (isAlreadyActive) {
        let subNav = document.getElementById('subnav-' + tabId);
        if (subNav) {
            let isExpanded = subNav.style.display === 'flex';
            subNav.style.display = isExpanded ? 'none' : 'flex';
            let icon = clickedBtn.querySelector('.toggle-icon');
            if (icon) {
                icon.classList.remove('fa-chevron-up', 'fa-chevron-down');
                icon.classList.add(isExpanded ? 'fa-chevron-down' : 'fa-chevron-up');
            }
        }
        return;
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    let targetTab = document.getElementById(tabId);
    if(targetTab) targetTab.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        let icon = btn.querySelector('.toggle-icon');
        if(icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
    });

    if(clickedBtn) {
        clickedBtn.classList.add('active');
        let icon = clickedBtn.querySelector('.toggle-icon');
        if(icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
    }

    document.querySelectorAll('.sidebar-sub-tabs').forEach(el => el.style.display = 'none');
    let subNav = document.getElementById('subnav-' + tabId);
    if(subNav) subNav.style.display = 'flex';

    if(tabId === 'taoDe') { loadBankMeta(); }
    if(tabId === 'dieuHanh') { fetchRadar(); loadMetaData(); taiDanhSachPhong(); }
    if(tabId === 'thongKe') { taiDanhSachPhong(); }
    if(tabId === 'quanLyTK') {
        if(allStudents.length === 0) fetchStudents();
        if(allTeachers.length === 0) fetchTeachers();
    }
}

function switchSubTabTaoDe(mode) {
    document.querySelectorAll('#taoDe .sub-tab-content').forEach(el => el.classList.remove('active'));
    const targetId = 'subTab' + mode.charAt(0).toUpperCase() + mode.slice(1);
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.add('active');

    document.querySelectorAll('#subnav-taoDe button').forEach(btn => {
        btn.classList.remove('active');
        if(btn.id === 'btnSubOffline') { btn.style.borderColor = "#dadce0"; btn.style.color = "#5f6368"; }
        if(btn.id === 'btnSubManual') { btn.style.background = "transparent"; btn.style.borderColor = "transparent"; btn.style.color = "#5f6368"; }
    });

    let activeSubBtn = document.querySelector(`#subnav-taoDe button[onclick*="${mode}"]`);
    if (activeSubBtn) {
        activeSubBtn.classList.add('active');
        if(mode === 'manual') {
            activeSubBtn.style.background = "#e74c3c";
            activeSubBtn.style.color = "#fff";
        }
        if(mode === 'offline') {
            activeSubBtn.style.borderColor = "#8e44ad";
            activeSubBtn.style.color = "#8e44ad";
        }
    }

    if (mode === 'manage') fetchFullBank(true);
    if (mode === 'matrix') loadBankMeta();
}

function switchSubTabTK(mode) {
    document.querySelectorAll('#quanLyTK .sub-tab-content').forEach(el => el.classList.remove('active'));
    const targetId = 'subTab' + mode.charAt(0).toUpperCase() + mode.slice(1);
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.add('active');

    document.querySelectorAll('#subnav-quanLyTK button').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent'; 
        btn.style.color = '#5f6368';
    });

    let activeSubBtn = document.querySelector(`#subnav-quanLyTK button[onclick*="${mode}"]`);
    if(activeSubBtn) { 
        activeSubBtn.classList.add('active'); 
        activeSubBtn.style.background = '#e8f0fe'; 
        activeSubBtn.style.color = '#1a73e8'; 
    }
}

/* ================================================   BÓC TÁCH WORD HYBRID (TRẢI PHẲNG CÂU CHÙM + KIỂM DỊCH)
======================================================= */
window.getMammothOptions = function() {
    return {
        styleMap: ["u => u", "strike => del", "b => b", "i => i"],
        convertImage: mammoth.images.imgElement(img => {
            return img.read("base64").then(b64 => window.compressImage(b64, img.contentType));
        })
    };
};

window.compressImage = function(base64Str, mimeType) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width, height = img.height;
            if (width > 600) { height = Math.round(height * 600 / width); width = 600; }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            resolve({ src: canvas.toDataURL('image/jpeg', 0.6) });
        };
        img.onerror = () => resolve({ src: "data:" + mimeType + ";base64," + base64Str });
        img.src = "data:" + mimeType + ";base64," + base64Str;
    });
};

window.fileToArrayBuffer = function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error("Lỗi đọc file."));
        reader.readAsArrayBuffer(file);
    });
};

window.findStyledAnswer = function(qHtml, letter, chunkHtml) {
    if (/<u\b|<\/u>|text-decoration\s*:\s*underline|<b\b|<\/b>|<strong>|<\/strong>|color\s*:\s*(?:red|#f00|rgb\(\s*255\s*,\s*0\s*,\s*0\s*\))/i.test(chunkHtml)) return true;
    let re = new RegExp(`<[^>]*?(?:color\\s*:\\s*(?:red|#f00|rgb\\(\\s*255\\s*,\\s*0\\s*,\\s*0\\s*\\))|\\bb\\b|strong|\\bu\\b|text-decoration\\s*:\\s*underline)[^>]*>(?:\\s|<[^>]+>)*${letter}(?:\\s|<[^>]+>)*[.){/\\\\]`, 'i');
    if (re.test(qHtml)) return true;
    return false;
};

window.parseHTMLToJSON = function(htmlText) {
    let imgMap = new Array();
    htmlText = htmlText.replace(/<img[^>]+>/gi, match => { imgMap.push(match); return '[[IMG_' + (imgMap.length - 1) + ']]'; });
    
    htmlText = htmlText.replace(/Thí\s*sinh\s*trả\s*lời\s*từ\s*câu[^<]*?đến\s*câu[^<.]*[.]?/gi, "");
    htmlText = htmlText.replace(/(?:<[^>]+>|&nbsp;|\s|,|-|\()*(?:và\s+)?(?:để\s+)?trả\s+lời(?:<[^>]+>|&nbsp;|\s)*(?:từ\s+)?(?:các\s+)?câu(?:<[^>]+>|&nbsp;|\s|\d|,|-|đến|và)+[:.\)]?/gi, ":");
    htmlText = htmlText.replace(/(?:<[^>]+>|&nbsp;|\s)*:\s*:/g, ":");

    const reP2 = /PH(?:ẦN|AN)(?:<[^>]+>|\s|&nbsp;)*(?:II|2)\b/i; 
    const reP3 = /PH(?:ẦN|AN)(?:<[^>]+>|\s|&nbsp;)*(?:III|3)\b/i;
    let idxP2 = htmlText.search(reP2); let idxP3 = htmlText.search(reP3);
    if (idxP2 !== -1 && idxP3 !== -1 && idxP3 < idxP2) idxP3 = -1;

    let p1H = htmlText, p2H = "", p3H = "";
    if (idxP2 !== -1 && idxP3 !== -1) { p1H = htmlText.substring(0, idxP2); p2H = htmlText.substring(idxP2, idxP3); p3H = htmlText.substring(idxP3); } 
    else if (idxP2 !== -1) { p1H = htmlText.substring(0, idxP2); p2H = htmlText.substring(idxP2); }
    else if (idxP3 !== -1) { p1H = htmlText.substring(0, idxP3); p3H = htmlText.substring(idxP3); }

    let questions = new Array(); 
    let quarantine = new Array();

    const extractQuestions = (htmlBlocks, phanStr) => {
        let regex = /(?:^|>|<br>|<\/?p>)(?:\s|&nbsp;)*(?:\[(NB|TH|VD|VDC)\](?:\s|<[^>]+>)*)?(#\s*[Cc]âu|#\s*[Bb]ài|#|[Cc]âu|[Bb]ài)(?:\s|<[^>]+>)*(\d+)?(?:\s|<[^>]+>)*[:.\-]?/gi;
        
        let matches = new Array();
        let match;
        while ((match = regex.exec(htmlBlocks)) !== null) {
            matches.push({
                index: match.index,
                length: match[0].length,
                mucDo: match[1] ? match[1].toUpperCase() : "NB",
                markerRaw: match[2].toLowerCase(),
                full: match[0]
            });
        }

        let currentSharedContext = "";

        for (let i = 0; i < matches.length; i++) {
            let m = matches[i];
            let type = 'NORMAL';
            if (m.markerRaw.includes('#') && (m.markerRaw.includes('câu') || m.markerRaw.includes('bài'))) {
                type = 'GROUP_CHILD';
            } else if (m.markerRaw.includes('#')) {
                type = 'GROUP_LEAD';
            }

            let start = m.index;
            let contentStart = m.index + m.length;
            let end = (i + 1 < matches.length) ? matches[i + 1].index : htmlBlocks.length;

            let rawHtml = htmlBlocks.substring(start, end);
            let qHtml = htmlBlocks.substring(contentStart, end).replace(new RegExp("^(\\s*<[^>]+>\\s*)*"), '');

            if (type === 'GROUP_LEAD') {
                currentSharedContext = qHtml;
            } else {
                if (type === 'NORMAL') {
                    currentSharedContext = ""; 
                }

                let finalHtmlToParse = qHtml;
                let finalRawHtml = rawHtml;

                if (currentSharedContext !== "" && type === 'GROUP_CHILD') {
                    let prefix = "<div style=\"background:#f8f9fa; padding:10px; border-left:4px solid #1a73e8; margin-bottom:10px; font-size:14px; color:#2c3e50;\">" + currentSharedContext + "</div>";
                    finalHtmlToParse = prefix + qHtml;
                    finalRawHtml = prefix + rawHtml; 
                }

                let isSuccess = parseSingleQuestionRelaxed(finalHtmlToParse, phanStr, m.mucDo, questions, finalRawHtml);
                
                if (!isSuccess) {
                    quarantine.push({ Phan: phanStr, MucDo: m.mucDo, RawHtml: finalRawHtml });
                }
            }
        }
    };

    const parseSingleQuestionRelaxed = (h, phan, mucDo, validArray, rawHtmlBackup) => {
        try {
            let nDung = "";
            let cleanContent = (html) => (html||"").replace(/<\/?(p|div|ul|ol|li|span|font)[^>]*>/gi, '<br>').replace(/(<br>\s*)+/gi, '<br>').replace(/^<br>|<br>$/gi, '').replace(new RegExp("<[^>]*$"), '').trim();
            let cleanAns = (html) => (html||"").replace(new RegExp("<[^>]+>", "g"), ' ').replace(new RegExp("<[^>]*$"), '').replace(/\s+/g, ' ').trim();

            if (phan === "1") {
                let optRe = /(?:^|>|\s|&nbsp;|<br>|<p>)([A-D])(?:\s|<[^>]+>)*[.)/]/gi;
                let markers = new Array(); let mMatch;
                while ((mMatch = optRe.exec(h)) !== null) markers.push({ letter: mMatch[1].toUpperCase(), index: mMatch.index, length: mMatch[0].length });
                
                let mA = markers.slice().reverse().find(x => x.letter === 'A');
                let mB = markers.slice().reverse().find(x => x.letter === 'B');
                let mC = markers.slice().reverse().find(x => x.letter === 'C');
                let mD = markers.slice().reverse().find(x => x.letter === 'D');
                
                if (!mA || !mB || !mC || !mD) return false;

                let sortedOpts = [mA, mB, mC, mD].sort((x, y) => x.index - y.index);
                nDung = cleanContent(h.substring(0, sortedOpts[0].index));
                
                let t0 = h.substring(sortedOpts[0].index + sortedOpts[0].length, sortedOpts[1].index);
                let t1 = h.substring(sortedOpts[1].index + sortedOpts[1].length, sortedOpts[2].index);
                let t2 = h.substring(sortedOpts[2].index + sortedOpts[2].length, sortedOpts[3].index);
                
                let mAns = h.match(/(?:^|>|\s|<br>|<p>)[Đđ]áp\s*(?:[áa]n|[sS]ố)(?:<[^>]+>|\s)*[:.]\s*([A-D])/i);
                let endD = mAns ? mAns.index : h.length;
                let t3 = h.substring(sortedOpts[3].index + sortedOpts[3].length, endD);
                
                let ansL = mAns ? mAns[1].toUpperCase() : "";
                
                if (!ansL) { 
                    let arrTemp = new Array('A', 'B', 'C', 'D');
                    let optContents = new Array(t0, t1, t2, t3);
                    let arr = arrTemp.filter(l => window.findStyledAnswer(h, l, optContents[arrTemp.indexOf(l)])); 
                    if (arr.length === 1) ansL = arr[0]; 
                }

                validArray.push({ Phan: "1", MucDo: mucDo, NoiDung: nDung, DapAnA: cleanAns(t0), DapAnB: cleanAns(t1), DapAnC: cleanAns(t2), DapAnD: cleanAns(t3), DapAnDung: ansL, RawHtmlFallback: rawHtmlBackup });
                return true;
            }
            else if (phan === "2") {
                let optRe = /(?:^|>|\s|&nbsp;|<br>|<p>)([a-d])(?:\s|<[^>]+>)*[.)/]/gi;
                let markers = new Array(); let mMatch;
                while ((mMatch = optRe.exec(h)) !== null) markers.push({ letter: mMatch[1].toLowerCase(), index: mMatch.index, length: mMatch[0].length });
                
                let ma = markers.slice().reverse().find(x => x.letter === 'a');
                let mb = markers.slice().reverse().find(x => x.letter === 'b');
                let mc = markers.slice().reverse().find(x => x.letter === 'c');
                let md = markers.slice().reverse().find(x => x.letter === 'd');

                if (!ma || !mb || !mc || !md) return false;

                let sortedOpts = [ma, mb, mc, md].sort((x, y) => x.index - y.index);
                nDung = cleanContent(h.substring(0, sortedOpts[0].index));
                
                let t0 = h.substring(sortedOpts[0].index + sortedOpts[0].length, sortedOpts[1].index);
                let t1 = h.substring(sortedOpts[1].index + sortedOpts[1].length, sortedOpts[2].index);
                let t2 = h.substring(sortedOpts[2].index + sortedOpts[2].length, sortedOpts[3].index);
                
                let mAns = h.match(/(?:^|>|\s|<br>|<p>)[Đđ]áp\s*(?:[áa]n|[sS]ố)(?:<[^>]+>|\s)*[:.]\s*([\s\S]*?)$/i);
                let endD = mAns ? mAns.index : h.length;
                let t3 = h.substring(sortedOpts[3].index + sortedOpts[3].length, endD);
                
                let eOpts = { 'a': { raw: t0 }, 'b': { raw: t1 }, 'c': { raw: t2 }, 'd': { raw: t3 } };
                let ansS = "";
                if (mAns) { ansS = cleanAns(mAns[1]).toUpperCase().replace(new RegExp("[^ĐS]", "g"), ''); if(ansS.length >= 4) ansS = ansS.substring(0,4).split('').join('-'); }
                if (!ansS) {
                    let sA = window.findStyledAnswer(h, 'a', eOpts['a'].raw) ? 'Đ' : 'S'; let sB = window.findStyledAnswer(h, 'b', eOpts['b'].raw) ? 'Đ' : 'S'; let sC = window.findStyledAnswer(h, 'c', eOpts['c'].raw) ? 'Đ' : 'S'; let sD = window.findStyledAnswer(h, 'd', eOpts['d'].raw) ? 'Đ' : 'S';
                    if (!(sA==='S' && sB==='S' && sC==='S' && sD==='S')) ansS = `${sA}-${sB}-${sC}-${sD}`;
                }

                validArray.push({ Phan: "2", MucDo: mucDo, NoiDung: nDung, DapAnA: cleanAns(t0), DapAnB: cleanAns(t1), DapAnC: cleanAns(t2), DapAnD: cleanAns(t3), DapAnDung: ansS, RawHtmlFallback: rawHtmlBackup });
                return true;
            }
            else if (phan === "3") {
                let mAns = h.match(/(?:^|>|\s|<br>|<p>)[Đđ]áp\s*(?:[áa]n|[sS]ố)(?:<[^>]+>|\s)*[:.]\s*([\s\S]*?)$/i);
                nDung = cleanContent(mAns ? h.substring(0, mAns.index) : h);
                let ansStr = "";
                if (mAns) { ansStr = cleanAns(mAns[1]); } 
                else {
                    let spanMatch = h.match(/<span[^>]*color\s*:\s*(?:red|#f00)[^>]*>([\s\S]*?)<\/span>|<b\b[^>]*>([\s\S]*?)<\/b>|<strong[^>]*>([\s\S]*?)<\/strong>|<u\b[^>]*>([\s\S]*?)<\/u>/i);
                    if (spanMatch) { ansStr = cleanAns(spanMatch[1] || spanMatch[2] || spanMatch[3] || spanMatch[4]); nDung = cleanContent(h.replace(spanMatch[0], '')); }
                }
                if (ansStr) ansStr = "'" + ansStr; 
                
                if (!nDung && !ansStr) return false;

                validArray.push({ Phan: "3", MucDo: mucDo, NoiDung: nDung, DapAnA: "", DapAnB: "", DapAnC: "", DapAnD: "", DapAnDung: ansStr, RawHtmlFallback: rawHtmlBackup });
                return true;
            }
            return false;
        } catch(e) {
            return false;
        }
    };

    extractQuestions(p1H, "1"); extractQuestions(p2H, "2"); extractQuestions(p3H, "3");
    
    questions.forEach(q => {
        let r = (t) => (t||"").replace(/\[\[IMG_(\d+)\]\]/g, (m, p1) => imgMap[parseInt(p1)] || m);
        q.NoiDung = r(q.NoiDung); q.DapAnA = r(q.DapAnA); q.DapAnB = r(q.DapAnB); q.DapAnC = r(q.DapAnC); q.DapAnD = r(q.DapAnD);
        q.RawHtmlFallback = r(q.RawHtmlFallback);
    });
    
    quarantine.forEach(q => {
        let r = (t) => (t||"").replace(/\[\[IMG_(\d+)\]\]/g, (m, p1) => imgMap[parseInt(p1)] || m);
        q.RawHtml = r(q.RawHtml);
    });

    if(questions.length===0 && quarantine.length===0) return {hopLe:false, thongBao:"⛔ Không tìm thấy cấu trúc câu hỏi nào. Hãy kiểm tra định dạng file Word."};
    
    return {hopLe:true, duLieu: questions, quarantine: quarantine};
};


// TRẠM KIỂM DỊCH: ĐIỀU HƯỚNG BÓC TÁCH
window.processFile = async function(mode) {
    if (!checkWorkspaceAction()) return;
    let fileInput = document.getElementById(mode === 'direct' ? 'uploadFileDirect' : 'uploadFileBank');
    let logEl = document.getElementById(mode === 'direct' ? 'logDirect' : 'logBank');
    let btn = document.getElementById(mode === 'direct' ? 'btnDirect' : 'btnBank');

    if (!fileInput.files || fileInput.files.length === 0) return alert("Vui lòng chọn file Word (.docx)!");

    let oldText = btn.innerText;
    btn.innerText = "⏳ ĐANG XỬ LÝ...";
    btn.disabled = true;
    logEl.innerText = "Đang đọc dữ liệu từ file Word...";

    try {
        if (typeof mammoth === "undefined") throw new Error("Thư viện đọc Word (Mammoth.js) chưa tải xong, vui lòng chờ 1 lát rồi bấm lại.");
        
        const arrayBuffer = await window.fileToArrayBuffer(fileInput.files[0]);
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, window.getMammothOptions());
        let html = result.value || "";

        logEl.innerText = "Đang bóc tách từng câu hỏi...";
        let parseRes = window.parseHTMLToJSON(html);
        if (!parseRes.hopLe) throw new Error(parseRes.thongBao);

        if (parseRes.quarantine.length > 0) {
            logEl.innerText = `⚠️ Phát hiện ${parseRes.quarantine.length} câu bị lỗi gõ phím. Đang mở Trạm Kiểm Dịch...`;
            
            let currentParams = {};
            if (mode === 'direct') {
                currentParams.maPhong = document.getElementById('maPhongDirect').value.trim();
                currentParams.soLuong = parseInt(document.getElementById('soLuongDeDirect').value) || 4;
                currentParams.startCode = parseInt(document.getElementById('startCodeDirect').value) || 101;
                currentParams.stepCode = parseInt(document.getElementById('stepCodeDirect').value) || 1;
            } else {
                currentParams.baiHoc = document.getElementById('baiHocNap').value.trim();
            }

            qrtState.pending = parseRes.quarantine;
            qrtState.valid = parseRes.duLieu;
            qrtState.mode = mode;
            qrtState.params = currentParams;
            qrtState.btnId = btn.id;
            qrtState.oldBtnText = oldText;
            
            renderQuarantineItem();
            document.getElementById('quarantineModal').style.display = 'flex';
            return; 
        }

        await continueProcessingFile(parseRes.duLieu, mode, btn, logEl, oldText, {
            maPhong: document.getElementById('maPhongDirect').value.trim(),
            soLuong: parseInt(document.getElementById('soLuongDeDirect').value) || 4,
            startCode: parseInt(document.getElementById('startCodeDirect').value) || 101,
            stepCode: parseInt(document.getElementById('stepCodeDirect').value) || 1,
            baiHoc: document.getElementById('baiHocNap') ? document.getElementById('baiHocNap').value.trim() : ''
        });

    } catch (err) {
        logEl.innerText = "❌ Lỗi thực thi: " + err.message;
        alert("Lỗi: " + err.message);
        btn.innerText = oldText;
        btn.disabled = false;
    } 
};

// TRẠM KIỂM DỊCH: HIỂN THỊ VÀ LƯU
window.changePhanQrt = function() {
    let phan = document.getElementById('qrt-phan').value;
    document.getElementById('qrt-area-p1').style.display = (phan === "1") ? "block" : "none";
    document.getElementById('qrt-area-p2').style.display = (phan === "2") ? "block" : "none";
    document.getElementById('qrt-area-p3').style.display = (phan === "3") ? "block" : "none";
};

window.renderQuarantineItem = function() {
    if (qrtState.pending.length === 0) {
        closeQuarantine(false);
        return;
    }
    let current = qrtState.pending[0];
    document.getElementById('qrt-count').innerText = qrtState.pending.length;
    document.getElementById('qrt-raw-html').innerHTML = current.RawHtml;
    
    document.getElementById('qrt-phan').value = current.Phan || "1";
    document.getElementById('qrt-mucdo').value = current.MucDo || "NB";
    
    document.getElementById('qrt-noidung').innerHTML = "";
    document.getElementById('qrt-a1').value = ""; document.getElementById('qrt-b1').value = ""; document.getElementById('qrt-c1').value = ""; document.getElementById('qrt-d1').value = ""; document.getElementById('qrt-dapan1').value = "A";
    document.getElementById('qrt-a2').value = ""; document.getElementById('qrt-b2').value = ""; document.getElementById('qrt-c2').value = ""; document.getElementById('qrt-d2').value = ""; document.getElementById('qrt-dapan2').value = "";
    document.getElementById('qrt-dapan3').value = "";
    
    changePhanQrt();
};

window.skipQuarantineItem = function() {
    qrtState.pending.shift();
    renderQuarantineItem();
};

window.saveQuarantineItem = function() {
    let phan = document.getElementById('qrt-phan').value;
    let mucDo = document.getElementById('qrt-mucdo').value;
    let noiDung = safeHTML(document.getElementById('qrt-noidung').innerHTML.trim());
    
    if(!noiDung || noiDung === "<br>") return alert("Vui lòng nhập Nội dung câu hỏi!");
    
    let cauHoi = { Phan: phan, MucDo: mucDo, NoiDung: noiDung, DapAnA: "", DapAnB: "", DapAnC: "", DapAnD: "", DapAnDung: "" };
    
    if (phan === "1") {
        cauHoi.DapAnA = safeHTML(document.getElementById('qrt-a1').value.trim());
        cauHoi.DapAnB = safeHTML(document.getElementById('qrt-b1').value.trim());
        cauHoi.DapAnC = safeHTML(document.getElementById('qrt-c1').value.trim());
        cauHoi.DapAnD = safeHTML(document.getElementById('qrt-d1').value.trim());
        cauHoi.DapAnDung = document.getElementById('qrt-dapan1').value;
        if (!cauHoi.DapAnA || !cauHoi.DapAnB || !cauHoi.DapAnC || !cauHoi.DapAnD) return alert("Vui lòng nhập đủ 4 đáp án!");
    } else if (phan === "2") {
        cauHoi.DapAnA = safeHTML(document.getElementById('qrt-a2').value.trim());
        cauHoi.DapAnB = safeHTML(document.getElementById('qrt-b2').value.trim());
        cauHoi.DapAnC = safeHTML(document.getElementById('qrt-c2').value.trim());
        cauHoi.DapAnD = safeHTML(document.getElementById('qrt-d2').value.trim());
        let dapAnStr = document.getElementById('qrt-dapan2').value.trim().toUpperCase().replace(/\s/g, '').replace(new RegExp("[-–—]", "g"), '-');
        if (!new RegExp("^[ĐS]-[ĐS]-[ĐS]-[ĐS]$").test(dapAnStr)) return alert("Chuỗi đáp án sai định dạng. (VD: Đ-S-Đ-S)");
        cauHoi.DapAnDung = dapAnStr;
    } else {
        let dapAn = safeHTML(document.getElementById('qrt-dapan3').value.trim());
        if (!dapAn) return alert("Vui lòng nhập đáp án!");
        if (!dapAn.startsWith("'")) dapAn = "'" + dapAn;
        cauHoi.DapAnDung = dapAn;
    }
    
    qrtState.valid.push(cauHoi);
    qrtState.pending.shift();
    renderQuarantineItem();
};

window.closeQuarantine = function(isForceClose) {
    document.getElementById('quarantineModal').style.display = 'none';
    let btn = document.getElementById(qrtState.btnId);
    
    if (isForceClose) {
        if(btn) { btn.innerText = qrtState.oldBtnText; btn.disabled = false; }
        document.getElementById(qrtState.mode === 'direct' ? 'logDirect' : 'logBank').innerText = "Đã hủy bỏ tiến trình bóc tách.";
        return;
    }
    
    let logEl = document.getElementById(qrtState.mode === 'direct' ? 'logDirect' : 'logBank');
    logEl.innerText = "Đã sửa xong lỗi. Đang tiếp tục tiến trình máy chủ...";
    continueProcessingFile(qrtState.valid, qrtState.mode, btn, logEl, qrtState.oldBtnText, qrtState.params);
};

window.continueProcessingFile = async function(cauHoiGoc, mode, btn, logEl, oldText, params) {
    try {
        if (mode === 'direct') {
            if (!params.maPhong) throw new Error("Vui lòng nhập Mã Phòng Thi!");
            logEl.innerText = "Đang thực hiện thuật toán trộn đề...";
            generateExams(cauHoiGoc, params.soLuong, params.maPhong, params.startCode, params.stepCode);

            logEl.innerText = "Đang đẩy dữ liệu lên máy chủ Supabase...";
            let pushRes = await luuDeThiLenSupabase(danhSachDeThi);
            if (pushRes.status === 'success') {
                logEl.innerText = `✅ HOÀN TẤT! Đã trộn ${params.soLuong} đề và đẩy an toàn vào phòng [${params.maPhong}].`;
            } else {
                throw new Error(pushRes.message);
            }

        } else if (mode === 'bank') {
            if (!params.baiHoc) throw new Error("Vui lòng nhập Tên Bài Học / Chủ Đề!");

            logEl.innerText = "Đang lưu trữ vào Ngân hàng...";
            let dataToInsert = cauHoiGoc.map(q => ({
                truong_id: gvData.truong_id,
                mon_id: activeWorkspaceMonId !== "ALL" ? activeWorkspaceMonId : null,
                bai_hoc: params.baiHoc,
                phan: String(q.Phan),
                muc_do: q.MucDo,
                noi_dung: q.NoiDung,
                a: q.DapAnA || "", b: q.DapAnB || "", c: q.DapAnC || "", d: q.DapAnD || "",
                dap_an_dung: q.DapAnDung || "",
                loi_giai: ""
            }));

            let { error } = await sb.from('ngan_hang').insert(dataToInsert);
            if (error) throw error;

            logEl.innerText = `✅ HOÀN TẤT! Đã nạp thành công ${cauHoiGoc.length} câu hỏi vào Ngân hàng.`;
            fetchFullBank(true); loadBankMeta();
        }
    } catch (err) {
        logEl.innerText = "❌ Lỗi thực thi: " + err.message;
        alert("Lỗi: " + err.message);
    } finally {
        if(btn) { btn.innerText = oldText; btn.disabled = false; }
    }
};

/* ================================================   TRỘN ĐỀ VÀ TIỆN ÍCH
======================================================= */
function changePhanThuCong() { 
    let phan = document.getElementById("manPhan").value; 
    document.getElementById("manAreaP1").style.display = (phan === "1") ? "block" : "none"; 
    document.getElementById("manAreaP2").style.display = (phan === "2") ? "block" : "none"; 
    document.getElementById("manAreaP3").style.display = (phan === "3") ? "block" : "none"; 
}

function themCauHoiThuCong() { 
    let phan = document.getElementById("manPhan").value; 
    let mucDo = document.getElementById("manMucDo").value; 
    let noiDung = safeHTML(document.getElementById("manNoiDung").innerHTML.trim()); 
    
    if(noiDung === "" || noiDung === "<br>") return alert("Vui lòng nhập nội dung câu hỏi!"); 
    
    let cauHoi = { Phan: phan, MucDo: mucDo, NoiDung: noiDung, DapAnA: "", DapAnB: "", DapAnC: "", DapAnD: "", DapAnDung: "" }; 
    
    if(phan === "1") { 
        cauHoi.DapAnA = safeHTML(document.getElementById("manA1").value.trim()); 
        cauHoi.DapAnB = safeHTML(document.getElementById("manB1").value.trim()); 
        cauHoi.DapAnC = safeHTML(document.getElementById("manC1").value.trim()); 
        cauHoi.DapAnD = safeHTML(document.getElementById("manD1").value.trim()); 
        cauHoi.DapAnDung = document.getElementById("manDapAn1").value.trim(); 
        if(!cauHoi.DapAnA || !cauHoi.DapAnB || !cauHoi.DapAnC || !cauHoi.DapAnD) return alert("Vui lòng nhập đủ 4 đáp án A, B, C, D!"); 
    } else if(phan === "2") { 
        cauHoi.DapAnA = safeHTML(document.getElementById("manA2").value.trim()); 
        cauHoi.DapAnB = safeHTML(document.getElementById("manB2").value.trim()); 
        cauHoi.DapAnC = safeHTML(document.getElementById("manC2").value.trim()); 
        cauHoi.DapAnD = safeHTML(document.getElementById("manD2").value.trim()); 
        let dapAnStr = document.getElementById("manDapAn2").value.trim().toUpperCase().replace(/\s/g, '').replace(new RegExp("[-–—]", "g"), '-'); 
        let validFormat = new RegExp("^[ĐS]-[ĐS]-[ĐS]-[ĐS]$"); 
        if(!validFormat.test(dapAnStr)) return alert("Chuỗi đáp án không đúng định dạng. Ví dụ chuẩn: Đ-S-Đ-S"); 
        cauHoi.DapAnDung = dapAnStr; 
    } else if(phan === "3") { 
        let dapAn = safeHTML(document.getElementById("manDapAn3").value.trim()); 
        if(dapAn === "") return alert("Vui lòng nhập đáp án!"); 
        if (!dapAn.startsWith("'")) dapAn = "'" + dapAn; 
        cauHoi.DapAnDung = dapAn; 
    } 
    
    danhSachThuCong.push(cauHoi); 
    document.getElementById("manNoiDung").innerHTML = ""; 
    document.getElementById("manA1").value = ""; 
    document.getElementById("manB1").value = ""; 
    document.getElementById("manC1").value = ""; 
    document.getElementById("manD1").value = ""; 
    document.getElementById("manA2").value = ""; 
    document.getElementById("manB2").value = ""; 
    document.getElementById("manC2").value = ""; 
    document.getElementById("manD2").value = ""; 
    document.getElementById("manDapAn2").value = ""; 
    document.getElementById("manDapAn3").value = ""; 
    renderBangThuCong(); 
}

function renderBangThuCong() { 
    let html = ""; 
    if(danhSachThuCong.length === 0) { 
        html = '<tr><td colspan="5">Chưa có câu hỏi nào được gõ...</td></tr>'; 
    } else { 
        danhSachThuCong.forEach((q, i) => { 
            let snippet = q.NoiDung.replace(new RegExp("<[^>]+>", "g"), ' ').substring(0, 60) + "..."; 
            let dapAnHienThi = String(q.DapAnDung); 
            if (dapAnHienThi.startsWith("'")) dapAnHienThi = dapAnHienThi.substring(1); 
            html += `<tr><td>${i+1}</td><td>P.${q.Phan}</td><td style="text-align:left;">${snippet}</td><td><b>${dapAnHienThi}</b></td><td><button style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="xoaCauThuCong(${i})">Xóa</button></td></tr>`; 
        }); 
    } 
    document.getElementById("manBody").innerHTML = html; 
    document.getElementById("manCount").innerText = danhSachThuCong.length; 
}

function xoaCauThuCong(index) { 
    danhSachThuCong.splice(index, 1); 
    renderBangThuCong(); 
}

function dayDeThuCong() { 
    if(!checkWorkspaceAction()) return;
    
    if(danhSachThuCong.length === 0) return alert("Giỏ câu hỏi trống! Hãy gõ thêm câu hỏi."); 
    
    let maPhong = document.getElementById("manMaPhong").value.trim(); 
    if(!maPhong) return alert("Vui lòng nhập Mã Phòng Thi!"); 
    
    let soLuongDe = parseInt(document.getElementById("manSoLuongDe").value) || 1; 
    let startCode = parseInt(document.getElementById("manStartCode").value) || 101; 
    let stepCode = parseInt(document.getElementById("manStepCode").value) || 1; 
    
    let btn = document.getElementById("btnDayMan"); 
    let oldText = btn.innerText; 
    btn.innerText = "⏳ ĐANG TRỘN VÀ ĐẨY..."; 
    btn.disabled = true; 
    
    generateExams(danhSachThuCong, soLuongDe, maPhong, startCode, stepCode); 
    
    luuDeThiLenSupabase(danhSachDeThi).then(data => { 
        btn.innerText = oldText; 
        btn.disabled = false; 
        if(data.status === "success") { 
            alert(`🎉 Đã đẩy thành công! Sẵn sàng thi!`); 
        } else { 
            alert("❌ Lỗi: " + data.message); 
        } 
    }).catch(e => { 
        btn.innerText = oldText; 
        btn.disabled = false; 
        alert("❌ Lỗi mạng: " + e.message); 
    }); 
}

function generateExams(cauHoiGoc, soLuongDe, maPhong, startCode = 101, stepCode = 1) { 
    danhSachDeThi = new Array(); 
    for (let i = 0; i < soLuongDe; i++) { 
        const maDe = startCode + (i * stepCode); 
        let deThiClone = JSON.parse(JSON.stringify(cauHoiGoc)); 
        let p1 = deThiClone.filter(c => String(c.Phan).trim() === "1"); 
        let p2 = deThiClone.filter(c => String(c.Phan).trim() === "2"); 
        let p3 = deThiClone.filter(c => String(c.Phan).trim() === "3"); 
        
        shuffleArray(p1); 
        p1.forEach((cauHoi, idx) => { 
            cauHoi.CauSo = "P1_" + (idx + 1); 
            cauHoi.MaPhong = maPhong; 
            cauHoi.MaDe = maDe.toString(); 
            let dapAnDungText = ""; 
            if (cauHoi.DapAnDung === "A") dapAnDungText = cauHoi.DapAnA; 
            if (cauHoi.DapAnDung === "B") dapAnDungText = cauHoi.DapAnB; 
            if (cauHoi.DapAnDung === "C") dapAnDungText = cauHoi.DapAnC; 
            if (cauHoi.DapAnDung === "D") dapAnDungText = cauHoi.DapAnD; 
            
            let options = new Array();
            options.push({ text: cauHoi.DapAnA });
            options.push({ text: cauHoi.DapAnB });
            options.push({ text: cauHoi.DapAnC });
            options.push({ text: cauHoi.DapAnD });
            shuffleArray(options); 

            cauHoi.DapAnA = options[0].text; 
            cauHoi.DapAnB = options[1].text; 
            cauHoi.DapAnC = options[2].text; 
            cauHoi.DapAnD = options[3].text; 
            
            if (options[0].text === dapAnDungText) cauHoi.DapAnDung = "A"; 
            if (options[1].text === dapAnDungText) cauHoi.DapAnDung = "B"; 
            if (options[2].text === dapAnDungText) cauHoi.DapAnDung = "C"; 
            if (options[3].text === dapAnDungText) cauHoi.DapAnDung = "D"; 
            danhSachDeThi.push(cauHoi); 
        }); 
        
        shuffleArray(p2); 
        p2.forEach((cauHoi, idx) => { 
            cauHoi.CauSo = "P2_" + (idx + 1); 
            cauHoi.MaPhong = maPhong; 
            cauHoi.MaDe = maDe.toString(); 
            let arrDung = String(cauHoi.DapAnDung).split("-"); 
            let optionsP2 = new Array();
            optionsP2.push({ text: cauHoi.DapAnA, ans: arrDung[0] });
            optionsP2.push({ text: cauHoi.DapAnB, ans: arrDung[1] });
            optionsP2.push({ text: cauHoi.DapAnC, ans: arrDung[2] });
            optionsP2.push({ text: cauHoi.DapAnD, ans: arrDung[3] });

            shuffleArray(optionsP2); 
            cauHoi.DapAnA = optionsP2[0].text; 
            cauHoi.DapAnB = optionsP2[1].text; 
            cauHoi.DapAnC = optionsP2[2].text; 
            cauHoi.DapAnD = optionsP2[3].text; 
            cauHoi.DapAnDung = `${optionsP2[0].ans}-${optionsP2[1].ans}-${optionsP2[2].ans}-${optionsP2[3].ans}`; 
            danhSachDeThi.push(cauHoi); 
        }); 
        
        shuffleArray(p3); 
        p3.forEach((cauHoi, idx) => { 
            cauHoi.CauSo = "P3_" + (idx + 1); 
            cauHoi.MaPhong = maPhong; 
            cauHoi.MaDe = maDe.toString(); 
            danhSachDeThi.push(cauHoi); 
        }); 
    } 
}

function shuffleArray(array) { 
    for (let i = array.length - 1; i > 0; i--) { 
        const j = Math.floor(Math.random() * (i + 1)); 
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    } 
}

async function getOrCreateRoom(maPhong) {
    let query = sb.from('phong_thi').select('id').eq('ma_phong', maPhong).eq('truong_id', gvData.truong_id);
    if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
    
    let {data: room} = await query.single();
    if(!room) {
        if(gvData.quyen === 'Admin' && (!activeWorkspaceMonId || activeWorkspaceMonId === 'ALL')) {
            throw new Error("⚠️ Admin chưa chọn bộ môn trên Header!");
        }
        let {data: newRoom} = await sb.from('phong_thi').insert({
            ma_phong: maPhong, truong_id: gvData.truong_id, mon_id: activeWorkspaceMonId, ten_dot: 'Bài kiểm tra', doi_tuong: 'TatCa', thoi_gian: 45, trang_thai: 'CHO_THI'
        }).select('id').single();
        return newRoom.id;
    }
    return room.id;
}

async function luuDeThiLenSupabase(deThiArray) {
    if(deThiArray.length === 0) return {status: 'success'};
    let maPhong = deThiArray[0].MaPhong;
    let phong_id = await getOrCreateRoom(maPhong);
    await sb.from('de_thi').delete().eq('phong_id', phong_id);
    
    let groupedByMaDe = {};
    deThiArray.forEach(q => {
        let md = q.MaDe;
        let currentArr = Reflect.get(groupedByMaDe, md);
        if (!currentArr) {
            currentArr = new Array();
            Reflect.set(groupedByMaDe, md, currentArr);
        }
        currentArr.push({ noi_dung: q.NoiDung, A: q.DapAnA, B: q.DapAnB, C: q.DapAnC, D: q.DapAnD, dap_an_dung: q.DapAnDung, phan: q.Phan });
    });

    let rowsToInsert = new Array();
    for (let ma_de in groupedByMaDe) {
        let cauSoArr = Reflect.get(groupedByMaDe, ma_de);
        rowsToInsert.push({ phong_id: phong_id, ma_de: String(ma_de), cau_so: JSON.stringify(cauSoArr) });
    }
    
    let { error } = await sb.from('de_thi').insert(rowsToInsert);
    if(error) { throw new Error(error.message); }
    return {status: 'success'};
}

async function xemTruocDeThi() {
    let maPhong = document.getElementById('ctrlMaPhong').value.trim();
    if(!maPhong) return alert("⚠️ Vui lòng CHỌN M Mã Phòng Thi ở ô phía trên trước khi xem trước đề!");

    let btn = document.querySelector('button[onclick="xemTruocDeThi()"]');
    let oldText = btn.innerText; btn.innerText = "⏳..."; btn.disabled = true;

    try {
        console.log("🔍 Đang tìm phòng thi:", { maPhong, truong_id: gvData.truong_id, mon_id: activeWorkspaceMonId });
        let query = sb.from('phong_thi').select('id, mon_id').eq('ma_phong', maPhong).eq('truong_id', gvData.truong_id);
        if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
        
        let {data: room} = await query.single();
        if(!room) { 
            console.error("❌ Không tìm thấy phòng thi khớp với tiêu chí.");
            alert("Phòng thi này chưa được tạo trên hệ thống hoặc không thuộc bộ môn bạn đang chọn!"); 
            btn.innerText = oldText; btn.disabled = false; return; 
        }

        console.log("✅ Đã tìm thấy phòng:", room);

        let {data: exams, error} = await sb.from('de_thi').select('*').eq('phong_id', room.id);
        btn.innerText = oldText; btn.disabled = false;

        if (error) {
            console.error("❌ Lỗi Supabase khi tải đề:", error);
            return alert("Lỗi phân quyền hoặc hệ thống: " + (error.message || "Không xác định"));
        }

        if(!exams || exams.length === 0) { 
            console.warn("⚠️ Phòng này tồn tại nhưng bảng de_thi không có dữ liệu cho phong_id:", room.id);
            return alert("Phòng này hiện tại Trống! Chưa có câu hỏi nào được trộn và đẩy lên."); 
        }

        previewExamData = exams;
        let uniqueMaDe = Array.from(new Set(exams.map(e => e.ma_de))).sort();
        let selectHtml = '';
        uniqueMaDe.forEach(md => { selectHtml += '<option value="' + md + '">MÃ ĐỀ: ' + md + '</option>'; });
        
        document.getElementById('previewMaDeSelect').innerHTML = selectHtml;
        document.getElementById('previewModal').style.display = 'flex';
        renderPreviewContent(); 
        
    } catch(e) {
        btn.innerText = oldText; btn.disabled = false; alert("Lỗi khi tải đề thi: " + e.message);
    }
}

function renderPreviewContent() {
    let maDe = document.getElementById('previewMaDeSelect').value;
    let currentExams = previewExamData.filter(e => e.ma_de === maDe);
    
    let examArray = new Array();
    try {
        if (currentExams.length > 0 && currentExams[0].cau_so) {
            let firstCauSo = currentExams[0].cau_so;
            examArray = typeof firstCauSo === 'string' ? JSON.parse(firstCauSo) : firstCauSo;
        }
    } catch(e) {
        document.getElementById('previewContent').innerHTML = '<p style="color:red; text-align:center;">Lỗi định dạng cũ. Hãy xóa phòng và tạo lại.</p>';
        return;
    }
    
    document.getElementById('previewCountMsg').innerText = '(Tổng số: ' + examArray.length + ' câu)';
    
    let p1 = examArray.filter(c => c.phan === "1" || c.Phan === "1");
    let p2 = examArray.filter(c => c.phan === "2" || c.Phan === "2");
    let p3 = examArray.filter(c => c.phan === "3" || c.Phan === "3");

    let html = "";
    
    if(p1.length > 0) {
        html += '<h3 style="color:#c0392b; border-bottom:1px solid #c0392b; padding-bottom:5px;">PHẦN I: Trắc nghiệm nhiều lựa chọn</h3>';
        p1.forEach((q, idx) => {
            let ansA_style = q.dap_an_dung === 'A' ? 'font-weight:bold; color:#27ae60; background:#e8f5e9; padding:2px 5px; border-radius:4px;' : '';
            let ansB_style = q.dap_an_dung === 'B' ? 'font-weight:bold; color:#27ae60; background:#e8f5e9; padding:2px 5px; border-radius:4px;' : '';
            let ansC_style = q.dap_an_dung === 'C' ? 'font-weight:bold; color:#27ae60; background:#e8f5e9; padding:2px 5px; border-radius:4px;' : '';
            let ansD_style = q.dap_an_dung === 'D' ? 'font-weight:bold; color:#27ae60; background:#e8f5e9; padding:2px 5px; border-radius:4px;' : '';
            
            html += '<div style="margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">' +
                '<div><b>Câu ' + (idx+1) + ':</b> ' + safeHTML(q.noi_dung || q.NoiDung) + '</div>' +
                '<div style="margin-left: 15px; margin-top: 5px;">' +
                    '<div style="' + ansA_style + '">A. ' + safeHTML(q.A || q.DapAnA) + '</div>' +
                    '<div style="' + ansB_style + '">B. ' + safeHTML(q.B || q.DapAnB) + '</div>' +
                    '<div style="' + ansC_style + '">C. ' + safeHTML(q.C || q.DapAnC) + '</div>' +
                    '<div style="' + ansD_style + '">D. ' + safeHTML(q.D || q.DapAnD) + '</div>' +
                '</div>' +
            '</div>';
        });
    }

    if(p2.length > 0) {
        html += '<h3 style="color:#c0392b; border-bottom:1px solid #c0392b; padding-bottom:5px; margin-top:20px;">PHẦN II: Đúng / Sai</h3>';
        p2.forEach((q, idx) => {
            let dArr = String(q.dap_an_dung || q.DapAnDung).split('-');
            html += '<div style="margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">' +
                '<div><b>Câu ' + (idx+1) + ':</b> ' + safeHTML(q.noi_dung || q.NoiDung) + '</div>' +
                '<table style="width:100%; border-collapse:collapse; margin-top:5px; font-size:14px;">' +
                    '<tr>' +
                        '<th style="border:1px solid #ccc; padding:5px; width:40px; background:#f2f2f2;">Ý</th>' +
                        '<th style="border:1px solid #ccc; padding:5px; background:#f2f2f2;">Nội dung phát biểu</th>' +
                        '<th style="border:1px solid #ccc; padding:5px; width:80px; color:#27ae60; background:#f2f2f2;">Đáp án</th>' +
                    '</tr>' +
                    '<tr>' +
                        '<td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold;">a</td>' +
                        '<td style="border:1px solid #ccc; padding:5px;">' + safeHTML(q.A || q.DapAnA) + '</td>' +
                        '<td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold; color:#27ae60;">' + (dArr[0]||'') + '</td>' +
                    '</tr>' +
                    '<tr>' +
                        '<td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold;">b</td>' +
                        '<td style="border:1px solid #ccc; padding:5px;">' + safeHTML(q.B || q.DapAnB) + '</td>' +
                        '<td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold; color:#27ae60;">' + (dArr[1]||'') + '</td>' +
                    '</tr>' +
                    '<tr>' +
                        '<td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold;">c</td>' +
                        '<td style="border:1px solid #ccc; padding:5px;">' + safeHTML(q.C || q.DapAnC) + '</td>' +
                        '<td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold; color:#27ae60;">' + (dArr[2]||'') + '</td>' +
                    '</tr>' +
                    '<tr>' +
                        '<td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold;">d</td>' +
                        '<td style="border:1px solid #ccc; padding:5px;">' + safeHTML(q.D || q.DapAnD) + '</td>' +
                        '<td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold; color:#27ae60;">' + (dArr[3]||'') + '</td>' +
                    '</tr>' +
                '</table>' +
            '</div>';
        });
    }

    if(p3.length > 0) {
        html += '<h3 style="color:#c0392b; border-bottom:1px solid #c0392b; padding-bottom:5px; margin-top:20px;">PHẦN III: Trả lời ngắn</h3>';
        p3.forEach((q, idx) => {
            let ans = String(q.dap_an_dung || q.DapAnDung).replace(new RegExp("'", "g"), '');
            html += '<div style="margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">' +
                '<div><b>Câu ' + (idx+1) + ':</b> ' + safeHTML(q.noi_dung || q.NoiDung) + '</div>' +
                '<div style="margin-top: 5px; color: #27ae60; font-weight: bold;">' +
                    '🎯 Đáp án chuẩn: <span style="background:#e8f5e9; padding:2px 8px; border-radius:4px; border:1px solid #27ae60;">' + safeHTML(ans) + '</span>' +
                '</div>' +
            '</div>';
        });
    }

    document.getElementById('previewContent').innerHTML = html;
}

async function layDeTuIframe(btnElement) {
    if (!checkWorkspaceAction()) return;
    let inputMaPhong = document.getElementById('maPhongLienKet');
    let maPhong = inputMaPhong ? inputMaPhong.value.trim() : prompt("Vui lòng nhập MÃ PHÒNG THI đích đến:");
    if (!maPhong) return alert("⚠️ Cần phải có Mã Phòng Thi để đẩy đề lên mạng!");

    try {
        let iframeEl = document.getElementById('frameV8');
        if (!iframeEl || !iframeEl.contentWindow) throw new Error("Iframe chưa sẵn sàng!");

        let iframeWindow = iframeEl.contentWindow;
        let iframeOrigin = "*";
        try {
            let parsed = new URL(iframeEl.src, window.location.href);
            iframeOrigin = parsed.origin && parsed.origin !== "null" ? parsed.origin : "*";
        } catch (e) {}
        let requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

        let danhSachDeIframe = await new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                window.removeEventListener('message', onMsg);
                reject(new Error("Không nhận được dữ liệu từ tool trộn đề (timeout). Hãy bấm 'Quét & Trộn' trong iframe trước."));
            }, 2500);

            function onMsg(ev) {
                if (ev.source !== iframeWindow) return;
                if (iframeOrigin !== "*" && ev.origin !== iframeOrigin) return;
                let data = ev.data || {};
                if (!data || data.type !== 'DAMSAN_EXAMS' || data.requestId !== requestId) return;
                clearTimeout(timeout);
                window.removeEventListener('message', onMsg);
                resolve(data.payload || new Array());
            }

            window.addEventListener('message', onMsg);
            iframeWindow.postMessage({ type: 'DAMSAN_GET_EXAMS', requestId }, iframeOrigin);
        });
        
        if (!danhSachDeIframe || danhSachDeIframe.length === 0) {
            return alert("⚠️ Iframe trống! Bạn hãy tải file Word, cài đặt thông số và bấm 'Quét & Trộn' trước.");
        }
        
        danhSachDeIframe = JSON.parse(JSON.stringify(danhSachDeIframe));
        danhSachDeIframe.forEach(q => q.MaPhong = maPhong);

        let oldText = btnElement.innerText;
        btnElement.innerText = "⏳ ĐANG HÚT & ĐẨY LÊN...";
        btnElement.disabled = true;

        let result = await luuDeThiLenSupabase(danhSachDeIframe);
        
        btnElement.innerText = oldText;
        btnElement.disabled = false;

        if (result.status === 'success') {
            alert(`🎉 HOÀN TẤT! Đã đẩy thành công ${danhSachDeIframe.length} câu vào phòng [${maPhong}].`);
        } else {
            alert("❌ Lỗi Supabase: " + result.message);
        }
    } catch (e) {
        btnElement.innerText = "🚀 Hút đề & Đẩy";
        btnElement.disabled = false;
        alert("❌ Lỗi Iframe: " + e.message);
    }
}

async function generateFromMatrix() { 
    if(!checkWorkspaceAction()) return;
    let maPhong = document.getElementById("maPhongMatrix").value.trim();
    if(!maPhong) return alert("Vui lòng nhập Mã Phòng Thi ở phía dưới Ma Trận!");
    
    let soLuongDe = parseInt(document.getElementById("soLuongDeMatrix").value) || 4;
    let startCode = parseInt(document.getElementById("startCodeMatrix").value) || 101;
    let stepCode = parseInt(document.getElementById("stepCodeMatrix").value) || 1;
    
    let logEl = document.getElementById("logMatrix");
    let btn = document.getElementById("btnMatrix");
    let oldText = btn.innerText;
    btn.innerText = "⏳ ĐANG XỬ LÝ MA TRẬN..."; btn.disabled = true;
    logEl.innerText = "Đang trích xuất dữ liệu...";
    
    if (fullBankData.length === 0) await fetchFullBank(true);
    
    let selectedQuestions = new Array();
    let rows = document.querySelectorAll("#matrixBody tr");
    
    try {
        for (let i = 0; i < rows.length; i++) {
            let r = rows[i]; let baiHoc = r.querySelector(".mat-baihoc").value;
            if (!baiHoc) continue;
            let reqs = new Array();
            reqs.push({ phan: "1", mucDo: "NB", count: parseInt(r.querySelector(".mat-p1-nb").value)||0 });
            reqs.push({ phan: "1", mucDo: "TH", count: parseInt(r.querySelector(".mat-p1-th").value)||0 });
            reqs.push({ phan: "1", mucDo: "VD", count: parseInt(r.querySelector(".mat-p1-vd").value)||0 });
            reqs.push({ phan: "2", mucDo: "NB", count: parseInt(r.querySelector(".mat-p2-nb").value)||0 });
            reqs.push({ phan: "2", mucDo: "TH", count: parseInt(r.querySelector(".mat-p2-th").value)||0 });
            reqs.push({ phan: "2", mucDo: "VD", count: parseInt(r.querySelector(".mat-p2-vd").value)||0 });
            reqs.push({ phan: "3", mucDo: "NB", count: parseInt(r.querySelector(".mat-p3-nb").value)||0 });
            reqs.push({ phan: "3", mucDo: "TH", count: parseInt(r.querySelector(".mat-p3-th").value)||0 });
            reqs.push({ phan: "3", mucDo: "VD", count: parseInt(r.querySelector(".mat-p3-vd").value)||0 });
            
            for (let req of reqs) {
                if (req.count > 0) {
                    let pool = fullBankData.filter(q => q.baiHoc === baiHoc && String(q.phan) === req.phan && q.mucDo === req.mucDo);
                    if (pool.length < req.count) throw new Error(`Kho không đủ câu hỏi! Tại bài "${baiHoc}", Phần ${req.phan}, Mức ${req.mucDo} đang cần: ${req.count} câu, nhưng kho chỉ có: ${pool.length} câu.`);
                    shuffleArray(pool);
                    let chosen = pool.slice(0, req.count).map(q => ({
                        Phan: String(q.phan), MucDo: q.mucDo, NoiDung: q.noiDung,
                        DapAnA: q.A, DapAnB: q.B, DapAnC: q.C, DapAnD: q.D, DapAnDung: q.dapAnDung
                    }));
                    selectedQuestions = selectedQuestions.concat(chosen);
                }
            }
        }
        
        if (selectedQuestions.length === 0) throw new Error("Bảng Ma trận đang trống hoặc tổng số câu hỏi yêu cầu bằng 0!");
        
        logEl.innerText = "Đang bắt đầu trộn đề...";
        generateExams(selectedQuestions, soLuongDe, maPhong, startCode, stepCode);
        
        logEl.innerText = "Đang đồng bộ dữ liệu với máy chủ...";
        let pushRes = await luuDeThiLenSupabase(danhSachDeThi);
        if (pushRes.status === 'success') {
            logEl.innerText = `✅ HOÀN TẤT! Hệ thống đã bốc ngẫu nhiên ${selectedQuestions.length} câu, trộn thành ${soLuongDe} mã đề và đẩy an toàn vào phòng [${maPhong}].`;
        } else {
            throw new Error(pushRes.message);
        }
        
    } catch (err) {
        logEl.innerText = "❌ Lỗi: " + err.message; alert("Lỗi: " + err.message);
    } finally {
        btn.innerText = oldText; btn.disabled = false;
    }
}

async function loadBankMeta() { 
    let query = sb.from('ngan_hang').select('bai_hoc').eq('truong_id', gvData.truong_id);
    if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
    let {data} = await query;
    if(data) {
        let uniqueBaiHoc = Array.from(new Set(data.map(d=>d.bai_hoc)));
        processBankMeta({baiHocs: uniqueBaiHoc});
    }
}
function processBankMeta(data) {
    availableBaiHocs = data.baiHocs || new Array(); 
    if(document.getElementById("matrixBody") && document.getElementById("matrixBody").children.length === 0) addMatrixRow(); 
    let opts = '<option value="">Tất cả</option>'; 
    availableBaiHocs.forEach(b => opts += `<option value="${b}">${b}</option>`); 
    if(document.getElementById("filterBaiHoc")) document.getElementById("filterBaiHoc").innerHTML = opts;
}

function addMatrixRow() { 
    const tbody = document.getElementById("matrixBody"); if(!tbody) return;
    const tr = document.createElement("tr"); 
    let optionsHtml = '<option value="">-- Chọn bài --</option>'; availableBaiHocs.forEach(b => optionsHtml += `<option value="${b}">${b}</option>`); 
    tr.innerHTML = `<td><select class="mat-baihoc" style="width:100%; padding:5px;">${optionsHtml}</select></td><td style="background:#e8f5e9;"><input type="number" class="mat-p1-nb" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e8f5e9;"><input type="number" class="mat-p1-th" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e8f5e9;"><input type="number" class="mat-p1-vd" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e2eef9;"><input type="number" class="mat-p2-nb" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e2eef9;"><input type="number" class="mat-p2-th" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e2eef9;"><input type="number" class="mat-p2-vd" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#fbe6e8;"><input type="number" class="mat-p3-nb" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#fbe6e8;"><input type="number" class="mat-p3-th" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#fbe6e8;"><input type="number" class="mat-p3-vd" min="0" value="0" style="width:35px; padding:5px;"></td><td><button style="background:#e74c3c; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;" onclick="this.parentElement.parentElement.remove()">Xóa</button></td>`; 
    tbody.appendChild(tr); 
}

async function fetchFullBank(forceReload = false) { 
    if(!document.getElementById("bankTableBody")) return;
    document.getElementById("bankTableBody").innerHTML = '<tr><td colspan="7">⏳ Đang tải kho dữ liệu...</td></tr>'; 
    let query = sb.from('ngan_hang').select('*').eq('truong_id', gvData.truong_id);
    if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
    let {data} = await query;
    if(data) {
        fullBankData = data.map(q => ({ id: q.id, baiHoc: q.bai_hoc, phan: q.phan, mucDo: q.muc_do, noiDung: q.noi_dung, A: q.a, B: q.b, C: q.c, D: q.d, dapAnDung: q.dap_an_dung, LoiGiai: q.loi_giai }));
        renderBankTable(); 
    }
}

function renderBankTable() { 
    if(!document.getElementById("bankTableBody")) return;
    const fBaiHoc = document.getElementById("filterBaiHoc").value; const fPhan = document.getElementById("filterPhan").value; const fMucDo = document.getElementById("filterMucDo").value; 
    let filtered = fullBankData.filter(q => { if(fBaiHoc && q.baiHoc !== fBaiHoc) return false; if(fPhan && String(q.phan) !== fPhan) return false; if(fMucDo && q.mucDo !== fMucDo) return false; return true; }); 
    let html = ""; if(filtered.length === 0) html = '<tr><td colspan="7">Trống.</td></tr>'; else { filtered.forEach(q => { let snippet = q.noiDung.replace(new RegExp("<[^>]+>", "g"), ' ').substring(0, 80) + "..."; html += `<tr><td><input type="checkbox" class="chk-Bank" value="${q.id}"></td><td style="font-size:11px; color:#7f8c8d;">${String(q.id).split('-')[0]}</td><td><b>${q.baiHoc}</b></td><td>P.${q.phan}</td><td><b>${q.mucDo}</b></td><td style="text-align:left;">${snippet}</td><td><button style="background:#f39c12; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-bottom:5px; width:100%;" onclick="editBankQuestion('${q.id}')">Sửa</button><br><button style="background:#c0392b; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; width:100%;" onclick="deleteBankQuestion('${q.id}', this)">Xóa</button></td></tr>`; }); } document.getElementById("bankTableBody").innerHTML = html; 
}

async function deleteBankQuestion(id, btnElement) { 
    if(!confirm("Xóa câu này?")) return; 
    btnElement.innerText = "⏳..."; btnElement.disabled = true;
    let {error} = await sb.from('ngan_hang').delete().eq('id', id);
    if(!error) fetchFullBank(true); else alert("Lỗi Supabase");
}

async function editBankQuestion(id) { 
    let q = fullBankData.find(x => String(x.id).trim() === String(id).trim()); 
    if(!q) return; 
    document.getElementById("editID").value = q.id; document.getElementById("editBaiHoc").value = q.baiHoc; document.getElementById("editPhan").value = String(q.phan); document.getElementById("editMucDo").value = q.mucDo; document.getElementById("editNoiDung").innerHTML = q.noiDung; document.getElementById("editA").value = q.A; document.getElementById("editB").value = q.B; document.getElementById("editC").value = q.C; document.getElementById("editD").value = q.D; 
    let dapAnHienThi = String(q.dapAnDung); if (dapAnHienThi.startsWith("'")) dapAnHienThi = dapAnHienThi.substring(1); 
    document.getElementById("editDapAnDung").value = dapAnHienThi; document.getElementById("editModal").style.display = "flex"; 
}

async function saveEditedQuestion() { 
    let btn = document.querySelector("#editModal button");
    let phan = document.getElementById("editPhan").value; let dapAn = safeHTML(document.getElementById("editDapAnDung").value.trim().toUpperCase()); 
    if (phan === "3" && !dapAn.startsWith("'")) { dapAn = "'" + dapAn; } 
    btn.innerText = "⏳..."; btn.disabled = true;
    
    let updateData = { bai_hoc: safeHTML(document.getElementById("editBaiHoc").value.trim()), phan: phan, muc_do: document.getElementById("editMucDo").value, noi_dung: safeHTML(document.getElementById("editNoiDung").innerHTML), a: safeHTML(document.getElementById("editA").value), b: safeHTML(document.getElementById("editB").value), c: safeHTML(document.getElementById("editC").value), d: safeHTML(document.getElementById("editD").value), dap_an_dung: dapAn };
    let {error} = await sb.from('ngan_hang').update(updateData).eq('id', document.getElementById("editID").value);

    btn.innerText = "💾 Lưu Thay Đổi"; btn.disabled = false;
    if(!error) { document.getElementById("editModal").style.display = "none"; fetchFullBank(true); } else alert("Lỗi");
}

/* ================================================   ĐIỀU HÀNH & QUẢN LÝ PHÒNG THI
======================================================= */
async function loadMetaData() { 
    let {data} = await sb.from('hoc_sinh').select('lop').eq('truong_id', gvData.truong_id);
    let sel = document.getElementById('ctrlDoiTuong'); let html = '<option value="TatCa">🌎 Tất cả (Mặc định)</option>'; 
    if(data) {
        let lops = Array.from(new Set(data.map(d=>d.lop))).filter(Boolean).sort();
        g_danhSachLopCache = lops; 
        lops.forEach(l => { if(l) html += `<option value="${l}">🏷️ Đối tượng: ${l}</option>`; }); 
        if(sel) sel.innerHTML = html;
        if(allRoomsData && allRoomsData.length > 0) fetchRadar(); 
    }
}

async function dieuKhien(trangThai) { 
    try {
        const maPhong = document.getElementById('ctrlMaPhong').value.trim(); 
        if(!maPhong) return alert("Vui lòng nhập mã phòng!"); 
        document.getElementById('ctrlLog').innerText = "⏳ Đang truyền lệnh..."; 
        
        let updateData = { trang_thai: trangThai };
        
        if (trangThai === 'MO_PHONG') {
            const tenDot = document.getElementById('ctrlTenDot').value.trim(); 
            const tg = document.getElementById('ctrlThoiGian').value; 
            const doiTuongSelect = document.getElementById('ctrlDoiTuong').value; 
            
            updateData.thoi_gian_mo = Date.now(); 
            updateData.ten_dot = tenDot;
            updateData.thoi_gian = tg;
            
            let currentRoom = allRoomsData.find(r => String(r.MaPhong).trim() === maPhong);
            if (currentRoom && currentRoom.DoiTuong && currentRoom.DoiTuong.includes(',') && doiTuongSelect === "TatCa") {
                // Bỏ qua update để giữ nguyên danh sách lớp ghép
            } else {
                updateData.doi_tuong = doiTuongSelect;
            }
        }
        
        let phong_id = await getOrCreateRoom(maPhong);
        let {error} = await sb.from('phong_thi').update(updateData).eq('id', phong_id);
        
        if(!error) { 
            document.getElementById('ctrlLog').innerText = `✅ THÀNH CÔNG!`; 
            fetchRadar(); 
        } else {
            console.error("Supabase Error:", error);
            document.getElementById('ctrlLog').innerText = `❌ Lỗi máy chủ: ` + error.message;
        }
    } catch(e) {
        console.error(e);
        document.getElementById('ctrlLog').innerText = `❌ Lỗi: ` + e.message;
    }
}

async function dieuKhienFast(maPhong, trangThai) { 
    try {
        let {data, error: getErr} = await sb.from('phong_thi').select('id').eq('ma_phong', maPhong).eq('truong_id', gvData.truong_id).single();
        if(getErr) throw getErr;

        if(data) { 
            let updateData = {trang_thai: trangThai};
            if(trangThai === 'MO_PHONG') {
                updateData.thoi_gian_mo = Date.now(); 
                let checkbox = document.querySelector(`.chk-Room[value="${data.id}"]`);
                if(checkbox) {
                    let selDoiTuong = checkbox.closest('tr').querySelector('.fast-doituong').value;
                    updateData.doi_tuong = selDoiTuong;
                }
            }
            let {error: upErr} = await sb.from('phong_thi').update(updateData).eq('id', data.id); 
            if(upErr) throw upErr;
            fetchRadar(); 
        }
    } catch(e) {
        console.error("Lỗi điều khiển nhanh:", e);
        alert("Lỗi khi điều khiển phòng! Chi tiết: " + e.message);
    }
}


async function xoaPhongHoanToan(maPhong) { 
    if(!confirm(`XÓA VĨNH VIỄN phòng [${maPhong}]?\nToàn bộ Đề Thi và Điểm Số của phòng này sẽ bị xóa khỏi máy chủ.`)) return; 
    let btn = event.target;
    let oldText = btn.innerText;
    btn.innerText = "⏳..."; btn.disabled = true;

    try {
        let {data: room} = await sb.from('phong_thi').select('id').eq('ma_phong', maPhong).eq('truong_id', gvData.truong_id).single();
        if(room) {
            await sb.from('ket_qua').delete().eq('phong_id', room.id);
            await sb.from('de_thi').delete().eq('phong_id', room.id);
            await sb.from('phong_thi').delete().eq('id', room.id);
        }
        fetchRadar(); 
        alert("Đã xóa sạch dữ liệu phòng thi!");
    } catch(e) {
        alert("Lỗi khi xóa: " + e.message);
        btn.innerText = oldText; btn.disabled = false;
    }
}

async function xoaDeTrongPhong(maPhong) {
    if(!confirm(`XÁC NHẬN: Bạn muốn xóa sạch các bộ Đề Thi đã trộn trong phòng [${maPhong}]?\n(Phòng thi và Điểm số của học sinh vẫn sẽ được giữ lại)`)) return;
    
    let btn = event.target;
    let oldText = (btn && btn.innerText) ? btn.innerText : "Xóa Đề";
    if(btn) { btn.innerText = "⏳..."; btn.disabled = true; }

    try {
        let {data: room} = await sb.from('phong_thi').select('id').eq('ma_phong', maPhong).eq('truong_id', gvData.truong_id).single();
        if(room) {
            let { error } = await sb.from('de_thi').delete().eq('phong_id', room.id);
            if(error) throw error;
            alert(`✅ Đã xóa sạch đề thi trong phòng [${maPhong}] thành công!`);
        } else {
            alert("❌ Không tìm thấy thông tin phòng thi trên máy chủ.");
        }
        fetchRadar();
    } catch(e) {
        alert("❌ Lỗi khi xóa đề: " + e.message);
    } finally {
        if(btn) { btn.innerText = oldText; btn.disabled = false; }
    }
}

async function capNhatNhanhPhong(roomId, field, value) {
    let updateData = {}; Reflect.set(updateData, field, value);
    await sb.from('phong_thi').update(updateData).eq('id', roomId);
}

async function tuDongKhoaPhongKhiHetGio(roomId) {
    try {
        let { error } = await sb.from('phong_thi').update({ trang_thai: 'THU_BAI' }).eq('id', roomId);
        if (error) console.error("Lỗi tự khóa phòng:", error);
        else {
            let r = allRoomsData.find(x => String(x.id) === String(roomId));
            if(r) r.TrangThai = 'THU_BAI';
        }
    } catch (e) {
        console.error("Lỗi tự khóa phòng:", e);
    }
}

function khoiDongDongHoGiaoVien() {
    if (teacherTimerInterval) clearInterval(teacherTimerInterval);

    teacherTimerInterval = setInterval(() => {
        let now = Date.now();
        let timers = document.querySelectorAll('.live-timer');

        timers.forEach(timerEl => {
            if(timerEl.classList.contains('locked')) return;

            let roomId = timerEl.getAttribute('data-room-id');
            let startTimeStr = timerEl.getAttribute('data-start');
            let startTime = parseTimeSafely(startTimeStr);
            let durationMin = parseInt(timerEl.getAttribute('data-duration')) || 45;

            if (startTime === 0) {
                timerEl.innerText = "--:--";
                return;
            }

            let endTime = startTime + (durationMin * 60 * 1000);
            let diff = endTime - now;

            if (isNaN(diff)) {
                timerEl.innerText = "Lỗi";
                return;
            }

            if (diff <= 0) {
                timerEl.classList.add('locked');
                timerEl.innerText = "00:00";
                timerEl.style.color = "#d93025";

                let parentTd = timerEl.parentElement;
                if(parentTd) parentTd.innerHTML = `<span style="color:#d93025; font-weight:bold;">Hết giờ</span><div style="font-size: 11px; color: #7f8c8d;">/${durationMin}p</div>`;

                let sttTd = document.getElementById(`td-stt-${roomId}`);
                if(sttTd) sttTd.innerHTML = "<span style='color:red;font-weight:bold;'>🔴 Đã Khóa</span>";

                let actTd = document.getElementById(`td-act-${roomId}`);
                if(actTd) {
                    let r = allRoomsData.find(x => String(x.id) === String(roomId));
                    let maPhong = r ? r.MaPhong : '';
                    let btnHtml = `<button style="background:#27ae60; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:12px; cursor:pointer;" onclick="dieuKhienFast('${maPhong}', 'MO_PHONG')">Mở lại</button>`;
                    let btnXoaDe = `<button style="background:#f39c12; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:12px; cursor:pointer; margin-left:5px;" onclick="xoaDeTrongPhong('${maPhong}')" title="Chỉ xóa đề thi, giữ lại phòng">Xóa Đề</button>`;
                    let btnXoa = `<button style="background:#7f8c8d; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:12px; cursor:pointer; margin-left:5px;" onclick="xoaPhongHoanToan('${maPhong}')" title="Xóa toàn bộ phòng và dữ liệu">Xóa Sạch</button>`;
                    actTd.innerHTML = `${btnHtml} ${btnXoaDe} ${btnXoa}`;
                }

                tuDongKhoaPhongKhiHetGio(roomId);
            } else {
                let m = Math.floor(diff / 60000);
                let s = Math.floor((diff % 60000) / 1000);
                timerEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                if (diff <= 300000) { 
                    timerEl.style.color = "#d93025";
                }
            }
        });
    }, 1000);
}

async function fetchRadar() { 
    try {
        let query = sb.from('phong_thi').select('*').eq('truong_id', gvData.truong_id).order('created_at', { ascending: true }); 
        if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
        let {data, error} = await query;
        if(error) throw error;
        
        let now = Date.now();
        if (data) {
            for (let r of data) {
                if (r.trang_thai === 'MO_PHONG' && r.thoi_gian_mo) {
                    let duration = r.thoi_gian || 45;
                    let startTime = parseTimeSafely(r.thoi_gian_mo);
                    if (startTime > 0) {
                        let endTime = startTime + (duration * 60 * 1000);
                        if (now >= endTime) {
                            r.trang_thai = 'THU_BAI'; 
                            sb.from('phong_thi').update({ trang_thai: 'THU_BAI' }).eq('id', r.id).then(); 
                        }
                    }
                }
            }
        }

        allRoomsData = (data||[]).map(d => ({ MaPhong: d.ma_phong, TenDotKiemTra: d.ten_dot, DoiTuong: d.doi_tuong, ThoiGian: d.thoi_gian, TrangThai: d.trang_thai, ThoiGianMo: d.thoi_gian_mo, id: d.id }));
        
        let tbody = document.getElementById('radarBody');
        let tableElement = tbody.parentNode;
        let containerElement = tableElement.parentNode;
        
        if(!document.getElementById('radarControlBar')) {
            let ctrlBar = document.createElement('div');
            ctrlBar.id = 'radarControlBar';
            ctrlBar.style.marginBottom = '15px';
            ctrlBar.style.display = 'flex';
            ctrlBar.style.gap = '10px';
            ctrlBar.style.alignItems = 'center';
            ctrlBar.style.background = '#e8f5e9';
            ctrlBar.style.padding = '10px 15px';
            ctrlBar.style.borderRadius = '6px';
            ctrlBar.style.border = '1px solid #c8e6c9';

            ctrlBar.innerHTML = `
                <label style="cursor:pointer; font-weight:bold; display:flex; align-items:center; gap:5px; margin-right:15px; color:#27ae60;">
                    <input type="checkbox" id="chkAllRooms" onchange="toggleAllRooms(this.checked)" style="transform: scale(1.3);"> CHỌN TẤT CẢ
                </label>
                <button onclick="dieuKhienNhomPhong('MO_PHONG')" style="background:#27ae60; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; transition:0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🟢 Mở các phòng đã chọn</button>
                <button onclick="dieuKhienNhomPhong('THU_BAI')" style="background:#c0392b; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; transition:0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🔴 Khóa các phòng đã chọn</button>
                <span id="batchActionLog" style="margin-left: 10px; font-style: italic; color: #d35400; font-weight: bold;"></span>
            `;
            containerElement.insertBefore(ctrlBar, tableElement);
        }

        let chkAll = document.getElementById('chkAllRooms');
        if(chkAll) chkAll.checked = false;

        let html = ''; 
        if(allRoomsData.length === 0) { html = '<tr><td colspan="6" style="text-align:center;">Chưa có phòng nào đang mở trong Không gian làm việc này</td></tr>'; } 
        else { 
            allRoomsData.forEach(r => { 
                let sttHtml = r.TrangThai; 
                if(r.TrangThai === "MO_PHONG") sttHtml = "<span style='color:green;font-weight:bold;'>🟢 Đang Thi</span>"; 
                else if(r.TrangThai === "THU_BAI") sttHtml = "<span style='color:red;font-weight:bold;'>🔴 Đã Khóa</span>"; 
                else if(r.TrangThai === "CONG_BO_DIEM") sttHtml = "<span style='color:#3498db;font-weight:bold;'>📊 Công bế Điểm</span>"; 
                else if(r.TrangThai === "XEM_DAP_AN") sttHtml = "<span style='color:#8e44ad;font-weight:bold;'>👁️ Công bố Đ.Án</span>"; 
                
                let btnHtml = (r.TrangThai === "MO_PHONG") ? `<button style="background:#c0392b; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:12px; cursor:pointer;" onclick="dieuKhienFast('${r.MaPhong}', 'THU_BAI')">Khóa</button>` : `<button style="background:#27ae60; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:12px; cursor:pointer;" onclick="dieuKhienFast('${r.MaPhong}', 'MO_PHONG')">Mở lại</button>`; 
                let btnXoaDe = `<button style="background:#f39c12; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:12px; cursor:pointer; margin-left:5px;" onclick="xoaDeTrongPhong('${r.MaPhong}')" title="Chỉ xóa đề thi, giữ lại phòng">Xóa Đề</button>`;
                let btnXoa = `<button style="background:#7f8c8d; color:white; border:none; padding:5px 8px; border-radius:4px; font-size:12px; cursor:pointer; margin-left:5px;" onclick="xoaPhongHoanToan('${r.MaPhong}')" title="Xóa toàn bộ phòng và dữ liệu">Xóa Sạch</button>`; 
                
                let idCell = `<div style="display:flex; align-items:center; gap:8px;"><input type="checkbox" class="chk-Room" value="${r.id}" style="transform: scale(1.3); cursor:pointer;"> <b>${r.MaPhong}</b></div>`;

                let displayVal = r.DoiTuong === 'TatCa' ? '🌎 Tất cả' : r.DoiTuong;
                let doiTuongCell = `
                    <div style="display:flex; align-items:center; justify-content:center;">
                        <div style="padding:6px 10px; border:1px dashed #1a73e8; border-radius:6px; background:#f8faff; cursor:pointer; font-weight:bold; font-size:13px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#1a73e8; transition: 0.2s;" 
                             onclick="moModalChonLop('${r.id}', '${r.DoiTuong}')" title="${r.DoiTuong} (Bấm để chỉnh sửa)">
                            ${displayVal} ✏️
                        </div>
                        <input type="hidden" class="fast-doituong" value="${r.DoiTuong}">
                    </div>
                `;

                let durationMin = r.ThoiGian || 45;
                let timerHtml = `<b>${durationMin}p</b>`;
                if (r.TrangThai === "MO_PHONG" && r.ThoiGianMo) {
                    timerHtml = `<div class="live-timer" data-room-id="${r.id}" data-start="${r.ThoiGianMo}" data-duration="${durationMin}" style="font-weight:bold; color:#1a73e8; font-variant-numeric: tabular-nums; font-size: 15px;">--:--</div><div style="font-size: 11px; color: #7f8c8d;">/${durationMin}p</div>`;
                }

                html += `<tr><td>${idCell}</td><td style="color:#1a73e8;font-weight:bold;">${r.TenDotKiemTra||"-"}</td><td>${doiTuongCell}</td><td>${timerHtml}</td><td id="td-stt-${r.id}">${sttHtml}</td><td id="td-act-${r.id}">${btnHtml} ${btnXoaDe} ${btnXoa}</td></tr>`; 
            }); 
        } 
        document.getElementById('radarBody').innerHTML = html; 

        document.querySelectorAll('.chk-Room').forEach(cb => {
            cb.addEventListener('change', function() {
                let total = document.querySelectorAll('.chk-Room').length;
                let checked = document.querySelectorAll('.chk-Room:checked').length;
                document.getElementById('chkAllRooms').checked = (total > 0 && total === checked);
            });
        });

        khoiDongDongHoGiaoVien();
    } catch (err) {
        console.error("Lỗi tải Radar:", err);
        document.getElementById('radarBody').innerHTML = '<tr><td colspan="6" style="text-align:center; color:red; font-weight:bold;">❌ Lỗi tải dữ liệu phòng thi</td></tr>';
    }
}

function toggleAllRooms(isChecked) {
    let checkboxes = document.querySelectorAll('.chk-Room');
    checkboxes.forEach(cb => cb.checked = isChecked);
}

async function dieuKhienNhomPhong(trangThai) {
    let checkedBoxes = document.querySelectorAll('.chk-Room:checked');
    if(checkedBoxes.length === 0) return alert("⚠️ Vui lòng tick chọn ít nhất 1 phòng thi ở bảng bên dưới để thao tác!");

    let actName = trangThai === 'MO_PHONG' ? 'MỞ CỬA' : 'KHÓA / THU BÀI';
    if(!confirm(`Xác nhận thực hiện lệnh [ ${actName} ] đồng loạt cho ${checkedBoxes.length} phòng thi đã chọn?`)) return;

    let logSpan = document.getElementById('batchActionLog');
    logSpan.innerText = "⏳ Máy chủ đang xử lý hàng loạt...";

    try {
        let promises = new Array();
        let now = Date.now();

        checkedBoxes.forEach(cb => {
            let roomId = cb.value;
            let tr = cb.closest('tr');
            let selDoiTuong = tr.querySelector('.fast-doituong').value;

            let updateData = { trang_thai: trangThai };
            if(trangThai === 'MO_PHONG') {
                updateData.thoi_gian_mo = now; 
                updateData.doi_tuong = selDoiTuong; 
            }

            promises.push(sb.from('phong_thi').update(updateData).eq('id', roomId));
        });

        let results = await Promise.all(promises);
        let errors = results.filter(r => r.error);
        if (errors.length > 0) throw errors[0].error;

        logSpan.innerText = "✅ Cập nhật thành công toàn bộ!";
        setTimeout(() => logSpan.innerText = "", 3000);
        
        fetchRadar(); 

    } catch(e) {
        logSpan.innerText = "❌ Lỗi thực thi!";
        console.error(e);
        alert("Lỗi kết nối khi cập nhật đồng loạt: " + e.message);
    }
}

async function taiDanhSachPhong() {
    let selectBoxTab2 = document.getElementById("ctrlMaPhong"); let selectBoxTab3 = document.getElementById("dashMaPhong");
    if(selectBoxTab2) selectBoxTab2.innerHTML = '<option value="">⏳ Đang tải danh sách phòng...</option>';
    if(selectBoxTab3) selectBoxTab3.innerHTML = '<option value="">⏳ Đang tải danh sách phòng...</option>';

    try {
        let query = sb.from('phong_thi').select('ma_phong').eq('truong_id', gvData.truong_id).order('created_at', { ascending: true }); 
        if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
        let {data, error} = await query;
        if(error) throw error;
        
        let defaultOpt = '<option value="">-- Chọn Mã Phòng Thi --</option>';
        if(selectBoxTab2) selectBoxTab2.innerHTML = defaultOpt; if(selectBoxTab3) selectBoxTab3.innerHTML = defaultOpt;
        
        if(data && data.length > 0) {
            let uniqueRooms = Array.from(new Set(data.map(d=>d.ma_phong)));
            uniqueRooms.forEach(phong => {
                let optHtml = `<option value="${phong}">${phong}</option>`;
                if(selectBoxTab2) selectBoxTab2.innerHTML += optHtml; if(selectBoxTab3) selectBoxTab3.innerHTML += optHtml;
            });
            let phongDaLuu = localStorage.getItem('phongDangXem');
            if (phongDaLuu && uniqueRooms.includes(phongDaLuu)) { if(selectBoxTab3) { selectBoxTab3.value = phongDaLuu; fetchDashboard(); } }
        } else {
            let emptyOpt = '<option value="">⚠️ Chưa có phòng thi nào</option>';
            if(selectBoxTab2) selectBoxTab2.innerHTML = emptyOpt; if(selectBoxTab3) selectBoxTab3.innerHTML = emptyOpt;
        }

        if(selectBoxTab2) {
            selectBoxTab2.onchange = function() {
                let r = allRoomsData.find(x => x.MaPhong === this.value);
                if(r) {
                    document.getElementById('ctrlTenDot').value = r.TenDotKiemTra || "";
                    document.getElementById('ctrlThoiGian').value = r.ThoiGian || 45;
                    setTimeout(() => {
                        let sel = document.getElementById('ctrlDoiTuong');
                        if(sel) sel.value = r.DoiTuong || "TatCa";
                    }, 150);
                }
            };
        }
    } catch(e) {
        console.error("Lỗi tải DS phòng:", e);
        let errOpt = '<option value="">❌ Lỗi tải DS phòng</option>';
        if(selectBoxTab2) selectBoxTab2.innerHTML = errOpt;
        if(selectBoxTab3) selectBoxTab3.innerHTML = errOpt;
    }
}

// BỘ TẢI ĐIỂM CỰC MẠNH (HỖ TRỢ ĐỌC DỮ LIỆU TỪ 2 LUỒNG: REALTIME & AUTO REFRESH 5S)
async function fetchDashboard(isAuto = false) { 
    try {
        const sInput = document.getElementById('liveSearchInput');
        if (sInput && !isAuto) sInput.value = ''; 

        const maPhong = document.getElementById('dashMaPhong').value;
        if(!maPhong) return;
        if(!isAuto) document.getElementById('dashBody').innerHTML = '<tr><td colspan="10">⏳ Đang tải dữ liệu...</td></tr>';
        
        let currentRoom = allRoomsData.find(r => String(r.MaPhong).trim() === String(maPhong).trim());
        if(!currentRoom) return;

        let pArr = new Array();
        
        let dummyCacheBuster = new Date().getTime().toString();
        pArr.push(sb.from('ket_qua').select('*, hoc_sinh(ma_hs, ho_ten, lop)').eq('phong_id', currentRoom.id).neq('chi_tiet', dummyCacheBuster));
        
        if(allStudents.length === 0 || !isAuto) {
             pArr.push(sb.from('hoc_sinh').select('*').eq('truong_id', gvData.truong_id));
        }
        
        let myFetchId = ++globalFetchDashId;
        let results = await Promise.all(pArr);
        if (myFetchId !== globalFetchDashId) return; 

        let resKQ = results[0];
        if (resKQ.error) throw resKQ.error;
        
        if (results.length > 1) {
            let resHS = results[1];
            if (resHS.error) throw resHS.error;
            allStudents = (resHS.data || new Array()).map(d => ({ MaHS: d.ma_hs, HoTen: d.ho_ten, Lop: d.lop, TrangThai: d.mat_khau==='123456'||d.mat_khau===DEFAULT_PASS_HASH?'MacDinh':'DaDoi', Quyen: d.quyen, id: d.id }));
        }

        duLieuBangDiem = (resKQ.data || new Array()).map(r => ({ 
            MaHS: r.hoc_sinh ? r.hoc_sinh.ma_hs : 'Lỗi/Xóa', 
            HoTen: r.hoc_sinh ? r.hoc_sinh.ho_ten : 'Không rõ', 
            Lop: r.hoc_sinh ? r.hoc_sinh.lop : '', 
            MaDe: r.ma_de, 
            Diem: r.diem, 
            ChiTiet: typeof r.chi_tiet === 'string' ? r.chi_tiet : JSON.stringify(r.chi_tiet), 
            ThoiGian: r.created_at,
            ViPham: r.so_lan_vi_pham || 0  // ĐÃ BỔ SUNG NHẬN DỮ LIỆU VI PHẠM
        }));

        renderDashboardSubTabs(); 
        renderDashboardTable(); 
    } catch(e) {
        console.error("Lỗi fetchDashboard:", e);
        if (!isAuto) document.getElementById('dashBody').innerHTML = `<tr><td colspan="10" style="color:red; font-weight:bold;">❌ Lỗi kết nối tải bảng điểm: ${e.message}</td></tr>`;
    }
}

function renderDashboardSubTabs() { let groups = new Set(); duLieuBangDiem.forEach(hs => { if(hs.Lop) groups.add(hs.Lop); }); let html = `<button class="${currentDashFilter==='TatCa'?'active':''}" onclick="filterDashboard('TatCa')">Tất cả</button>`; groups.forEach(g => { html += `<button class="${currentDashFilter===g?'active':''}" onclick="filterDashboard('${g}')">${g}</button>`; }); document.getElementById('subTabsDashboard').innerHTML = html; }
function filterDashboard(filter) { currentDashFilter = filter; renderDashboardSubTabs(); renderDashboardTable(); }



async function xoaDiemPhong() { 
    const maPhong = document.getElementById('dashMaPhong').value.trim(); 
    if(!maPhong) return alert("⚠️ Vui lòng chọn Mã Phòng Thi ở ô phía trên trước!"); 
    if(duLieuBangDiem.length === 0) return alert("ℹ️ Phòng thi này hiện tại chưa có dữ liệu điểm nào để xóa!"); 
    if(!confirm(`🚨 BẠN CÓ CHẮC CHẮN XÓA TOÀN BỘ điểm bài làm của phòng [${maPhong}]?\nHành động này không thể hoàn tác!`)) return; 
    
    let btn = event.target;
    let oldText = btn.innerText;
    btn.innerText = "⏳ Đang xóa sạch..."; btn.disabled = true;

    let currentRoom = allRoomsData.find(r => String(r.MaPhong).trim() === maPhong);
    
    if(currentRoom) {
        let {error} = await sb.from('ket_qua').delete().eq('phong_id', currentRoom.id);
        if(error) {
            alert("❌ Lỗi máy chủ Supabase khi xóa: " + error.message);
        } else {
            alert("✅ Đã xóa sạch toàn bộ điểm của phòng thi này!");
        }
    } else {
        alert("❌ Lỗi hệ thống: Không xác định được ID của phòng thi này.");
    }
    
    btn.innerText = oldText; btn.disabled = false;
    fetchDashboard(); 
}

async function xuatExcel() { 
    if(duLieuBangDiem.length === 0) return alert("Chưa có dữ liệu để tải."); 
    
    let exportData = new Array(); let maPhong = document.getElementById('dashMaPhong').value.trim(); 
    let currentRoom = allRoomsData.find(r => String(r.MaPhong).trim() === maPhong); 
    let defaultLop = currentRoom && currentRoom.DoiTuong !== "TatCa" ? currentRoom.DoiTuong : null; 
    let targetLop = currentDashFilter !== 'TatCa' ? currentDashFilter : defaultLop; 

    if (targetLop && targetLop !== "TatCa") { 
        let allowedClasses = targetLop.split(',').map(s => s.trim());
        let classStudents = allStudents.filter(s => allowedClasses.includes(String(s.Lop).trim())); 
        classStudents.forEach(stu => { 
            let result = duLieuBangDiem.find(r => String(r.MaHS).trim() === String(stu.MaHS).trim()); 
            if (result) exportData.push({...result, MaHS: stu.MaHS}); 
            else exportData.push({ MaHS: stu.MaHS, HoTen: stu.HoTen, Lop: stu.Lop, TrangThai: "Chưa vào", MaDe: "-", Diem: "-", ThoiGian: null, ChiTiet: null, ViPham: 0 }); 
        }); 
        duLieuBangDiem.forEach(r => { if(!exportData.find(d => String(d.MaHS).trim() === String(r.MaHS).trim())) { let stu = allStudents.find(s => String(s.MaHS).trim() === String(r.MaHS).trim()); exportData.push({...r, MaHS: stu ? stu.MaHS : r.MaHS}); } }); 
    } else { 
        duLieuBangDiem.forEach(r => { let stu = allStudents.find(s => String(s.MaHS).trim() === String(r.MaHS).trim()); exportData.push({...r, MaHS: stu ? stu.MaHS : r.MaHS}); }); 
    } 
    if(currentDashFilter !== 'TatCa') { 
        let allowedClasses = currentDashFilter.split(',').map(s => s.trim());
        exportData = exportData.filter(d => allowedClasses.includes(String(d.Lop).trim())); 
    } 
    if(exportData.length === 0) return alert("Không có dữ liệu cho lớp này.");

    const workbook = new ExcelJS.Workbook(); const worksheet = workbook.addWorksheet('BangDiem'); 
    // ĐÃ BỔ SUNG CỘT VI PHẠM VÀO EXCEL
    worksheet.columns = [ { header: 'STT', key: 'stt', width: 6 }, { header: 'SBD', key: 'sbd', width: 12 }, { header: 'Họ và Tên', key: 'name', width: 30 }, { header: 'Lớp', key: 'lop', width: 10 }, { header: 'Mã Đề', key: 'made', width: 10 }, { header: 'Tổng Điểm', key: 'total', width: 12 }, { header: 'Điểm P. I', key: 'p1', width: 12 }, { header: 'Điểm P. II', key: 'p2', width: 12 }, { header: 'Điểm P. III', key: 'p3', width: 12 }, { header: 'Vi Phạm', key: 'vipham', width: 10 }, { header: 'Thời gian nộp', key: 'time', width: 22 } ]; 
    
    let belowAvg = 0; let maxScore = -1; let minScore = 11; 
    exportData.sort((a,b) => (String(a.MaHS)||'').localeCompare(String(b.MaHS)||'')); 
    
    exportData.forEach((hs, idx) => { 
        let p1 = 0, p2 = 0, p3 = 0; 
        if(hs.ChiTiet && hs.Diem !== "-") { 
            try { 
                let ct = JSON.parse(hs.ChiTiet); 
                Object.keys(ct).forEach(k => { 
                    let item = Reflect.get(ct, k); 
                    if(item.phan === "1" && String(item.chon||"").toUpperCase().trim() === String(item.dung||"").toUpperCase().trim()) p1 += 0.25; 
                    if(item.phan === "2") { 
                        let cArr = String(item.chon||"").split('-'); 
                        let dStr = String(item.dung||"").toUpperCase().replace(new RegExp("Ð|D", "g"), 'Đ');
                        let dArr = dStr.match(new RegExp("Đ|S", "g"));
                        if (!dArr) dArr = new Array();
                        let match = 0; 
                        for(let i=0; i<4; i++) { 
                            let cValRaw = cArr[i] || "";
                            let cVal = String(cValRaw).toUpperCase().replace(new RegExp("Ð|D", "g"), 'Đ');
                            let cleanCVal = "";
                            if (cVal.includes("Đ")) cleanCVal = "Đ";
                            if (cVal.includes("S")) cleanCVal = "S";
                            let dVal = dArr[i] || "";
                            if(cleanCVal !== "" && cleanCVal === dVal) match++; 
                        } 
                        if(match===1) p2+=0.1; else if(match===2) p2+=0.25; else if(match===3) p2+=0.5; else if(match===4) p2+=1.0; 
                    } 
                    if(item.phan === "3") {
                        let aClean = String(item.chon).replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
                        let dClean = String(item.dung).replace(/'/g, '').replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
                        if(aClean !== "" && aClean === dClean) p3 += 0.25;
                    }
                }); 
            } catch(e){} 
        } 
        let total = hs.Diem !== "-" ? (parseFloat(hs.Diem) || 0) : "-"; 
        if(total !== "-") {
            if(total < 5.0) belowAvg++; if(total > maxScore) maxScore = total; if(total < minScore) minScore = total; 
        }
        worksheet.addRow({ stt: idx + 1, sbd: hs.MaHS, name: hs.HoTen, lop: hs.Lop, made: hs.MaDe || "-", total: total, p1: hs.Diem!=="-" ? parseFloat(p1.toFixed(2)) : "-", p2: hs.Diem!=="-" ? parseFloat(p2.toFixed(2)) : "-", p3: hs.Diem!=="-" ? parseFloat(p3.toFixed(2)) : "-", vipham: hs.ViPham > 0 ? hs.ViPham : "", time: hs.ThoiGian ? new Date(hs.ThoiGian).toLocaleString('vi-VN') : "-" }); 
    }); 
    
    worksheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2980B9'} }; cell.alignment = { vertical: 'middle', horizontal: 'center' }; cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; }); 
    worksheet.eachRow((row, rowNumber) => { 
        if(rowNumber > 1) { 
            row.eachCell((cell, colNumber) => { 
                cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; 
                if(colNumber !== 3) cell.alignment = { vertical: 'middle', horizontal: 'center' }; 
            }); 
            let totalCell = row.getCell(6); 
            if(totalCell.value !== null && totalCell.value !== "-" && totalCell.value < 5.0) { 
                row.eachCell(cell => { 
                    cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFFADBD8'} }; 
                    cell.font = { color: { argb: 'FFC0392B' } }; 
                }); 
            } 
        } 
    }); 
    
    let rowCount = exportData.filter(d => d.Diem !== "-").length; worksheet.addRow(new Array()); 
    let stRow1 = worksheet.addRow(['', '', 'THỐNG KÊ NHANH (Số HS đã nộp):']); stRow1.font = {bold: true}; 
    worksheet.addRow(['', '', 'Tổng số bài thi:', rowCount]); worksheet.addRow(['', '', 'Số bài dưới 5.0:', belowAvg]); worksheet.addRow(['', '', 'Điểm cao nhất:', maxScore === -1 ? 0 : maxScore]); worksheet.addRow(['', '', 'Điểm thấp nhất:', minScore === 11 ? 0 : minScore]); 
    
    worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
            let currentFont = cell.font || {};
            let inDam = currentFont.bold;
            if (colNumber === 6 && rowNumber > 1) inDam = true;
            cell.font = Object.assign({}, currentFont, { name: 'Times New Roman', size: 12, bold: inDam });
        });
    });

    // --- BẮT ĐẦU ĐOẠN ĐƯỢC CẬP NHẬT TÊN FILE ---
    let tenMonStr = "Tổng Hợp"; 
    if (activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") {
        let matchedMon = g_sysMonList.find(m => String(m.id) === String(activeWorkspaceMonId));
        if (matchedMon) {
            tenMonStr = matchedMon.ten_mon;
        } else {
            // Dự phòng trường hợp Admin lấy từ thẻ select hoặc GV lấy từ text hiển thị
            let sel = document.getElementById('workspaceSelector');
            if (sel) {
                tenMonStr = sel.options[sel.selectedIndex].text.replace('📚 Môn: ', '').trim();
            } else {
                let monSpan = document.querySelector('#workspaceContainer span:last-child');
                if (monSpan) tenMonStr = monSpan.innerText.trim();
            }
        }
    }

    let tenLopStr = currentDashFilter === "TatCa" ? "Tất cả các lớp" : currentDashFilter;
    // Format theo đúng chuẩn: Bảng điểm [Tên môn]_[Mã phòng]_[Tên lớp]
    let tenFile = `Bảng điểm ${tenMonStr}_${maPhong}_${tenLopStr}.xlsx`;
    // --- KẾT THÚC ĐOẠN CẬP NHẬT ---
    const buffer = await workbook.xlsx.writeBuffer(); 
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); 
    const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = tenFile; a.click(); window.URL.revokeObjectURL(url); 
}

// ===================================================// TÍNH NĂNG IMPORT EXCEL
// ===================================================
async function taiFileMau(loai) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Mau_Nhap_Lieu');
    
    if (loai === 'HS') {
        worksheet.columns = [
            { header: 'STT', key: 'stt', width: 8 },
            { header: 'Mã HS', key: 'ma_hs', width: 15 },
            { header: 'Họ và Tên', key: 'ho_ten', width: 30 },
            { header: 'Lớp', key: 'lop', width: 15 }
        ];
        worksheet.addRow({ stt: 1, ma_hs: 'HS001', ho_ten: 'Nguyễn Văn A', lop: '10A1' });
    } else {
        worksheet.columns = [
            { header: 'STT', key: 'stt', width: 8 },
            { header: 'Mã GV', key: 'ma_gv', width: 15 },
            { header: 'Họ và Tên', key: 'ho_ten', width: 30 },
            { header: 'Quyền (Admin/GV)', key: 'quyen', width: 20 }
        ];
        worksheet.addRow({ stt: 1, ma_gv: 'GV001', ho_ten: 'Phạm Văn C', quyen: 'Admin' });
    }
    
    worksheet.getRow(1).eachCell((cell) => { 
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; 
        cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF1A73E8'} }; 
        cell.alignment = { vertical: 'middle', horizontal: 'center' }; 
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Mau_Nhap_${loai}.xlsx`; a.click();
    window.URL.revokeObjectURL(url);
}

async function docFileExcelVaNap(loai) {
    let fileInput = document.getElementById(`fileExcel${loai}`);
    if(!fileInput.files || fileInput.files.length === 0) return alert("Vui lòng chọn file Excel!");
    let btn = document.getElementById(`btnNap${loai}`);
    let oldText = btn.innerText; btn.innerText = "⏳ Đang đọc và nạp..."; btn.disabled = true;
    
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileInput.files[0]);
        const worksheet = workbook.worksheets[0];
        let rowsToInsert = new Array();
        let defaultPass = await hashPassword('123456');

        // Biến theo dõi Số thứ tự lớn nhất trong danh sách
        let maxStt = 0; 

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) { // Bỏ qua dòng tiêu đề
                
                // Đọc cột 1 để lấy STT
                let sttRaw = row.getCell(1).value;
                let stt = sttRaw ? parseInt(sttRaw.toString().trim()) : 0;
                if (!isNaN(stt) && stt > maxStt) {
                    maxStt = stt;
                }

                if (loai === 'HS') {
                    // Lấy dữ liệu các cột còn lại
                    let ma_hs = row.getCell(2).value ? row.getCell(2).value.toString().trim() : '';
                    let ho_ten = row.getCell(3).value ? row.getCell(3).value.toString().trim() : '';
                    let lop = row.getCell(4).value ? row.getCell(4).value.toString().trim() : '';
                    
                    if (ma_hs && ho_ten) {
                        rowsToInsert.push({ ma_hs: ma_hs, ho_ten: ho_ten, lop: lop, mat_khau: defaultPass, truong_id: gvData.truong_id });
                    }
                } else {
                    let ma_gv = row.getCell(2).value ? row.getCell(2).value.toString().trim() : '';
                    let ho_ten = row.getCell(3).value ? row.getCell(3).value.toString().trim() : '';
                    let quyen = row.getCell(4).value ? row.getCell(4).value.toString().trim() : 'GV';
                    
                    if (ma_gv && ho_ten) {
                        rowsToInsert.push({ ma_gv: ma_gv, ho_ten: ho_ten, quyen: quyen, mat_khau: defaultPass, truong_id: gvData.truong_id });
                    }
                }
            }
        });

        if (rowsToInsert.length === 0) throw new Error("Không tìm thấy dữ liệu hợp lệ!");

        let tableName = loai === 'HS' ? 'hoc_sinh' : 'giao_vien';
        // Nâng cấp: Dùng upsert thay cho insert để ghi đè nếu trùng mã
let conflictCols = loai === 'HS' ? 'truong_id, ma_hs' : 'truong_id, ma_gv';
let { error } = await sb.from(tableName).upsert(rowsToInsert, { onConflict: conflictCols });
        if (error) throw error;

        // Báo cáo đối chiếu số lượng quét được với số STT trong danh sách
        alert(`✅ Nạp thành công: ${rowsToInsert.length} tài khoản.\n📊 Kiểm tra chéo: Số thứ tự (STT) lớn nhất ghi nhận trong file Excel là ${maxStt}.`);
        
        if (loai === 'HS') fetchStudents(true); else fetchTeachers(true);
        fileInput.value = ""; 
    } catch(e) {
        alert("❌ Lỗi: " + e.message);
    } finally {
        btn.innerText = oldText; btn.disabled = false;
    }
}

// ===================================================// QUẢN LÝ TÀI KHOẢN GIÁO VIÊN VÀ HỌC SINH
// ===================================================
async function fetchStudents(forceReload = false) { 
    document.getElementById('hsBody').innerHTML = '<tr><td colspan="6">⏳ Đang tải...</td></tr>'; 
    let cached = sessionStorage.getItem('cache_students');
    if (!forceReload && cached) {
        allStudents = JSON.parse(cached); renderSubTabsHS(); renderStudentTable(); 
        if(document.getElementById('tab3') && document.getElementById('tab3').classList.contains('active')) fetchDashboard(); return;
    }
    let {data} = await sb.from('hoc_sinh').select('*').eq('truong_id', gvData.truong_id).order('ma_hs', { ascending: true });
    if(data) {
        allStudents = data.map(d => ({ MaHS: d.ma_hs, HoTen: d.ho_ten, Lop: d.lop, TrangThai: d.mat_khau==='123456'||d.mat_khau===DEFAULT_PASS_HASH?'MacDinh':'DaDoi', Quyen: d.quyen, id: d.id }));
        sessionStorage.setItem('cache_students', JSON.stringify(allStudents));
        renderSubTabsHS(); renderStudentTable(); 
        if(document.getElementById('tab3') && document.getElementById('tab3').classList.contains('active')) fetchDashboard(); 
    }
}

function renderSubTabsHS() { let groups = new Set(); allStudents.forEach(s => { if(s.Lop) groups.add(s.Lop); }); let html = `<button class="${currentStudentFilter==='TatCa'?'active':''}" onclick="filterStudents('TatCa')">Tất cả</button>`; groups.forEach(g => { html += `<button class="${currentStudentFilter===g?'active':''}" onclick="filterStudents('${g}')">${g}</button>`; }); document.getElementById('subTabsHS').innerHTML = html; }
function filterStudents(filter) { currentStudentFilter = filter; renderSubTabsHS(); renderStudentTable(); }

function renderStudentTable() { 
    let filtered = [...allStudents]; 
    // Sắp xếp cứng theo MaHS (hỗ trợ sắp xếp số tự nhiên HS1, HS2... HS10)
    filtered.sort((a, b) => (a.MaHS || "").localeCompare((b.MaHS || ""), undefined, {numeric: true, sensitivity: 'base'}));

    if(currentStudentFilter !== 'TatCa') { 
        filtered = filtered.filter(s => s.Lop === currentStudentFilter); 
    } 
    let html = ""; 
    if(filtered.length === 0) html = '<tr><td colspan="6">Không có dữ liệu.</td></tr>'; 
    else { 
        filtered.forEach(hs => { 
            let statusHTML = hs.TrangThai === "DaDoi" 
                ? `<span style="background: #e8f5e9; color: #27ae60; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #27ae60; font-size: 12px;">✅ Đã đổi</span>` 
                : `<span style="background: #f1f3f4; color: #5f6368; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #dadce0; font-size: 12px;">Mặc định</span>`; 
            
            html += `<tr><td><input type="checkbox" class="chk-HS" value="${hs.id}"></td><td><b>${hs.MaHS}</b></td><td style="text-align:left;">${hs.HoTen}</td><td>${hs.Lop}</td><td>${statusHTML}</td><td><button style="background:#e74c3c; padding:5px 10px; border:none; border-radius:4px; color:white; cursor:pointer; font-weight:bold;" onclick="resetPass('${hs.MaHS}', '${hs.id}', 'HS')">Khôi phục</button></td></tr>`; 
        }); 
    } 
    document.getElementById('hsBody').innerHTML = html; 
}

async function fetchTeachers(forceReload = false) { 
    document.getElementById('gvBody').innerHTML = '<tr><td colspan="6" style="text-align:center;">⏳ Đang tải dữ liệu...</td></tr>'; 
    
    try {
        let pArr = new Array();
        pArr.push(sb.from('mon_hoc').select('*').order('created_at', {ascending: true}));
        let resMonArr = await Promise.all(pArr);
        g_sysMonList = resMonArr[0].data || new Array();

        let {data, error} = await sb.from('giao_vien').select('*').eq('truong_id', gvData.truong_id).order('ma_gv', {ascending: true});
        
        if (error) throw error;

        if(data) {
            allTeachers = data.map(d => {
                let matchedMon = g_sysMonList.find(m => m.id === d.mon_id);
                return { 
                    MaGV: d.ma_gv, 
                    HoTen: d.ho_ten, 
                    MonId: d.mon_id,
                    TenMon: matchedMon ? matchedMon.ten_mon : 'Chưa phân công',
                    TrangThai: d.mat_khau==='123456'||d.mat_khau===DEFAULT_PASS_HASH?'MacDinh':'DaDoi', 
                    Quyen: d.quyen, 
                    id: d.id 
                };
            });
            renderTeacherTable();
        }
    } catch (err) {
        console.error("Lỗi tải danh sách giáo viên:", err);
        document.getElementById('gvBody').innerHTML = `<tr><td colspan="6" style="text-align:center; color:#c0392b; font-weight:bold;">❌ Lỗi tải dữ liệu: Vui lòng kiểm tra lại kết nối mạng.</td></tr>`;
    }
}

function renderTeacherTable() {
    let thead = document.querySelector('#gvBody').previousElementSibling;
    if(thead && !thead.innerHTML.includes('Môn Phụ Trách')) {
        thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><input type="checkbox" id="chkAllGV" onchange="toggleAll('GV')"></th><th>Mã GV</th><th>Họ và Tên</th><th>Môn Phụ Trách</th><th>Trạng Thái</th><th>Thao Tác</th></tr>`;
    }

    let html = ""; 
    if(allTeachers.length === 0) html = '<tr><td colspan="6" style="text-align:center;">Không có dữ liệu.</td></tr>'; 
    else { 
        // Sắp xếp cứng danh sách giáo viên theo MaGV
        let sortedTeachers = [...allTeachers].sort((a, b) => (a.MaGV || "").localeCompare((b.MaGV || ""), undefined, {numeric: true, sensitivity: 'base'}));
        
        sortedTeachers.forEach(gv => { 
            let statusHTML = gv.TrangThai === "DaDoi" 
                ? `<span style="background: #e8f5e9; color: #27ae60; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #27ae60; font-size: 12px;">✅ Đã đổi</span>` 
                : `<span style="background: #f1f3f4; color: #5f6368; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #dadce0; font-size: 12px;">Mặc định</span>`; 
            
            let selHtml = `<select onchange="capNhatMonGiaoVien('${gv.id}', this.value)" style="padding:6px; border-radius:4px; border:1px solid #ccc; font-weight:bold; color:#1a73e8; cursor:pointer; width:100%; outline:none; background:#f8faff;">`;
            selHtml += `<option value="">-- Chưa phân công --</option>`;
            g_sysMonList.forEach(m => {
                let sel = (gv.MonId === m.id) ? 'selected' : '';
                selHtml += `<option value="${m.id}" ${sel}>${m.ten_mon}</option>`;
            });
            selHtml += `</select>`;

            let chucVuHtml = gv.Quyen === 'Admin' ? `<span style="background:#fadbd8; color:#e74c3c; padding:4px 10px; border-radius:20px; font-weight:bold; font-size:12px; display:inline-block; margin-top:4px;">Admin Toàn quyền</span>` : selHtml;

            html += `<tr>
                <td style="text-align:center;"><input type="checkbox" class="chk-GV" value="${gv.id}" style="transform: scale(1.2);"></td>
                <td><b>${gv.MaGV}</b></td>
                <td>${gv.HoTen}</td>
                <td style="min-width: 150px;">${chucVuHtml}</td>
                <td>${statusHTML}</td>
                <td><button style="background:#e74c3c; padding:5px 10px; border:none; border-radius:4px; color:white; cursor:pointer; font-weight:bold;" onclick="resetPass('${gv.MaGV}', '${gv.id}', 'GV')">Khôi phục MK</button></td>
            </tr>`; 
        }); 
    } 
    document.getElementById('gvBody').innerHTML = html; 
}

async function capNhatMonGiaoVien(gvId, monId) {
    let valToUpdate = monId ? monId : null;
    let {error} = await sb.from('giao_vien').update({mon_id: valToUpdate}).eq('id', gvId);
    
    if(error) {
        alert("❌ Lỗi cập nhật phân công bộ môn trên máy chủ: " + error.message);
        fetchTeachers(); 
    } 
}

function toggleAll(type) {
    let isChecked = document.getElementById('chkAll' + type).checked;
    let checkboxes = document.querySelectorAll('.chk-' + type);
    checkboxes.forEach(cb => cb.checked = isChecked);
}

async function resetSelectedPass(loai) {
    let checkedBoxes = document.querySelectorAll('.chk-' + loai + ':checked');
    if(checkedBoxes.length === 0) return alert("Vui lòng tick chọn ít nhất 1 tài khoản!");
    if(!confirm(`Khôi phục mật khẩu mặc định cho ${checkedBoxes.length} tài khoản đã chọn?`)) return;

    let pass = prompt("Hành động nhạy cảm! Vui lòng nhập mật khẩu Admin của bạn để xác nhận:");
    if(!pass) return;

    let hashedPass = await hashPassword(pass);
    let idsToUpdate = Array.from(checkedBoxes).map(cb => cb.value);
    
    let btn = event.target;
    let oldText = btn.innerText; btn.innerText = "⏳ Đang xử lý..."; btn.disabled = true;

    let {data, error} = await sb.rpc('rpc_admin_reset_pass', {
        p_ma_gv: gvData.ma_gv,
        p_mat_khau: hashedPass,
        p_truong_id: gvData.truong_id,
        p_loai: loai,
        p_ids: idsToUpdate,
        p_default_hash: DEFAULT_PASS_HASH
    });
    
    btn.innerText = oldText; btn.disabled = false;
    
    if(error) return alert("❌ Lỗi máy chủ: " + error.message);
    if(data && data.status === 'error') return alert(data.message);

    alert(`✅ Đã khôi phục mật khẩu thành công!`);
    if(document.getElementById('chkAll' + loai)) document.getElementById('chkAll' + loai).checked = false;
    if(loai === 'HS') fetchStudents(true); else fetchTeachers(true);
}

async function deleteSelectedAccounts(loai) {
    let checkedBoxes = document.querySelectorAll('.chk-' + loai + ':checked');
    if(checkedBoxes.length === 0) return alert("Vui lòng tick chọn ít nhất 1 tài khoản!");
    if(!confirm(`XÓA VĨNH VIỄN ${checkedBoxes.length} tài khoản đã chọn khỏi hệ thống?`)) return;

    let pass = prompt("Hành động cực kỳ nhạy cảm! Vui lòng nhập mật khẩu Admin để xác nhận:");
    if(!pass) return;

    let hashedPass = await hashPassword(pass);
    let idsToDelete = Array.from(checkedBoxes).map(cb => cb.value);
    
    let btn = event.target;
    let oldText = btn.innerText; btn.innerText = "⏳ Đang xóa..."; btn.disabled = true;

    let {data, error} = await sb.rpc('rpc_admin_xoa_tk', {
        p_ma_gv: gvData.ma_gv,
        p_mat_khau: hashedPass,
        p_truong_id: gvData.truong_id,
        p_loai: loai,
        p_ids: idsToDelete
    });
    
    btn.innerText = oldText; btn.disabled = false;
    
    if(error) return alert("❌ Lỗi máy chủ: " + error.message);
    if(data && data.status === 'error') return alert(data.message);

    alert(`✅ Đã xóa tài khoản thành công!`);
    if(document.getElementById('chkAll' + loai)) document.getElementById('chkAll' + loai).checked = false;
    if(loai === 'HS') fetchStudents(true); else fetchTeachers(true);
}

async function deleteSelectedBank(btnElement) {
    let checkedBoxes = document.querySelectorAll('.chk-Bank:checked');
    if(checkedBoxes.length === 0) return alert("Vui lòng tick chọn ít nhất 1 câu hỏi để xóa!");
    if(!confirm(`Xóa vĩnh viễn ${checkedBoxes.length} câu hỏi đã chọn? Hành động này không thể hoàn tác.`)) return;

    let idsToDelete = Array.from(checkedBoxes).map(cb => cb.value);
    let oldText = btnElement.innerText;
    btnElement.innerText = "⏳ Đang xóa..."; btnElement.disabled = true;

    let {error} = await sb.from('ngan_hang').delete().in('id', idsToDelete);
    
    btnElement.innerText = oldText; btnElement.disabled = false;
    if(!error) { document.getElementById('chkAllBank').checked = false; fetchFullBank(true); }
    else alert("❌ Lỗi kết nối khi xóa dữ liệu!");
}

async function deleteBankBatch(deleteAll, btnElement) { 
    if(deleteAll) { 
        if(!confirm("🚨 BẠN ĐANG CHỌN XÓA SẠCH TOÀN BỘ KHO ĐỀ CỦA TRƯỜNG?\nBạn chắc chắn chứ?")) return; 
        
        let pass = prompt("Hành động cực kỳ nhạy cảm! Vui lòng nhập mật khẩu Admin để xác nhận:");
        if(!pass) return;

        let hashedPass = await hashPassword(pass);
        let oldText = btnElement.innerText; 
        btnElement.innerText = "⏳ Đang càn quét..."; btnElement.disabled = true; btnElement.style.background = "#7f8c8d";
        
        let {data, error} = await sb.rpc('rpc_admin_xoa_kho', {
            p_ma_gv: gvData.ma_gv,
            p_mat_khau: hashedPass,
            p_truong_id: gvData.truong_id
        });

        btnElement.innerText = oldText; btnElement.disabled = false; btnElement.style.background = "#c0392b";
        
        if(error) return alert("❌ Lỗi máy chủ: " + error.message);
        if(data && data.status === 'error') return alert(data.message);
        
        alert("✅ " + data.message);
        fetchFullBank(true); loadBankMeta(true);
        return;
    } 
    else { 
        let bH = document.getElementById("filterBaiHoc").value; let p = document.getElementById("filterPhan").value; let m = document.getElementById("filterMucDo").value; 
        if(!bH && !p && !m) return alert("⚠️ Vui lòng chọn ít nhất 1 bộ lọc (Bài Học / Phần / Mức Độ) để xác định mảng câu hỏi cần xóa!"); 
        if(!confirm("Xóa toàn bộ các câu hỏi đang được lọc hiển thị trên màn hình?")) return; 
        
        let oldText = btnElement.innerText; btnElement.innerText = "⏳ Đang càn quét..."; btnElement.disabled = true; btnElement.style.background = "#7f8c8d";
        
        let query = sb.from('ngan_hang').delete().eq('truong_id', gvData.truong_id);
        if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
        
        let filter_bH = document.getElementById("filterBaiHoc").value; let filter_p = document.getElementById("filterPhan").value; let filter_m = document.getElementById("filterMucDo").value;
        if(filter_bH) query = query.eq('bai_hoc', filter_bH);
        if(filter_p) query = query.eq('phan', filter_p);
        if(filter_m) query = query.eq('muc_do', filter_m);
        
        let {error} = await query;
        btnElement.innerText = oldText; btnElement.disabled = false;
        btnElement.style.background = "#e67e22";
        if(!error) { fetchFullBank(true); loadBankMeta(true); } else alert("Lỗi kết nối");
    } 
}

/* ================================================   QUẢN LÝ TRƯỜNG VÀ MÔN HỌC (LOGIC BỊ THIẾU)
======================================================= */
async function loadSysData() {
    let { data: truongs, error: errTruong } = await sb.from('truong_hoc').select('*').order('created_at', { ascending: true });
    let htmlTruong = '';
    if (truongs && truongs.length > 0) {
        truongs.forEach((t, i) => {
            htmlTruong += `<tr>
                <td style="padding: 10px; border: 1px solid #ddd; text-align:center;">${i + 1}</td>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight:bold;">${t.ma_truong}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${t.ten_truong}</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align:center;">
                    <button onclick="xoaTruong('${t.id}')" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Xóa</button>
                </td>
            </tr>`;
        });
    } else {
        htmlTruong = '<tr><td colspan="4" style="padding: 10px; text-align: center;">Chưa có dữ liệu trường học.</td></tr>';
    }
    if(document.getElementById('sysTruongBody')) document.getElementById('sysTruongBody').innerHTML = htmlTruong;

    let { data: mons, error: errMon } = await sb.from('mon_hoc').select('*').order('created_at', { ascending: true });
    let htmlMon = '';
    if (mons && mons.length > 0) {
        mons.forEach((m, i) => {
            htmlMon += `<tr>
                <td style="padding: 10px; border: 1px solid #ddd; text-align:center;">${i + 1}</td>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight:bold; color:#8e44ad;">${m.ten_mon}</td>
                <td style="padding: 10px; border: 1px solid #ddd; text-align:center;">
                    <button onclick="xoaMon('${m.id}')" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Xóa</button>
                </td>
            </tr>`;
        });
    } else {
        htmlMon = '<tr><td colspan="3" style="padding: 10px; text-align: center;">Chưa có dữ liệu môn học.</td></tr>';
    }
    if(document.getElementById('sysMonBody')) document.getElementById('sysMonBody').innerHTML = htmlMon;
}

async function themTruongMoi() {
    let ma = document.getElementById('newMaTruong').value.trim().toUpperCase();
    let ten = document.getElementById('newTenTruong').value.trim();
    if(!ma || !ten) return alert("Vui lòng nhập đủ Mã và Tên trường!");
    let btn = document.getElementById('btnThemTruong');
    btn.innerText = "..."; btn.disabled = true;
    let { error } = await sb.from('truong_hoc').insert([{ ma_truong: ma, ten_truong: ten }]);
    btn.innerText = "Thêm"; btn.disabled = false;
    if(error) alert("Lỗi: " + error.message);
    else { document.getElementById('newMaTruong').value = ''; document.getElementById('newTenTruong').value = ''; loadSysData(); }
}

async function xoaTruong(id) {
    if(!confirm("Xóa trường này?")) return;
    let { error } = await sb.from('truong_hoc').delete().eq('id', id);
    if(error) alert("Lỗi: " + error.message); else loadSysData();
}

async function themMonMoi() {
    let ten = document.getElementById('newTenMon').value.trim();
    if(!ten) return alert("Vui lòng nhập tên môn!");
    let btn = document.getElementById('btnThemMon');
    btn.innerText = "..."; btn.disabled = true;
    let { error } = await sb.from('mon_hoc').insert([{ ten_mon: ten }]);
    btn.innerText = "Thêm"; btn.disabled = false;
    if(error) alert("Lỗi: " + error.message);
    else { document.getElementById('newTenMon').value = ''; loadSysData(); }
}

async function xoaMon(id) {
    if(!confirm("Xóa môn này?")) return;
    let { error } = await sb.from('mon_hoc').delete().eq('id', id);
    if(error) alert("Lỗi: " + error.message); else loadSysData();
}

async function resetPass(ma, uid, loai) { 
    if(!confirm(`Khôi phục mật khẩu mặc định (123456) cho tài khoản ${ma}?`)) return; 
    const table = loai === 'HS' ? 'hoc_sinh' : 'giao_vien';
    await sb.from(table).update({mat_khau: DEFAULT_PASS_HASH}).eq('id', uid);
    if(loai === 'HS') fetchStudents(true); else fetchTeachers(true);
}

async function migrateLegacyPasswords(loai, btnElement) {
    if (gvData.quyen !== 'Admin') return alert("Chỉ Admin mới có quyền thực hiện chuẩn hóa hàng loạt.");
    if (!confirm(`Chuẩn hóa mật khẩu legacy cho toàn bộ tài khoản ${loai} trong trường hiện tại?\n\nHệ thống sẽ băm SHA-256 các mật khẩu còn dạng plain text.`)) return;

    const table = loai === 'HS' ? 'hoc_sinh' : 'giao_vien';
    const codeField = loai === 'HS' ? 'ma_hs' : 'ma_gv';
    const oldText = btnElement ? btnElement.innerText : "";
    if (btnElement) { btnElement.innerText = "⏳ Đang chuẩn hóa..."; btnElement.disabled = true; }

    try {
        const { data, error } = await sb.from(table).select(`id, ${codeField}, mat_khau`).eq('truong_id', gvData.truong_id);
        if (error) throw error;

        const all = data || new Array();
        const legacy = all.filter((x) => isLegacyPlainPassword(x.mat_khau));
        if (legacy.length === 0) {
            alert(`✅ Không phát hiện tài khoản ${loai} nào còn mật khẩu plain text.`);
            return;
        }

        let success = 0;
        let failed = new Array();
        for (const acc of legacy) {
            const hashed = await hashPassword(acc.mat_khau);
            const { error: upErr } = await sb.from(table).update({ mat_khau: hashed }).eq('id', acc.id);
            if (upErr) failed.push(acc[codeField] || acc.id);
            else success++;
        }

        let msg = `✅ Đã chuẩn hóa ${success}/${legacy.length} tài khoản ${loai}.`;
        if (failed.length > 0) {
            msg += `\n⚠️ Thất bại: ${failed.length} tài khoản (${failed.slice(0, 10).join(", ")}${failed.length > 10 ? ", ..." : ""}).`;
        }
        alert(msg);
        if (loai === 'HS') fetchStudents(true); else fetchTeachers(true);
    } catch (e) {
        alert("❌ Lỗi khi chuẩn hóa mật khẩu legacy: " + e.message);
    } finally {
        if (btnElement) { btnElement.innerText = oldText; btnElement.disabled = false; }
    }
}

// ===================================================// TÍNH NĂNG TÌM KIẾM THEO THỜI GIAN THỰC (LIVE SEARCH)
// ===================================================
function removeVietnameseTones(str) {
    if (!str) return "";
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str;
}

function xuLyLiveSearch() {
    const sInput = document.getElementById("liveSearchInput");
    if (!sInput) return;
    
    // Chuẩn hóa input: Chuyển hoa và chuẩn hóa cả 2 phiên bản (có dấu & không dấu)
    const filterRaw = sInput.value.toUpperCase().trim();
    const filterNoTone = removeVietnameseTones(filterRaw);
    
    const rows = document.querySelectorAll("#dashBody tr");
    let matchCount = 0;
    
    rows.forEach(row => {
        // Bỏ qua dòng thông báo lỗi hoặc rỗng
        if (row.cells.length < 2) return;
        
        const sbd = (row.cells[0].textContent || "").toUpperCase();
        const name = (row.cells[1].textContent || "").toUpperCase();
        
        const sbdNoTone = removeVietnameseTones(sbd);
        const nameNoTone = removeVietnameseTones(name);
        
        // Thuật toán so khớp thông minh:
        // 1. Nếu người dùng nhập có dấu (raw != noTone), ưu tiên so khớp chính xác từng chữ cái có dấu
        // 2. Nếu người dùng nhập không dấu, so khớp linh hoạt với cả bản gốc và bản bỏ dấu
        let isMatch = false;
        if (filterRaw === "") {
            isMatch = true;
        } else {
            // Kiểm tra khớp SBD hoặc Tên (cả 2 phương thức: chính xác và bỏ dấu)
            isMatch = sbd.includes(filterRaw) || 
                      name.includes(filterRaw) || 
                      sbdNoTone.includes(filterNoTone) || 
                      nameNoTone.includes(filterNoTone);
        }
        
        if (isMatch) {
            row.style.display = "";
            matchCount++;
        } else {
            row.style.display = "none";
        }
    });

    // Hiển thị dòng thông báo nếu không tìm thấy gì
    let noResultRow = document.getElementById("no-search-result-row");
    if (matchCount === 0 && filterRaw !== "") {
        if (!noResultRow) {
            const tbody = document.getElementById("dashBody");
            const tr = document.createElement("tr");
            tr.id = "no-search-result-row";
            tr.innerHTML = `<td colspan="10" style="padding: 20px; color: #e74c3c; font-weight: bold;">❌ Không tìm thấy học sinh nào khớp với từ khóa "${sInput.value}"</td>`;
            tbody.appendChild(tr);
        }
    } else {
        if (noResultRow) noResultRow.remove();
    }
}