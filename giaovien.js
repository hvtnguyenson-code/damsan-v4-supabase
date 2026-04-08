const { createClient } = supabase;
const SUPABASE_URL = 'https://xcervjnwlchwfqvbeahy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZXJ2am53bGNod2ZxdmJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NjksImV4cCI6MjA5MDY1Mjg2OX0.xjrY4YPDb5Q9BTenHrh2dUOnmZbegtKSZQPqzyJdxBo';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let gvData = null; 
let activeWorkspaceMonId = null; 

let danhSachDeThi = []; let duLieuBangDiem = []; let currentDashFilter = "TatCa"; let allStudents = []; let allTeachers = []; let currentStudentFilter = "TatCa"; let availableBaiHocs = []; let fullBankData = []; let allRoomsData = [];
let autoRefreshInterval = null;
let danhSachThuCong = [];
let previewExamData = []; 
let ketQuaChannel = null;
let g_danhSachLopCache = []; 

async function hashPassword(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
const DEFAULT_PASS_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"; 

function safeHTML(str) { 
    if (!str) return ""; 
    if (window.DOMPurify) { return DOMPurify.sanitize(str); }
    let doc = new DOMParser().parseFromString(str, 'text/html'); 
    return doc.body.innerHTML; 
}

window.onload = function() { 
    let script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js";
    document.head.appendChild(script);

    let gvSession = localStorage.getItem('damSan_GVSession');
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

async function khoiTaoWorkspace() {
    let {data: mons} = await sb.from('mon_hoc').select('*').order('created_at', {ascending: true});
    let sysMonList = mons || [];

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
    
    danhSachDeThi = []; danhSachThuCong = [];
    if(document.getElementById('matrixBody')) document.getElementById('matrixBody').innerHTML = '';
    if(document.getElementById('manBody')) { document.getElementById('manBody').innerHTML = '<tr><td colspan="5">Chưa có câu hỏi nào được gõ...</td></tr>'; document.getElementById('manCount').innerText = '0'; }
    if(document.getElementById('dashBody')) document.getElementById('dashBody').innerHTML = '<tr><td colspan="9">Chưa có dữ liệu...</td></tr>';
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
    let btnSubHs = document.getElementById('btnSubHs');
    let btnContainer = btnSubHs ? btnSubHs.parentNode : null;

    if(btnContainer && !document.getElementById('btnSubSys')) {
        let btn = document.createElement('button');
        btn.id = 'btnSubSys';
        btn.className = btnSubHs.className || ''; 
        btn.classList.remove('active');
        btn.style.marginLeft = '10px';
        btn.innerHTML = '<b>⚙️ Trường & Môn</b>';
        btn.onclick = () => {
            document.getElementById('sysModal').style.display = 'flex';
            loadSysData();
        };
        btnContainer.appendChild(btn);
    }

    if(!document.getElementById('sysModal')) {
        let modal = document.createElement('div');
        modal.id = 'sysModal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none'; 
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; width: 90%;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; margin-bottom: 20px;">
                    <span style="font-size: 20px; font-weight: bold; color: #1a73e8;">⚙️ QUẢN LÝ DỮ LIỆU TRƯỜNG & MÔN HỌC</span>
                    <span style="cursor: pointer; color: #e74c3c; font-size: 24px; font-weight: bold; padding: 0 10px;" onclick="document.getElementById('sysModal').style.display='none'">✖</span>
                </div>
                
                <div style="display: flex; flex-wrap: wrap; gap: 20px;">
                    <div style="flex: 1; min-width: 300px; background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #dadce0;">
                        <h3 style="color: #1a73e8; margin-top: 0; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">🏫 Danh sách Trường học</h3>
                        <div style="display: flex; gap: 5px; margin-bottom: 15px;">
                            <input type="text" id="newMaTruong" placeholder="Mã (VD: DAMSAN)" style="width: 30%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; text-transform: uppercase; font-weight: bold; outline: none;">
                            <input type="text" id="newTenTruong" placeholder="Tên trường đầy đủ" style="width: 45%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; outline: none;">
                            <button id="btnThemTruong" onclick="themTruongMoi()" style="width: 25%; background: #1a73e8; color: white; border: none; padding: 8px; border-radius: 4px; font-weight: bold; cursor: pointer; transition: 0.2s;">Thêm</button>
                        </div>
                        <div style="max-height: 350px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
                                <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
                                    <tr><th style="padding: 10px; border: 1px solid #ddd; width: 50px;">STT</th><th style="padding: 10px; border: 1px solid #ddd;">Mã</th><th style="padding: 10px; border: 1px solid #ddd;">Tên Trường</th><th style="padding: 10px; border: 1px solid #ddd; width: 60px; text-align: center;">Xóa</th></tr>
                                </thead>
                                <tbody id="sysTruongBody"><tr><td colspan=\"4\" style=\"padding: 10px; text-align: center;\">Đang tải...</td></tr></tbody>
                            </table>
                        </div>
                    </div>

                    <div style="flex: 1; min-width: 300px; background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #dadce0;">
                        <h3 style="color: #8e44ad; margin-top: 0; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">📚 Danh sách Môn học</h3>
                        <div style="display: flex; gap: 5px; margin-bottom: 15px;">
                            <input type="text" id="newTenMon" placeholder="Tên môn học (VD: Lịch sử)" style="width: 75%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-weight: bold; outline: none;">
                            <button id="btnThemMon" onclick="themMonMoi()" style="width: 25%; background: #8e44ad; color: white; border: none; padding: 8px; border-radius: 4px; font-weight: bold; cursor: pointer; transition: 0.2s;">Thêm</button>
                        </div>
                        <div style="max-height: 350px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
                                <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 1;">
                                    <tr><th style="padding: 10px; border: 1px solid #ddd; width: 50px;">STT</th><th style="padding: 10px; border: 1px solid #ddd;">Tên Môn</th><th style="padding: 10px; border: 1px solid #ddd; width: 60px; text-align: center;">Xóa</th></tr>
                                </thead>
                                <tbody id="sysMonBody"><tr><td colspan=\"3\" style=\"padding: 10px; text-align: center;\">Đang tải...</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
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
            
            <div style="margin-bottom:15px; display:flex; gap:8px; flex-wrap:wrap;">
                <button onclick="mc_chonNhanh('TatCa')" style="padding:6px 12px; background:#f1f3f4; border:1px solid #ccc; border-radius:4px; font-weight:bold; cursor:pointer;">🌎 Tất cả trường</button>
                <button onclick="mc_chonNhanh('10')" style="padding:6px 12px; background:#e8f0fe; border:1px solid #1a73e8; color:#1a73e8; font-weight:bold; border-radius:4px; cursor:pointer;">+ Khối 10</button>
                <button onclick="mc_chonNhanh('11')" style="padding:6px 12px; background:#e8f0fe; border:1px solid #1a73e8; color:#1a73e8; font-weight:bold; border-radius:4px; cursor:pointer;">+ Khối 11</button>
                <button onclick="mc_chonNhanh('12')" style="padding:6px 12px; background:#e8f0fe; border:1px solid #1a73e8; color:#1a73e8; font-weight:bold; border-radius:4px; cursor:pointer;">+ Khối 12</button>
                <button onclick="mc_chonNhanh('Clear')" style="padding:6px 12px; background:#fce8e6; border:1px solid #ea4335; color:#ea4335; font-weight:bold; border-radius:4px; cursor:pointer;">Bỏ chọn hết</button>
            </div>

            <div id="mc_classList" style="display:flex; flex-wrap:wrap; gap:10px; max-height: 250px; overflow-y:auto; border:1px solid #eee; padding:15px; border-radius:6px; margin-bottom:15px; background:#fafafa;">
            </div>

            <button onclick="mc_luuChonLop()" style="width:100%; background:#27ae60; color:white; border:none; padding:12px; border-radius:5px; font-weight:bold; cursor:pointer; font-size:16px;">💾 XÁC NHẬN CHỌN</button>
        </div>
    `;
    document.body.appendChild(m);
}

function moModalChonLop(roomId, currentVal) {
    document.getElementById('mc_roomId').value = roomId;
    let container = document.getElementById('mc_classList');
    container.innerHTML = '';
    
    if(!g_danhSachLopCache || g_danhSachLopCache.length === 0) {
        container.innerHTML = '<span style="color:#d93025; font-weight:bold;">Chưa có dữ liệu lớp. Hãy Import danh sách Học sinh vào hệ thống trước!</span>';
    } else {
        let selectedArr = currentVal === 'TatCa' ? [] : currentVal.split(',').map(s=>s.trim());
        let isTatCa = currentVal === 'TatCa';

        let html = `
            <label style="width:100%; display:block; padding:8px 10px; background:#f1f3f4; border-radius:4px; font-weight:bold; border:1px solid #ccc; cursor:pointer;">
                <input type="checkbox" id="mc_chk_tatca" value="TatCa" ${isTatCa ? 'checked' : ''} onchange="mc_toggleTatCa(this.checked)" style="transform: scale(1.2); margin-right:8px;"> 🌎 GIAO ĐỀ CHO TẤT CẢ CÁC LỚP
            </label>
            <div style="width:100%; height:1px; background:#ddd; margin: 5px 0;"></div>
        `;

        g_danhSachLopCache.forEach(l => {
            if(!l) return;
            let checked = (!isTatCa && selectedArr.includes(l)) ? 'checked' : '';
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
    if(!isTatCa) {
        let checked = []; document.querySelectorAll('.mc_class_item:checked').forEach(cb => checked.push(cb.value));
        if(checked.length > 0) finalVal = checked.join(', ');
    }
    let btn = document.querySelector('#multiClassModal button[onclick="mc_luuChonLop()"]');
    let oldText = btn.innerText; btn.innerText = "⏳ ĐANG LƯU LÊN MÁY CHỦ..."; btn.disabled = true;
    await capNhatNhanhPhong(roomId, 'doi_tuong', finalVal);
    btn.innerText = oldText; btn.disabled = false; document.getElementById('multiClassModal').style.display = 'none'; fetchRadar(); 
}

function phanQuyenGiaoVien() {
    let roleDisplay = document.getElementById('gvRoleDisplay');
    if (gvData.quyen !== 'Admin') {
        roleDisplay.innerText = "Giáo viên"; roleDisplay.style.color = "#27ae60"; roleDisplay.style.background = "#e8f5e9";
        if(document.getElementById('tab4')) document.getElementById('tab4').style.display = 'none';
        if(document.getElementById('btnXoaSachKho')) document.getElementById('btnXoaSachKho').style.display = 'none';
        if(document.getElementById('btnSubSys')) document.getElementById('btnSubSys').style.display = 'none';
    } else {
        roleDisplay.innerText = "Quản trị viên"; roleDisplay.style.color = "#e74c3c"; roleDisplay.style.background = "#fadbd8";
        if(document.getElementById('tab4')) document.getElementById('tab4').style.display = 'block';
        if(document.getElementById('btnXoaSachKho')) document.getElementById('btnXoaSachKho').style.display = 'block';
        if(document.getElementById('btnSubSys')) document.getElementById('btnSubSys').style.display = 'inline-block';
    }
}

async function thucHienDangNhapGV() {
    let user = document.getElementById("gvUser").value.trim();
    let pass = document.getElementById("gvPass").value.trim();
    let msg = document.getElementById("gvLoginMsg");
    let btn = document.getElementById("btnDangNhapGV");

    if (!user || !pass) { msg.innerText = "⚠️ Vui lòng nhập đủ thông tin!"; return; }

    btn.innerText = "⏳ ĐANG XÁC THỰC..."; btn.disabled = true; msg.innerText = "";

    try {
        let hashedPass = await hashPassword(pass);
        
        const { data, error } = await sb.from('giao_vien').select('*, truong_hoc(ten_truong)').eq('ma_gv', user).or(`mat_khau.eq.${hashedPass},mat_khau.eq.${pass}`).single();
        
        if (error || !data) {
            msg.innerText = "❌ Sai Tài khoản hoặc Mật khẩu!";
            btn.innerText = "🔐 QUẢN TRỊ HỆ THỐNG"; btn.disabled = false;
        } else {
            if (data.mat_khau === pass && pass !== DEFAULT_PASS_HASH) {
                sb.from('giao_vien').update({ mat_khau: hashedPass }).eq('id', data.id).then();
            }

            gvData = { 
                ma_gv: data.ma_gv, ho_ten: data.ho_ten, quyen: data.quyen, 
                truong_id: data.truong_id, truong_ten: data.truong_hoc.ten_truong,
                mon_id: data.mon_id 
            };
            localStorage.setItem('damSan_GVSession', JSON.stringify(gvData));
            document.getElementById('gvNameDisplay').innerText = gvData.ho_ten;
            document.getElementById('truongNameDisplay').innerText = gvData.truong_ten;
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('mainContainer').style.display = 'block';
            khoiTaoDuLieu();
        }
    } catch (err) {
        btn.innerText = "🔐 QUẢN TRỊ HỆ THỐNG"; btn.disabled = false;
        msg.innerText = "❌ Lỗi kết nối mạng Supabase!";
    }
}

function dangXuatGV() {
    if(confirm("Đăng xuất tài khoản?")) {
        localStorage.removeItem('damSan_GVSession');
        localStorage.removeItem('damSan_Workspace');
        sessionStorage.clear(); 
        location.reload();
    }
}

async function khoiTaoDuLieu() {
    try { 
        khoiTaoGiaoDienHeThong(); 
        initMultiClassModal(); 
        await khoiTaoWorkspace(); 
        phanQuyenGiaoVien();
        loadBankMeta(); loadMetaData(); fetchRadar(); fetchStudents(); fetchTeachers(); taiDanhSachPhong(); toggleAutoRefresh(); 
        kichHoatLienKetRealtimeGiaoVien();
    } catch(e){}
}

function kichHoatLienKetRealtimeGiaoVien() {
    if (ketQuaChannel) return;
    
    ketQuaChannel = sb.channel('gv-ket-qua')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ket_qua' }, payload => {
            const maPhong = document.getElementById('dashMaPhong').value.trim();
            let currentRoom = allRoomsData.find(r => r.MaPhong === maPhong);
            if (currentRoom && payload.new && payload.new.phong_id === currentRoom.id) {
                fetchDashboard(true); 
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'phong_thi' }, payload => {
             fetchRadar(); 
        })
        .subscribe();
}

async function getOrCreateRoom(maPhong) {
    let query = sb.from('phong_thi').select('id').eq('ma_phong', maPhong).eq('truong_id', gvData.truong_id);
    if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
    
    let {data: room} = await query.single();
    if(!room) {
        if(gvData.quyen === 'Admin' && (!activeWorkspaceMonId || activeWorkspaceMonId === 'ALL')) {
            throw new Error("⚠️ Admin chưa chọn bộ môn. Vui lòng chọn môn học trên Header trước khi tạo phòng!");
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
        if (!groupedByMaDe[q.MaDe]) groupedByMaDe[q.MaDe] = [];
        groupedByMaDe[q.MaDe].push({ noi_dung: q.NoiDung, A: q.DapAnA, B: q.DapAnB, C: q.DapAnC, D: q.DapAnD, dap_an_dung: q.DapAnDung, phan: q.Phan });
    });

    let rowsToInsert = [];
    for (let ma_de in groupedByMaDe) {
        rowsToInsert.push({ phong_id: phong_id, ma_de: String(ma_de), cau_so: JSON.stringify(groupedByMaDe[ma_de]) });
    }
    
    let { error } = await sb.from('de_thi').insert(rowsToInsert);
    if(error) { throw new Error(error.message); }
    return {status: 'success'};
}

async function xemTruocDeThi() {
    let maPhong = document.getElementById('ctrlMaPhong').value.trim();
    if(!maPhong) return alert("⚠️ Vui lòng CHỌN MÃ PHÒNG THI ở ô phía trên trước khi xem trước đề!");

    let btn = document.querySelector(`button[onclick="xemTruocDeThi()"]`);
    let oldText = btn.innerText; btn.innerText = "⏳ Đang lôi đề từ Máy chủ..."; btn.disabled = true;

    try {
        let query = sb.from('phong_thi').select('id').eq('ma_phong', maPhong).eq('truong_id', gvData.truong_id);
        if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
        
        let {data: room} = await query.single();
        if(!room) { alert("Phòng thi này chưa được tạo trên hệ thống!"); btn.innerText = oldText; btn.disabled = false; return; }

        let {data: exams, error} = await sb.from('de_thi').select('*').eq('phong_id', room.id);
        btn.innerText = oldText; btn.disabled = false;

        if(error || !exams || exams.length === 0) { return alert("Phòng này hiện tại Trống! Chưa có câu hỏi nào được trộn và đẩy lên."); }

        previewExamData = exams;
        let uniqueMaDe = [...new Set(exams.map(e => e.ma_de))].sort();
        let selectHtml = '';
        uniqueMaDe.forEach(md => { selectHtml += `<option value="${md}">MÃ ĐỀ: ${md}</option>`; });
        
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
    
    let examArray = [];
    try {
        if (currentExams.length > 0 && currentExams[0].cau_so) {
            examArray = typeof currentExams[0].cau_so === 'string' ? JSON.parse(currentExams[0].cau_so) : currentExams[0].cau_so;
        }
    } catch(e) {
        document.getElementById('previewCountMsg').innerText = ``;
        document.getElementById('previewContent').innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <h3 style="color:#c0392b; font-size: 20px;">⚠️ PHÁT HIỆN DỮ LIỆU CŨ TỪ PHIÊN BẢN TRƯỚC!</h3>
                <p style="font-size: 16px;">Đề thi trong phòng này đang lưu dưới định dạng cũ.<br>Hệ thống hiện tại đã nâng cấp lên định dạng nén JSON để chạy nhanh hơn.</p>
                <p style="font-size: 16px; font-weight: bold; color: #27ae60;">👉 CÁCH XỬ LÝ: Bạn hãy đóng cửa sổ này lại, bấm nút "Xóa Sạch" phòng này ở bảng Radar phía dưới, sau đó trộn và đẩy lại đề mới nhé!</p>
            </div>`;
        return;
    }
    
    document.getElementById('previewCountMsg').innerText = `(Tổng số: ${examArray.length} câu)`;
    
    let p1 = examArray.filter(c => c.phan === "1" || c.Phan === "1");
    let p2 = examArray.filter(c => c.phan === "2" || c.Phan === "2");
    let p3 = examArray.filter(c => c.phan === "3" || c.Phan === "3");

    let html = "";
    
    if(p1.length > 0) {
        html += `<h3 style="color:#c0392b; border-bottom:1px solid #c0392b; padding-bottom:5px;">PHẦN I: Trắc nghiệm nhiều lựa chọn</h3>`;
        p1.forEach((q, idx) => {
            let ansA_style = q.dap_an_dung === 'A' ? 'font-weight:bold; color:#27ae60; background:#e8f5e9; padding:2px 5px; border-radius:4px;' : '';
            let ansB_style = q.dap_an_dung === 'B' ? 'font-weight:bold; color:#27ae60; background:#e8f5e9; padding:2px 5px; border-radius:4px;' : '';
            let ansC_style = q.dap_an_dung === 'C' ? 'font-weight:bold; color:#27ae60; background:#e8f5e9; padding:2px 5px; border-radius:4px;' : '';
            let ansD_style = q.dap_an_dung === 'D' ? 'font-weight:bold; color:#27ae60; background:#e8f5e9; padding:2px 5px; border-radius:4px;' : '';
            
            html += `
            <div style="margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">
                <div><b>Câu ${idx+1}:</b> ${safeHTML(q.noi_dung || q.NoiDung)}</div>
                <div style="margin-left: 15px; margin-top: 5px;">
                    <div style="${ansA_style}">A. ${safeHTML(q.A || q.DapAnA)}</div>
                    <div style="${ansB_style}">B. ${safeHTML(q.B || q.DapAnB)}</div>
                    <div style="${ansC_style}">C. ${safeHTML(q.C || q.DapAnC)}</div>
                    <div style="${ansD_style}">D. ${safeHTML(q.D || q.DapAnD)}</div>
                </div>
            </div>`;
        });
    }

    if(p2.length > 0) {
        html += `<h3 style="color:#c0392b; border-bottom:1px solid #c0392b; padding-bottom:5px; margin-top:20px;">PHẦN II: Đúng / Sai</h3>`;
        p2.forEach((q, idx) => {
            let dArr = String(q.dap_an_dung || q.DapAnDung).split('-');
            html += `
            <div style="margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">
                <div><b>Câu ${idx+1}:</b> ${safeHTML(q.noi_dung || q.NoiDung)}</div>
                <table style="width:100%; border-collapse:collapse; margin-top:5px; font-size:14px;">
                    <tr>
                        <th style="border:1px solid #ccc; padding:5px; width:40px; background:#f2f2f2;">Ý</th>
                        <th style="border:1px solid #ccc; padding:5px; background:#f2f2f2;">Nội dung phát biểu</th>
                        <th style="border:1px solid #ccc; padding:5px; width:80px; color:#27ae60; background:#f2f2f2;">Đáp án</th>
                    </tr>
                    <tr>
                        <td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold;">a</td>
                        <td style="border:1px solid #ccc; padding:5px;">${safeHTML(q.A || q.DapAnA)}</td>
                        <td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold; color:#27ae60;">${dArr[0]||''}</td>
                    </tr>
                    <tr>
                        <td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold;">b</td>
                        <td style="border:1px solid #ccc; padding:5px;">${safeHTML(q.B || q.DapAnB)}</td>
                        <td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold; color:#27ae60;">${dArr[1]||''}</td>
                    </tr>
                    <tr>
                        <td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold;">c</td>
                        <td style="border:1px solid #ccc; padding:5px;">${safeHTML(q.C || q.DapAnC)}</td>
                        <td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold; color:#27ae60;">${dArr[2]||''}</td>
                    </tr>
                    <tr>
                        <td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold;">d</td>
                        <td style="border:1px solid #ccc; padding:5px;">${safeHTML(q.D || q.DapAnD)}</td>
                        <td style="border:1px solid #ccc; padding:5px; text-align:center; font-weight:bold; color:#27ae60;">${dArr[3]||''}</td>
                    </tr>
                </table>
            </div>`;
        });
    }

    if(p3.length > 0) {
        html += `<h3 style="color:#c0392b; border-bottom:1px solid #c0392b; padding-bottom:5px; margin-top:20px;">PHẦN III: Trả lời ngắn</h3>`;
        p3.forEach((q, idx) => {
            let ans = String(q.dap_an_dung || q.DapAnDung).replace(/'/g, '');
            html += `
            <div style="margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">
                <div><b>Câu ${idx+1}:</b> ${safeHTML(q.noi_dung || q.NoiDung)}</div>
                <div style="margin-top: 5px; color: #27ae60; font-weight: bold;">
                    🎯 Đáp án chuẩn: <span style="background:#e8f5e9; padding:2px 8px; border-radius:4px; border:1px solid #27ae60;">${safeHTML(ans)}</span>
                </div>
            </div>`;
        });
    }

    document.getElementById('previewContent').innerHTML = html;
}

function toggleAutoRefresh() { 
    let isChecked = document.getElementById("autoRefreshToggle").checked; 
    if(isChecked) { 
        fetchDashboard(true); 
        autoRefreshInterval = setInterval(() => fetchDashboard(true), 5000); 
    } else { 
        clearInterval(autoRefreshInterval); 
    } 
}

function switchTab(tabId) { 
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); 
    document.querySelectorAll('.tabs > button').forEach(el => el.classList.remove('active')); 
    document.getElementById(tabId).classList.add('active'); 
    if(tabId === 'taoDe') { document.getElementById('tab1').classList.add('active'); loadBankMeta(); } 
    if(tabId === 'dieuHanh') { document.getElementById('tab2').classList.add('active'); fetchRadar(); loadMetaData(); } 
    if(tabId === 'thongKe') { document.getElementById('tab3').classList.add('active'); } 
    if(tabId === 'quanLyTK') { document.getElementById('tab4').classList.add('active'); if(allStudents.length===0) fetchStudents(); if(allTeachers.length===0) fetchTeachers(); } 
    if (tabId === 'dieuHanh' || tabId === 'thongKe') { taiDanhSachPhong(); } 
}

function switchSubTabTK(mode) {
    ['Hs', 'Gv', 'Import'].forEach(key => {
        let btn = document.getElementById('btnSub' + key);
        let content = document.getElementById('subTab' + key);
        if(btn) { btn.classList.remove('active'); btn.style.background = '#f1f3f4'; btn.style.color = '#5f6368'; }
        if(content) content.classList.remove('active');
    });
    
    let activeBtn = document.getElementById('btnSub' + (mode === 'hs' ? 'Hs' : mode === 'gv' ? 'Gv' : 'Import'));
    let activeContent = document.getElementById('subTab' + (mode === 'hs' ? 'Hs' : mode === 'gv' ? 'Gv' : 'Import'));
    
    if(activeBtn) { activeBtn.classList.add('active'); activeBtn.style.background = '#1a73e8'; activeBtn.style.color = '#fff'; }
    if(activeContent) activeContent.classList.add('active');
}

function switchSubTabTaoDe(mode) { document.querySelectorAll('.sub-tab-content').forEach(el => el.classList.remove('active')); document.getElementById('btnSubDirect').classList.remove('active'); document.getElementById('btnSubOffline').classList.remove('active'); document.getElementById('btnSubBank').classList.remove('active'); document.getElementById('btnSubMatrix').classList.remove('active'); document.getElementById('btnSubManage').classList.remove('active'); document.getElementById('btnSubManual').classList.remove('active'); document.getElementById('btnSubOffline').style.borderColor = "#dadce0"; document.getElementById('btnSubOffline').style.color = "#5f6368"; document.getElementById('btnSubManual').style.borderColor = "#e74c3c"; document.getElementById('btnSubManual').style.color = "#e74c3c"; document.getElementById('btnSubManual').style.background = "#fff"; if(mode === 'direct') { document.getElementById('subTabDirect').classList.add('active'); document.getElementById('btnSubDirect').classList.add('active'); } if(mode === 'offline') { document.getElementById('subTabOffline').classList.add('active'); document.getElementById('btnSubOffline').classList.add('active'); document.getElementById('btnSubOffline').style.borderColor = "#8e44ad"; document.getElementById('btnSubOffline').style.color = "#8e44ad"; } if(mode === 'bank') { document.getElementById('subTabBank').classList.add('active'); document.getElementById('btnSubBank').classList.add('active'); } if(mode === 'matrix') { document.getElementById('subTabMatrix').classList.add('active'); document.getElementById('btnSubMatrix').classList.add('active'); loadBankMeta(); } if(mode === 'manage') { document.getElementById('subTabManage').classList.add('active'); document.getElementById('btnSubManage').classList.add('active'); fetchFullBank(); } if(mode === 'manual') { document.getElementById('subTabManual').classList.add('active'); document.getElementById('btnSubManual').classList.add('active'); document.getElementById('btnSubManual').style.background = "#e74c3c"; document.getElementById('btnSubManual').style.color = "#fff"; } }

function changePhanThuCong() { let phan = document.getElementById("manPhan").value; document.getElementById("manAreaP1").style.display = (phan === "1") ? "block" : "none"; document.getElementById("manAreaP2").style.display = (phan === "2") ? "block" : "none"; document.getElementById("manAreaP3").style.display = (phan === "3") ? "block" : "none"; }
function themCauHoiThuCong() { 
    let phan = document.getElementById("manPhan").value; let mucDo = document.getElementById("manMucDo").value; 
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
        let dapAnStr = document.getElementById("manDapAn2").value.trim().toUpperCase().replace(/\s/g, '').replace(/[-–—]/g, '-'); 
        let validFormat = /^[ĐS]-[ĐS]-[ĐS]-[ĐS]$/; if(!validFormat.test(dapAnStr)) return alert("Chuỗi đáp án không đúng định dạng. Ví dụ chuẩn: Đ-S-Đ-S"); 
        cauHoi.DapAnDung = dapAnStr; 
    } else if(phan === "3") { 
        let dapAn = safeHTML(document.getElementById("manDapAn3").value.trim()); 
        if(dapAn === "") return alert("Vui lòng nhập đáp án!"); if (!dapAn.startsWith("'")) dapAn = "'" + dapAn; 
        cauHoi.DapAnDung = dapAn; 
    } 
    danhSachThuCong.push(cauHoi); document.getElementById("manNoiDung").innerHTML = ""; document.getElementById("manA1").value = ""; document.getElementById("manB1").value = ""; document.getElementById("manC1").value = ""; document.getElementById("manD1").value = ""; document.getElementById("manA2").value = ""; document.getElementById("manB2").value = ""; document.getElementById("manC2").value = ""; document.getElementById("manD2").value = ""; document.getElementById("manDapAn2").value = ""; document.getElementById("manDapAn3").value = ""; renderBangThuCong(); 
}
function renderBangThuCong() { let html = ""; if(danhSachThuCong.length === 0) { html = '<tr><td colspan="5">Chưa có câu hỏi nào được gõ...</td></tr>'; } else { danhSachThuCong.forEach((q, i) => { let snippet = q.NoiDung.replace(/<[^>]+>/g, ' ').substring(0, 60) + "..."; let dapAnHienThi = String(q.DapAnDung); if (dapAnHienThi.startsWith("'")) dapAnHienThi = dapAnHienThi.substring(1); html += `<tr><td>${i+1}</td><td>P.${q.Phan}</td><td style="text-align:left;">${snippet}</td><td><b>${dapAnHienThi}</b></td><td><button style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="xoaCauThuCong(${i})">Xóa</button></td></tr>`; }); } document.getElementById("manBody").innerHTML = html; document.getElementById("manCount").innerText = danhSachThuCong.length; }
function xoaCauThuCong(index) { danhSachThuCong.splice(index, 1); renderBangThuCong(); }
function dayDeThuCong() { 
    if(!checkWorkspaceAction()) return;
    if(danhSachThuCong.length === 0) return alert("Giỏ câu hỏi trống! Hãy gõ thêm câu hỏi."); let maPhong = document.getElementById("manMaPhong").value.trim(); if(!maPhong) return alert("Vui lòng nhập Mã Phòng Thi!"); let soLuongDe = parseInt(document.getElementById("manSoLuongDe").value) || 1; let startCode = parseInt(document.getElementById("manStartCode").value) || 101; let stepCode = parseInt(document.getElementById("manStepCode").value) || 1; let btn = document.getElementById("btnDayMan"); let oldText = btn.innerText; btn.innerText = "⏳ ĐANG TRỘN VÀ ĐẨY LÊN MẠNG..."; btn.disabled = true; generateExams(danhSachThuCong, soLuongDe, maPhong, startCode, stepCode); luuDeThiLenSupabase(danhSachDeThi).then(data => { btn.innerText = oldText; btn.disabled = false; if(data.status === "success") { alert(`🎉 Đã đẩy thành công ${danhSachDeThi.length} bản thể câu hỏi lên Server! Sẵn sàng thi!`); document.getElementById("btnXuatWordMan").style.display = "block"; } else { alert("❌ Lỗi máy chủ: " + data.message); } }).catch(e => { btn.innerText = oldText; btn.disabled = false; alert("❌ Lỗi mạng khi đẩy dữ liệu: " + e.message); }); }

function compressImage(base64Str, mimeType) { return new Promise((resolve) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const MAX_WIDTH = 600; let width = img.width; let height = img.height; if (width > MAX_WIDTH) { height = Math.round((height *= MAX_WIDTH / width)); width = MAX_WIDTH; } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height); resolve({ src: canvas.toDataURL('image/jpeg', 0.6) }); }; img.onerror = () => { resolve({ src: "data:" + mimeType + ";base64," + base64Str }); }; img.src = "data:" + mimeType + ";base64," + base64Str; }); }
function lamSachNoiDung(htmlCode) { if (!htmlCode) return ""; let doc = new DOMParser().parseFromString(htmlCode, 'text/html'); let tables = doc.querySelectorAll('table'); tables.forEach(t => { t.removeAttribute('style'); t.removeAttribute('width'); t.removeAttribute('class'); t.setAttribute('border', '1'); t.style.width = '100%'; t.style.borderCollapse = 'collapse'; }); let cells = doc.querySelectorAll('td, th'); cells.forEach(c => { c.removeAttribute('style'); c.style.border = '1px solid black'; c.style.padding = '5px'; }); let txt = doc.body.innerHTML; txt = txt.replace(/<\/?(div|span)[^>]*>/gi, ''); txt = txt.replace(/<\/?p[^>]*>/gi, '<br>'); txt = txt.replace(/<(?!\/?(img|b|i|u|sub|sup|br|table|tbody|thead|tr|td|th)(>|\s))[^>]+>/gi, ''); txt = txt.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>'); return txt.replace(/^<br>|<br>$/gi, '').trim(); }

function parseHTMLToJSON(htmlText) { 
    if (window.DOMPurify) { htmlText = DOMPurify.sanitize(htmlText); }
    htmlText = htmlText.replace(/&nbsp;/g, ' '); let imgMap = []; htmlText = htmlText.replace(/<img[^>]+>/gi, function(match) { imgMap.push(match); return `[[IMG_${imgMap.length - 1}]]`; }); let doc = new DOMParser().parseFromString(htmlText, 'text/html'); htmlText = doc.body.innerHTML; htmlText = htmlText.replace(/(<br\s*\/?>)*[aA]\s*\)\s*[,;.-]\s*(<br\s*\/?>)*[bB]\s*\)\s*[,;.-]\s*(<br\s*\/?>)*[cC]\s*\)\s*[,;.-]\s*(<br\s*\/?>)*[dD]\s*\)/g, ""); htmlText = htmlText.replace(/Thí\s*sinh\s*trả\s*lời\s*từ\s*câu/gi, ""); let questions = []; const matchP2 = htmlText.match(/PHẦN\s*I{2,}/i); const matchP3 = htmlText.match(/PHẦN\s*I{3,}/i); let idxP2 = matchP2 ? matchP2.index : -1; let idxP3 = matchP3 ? matchP3.index : -1; let p1Html = htmlText, p2Html = "", p3Html = ""; if(idxP2 !== -1 && idxP3 !== -1) { p1Html = htmlText.substring(0, idxP2); p2Html = htmlText.substring(idxP2, idxP3); p3Html = htmlText.substring(idxP3); } else if (idxP2 !== -1) { p1Html = htmlText.substring(0, idxP2); p2Html = htmlText.substring(idxP2); } const st = "(?:<br\\s*\\/?>\\s*)*"; function sliceFromCau1(htmlStr) { let regex = new RegExp("(?:^|>|\\s|<br>)" + st + "[Cc]âu\\s*" + st + "1\\s*" + st + "[:.]", "i"); let match = htmlStr.match(regex); if (match) return htmlStr.substring(match.index); return htmlStr; } p1Html = sliceFromCau1(p1Html); p2Html = sliceFromCau1(p2Html); p3Html = sliceFromCau1(p3Html); function lamSachDapAn(htmlCode) { if (!htmlCode) return ""; let d = new DOMParser().parseFromString(htmlCode, 'text/html'); return d.body.textContent.trim(); } const patternP1 = "(?:\\[(NB|TH|VD|VDC)\\])?\\s*" + st + "[Cc]âu\\s*" + st + "(\\d+)\\s*[:.]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)A\\s*[:.]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)B\\s*[:.]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)C\\s*[:.]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)D\\s*[:.]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)[Đđ]áp\\s*[áa]n\\s*[:.]\\s*([A-D])"; const regexP1 = new RegExp(patternP1, "g"); let m1; while ((m1 = regexP1.exec(p1Html)) !== null) { questions.push({ Phan: "1", MucDo: m1[1] ? m1[1].toUpperCase() : "NB", NoiDung: lamSachNoiDung(m1[3]), DapAnA: lamSachDapAn(m1[4]), DapAnB: lamSachDapAn(m1[5]), DapAnC: lamSachDapAn(m1[6]), DapAnD: lamSachDapAn(m1[7]), DapAnDung: m1[8].toUpperCase().trim() }); } const patternP2 = "(?:\\[(NB|TH|VD|VDC)\\])?\\s*" + st + "[Cc]âu\\s*" + st + "(\\d+)\\s*[:.]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)[aA]\\s*[).]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)[bB]\\s*[).]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)[cC]\\s*[).]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)[dD]\\s*[).]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)[Đđ]áp\\s*[áa]n\\s*[:.]\\s*([ĐSđs]\\s*[-–—]\\s*[ĐSđs]\\s*[-–—]\\s*[ĐSđs]\\s*[-–—]\\s*[ĐSđs])"; const regexP2 = new RegExp(patternP2, "g"); let m2; while ((m2 = regexP2.exec(p2Html)) !== null) { questions.push({ Phan: "2", MucDo: m2[1] ? m2[1].toUpperCase() : "NB", NoiDung: lamSachNoiDung(m2[3]), DapAnA: lamSachDapAn(m2[4]), DapAnB: lamSachDapAn(m2[5]), DapAnC: lamSachDapAn(m2[6]), DapAnD: lamSachDapAn(m2[7]), DapAnDung: m2[8].toUpperCase().replace(/\s/g, '').replace(/[-–—]/g, '-') }); } const patternP3 = "(?:\\[(NB|TH|VD|VDC)\\])?\\s*" + st + "[Cc]âu\\s*" + st + "(\\d+)\\s*[:.]\\s*([\\s\\S]*?)(?:^|>|\\s|<br>)[Đđ]áp\\s*[áa]n\\s*[:.]\\s*([0-9.,\\-]+)"; const regexP3 = new RegExp(patternP3, "g"); let m3; while ((m3 = regexP3.exec(p3Html)) !== null) { let dapAnChuan = m3[4].trim(); if (!dapAnChuan.startsWith("'")) dapAnChuan = "'" + dapAnChuan; questions.push({ Phan: "3", MucDo: m3[1] ? m3[1].toUpperCase() : "NB", NoiDung: lamSachNoiDung(m3[3]), DapAnA: "", DapAnB: "", DapAnC: "", DapAnD: "", DapAnDung: dapAnChuan }); } function restoreImages(text) { if(!text) return ""; return text.replace(/\[\[IMG_(\d+)\]\]/g, function(match, p1) { return imgMap[parseInt(p1)] || match; }); } questions.forEach(q => { q.NoiDung = restoreImages(q.NoiDung); q.DapAnA = restoreImages(q.DapAnA); q.DapAnB = restoreImages(q.DapAnB); q.DapAnC = restoreImages(q.DapAnC); q.DapAnD = restoreImages(q.DapAnD); }); if (questions.length === 0) return { hopLe: false, thongBao: "⛔ Lỗi: Không tìm thấy câu hỏi nào." }; return { hopLe: true, duLieu: questions }; 
}

function generateExams(cauHoiGoc, soLuongDe, maPhong, startCode = 101, stepCode = 1) { danhSachDeThi = []; for (let i = 0; i < soLuongDe; i++) { const maDe = startCode + (i * stepCode); let deThiClone = JSON.parse(JSON.stringify(cauHoiGoc)); let p1 = deThiClone.filter(c => String(c.Phan).trim() === "1"); let p2 = deThiClone.filter(c => String(c.Phan).trim() === "2"); let p3 = deThiClone.filter(c => String(c.Phan).trim() === "3"); shuffleArray(p1); p1.forEach((cauHoi, idx) => { cauHoi.CauSo = "P1_" + (idx + 1); cauHoi.MaPhong = maPhong; cauHoi.MaDe = maDe.toString(); let dapAnDungText = ""; if (cauHoi.DapAnDung === "A") dapAnDungText = cauHoi.DapAnA; if (cauHoi.DapAnDung === "B") dapAnDungText = cauHoi.DapAnB; if (cauHoi.DapAnDung === "C") dapAnDungText = cauHoi.DapAnC; if (cauHoi.DapAnDung === "D") dapAnDungText = cauHoi.DapAnD; let options = [ { text: cauHoi.DapAnA }, { text: cauHoi.DapAnB }, { text: cauHoi.DapAnC }, { text: cauHoi.DapAnD } ]; shuffleArray(options); cauHoi.DapAnA = options[0].text; cauHoi.DapAnB = options[1].text; cauHoi.DapAnC = options[2].text; cauHoi.DapAnD = options[3].text; if (options[0].text === dapAnDungText) cauHoi.DapAnDung = "A"; if (options[1].text === dapAnDungText) cauHoi.DapAnDung = "B"; if (options[2].text === dapAnDungText) cauHoi.DapAnDung = "C"; if (options[3].text === dapAnDungText) cauHoi.DapAnDung = "D"; danhSachDeThi.push(cauHoi); }); shuffleArray(p2); p2.forEach((cauHoi, idx) => { cauHoi.CauSo = "P2_" + (idx + 1); cauHoi.MaPhong = maPhong; cauHoi.MaDe = maDe.toString(); let arrDung = cauHoi.DapAnDung.split("-"); let optionsP2 = [ { text: cauHoi.DapAnA, ans: arrDung[0] }, { text: cauHoi.DapAnB, ans: arrDung[1] }, { text: cauHoi.DapAnC, ans: arrDung[2] }, { text: cauHoi.DapAnD, ans: arrDung[3] } ]; shuffleArray(optionsP2); cauHoi.DapAnA = optionsP2[0].text; cauHoi.DapAnB = optionsP2[1].text; cauHoi.DapAnC = optionsP2[2].text; cauHoi.DapAnD = optionsP2[3].text; cauHoi.DapAnDung = `${optionsP2[0].ans}-${optionsP2[1].ans}-${optionsP2[2].ans}-${optionsP2[3].ans}`; danhSachDeThi.push(cauHoi); }); shuffleArray(p3); p3.forEach((cauHoi, idx) => { cauHoi.CauSo = "P3_" + (idx + 1); cauHoi.MaPhong = maPhong; cauHoi.MaDe = maDe.toString(); danhSachDeThi.push(cauHoi); }); } }
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }

// ==========================================================
// HÀM HÚT ĐỀ THÔNG MINH: TƯƠNG THÍCH CẢ V8 VÀ V11 (ĐÃ VÁ LỖI CÂU CHÙM, ĐỊA LÝ)
// ==========================================================
async function layDeTuIframe(btnElement) {
    if (!checkWorkspaceAction()) return;

    let inputMaPhong = document.getElementById('maPhongLienKet');
    let maPhong = inputMaPhong ? inputMaPhong.value.trim() : prompt("Vui lòng nhập MÃ PHÒNG THI đích đến:");
    
    if (!maPhong) return alert("⚠️ Cần phải có Mã Phòng Thi để đẩy đề lên mạng!");

    try {
        let iframeWindow = document.getElementById('frameV8').contentWindow;
        let danhSachDeIframe = [];

        // --- KIỂM TRA: NẾU LÀ BẢN V11 ---
        if (iframeWindow.__v11native && typeof iframeWindow.__v11native.getState === 'function') {
            let v11State = iframeWindow.__v11native.getState();
            
            if (!v11State.generated || v11State.generated.length === 0) {
                return alert("⚠️ V11 chưa trộn đề! Thầy hãy thao tác tải file DOCX, cấu hình số lượng và bấm nút [2. Trộn + Preview] bên trong khung V11 trước khi hút.");
            }

            // Bắt đầu bóc tách Cây dữ liệu V11 sang dạng Phẳng của hệ thống
            v11State.generated.forEach(exam => {
                let maDe = exam.examCode;
                
                exam.canonical.sections.forEach(sec => {
                    let phan = "1";
                    if (sec.section_kind === 'true_false') phan = "2";
                    if (sec.section_kind === 'short_answer') phan = "3";
                    
                    let processQuestion = (q, sharedBlocks = []) => {
                        let noiDung = "";

                        // 1. XỬ LÝ CÂU CHÙM (SHARED BLOCKS) - Cho vào khung highlight
                        if (sharedBlocks && sharedBlocks.length > 0) {
                            noiDung += `<div style="background-color: #f8f9fa; padding: 12px; border-left: 4px solid #1a73e8; margin-bottom: 10px; border-radius: 4px;">`;
                            sharedBlocks.forEach(b => {
                                // Lấy triệt để nội dung từ V11 (bao gồm cả bảng biểu, hình ảnh)
                                let bContent = typeof b === 'string' ? b : (b.html || b.outerHTML || b.content || b.text || "");
                                noiDung += `<div style="margin-bottom: 5px; overflow-x: auto;">${bContent}</div>`;
                            });
                            noiDung += `</div>`;
                        }

                        // 2. XỬ LÝ NỘI DUNG CÂU HỎI CHÍNH (STEM)
                        let rawStem = "";
                        
                        // Lấy phần Câu dẫn (Khắc phục lỗi xóa trắng câu hỏi)
                        let opener = q.opener_text || q.lead_in_text || q.stem_text || q.text || "";
                        if (opener) {
                            rawStem += opener + "<br>";
                        }

                        // Lấy nội dung các block phụ (Hình ảnh bản đồ, bảng số liệu Địa Lý)
                        (q.stem_blocks || []).forEach(b => {
                            let bContent = typeof b === 'string' ? b : (b.html || b.outerHTML || b.content || b.text || "");
                            if (bContent) {
                                rawStem += bContent + "<br>";
                            }
                        });

                        // 3. THUẬT TOÁN TIA LASER: Dọn rác tránh lặp chữ "Câu X:"
                        let startingTags = "";
                        
                        // Rút hết các thẻ HTML mở đầu cất tạm
                        rawStem = rawStem.replace(/^(\s*<[^>]+>\s*)*/, function(match) {
                            startingTags = match; return "";
                        });
                        
                        // Tiêu diệt chữ "Câu X" hoặc "# Câu X" hoặc "Câu X (TH)" ở mọi biến thể
                        rawStem = rawStem.replace(/^#?\s*C[âa]u\s*\d+\s*([(\[][A-Za-z0-9]+[)\]])?\s*(<\/[^>]+>\s*)*[:.]?\s*/i, function(match) {
                            let closingTags = match.match(/<\/[^>]+>/g); // Giữ lại thẻ đóng nếu có (ví dụ </b>)
                            return closingTags ? closingTags.join("") : ""; 
                        });
                        
                        // Ghép lại thẻ mở đầu và dọn thẻ <br> thừa
                        rawStem = startingTags + rawStem;
                        rawStem = rawStem.replace(/^(<br>\s*)+/, "").replace(/(<br>\s*)+$/, "").trim();

                        noiDung += rawStem;

                        // 4. XỬ LÝ ĐÁP ÁN
                        let dapAnA = "", dapAnB = "", dapAnC = "", dapAnD = "", dapAnDung = "";
                        let opts = q.display_options || [];

                        if (phan === "1") {
                            dapAnA = opts[0] ? (opts[0].html || opts[0].text || "") : "";
                            dapAnB = opts[1] ? (opts[1].html || opts[1].text || "") : "";
                            dapAnC = opts[2] ? (opts[2].html || opts[2].text || "") : "";
                            dapAnD = opts[3] ? (opts[3].html || opts[3].text || "") : "";
                            dapAnDung = q.display_answer ? q.display_answer.normalized : "";
                        } else if (phan === "2") {
                            dapAnA = opts[0] ? (opts[0].html || opts[0].text || "") : "";
                            dapAnB = opts[1] ? (opts[1].html || opts[1].text || "") : "";
                            dapAnC = opts[2] ? (opts[2].html || opts[2].text || "") : "";
                            dapAnD = opts[3] ? (opts[3].html || opts[3].text || "") : "";
                            let ansArr = q.display_answer && Array.isArray(q.display_answer.normalized) ? q.display_answer.normalized : ["","","",""];
                            dapAnDung = ansArr.join("-");
                        } else if (phan === "3") {
                            dapAnDung = q.display_answer ? q.display_answer.normalized : "";
                            if (dapAnDung && !dapAnDung.startsWith("'")) dapAnDung = "'" + dapAnDung;
                        }

                        danhSachDeIframe.push({
                            MaPhong: maPhong,
                            MaDe: String(maDe),
                            Phan: phan,
                            NoiDung: noiDung,
                            DapAnA: dapAnA,
                            DapAnB: dapAnB,
                            DapAnC: dapAnC,
                            DapAnD: dapAnD,
                            DapAnDung: dapAnDung
                        });
                    };

                    // Duyệt từng item trong section (xử lý tốt Câu Chùm / Nhóm câu hỏi)
                    (sec.items || []).forEach(item => {
                        if (item.kind === 'question_group') {
                            let shared = item.shared_blocks || [];
                            let leadText = item.display_lead_text || item.lead_in_text || "";
                            if (leadText) {
                                shared = [{type: 'paragraph', html: `<b><i>${leadText}</i></b>`}].concat(shared);
                            }
                            (item.child_questions || []).forEach(cq => processQuestion(cq, shared));
                        } else {
                            processQuestion(item, []);
                        }
                    });
                });
            });

        } 
        // --- KIỂM TRA: NẾU LÀ BẢN V8 CŨ ---
        else {
            danhSachDeIframe = iframeWindow.eval("typeof danhSachDeThi !== 'undefined' ? danhSachDeThi : []");
            if (!danhSachDeIframe || danhSachDeIframe.length === 0) {
                return alert("⚠️ Iframe trống! Bạn hãy tải file Word, cài đặt thông số và bấm 'Quét & Trộn' trước.");
            }
            danhSachDeIframe = JSON.parse(JSON.stringify(danhSachDeIframe));
            danhSachDeIframe.forEach(q => q.MaPhong = maPhong);
        }

        // ĐẨY LÊN SUPABASE
        let oldText = btnElement.innerText;
        btnElement.innerText = "⏳ ĐANG HÚT & ĐẨY LÊN SUPABASE...";
        btnElement.disabled = true;

        let result = await luuDeThiLenSupabase(danhSachDeIframe);
        
        btnElement.innerText = oldText;
        btnElement.disabled = false;

        if (result.status === 'success') {
            alert(`🎉 HOÀN TẤT! Đã bóc tách thành công ${danhSachDeIframe.length} câu hỏi và tống lên phòng [${maPhong}]. Học sinh có thể vào thi!`);
        } else {
            alert("❌ Lỗi máy chủ Supabase: " + result.message);
        }
    } catch (e) {
        btnElement.innerText = "🚀 Hút đề & Đẩy lên mạng";
        btnElement.disabled = false;
        console.error("Lỗi khi hút đề:", e);
        alert("❌ Lỗi kết nối hoặc cấu trúc Iframe không hợp lệ. Chi tiết: " + e.message);
    }
}
// ==========================================================

function safeTextForWord(htmlCode) { if(!htmlCode) return ""; let temp = document.createElement('div'); temp.innerHTML = htmlCode; let imgs = temp.querySelectorAll('img'); imgs.forEach(img => { if(img.parentElement && img.parentElement.getAttribute('align') === 'center') return; let div = document.createElement('div'); div.setAttribute('align', 'center'); div.style.marginTop = '6pt'; div.style.marginBottom = '6pt'; img.parentNode.insertBefore(div, img); div.appendChild(img); }); let tables = temp.querySelectorAll('table'); tables.forEach(tbl => { tbl.setAttribute('border', '1'); tbl.setAttribute('cellpadding', '5'); tbl.setAttribute('cellspacing', '0'); tbl.setAttribute('align', 'center'); tbl.style.borderCollapse = 'collapse'; tbl.style.width = '80%'; tbl.style.marginLeft = 'auto'; tbl.style.marginRight = 'auto'; tbl.style.marginTop = '6pt'; tbl.style.marginBottom = '6pt'; }); let out = temp.innerHTML; out = out.replace(/<br\s*\/?>/gi, '</p><p>'); out = out.replace(/<p>\s*<\/p>/gi, ''); return out.trim(); }
function getLayoutHtml(a, b, c, d) { let sa = safeTextForWord(a), sb = safeTextForWord(b), sc = safeTextForWord(c), sd = safeTextForWord(d); function calcLen(str) { let raw = str.replace(/<[^>]*>?/g, ''); return raw.length + (str.includes('<img') ? 40 : 0); } let maxLen = Math.max(calcLen(sa), calcLen(sb), calcLen(sc), calcLen(sd)); const tab = `<span style="mso-tab-count:1">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>`; if (maxLen > 35) { return `<p>A. ${sa}</p><p>B. ${sb}</p><p>C. ${sc}</p><p>D. ${sd}</p>`; } else if (maxLen > 14) { return `<p style="tab-stops:240.0pt;">A. ${sa}${tab}B. ${sb}</p><p style="tab-stops:240.0pt;">C. ${sc}${tab}D. ${sd}</p>`; } else { return `<p style="tab-stops:120.0pt 240.0pt 360.0pt;">A. ${sa}${tab}B. ${sb}${tab}C. ${sc}${tab}D. ${sd}</p>`; } }
function xuatBaoCaoWord() { if(danhSachDeThi.length === 0) return alert("Chưa có đề nào được trộn để xuất!"); let pcCoQuan = document.getElementById('pcCoQuan') ? document.getElementById('pcCoQuan').value.trim() : 'SỞ GD&ĐT ĐẮK LẮK'; let pcTruong = document.getElementById('pcTruong') ? document.getElementById('pcTruong').value.trim() : 'TRƯỜNG PTDTNT THPT ĐAM SAN'; let pcKyThi = document.getElementById('pcKyThi') ? document.getElementById('pcKyThi').value.trim() : 'KIỂM TRA GIỮA KỲ I NĂM HỌC 2025-2026'; let pcMon = document.getElementById('pcMon') ? document.getElementById('pcMon').value.trim() : 'Địa lí 12'; let pcThoiGian = document.getElementById('pcThoiGian') ? document.getElementById('pcThoiGian').value.trim() : '45 phút (Không kể thời gian phát đề)'; if (!pcCoQuan || pcCoQuan === "undefined") pcCoQuan = 'SỞ GD&ĐT ĐẮK LẮK'; if (!pcTruong || pcTruong === "undefined") pcTruong = 'TRƯỜNG PTDTNT THPT ĐAM SAN'; if (!pcKyThi || pcKyThi === "undefined") pcKyThi = 'KIỂM TRA GIỮA KỲ I NĂM HỌC 2025-2026'; if (!pcMon || pcMon === "undefined") pcMon = 'Địa lí 12'; if (!pcThoiGian || pcThoiGian === "undefined") pcThoiGian = '45 phút (Không kể thời gian phát đề)'; let maDes = [...new Set(danhSachDeThi.map(c => c.MaDe))]; if(maDes.length > 1) { alert(`Hệ thống đang xuất ${maDes.length + 1} file Word (Gồm Đề & Đáp Án).\nLưu ý: Nhớ bấm "Cho phép" (Allow) nếu trình duyệt hỏi tải nhiều tệp nhé!`); } maDes.forEach((md, index) => { setTimeout(() => { let content = `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas-microsoft.com/office/2004/12/omml" xmlns="http://www.w3.org/TR/REC-html40">\n                    <head><meta charset="utf-8"><title>Đề Thi Mã ${md}</title>\n                        <style>\n                            @page WordSection1 { size: 595.3pt 841.9pt; margin: 42.5pt 42.5pt 42.5pt 56.7pt; mso-header-margin: 35.4pt; mso-footer-margin: 35.4pt; mso-paper-source: 0; mso-footer: f1; }\n                            div.WordSection1 { page: WordSection1; }\n                            p { font-family: 'Times New Roman', serif; font-size: 12pt; text-align: justify; margin-top: 0pt; margin-bottom: 6pt; line-height: 100%; }\n                            h2, h3 { font-family: 'Times New Roman', serif; text-align: center; margin-top: 6pt; margin-bottom: 6pt; }\n                            h2 { font-size: 14pt; font-weight: bold; } h3 { font-size: 12pt; text-align: left; font-weight: bold; }\n                            p.MsoFooter, li.MsoFooter, div.MsoFooter { margin: 0; text-align: right; font-size: 11pt; }\n                            table { width: 100%; border-collapse: collapse; border: none; } td { vertical-align: top; padding: 0; }\n                        </style>\n                    </head><body><div class="WordSection1">\n                            <table style="width:100%; border:none; margin-bottom: 10px;"><tr><td style="width:35%; text-align:center;"><p style="font-size:12pt; margin:0; text-align:center; text-transform:uppercase;">${pcCoQuan}</p><p style="font-size:12pt; font-weight:bold; margin:0; text-align:center; text-transform:uppercase; text-decoration:underline;">${pcTruong}</p></td><td style="width:65%; text-align:center;"><p style="font-size:12pt; font-weight:bold; margin:0; text-align:center; text-transform:uppercase;">${pcKyThi}</p><p style="font-size:12pt; margin:0; text-align:center;">Môn: ${pcMon}</p><p style="font-size:12pt; margin:0; text-align:center;">Thời gian làm bài: ${pcThoiGian}</p></td></tr></table><hr style="margin-bottom: 10px; margin-top: 10px;"/>\n                            <p style="text-align:center; font-weight:bold; font-size:14pt; margin-top:0;">MÃ ĐỀ THI: ${md}</p><p style="font-style: italic; text-align:center; margin-bottom:15px;">Họ tên học sinh: .............................................................. Lớp: ....................</p>\n                    `; let cauHois = danhSachDeThi.filter(c => c.MaDe === md); let p1 = cauHois.filter(c => String(c.Phan).trim() === "1"); let p2 = cauHois.filter(c => String(c.Phan).trim() === "2"); let p3 = cauHois.filter(c => String(c.Phan).trim() === "3"); if(p1.length > 0) { content += `<h3>PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn</h3>`; p1.forEach(c => { let num = String(c.CauSo).split('_')[1]; content += `<p><b>Câu ${num}:</b> ${safeTextForWord(c.NoiDung)}</p>`; content += getLayoutHtml(c.DapAnA, c.DapAnB, c.DapAnC, c.DapAnD); }); } if(p2.length > 0) { content += `<h3>PHẦN II. Câu trắc nghiệm đúng sai</h3>`; p2.forEach(c => { let num = String(c.CauSo).split('_')[1]; content += `<p><b>Câu ${num}:</b> ${safeTextForWord(c.NoiDung)}</p>`; content += `<p style="margin-left: 36.0pt;">a) ${safeTextForWord(c.DapAnA)}</p><p style="margin-left: 36.0pt;">b) ${safeTextForWord(c.DapAnB)}</p><p style="margin-left: 36.0pt;">c) ${safeTextForWord(c.DapAnC)}</p><p style="margin-left: 36.0pt;">d) ${safeTextForWord(c.DapAnD)}</p>`; }); } if(p3.length > 0) { content += `<h3>PHẦN III. Câu trắc nghiệm trả lời ngắn</h3>`; p3.forEach(c => { let num = String(c.CauSo).split('_')[1]; content += `<p><b>Câu ${num}:</b> ${safeTextForWord(c.NoiDung)}</p>`; }); } content += `<p style="text-align:center; font-weight:bold; font-size:12pt; margin-top:20pt; margin-bottom:6pt;">----------HẾT---------</p><p style="text-align:center; font-style:italic; font-size:12pt; margin-top:0pt;">Học sinh không được sử dụng tài liệu khi làm bài.</p>\n                        </div> \n                        <div style="mso-element:footer" id="f1"><p class="MsoFooter" style="text-align:right; font-size:11pt; margin:0;">Mã đề ${md} - Trang <span style='mso-field-code:" PAGE "'></span>/<span style='mso-field-code:" NUMPAGES "'></span></p></div>\n                    </body></html>`; var blob = new Blob(['\ufeff', content], { type: 'application/msword' }); var url = URL.createObjectURL(blob); var link = document.createElement('a'); link.href = url; link.download = `DeThi_MaDe_${md}.doc`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); }, index * 800); }); setTimeout(() => { xuatDapAnWord(pcCoQuan, pcTruong, pcKyThi, pcMon, maDes); }, maDes.length * 800); }
function xuatDapAnWord(pcCoQuan, pcTruong, pcKyThi, pcMon, maDes) { let content = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">\n            <head><meta charset="utf-8"><title>Đáp Án Các Mã Đề</title>\n            <style>\n                @page WordSection1 { size: 595.3pt 841.9pt; margin: 42.5pt 42.5pt 42.5pt 56.7pt; } div.WordSection1 { page: WordSection1; }\n                @page { mso-page-border-surround-header: no; mso-page-border-surround-footer: no; }\n                p { font-family: 'Times New Roman', serif; font-size: 12pt; margin-top: 0pt; margin-bottom: 6pt; line-height: 100%; }\n                table.dapan-table { border-collapse: collapse; margin-bottom: 20px; text-align: center; } table.dapan-table th, table.dapan-table td { border: 1px solid black; padding: 5px; font-family: 'Times New Roman', serif; font-size: 12pt; } table.dapan-table th { background-color: #f2f2f2; font-weight: bold;}\n            </style></head><body><div class="WordSection1">`; content += `<table style="width:100%; border:none; margin-bottom: 20px;"><tr><td style="width:40%; text-align:center; border:none;"><p style="font-size:12pt; margin:0; text-transform:uppercase;">${pcCoQuan}</p><p style="font-size:12pt; font-weight:bold; margin:0; text-transform:uppercase; text-decoration:underline;">${pcTruong}</p></td><td style="width:60%; text-align:center; border:none;"><p style="font-size:14pt; font-weight:bold; margin:0; text-transform:uppercase;">ĐÁP ÁN CHÍNH THỨC</p><p style="font-size:12pt; margin:0;">${pcKyThi}</p><p style="font-size:12pt; margin:0;">Môn: ${pcMon}</p></td></tr></table><hr style="margin-bottom: 20px;"/>`; maDes.forEach(md => { content += `<h3 style="font-family: 'Times New Roman', serif; font-weight: bold; font-size: 13pt; text-align: center; margin-top: 25pt; margin-bottom: 10pt; color: #c0392b;">--- ĐÁP ÁN MÃ ĐỀ: ${md} ---</h3>`; let cauHois = danhSachDeThi.filter(c => c.MaDe === md); let p1 = cauHois.filter(c => String(c.Phan).trim() === "1"); let p2 = cauHois.filter(c => String(c.Phan).trim() === "2"); let p3 = cauHois.filter(c => String(c.Phan).trim() === "3"); if(p1.length > 0) { content += `<p style="font-weight:bold; font-size: 11pt;">PHẦN I. TRẮC NGHIỆM LỰA CHỌN</p>`; for (let k = 0; k < p1.length; k += 20) { let chunk = p1.slice(k, k + 20); content += `<table class="dapan-table" border="1" align="center" style="width:100%; border-collapse:collapse; text-align:center; margin-bottom:10px;"><tr>`; for(let i=0; i<chunk.length; i++) { content += `<th style="background-color:#f2f2f2; padding:5px;">${k + i + 1}</th>`; } content += `</tr><tr>`; for(let i=0; i<chunk.length; i++) { content += `<td style="padding:5px;"><b>${chunk[i].DapAnDung}</b></td>`; } content += `</tr></table>`; } } if(p2.length > 0) { content += `<p style="font-weight:bold; font-size: 11pt; margin-top:15px;">PHẦN II. TRẮC NGHIỆM ĐÚNG/SAI</p>`; content += `<table class="dapan-table" border="1" align="center" style="width:50%; border-collapse:collapse; text-align:center; margin-left:auto; margin-right:auto;"><tr><th style="background-color:#f2f2f2; padding:5px;">Câu</th><th style="background-color:#f2f2f2; padding:5px;">Ý a</th><th style="background-color:#f2f2f2; padding:5px;">Ý b</th><th style="background-color:#f2f2f2; padding:5px;">Ý c</th><th style="background-color:#f2f2f2; padding:5px;">Ý d</th></tr>`; p2.forEach((c, i) => { let ans = c.DapAnDung.split('-'); content += `<tr><td style="padding:5px;"><b>${i+1}</b></td><td style="padding:5px;">${ans[0]||''}</td><td style="padding:5px;">${ans[1]||''}</td><td style="padding:5px;">${ans[2]||''}</td><td style="padding:5px;">${ans[3]||''}</td></tr>`; }); content += `</table>`; } if(p3.length > 0) { content += `<p style="font-weight:bold; font-size: 11pt; margin-top:15px;">PHẦN III. TRẢ LỜI NGẮN</p>`; for (let k = 0; k < p3.length; k += 10) { let chunk = p3.slice(k, k + 10); content += `<table class="dapan-table" border="1" align="center" style="width:100%; border-collapse:collapse; text-align:center; margin-bottom:10px;"><tr>`; for(let i=0; i<chunk.length; i++) { content += `<th style="background-color:#f2f2f2; padding:5px;">${k + i + 1}</th>`; } content += `</tr><tr>`; for(let i=0; i<chunk.length; i++) { let ans = String(chunk[i].DapAnDung).replace(/'/g, ''); content += `<td style="padding:5px;"><b>${ans}</b></td>`; } content += `</tr></table>`; } } }); content += `</div></body></html>`; var blob = new Blob(['\ufeff', content], { type: 'application/msword' }); var url = URL.createObjectURL(blob); var link = document.createElement('a'); link.href = url; link.download = `DapAn_CacMaDe.doc`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); }

async function generateFromMatrix() { 
    if(!checkWorkspaceAction()) return;
    const rows = document.querySelectorAll("#matrixBody tr"); if(rows.length === 0) return alert("Vui lòng thêm dòng ma trận!"); const maPhong = document.getElementById("maPhongMatrix").value.trim(); if(!maPhong) return alert("Vui lòng nhập Mã Phòng Thi!"); const soLuongDe = parseInt(document.getElementById("soLuongDeMatrix").value) || 1; const startCode = parseInt(document.getElementById("startCodeMatrix").value) || 101; const stepCode = parseInt(document.getElementById("stepCodeMatrix").value) || 1; let maTran = []; let tongCauYeuCau = 0; rows.forEach(tr => { const baiHoc = tr.querySelector(".mat-baihoc").value; if(!baiHoc) return; const fields = [{p:"1",m:"NB",c:".mat-p1-nb"},{p:"1",m:"TH",c:".mat-p1-th"},{p:"1",m:"VD",c:".mat-p1-vd"},{p:"2",m:"NB",c:".mat-p2-nb"},{p:"2",m:"TH",c:".mat-p2-th"},{p:"2",m:"VD",c:".mat-p2-vd"},{p:"3",m:"NB",c:".mat-p3-nb"},{p:"3",m:"TH",c:".mat-p3-th"},{p:"3",m:"VD",c:".mat-p3-vd"}]; fields.forEach(f => { let sl = parseInt(tr.querySelector(f.c).value) || 0; if(sl > 0) { maTran.push({ baiHoc: baiHoc, phan: f.p, mucDo: f.m, soLuong: sl }); tongCauYeuCau += sl; } }); }); if(maTran.length === 0) return alert("Vui lòng nhập số lượng!"); if(!confirm(`Xác nhận bốc tổng cộng: ${tongCauYeuCau} câu hỏi?`)) return; const btn = document.getElementById("btnMatrix"); btn.disabled = true; btn.innerText = "⏳ Đang lặn vào Ngân Hàng Supabase..."; 
    try {
        let result = [];
        let query = sb.from('ngan_hang').select('*').eq('truong_id', gvData.truong_id);
        if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
        let {data: bank} = await query;
        
        maTran.forEach(mt => {
            let match = bank.filter(q => q.bai_hoc == mt.baiHoc && q.phan == mt.phan && q.muc_do == mt.mucDo);
            let mapped = match.map(q => ({ CauSo: "", Phan: q.phan, MucDo: q.muc_do, NoiDung: q.noi_dung, DapAnA: q.a, DapAnB: q.b, DapAnC: q.c, DapAnD: q.d, DapAnDung: q.dap_an_dung, LoiGiai: q.loi_giai }));
            shuffleArray(mapped); result = result.concat(mapped.slice(0, mt.soLuong));
        });
        
        if(result.length === 0) { btn.disabled = false; btn.innerText = "🚀 BỐC CÂU HỎI & ĐẨY VÀO PHÒNG"; return alert("Lỗi: Ngân hàng trống cho điều kiện này!"); } 
        if(result.length < tongCauYeuCau) alert(`⚠️ CẢNH BÁO TỪ KHO: Hiện chỉ có ${result.length}/${tongCauYeuCau} câu thỏa mãn. Máy sẽ trộn số lượng tối đa.`); 
        generateExams(result, soLuongDe, maPhong, startCode, stepCode); 
        
        await luuDeThiLenSupabase(danhSachDeThi);
        btn.disabled = false; btn.innerText = "🚀 BỐC CÂU HỎI & ĐẨY VÀO PHÒNG"; document.getElementById("logMatrix").innerText = `🎉 ĐÃ XONG!`; document.getElementById("btnXuatWordMatrix").style.display = "block"; 
    } catch(e) { btn.disabled = false; btn.innerText = "🚀 BỐC CÂU HỎI & ĐẨY VÀO PHÒNG"; alert("Lỗi mạng Supabase!"); }
}

async function loadBankMeta(forceReload = false) { 
    let query = sb.from('ngan_hang').select('bai_hoc').eq('truong_id', gvData.truong_id);
    if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
    let {data} = await query;
    if(data) {
        let uniqueBaiHoc = [...new Set(data.map(d=>d.bai_hoc))];
        processBankMeta({baiHocs: uniqueBaiHoc});
    }
}
function processBankMeta(data) {
    availableBaiHocs = data.baiHocs || []; 
    if(document.getElementById("matrixBody").children.length === 0) addMatrixRow(); 
    let opts = '<option value="">Tất cả</option>'; 
    availableBaiHocs.forEach(b => opts += `<option value="${b}">${b}</option>`); 
    document.getElementById("filterBaiHoc").innerHTML = opts;
}

function addMatrixRow() { const tbody = document.getElementById("matrixBody"); const tr = document.createElement("tr"); let optionsHtml = '<option value="">-- Chọn bài --</option>'; availableBaiHocs.forEach(b => optionsHtml += `<option value="${b}">${b}</option>`); tr.innerHTML = `<td><select class="mat-baihoc" style="width:100%; padding:5px;">${optionsHtml}</select></td><td style="background:#e8f5e9;"><input type="number" class="mat-p1-nb" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e8f5e9;"><input type="number" class="mat-p1-th" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e8f5e9;"><input type="number" class="mat-p1-vd" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e2eef9;"><input type="number" class="mat-p2-nb" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e2eef9;"><input type="number" class="mat-p2-th" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#e2eef9;"><input type="number" class="mat-p2-vd" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#fbe6e8;"><input type="number" class="mat-p3-nb" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#fbe6e8;"><input type="number" class="mat-p3-th" min="0" value="0" style="width:35px; padding:5px;"></td><td style="background:#fbe6e8;"><input type="number" class="mat-p3-vd" min="0" value="0" style="width:35px; padding:5px;"></td><td><button style="background:#e74c3c; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;" onclick="this.parentElement.parentElement.remove()">Xóa</button></td>`; tbody.appendChild(tr); }

async function fetchFullBank(forceReload = false) { 
    document.getElementById("bankTableBody").innerHTML = '<tr><td colspan="7">⏳ Đang tải kho dữ liệu từ Supabase...</td></tr>'; 
    let query = sb.from('ngan_hang').select('*').eq('truong_id', gvData.truong_id);
    if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
    let {data} = await query;
    if(data) {
        fullBankData = data.map(q => ({ id: q.id, baiHoc: q.bai_hoc, phan: q.phan, mucDo: q.muc_do, noiDung: q.noi_dung, A: q.a, B: q.b, C: q.c, D: q.d, dapAnDung: q.dap_an_dung, LoiGiai: q.loi_giai }));
        renderBankTable(); 
    }
}

function renderBankTable() { const fBaiHoc = document.getElementById("filterBaiHoc").value; const fPhan = document.getElementById("filterPhan").value; const fMucDo = document.getElementById("filterMucDo").value; let filtered = fullBankData.filter(q => { if(fBaiHoc && q.baiHoc !== fBaiHoc) return false; if(fPhan && String(q.phan) !== fPhan) return false; if(fMucDo && q.mucDo !== fMucDo) return false; return true; }); let html = ""; if(filtered.length === 0) html = '<tr><td colspan="7">Trống. Không có dữ liệu khớp bộ lọc.</td></tr>'; else { filtered.forEach(q => { let snippet = q.noiDung.replace(/<[^>]+>/g, ' ').substring(0, 80) + "..."; html += `<tr><td><input type="checkbox" class="chk-Bank" value="${q.id}"></td><td style="font-size:11px; color:#7f8c8d;">${String(q.id).split('-')[0]}</td><td><b>${q.baiHoc}</b></td><td>P.${q.phan}</td><td><b>${q.mucDo}</b></td><td style="text-align:left;">${snippet}</td><td><button style="background:#f39c12; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-bottom:5px; width:100%;" onclick="editBankQuestion('${q.id}')">Sửa</button><br><button style="background:#c0392b; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; width:100%;" onclick="deleteBankQuestion('${q.id}', this)">Xóa</button></td></tr>`; }); } document.getElementById("bankTableBody").innerHTML = html; }

async function deleteBankQuestion(id, btnElement) { 
    if(!confirm("Xóa câu này khỏi ngân hàng đề thi? Hành động này không thể hoàn tác!")) return; 
    let oldText = btnElement.innerText; btnElement.innerText = "⏳ Đang xóa..."; btnElement.disabled = true; btnElement.style.background = "#95a5a6";
    let {error} = await sb.from('ngan_hang').delete().eq('id', id);
    if(!error) fetchFullBank(true); 
    else { alert("Lỗi Supabase"); btnElement.innerText = oldText; btnElement.disabled = false; btnElement.style.background = "#c0392b"; }
}

async function editBankQuestion(id) { 
    let q = fullBankData.find(x => String(x.id).trim() === String(id).trim()); 
    if(!q) { alert("⛔ Không tìm thấy dữ liệu gốc!"); return; } 
    document.getElementById("editID").value = q.id; document.getElementById("editBaiHoc").value = q.baiHoc; document.getElementById("editPhan").value = String(q.phan); document.getElementById("editMucDo").value = q.mucDo; document.getElementById("editNoiDung").innerHTML = q.noiDung; document.getElementById("editA").value = q.A; document.getElementById("editB").value = q.B; document.getElementById("editC").value = q.C; document.getElementById("editD").value = q.D; 
    let dapAnHienThi = String(q.dapAnDung); if (dapAnHienThi.startsWith("'")) dapAnHienThi = dapAnHienThi.substring(1); 
    document.getElementById("editDapAnDung").value = dapAnHienThi; document.getElementById("editModal").style.display = "flex"; 
}

async function saveEditedQuestion() { 
    let btn = document.querySelector("#editModal button");
    let phan = document.getElementById("editPhan").value; let dapAn = safeHTML(document.getElementById("editDapAnDung").value.trim().toUpperCase()); 
    if (phan === "3" && !dapAn.startsWith("'")) { dapAn = "'" + dapAn; } 
    btn.innerText = "⏳ ĐANG LƯU..."; btn.disabled = true; btn.style.background = "#95a5a6";
    
    let updateData = { bai_hoc: safeHTML(document.getElementById("editBaiHoc").value.trim()), phan: phan, muc_do: document.getElementById("editMucDo").value, noi_dung: safeHTML(document.getElementById("editNoiDung").innerHTML), a: safeHTML(document.getElementById("editA").value), b: safeHTML(document.getElementById("editB").value), c: safeHTML(document.getElementById("editC").value), d: safeHTML(document.getElementById("editD").value), dap_an_dung: dapAn };
    let {error} = await sb.from('ngan_hang').update(updateData).eq('id', document.getElementById("editID").value);

    btn.innerText = "💾 Lưu Thay Đổi"; btn.disabled = false; btn.style.background = "#1a73e8";
    if(!error) { document.getElementById("editModal").style.display = "none"; fetchFullBank(true); loadBankMeta(true); } else alert("Lỗi lưu DB");
}

async function loadMetaData() { 
    let {data} = await sb.from('hoc_sinh').select('lop').eq('truong_id', gvData.truong_id);
    let sel = document.getElementById('ctrlDoiTuong'); let html = '<option value="TatCa">🌎 Tất cả (Mặc định)</option>'; 
    if(data) {
        let lops = [...new Set(data.map(d=>d.lop))].filter(Boolean).sort();
        g_danhSachLopCache = lops; 
        lops.forEach(l => { if(l) html += `<option value="${l}">🏷️ Đối tượng: ${l}</option>`; }); 
        if(sel) sel.innerHTML = html;
        if(allRoomsData && allRoomsData.length > 0) fetchRadar(); 
    }
}

async function dieuKhien(trangThai) { 
    const maPhong = document.getElementById('ctrlMaPhong').value.trim(); const doiTuong = document.getElementById('ctrlDoiTuong').value; const tenDot = document.getElementById('ctrlTenDot').value.trim(); const tg = document.getElementById('ctrlThoiGian').value; 
    if(!maPhong) return alert("Vui lòng nhập mã phòng!"); 
    document.getElementById('ctrlLog').innerText = "⏳ Đang truyền lệnh..."; 
    
    let updateData = { trang_thai: trangThai, doi_tuong: doiTuong, ten_dot: tenDot, thoi_gian: tg };
    if(trangThai === 'MO_PHONG') updateData.thoi_gian_mo = Date.now();
    
    let phong_id = await getOrCreateRoom(maPhong);
    let {error} = await sb.from('phong_thi').update(updateData).eq('id', phong_id);
    
    if(!error) { document.getElementById('ctrlLog').innerText = `✅ THÀNH CÔNG!`; fetchRadar(); } 
    else document.getElementById('ctrlLog').innerText = `❌ Lỗi kết nối`;
}

async function dieuKhienFast(maPhong, trangThai) { 
    let {data} = await sb.from('phong_thi').select('id').eq('ma_phong', maPhong).eq('truong_id', gvData.truong_id).single();
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
        await sb.from('phong_thi').update(updateData).eq('id', data.id); 
        fetchRadar(); 
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

async function capNhatNhanhPhong(roomId, field, value) {
    let updateData = {}; updateData[field] = value;
    await sb.from('phong_thi').update(updateData).eq('id', roomId);
}

async function fetchRadar() { 
    let query = sb.from('phong_thi').select('*').eq('truong_id', gvData.truong_id);
    if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
    let {data} = await query;
    
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
            else if(r.TrangThai === "CONG_BO_DIEM") sttHtml = "<span style='color:#3498db;font-weight:bold;'>📊 Công bố Điểm</span>"; 
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

            html += `<tr><td>${idCell}</td><td style="color:#1a73e8;font-weight:bold;">${r.TenDotKiemTra||"-"}</td><td>${doiTuongCell}</td><td>${r.ThoiGian||45}p</td><td>${sttHtml}</td><td>${btnHtml} ${btnXoaDe} ${btnXoa}</td></tr>`; 
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
        let promises = [];
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

        await Promise.all(promises);

        logSpan.innerText = "✅ Cập nhật thành công toàn bộ!";
        setTimeout(() => logSpan.innerText = "", 3000);
        
        fetchRadar(); 

    } catch(e) {
        logSpan.innerText = "❌ Lỗi thực thi!";
        alert("Lỗi kết nối khi cập nhật đồng loạt: " + e.message);
    }
}

async function fetchDashboard(isAuto = false) { 
    const sInput = document.getElementById('liveSearchInput');
    if (sInput && !isAuto) sInput.value = ''; 

    const maPhong = document.getElementById('dashMaPhong').value.trim();
    if(!maPhong) return;
    if(!isAuto) document.getElementById('dashBody').innerHTML = '<tr><td colspan="9">⏳ Đang tải dữ liệu...</td></tr>';
    
    let currentRoom = allRoomsData.find(r => r.MaPhong === maPhong);
    if(!currentRoom) return;

    let [resKQ, resHS] = await Promise.all([
        sb.from('ket_qua').select('*, hoc_sinh(ma_hs, ho_ten, lop)').eq('phong_id', currentRoom.id),
        sb.from('hoc_sinh').select('*').eq('truong_id', gvData.truong_id)
    ]);

    duLieuBangDiem = (resKQ.data || []).map(r => ({ 
        MaHS: r.hoc_sinh ? r.hoc_sinh.ma_hs : 'Lỗi/Xóa', 
        HoTen: r.hoc_sinh ? r.hoc_sinh.ho_ten : 'Không rõ', 
        Lop: r.hoc_sinh ? r.hoc_sinh.lop : '', 
        MaDe: r.ma_de, 
        Diem: r.diem, 
        ChiTiet: typeof r.chi_tiet === 'string' ? r.chi_tiet : JSON.stringify(r.chi_tiet), 
        ThoiGian: r.created_at 
    }));

    allStudents = (resHS.data || []).map(d => ({ MaHS: d.ma_hs, HoTen: d.ho_ten, Lop: d.lop, TrangThai: d.mat_khau==='123456'||d.mat_khau===DEFAULT_PASS_HASH?'MacDinh':'DaDoi', Quyen: d.quyen, id: d.id }));
    
    renderDashboardSubTabs(); renderDashboardTable(); 
}

function renderDashboardSubTabs() { let groups = new Set(); duLieuBangDiem.forEach(hs => { if(hs.Lop) groups.add(hs.Lop); }); let html = `<button class="${currentDashFilter==='TatCa'?'active':''}" onclick="filterDashboard('TatCa')">Tất cả</button>`; groups.forEach(g => { html += `<button class="${currentDashFilter===g?'active':''}" onclick="filterDashboard('${g}')">${g}</button>`; }); document.getElementById('subTabsDashboard').innerHTML = html; }
function filterDashboard(filter) { currentDashFilter = filter; renderDashboardTable(); }

function renderDashboardTable() { 
    let statBox = document.getElementById("analyticDashboard"); 
    const maPhong = document.getElementById('dashMaPhong').value.trim(); 
    let currentRoom = allRoomsData.find(r => String(r.MaPhong).trim() === maPhong); 
    
    if(duLieuBangDiem.length === 0) { 
        if(statBox) statBox.style.display = "none"; 
        document.getElementById('dashBody').innerHTML = '<tr><td colspan="9">Chưa có dữ liệu bài làm nào trong phòng này.</td></tr>'; 
        return; 
    } 

    let defaultLop = currentRoom && currentRoom.DoiTuong !== "TatCa" ? currentRoom.DoiTuong : null; let displayList = []; let targetLop = currentDashFilter !== 'TatCa' ? currentDashFilter : defaultLop; 
    
    if (targetLop && targetLop !== "TatCa") { 
        let allowedClasses = targetLop.split(',').map(s => s.trim());
        let classStudents = allStudents.filter(s => allowedClasses.includes(String(s.Lop).trim())); 
        classStudents.forEach(stu => { 
            let result = duLieuBangDiem.find(r => String(r.MaHS).trim() === String(stu.MaHS).trim()); 
            if (result) displayList.push({...result, MaHS: stu.MaHS}); 
            else displayList.push({ MaHS: stu.MaHS, HoTen: stu.HoTen, Lop: stu.Lop, TrangThai: "Chưa vào", MaDe: "-", Diem: "-", ThoiGian: null, ChiTiet: null }); 
        }); 
        duLieuBangDiem.forEach(r => { if(!displayList.find(d => String(d.MaHS).trim() === String(r.MaHS).trim())) { let stu = allStudents.find(s => String(s.MaHS).trim() === String(r.MaHS).trim()); displayList.push({...r, MaHS: stu ? stu.MaHS : r.MaHS}); } }); 
    } else { 
        duLieuBangDiem.forEach(r => { let stu = allStudents.find(s => String(s.MaHS).trim() === String(r.MaHS).trim()); displayList.push({...r, MaHS: stu ? stu.MaHS : r.MaHS}); }); 
    } 
    if(currentDashFilter !== 'TatCa') { 
        let allowedClasses = currentDashFilter.split(',').map(s => s.trim());
        displayList = displayList.filter(d => allowedClasses.includes(String(d.Lop).trim())); 
    } 
    
    if(displayList.length === 0) { if(statBox) statBox.style.display = "none"; document.getElementById('dashBody').innerHTML = '<tr><td colspan="9">Chưa có dữ liệu.</td></tr>'; return; } 
    
    if(statBox) statBox.style.display = "block"; 
    let sum = 0, passed = 0, submittedCount = 0; 
    let failCount = {}; let html = ""; 
    
    let countGioi = 0, countKha = 0, countTB = 0, countYeu = 0;

    displayList.sort((a, b) => (String(a.MaHS) || '').localeCompare(String(b.MaHS) || '')); 

    const sInput = document.getElementById("liveSearchInput");
    const filter = sInput ? sInput.value.toUpperCase() : "";

    displayList.forEach(hs => { 
        hs.p1Score = 0; hs.p2Score = 0; hs.p3Score = 0; 
        if(hs.ChiTiet && hs.Diem !== "-") { 
            try { 
                let ct = JSON.parse(hs.ChiTiet); 
                Object.keys(ct).forEach(k => { 
                    let item = ct[k]; let isDung = false; 
                    if(item.phan==="1") { 
                        let cVal = String(item.chon||"").toUpperCase().trim();
                        let dVal = String(item.dung||"").toUpperCase().trim();
                        isDung = (cVal === dVal); 
                        if(isDung) hs.p1Score += 0.25; 
                    } 
                    else if(item.phan==="2") { 
                        let cArr = (item.chon||"").split('-'); 
                        let dStr = String(item.dung||"").toUpperCase().replace(/[ÐD]/g, 'Đ');
                        let dArr = dStr.match(/[ĐS]/g) || [];
                        let match = 0; 
                        for(let i=0; i<4; i++) { 
                            let cVal = String(cArr[i] || "").toUpperCase().replace(/[ÐD]/g, 'Đ').replace(/[^ĐS]/g, '');
                            let dVal = dArr[i] || "";
                            if(cVal !== "" && cVal === dVal) match++; 
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
                    if(!isDung) { failCount[k] = (failCount[k]||0) + 1; failCount[k+"_txt"] = ct[k].noiDungCau; } 
                }); 
            } catch(e){} 
        } 

        hs.p1Score = parseFloat(hs.p1Score).toFixed(2);
        hs.p2Score = parseFloat(hs.p2Score).toFixed(2);
        hs.p3Score = parseFloat(hs.p3Score).toFixed(2);

        let isSubmitted = hs.Diem !== "-"; 
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

        if (filter === "" || txtSBD.indexOf(filter) > -1 || txtTen.indexOf(filter) > -1) {
            html += `<tr style="${trStyle}"><td><b>${hs.MaHS || '-'}</b></td><td style="text-align:left;"><b>${hs.HoTen}</b></td><td>${hs.Lop}</td><td>${sttHtml}</td><td>${hs.MaDe || '-'}</td><td>${scoreHtml}</td><td>${isSubmitted ? parseFloat(hs.p1Score) : '-'}</td><td>${isSubmitted ? parseFloat(hs.p2Score) : '-'}</td><td>${isSubmitted ? parseFloat(hs.p3Score) : '-'}</td></tr>`; 
        }
    }); 
    
    if(document.getElementById("statSiSo")) document.getElementById("statSiSo").innerText = `${submittedCount} / ${displayList.length}`; 
    if(document.getElementById("statAvg")) document.getElementById("statAvg").innerText = submittedCount > 0 ? (sum/submittedCount).toFixed(2) : "0.0"; 
    if(document.getElementById("statPass")) document.getElementById("statPass").innerText = submittedCount > 0 ? Math.round((passed/submittedCount)*100) + "%" : "0%"; 
    if(document.getElementById("statPassDetail")) document.getElementById("statPassDetail").innerText = `${passed} học sinh đạt từ 5.0 trở lên`; 

    if(document.getElementById("distGioi")) document.getElementById("distGioi").innerText = countGioi;
    if(document.getElementById("distKha")) document.getElementById("distKha").innerText = countKha;
    if(document.getElementById("distTB")) document.getElementById("distTB").innerText = countTB;
    if(document.getElementById("distYeu")) document.getElementById("distYeu").innerText = countYeu;
    
    let maxFail = 0; let killerQ = "Chưa có dữ liệu"; 
    Object.keys(failCount).forEach(k => { if(!k.includes("_txt") && failCount[k] > maxFail) { maxFail = failCount[k]; killerQ = failCount[k+"_txt"]; } }); 
    if(document.getElementById("statKiller")) {
        if(maxFail > 0) document.getElementById("statKiller").innerHTML = `Có <b>${maxFail} học sinh</b> làm sai câu hỏi sau:<br/> <span style="font-style:italic; font-weight:normal; color:#555;">"${(killerQ || "").substring(0, 90)}..."</span>`; 
        else document.getElementById("statKiller").innerHTML = `Đang thu thập dữ liệu...`;
    }
    
    document.getElementById('dashBody').innerHTML = html || '<tr><td colspan="9">Không tìm thấy kết quả phù hợp bộ lọc tìm kiếm.</td></tr>'; 
}

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
    
    let exportData = []; let maPhong = document.getElementById('dashMaPhong').value.trim(); 
    let currentRoom = allRoomsData.find(r => String(r.MaPhong).trim() === maPhong); 
    let defaultLop = currentRoom && currentRoom.DoiTuong !== "TatCa" ? currentRoom.DoiTuong : null; 
    let targetLop = currentDashFilter !== 'TatCa' ? currentDashFilter : defaultLop; 

    if (targetLop && targetLop !== "TatCa") { 
        let allowedClasses = targetLop.split(',').map(s => s.trim());
        let classStudents = allStudents.filter(s => allowedClasses.includes(String(s.Lop).trim())); 
        classStudents.forEach(stu => { 
            let result = duLieuBangDiem.find(r => String(r.MaHS).trim() === String(stu.MaHS).trim()); 
            if (result) exportData.push({...result, MaHS: stu.MaHS}); 
            else exportData.push({ MaHS: stu.MaHS, HoTen: stu.HoTen, Lop: stu.Lop, TrangThai: "Chưa vào", MaDe: "-", Diem: "-", ThoiGian: null, ChiTiet: null }); 
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
    worksheet.columns = [ { header: 'STT', key: 'stt', width: 6 }, { header: 'SBD', key: 'sbd', width: 12 }, { header: 'Họ và Tên', key: 'name', width: 30 }, { header: 'Lớp', key: 'lop', width: 10 }, { header: 'Mã Đề', key: 'made', width: 10 }, { header: 'Tổng Điểm', key: 'total', width: 12 }, { header: 'Điểm P. I', key: 'p1', width: 12 }, { header: 'Điểm P. II', key: 'p2', width: 12 }, { header: 'Điểm P. III', key: 'p3', width: 12 }, { header: 'Thời gian nộp', key: 'time', width: 22 } ]; 
    
    let belowAvg = 0; let maxScore = -1; let minScore = 11; 
    exportData.sort((a,b) => (String(a.MaHS)||'').localeCompare(String(b.MaHS)||'')); 
    
    exportData.forEach((hs, idx) => { 
        let p1 = 0, p2 = 0, p3 = 0; 
        if(hs.ChiTiet && hs.Diem !== "-") { 
            try { 
                let ct = JSON.parse(hs.ChiTiet); 
                Object.keys(ct).forEach(k => { 
                    let item = ct[k]; 
                    if(item.phan === "1" && String(item.chon||"").toUpperCase().trim() === String(item.dung||"").toUpperCase().trim()) p1 += 0.25; 
                    if(item.phan === "2") { 
                        let cArr = (item.chon||"").split('-'); 
                        let dStr = String(item.dung||"").toUpperCase().replace(/[ÐD]/g, 'Đ');
                        let dArr = dStr.match(/[ĐS]/g) || [];
                        let match = 0; 
                        for(let i=0; i<4; i++) { 
                            let cVal = String(cArr[i] || "").toUpperCase().replace(/[ÐD]/g, 'Đ').replace(/[^ĐS]/g, '');
                            let dVal = dArr[i] || "";
                            if(cVal !== "" && cVal === dVal) match++; 
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
        worksheet.addRow({ stt: idx + 1, sbd: hs.MaHS, name: hs.HoTen, lop: hs.Lop, made: hs.MaDe || "-", total: total, p1: hs.Diem!=="-" ? parseFloat(p1.toFixed(2)) : "-", p2: hs.Diem!=="-" ? parseFloat(p2.toFixed(2)) : "-", p3: hs.Diem!=="-" ? parseFloat(p3.toFixed(2)) : "-", time: hs.ThoiGian ? new Date(hs.ThoiGian).toLocaleString('vi-VN') : "-" }); 
    }); 
    
    worksheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2980B9'} }; cell.alignment = { vertical: 'middle', horizontal: 'center' }; cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; }); 
    worksheet.eachRow((row, rowNumber) => { if(rowNumber > 1) { row.eachCell((cell, colNumber) => { cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; if(colNumber !== 3) cell.alignment = { vertical: 'middle', horizontal: 'center' }; }); let totalCell = row.getCell(6); if(totalCell.value !== null && totalCell.value !== "-" && totalCell.value < 5.0) { row.eachCell(cell => { cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFFADBD8'} }; cell.font = { color: { argb: 'FFC0392B' } }; }); } } }); 
    
    let rowCount = exportData.filter(d => d.Diem !== "-").length; worksheet.addRow([]); 
    let stRow1 = worksheet.addRow(['', '', 'THỐNG KÊ NHANH (Số HS đã nộp):']); stRow1.font = {bold: true}; 
    worksheet.addRow(['', '', 'Tổng số bài thi:', rowCount]); worksheet.addRow(['', '', 'Số bài dưới 5.0:', belowAvg]); worksheet.addRow(['', '', 'Điểm cao nhất:', maxScore === -1 ? 0 : maxScore]); worksheet.addRow(['', '', 'Điểm thấp nhất:', minScore === 11 ? 0 : minScore]); 
    
    let tenLopStr = currentDashFilter === "TatCa" ? "TatCa" : "TuyChon";
    let tenFile = `BangDiem_${maPhong}_${tenLopStr}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer(); 
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); 
    const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = tenFile; a.click(); window.URL.revokeObjectURL(url); 
}

async function fetchStudents(forceReload = false) { 
    document.getElementById('hsBody').innerHTML = '<tr><td colspan="6">⏳ Đang tải...</td></tr>'; 
    let cached = sessionStorage.getItem('cache_students');
    if (!forceReload && cached) {
        allStudents = JSON.parse(cached); renderSubTabsHS(); renderStudentTable(); 
        if(document.getElementById('tab3').classList.contains('active')) fetchDashboard(); return;
    }
    let {data} = await sb.from('hoc_sinh').select('*').eq('truong_id', gvData.truong_id);
    if(data) {
        allStudents = data.map(d => ({ MaHS: d.ma_hs, HoTen: d.ho_ten, Lop: d.lop, TrangThai: d.mat_khau==='123456'||d.mat_khau===DEFAULT_PASS_HASH?'MacDinh':'DaDoi', Quyen: d.quyen, id: d.id }));
        sessionStorage.setItem('cache_students', JSON.stringify(allStudents));
        renderSubTabsHS(); renderStudentTable(); 
        if(document.getElementById('tab3').classList.contains('active')) fetchDashboard(); 
    }
}

function renderSubTabsHS() { let groups = new Set(); allStudents.forEach(s => { if(s.Lop) groups.add(s.Lop); }); let html = `<button class="${currentStudentFilter==='TatCa'?'active':''}" onclick="filterStudents('TatCa')">Tất cả</button>`; groups.forEach(g => { html += `<button class="${currentStudentFilter===g?'active':''}" onclick="filterStudents('${g}')">${g}</button>`; }); document.getElementById('subTabsHS').innerHTML = html; }
function filterStudents(filter) { currentStudentFilter = filter; renderSubTabsHS(); renderStudentTable(); }

function renderStudentTable() { 
    let filtered = allStudents; 
    if(currentStudentFilter !== 'TatCa') { filtered = allStudents.filter(s => s.Lop === currentStudentFilter); } 
    let html = ""; 
    if(filtered.length === 0) html = '<tr><td colspan="6">Không có dữ liệu.</td></tr>'; 
    else { 
        filtered.forEach(hs => { 
            let statusHTML = hs.TrangThai === "DaDoi" ? `<span style="color:green;font-weight:bold;">Đã đổi</span>` : `<span style="color:red;">Mặc định</span>`; 
            html += `<tr><td><input type="checkbox" class="chk-HS" value="${hs.id}"></td><td><b>${hs.MaHS}</b></td><td>${hs.HoTen}</td><td>${hs.Lop}</td><td>${statusHTML}</td><td><button style="background:#e74c3c; padding:5px 10px; border:none; border-radius:4px; color:white; cursor:pointer;" onclick="resetPass('${hs.MaHS}', '${hs.id}', 'HS')">Khôi phục</button></td></tr>`; 
        }); 
    } 
    document.getElementById('hsBody').innerHTML = html; 
}

async function fetchTeachers(forceReload = false) { 
    document.getElementById('gvBody').innerHTML = '<tr><td colspan="5">⏳ Đang tải...</td></tr>'; 
    let cached = sessionStorage.getItem('cache_teachers');
    if (!forceReload && cached) {
        allTeachers = JSON.parse(cached); renderTeacherTable(); return;
    }
    let {data} = await sb.from('giao_vien').select('*').eq('truong_id', gvData.truong_id);
    if(data) {
        allTeachers = data.map(d => ({ MaGV: d.ma_gv, HoTen: d.ho_ten, TrangThai: d.mat_khau==='123456'||d.mat_khau===DEFAULT_PASS_HASH?'MacDinh':'DaDoi', Quyen: d.quyen, id: d.id }));
        sessionStorage.setItem('cache_teachers', JSON.stringify(allTeachers));
        renderTeacherTable();
    }
}

function renderTeacherTable() {
    let html = ""; 
    if(allTeachers.length === 0) html = '<tr><td colspan="5">Không có dữ liệu.</td></tr>'; 
    else { 
        allTeachers.forEach(gv => { 
            let statusHTML = gv.TrangThai === "DaDoi" ? `<span style="color:green;font-weight:bold;">Đã đổi</span>` : `<span style="color:red;">Mặc định</span>`; 
            html += `<tr><td><input type="checkbox" class="chk-GV" value="${gv.id}"></td><td><b>${gv.MaGV}</b></td><td>${gv.HoTen}</td><td>${statusHTML}</td><td><button style="background:#e74c3c; padding:5px 10px; border:none; border-radius:4px; color:white; cursor:pointer;" onclick="resetPass('${gv.MaGV}', '${gv.id}', 'GV')">Khôi phục</button></td></tr>`; 
        }); 
    } 
    document.getElementById('gvBody').innerHTML = html; 
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

async function resetPass(ma, uid, loai) { 
    if(!confirm(`Khôi phục mật khẩu mặc định (123456) cho tài khoản ${ma}?`)) return; 
    const table = loai === 'HS' ? 'hoc_sinh' : 'giao_vien';
    await sb.from(table).update({mat_khau: DEFAULT_PASS_HASH}).eq('id', uid);
    if(loai === 'HS') fetchStudents(true); else fetchTeachers(true);
}

async function taiFileMau(loai) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('DanhSach');
    
    if(loai === 'HS') {
        sheet.columns = [
            { header: 'STT', key: 'stt', width: 10 },
            { header: 'Mã Học Sinh', key: 'ma', width: 25 },
            { header: 'Họ và Tên', key: 'ten', width: 35 },
            { header: 'Lớp', key: 'lop', width: 15 }
        ];
        sheet.addRow({stt: 1, ma: '25A001', ten: 'Nguyễn Văn A', lop: '12A1'});
        sheet.addRow({stt: 2, ma: '25A002', ten: 'Trần Thị B', lop: '12A1'});
    } else {
        sheet.columns = [
            { header: 'STT', key: 'stt', width: 10 },
            { header: 'Mã Giáo Viên', key: 'ma', width: 25 },
            { header: 'Họ và Tên', key: 'ten', width: 35 },
            { header: 'Môn Phụ Trách', key: 'mon', width: 25 } 
        ];
        sheet.addRow({stt: 1, ma: 'GV01', ten: 'Thầy Lê Văn Cường', mon: 'Toán'});
        sheet.addRow({stt: 2, ma: 'GV02', ten: 'Cô Trần Ngọc Lan', mon: 'Ngữ văn'});
    }
    
    sheet.getRow(1).font = {bold: true, color: { argb: 'FFFFFFFF' }};
    sheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb: loai === 'HS' ? 'FF1A73E8' : 'FF8E44AD'} };
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `FileMau_Nap${loai}.xlsx`;
    a.click(); window.URL.revokeObjectURL(url);
}

function getExcelVal(cell) {
    if (!cell || cell.value === null || cell.value === undefined) return '';
    if (typeof cell.value === 'object') {
        if (cell.value.richText) return cell.value.richText.map(rt => rt.text).join('');
        if (cell.value.text) return cell.value.text;
        if (cell.value.hyperlink) return cell.value.text;
    }
    return String(cell.value).trim();
}

async function docFileExcelVaNap(loai) {
    let fileInput = document.getElementById(loai === 'HS' ? 'fileExcelHS' : 'fileExcelGV');
    if(!fileInput.files || fileInput.files.length === 0) return alert("Vui lòng chọn file Excel trước khi nạp!");
    
    let btn = document.getElementById(loai === 'HS' ? 'btnNapHS' : 'btnNapGV');
    let oldText = btn.innerText;
    btn.innerText = "⏳ Đang đọc và nạp lên máy chủ..."; btn.disabled = true; btn.style.opacity = 0.7;

    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileInput.files[0]);
        const worksheet = workbook.worksheets[0]; 
        
        let dataToInsert = [];
        
        let {data: mons} = await sb.from('mon_hoc').select('id, ten_mon');
        let sysMonList = mons || [];

        worksheet.eachRow((row, rowNumber) => {
            if(rowNumber > 1) { 
                if(loai === 'HS') {
                    let maHS = getExcelVal(row.getCell(2));
                    let hoTen = getExcelVal(row.getCell(3));
                    let lop = getExcelVal(row.getCell(4));
                    
                    if(maHS && hoTen) {
                        dataToInsert.push({
                            truong_id: gvData.truong_id,
                            ma_hs: maHS.toUpperCase(), 
                            ho_ten: safeHTML(hoTen),
                            lop: safeHTML(lop),
                            mat_khau: DEFAULT_PASS_HASH,
                            quyen: 'HocSinh'
                        });
                    }
                } else {
                    let maGV = getExcelVal(row.getCell(2));
                    let hoTen = getExcelVal(row.getCell(3));
                    let tenMon = getExcelVal(row.getCell(4)); 
                    
                    if(maGV && hoTen) {
                        let matchedMon = sysMonList.find(m => String(m.ten_mon).toLowerCase().trim() === tenMon.toLowerCase().trim());
                        let monIdToInsert = matchedMon ? matchedMon.id : null;

                        dataToInsert.push({
                            truong_id: gvData.truong_id,
                            ma_gv: maGV.toUpperCase(),
                            ho_ten: safeHTML(hoTen),
                            mat_khau: DEFAULT_PASS_HASH,
                            quyen: 'GiaoVien',
                            mon_id: monIdToInsert 
                        });
                    }
                }
            }
        });

        if(dataToInsert.length === 0) {
            btn.innerText = oldText; btn.disabled = false; btn.style.opacity = 1;
            return alert("File rỗng hoặc sai cấu trúc!\nCột 2 phải là Mã, Cột 3 phải là Họ tên.");
        }

        const tableName = loai === 'HS' ? 'hoc_sinh' : 'giao_vien';
        let {error} = await sb.from(tableName).insert(dataToInsert);
        
        if(error) {
            console.error("LỖI SUPABASE:", error); 
            if(error.code === '23505') throw new Error("Phát hiện trùng lặp Mã Tài khoản! Có tài khoản trong file Excel đã tồn tại trên hệ thống.");
            else throw new Error(error.message || "Lỗi không xác định từ máy chủ Supabase.");
        }

        alert(`🎉 XUẤT SẮC! Đã tạo thành công ${dataToInsert.length} tài khoản mới.`);
        fileInput.value = ""; 
        if(loai === 'HS') { fetchStudents(true); switchSubTabTK('hs'); }
        else { fetchTeachers(true); switchSubTabTK('gv'); }

    } catch(e) {
        console.error(e);
        alert("❌ Lỗi khi nạp dữ liệu: " + e.message);
    }
    
    btn.innerText = oldText; btn.disabled = false; btn.style.opacity = 1;
}

async function taiDanhSachPhong() {
    let selectBoxTab2 = document.getElementById("ctrlMaPhong"); let selectBoxTab3 = document.getElementById("dashMaPhong");
    if(selectBoxTab2) selectBoxTab2.innerHTML = '<option value="">⏳ Đang tải danh sách phòng...</option>';
    if(selectBoxTab3) selectBoxTab3.innerHTML = '<option value="">⏳ Đang tải danh sách phòng...</option>';

    let query = sb.from('phong_thi').select('ma_phong').eq('truong_id', gvData.truong_id);
    if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
    let {data} = await query;
    
    let defaultOpt = '<option value="">-- Chọn Mã Phòng Thi --</option>';
    if(selectBoxTab2) selectBoxTab2.innerHTML = defaultOpt; if(selectBoxTab3) selectBoxTab3.innerHTML = defaultOpt;
    
    if(data && data.length > 0) {
        let uniqueRooms = [...new Set(data.map(d=>d.ma_phong))];
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
        selectBoxTab2.addEventListener('change', function() {
            let r = allRoomsData.find(x => x.MaPhong === this.value);
            if(r) {
                document.getElementById('ctrlTenDot').value = r.TenDotKiemTra || "";
                document.getElementById('ctrlThoiGian').value = r.ThoiGian || 45;
                setTimeout(() => {
                    let sel = document.getElementById('ctrlDoiTuong');
                    if(sel) sel.value = r.DoiTuong || "TatCa";
                }, 150);
            }
        });
    }
}

function xuLyLiveSearch() { renderDashboardTable(); }

async function xoaTruong(id) {
    if(!confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa trường này?\n\nHành động này không thể hoàn tác!")) return;
    let { error } = await sb.from('truong_hoc').delete().eq('id', id);
    if(error) {
        if(error.code === '23503') alert("❌ KHÔNG THỂ XÓA: Trường này đang có dữ liệu trực thuộc!");
        else alert("❌ Lỗi máy chủ Supabase: " + error.message);
    } else { alert("✅ Đã xóa Trường học thành công!"); loadSysData(); }
}

async function xoaMon(id) {
    if(!confirm("⚠️ Bạn có chắc chắn muốn xóa môn học này?")) return;
    let { error } = await sb.from('mon_hoc').delete().eq('id', id);
    if(error) {
        if(error.code === '23503') alert("❌ KHÔNG THỂ XÓA: Môn học này đang được sử dụng!");
        else alert("❌ Lỗi máy chủ Supabase: " + error.message);
    } else { alert("✅ Đã xóa Môn học thành công!"); loadSysData(); }
}

async function xoaDeTrongPhong(maPhong) {
    if(!confirm(`XÓA ĐỀ THI của phòng [${maPhong}]?\n\nHành động này sẽ xóa sạch các câu hỏi đang có trong phòng này trên máy chủ, nhưng vẫn giữ nguyên thông tin Phòng thi để bạn có thể đẩy đề mới vào.`)) return;
    let btn = event.target; let oldText = btn.innerText; btn.innerText = "⏳..."; btn.disabled = true;

    try {
        let query = sb.from('phong_thi').select('id').eq('ma_phong', maPhong).eq('truong_id', gvData.truong_id);
        if(activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") query = query.eq('mon_id', activeWorkspaceMonId);
        
        let {data: room} = await query.single();
        if(room) {
            let {error} = await sb.from('de_thi').delete().eq('phong_id', room.id);
            if(error) throw error;
            alert("✅ Đã xóa sạch đề thi trong phòng! Bây giờ bạn có thể trộn và đẩy lại đề mới.");
        } else { alert("❌ Lỗi: Không tìm thấy phòng thi này!"); }
    } catch(e) { alert("❌ Lỗi khi xóa đề: " + e.message); }
    btn.innerText = oldText; btn.disabled = false;
}

// ==========================================================
// HÀM HÚT ĐỀ THÔNG MINH: TƯƠNG THÍCH CẢ V8 VÀ V11 (ĐÃ VÁ LỖI CÂU CHÙM, ĐỊA LÝ)
// ==========================================================
async function layDeTuIframe(btnElement) {
    if (!checkWorkspaceAction()) return;

    let inputMaPhong = document.getElementById('maPhongLienKet');
    let maPhong = inputMaPhong ? inputMaPhong.value.trim() : prompt("Vui lòng nhập MÃ PHÒNG THI đích đến:");
    
    if (!maPhong) return alert("⚠️ Cần phải có Mã Phòng Thi để đẩy đề lên mạng!");

    try {
        let iframeWindow = document.getElementById('frameV8').contentWindow;
        let danhSachDeIframe = [];

        // --- KIỂM TRA: NẾU LÀ BẢN V11 ---
        if (iframeWindow.__v11native && typeof iframeWindow.__v11native.getState === 'function') {
            let v11State = iframeWindow.__v11native.getState();
            
            if (!v11State.generated || v11State.generated.length === 0) {
                return alert("⚠️ V11 chưa trộn đề! Thầy hãy thao tác tải file DOCX, cấu hình số lượng và bấm nút [2. Trộn + Preview] bên trong khung V11 trước khi hút.");
            }

            // Bắt đầu bóc tách Cây dữ liệu V11 sang dạng Phẳng của hệ thống
            v11State.generated.forEach(exam => {
                let maDe = exam.examCode;
                
                exam.canonical.sections.forEach(sec => {
                    let phan = "1";
                    if (sec.section_kind === 'true_false') phan = "2";
                    if (sec.section_kind === 'short_answer') phan = "3";
                    
                    let processQuestion = (q, sharedBlocks = []) => {
                        let noiDung = "";

                        // 1. XỬ LÝ CÂU CHÙM (SHARED BLOCKS) - Cho vào khung highlight
                        if (sharedBlocks && sharedBlocks.length > 0) {
                            noiDung += `<div style="background-color: #f8f9fa; padding: 12px; border-left: 4px solid #1a73e8; margin-bottom: 10px; border-radius: 4px;">`;
                            sharedBlocks.forEach(b => {
                                // Lấy triệt để nội dung từ V11 (bao gồm cả bảng biểu, hình ảnh)
                                let bContent = typeof b === 'string' ? b : (b.html || b.outerHTML || b.content || b.text || "");
                                noiDung += `<div style="margin-bottom: 5px; overflow-x: auto;">${bContent}</div>`;
                            });
                            noiDung += `</div>`;
                        }

                        // 2. XỬ LÝ NỘI DUNG CÂU HỎI CHÍNH (STEM)
                        let rawStem = "";
                        
                        // Lấy phần Câu dẫn (Khắc phục lỗi xóa trắng câu hỏi)
                        let opener = q.opener_text || q.lead_in_text || q.stem_text || q.text || "";
                        if (opener) {
                            rawStem += opener + "<br>";
                        }

                        // Lấy nội dung các block phụ (Hình ảnh bản đồ, bảng số liệu Địa Lý)
                        (q.stem_blocks || []).forEach(b => {
                            let bContent = typeof b === 'string' ? b : (b.html || b.outerHTML || b.content || b.text || "");
                            if (bContent) {
                                rawStem += bContent + "<br>";
                            }
                        });

                        // 3. THUẬT TOÁN TIA LASER: Dọn rác tránh lặp chữ "Câu X:"
                        let startingTags = "";
                        
                        // Rút hết các thẻ HTML mở đầu cất tạm
                        rawStem = rawStem.replace(/^(\s*<[^>]+>\s*)*/, function(match) {
                            startingTags = match; return "";
                        });
                        
                        // Tiêu diệt chữ "Câu X" hoặc "# Câu X" hoặc "Câu X (TH)" ở mọi biến thể
                        rawStem = rawStem.replace(/^#?\s*C[âa]u\s*\d+\s*([(\[][A-Za-z0-9]+[)\]])?\s*(<\/[^>]+>\s*)*[:.]?\s*/i, function(match) {
                            let closingTags = match.match(/<\/[^>]+>/g); // Giữ lại thẻ đóng nếu có (ví dụ </b>)
                            return closingTags ? closingTags.join("") : ""; 
                        });
                        
                        // Ghép lại thẻ mở đầu và dọn thẻ <br> thừa
                        rawStem = startingTags + rawStem;
                        rawStem = rawStem.replace(/^(<br>\s*)+/, "").replace(/(<br>\s*)+$/, "").trim();

                        noiDung += rawStem;

                        // 4. XỬ LÝ ĐÁP ÁN
                        let dapAnA = "", dapAnB = "", dapAnC = "", dapAnD = "", dapAnDung = "";
                        let opts = q.display_options || [];

                        if (phan === "1") {
                            dapAnA = opts[0] ? (opts[0].html || opts[0].text || "") : "";
                            dapAnB = opts[1] ? (opts[1].html || opts[1].text || "") : "";
                            dapAnC = opts[2] ? (opts[2].html || opts[2].text || "") : "";
                            dapAnD = opts[3] ? (opts[3].html || opts[3].text || "") : "";
                            dapAnDung = q.display_answer ? q.display_answer.normalized : "";
                        } else if (phan === "2") {
                            dapAnA = opts[0] ? (opts[0].html || opts[0].text || "") : "";
                            dapAnB = opts[1] ? (opts[1].html || opts[1].text || "") : "";
                            dapAnC = opts[2] ? (opts[2].html || opts[2].text || "") : "";
                            dapAnD = opts[3] ? (opts[3].html || opts[3].text || "") : "";
                            let ansArr = q.display_answer && Array.isArray(q.display_answer.normalized) ? q.display_answer.normalized : ["","","",""];
                            dapAnDung = ansArr.join("-");
                        } else if (phan === "3") {
                            dapAnDung = q.display_answer ? q.display_answer.normalized : "";
                            if (dapAnDung && !dapAnDung.startsWith("'")) dapAnDung = "'" + dapAnDung;
                        }

                        danhSachDeIframe.push({
                            MaPhong: maPhong,
                            MaDe: String(maDe),
                            Phan: phan,
                            NoiDung: noiDung,
                            DapAnA: dapAnA,
                            DapAnB: dapAnB,
                            DapAnC: dapAnC,
                            DapAnD: dapAnD,
                            DapAnDung: dapAnDung
                        });
                    };

                    // Duyệt từng item trong section (xử lý tốt Câu Chùm / Nhóm câu hỏi)
                    (sec.items || []).forEach(item => {
                        if (item.kind === 'question_group') {
                            let shared = item.shared_blocks || [];
                            let leadText = item.display_lead_text || item.lead_in_text || "";
                            if (leadText) {
                                shared = [{type: 'paragraph', html: `<b><i>${leadText}</i></b>`}].concat(shared);
                            }
                            (item.child_questions || []).forEach(cq => processQuestion(cq, shared));
                        } else {
                            processQuestion(item, []);
                        }
                    });
                });
            });

        } 
        // --- KIỂM TRA: NẾU LÀ BẢN V8 CŨ ---
        else {
            danhSachDeIframe = iframeWindow.eval("typeof danhSachDeThi !== 'undefined' ? danhSachDeThi : []");
            if (!danhSachDeIframe || danhSachDeIframe.length === 0) {
                return alert("⚠️ Iframe trống! Bạn hãy tải file Word, cài đặt thông số và bấm 'Quét & Trộn' trước.");
            }
            danhSachDeIframe = JSON.parse(JSON.stringify(danhSachDeIframe));
            danhSachDeIframe.forEach(q => q.MaPhong = maPhong);
        }

        // ĐẨY LÊN SUPABASE
        let oldText = btnElement.innerText;
        btnElement.innerText = "⏳ ĐANG HÚT & ĐẨY LÊN SUPABASE...";
        btnElement.disabled = true;

        let result = await luuDeThiLenSupabase(danhSachDeIframe);
        
        btnElement.innerText = oldText;
        btnElement.disabled = false;

        if (result.status === 'success') {
            alert(`🎉 HOÀN TẤT! Đã bóc tách thành công ${danhSachDeIframe.length} câu hỏi và tống lên phòng [${maPhong}]. Học sinh có thể vào thi!`);
        } else {
            alert("❌ Lỗi máy chủ Supabase: " + result.message);
        }
    } catch (e) {
        btnElement.innerText = "🚀 Hút đề & Đẩy lên mạng";
        btnElement.disabled = false;
        console.error("Lỗi khi hút đề:", e);
        alert("❌ Lỗi kết nối hoặc cấu trúc Iframe không hợp lệ. Chi tiết: " + e.message);
    }
}