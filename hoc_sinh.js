const SUPABASE_URL = 'https://xcervjnwlchwfqvbeahy.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZXJ2am53bGNod2ZxdmJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NjksImV4cCI6MjA5MDY1Mjg2OX0.xjrY4YPDb5Q9BTenHrh2dUOnmZbegtKSZQPqzyJdxBo'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cập nhật state để lưu trữ ma_hs (Số báo danh)
let state = { truong_id: null, hs_id: null, ma_hs: '', ho_ten: '', lop: '', phong_id: null, ma_phong_text: '', ma_de: '', cau_hỏi: [], user_result: null };
let realtimeChannel = null;
let examTimer = null;

let currentQuestionIndex = 0;

let cheatCount = 0;
const MAX_CHEATS = 3;
let isExamActive = false;
let isSubmitting = false; 

// --- BẢO MẬT: BĂM MẬT KHẨU CÓ DỰ PHÒNG LAN (HTTP) ---
async function hashPassword(message) {
    if (window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else if (window.CryptoJS) {
        console.warn("Đang dùng CryptoJS dự phòng do chạy trên HTTP.");
        return CryptoJS.SHA256(message).toString(CryptoJS.enc.Hex);
    } else {
        alert("Lỗi nghiêm trọng: Trình duyệt không hỗ trợ mã hóa!");
        return message;
    }
}
const DEFAULT_PASS_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

function safeHTML(str) { 
    if (!str) return ""; 
    if (window.DOMPurify) { return DOMPurify.sanitize(str); }
    let doc = new DOMParser().parseFromString(str, 'text/html'); 
    return doc.body.innerHTML; 
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
}

// 1. ĐĂNG NHẬP & VÀO PHÒNG
async function login() {
    const maTruong = document.getElementById('ma_truong').value.trim();
    const maHs = document.getElementById('ma_hs').value.trim().toUpperCase(); 
    const matKhau = document.getElementById('mat_khau').value.trim();
    const btn = document.getElementById('btn-login');

    if (!maTruong || !maHs || !matKhau) return alert("Vui lòng nhập đầy đủ thông tin định danh!");

    btn.innerText = "⏳ ĐANG XÁC THỰC..."; btn.disabled = true;

    try {
        let hashedPass = await hashPassword(matKhau);
        const { data: truongData } = await _supabase.from('truong_hoc').select('id').eq('ma_truong', maTruong).single();
        if (!truongData) throw new Error("Mã trường không hợp lệ!");

        const { data: hsData } = await _supabase.from('hoc_sinh')
            .select('id, ho_ten, lop, mat_khau')
            .eq('truong_id', truongData.id)
            .eq('ma_hs', maHs)
            .or(`mat_khau.eq.${hashedPass},mat_khau.eq.${matKhau}`)
            .single();
            
        if (!hsData) throw new Error("Thông tin tài khoản không chính xác!");
        if (hsData.mat_khau === matKhau && matKhau !== DEFAULT_PASS_HASH) {
            _supabase.from('hoc_sinh').update({ mat_khau: hashedPass }).eq('id', hsData.id).then();
        }

        // Lưu Số báo danh vào state để chia đề
        state.truong_id = truongData.id; state.hs_id = hsData.id; state.ma_hs = maHs; state.ho_ten = hsData.ho_ten; state.lop = hsData.lop;
        
        document.getElementById('ten_hs_hien_thi').innerText = state.ho_ten; document.getElementById('lop_hs_hien_thi').innerText = state.lop;
        document.getElementById('panel_ten_hs').innerText = state.ho_ten; document.getElementById('panel_ma_hs').innerText = state.ma_hs; document.getElementById('panel_lop_hs').innerText = state.lop;
        
        showSection('room-section');
        timPhongThiTuDong();
    } catch (error) { alert(error.message); } finally {
        btn.innerText = "ĐĂNG NHẬP VÀO HỆ THỐNG"; btn.disabled = false;
    }
}

// CẬP NHẬT: Quét phòng thi và lọc đa lớp (Multi-class)
async function timPhongThiTuDong() {
    const autoArea = document.getElementById('auto-room-area');
    autoArea.innerHTML = '<p style="font-weight: bold; color: #1a73e8; margin: 0;">⏳ Đang quét tìm phòng thi đang mở...</p>';
    try {
        const { data, error } = await _supabase.from('phong_thi')
            .select('id, ma_phong, ten_dot, doi_tuong')
            .eq('truong_id', state.truong_id)
            .eq('trang_thai', 'MO_PHONG');

        if (error) throw error;

        // Lọc trên Javascript để phân tách chuỗi đa lớp (VD: "10A1, 10A2")
        let matchedRooms = (data || []).filter(room => {
            if (!room.doi_tuong || room.doi_tuong === 'TatCa') return true;
            let allowedClasses = room.doi_tuong.split(',').map(s => s.trim());
            return allowedClasses.includes(state.lop);
        });

        if (matchedRooms.length > 0) {
            let html = '<h3 style="color: #1e8e3e; margin: 0 0 15px 0;">🎉 Đã tìm thấy phòng thi cho lớp của bạn!</h3>';
            matchedRooms.forEach(room => {
                html += `<div style="background: #fff; border: 2px solid #34a853; border-radius: 8px; padding: 20px; margin-top: 10px; text-align: left;">
                    <h4 style="margin: 0 0 15px 0; color: #202124; font-size:18px;">${safeHTML(room.ten_dot) || 'Bài kiểm tra'}</h4>
                    <p style="margin: 0 0 15px 0; font-size: 14px; color: #5f6368;">Mã phòng: <b>${room.ma_phong}</b></p>
                    <button onclick="joinRoom('${room.ma_phong}')" style="background-color: #34a853; color: white; width: 100%; border: none; padding: 14px; border-radius: 8px; font-size:16px; font-weight: bold; cursor: pointer;">🚀 BẮT ĐẦU LÀM BÀI</button>
                </div>`;
            });
            autoArea.innerHTML = html;
        } else {
            autoArea.innerHTML = '<p style="color: #d93025; font-weight: bold; margin: 0;">❌ Hiện tại chưa có phòng thi nào được mở cho lớp của bạn.</p>';
        }
    } catch (e) { autoArea.innerHTML = '<p style="color: #d93025; margin: 0;">Lỗi kết nối máy chủ khi quét phòng thi.</p>'; }
}

async function joinRoom(maPhongAuto = null) {
    const maPhong = maPhongAuto || document.getElementById('ma_phong').value.trim();
    if (!maPhong) return alert("Vui lòng nhập mã phòng thi!");
    state.ma_phong_text = maPhong;

    try {
        const { data: phongData } = await _supabase.from('phong_thi')
            .select('id, trang_thai, thoi_gian, thoi_gian_mo, doi_tuong, mon_hoc(ten_mon)')
            .eq('truong_id', state.truong_id).eq('ma_phong', maPhong).single();
            
        if (!phongData) throw new Error("Không tìm thấy phòng thi này!");

        // CẬP NHẬT: Kiểm tra quyền vào phòng (Bảo mật lớp ghép) khi nhập mã bằng tay
        if (phongData.doi_tuong && phongData.doi_tuong !== 'TatCa') {
            let allowedClasses = phongData.doi_tuong.split(',').map(s => s.trim());
            if (!allowedClasses.includes(state.lop)) {
                throw new Error("Bạn không có quyền tham gia phòng thi này do không thuộc đối tượng được giao bài!");
            }
        }

        state.phong_id = phongData.id;
        kichHoatLienKetRealtime();

        const { data: res } = await _supabase.from('ket_qua').select('*').eq('phong_id', state.phong_id).eq('hs_id', state.hs_id).single();
        if (res) {
            state.user_result = res; document.getElementById('finish_name').innerText = state.ho_ten;
            showSection('result-section'); checkTeacherCommand(true); return;
        }

        if (phongData.trang_thai !== 'MO_PHONG') throw new Error("Phòng thi hiện đang bị khóa!");

        // --- THUẬT TOÁN CHIA ĐỀ VÒNG TRÒN (ROUND-ROBIN) TỐI ƯU ---
        const { data: danhSachDe } = await _supabase.from('de_thi')
            .select('ma_de, cau_so')
            .eq('phong_id', state.phong_id);
            
        if (!danhSachDe || danhSachDe.length === 0) throw new Error("Phòng thi này chưa có đề thi!");

        let viTriDe = 0;
        let sbdString = String(state.ma_hs).trim(); 

        if (/^\d+$/.test(sbdString)) {
            let numSBD = parseInt(sbdString, 10);
            viTriDe = numSBD % danhSachDe.length;
        } else {
            let hash = 0;
            for(let i = 0; i < sbdString.length; i++) {
                hash = (hash * 31 + sbdString.charCodeAt(i)) >>> 0;
            }
            viTriDe = hash % danhSachDe.length;
        }

        const deData = danhSachDe[viTriDe];

        state.ma_de = deData.ma_de;
        state.cau_hỏi = typeof deData.cau_so === 'string' ? JSON.parse(deData.cau_so) : deData.cau_so;
        // --------------------------------------------------

        document.getElementById('ten_mon_hien_thi').innerText = safeHTML(phongData.mon_hoc?.ten_mon || "Môn Chung");
        document.getElementById('ma_de_hien_thi').innerText = state.ma_de;
        
        batDauAntiCheat();
        renderExam();
        showSection('exam-section');
        startTimer(phongData.thoi_gian, phongData.thoi_gian_mo);

    } catch (error) { alert(error.message); }
}

function kichHoatLienKetRealtime() {
    if (realtimeChannel) _supabase.removeChannel(realtimeChannel);
    realtimeChannel = _supabase.channel('room-updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'phong_thi', filter: `id=eq.${state.phong_id}` }, payload => {
            const newStatus = payload.new.trang_thai;
            if (newStatus === 'THU_BAI' && document.getElementById('exam-section').classList.contains('active')) {
                alert("⏳ HẾT GIỜ! Giáo viên đã khóa phòng thi. Hệ thống đang tự động thu bài của bạn!");
                gradeAndSubmit(true); 
            } 
            else if ((newStatus === 'CONG_BO_DIEM' || newStatus === 'XEM_DAP_AN') && document.getElementById('result-section').classList.contains('active')) {
                checkTeacherCommand(true);
            }
        }).subscribe();
}

// 2. RENDER GIAO DIỆN
function renderExam() {
    const container = document.getElementById('exam-content');
    const gridContainer = document.getElementById('question-grid');
    container.innerHTML = '';
    gridContainer.innerHTML = '';

    state.cau_hỏi.forEach((cau, index) => {
        let activeClassBlock = index === 0 ? "active-q" : "";
        let html = `<div class="question-block ${activeClassBlock}" id="q-block-${index}">`;

        let phanLabel = "";
        if (cau.phan === "1" || cau.Phan === "1") phanLabel = "Trắc nghiệm nhiều lựa chọn";
        else if (cau.phan === "2" || cau.Phan === "2") phanLabel = "Trắc nghiệm Đúng/Sai";
        else phanLabel = "Trả lời ngắn";

        html += `<div style="font-size: 13px; color: #1a73e8; font-weight: bold; text-transform: uppercase; margin-bottom: 10px;">PHẦN ${cau.phan || cau.Phan}: ${phanLabel}</div>`;
        html += `<div class="q-text"><b>Câu ${index + 1}:</b> ${safeHTML(cau.noi_dung || cau.NoiDung)}</div>`;
        
        if (cau.phan === "1" || cau.Phan === "1") {
            html += `<div class="options-list">
                <label class="option-lbl"><input type="radio" name="q_${index}" value="A" onchange="danhDauDaLam(${index})"> <span class="option-text"><b>A.</b> ${safeHTML(cau.A || cau.DapAnA)}</span></label>
                <label class="option-lbl"><input type="radio" name="q_${index}" value="B" onchange="danhDauDaLam(${index})"> <span class="option-text"><b>B.</b> ${safeHTML(cau.B || cau.DapAnB)}</span></label>
                <label class="option-lbl"><input type="radio" name="q_${index}" value="C" onchange="danhDauDaLam(${index})"> <span class="option-text"><b>C.</b> ${safeHTML(cau.C || cau.DapAnC)}</span></label>
                <label class="option-lbl"><input type="radio" name="q_${index}" value="D" onchange="danhDauDaLam(${index})"> <span class="option-text"><b>D.</b> ${safeHTML(cau.D || cau.DapAnD)}</span></label>
            </div>`;
        } else if (cau.phan === "2" || cau.Phan === "2") {
            html += `<table class="tf-table"><tr><th style="width: 60%;">Phát biểu</th><th>Đúng</th><th>Sai</th></tr>
                ${['a','b','c','d'].map(letter => `
                <tr>
                    <td><b>${letter}.</b> ${safeHTML(cau[letter.toUpperCase()] || cau['DapAn'+letter.toUpperCase()])}</td>
                    <td><input type="radio" name="q_${index}_${letter}" value="Đ" onchange="kiemTraP2DaLam(${index})"></td>
                    <td><input type="radio" name="q_${index}_${letter}" value="S" onchange="kiemTraP2DaLam(${index})"></td>
                </tr>`).join('')}
            </table>`;
        } else {
            html += `<div><input type="text" class="short-answer-input" id="q_${index}_txt" placeholder="Nhập đáp án của bạn..." oninput="kiemTraP3DaLam(${index}, this.value)"></div>`;
        }
        html += `</div>`;
        container.innerHTML += html;

        let activeClassGrid = index === 0 ? "active-view" : "";
        gridContainer.innerHTML += `<div class="q-btn ${activeClassGrid}" id="q-btn-${index}" onclick="chuyenCauHoi(${index})">${index + 1}</div>`;
    });

    currentQuestionIndex = 0; capNhatNutDieuHuong();
}

function chuyenCauHoi(index) {
    document.querySelectorAll('.question-block').forEach(el => el.classList.remove('active-q'));
    let block = document.getElementById(`q-block-${index}`);
    if(block) block.classList.add('active-q');
    
    document.querySelectorAll('.q-btn').forEach(btn => btn.classList.remove('active-view'));
    let btn = document.getElementById(`q-btn-${index}`);
    if(btn) btn.classList.add('active-view');
    
    currentQuestionIndex = index; capNhatNutDieuHuong();
    document.getElementById('exam-main-area').scrollTo({ top: 0, behavior: 'smooth' });
}
function cauTruoc() { if(currentQuestionIndex > 0) chuyenCauHoi(currentQuestionIndex - 1); }
function cauTiep() { if(currentQuestionIndex < state.cau_hỏi.length - 1) chuyenCauHoi(currentQuestionIndex + 1); }
function capNhatNutDieuHuong() {
    document.getElementById('btn-prev').disabled = (currentQuestionIndex === 0);
    document.getElementById('btn-next').disabled = (currentQuestionIndex === state.cau_hỏi.length - 1);
}

function danhDauDaLam(index) { document.getElementById(`q-btn-${index}`).classList.add('answered'); }
function kiemTraP2DaLam(index) {
    let count = 0; ['a','b','c','d'].forEach(l => { if(document.querySelector(`input[name="q_${index}_${l}"]:checked`)) count++; });
    if(count === 4) danhDauDaLam(index);
}
function kiemTraP3DaLam(index, val) {
    if(val.trim() !== "") danhDauDaLam(index); else document.getElementById(`q-btn-${index}`).classList.remove('answered');
}

function startTimer(thoiGianPhut, thoiGianMo) {
    if(!thoiGianPhut) thoiGianPhut = 45;
    let startTime = thoiGianMo ? new Date(thoiGianMo).getTime() : Date.now();
    let endTime = startTime + (thoiGianPhut * 60 * 1000);

    examTimer = setInterval(() => {
        let now = Date.now(); let diff = endTime - now;
        if (diff <= 0) {
            clearInterval(examTimer); document.getElementById('display-timer').innerText = "00:00";
            if (isExamActive) { alert("⏳ ĐÃ HẾT THỜI GIAN LÀM BÀI! Hệ thống tự động thu bài."); gradeAndSubmit(true); }
        } else {
            let m = Math.floor(diff / 60000); let s = Math.floor((diff % 60000) / 1000);
            let display = document.getElementById('display-timer');
            display.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            if (diff <= 300000) display.classList.add('danger');
        }
    }, 1000);
}

// 3. THUẬT TOÁN CHỐNG GIAN LẬN CỔ ĐIỂN
function batDauAntiCheat() {
    isExamActive = true;
    cheatCount = 0;
    
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } catch(e) {}

    document.addEventListener('contextmenu', chanHanhDong);
    document.addEventListener('copy', chanHanhDong);
    document.addEventListener('keydown', chanPhimTat);

    window.addEventListener('blur', xuLyGianLan);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') xuLyGianLan();
    });
}

function tatAntiCheat() {
    isExamActive = false;
    document.removeEventListener('contextmenu', chanHanhDong); document.removeEventListener('copy', chanHanhDong); document.removeEventListener('keydown', chanPhimTat);
    window.removeEventListener('blur', xuLyGianLan); document.removeEventListener('visibilitychange', xuLyGianLan);
    if(examTimer) clearInterval(examTimer);
}

function chanHanhDong(e) { if(isExamActive) e.preventDefault(); }
function chanPhimTat(e) {
    if (!isExamActive) return;
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.key === 'c') || (e.ctrlKey && e.key === 'v')) {
        e.preventDefault();
    }
}

function xuLyGianLan() {
    if (!isExamActive) return;
    if (document.getElementById('cheat-warning').style.display === 'block') return; 
    
    cheatCount++;
    document.getElementById('cheat-count').innerText = cheatCount;
    document.getElementById('cheat-warning').style.display = 'block';

    if (cheatCount >= MAX_CHEATS) {
        document.querySelector('.btn-warning').style.display = 'none';
        alert("🚨 BẠN ĐÃ VI PHẠM QUY CHẾ THI QUÁ SỐ LẦN CHO PHÉP!\nHệ thống tự động đình chỉ và thu bài.");
        gradeAndSubmit(true);
    }
}

function closeCheatWarning() {
    document.getElementById('cheat-warning').style.display = 'none';
    try { document.documentElement.requestFullscreen(); } catch(e){}
}

// 4. NỘP BÀI VÀ CHẤM ĐIỂM
function xacNhanNopBai() {
    let chuaLam = 0;
    document.querySelectorAll('.q-btn').forEach(btn => { if(!btn.classList.contains('answered')) chuaLam++; });

    let msg = chuaLam > 0 
        ? `⚠️ CẢNH BÁO: Bạn còn ${chuaLam} câu chưa hoàn thành!\nBạn có CHẮC CHẮN muốn nộp bài lúc này không?`
        : `Bạn đã hoàn thành 100% câu hỏi.\nXác nhận NỘP BÀI lên máy chủ?`;

    if(confirm(msg)) gradeAndSubmit(false);
}

async function gradeAndSubmit(autoSubmit = false) {
    if (isSubmitting) return; 
    isSubmitting = true;
    
    let btn = document.getElementById('btn-submit-exam');
    if(btn) { btn.innerText = "⏳ ĐANG GỬI DỮ LIỆU..."; btn.disabled = true; }
    
    tatAntiCheat();
    let baiLam = [];
    
    state.cau_hỏi.forEach((cau, index) => {
        let phan = String(cau.phan || cau.Phan); 
        let ans = "";
        if (phan === "1") ans = document.querySelector(`input[name="q_${index}"]:checked`)?.value || "";
        else if (phan === "2") {
            let userArr = ['a','b','c','d'].map(l => document.querySelector(`input[name="q_${index}_${l}"]:checked`)?.value || "");
            ans = userArr.join('-'); 
        } else {
            let txtEl = document.getElementById(`q_${index}_txt`);
            ans = txtEl ? txtEl.value.trim() : "";
        }
        baiLam.push({ chon: ans });
    });

    const { data, error } = await _supabase.rpc('nop_bai_va_cham_diem', { 
        p_truong_id: state.truong_id, p_phong_id: state.phong_id, p_hs_id: state.hs_id, p_ma_de: state.ma_de, p_bai_lam: baiLam 
    });
    
    if (!error && data && data.status === 'success') { 
        document.getElementById('finish_name').innerText = state.ho_ten; showSection('result-section'); 
        try { document.exitFullscreen(); } catch(e){} 
    } else {
        alert("❌ Có lỗi mạng khi nộp bài. Vui lòng không đóng trình duyệt và báo ngay cho Giám thị!");
        if(btn) { btn.innerText = "NỘP LẠI BÀI THI"; btn.disabled = false; }
        isSubmitting = false; 
    }
}

// 5. ĐÁP ÁN CHI TIẾT
async function checkTeacherCommand(isAuto = false) {
    try {
        const { data: phong } = await _supabase.from('phong_thi').select('trang_thai').eq('id', state.phong_id).single();
        const { data: kq } = await _supabase.from('ket_qua').select('*').eq('phong_id', state.phong_id).eq('hs_id', state.hs_id).single();
        state.user_result = kq;

        if (phong.trang_thai === 'CONG_BO_DIEM' || phong.trang_thai === 'XEM_DAP_AN') {
            document.getElementById('score-display-area').style.display = 'block'; document.getElementById('final_score_val').innerText = kq.diem.toFixed(2);
        } else {
            if (!isAuto) alert("Giáo viên chưa công bố điểm. Vui lòng đợi!"); return;
        }

        if (phong.trang_thai === 'XEM_DAP_AN') {
            let chiTiet = typeof kq.chi_tiet === 'string' ? JSON.parse(kq.chi_tiet) : kq.chi_tiet;
            if (!chiTiet[0].A && kq.ma_de) {
                const { data: deData } = await _supabase.from('de_thi').select('cau_so').eq('phong_id', state.phong_id).eq('ma_de', kq.ma_de).single();
                if (deData) {
                    let cauHois = typeof deData.cau_so === 'string' ? JSON.parse(deData.cau_so) : deData.cau_so;
                    chiTiet = chiTiet.map((ct, idx) => {
                        let cauGoc = cauHois[idx] || {};
                        return {...ct, A: cauGoc.A || cauGoc.DapAnA, B: cauGoc.B || cauGoc.DapAnB, C: cauGoc.C || cauGoc.DapAnC, D: cauGoc.D || cauGoc.DapAnD};
                    });
                }
            }
            renderReview(chiTiet);
        }
    } catch (e) { console.error(e); }
}

function renderReview(chiTietData) {
    const container = document.getElementById('review-content');
    container.innerHTML = `<h3 style="color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; margin-top: 30px;">CHI TIẾT BÀI LÀM & ĐÁP ÁN</h3>`;
    let items = Array.isArray(chiTietData) ? chiTietData : Object.values(chiTietData);

    items.forEach((item, index) => {
        let isRight = false; let phan = String(item.phan || item.Phan || "1");
        let userAns = item.chon || item.Chon || ""; let correctAns = item.dung || item.Dung || "";

        if (phan === "1" || phan === "2") isRight = (userAns === correctAns);
        else {
            let aClean = String(userAns).replace(/,/g,'.').replace(/\s/g,'').toLowerCase();
            let dClean = String(correctAns).replace(/'/g,'').replace(/,/g,'.').replace(/\s/g,'').toLowerCase();
            isRight = (aClean !== "" && aClean === dClean);
        }

        let qNum = item.q || item.cauSo || (index + 1); let textContent = item.noiDung || item.noiDungCau || "(Không trích xuất được nội dung câu hỏi)";

        let html = `<div style="margin-bottom: 20px; padding: 20px; border-radius: 8px; background: #f8f9fa; border: 1px solid ${isRight ? '#34a853' : '#ea4335'};">
            <span style="font-weight: 600; font-size: 16px; margin-bottom: 15px; display: block; color: #202124;">Câu ${qNum}: ${safeHTML(textContent)} 
            <span style="background: ${isRight ? '#34a853' : '#ea4335'}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 12px; margin-left: 10px;">${isRight ? 'ĐÚNG' : 'SAI'}</span></span>`;

        if (phan === "1") {
            let userText = userAns ? `<span style="color:${isRight ? '#1e8e3e' : '#d93025'}; font-weight:bold;">${safeHTML(userAns)}</span>` : `<span style="color:#d93025; font-weight:bold;">(Bỏ trống)</span>`;
            html += `<div style="margin-bottom: 15px; font-size: 14px; background: #fff; padding: 10px; border-radius: 6px; border: 1px dashed #dadce0;">Bạn chọn: ${userText}</div>`;

            ['A', 'B', 'C', 'D'].forEach(opt => {
                let optText = item[opt] || item[`DapAn${opt}`] || "";
                if (!optText) return; 
                let isChosen = (userAns === opt); let isCorrect = (correctAns === opt);
                let style = "padding: 10px 15px; margin: 6px 0; border-radius: 6px; background: #fff; border: 1px solid #e8eaed;";
                let icon = "&nbsp;&nbsp;&nbsp;&nbsp;";
                
                if (isCorrect) { style = "padding: 10px 15px; margin: 6px 0; border-radius: 6px; background: #e8f5e9; border: 2px solid #34a853; color: #1e8e3e; font-weight: bold;"; icon = "✅"; } 
                else if (isChosen && !isCorrect) { style = "padding: 10px 15px; margin: 6px 0; border-radius: 6px; background: #fce8e6; border: 2px solid #ea4335; color: #d93025; font-weight: bold;"; icon = "❌"; }

                html += `<div style="${style}">${icon} <b>${opt}.</b> ${safeHTML(optText)}</div>`;
            });
        } else if (phan === "2") {
            html += `<table class="tf-table" style="margin-top: 10px;"><tr><th>Ý</th><th>Nội dung</th><th>Bạn chọn</th><th>Đáp án chuẩn</th></tr>`;
            let userArr = userAns.split('-'); let correctArr = correctAns.split('-');
            ['a', 'b', 'c', 'd'].forEach((letter, i) => {
                let uA = userArr[i] || ""; let cA = correctArr[i] || ""; let optText = item[letter.toUpperCase()] || item[`DapAn${letter.toUpperCase()}`] || "";
                html += `<tr><td style="font-weight:bold;">${letter}</td><td style="text-align:left;">${safeHTML(optText)}</td><td style="color: ${uA === cA ? '#1e8e3e' : '#d93025'}; font-weight:bold;">${safeHTML(uA || '-')}</td><td style="color: #1e8e3e; font-weight:bold;">${safeHTML(cA)}</td></tr>`;
            });
            html += `</table>`;
        } else {
            html += `<div style="margin-top: 10px; padding: 15px; background: #fff; border-radius: 6px; border: 1px solid #dadce0;">
                <p style="margin: 0 0 8px 0;"><b>Bạn chọn:</b> <span style="color:${isRight ? '#1e8e3e' : '#d93025'}; font-weight:bold; font-size: 16px;">${safeHTML(userAns || '(Bỏ trống)')}</span></p>
                <p style="margin: 0; color:#1e8e3e;"><b>Đáp án chuẩn:</b> <span style="font-size: 16px; font-weight:bold;">${safeHTML(String(correctAns).replace(/'/g,''))}</span></p>
            </div>`;
        }

        html += `</div>`;
        container.innerHTML += html;
    });
}