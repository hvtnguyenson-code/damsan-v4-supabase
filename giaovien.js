
const SUPABASE_URL = 'https://xcervjnwlchwfqvbeahy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZXJ2am53bGNod2ZxdmJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NjksImV4cCI6MjA5MDY1Mjg2OX0.xjrY4YPDb5Q9BTenHrh2dUOnmZbegtKSZQPqzyJdxBo';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let gvData = null;
let activeWorkspaceMonId = null;
let activeWorkspaceTruongId = null;

const FLEX_LITE_TEACHER_CONFIG_ENABLED = true;

function readFlexLiteWeight(id) {
    const raw = document.getElementById(id)?.value;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return NaN;
    }
    return Number(raw);
}

function onFlexLiteAssessmentTypeChange() {
    const typeEl = document.getElementById('flexLiteAssessmentType');
    const customWeightsEl = document.getElementById('flexLiteCustomWeights');
    if (customWeightsEl) {
        customWeightsEl.style.display = (typeEl && typeEl.value === 'CUSTOM') ? 'block' : 'none';
    }
}

function syncFlexLiteAssessmentPanel(mode = 'direct') {
    const panel = document.getElementById('flexLiteAssessmentPanel');
    if (!panel) return;
    if (!FLEX_LITE_TEACHER_CONFIG_ENABLED) {
        panel.style.display = 'none';
        return;
    }
    const visibleModes = ['direct', 'manual', 'matrix', 'offline'];
    if (visibleModes.includes(mode)) {
        panel.style.display = 'block';
        onFlexLiteAssessmentTypeChange();
    } else {
        panel.style.display = 'none';
    }
}

function snapshotFlexLiteAssessmentConfig() {
    if (!FLEX_LITE_TEACHER_CONFIG_ENABLED) return null;
    const typeEl = document.getElementById('flexLiteAssessmentType');
    const assessmentType = typeEl ? typeEl.value : 'TOT_NGHIEP';
    if (assessmentType === 'CUSTOM') {
        const p1W = readFlexLiteWeight('flexLiteP1Weight');
        const p2W = readFlexLiteWeight('flexLiteP2Weight');
        const p3W = readFlexLiteWeight('flexLiteP3Weight');
        return {
            assessment_type: 'CUSTOM',
            scoring_config: { p1_weight: p1W, p2_weight: p2W, p3_weight: p3W }
        };
    }
    return {
        assessment_type: assessmentType,
        scoring_config: {}
    };
}

function validateFlexLiteAssessmentForSave(deThiArray, config) {
    if (!config) return { valid: true };
    if (!Array.isArray(deThiArray) || deThiArray.length === 0) {
        throw new Error("Đề thi không có câu hỏi nào để lưu.");
    }

    const groupedByMaDe = {};
    for (const q of deThiArray) {
        const part = String(q.Phan ?? q.phan ?? '1').trim();
        if (!['1', '2', '3'].includes(part)) {
            throw new Error(`Phát hiện phần câu hỏi không hợp lệ: ${part}. Chỉ hỗ trợ Phần 1, 2, 3.`);
        }
        const md = String(q.MaDe ?? q.ma_de ?? 'default');
        if (!groupedByMaDe[md]) {
            groupedByMaDe[md] = { p1: 0, p2: 0, p3: 0, total: 0 };
        }
        if (part === '1') groupedByMaDe[md].p1++;
        else if (part === '2') groupedByMaDe[md].p2++;
        else if (part === '3') groupedByMaDe[md].p3++;
        groupedByMaDe[md].total++;
    }

    let expected = null;
    for (const md of Object.keys(groupedByMaDe)) {
        const counts = groupedByMaDe[md];
        if (!expected) {
            expected = counts;
        } else {
            if (counts.p1 !== expected.p1 || counts.p2 !== expected.p2 || counts.p3 !== expected.p3 || counts.total !== expected.total) {
                throw new Error("Các mã đề không đồng nhất số lượng câu hỏi hoặc cấu trúc phần.");
            }
        }
    }

    const { p1, p2, p3, total } = expected;
    if (total < 1) {
        throw new Error("Đề thi phải có ít nhất 1 câu hỏi.");
    }

    const type = config.assessment_type;
    if (type === 'TOT_NGHIEP') {
        if ((p1 + p2 + p3) !== total || total < 1) {
            throw new Error("Cấu hình Tốt nghiệp yêu cầu các câu hỏi chỉ thuộc Phần 1, Phần 2, Phần 3 (tối thiểu 1 câu).");
        }
    } else if (type === 'MCQ_ONLY') {
        if (p1 !== total || p1 < 1) {
            throw new Error("Cấu hình Chỉ trắc nghiệm (MCQ_ONLY) yêu cầu tất cả các câu hỏi phải thuộc Phần 1 (tối thiểu 1 câu).");
        }
    } else if (type === 'TRUE_FALSE_ONLY') {
        if (p2 !== total || p2 < 1) {
            throw new Error("Cấu hình Chỉ Đúng/Sai (TRUE_FALSE_ONLY) yêu cầu tất cả các câu hỏi phải thuộc Phần 2 (tối thiểu 1 câu).");
        }
    } else if (type === 'SHORT_ONLY') {
        if (p3 !== total || p3 < 1) {
            throw new Error("Cấu hình Chỉ trả lời ngắn (SHORT_ONLY) yêu cầu tất cả các câu hỏi phải thuộc Phần 3 (tối thiểu 1 câu).");
        }
    } else if (type === 'CUSTOM') {
        if ((p1 + p2 + p3) !== total || total < 1) {
            throw new Error("Cấu hình Tùy chỉnh (CUSTOM) yêu cầu các câu hỏi chỉ thuộc Phần 1, Phần 2, Phần 3 (tối thiểu 1 câu).");
        }
        const sc = config.scoring_config;
        if (!sc || typeof sc !== 'object' || !('p1_weight' in sc) || !('p2_weight' in sc) || !('p3_weight' in sc)) {
            throw new Error("Cấu hình CUSTOM yêu cầu đủ 3 trọng số p1_weight, p2_weight, p3_weight.");
        }
        if (sc.p1_weight === null || sc.p2_weight === null || sc.p3_weight === null || typeof sc.p1_weight === 'undefined' || typeof sc.p2_weight === 'undefined' || typeof sc.p3_weight === 'undefined') {
            throw new Error("Trọng số CUSTOM không được để trống hoặc mang giá trị null.");
        }
        const p1W = Number(sc.p1_weight);
        const p2W = Number(sc.p2_weight);
        const p3W = Number(sc.p3_weight);
        if (!Number.isFinite(p1W) || !Number.isFinite(p2W) || !Number.isFinite(p3W)) {
            throw new Error("Trọng số CUSTOM phải là số hợp lệ.");
        }
        if (p1W < 0 || p1W > 10 || p2W < 0 || p2W > 10 || p3W < 0 || p3W > 10) {
            throw new Error("Mỗi trọng số CUSTOM phải nằm trong khoảng từ 0 đến 10.");
        }
        if (Math.abs((p1W + p2W + p3W) - 10) > 0.0001) {
            throw new Error("Tổng các trọng số CUSTOM phải bằng đúng 10.");
        }
        if (p1 === 0 && p1W !== 0) {
            throw new Error("Trọng số Phần 1 phải bằng 0 khi đề không có câu hỏi Phần 1.");
        }
        if (p2 === 0 && p2W !== 0) {
            throw new Error("Trọng số Phần 2 phải bằng 0 khi đề không có câu hỏi Phần 2.");
        }
        if (p3 === 0 && p3W !== 0) {
            throw new Error("Trọng số Phần 3 phải bằng 0 khi đề không có câu hỏi Phần 3.");
        }
    } else {
        throw new Error(`Loại bài kiểm tra không hợp lệ: ${type}`);
    }

    return { valid: true };
}
function parseAuthoritativeFinalScore(diemRaw) {
    if (diemRaw === null || diemRaw === undefined || diemRaw === "" || diemRaw === "-") {
        return null;
    }
    const num = Number(diemRaw);
    return isNaN(num) ? null : num;
}

function parseServerGradingDetails(chiTietRaw) {
    let ct = null;
    if (typeof chiTietRaw === 'string') {
        try {
            ct = JSON.parse(chiTietRaw);
        } catch (e) {
            ct = null;
        }
    } else if (typeof chiTietRaw === 'object' && chiTietRaw !== null) {
        ct = chiTietRaw;
    }

    const res = {
        p1Count: 0,
        p2Count: 0,
        p3Count: 0,
        totalCount: 0,
        rawP1Earned: 0,
        rawP2Earned: 0,
        rawP3Earned: 0,
        rawP1Max: 0,
        rawP2Max: 0,
        rawP3Max: 0
    };

    if (!ct) return res;

    const entries = Array.isArray(ct) ? ct : Object.values(ct);

    for (const item of entries) {
        if (!item || typeof item !== 'object') continue;
        const phan = String(item.phan ?? item.Phan ?? '1').trim();
        res.totalCount++;

        if (phan === '1') {
            res.p1Count++;
            let p1Pt = 0;
            if (item.diem !== undefined && item.diem !== null) {
                p1Pt = Number(item.diem) || 0;
            } else {
                const cVal = String(item.chon || '').toUpperCase().trim();
                const dVal = String(item.dung || '').toUpperCase().trim();
                if (cVal && cVal === dVal) p1Pt = 0.25;
            }
            res.rawP1Earned += p1Pt;
        } else if (phan === '2') {
            res.p2Count++;
            let p2Pt = 0;
            if (item.diem !== undefined && item.diem !== null) {
                p2Pt = Number(item.diem) || 0;
            } else {
                const cArr = String(item.chon || '').split('-');
                const dStr = String(item.dung || '').toUpperCase().replace(/[ÐD]/g, 'Đ');
                const dArr = dStr.match(/[ĐS]/g) || [];
                let match = 0;
                for (let i = 0; i < 4; i++) {
                    const cValRaw = cArr[i] || '';
                    const cVal = String(cValRaw).toUpperCase().replace(/[ÐD]/g, 'Đ');
                    let cleanCVal = '';
                    if (cVal.includes('Đ')) cleanCVal = 'Đ';
                    if (cVal.includes('S')) cleanCVal = 'S';
                    const dVal = dArr[i] || '';
                    if (cleanCVal !== '' && cleanCVal === dVal) match++;
                }
                if (match === 1) p2Pt = 0.1;
                else if (match === 2) p2Pt = 0.25;
                else if (match === 3) p2Pt = 0.5;
                else if (match === 4) p2Pt = 1.0;
            }
            res.rawP2Earned += p2Pt;
        } else if (phan === '3') {
            res.p3Count++;
            let p3Pt = 0;
            if (item.diem !== undefined && item.diem !== null) {
                p3Pt = Number(item.diem) || 0;
            } else {
                const aClean = String(item.chon || '').replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
                const dClean = String(item.dung || '').replace(/'/g, '').replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
                if (aClean !== '' && aClean === dClean) p3Pt = 0.25;
            }
            res.rawP3Earned += p3Pt;
        }
    }

    res.rawP1Max = res.p1Count * 0.25;
    res.rawP2Max = res.p2Count * 1.0;
    res.rawP3Max = res.p3Count * 0.25;

    return res;
}

function computeDisplayPartContributions(hs, assessmentType = 'LEGACY', scoringConfig = {}) {
    const authoritativeScore = parseAuthoritativeFinalScore(hs ? (hs.Diem ?? hs.diem ?? hs.score) : null);
    const isSubmitted = authoritativeScore !== null;

    if (!isSubmitted) {
        return {
            isSubmitted: false,
            finalScore: null,
            finalDisplay: "-",
            p1: "-",
            p2: "-",
            p3: "-"
        };
    }

    const details = parseServerGradingDetails(hs ? (hs.ChiTiet ?? hs.chi_tiet ?? hs.grading_details) : null);
    const type = String(assessmentType || 'LEGACY').trim().toUpperCase();

    let p1Contrib = 0;
    let p2Contrib = 0;
    let p3Contrib = 0;

    if (type === 'MCQ_ONLY') {
        p1Contrib = authoritativeScore;
        p2Contrib = 0;
        p3Contrib = 0;
    } else if (type === 'TRUE_FALSE_ONLY') {
        p1Contrib = 0;
        p2Contrib = authoritativeScore;
        p3Contrib = 0;
    } else if (type === 'SHORT_ONLY') {
        p1Contrib = 0;
        p2Contrib = 0;
        p3Contrib = authoritativeScore;
    } else if (type === 'CUSTOM') {
        const p1Weight = Number(scoringConfig?.p1_weight) || 0;
        const p2Weight = Number(scoringConfig?.p2_weight) || 0;
        const p3Weight = Number(scoringConfig?.p3_weight) || 0;

        p1Contrib = details.rawP1Max > 0 ? (details.rawP1Earned / details.rawP1Max) * p1Weight : 0;
        p2Contrib = details.rawP2Max > 0 ? (details.rawP2Earned / details.rawP2Max) * p2Weight : 0;
        p3Contrib = details.rawP3Max > 0 ? (details.rawP3Earned / details.rawP3Max) * p3Weight : 0;
    } else {
        p1Contrib = details.rawP1Earned;
        p2Contrib = details.rawP2Earned;
        p3Contrib = details.rawP3Earned;
    }

    return {
        isSubmitted: true,
        finalScore: authoritativeScore,
        finalDisplay: authoritativeScore.toFixed(2),
        p1: Number(p1Contrib.toFixed(2)),
        p2: Number(p2Contrib.toFixed(2)),
        p3: Number(p3Contrib.toFixed(2))
    };
}

function isQuestionFullyCorrectFromServerDetail(item) {
    if (!item || typeof item !== 'object') return false;
    const phan = String(item.phan ?? item.Phan ?? '1').trim();

    if (item.diem !== undefined && item.diem !== null) {
        const diemVal = Number(item.diem) || 0;
        if (phan === '1') {
            return Math.abs(diemVal - 0.25) < 0.0001;
        } else if (phan === '2') {
            return Math.abs(diemVal - 1.0) < 0.0001;
        } else if (phan === '3') {
            return Math.abs(diemVal - 0.25) < 0.0001;
        }
        return diemVal > 0;
    }

    if (phan === '1') {
        const cVal = String(item.chon || '').toUpperCase().trim();
        const dVal = String(item.dung || '').toUpperCase().trim();
        return (cVal !== '' && cVal === dVal);
    } else if (phan === '2') {
        const cArr = String(item.chon || '').split('-');
        const dStr = String(item.dung || '').toUpperCase().replace(/[ÐD]/g, 'Đ');
        const dArr = dStr.match(/[ĐS]/g) || [];
        let match = 0;
        for (let i = 0; i < 4; i++) {
            const cValRaw = cArr[i] || '';
            const cVal = String(cValRaw).toUpperCase().replace(/[ÐD]/g, 'Đ');
            let cleanCVal = '';
            if (cVal.includes('Đ')) cleanCVal = 'Đ';
            if (cVal.includes('S')) cleanCVal = 'S';
            const dVal = dArr[i] || '';
            if (cleanCVal !== '' && cleanCVal === dVal) match++;
        }
        return (match === 4);
    } else if (phan === '3') {
        const aClean = String(item.chon || '').replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
        const dClean = String(item.dung || '').replace(/'/g, '').replace(/,/g, '.').replace(/\s/g, '').toLowerCase();
        return (aClean !== '' && aClean === dClean);
    }

    return false;
}


function getAccountPasswordState(row) {
    if (typeof row?.must_change_password !== 'boolean') return 'KhongXacDinh';
    return row.must_change_password ? 'MacDinh' : 'DaDoi';
}

const GV_SESSION_FIELDS = ['id', 'ma_gv', 'ho_ten', 'quyen', 'truong_id', 'truong_ten', 'mon_id'];

function safeGvProfile(source) {
    return GV_SESSION_FIELDS.reduce((profile, field) => {
        if (source && Object.prototype.hasOwnProperty.call(source, field)) profile[field] = source[field];
        return profile;
    }, {});
}

function isStoredSessionExpired(expiry) {
    const expiresAt = new Date(expiry).getTime();
    return !expiry || Number.isNaN(expiresAt) || expiresAt <= Date.now();
}

function getAdminToken() {
    const token = sessionStorage.getItem('damSan_AdminToken');
    return token && !isStoredSessionExpired(sessionStorage.getItem('damSan_AdminExpiresAt')) ? token : null;
}

function getStaffToken() {
    const token = sessionStorage.getItem('damSan_StaffToken');
    return token && !isStoredSessionExpired(sessionStorage.getItem('damSan_StaffExpiresAt')) ? token : null;
}

function clearAdminSession() {
    sessionStorage.removeItem('damSan_AdminToken');
    sessionStorage.removeItem('damSan_AdminExpiresAt');
}

function clearStaffSession() {
    sessionStorage.removeItem('damSan_StaffToken');
    sessionStorage.removeItem('damSan_StaffExpiresAt');
}

function clearControlSessions() {
    clearAdminSession();
    clearStaffSession();
}

function isAccountManagementActive() {
    return Boolean(
        document.getElementById('quanLyTK')
            ?.classList.contains('active')
    );
}

function clearAccountRuntimeState() {
    sessionStorage.removeItem('cache_students');
    allStudents = [];
    allTeachers = [];
    currentStudentFilter = 'TatCa';
}

function clearGvSessionAndReturnToLogin(message) {
    clearAccountRuntimeState();
    clearControlSessions();
    sessionStorage.removeItem('damSan_GVSession');
    window.tempGvData = null;
    window.tempGvCurrentPasswordHash = null;
    if (message) alert(message);
    location.reload();
}

function ensureControlSession(role) {
    const message = role === 'admin'
        ? 'Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.'
        : 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
    const token = role === 'admin' ? getAdminToken() : getStaffToken();
    if (!token) {
        clearGvSessionAndReturnToLogin(message);
        throw new Error(message);
    }
    return token;
}

async function adminRpc(action, payload) {
    const token = ensureControlSession('admin');
    const { data, error } = await sb.rpc('rpc_admin_control', { p_admin_token: token, p_action: action, p_payload: payload || {} });
    if (data?.code === 'admin_session_invalid') {
        clearGvSessionAndReturnToLogin('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');
        throw new Error('admin_session_invalid');
    }
    if (error) throw error;
    if (!data || data.status !== 'success') throw new Error(data?.message || 'Thao tác quản trị thất bại.');
    return data;
}

async function adminImportAccounts(kind, rows) {
    const token = ensureControlSession('admin');
    const { data, error } = await sb.rpc('rpc_admin_import_accounts', {
        p_admin_token: token,
        p_kind: kind,
        p_rows: rows
    });
    if (data?.code === 'admin_session_invalid') {
        clearGvSessionAndReturnToLogin('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');
        throw new Error('admin_session_invalid');
    }
    if (error) throw error;
    if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Nạp danh sách tài khoản thất bại.');
    }
    return data;
}

async function staffRpc(rpcName, args) {
    const token = ensureControlSession('staff');
    const { data, error } = await sb.rpc(rpcName, { p_staff_token: token, ...args });
    if (data?.code === 'staff_session_invalid') {
        clearGvSessionAndReturnToLogin('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
        throw new Error('staff_session_invalid');
    }
    if (error) throw error;
    return data;
}

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
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'); 
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
        try {
            gvData = safeGvProfile(JSON.parse(gvSession));
            sessionStorage.setItem('damSan_GVSession', JSON.stringify(gvData));
            const hasValidStaffSession = Boolean(getStaffToken());
            const hasValidAdminSession = gvData.quyen !== 'Admin' || Boolean(getAdminToken());
            if (!hasValidStaffSession || !hasValidAdminSession) {
                clearControlSessions();
                sessionStorage.removeItem('damSan_GVSession');
                gvData = null;
            }
        } catch (e) {
            clearControlSessions();
            sessionStorage.removeItem('damSan_GVSession');
            gvData = null;
        }
    }
    if (gvData) {
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

/* =======================================================
   LOGIC ĐĂNG NHẬP & BẢO MẬT
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
        
        const { data, error } = await sb.rpc('rpc_login_giao_vien', {
            p_ma_gv: user,
            p_mat_khau: hashedPass
        });
        
        if (error || !data || data.status !== 'success') {
            msg.innerText = "❌ Sai Tài khoản hoặc Mật khẩu!";
            btn.innerText = "🔐 QUẢN TRỊ HỆ THỐNG"; btn.disabled = false;
        } else {
            const userData = data.user;
            if (data.must_change_password === true || userData.must_change_password === true) {
                window.tempGvData = userData;
                window.tempGvCurrentPasswordHash = hashedPass;
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

function hoanTatDangNhap(loginData) {
    const user = loginData.user || loginData;
    if (!loginData.staff_token || isStoredSessionExpired(loginData.staff_expires_at)) {
        clearControlSessions();
        throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
    }
    if (user.quyen === 'Admin' && (!loginData.admin_token || isStoredSessionExpired(loginData.admin_expires_at))) {
        clearControlSessions();
        throw new Error('Phiên quản trị không hợp lệ. Vui lòng đăng nhập lại.');
    }
    gvData = safeGvProfile(user);
    clearAccountRuntimeState();
    sessionStorage.setItem('damSan_StaffToken', loginData.staff_token);
    sessionStorage.setItem('damSan_StaffExpiresAt', loginData.staff_expires_at);
    if (user.quyen === 'Admin') {
        sessionStorage.setItem('damSan_AdminToken', loginData.admin_token);
        sessionStorage.setItem('damSan_AdminExpiresAt', loginData.admin_expires_at);
    } else clearAdminSession();
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

    let passwordChanged = false;
    try {
        let hashedNewPass = await hashPassword(pass1);
        let uid = window.tempGvData.id;
        
        const currentHash = window.tempGvCurrentPasswordHash;
        if (!currentHash) throw new Error('Không còn thông tin xác thực tạm thời. Vui lòng đăng nhập lại.');
        let { data: changed, error } = await sb.rpc('rpc_change_giao_vien_password', { p_gv_id: uid, p_truong_id: window.tempGvData.truong_id, p_current_password: currentHash, p_new_password: hashedNewPass });
        if (error || changed?.status !== 'success') throw error || new Error(changed?.message || 'Không thể cập nhật mật khẩu.');
        passwordChanged = true;

        const { data: loginData, error: loginError } = await sb.rpc('rpc_login_giao_vien', { p_ma_gv: window.tempGvData.ma_gv, p_mat_khau: hashedNewPass });
        if (loginError || loginData?.status !== 'success') throw loginError || new Error(loginData?.message || 'Không thể tạo phiên mới.');
        hoanTatDangNhap(loginData);
        window.tempGvCurrentPasswordHash = null;
        window.tempGvData = null;
        alert("✅ Đổi mật khẩu thành công! Chào mừng bạn đến với hệ thống.");

    } catch (err) {
        if (passwordChanged) {
            clearGvSessionAndReturnToLogin('Mật khẩu đã được đổi nhưng không thể tạo phiên mới. Vui lòng đăng nhập lại.');
            return;
        }
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

    let passwordChanged = false;
    try {
        let hashedOld = await hashPassword(oldPass);
        let hashedNew = await hashPassword(newPass);

        let { data, error: errUpdate } = await sb.rpc('rpc_change_giao_vien_password', { p_gv_id: gvData.id, p_truong_id: gvData.truong_id, p_current_password: hashedOld, p_new_password: hashedNew });
        if (errUpdate || data?.status !== 'success') throw errUpdate || new Error(data?.message || "Mật khẩu hiện tại không đúng!");
        passwordChanged = true;

        const { data: loginData, error: loginError } = await sb.rpc('rpc_login_giao_vien', { p_ma_gv: gvData.ma_gv, p_mat_khau: hashedNew });
        if (loginError || loginData?.status !== 'success') throw loginError || new Error(loginData?.message || 'Không thể tạo phiên mới.');
        hoanTatDangNhap(loginData);
        document.getElementById('oldPassPro').value = '';
        document.getElementById('newPassPro').value = '';
        document.getElementById('confirmNewPassPro').value = '';
        document.getElementById('changePassModal').style.display = 'none';
        alert("✅ Đổi mật khẩu thành công! Phiên làm việc đã được cập nhật.");

    } catch (err) {
        if (passwordChanged) {
            clearGvSessionAndReturnToLogin('Mật khẩu đã được đổi nhưng không thể tạo phiên mới. Vui lòng đăng nhập lại.');
            return;
        }
        alert("❌ Lỗi: " + err.message);
        btn.innerText = oldBtnText; btn.disabled = false;
    }
}

async function dangXuatGV() {
    if(confirm("Bạn có chắc chắn muốn đăng xuất?")) {
        const staffToken = sessionStorage.getItem('damSan_StaffToken');
        const adminToken = sessionStorage.getItem('damSan_AdminToken');
        const requests = [];
        if (staffToken) requests.push(sb.rpc('rpc_staff_logout', { p_staff_token: staffToken }));
        if (adminToken) requests.push(sb.rpc('rpc_admin_logout', { p_admin_token: adminToken }));
        await Promise.allSettled(requests);
        clearControlSessions();
        clearAccountRuntimeState();
        sessionStorage.removeItem('damSan_GVSession');
        localStorage.removeItem('damSan_Workspace');
        localStorage.removeItem('damSan_WorkspaceSchool');
        window.tempGvData = null;
        window.tempGvCurrentPasswordHash = null;
        location.reload();
    }
}

/* =======================================================
   LOGIC KHỞI TẠO DỮ LIỆU CHUNG & GIAO DIỆN
======================================================= */
async function khoiTaoWorkspace() {
    let {data: mons} = await sb.from('mon_hoc').select('*').order('created_at', {ascending: true});
    let sysMonList = mons || new Array();
    let {data: truongs} = await sb.from('truong_hoc').select('id, ten_truong').order('ten_truong', {ascending: true});
    let sysTruongList = truongs || new Array();

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
            let schoolSel = `<select id="workspaceSchoolSelector" onchange="changeWorkspaceSchool(this.value)" style="padding: 6px; border-radius: 6px; border: 2px solid #27ae60; font-weight: bold; color: #196f3d; outline: none; background: #e8f5e9; cursor: pointer;">`;
            schoolSel += `<option value="ALL">🌎 TẤT CẢ TRƯỜNG</option>`;
            sysTruongList.forEach(t => { schoolSel += `<option value="${t.id}">🏫 ${t.ten_truong}</option>`; });
            schoolSel += `</select>`;
            wsDiv.innerHTML = `<span style="font-size: 13px; color: #5f6368; font-weight: bold;">Trường:</span> ${schoolSel}<span style="font-size: 13px; color: #5f6368; font-weight: bold;">Môn:</span> ${sel}`;

            const storedMon = localStorage.getItem('damSan_Workspace');
            activeWorkspaceMonId = sysMonList.some((m) => m.id === storedMon) ? storedMon : 'ALL';
            if (activeWorkspaceMonId === 'ALL' && storedMon && storedMon !== 'ALL') localStorage.setItem('damSan_Workspace', 'ALL');
            const storedSchool = localStorage.getItem('damSan_WorkspaceSchool');
            activeWorkspaceTruongId = sysTruongList.some((t) => t.id === storedSchool) ? storedSchool : (sysTruongList.some((t) => t.id === gvData.truong_id) ? gvData.truong_id : 'ALL');
        } else {
            let tenMon = "Chưa phân công";
            let myMon = sysMonList.find(x => x.id === gvData.mon_id);
            if(myMon) tenMon = myMon.ten_mon;
            activeWorkspaceMonId = gvData.mon_id;
            activeWorkspaceTruongId = gvData.truong_id;
            
            wsDiv.innerHTML = `<span style="font-size: 13px; color: #5f6368; font-weight: bold;">Bộ môn:</span> <span style="background: #e8f5e9; color: #27ae60; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px dashed #27ae60;">${tenMon}</span>`;
        }
        headerUser.insertBefore(wsDiv, headerUser.firstChild);

        if(gvData.quyen === 'Admin') {
            document.getElementById('workspaceSelector').value = activeWorkspaceMonId;
            document.getElementById('workspaceSchoolSelector').value = activeWorkspaceTruongId;
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
    syncFlexLiteAssessmentPanel('direct');
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
        if (gvData.quyen === 'Admin') { fetchStudents(true); fetchTeachers(true); }
        taiDanhSachPhong(); 
        
        // Kích hoạt ngay chức năng Auto-Refresh 5s từ giao diện HTML
        toggleAutoRefresh();

        // Kích hoạt thêm kênh Realtime dự phòng (nếu Supabase của bạn đã bật)
        kichHoatLienKetRealtimeGiaoVien();
    } catch(e){
        console.error("Lỗi khởi tạo:", e);
    }
}

// =======================================================
// CƠ CHẾ AUTO-REFRESH 5 GIÂY (CHỐNG MÙ BẢNG ĐIỂM)
// =======================================================
function toggleAutoRefresh() {
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
    let currentRoom = getSelectedRoom('dashMaPhong');
    
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

    let assessmentType = currentRoom?.assessment_type || 'LEGACY';
    let scoringConfig = currentRoom?.scoring_config || {};

    displayList.forEach(hs => {
        let isSubmitted = (hs.Diem !== null && hs.Diem !== undefined && hs.Diem !== "-");
        const scorePres = computeDisplayPartContributions(hs, assessmentType, scoringConfig);

        if(hs.ChiTiet && isSubmitted) {
            try {
                let ct;
                if (chiTietCache.has(hs.ChiTiet)) {
                    ct = chiTietCache.get(hs.ChiTiet);
                } else {
                    ct = typeof hs.ChiTiet === 'string' ? JSON.parse(hs.ChiTiet) : hs.ChiTiet;
                    chiTietCache.set(hs.ChiTiet, ct);
                }

                const entries = Array.isArray(ct) ? ct : Object.entries(ct).map(([k, v]) => ({ key: k, ...v }));
                entries.forEach((item, idx) => {
                    const k = item.key || item.q || String(idx + 1);
                    let isDung = isQuestionFullyCorrectFromServerDetail(item);
                    if(!isDung) {
                        failCount[k] = (failCount[k] || 0) + 1;
                        if (item.noiDungCau) failCount[k+"_txt"] = item.noiDungCau;
                    }
                });
            } catch(e){}
        }

        if (scorePres.isSubmitted) {
            submittedCount++;
            let diemFloat = scorePres.finalScore;
            sum += diemFloat;
            if(diemFloat >= 5.0) passed++;

            if (diemFloat >= 8.0) countGioi++;
            else if (diemFloat >= 6.5) countKha++;
            else if (diemFloat >= 5.0) countTB++;
            else countYeu++;
        }

        let total = scorePres.isSubmitted ? scorePres.finalDisplay : "-";
        let p1Display = scorePres.isSubmitted ? (typeof scorePres.p1 === 'number' ? scorePres.p1.toFixed(2) : scorePres.p1) : "-";
        let p2Display = scorePres.isSubmitted ? (typeof scorePres.p2 === 'number' ? scorePres.p2.toFixed(2) : scorePres.p2) : "-";
        let p3Display = scorePres.isSubmitted ? (typeof scorePres.p3 === 'number' ? scorePres.p3.toFixed(2) : scorePres.p3) : "-";

        let badgeClass = '';
        if(scorePres.isSubmitted) {
            let score = scorePres.finalScore;
            if(score >= 8.0) badgeClass = 'bg-gioi';
            else if(score >= 6.5) badgeClass = 'bg-kha';
            else if(score >= 5.0) badgeClass = 'bg-tb';
            else badgeClass = 'bg-yeu';
        }

        let scoreHtml = scorePres.isSubmitted ? `<span class="badge-score ${badgeClass}">${total}</span>` : `<span style="color:#95a5a6; font-weight:bold;">${total}</span>`;
        let trStyle = scorePres.isSubmitted && scorePres.finalScore < 5.0 ? 'background-color: #fdf2e9;' : '';

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
            <td>${p1Display}</td>
            <td>${p2Display}</td>
            <td>${p3Display}</td>
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
            const selectedRoom = getSelectedRoom('dashMaPhong');
            const changedRoomId = payload.new?.phong_id || payload.old?.phong_id;
            if (selectedRoom && changedRoomId && String(selectedRoom.id) === String(changedRoomId)) {
                if (window.autoDashTimeout) clearTimeout(window.autoDashTimeout);
                window.autoDashTimeout = setTimeout(() => {
                    fetchDashboard(true);
                }, 3000); 
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'phong_thi' }, payload => {
            if (window.autoRadarTimeout) clearTimeout(window.autoRadarTimeout);
            window.autoRadarTimeout = setTimeout(() => fetchRadar(), 3000);
        })
        .subscribe();
}

/* =======================================================
   LOGIC CHUYỂN TAB VÀ SIDEBAR MENU 
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
    syncFlexLiteAssessmentPanel(mode);
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

/* =======================================================
   BÓC TÁCH WORD HYBRID (TRẢI PHẲNG CÂU CHÙM + KIỂM DỊCH)
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
                currentParams.assessmentConfig = snapshotFlexLiteAssessmentConfig();
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
            baiHoc: document.getElementById('baiHocNap') ? document.getElementById('baiHocNap').value.trim() : '',
            assessmentConfig: mode === 'direct' ? snapshotFlexLiteAssessmentConfig() : null
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

            validateFlexLiteAssessmentForSave(danhSachDeThi, params.assessmentConfig);

            logEl.innerText = "Đang đẩy dữ liệu lên máy chủ Supabase...";
            let pushRes = await luuDeThiLenSupabase(danhSachDeThi, params.assessmentConfig);
            if (pushRes.status === 'success') {
                logEl.innerText = `✅ HOÀN TẤT! Đã trộn ${params.soLuong} đề và đẩy an toàn vào phòng [${params.maPhong}].`;
            } else {
                throw new Error(pushRes.message);
            }

        } else if (mode === 'bank') {
            if (!params.baiHoc) throw new Error("Vui lòng nhập Tên Bài Học / Chủ Đề!");

            logEl.innerText = "Đang lưu trữ vào Ngân hàng...";
            let dataToInsert = cauHoiGoc.map(q => ({
                bai_hoc: params.baiHoc,
                phan: String(q.Phan),
                muc_do: q.MucDo,
                noi_dung: q.NoiDung,
                a: q.DapAnA || "", b: q.DapAnB || "", c: q.DapAnC || "", d: q.DapAnD || "",
                dap_an_dung: q.DapAnDung || "",
                loi_giai: ""
            }));

            await bankWrite('insert', { rows: dataToInsert });

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

/* =======================================================
   TRỘN ĐỀ VÀ TIỆN ÍCH
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
    
    const assessmentConfig = snapshotFlexLiteAssessmentConfig();
    generateExams(danhSachThuCong, soLuongDe, maPhong, startCode, stepCode); 
    
    try {
        validateFlexLiteAssessmentForSave(danhSachDeThi, assessmentConfig);
    } catch (valErr) {
        btn.innerText = oldText;
        btn.disabled = false;
        return alert("❌ Lỗi cấu hình thang điểm: " + valErr.message);
    }

    luuDeThiLenSupabase(danhSachDeThi, assessmentConfig).then(data => {
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

function getRoomTargetSchoolId(room) {
    if (gvData.quyen === 'Admin' && room?.truong_id) return room.truong_id;
    return gvData.truong_id;
}

async function refreshWorkspaceSelectors() {
    const [monsResult, schoolsResult] = await Promise.all([
        sb.from('mon_hoc').select('id, ten_mon, created_at').order('created_at', {ascending: true}),
        sb.from('truong_hoc').select('id, ma_truong, ten_truong, created_at').order('ten_truong', {ascending: true})
    ]);
    g_sysMonList = monsResult.data || [];
    g_sysTruongList = schoolsResult.data || [];
    if (activeWorkspaceTruongId !== 'ALL' && !g_sysTruongList.some((t) => t.id === activeWorkspaceTruongId)) { activeWorkspaceTruongId = 'ALL'; localStorage.setItem('damSan_WorkspaceSchool', 'ALL'); clearAccountRuntimeState(); }
    if (activeWorkspaceMonId !== 'ALL' && !g_sysMonList.some((m) => m.id === activeWorkspaceMonId)) { activeWorkspaceMonId = 'ALL'; localStorage.setItem('damSan_Workspace', 'ALL'); }
    const schoolSelect = document.getElementById('workspaceSchoolSelector');
    const monSelect = document.getElementById('workspaceSelector');
    if (gvData?.quyen === 'Admin' && schoolSelect && monSelect) {
        schoolSelect.innerHTML = `<option value="ALL">🌎 TẤT CẢ TRƯỜNG</option>${g_sysTruongList.map((t) => `<option value="${t.id}">🏫 ${t.ten_truong}</option>`).join('')}`;
        monSelect.innerHTML = `<option value="ALL">🌎 TỔNG QUAN TẤT CẢ CÁC MÔN</option>${g_sysMonList.map((m) => `<option value="${m.id}">📚 Môn: ${m.ten_mon}</option>`).join('')}`;
        schoolSelect.value = activeWorkspaceTruongId; monSelect.value = activeWorkspaceMonId;
    }
}

function changeWorkspaceSchool(truongId) {
    activeWorkspaceTruongId = truongId;
    localStorage.setItem('damSan_WorkspaceSchool', truongId);
    danhSachDeThi = new Array(); danhSachThuCong = new Array();
    clearAccountRuntimeState();
    if(document.getElementById('dashBody')) document.getElementById('dashBody').innerHTML = '<tr><td colspan="10">Chưa có dữ liệu...</td></tr>';
    loadMetaData();
    taiDanhSachPhong();
    fetchRadar();
    loadBankMeta(true);
    fetchFullBank(true);
    if (document.getElementById('quanLyTK')?.classList.contains('active')) { fetchStudents(true); fetchTeachers(true); }
}

function getExamTargetSchoolId(maPhong) {
    if (gvData.quyen !== 'Admin') return gvData.truong_id;
    const candidates = (allRoomsData || []).filter((room) => String(room.MaPhong).trim() === String(maPhong).trim());
    const selectedRoom = getSelectedRoom('ctrlMaPhong');
    if (selectedRoom && String(selectedRoom.MaPhong).trim() === String(maPhong).trim()) return selectedRoom.truong_id;
    const scopedRoom = candidates.find((room) => room.truong_id === activeWorkspaceTruongId);
    if (scopedRoom) return scopedRoom.truong_id;
    if (candidates.length > 1) throw new Error('Có nhiều phòng cùng mã. Vui lòng chọn phòng cụ thể theo trường đích.');
    if (candidates.length === 1) return candidates[0].truong_id;
    if (!activeWorkspaceTruongId || activeWorkspaceTruongId === 'ALL') throw new Error('Vui lòng chọn TRƯỜNG ĐÍCH cụ thể trước khi tạo phòng thi mới.');
    return activeWorkspaceTruongId;
}

function getSelectedRoom(selectElementOrId) {
    const select = typeof selectElementOrId === 'string' ? document.getElementById(selectElementOrId) : selectElementOrId;
    if (!select?.value) return null;
    return (allRoomsData || []).find((room) => String(room.id) === String(select.value)) || null;
}

async function luuDeThiLenSupabase(deThiArray, assessmentConfig = null) {
    if(deThiArray.length === 0) return {status: 'success'};
    let maPhong = deThiArray[0].MaPhong;

    if (assessmentConfig) {
        validateFlexLiteAssessmentForSave(deThiArray, assessmentConfig);
    }

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
        let rowObj = { ma_de: String(ma_de), cau_so: cauSoArr };
        if (assessmentConfig && typeof assessmentConfig === 'object') {
            rowObj.assessment_type = assessmentConfig.assessment_type;
            rowObj.scoring_config = assessmentConfig.scoring_config;
        }
        rowsToInsert.push(rowObj);
    }

    let rpcMonId = (activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") ? activeWorkspaceMonId : null;
    let rpcData = await staffRpc('rpc_luu_de_thi_len_phong', {
        p_ma_gv: gvData.ma_gv,
        p_truong_id: getExamTargetSchoolId(maPhong),
        p_mon_id: rpcMonId,
        p_ma_phong: maPhong,
        p_de_thi: rowsToInsert
    });

    if (!rpcData || rpcData.status !== 'success') throw new Error(rpcData?.message || "Khong luu duoc de thi len phong");
    return {status: 'success'};
}

async function xemTruocDeThi() {
    const room = getSelectedRoom('ctrlMaPhong');
    if (!room) {
        alert("⚠️ Vui lòng chọn phòng thi cụ thể trước khi xem trước đề!");
        return { status: 'no_room' };
    }

    return runRoomControlAction('preview', async () => {
        try {
            let data = await staffRpc('rpc_staff_exam_preview', { p_phong_id: room.id });
            if (!data || data.status !== 'success') {
                const reason = data?.message || "Không thể tải đề thi xem trước.";
                alert("Lỗi khi tải đề thi: " + reason);
                return { status: 'error', error: new Error(reason) };
            }
            let exams = data.exams || [];

            if (exams.length === 0) {
                console.warn("⚠️ Phòng này tồn tại nhưng bảng de_thi không có dữ liệu cho phong_id:", room.id);
                alert("Phòng này hiện tại Trống! Chưa có câu hỏi nào được trộn và đẩy lên.");
                return { status: 'no_data' };
            }

            previewExamData = exams;
            let uniqueMaDe = Array.from(new Set(exams.map(e => e.ma_de))).sort();
            let selectHtml = '';
            uniqueMaDe.forEach(md => { selectHtml += '<option value="' + md + '">MÃ ĐỀ: ' + md + '</option>'; });

            document.getElementById('previewMaDeSelect').innerHTML = selectHtml;
            document.getElementById('previewModal').style.display = 'flex';
            renderPreviewContent();
            return { status: 'success', data };
        } catch (e) {
            alert("Lỗi khi tải đề thi: " + e.message);
            return { status: 'error', error: e };
        }
    });
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
        let iframeOrigin = window.location.origin;
        try {
            let parsed = new URL(iframeEl.src, window.location.href);
            iframeOrigin = parsed.origin && parsed.origin !== "null" ? parsed.origin : window.location.origin;
        } catch (e) {}
        if (!iframeOrigin || iframeOrigin === "null") {
            throw new Error("Bridge tron de chi ho tro khi chay qua http/https cung origin, khong tra du lieu qua origin null.");
        }
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

        const assessmentConfig = snapshotFlexLiteAssessmentConfig();
        validateFlexLiteAssessmentForSave(danhSachDeIframe, assessmentConfig);

        let oldText = btnElement ? btnElement.innerText : "";
        if (btnElement) btnElement.innerText = "⏳ ĐANG HÚT & ĐẨY LÊN...";
        if (btnElement) btnElement.disabled = true;

        let result = await luuDeThiLenSupabase(danhSachDeIframe, assessmentConfig);
        
        if (btnElement) btnElement.innerText = oldText;
        if (btnElement) btnElement.disabled = false;

        if (result.status === 'success') {
            alert(`🎉 HOÀN TẤT! Đã đẩy thành công ${danhSachDeIframe.length} câu vào phòng [${maPhong}].`);
        } else {
            alert("❌ Lỗi Supabase: " + result.message);
        }
    } catch (e) {
        if (btnElement) btnElement.innerText = "🚀 Hút đề & Đẩy";
        if (btnElement) btnElement.disabled = false;
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
        const assessmentConfig = snapshotFlexLiteAssessmentConfig();
        generateExams(selectedQuestions, soLuongDe, maPhong, startCode, stepCode);
        validateFlexLiteAssessmentForSave(danhSachDeThi, assessmentConfig);
        
        logEl.innerText = "Đang đồng bộ dữ liệu với máy chủ...";
        let pushRes = await luuDeThiLenSupabase(danhSachDeThi, assessmentConfig);
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

function getBankWorkspaceContext(options) {
    const opts = options || {};
    if (gvData.quyen !== 'Admin') {
        if (!gvData.mon_id) {
            throw new Error("Giáo viên chưa được phân công bộ môn. Vui lòng liên hệ Admin để được gán môn.");
        }
        return {
            schoolId: gvData.truong_id,
            monId: gvData.mon_id
        };
    }

    const schoolId = activeWorkspaceTruongId;
    const monId = activeWorkspaceMonId;

    if (opts.isWrite) {
        if (!schoolId || schoolId === 'ALL') {
            throw new Error("Vui lòng chọn TRƯỜNG ĐÍCH cụ thể để quản lý ngân hàng câu hỏi.");
        }
        if (!opts.allowAllSubjects && (!monId || monId === 'ALL')) {
            throw new Error("Vui lòng chọn BỘ MÔN cụ thể để quản lý ngân hàng câu hỏi.");
        }
    } else {
        if (!schoolId || schoolId === 'ALL' || !monId || monId === 'ALL') {
            return null;
        }
    }

    return { schoolId, monId };
}

async function bankRead() {
    const context = getBankWorkspaceContext({ isWrite: false });
    if (!context || !context.schoolId || !context.monId || context.schoolId === 'ALL' || context.monId === 'ALL') {
        fullBankData = [];
        availableBaiHocs = [];
        if (document.getElementById("matrixBody")) document.getElementById("matrixBody").innerHTML = '';
        if (document.getElementById("filterBaiHoc")) document.getElementById("filterBaiHoc").innerHTML = '<option value="">Tất cả</option>';
        if (document.getElementById("bankTableBody")) document.getElementById("bankTableBody").innerHTML = '<tr><td colspan="7">Vui lòng chọn trường và môn học cụ thể để xem ngân hàng câu hỏi.</td></tr>';
        return [];
    }

    const data = await staffRpc('rpc_giao_vien_bank_read', {
        p_ma_gv: gvData.ma_gv,
        p_truong_id: context.schoolId,
        p_mon_id: context.monId
    });

    if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Không thể tải ngân hàng câu hỏi');
    }

    return data.rows || [];
}

async function bankWrite(action, payload = {}) {
    if (gvData.quyen === 'Admin') {
        if (action === 'delete_all') {
            const context = getBankWorkspaceContext({ isWrite: true, allowAllSubjects: true });
            return await adminRpc('bank_delete_all', { truong_id: context.schoolId });
        }
        const context = getBankWorkspaceContext({ isWrite: true });
        if (action === 'insert') {
            const rows = (payload.rows || []).map(r => ({
                ...r,
                truong_id: context.schoolId,
                mon_id: context.monId
            }));
            return await adminRpc('bank_insert', { rows });
        }
        if (action === 'update') {
            return await adminRpc('bank_update', payload);
        }
        if (action === 'delete_ids') {
            return await adminRpc('bank_delete_ids', payload);
        }
        if (action === 'delete_filter') {
            return await adminRpc('bank_delete_filter', {
                ...payload,
                truong_id: context.schoolId,
                mon_id: context.monId
            });
        }
        throw new Error("Hành động ngân hàng không hợp lệ: " + action);
    }

    if (action === 'delete_all') {
        throw new Error("Chỉ Admin mới có quyền xóa toàn bộ ngân hàng câu hỏi của trường.");
    }
    const context = getBankWorkspaceContext({ isWrite: true });
    const data = await staffRpc('rpc_giao_vien_bank_write', {
        p_ma_gv: gvData.ma_gv,
        p_truong_id: context.schoolId,
        p_action: action,
        p_payload: payload
    });
    if (!data || data.status !== 'success') {
        throw new Error(data?.message || 'Lỗi thao tác ngân hàng câu hỏi');
    }
    return data;
}

async function loadBankMeta() {
    try {
        const rows = await bankRead();
        const uniqueBaiHoc = Array.from(new Set((rows || []).map(d => d.bai_hoc).filter(Boolean)));
        processBankMeta({ baiHocs: uniqueBaiHoc });
    } catch (err) {
        console.error("loadBankMeta error:", err);
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
    try {
        const rows = await bankRead();
        fullBankData = (rows || []).map(q => ({ id: q.id, baiHoc: q.bai_hoc, phan: q.phan, mucDo: q.muc_do, noiDung: q.noi_dung, A: q.a, B: q.b, C: q.c, D: q.d, dapAnDung: q.dap_an_dung, LoiGiai: q.loi_giai }));
        renderBankTable();
    } catch (err) {
        document.getElementById("bankTableBody").innerHTML = `<tr><td colspan="7">❌ Lỗi: ${err.message}</td></tr>`;
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
    try {
        await bankWrite('delete_ids', { ids: [id] });
        fetchFullBank(true);
    } catch (e) {
        alert("Lỗi: " + e.message);
        btnElement.innerText = "Xóa";
        btnElement.disabled = false;
    }
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

    try {
        await bankWrite('update', { id: document.getElementById("editID").value, fields: updateData });
        document.getElementById("editModal").style.display = "none";
        fetchFullBank(true);
    } catch (e) {
        alert("Lỗi: " + e.message);
    } finally {
        btn.innerText = "💾 Lưu Thay Đổi";
        btn.disabled = false;
    }
}

/* =======================================================
   ĐIỀU HÀNH & QUẢN LÝ PHÒNG THI
======================================================= */
async function loadMetaData() {
    const targetSchoolId = getActiveTargetSchoolId();
    let data = null;
    if (targetSchoolId) ({data} = await sb.from('hoc_sinh').select('lop').eq('truong_id', targetSchoolId));
    let sel = document.getElementById('ctrlDoiTuong'); let html = '<option value="TatCa">🌎 Tất cả (Mặc định)</option>'; 
    if(data) {
        let lops = Array.from(new Set(data.map(d=>d.lop))).filter(Boolean).sort();
        g_danhSachLopCache = lops; 
        lops.forEach(l => { if(l) html += `<option value="${l}">🏷️ Đối tượng: ${l}</option>`; }); 
        if(sel) sel.innerHTML = html;
        if(allRoomsData && allRoomsData.length > 0) fetchRadar(); 
    }
}

// ==========================================================
// ROOM CONTROL ACTION STATE & RELIABILITY HELPERS (FLEX-LITE-007)
// ==========================================================

const ROOM_CONTROL_FEEDBACK_DELAY_MS = 800;
const ROOM_CONTROL_NEUTRAL_STATUSES = new Set(['cancelled', 'no_room', 'no_data', 'no_selection', 'stale', 'skipped']);

const ROOM_CONTROL_ACTIONS = {
    reload: {
        id: 'roomReloadBtn',
        normal: '🔄 Tải lại',
        busy: '⏳ Đang tải...',
        success: '✅ Đã tải',
        error: '❌ Tải lỗi'
    },
    open: {
        id: 'roomOpenBtn',
        normal: '🟢 Mở Phòng (Đếm giờ)',
        busy: '⏳ Đang mở phòng...',
        success: '✅ Đã mở phòng',
        error: '❌ Mở phòng lỗi'
    },
    lock: {
        id: 'roomLockBtn',
        normal: '🔴 Khóa Phòng & Ép Thu Bài',
        busy: '⏳ Đang khóa phòng...',
        success: '✅ Đã khóa phòng',
        error: '❌ Khóa phòng lỗi'
    },
    publish_score: {
        id: 'roomPublishScoreBtn',
        normal: '📊 Công Bố Điểm Tổng',
        busy: '⏳ Đang công bố...',
        success: '✅ Đã công bố điểm',
        error: '❌ Công bố điểm lỗi'
    },
    publish_answer: {
        id: 'roomPublishAnswerBtn',
        normal: '👁️ Công Bố Đáp Án',
        busy: '⏳ Đang công bố...',
        success: '✅ Đã công bố đáp án',
        error: '❌ Công bố đáp án lỗi'
    },
    preview: {
        id: 'roomPreviewBtn',
        normal: '🔍 Xem trước Đề trong phòng',
        busy: '⏳ Đang tải đề...',
        success: '✅ Đã mở xem trước',
        error: '❌ Xem trước lỗi'
    },
    radar_refresh: {
        id: 'roomRadarRefreshBtn',
        normal: '🔄 Quét lại Radar',
        busy: '⏳ Đang quét...',
        success: '✅ Radar đã cập nhật',
        error: '❌ Quét Radar lỗi'
    },
    batch_open: {
        id: 'roomBatchOpenBtn',
        normal: '🟢 Mở các phòng đã chọn',
        busy: '⏳ Đang mở...',
        success: '✅ Đã mở các phòng',
        error: '❌ Mở phòng lỗi'
    },
    batch_lock: {
        id: 'roomBatchLockBtn',
        normal: '🔴 Khóa các phòng đã chọn',
        busy: '⏳ Đang khóa...',
        success: '✅ Đã khóa các phòng',
        error: '❌ Khóa phòng lỗi'
    }
};

const activeRoomControlActions = new Set();
const activeRoomMutationIds = new Set();

function setRoomControlActionStateOnElement(btn, actionKeyOrBtnId, state, customLabels = null) {
    if (!btn) return;
    let cfg = ROOM_CONTROL_ACTIONS[actionKeyOrBtnId] || customLabels;
    if (!cfg) return;

    if (state === 'busy') {
        btn.innerText = cfg.busy;
        btn.disabled = true;
        if (btn.setAttribute) {
            btn.setAttribute('aria-busy', 'true');
            btn.setAttribute('data-action-state', 'busy');
        }
    } else if (state === 'success') {
        btn.innerText = cfg.success;
        btn.disabled = true;
        if (btn.removeAttribute) btn.removeAttribute('aria-busy');
        if (btn.setAttribute) btn.setAttribute('data-action-state', 'success');
    } else if (state === 'error') {
        btn.innerText = cfg.error;
        btn.disabled = true;
        if (btn.removeAttribute) btn.removeAttribute('aria-busy');
        if (btn.setAttribute) btn.setAttribute('data-action-state', 'error');
    } else {
        btn.innerText = cfg.normal;
        btn.disabled = false;
        if (btn.removeAttribute) btn.removeAttribute('aria-busy');
        if (btn.setAttribute) btn.setAttribute('data-action-state', 'normal');
    }
}

function setRoomControlActionState(actionKeyOrBtnId, state, customLabels = null) {
    let btn = null;
    let cfg = ROOM_CONTROL_ACTIONS[actionKeyOrBtnId];
    if (cfg) {
        btn = document.getElementById(cfg.id);
    } else if (customLabels) {
        cfg = customLabels;
        btn = document.getElementById(customLabels.id || actionKeyOrBtnId);
    } else {
        btn = document.getElementById(actionKeyOrBtnId);
    }
    if (btn) {
        setRoomControlActionStateOnElement(btn, actionKeyOrBtnId, state, customLabels);
    }
}

function finishRoomControlAction(actionKeyOrBtnId, outcome, customLabels = null, targetBtn = null, actionToken = null) {
    if (ROOM_CONTROL_NEUTRAL_STATUSES.has(outcome)) {
        activeRoomControlActions.delete(actionKeyOrBtnId);
        if (targetBtn) {
            setRoomControlActionStateOnElement(targetBtn, actionKeyOrBtnId, 'normal', customLabels);
        } else {
            setRoomControlActionState(actionKeyOrBtnId, 'normal', customLabels);
        }
        return;
    }
    const state = (outcome === 'success') ? 'success' : 'error';
    if (targetBtn) {
        setRoomControlActionStateOnElement(targetBtn, actionKeyOrBtnId, state, customLabels);
    } else {
        setRoomControlActionState(actionKeyOrBtnId, state, customLabels);
    }
    setTimeout(() => {
        activeRoomControlActions.delete(actionKeyOrBtnId);
        if (targetBtn) {
            if (actionToken && targetBtn.getAttribute && targetBtn.getAttribute('data-action-token') !== actionToken) {
                return;
            }
            setRoomControlActionStateOnElement(targetBtn, actionKeyOrBtnId, 'normal', customLabels);
        } else {
            setRoomControlActionState(actionKeyOrBtnId, 'normal', customLabels);
        }
    }, ROOM_CONTROL_FEEDBACK_DELAY_MS);
}

async function runRoomControlAction(actionKey, actionFn, options = {}) {
    if (activeRoomControlActions.has(actionKey)) {
        return { status: 'skipped', reason: 'already_running' };
    }

    const targetRoomIds = options.roomIds ? (Array.isArray(options.roomIds) ? options.roomIds : [options.roomIds]).map(String) : [];
    if (targetRoomIds.length > 0) {
        const hasBusyRoom = targetRoomIds.some(id => activeRoomMutationIds.has(id));
        if (hasBusyRoom) {
            return { status: 'skipped', reason: 'room_busy' };
        }
        targetRoomIds.forEach(id => activeRoomMutationIds.add(id));
    }

    activeRoomControlActions.add(actionKey);

    const hasVisualFeedback = options.visualFeedback !== false;

    let targetBtn = null;
    let cfg = ROOM_CONTROL_ACTIONS[actionKey];
    if (cfg) {
        targetBtn = document.getElementById(cfg.id);
    } else if (options.customLabels) {
        targetBtn = document.getElementById(options.customLabels.id || actionKey);
    } else {
        targetBtn = document.getElementById(actionKey);
    }

    const actionToken = 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    if (targetBtn && targetBtn.setAttribute) {
        targetBtn.setAttribute('data-action-token', actionToken);
    }

    if (hasVisualFeedback && !options.manualBusy) {
        if (targetBtn) {
            setRoomControlActionStateOnElement(targetBtn, actionKey, 'busy', options.customLabels);
        } else {
            setRoomControlActionState(actionKey, 'busy', options.customLabels);
        }
    }

    let outcome = 'error';
    let result = null;
    try {
        result = await actionFn();
        if (result && ROOM_CONTROL_NEUTRAL_STATUSES.has(result.status)) {
            outcome = result.status;
        } else if (result && result.status === 'success') {
            outcome = 'success';
        } else if (result && result.status === 'error') {
            outcome = 'error';
        } else if (result === false) {
            outcome = 'error';
        } else {
            outcome = 'error';
        }
        return result;
    } catch (err) {
        outcome = 'error';
        console.error(`Lỗi room control action ${actionKey}:`, err);
        return { status: 'error', error: err };
    } finally {
        if (targetRoomIds.length > 0) {
            targetRoomIds.forEach(id => activeRoomMutationIds.delete(id));
        }
        if (hasVisualFeedback) {
            finishRoomControlAction(actionKey, outcome, options.customLabels, targetBtn, actionToken);
        } else {
            activeRoomControlActions.delete(actionKey);
        }
    }
}

async function reloadRoomListManually() {
    return runRoomControlAction('reload', async () => {
        const res = await taiDanhSachPhong();
        if (res && res.status === 'error') return { status: 'error', error: res.error };
        return { status: 'success' };
    });
}

async function refreshRadarManually() {
    return runRoomControlAction('radar_refresh', async () => {
        const res = await fetchRadar();
        if (res && res.status === 'error') return { status: 'error', error: res.error };
        return { status: 'success' };
    });
}

function renderRadarActionCell(r) {
    if (!r) return '';
    const isMoPhong = r.TrangThai === "MO_PHONG";
    const quickText = isMoPhong ? "Khóa" : "Mở lại";
    const quickAction = isMoPhong ? "THU_BAI" : "MO_PHONG";
    const quickModifier = isMoPhong ? "radar-action-lock" : "radar-action-open";

    return `<div class="radar-action-group">` +
        `<button id="roomQuickStateBtn-${r.id}" class="radar-action-btn ${quickModifier}" onclick="dieuKhienFast('${r.id}', '${quickAction}')">${quickText}</button>` +
        `<button id="roomDeleteExamBtn-${r.id}" class="radar-action-btn radar-action-delete-exam" onclick="xoaDeTrongPhong('${r.id}')" title="Chỉ xóa đề thi, giữ lại phòng">Xóa Đề</button>` +
        `<button id="roomDeleteAllBtn-${r.id}" class="radar-action-btn radar-action-delete-all" onclick="xoaPhongHoanToan('${r.id}')" title="Xóa toàn bộ phòng và dữ liệu">Xóa Sạch</button>` +
    `</div>`;
}

function getRadarStatusHtml(stt) {
    if (stt === "MO_PHONG") return "<span style='color:green;font-weight:bold;'>🟢 Đang Thi</span>";
    if (stt === "THU_BAI") return "<span style='color:red;font-weight:bold;'>🔴 Đã Khóa</span>";
    if (stt === "CONG_BO_DIEM") return "<span style='color:#3498db;font-weight:bold;'>📊 Công bố Điểm</span>";
    if (stt === "XEM_DAP_AN") return "<span style='color:#8e44ad;font-weight:bold;'>👁️ Công bố Đ.Án</span>";
    return stt || '';
}

function renderRadarRoomRowHtml(r) {
    let sttHtml = getRadarStatusHtml(r.TrangThai);
    let durationMin = r.ThoiGian || 45;
    let isMo = (r.TrangThai === "MO_PHONG");
    let displayVal = r.DoiTuong === 'TatCa' ? '🌎 Tất cả' : r.DoiTuong;
    let truongTag = (typeof gvData !== 'undefined' && gvData && gvData.quyen === 'Admin') ? `<div style="font-size:10px; color:#7f8c8d; margin-top:2px;">🏫 ${r.TenTruong}</div>` : '';

    return `<tr id="radar-row-${r.id}" data-room-id="${r.id}">` +
        `<td>` +
            `<div style="display:flex; align-items:center; gap:8px;">` +
                `<input type="checkbox" id="roomCheckbox-${r.id}" class="chk-Room" value="${r.id}" style="transform: scale(1.3); cursor:pointer;"> ` +
                `<b id="radarCode-${r.id}">${r.MaPhong}</b>` +
            `</div>` +
        `</td>` +
        `<td style="color:#1a73e8;font-weight:bold;"><span id="radarTenDot-${r.id}">${r.TenDotKiemTra || "-"}</span></td>` +
        `<td>` +
            `<div id="radarTarget-${r.id}" style="display:flex; align-items:center; justify-content:center; flex-direction:column;">` +
                `<div id="radarDoiTuongBtn-${r.id}" style="padding:6px 10px; border:1px dashed #1a73e8; border-radius:6px; background:#f8faff; cursor:pointer; font-weight:bold; font-size:13px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#1a73e8; transition: 0.2s;" ` +
                     `onclick="moModalChonLop('${r.id}', '${r.DoiTuong}')" title="${r.DoiTuong} (Bấm để chỉnh sửa)">` +
                    `${displayVal} ✏️` +
                `</div>` +
                `${truongTag}` +
                `<input type="hidden" id="fastDoiTuong-${r.id}" class="fast-doituong" value="${r.DoiTuong}">` +
            `</div>` +
        `</td>` +
        `<td>` +
            `<div id="radarTimer-${r.id}" class="radar-timer-container">` +
                `<span id="radarTimerStatic-${r.id}" style="font-weight:bold; ${isMo && r.ThoiGianMo ? 'display:none;' : ''}">${durationMin}p</span>` +
                `<div id="radarTimerLive-${r.id}" class="live-timer ${isMo && r.ThoiGianMo ? '' : 'locked'}" data-room-id="${r.id}" data-start="${r.ThoiGianMo || ''}" data-duration="${durationMin}" style="font-weight:bold; color:#1a73e8; font-variant-numeric: tabular-nums; font-size: 15px; ${isMo && r.ThoiGianMo ? '' : 'display:none;'}">--:--</div>` +
                `<div id="radarTimerSub-${r.id}" style="font-size: 11px; color: #7f8c8d; ${isMo && r.ThoiGianMo ? '' : 'display:none;'}">/${durationMin}p</div>` +
            `</div>` +
        `</td>` +
        `<td id="td-stt-${r.id}" class="radar-status-cell"><span id="radarStatus-${r.id}">${sttHtml}</span></td>` +
        `<td id="td-act-${r.id}" class="radar-action-cell">${renderRadarActionCell(r)}</td>` +
    `</tr>`;
}

function renderRadarRoomRow(room) {
    if (typeof document === 'undefined') return null;
    const temp = document.createElement('tbody');
    temp.innerHTML = renderRadarRoomRowHtml(room);
    const tr = temp.firstElementChild || (temp.children ? temp.children[0] : null);
    if (tr) return tr;
    const fallbackTr = document.createElement('tr');
    fallbackTr.id = `radar-row-${room.id}`;
    if (fallbackTr.setAttribute) fallbackTr.setAttribute('data-room-id', room.id);
    return fallbackTr;
}

function syncRadarRoomRowDom(room) {
    if (!room || !room.id) return null;
    const rid = String(room.id);
    const row = document.getElementById(`radar-row-${rid}`);

    // 1. Room code
    const codeEl = document.getElementById(`radarCode-${rid}`);
    if (codeEl && room.MaPhong && codeEl.textContent !== room.MaPhong) {
        codeEl.textContent = room.MaPhong;
    }

    // 2. Exam name
    const tenDotEl = document.getElementById(`radarTenDot-${rid}`);
    if (tenDotEl && (room.TenDotKiemTra !== undefined || room.ten_dot !== undefined)) {
        const val = room.TenDotKiemTra || room.ten_dot || "-";
        if (tenDotEl.textContent !== val) tenDotEl.textContent = val;
    }

    // 3. Target / Class
    const doiTuongVal = room.DoiTuong || room.doi_tuong || 'TatCa';
    const doiTuongBtn = document.getElementById(`radarDoiTuongBtn-${rid}`);
    if (doiTuongBtn) {
        const displayVal = doiTuongVal === 'TatCa' ? '🌎 Tất cả' : doiTuongVal;
        const newText = `${displayVal} ✏️`;
        if (doiTuongBtn.textContent !== newText) doiTuongBtn.textContent = newText;
        doiTuongBtn.title = `${doiTuongVal} (Bấm để chỉnh sửa)`;
        if (doiTuongBtn.setAttribute) doiTuongBtn.setAttribute('onclick', `moModalChonLop('${rid}', '${doiTuongVal}')`);
    }
    const fastInput = document.getElementById(`fastDoiTuong-${rid}`);
    if (fastInput && fastInput.value !== doiTuongVal) {
        fastInput.value = doiTuongVal;
    }

    // 4. Timer container
    const isMo = (room.TrangThai === "MO_PHONG");
    const durationMin = room.ThoiGian || room.thoi_gian || 45;
    const staticEl = document.getElementById(`radarTimerStatic-${rid}`);
    const liveEl = document.getElementById(`radarTimerLive-${rid}`);
    const subEl = document.getElementById(`radarTimerSub-${rid}`);

    if (isMo && room.ThoiGianMo) {
        if (staticEl && staticEl.style) staticEl.style.display = 'none';
        if (liveEl) {
            if (liveEl.style) {
                liveEl.style.display = '';
                liveEl.style.color = '#1a73e8';
            }
            if (liveEl.setAttribute) {
                liveEl.setAttribute('data-room-id', rid);
                liveEl.setAttribute('data-start', room.ThoiGianMo);
                liveEl.setAttribute('data-duration', durationMin);
            }
            if (liveEl.classList && liveEl.classList.remove) liveEl.classList.remove('locked');
        }
        if (subEl) {
            if (subEl.style) subEl.style.display = '';
            subEl.textContent = `/${durationMin}p`;
        }
    } else {
        if (staticEl) {
            if (staticEl.style) staticEl.style.display = '';
            staticEl.textContent = `${durationMin}p`;
        }
        if (liveEl) {
            if (liveEl.style) liveEl.style.display = 'none';
            if (liveEl.classList && liveEl.classList.add) liveEl.classList.add('locked');
        }
        if (subEl && subEl.style) {
            subEl.style.display = 'none';
        }
    }

    // 5. Status indicator
    const sttSpan = document.getElementById(`radarStatus-${rid}`);
    if (sttSpan) {
        const expectedStt = getRadarStatusHtml(room.TrangThai);
        if (sttSpan.innerHTML !== expectedStt) {
            sttSpan.innerHTML = expectedStt;
        }
    } else {
        const sttTd = document.getElementById(`td-stt-${rid}`);
        if (sttTd) {
            sttTd.innerHTML = getRadarStatusHtml(room.TrangThai);
        }
    }

    // 6. Quick action button - IN-PLACE text & class update ONLY
    const quickBtn = document.getElementById(`roomQuickStateBtn-${rid}`);
    if (quickBtn) {
        const isMoPhong = (room.TrangThai === "MO_PHONG");
        const quickText = isMoPhong ? "Khóa" : "Mở lại";
        const quickAction = isMoPhong ? "THU_BAI" : "MO_PHONG";
        const addClass = isMoPhong ? "radar-action-lock" : "radar-action-open";
        const removeClass = isMoPhong ? "radar-action-open" : "radar-action-lock";

        if (quickBtn.textContent !== quickText && quickBtn.innerText !== quickText) {
            if (quickBtn.textContent !== undefined) quickBtn.textContent = quickText;
            if (quickBtn.innerText !== undefined) quickBtn.innerText = quickText;
        }
        if (quickBtn.classList) {
            if (quickBtn.classList.remove) quickBtn.classList.remove(removeClass);
            if (quickBtn.classList.add) quickBtn.classList.add(addClass);
        }
        if (quickBtn.setAttribute) {
            quickBtn.setAttribute('onclick', `dieuKhienFast('${rid}', '${quickAction}')`);
        }
        quickBtn.onclick = () => dieuKhienFast(rid, quickAction);
    } else {
        const actTd = document.getElementById(`td-act-${rid}`);
        if (actTd) {
            actTd.innerHTML = renderRadarActionCell(room);
        }
    }

    return row;
}

function reconcileRadarRooms(nextRooms) {
    const tbody = document.getElementById('radarBody');
    if (!tbody) return;

    if (!nextRooms || nextRooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Chưa có phòng nào đang mở trong Không gian làm việc này</td></tr>';
        return;
    }

    // Collect existing rows keyed by room id
    const existingRows = new Map();
    const children = tbody.children ? Array.from(tbody.children) : [];
    children.forEach(child => {
        if (child.id && child.id.startsWith('radar-row-')) {
            const rid = child.id.substring('radar-row-'.length);
            existingRows.set(rid, child);
        }
    });

    const nextIds = new Set(nextRooms.map(r => String(r.id)));

    // 1. Remove rows for deleted rooms
    for (const [rid, rowEl] of existingRows.entries()) {
        if (!nextIds.has(rid)) {
            if (rowEl.remove) rowEl.remove();
            else if (rowEl.parentNode && rowEl.parentNode.removeChild) rowEl.parentNode.removeChild(rowEl);
            existingRows.delete(rid);
        }
    }

    // 2. Clear any placeholder if we have valid rooms
    if (tbody.children && tbody.children.length > 0 && existingRows.size === 0) {
        tbody.innerHTML = '';
    }

    // 3. Iterate nextRooms in canonical order (newest first)
    for (let i = 0; i < nextRooms.length; i++) {
        const room = nextRooms[i];
        const rid = String(room.id);
        let rowEl = existingRows.get(rid);

        if (!rowEl) {
            // Genuinely new room: create row
            rowEl = renderRadarRoomRow(room);
            const currentRows = (tbody.children ? Array.from(tbody.children) : []).filter(el => el.id && el.id.startsWith('radar-row-'));
            const refNode = currentRows[i] || null;
            if (refNode && tbody.insertBefore) {
                tbody.insertBefore(rowEl, refNode);
            } else if (tbody.appendChild) {
                tbody.appendChild(rowEl);
            }
            existingRows.set(rid, rowEl);

            // Bind checkbox
            const cb = (rowEl.querySelector ? rowEl.querySelector('.chk-Room') : null) || document.getElementById(`roomCheckbox-${rid}`);
            if (cb && cb.addEventListener) {
                cb.addEventListener('change', function() {
                    let total = document.querySelectorAll ? document.querySelectorAll('.chk-Room').length : 0;
                    let checked = document.querySelectorAll ? document.querySelectorAll('.chk-Room:checked').length : 0;
                    let chkAll = document.getElementById('chkAllRooms');
                    if (chkAll) chkAll.checked = (total > 0 && total === checked);
                });
            }
        } else {
            // Existing room: sync in place
            syncRadarRoomRowDom(room);

            // Order check: if not at index i, move without recreating
            const currentRows = (tbody.children ? Array.from(tbody.children) : []).filter(el => el.id && el.id.startsWith('radar-row-'));
            if (currentRows[i] !== rowEl) {
                const refNode = currentRows[i] || null;
                if (refNode && tbody.insertBefore) {
                    tbody.insertBefore(rowEl, refNode);
                } else if (tbody.appendChild) {
                    tbody.appendChild(rowEl);
                }
            }
        }
    }
}

async function refreshRadarDataSilently() {
    try {
        let data = await rpcLayDanhSachPhongThi();
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
                            rpcDieuKhienPhongThi(r.id, 'THU_BAI', null, null, null, false).then();
                        }
                    }
                }
            }
        }

        allRoomsData = (data || []).map(d => ({
            MaPhong: d.ma_phong,
            TenDotKiemTra: d.ten_dot,
            DoiTuong: d.doi_tuong,
            ThoiGian: d.thoi_gian,
            TrangThai: d.trang_thai,
            ThoiGianMo: d.thoi_gian_mo,
            TenTruong: d.ten_truong || (d.truong_hoc ? d.truong_hoc.ten_truong : 'Hệ thống'),
            truong_id: d.truong_id,
            id: d.id,
            assessment_type: d.assessment_type || 'LEGACY',
            scoring_config: d.scoring_config || {},
            CreatedAt: d.created_at
        }));

        reconcileRadarRooms(allRoomsData);
        return { status: 'success' };
    } catch (err) {
        console.error("Lỗi cập nhật Radar ngầm:", err);
        return { status: 'error', error: err };
    }
}

async function dieuKhien(trangThai) {
    const actionKeyMap = {
        'MO_PHONG': 'open',
        'THU_BAI': 'lock',
        'CONG_BO_DIEM': 'publish_score',
        'XEM_DAP_AN': 'publish_answer'
    };
    const actionKey = actionKeyMap[trangThai];
    if (!actionKey) return { status: 'error', error: new Error('Unknown command: ' + trangThai) };

    const cachedRoom = getSelectedRoom('ctrlMaPhong');
    if (!cachedRoom) {
        alert("Vui lòng chọn phòng thi cụ thể!");
        return { status: 'no_room' };
    }

    return runRoomControlAction(actionKey, async () => {
        const logEl = document.getElementById('ctrlLog');
        if (logEl) logEl.innerText = "⏳ Đang truyền lệnh...";

        let updateData = { trang_thai: trangThai };

        if (trangThai === 'MO_PHONG') {
            const tenDot = (document.getElementById('ctrlTenDot')?.value || '').trim();
            const tg = document.getElementById('ctrlThoiGian')?.value || 45;
            const doiTuongSelect = document.getElementById('ctrlDoiTuong')?.value || 'TatCa';

            updateData.thoi_gian_mo = Date.now();
            updateData.ten_dot = tenDot;
            updateData.thoi_gian = tg;

            let currentRoom = cachedRoom;
            if (currentRoom && currentRoom.DoiTuong && currentRoom.DoiTuong.includes(',') && doiTuongSelect === "TatCa") {
                // Bỏ qua update để giữ nguyên danh sách lớp ghép
            } else {
                updateData.doi_tuong = doiTuongSelect;
            }
        }

        let phong_id = cachedRoom.id;
        try {
            await rpcDieuKhienPhongThi(
                phong_id,
                trangThai,
                updateData.doi_tuong ?? null,
                updateData.ten_dot ?? null,
                updateData.thoi_gian ?? null,
                trangThai === 'MO_PHONG'
            );

            if (logEl) logEl.innerText = `✅ THÀNH CÔNG!`;
            fetchRadar();
            return { status: 'success' };
        } catch (e) {
            console.error(e);
            if (logEl) logEl.innerText = `❌ Lỗi: ` + e.message;
            return { status: 'error', error: e };
        }
    }, { roomIds: [cachedRoom.id] });
}

async function dieuKhienFast(roomId, trangThai) {
    const btnId = `roomQuickStateBtn-${roomId}`;

    return runRoomControlAction(btnId, async () => {
        let room = (allRoomsData || []).find(r => String(r.id) === String(roomId));
        if (!room || !room.id) throw new Error("Không xác định được ID phòng thi. Hãy bấm làm mới danh sách phòng rồi thử lại.");

        let updateData = { trang_thai: trangThai };
        if (trangThai === 'MO_PHONG') {
            updateData.thoi_gian_mo = Date.now();
            let checkbox = document.querySelector(`.chk-Room[value="${room.id}"]`);
            if (checkbox) {
                let doiTuongInput = checkbox.closest('tr')?.querySelector('.fast-doituong');
                if (doiTuongInput) updateData.doi_tuong = doiTuongInput.value;
            }
        }

        try {
            await rpcDieuKhienPhongThi(
                room.id,
                trangThai,
                updateData.doi_tuong ?? null,
                null,
                null,
                trangThai === 'MO_PHONG'
            );

            // In-place direct model update and row sync (zero redraw)
            room.TrangThai = trangThai;
            if (trangThai === 'MO_PHONG') {
                room.ThoiGianMo = updateData.thoi_gian_mo;
            }
            syncRadarRoomRowDom(room);
            refreshRadarDataSilently().then();

            return { status: 'success' };
        } catch (e) {
            console.error("Lỗi điều khiển nhanh:", e);
            alert("Lỗi khi điều khiển phòng! Chi tiết: " + e.message);
            return { status: 'error', error: e };
        }
    }, { roomIds: [roomId], visualFeedback: false });
}

async function xoaPhongHoanToan(roomId) {
    const cached = (allRoomsData || []).find((room) => String(room.id) === String(roomId));
    const maPhong = cached?.MaPhong || '';
    if (!confirm(`XÓA VĨNH VIỄN phòng [${maPhong}]?\nToàn bộ Đề Thi và Điểm Số của phòng này sẽ bị xóa khỏi máy chủ.`)) {
        return { status: 'cancelled' };
    }

    const btnId = `roomDeleteAllBtn-${roomId}`;

    return runRoomControlAction(btnId, async () => {
        try {
            if (!cached || !cached.id) throw new Error("Không tìm thấy phòng thi trong danh sách.");
            const data = await staffRpc('rpc_xoa_phong_thi', {
                p_ma_gv:     gvData.ma_gv,
                p_truong_id: getRoomTargetSchoolId(cached),
                p_phong_id:  cached.id
            });
            if (!data || data.status !== 'success') {
                throw new Error(data?.message || 'Xóa thất bại');
            }

            // Remove only target row directly from DOM (zero flicker, zero unrelated row rebuild)
            const row = document.getElementById(`radar-row-${roomId}`);
            if (row) {
                if (row.remove) row.remove();
                else if (row.parentNode && row.parentNode.removeChild) row.parentNode.removeChild(row);
            }
            allRoomsData = (allRoomsData || []).filter(r => String(r.id) !== String(roomId));
            let total = document.querySelectorAll ? document.querySelectorAll('.chk-Room').length : 0;
            let checked = document.querySelectorAll ? document.querySelectorAll('.chk-Room:checked').length : 0;
            let chkAll = document.getElementById('chkAllRooms');
            if (chkAll) chkAll.checked = (total > 0 && total === checked);
            if (allRoomsData.length === 0) {
                let tbody = document.getElementById('radarBody');
                if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Chưa có phòng nào đang mở trong Không gian làm việc này</td></tr>';
            }

            fetchRadar();
            alert("Đã xóa sạch dữ liệu phòng thi!");
            return { status: 'success', data };
        } catch (e) {
            alert("Lỗi khi xóa: " + e.message);
            return { status: 'error', error: e };
        }
    }, { roomIds: [roomId], visualFeedback: false });
}

async function xoaDeTrongPhong(roomId) {
    const cached = (allRoomsData || []).find((room) => String(room.id) === String(roomId));
    const maPhong = cached?.MaPhong || '';
    if (!confirm(`XÁC NHẬN: Bạn muốn xóa sạch các bộ Đề Thi đã nạp trong phòng [${maPhong}]?\n(Chỉ được phép xóa khi phòng ở trạng thái CHỜ THI, chưa mở phòng và chưa có học sinh nộp bài)`)) {
        return { status: 'cancelled' };
    }

    const btnId = `roomDeleteExamBtn-${roomId}`;

    return runRoomControlAction(btnId, async () => {
        try {
            if (!cached || !cached.id) {
                alert("❌ Không tìm thấy thông tin phòng thi trên máy chủ.");
                return { status: 'error', error: new Error('Không tìm thấy thông tin phòng thi') };
            }
            // Replaced adminRpc('exam_delete_only', { phong_id: cached.id }) with authoritative safe staffRpc for both Admin and teacher
            const data = await staffRpc('rpc_xoa_de_trong_phong', {
                p_ma_gv:     gvData.ma_gv,
                p_truong_id: getRoomTargetSchoolId(cached),
                p_phong_id:  cached.id
            });
            if (!data || data.status !== 'success') throw new Error(data?.message || 'Xóa đề thất bại.');
            alert(`✅ Đã xóa sạch đề thi trong phòng [${maPhong}] thành công!`);
            fetchRadar();
            return { status: 'success', data };
        } catch (e) {
            alert("❌ Lỗi khi xóa đề: " + e.message);
            return { status: 'error', error: e };
        }
    }, { roomIds: [roomId], visualFeedback: false });
}

async function capNhatNhanhPhong(roomId, field, value) {
    if (field === 'doi_tuong') {
        await rpcDieuKhienPhongThi(roomId, null, value, null, null, false);
        return;
    }
    throw new Error("Truong cap nhat khong duoc phep: " + field);
}

async function tuDongKhoaPhongKhiHetGio(roomId) {
    try {
        await rpcDieuKhienPhongThi(roomId, 'THU_BAI', null, null, null, false);
        let r = allRoomsData.find(x => String(x.id) === String(roomId));
        if (r) {
            r.TrangThai = 'THU_BAI';
            syncRadarRoomRowDom(r);
        }
        return { status: 'success' };
    } catch (e) {
        console.error("Lỗi tự khóa phòng:", e);
        return { status: 'error', error: e };
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

                let staticEl = document.getElementById(`radarTimerStatic-${roomId}`);
                let subEl = document.getElementById(`radarTimerSub-${roomId}`);
                if (staticEl && staticEl.style) staticEl.style.display = 'none';
                if (subEl && subEl.style) {
                    subEl.style.display = '';
                    subEl.textContent = `/${durationMin}p`;
                }

                let sttSpan = document.getElementById(`radarStatus-${roomId}`);
                if (sttSpan) sttSpan.innerHTML = "<span style='color:red;font-weight:bold;'>🔴 Đã Khóa</span>";

                tuDongKhoaPhongKhiHetGio(roomId);
            } else {
                let m = Math.floor(diff / 60000);
                let s = Math.floor((diff % 60000) / 1000);
                timerEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                if (diff < 5 * 60 * 1000) {
                    timerEl.style.color = "#e67e22";
                }
            }
        });
    }, 1000);
}


async function fetchRadar() {
    try {
        let data = await rpcLayDanhSachPhongThi();

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
                            rpcDieuKhienPhongThi(r.id, 'THU_BAI', null, null, null, false).then();
                        }
                    }
                }
            }
        }

        allRoomsData = (data||[]).map(d => ({
            MaPhong: d.ma_phong,
            TenDotKiemTra: d.ten_dot,
            DoiTuong: d.doi_tuong,
            ThoiGian: d.thoi_gian,
            TrangThai: d.trang_thai,
            ThoiGianMo: d.thoi_gian_mo,
            TenTruong: d.ten_truong || (d.truong_hoc ? d.truong_hoc.ten_truong : 'Hệ thống'),
            truong_id: d.truong_id,
            id: d.id,
            assessment_type: d.assessment_type || 'LEGACY',
            scoring_config: d.scoring_config || {},
            CreatedAt: d.created_at
        }));

        let tbody = document.getElementById('radarBody');
        let tableElement = tbody ? tbody.parentNode : null;
        let containerElement = tableElement ? tableElement.parentNode : null;

        if(containerElement && tableElement && !document.getElementById('radarControlBar')) {
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
                <button id="roomBatchOpenBtn" class="room-batch-action-btn" onclick="dieuKhienNhomPhong('MO_PHONG')" style="background:#27ae60; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; transition:0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🟢 Mở các phòng đã chọn</button>
                <button id="roomBatchLockBtn" class="room-batch-action-btn" onclick="dieuKhienNhomPhong('THU_BAI')" style="background:#c0392b; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; transition:0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🔴 Khóa các phòng đã chọn</button>
                <span id="batchActionLog" style="margin-left: 10px; font-style: italic; color: #d35400; font-weight: bold;"></span>
            `;
            containerElement.insertBefore(ctrlBar, tableElement);
        }

        const hasExistingKeyedRows = tbody && tbody.querySelector && !!tbody.querySelector('tr[id^="radar-row-"]');

        if (!hasExistingKeyedRows) {
            let chkAll = document.getElementById('chkAllRooms');
            if(chkAll) chkAll.checked = false;

            let html = '';
            if(allRoomsData.length === 0) {
                html = '<tr><td colspan="6" style="text-align:center;">Chưa có phòng nào đang mở trong Không gian làm việc này</td></tr>';
            } else {
                allRoomsData.forEach(r => {
                    // renderRadarRoomRowHtml uses canonical renderRadarActionCell(r)
                    html += renderRadarRoomRowHtml(r);
                });
            }
            if (tbody) tbody.innerHTML = html;

            if (document.querySelectorAll) {
                document.querySelectorAll('.chk-Room').forEach(cb => {
                    if (cb.addEventListener) {
                        cb.addEventListener('change', function() {
                            let total = document.querySelectorAll('.chk-Room').length;
                            let checked = document.querySelectorAll('.chk-Room:checked').length;
                            let chkAll = document.getElementById('chkAllRooms');
                            if (chkAll) chkAll.checked = (total > 0 && total === checked);
                        });
                    }
                });
            }
        } else {
            // Subsequent load: reconcile keyed DOM in place (zero row redraw, zero flicker)
            reconcileRadarRooms(allRoomsData);
        }

        khoiDongDongHoGiaoVien();
        return { status: 'success' };
    } catch (err) {
        console.error("Lỗi tải Radar:", err);
        let tbody = document.getElementById('radarBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red; font-weight:bold;">❌ Lỗi tải dữ liệu phòng thi</td></tr>';
        return { status: 'error', error: err };
    }
}

function toggleAllRooms(isChecked) {
    let checkboxes = document.querySelectorAll('.chk-Room');
    checkboxes.forEach(cb => cb.checked = isChecked);
}

async function dieuKhienNhomPhong(trangThai) {
    const actionKey = trangThai === 'MO_PHONG' ? 'batch_open' : 'batch_lock';
    let checkedBoxes = document.querySelectorAll('.chk-Room:checked');
    if (checkedBoxes.length === 0) {
        alert("⚠️ Vui lòng tick chọn ít nhất 1 phòng thi ở bảng bên dưới để thao tác!");
        return { status: 'no_selection' };
    }

    let actName = trangThai === 'MO_PHONG' ? 'MỞ CỬA' : 'KHÓA / THU BÀI';
    if (!confirm(`Xác nhận thực hiện lệnh [ ${actName} ] đồng loạt cho ${checkedBoxes.length} phòng thi đã chọn?`)) {
        return { status: 'cancelled' };
    }

    const targetRoomIds = Array.from(checkedBoxes).map(cb => cb.value);

    return runRoomControlAction(actionKey, async () => {
        setRoomControlActionState(actionKey, 'busy');
        let logSpan = document.getElementById('batchActionLog');
        if (logSpan) logSpan.innerText = "⏳ Máy chủ đang xử lý hàng loạt...";

        try {
            let promises = targetRoomIds.map(roomId => {
                let cb = document.querySelector(`.chk-Room[value="${roomId}"]`);
                let tr = cb ? cb.closest('tr') : null;
                let selDoiTuong = tr ? tr.querySelector('.fast-doituong')?.value : null;

                return rpcDieuKhienPhongThi(
                    roomId,
                    trangThai,
                    trangThai === 'MO_PHONG' ? selDoiTuong : null,
                    null,
                    null,
                    trangThai === 'MO_PHONG'
                );
            });

            await Promise.all(promises);

            if (logSpan) {
                logSpan.innerText = "✅ Cập nhật thành công toàn bộ!";
                setTimeout(() => { if (logSpan) logSpan.innerText = ""; }, 3000);
            }

            fetchRadar();
            return { status: 'success' };
        } catch (e) {
            if (logSpan) logSpan.innerText = "❌ Lỗi thực thi!";
            console.error(e);
            alert("Lỗi kết nối khi cập nhật đồng loạt: " + e.message);
            return { status: 'error', error: e };
        }
    }, { roomIds: targetRoomIds, manualBusy: true });
}


async function taiDanhSachPhong() {
    let selectBoxTab2 = document.getElementById("ctrlMaPhong"); let selectBoxTab3 = document.getElementById("dashMaPhong");
    if(selectBoxTab2) selectBoxTab2.innerHTML = '<option value="">⏳ Đang tải danh sách phòng...</option>';
    if(selectBoxTab3) selectBoxTab3.innerHTML = '<option value="">⏳ Đang tải danh sách phòng...</option>';

    try {
        let data = await rpcLayDanhSachPhongThi();
        
        let defaultOpt = '<option value="">-- Chọn Mã Phòng Thi --</option>';
        if(selectBoxTab2) selectBoxTab2.innerHTML = defaultOpt; if(selectBoxTab3) selectBoxTab3.innerHTML = defaultOpt;
        
        if(data && data.length > 0) {
            data.forEach(room => {
                const maPhong = room.ma_phong || room.MaPhong;
                const tenTruong = room.ten_truong || room.TenTruong || 'Hệ thống';
                const label = gvData.quyen === 'Admin' ? `${maPhong} — ${tenTruong}` : maPhong;
                let optHtml = `<option value="${room.id}" data-ma-phong="${maPhong}" data-truong-id="${room.truong_id}">${label}</option>`;
                if(selectBoxTab2) selectBoxTab2.innerHTML += optHtml; if(selectBoxTab3) selectBoxTab3.innerHTML += optHtml;
            });
            let phongDaLuu = localStorage.getItem('phongDangXem');
            let savedRoom = data.find((room) => String(room.id) === String(phongDaLuu));
            if (!savedRoom && phongDaLuu) {
                const legacyMatches = data.filter((room) => String(room.ma_phong || room.MaPhong) === String(phongDaLuu));
                if (legacyMatches.length === 1) savedRoom = legacyMatches[0];
            }
            if (savedRoom && selectBoxTab3) { selectBoxTab3.value = savedRoom.id; fetchDashboard(); }
        } else {
            let emptyOpt = '<option value="">⚠️ Chưa có phòng thi nào</option>';
            if(selectBoxTab2) selectBoxTab2.innerHTML = emptyOpt; if(selectBoxTab3) selectBoxTab3.innerHTML = emptyOpt;
        }

        if(selectBoxTab2) {
            selectBoxTab2.onchange = function() {
                let r = getSelectedRoom(this);
                if(r) {
                    loadMetaData();
                    document.getElementById('ctrlTenDot').value = r.TenDotKiemTra || "";
                    document.getElementById('ctrlThoiGian').value = r.ThoiGian || 45;
                    setTimeout(() => {
                        let sel = document.getElementById('ctrlDoiTuong');
                        if(sel) sel.value = r.DoiTuong || "TatCa";
                    }, 150);
                }
            };
        }
        return { status: 'success' };
    } catch(e) {
        console.error("Lỗi tải DS phòng:", e);
        let errOpt = '<option value="">❌ Lỗi tải DS phòng</option>';
        if(selectBoxTab2) selectBoxTab2.innerHTML = errOpt;
        if(selectBoxTab3) selectBoxTab3.innerHTML = errOpt;
        return { status: 'error', error: e };
    }
}

// ==========================================================
// DASHBOARD ACTION STATE & RELIABILITY HELPERS (FLEX-LITE-006)
// ==========================================================

const DASHBOARD_ACTIONS = {
    refresh: {
        id: 'dashRefreshBtn',
        normal: '🔄 Cập nhật Bảng Điểm',
        busy: '⏳ Đang cập nhật...',
        success: '✅ Đã cập nhật',
        error: '❌ Cập nhật lỗi'
    },
    regrade: {
        id: 'dashRegradeBtn',
        normal: '🛠️ Chấm lại bài đang chờ',
        busy: '⏳ Đang chấm lại...',
        success: '✅ Đã chấm lại',
        error: '❌ Chấm lại lỗi'
    },
    export: {
        id: 'dashExportBtn',
        normal: '📥 Tải Excel',
        busy: '⏳ Đang tạo Excel...',
        success: '✅ Đã tải Excel',
        error: '❌ Tải Excel lỗi'
    },
    delete: {
        id: 'dashDeleteResultsBtn',
        normal: '🗑️ Xóa điểm phòng này',
        busy: '⏳ Đang xóa điểm...',
        success: '✅ Đã xóa điểm',
        error: '❌ Xóa điểm lỗi'
    }
};

const activeDashboardActions = new Set();
let dashboardManualRefreshActive = false;
const DASHBOARD_FEEDBACK_DELAY_MS = 800;
const DASHBOARD_NEUTRAL_STATUSES = new Set(['cancelled', 'no_room', 'no_data', 'stale', 'skipped']);

function setDashboardActionState(actionKey, state) {
    const cfg = DASHBOARD_ACTIONS[actionKey];
    if (!cfg) return;
    const btn = document.getElementById(cfg.id);
    if (!btn) return;
    if (state === 'busy') {
        btn.innerText = cfg.busy;
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.setAttribute('data-action-state', 'busy');
    } else if (state === 'success') {
        btn.innerText = cfg.success;
        btn.disabled = true;
        btn.removeAttribute('aria-busy');
        btn.setAttribute('data-action-state', 'success');
    } else if (state === 'error') {
        btn.innerText = cfg.error;
        btn.disabled = true;
        btn.removeAttribute('aria-busy');
        btn.setAttribute('data-action-state', 'error');
    } else {
        btn.innerText = cfg.normal;
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.setAttribute('data-action-state', 'normal');
    }
}

function finishDashboardAction(actionKey, outcome) {
    if (DASHBOARD_NEUTRAL_STATUSES.has(outcome)) {
        activeDashboardActions.delete(actionKey);
        setDashboardActionState(actionKey, 'normal');
        return;
    }
    const state = (outcome === 'success') ? 'success' : 'error';
    setDashboardActionState(actionKey, state);
    setTimeout(() => {
        activeDashboardActions.delete(actionKey);
        setDashboardActionState(actionKey, 'normal');
    }, DASHBOARD_FEEDBACK_DELAY_MS);
}

async function runDashboardAction(actionKey, actionFn, options = {}) {
    if (activeDashboardActions.has(actionKey)) {
        return { status: 'skipped', reason: 'already_running' };
    }
    activeDashboardActions.add(actionKey);
    if (actionKey === 'refresh') {
        dashboardManualRefreshActive = true;
    }

    if (!options.manualBusy) {
        setDashboardActionState(actionKey, 'busy');
    }

    let outcome = 'error';
    let result = null;
    try {
        result = await actionFn();
        if (result && DASHBOARD_NEUTRAL_STATUSES.has(result.status)) {
            outcome = result.status;
        } else if (result && result.status === 'success') {
            outcome = 'success';
        } else if (result && result.status === 'error') {
            outcome = 'error';
        } else if (result === false) {
            outcome = 'error';
        } else {
            outcome = 'error';
        }
        return result;
    } catch (err) {
        outcome = 'error';
        console.error(`Lỗi action ${actionKey}:`, err);
        return { status: 'error', error: err };
    } finally {
        if (actionKey === 'refresh') {
            dashboardManualRefreshActive = false;
        }
        finishDashboardAction(actionKey, outcome);
    }
}

async function refreshDashboardManually() {
    return runDashboardAction('refresh', async () => {
        const res = await fetchDashboard(false);
        if (!res) {
            return { status: 'error', error: new Error('Empty response from fetchDashboard') };
        }
        if (res.status === 'no_room') {
            alert("⚠️ Vui lòng chọn Mã Phòng Thi ở ô phía trên trước!");
            return { status: 'no_room' };
        }
        if (res.status === 'stale') {
            return { status: 'stale' };
        }
        if (res.status === 'skipped') {
            return { status: 'skipped' };
        }
        if (res.status === 'error') {
            return { status: 'error', error: res.error };
        }
        if (res.status === 'success') {
            return { status: 'success' };
        }
        return { status: 'error', error: new Error('Unknown fetch status') };
    });
}

// BỘ TẢI ĐIỂM CỰC MẠNH (HỖ TRỢ ĐỌC DỮ LIỆU TỪ 2 LUỒNG: REALTIME & AUTO REFRESH 5S)
async function fetchDashboard(isAuto = false) {
    if (isAuto && dashboardManualRefreshActive) {
        return { status: 'skipped' };
    }
    try {
        const sInput = document.getElementById('liveSearchInput');
        if (sInput && !isAuto) sInput.value = '';

        const currentRoom = getSelectedRoom('dashMaPhong');
        if(!currentRoom) return { status: 'no_room' };
        if(!isAuto) document.getElementById('dashBody').innerHTML = '<tr><td colspan="10">⏳ Đang tải dữ liệu...</td></tr>';
        
        let pArr = new Array();
        
        pArr.push(staffRpc('rpc_lay_ket_qua_phong_gv', { p_phong_id: currentRoom.id }));
        
        if(allStudents.length === 0 || !isAuto) {
             let qHS = sb.from('hoc_sinh').select('id, truong_id, ma_hs, ho_ten, lop, quyen').eq('truong_id', currentRoom.truong_id);
             pArr.push(qHS);
        }
        
        let myFetchId = ++globalFetchDashId;
        let results = await Promise.all(pArr);
        if (myFetchId !== globalFetchDashId) {
            return { status: 'stale' };
        }

        let resKQ = results[0];
        if (!resKQ || resKQ.status !== 'success') {
            throw new Error(resKQ?.message || "Không tải được dữ liệu kết quả phòng thi.");
        }
        let kqList = resKQ.results || [];

        if (results.length > 1) {
            let resHS = results[1];
            if (resHS.error) throw resHS.error;
            allStudents = (resHS.data || new Array()).map(d => ({ MaHS: d.ma_hs, HoTen: d.ho_ten, Lop: d.lop, Quyen: d.quyen, id: d.id }));
        }

        duLieuBangDiem = kqList.map(r => ({
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
        return { status: 'success' };
    } catch(e) {
        console.error("Lỗi fetchDashboard:", e);
        if (!isAuto) document.getElementById('dashBody').innerHTML = `<tr><td colspan="10" style="color:red; font-weight:bold;">❌ Lỗi kết nối tải bảng điểm: ${e.message}</td></tr>`;
        return { status: 'error', error: e };
    }
}

function renderDashboardSubTabs() { let groups = new Set(); duLieuBangDiem.forEach(hs => { if(hs.Lop) groups.add(hs.Lop); }); let html = `<button class="${currentDashFilter==='TatCa'?'active':''}" onclick="filterDashboard('TatCa')">Tất cả</button>`; groups.forEach(g => { html += `<button class="${currentDashFilter===g?'active':''}" onclick="filterDashboard('${g}')">${g}</button>`; }); document.getElementById('subTabsDashboard').innerHTML = html; }
function filterDashboard(filter) { currentDashFilter = filter; renderDashboardSubTabs(); renderDashboardTable(); }



async function xoaDiemPhong() {
    return runDashboardAction('delete', async () => {
        const currentRoom = getSelectedRoom('dashMaPhong');
        if (!currentRoom) {
            alert("⚠️ Vui lòng chọn Mã Phòng Thi ở ô phía trên trước!");
            return { status: 'no_room' };
        }
        const maPhong = currentRoom.MaPhong || currentRoom.ma_phong || 'PhongThi';
        if (!confirm(`🚨 BẠN CÓ CHẮC CHẮN XÓA TOÀN BỘ điểm bài làm của phòng [${maPhong}]?\nHành động này không thể hoàn tác!`)) {
            return { status: 'cancelled' };
        }
        setDashboardActionState('delete', 'busy');

        let data = await staffRpc('rpc_reset_room_results', {
            p_ma_gv: gvData.ma_gv,
            p_truong_id: getRoomTargetSchoolId(currentRoom),
            p_phong_id: currentRoom.id
        });
        if (!data || data.status !== 'success') {
            alert("❌ Lỗi máy chủ Supabase khi xóa: " + (data?.message || 'Lỗi không xác định'));
            return { status: 'error', error: data?.message };
        }
        alert(`✅ Đã reset phòng: xóa ${data.ket_qua_deleted || 0} kết quả và ${data.submissions_deleted || 0} receipt bài làm.`);
        taiDanhSachPhong();
        fetchDashboard();
        return { status: 'success', data };
    }, { manualBusy: true });
}

function getActiveTargetSchoolId() {
    if (gvData.quyen !== 'Admin') return gvData.truong_id;
    return getSelectedRoom('ctrlMaPhong')?.truong_id || (activeWorkspaceTruongId !== 'ALL' ? activeWorkspaceTruongId : null);
}

async function khoiPhucChamDiemPhong() {
    return runDashboardAction('regrade', async () => {
        const currentRoom = getSelectedRoom('dashMaPhong');
        if (!currentRoom) {
            alert("⚠️ Vui lòng chọn phòng thi cần khôi phục chấm điểm.");
            return { status: 'no_room' };
        }
        const data = await staffRpc('rpc_grade_pending_room', {
            p_ma_gv: gvData.ma_gv,
            p_truong_id: getRoomTargetSchoolId(currentRoom),
            p_phong_id: currentRoom.id
        });
        if (!data || data.status !== 'success') {
            alert("❌ Không thể khôi phục chấm điểm: " + (data?.message || 'Lỗi không xác định'));
            return { status: 'error', error: data?.message };
        }
        alert(`✅ Đã xử lý ${data.attempted || 0} bài chờ: ${data.graded || 0} thành công, ${data.failed || 0} cần kiểm tra thêm.`);
        fetchDashboard(true);
        return { status: 'success', data };
    });
}

async function xuatExcel() {
    return runDashboardAction('export', () => xuatExcelCore());
}

async function xuatExcelCore() {
    let currentRoom = getSelectedRoom('dashMaPhong');
    if(!currentRoom) {
        alert("⚠️ Vui lòng chọn Mã Phòng Thi ở ô phía trên trước!");
        return { status: 'no_room' };
    }
    if(duLieuBangDiem.length === 0) {
        alert("Chưa có dữ liệu để tải.");
        return { status: 'no_data' };
    }

    let ExcelJSLib;
    try {
        ExcelJSLib = await ensureExcelJsReady();
    } catch (loaderErr) {
        console.error("Lỗi tải ExcelJS:", loaderErr);
        alert("❌ Không thể tải thư viện xử lý Excel: " + (loaderErr?.message || 'Lỗi kết nối'));
        return { status: 'error', error: loaderErr };
    }
    if (!ExcelJSLib || !ExcelJSLib.Workbook) {
        if (typeof window !== 'undefined' && window.ExcelJS && window.ExcelJS.Workbook) {
            ExcelJSLib = window.ExcelJS;
        } else {
            alert("❌ Thư viện Excel chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng.");
            return { status: 'error', error: new Error('ExcelJS not ready') };
        }
    }

    const maPhong = currentRoom.MaPhong || currentRoom.ma_phong || 'PhongThi';

    let exportData = new Array();
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
    if(exportData.length === 0) {
        alert("Không có dữ liệu cho lớp này.");
        return { status: 'no_data' };
    }

    const workbook = new ExcelJSLib.Workbook(); const worksheet = workbook.addWorksheet('BangDiem');
    // ĐÃ BỔ SUNG CỘT VI PHẠM VÀO EXCEL
    worksheet.columns = [ { header: 'STT', key: 'stt', width: 6 }, { header: 'SBD', key: 'sbd', width: 12 }, { header: 'Họ và Tên', key: 'name', width: 30 }, { header: 'Lớp', key: 'lop', width: 10 }, { header: 'Mã Đề', key: 'made', width: 10 }, { header: 'Tổng Điểm', key: 'total', width: 12 }, { header: 'Điểm P. I', key: 'p1', width: 12 }, { header: 'Điểm P. II', key: 'p2', width: 12 }, { header: 'Điểm P. III', key: 'p3', width: 12 }, { header: 'Vi Phạm', key: 'vipham', width: 10 }, { header: 'Thời gian nộp', key: 'time', width: 22 } ]; 
    
    let belowAvg = 0; let maxScore = -1; let minScore = 11; 
    exportData.sort((a,b) => (String(a.MaHS)||'').localeCompare(String(b.MaHS)||'')); 
    
    let assessmentType = currentRoom?.assessment_type || 'LEGACY';
    let scoringConfig = currentRoom?.scoring_config || {};

    exportData.forEach((hs, idx) => {
        const scorePres = computeDisplayPartContributions(hs, assessmentType, scoringConfig);
        if (scorePres.isSubmitted) {
            if (scorePres.finalScore < 5.0) belowAvg++;
            if (scorePres.finalScore > maxScore) maxScore = scorePres.finalScore;
            if (scorePres.finalScore < minScore) minScore = scorePres.finalScore;
        }
        worksheet.addRow({
            stt: idx + 1,
            sbd: hs.MaHS,
            name: hs.HoTen,
            lop: hs.Lop,
            made: hs.MaDe || "-",
            total: scorePres.isSubmitted ? scorePres.finalScore : "-",
            p1: scorePres.isSubmitted ? scorePres.p1 : "-",
            p2: scorePres.isSubmitted ? scorePres.p2 : "-",
            p3: scorePres.isSubmitted ? scorePres.p3 : "-",
            vipham: hs.ViPham > 0 ? hs.ViPham : "",
            time: hs.ThoiGian ? new Date(hs.ThoiGian).toLocaleString('vi-VN') : "-"
        });
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
    return { status: 'success', file: tenFile };
}

// ==========================================================
// TÍNH NĂNG IMPORT EXCEL
// ==========================================================

let excelJsLoadingPromise = null;
const EXCELJS_SCRIPT_TIMEOUT_MS = 10000;

function ensureExcelJsReady() {
    if (typeof window !== 'undefined' && window.ExcelJS && window.ExcelJS.Workbook) {
        return Promise.resolve(window.ExcelJS);
    }
    if (excelJsLoadingPromise) {
        return excelJsLoadingPromise;
    }
    excelJsLoadingPromise = new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return reject(new Error('Môi trường trình duyệt không hợp lệ.'));
        }
        if (window.ExcelJS && window.ExcelJS.Workbook) {
            return resolve(window.ExcelJS);
        }
        const timeoutMs = (typeof window !== 'undefined' && window.__EXCELJS_SCRIPT_TIMEOUT_MS) || EXCELJS_SCRIPT_TIMEOUT_MS;
        const primarySrc = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.bare.min.js';
        const fallbackSrc = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.bare.min.js';

        function loadDynamicScript(src, onFail) {
            let settled = false;
            let timer = null;

            const cleanupAndSettle = (action) => {
                if (settled) return;
                settled = true;
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                action();
            };

            let script = document.querySelector(`script[data-damsan-exceljs-loader="${src}"]`);
            if (script) {
                const state = script.getAttribute('data-damsan-exceljs-state');
                if (state === 'loading') {
                    script.addEventListener('load', () => {
                        cleanupAndSettle(() => {
                            if (window.ExcelJS && window.ExcelJS.Workbook) {
                                resolve(window.ExcelJS);
                            } else if (onFail) {
                                onFail();
                            } else {
                                reject(new Error('Không thể tải thư viện xử lý Excel. Vui lòng kiểm tra kết nối mạng và thử lại.'));
                            }
                        });
                    }, { once: true });

                    script.addEventListener('error', () => {
                        cleanupAndSettle(() => {
                            if (onFail) {
                                onFail();
                            } else {
                                reject(new Error('Không thể tải thư viện xử lý Excel. Vui lòng kiểm tra kết nối mạng và thử lại.'));
                            }
                        });
                    }, { once: true });

                    timer = setTimeout(() => {
                        cleanupAndSettle(() => {
                            script.setAttribute('data-damsan-exceljs-state', 'error');
                            try { script.remove(); } catch (e) {}
                            if (onFail) {
                                onFail();
                            } else {
                                reject(new Error('Không thể tải thư viện xử lý Excel. Vui lòng kiểm tra kết nối mạng và thử lại.'));
                            }
                        });
                    }, timeoutMs);
                    return;
                } else {
                    try { script.remove(); } catch (e) {}
                }
            }

            const newScript = document.createElement('script');
            newScript.src = src;
            newScript.async = true;
            newScript.setAttribute('data-damsan-exceljs-loader', src);
            newScript.setAttribute('data-damsan-exceljs-state', 'loading');

            newScript.onload = () => {
                cleanupAndSettle(() => {
                    newScript.setAttribute('data-damsan-exceljs-state', 'loaded');
                    if (window.ExcelJS && window.ExcelJS.Workbook) {
                        resolve(window.ExcelJS);
                    } else {
                        newScript.setAttribute('data-damsan-exceljs-state', 'error');
                        try { newScript.remove(); } catch (e) {}
                        if (onFail) {
                            onFail();
                        } else {
                            reject(new Error('Không thể tải thư viện xử lý Excel. Vui lòng kiểm tra kết nối mạng và thử lại.'));
                        }
                    }
                });
            };

            newScript.onerror = () => {
                cleanupAndSettle(() => {
                    newScript.setAttribute('data-damsan-exceljs-state', 'error');
                    try { newScript.remove(); } catch (e) {}
                    if (onFail) {
                        onFail();
                    } else {
                        reject(new Error('Không thể tải thư viện xử lý Excel. Vui lòng kiểm tra kết nối mạng và thử lại.'));
                    }
                });
            };

            timer = setTimeout(() => {
                cleanupAndSettle(() => {
                    newScript.setAttribute('data-damsan-exceljs-state', 'error');
                    try { newScript.remove(); } catch (e) {}
                    if (onFail) {
                        onFail();
                    } else {
                        reject(new Error('Không thể tải thư viện xử lý Excel. Vui lòng kiểm tra kết nối mạng và thử lại.'));
                    }
                });
            }, timeoutMs);

            document.head.appendChild(newScript);
        }

        loadDynamicScript(primarySrc, () => {
            loadDynamicScript(fallbackSrc, null);
        });
    }).catch(err => {
        excelJsLoadingPromise = null;
        throw err;
    });
    return excelJsLoadingPromise;
}

function normalizeImportHeader(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim().replace(/\s+/g, ' ').toLowerCase();
}

function validateAccountImportHeaders(worksheet, loai) {
    if (!worksheet || worksheet.rowCount < 1) {
        throw new Error('File Excel không có dòng tiêu đề.');
    }
    const row1 = worksheet.getRow(1);

    const getColText = (colIndex) => {
        const cell = row1.getCell(colIndex);
        return normalizeImportHeader(cell.value);
    };

    if (loai === 'HS') {
        const c1 = getColText(1);
        const c2 = getColText(2);
        const c3 = getColText(3);
        const c4 = getColText(4);
        const c5 = getColText(5);

        if (c1 !== 'stt') {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 1 phải là [STT].');
        }
        if (c2 !== 'mã hs' && c2 !== 'ma hs') {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 2 phải là [Mã HS].');
        }
        if (c3 !== 'họ và tên' && c3 !== 'ho va ten' && c3 !== 'họ tên' && c3 !== 'ho ten') {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 3 phải là [Họ và Tên].');
        }
        if (c4 !== 'lớp' && c4 !== 'lop') {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 4 phải là [Lớp].');
        }
        if (c5 !== 'mã trường' && c5 !== 'ma truong') {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 5 phải là [Mã Trường].');
        }
    } else {
        const c1 = getColText(1);
        const c2 = getColText(2);
        const c3 = getColText(3);
        const c4 = getColText(4);
        const c5 = getColText(5);
        const c6 = getColText(6);

        if (c1 !== 'stt') {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 1 phải là [STT].');
        }
        if (c2 !== 'mã gv' && c2 !== 'ma gv') {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 2 phải là [Mã GV].');
        }
        if (c3 !== 'họ và tên' && c3 !== 'ho va ten' && c3 !== 'họ tên' && c3 !== 'ho ten') {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 3 phải là [Họ và Tên].');
        }
        const validQuyenHeaders = [
            'quyền (admin/giaovien)',
            'quyen (admin/giaovien)',
            'quyền (admin/gv)',
            'quyen (admin/gv)',
            'quyền',
            'quyen'
        ];
        if (!validQuyenHeaders.includes(c4)) {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 4 phải là [Quyền (Admin/GiaoVien)] hoặc mẫu cũ [Quyền (Admin/GV)].');
        }
        if (c5 !== 'mã trường' && c5 !== 'ma truong') {
            throw new Error('Dòng tiêu đề không đúng định dạng. Cột 5 phải là [Mã Trường].');
        }
        if (c6) {
            const validMonHeaders = [
                'môn học (tùy chọn)',
                'mon hoc (tuy chon)',
                'môn học (tuy chon)',
                'mon hoc (tùy chọn)',
                'môn học',
                'mon hoc'
            ];
            if (!validMonHeaders.includes(c6)) {
                throw new Error('Dòng tiêu đề không đúng định dạng. Cột 6 (nếu có) phải là [Môn học (tùy chọn)].');
            }
        }
    }
}

async function taiFileMau(loai, btnElement) {
    const btn = btnElement || (window.event?.currentTarget) || null;
    const oldText = btn ? btn.innerText : '';
    if (btn) {
        btn.innerText = '⏳ Đang tạo file...';
        btn.disabled = true;
    }
    try {
        await ensureExcelJsReady();
        const workbook = new ExcelJS.Workbook();
        const dataSheet = workbook.addWorksheet('Mau_Nhap_Lieu', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        if (loai === 'HS') {
            dataSheet.columns = [
                { header: 'STT', key: 'stt', width: 8 },
                { header: 'Mã HS', key: 'ma_hs', width: 18, style: { numFmt: '@' } },
                { header: 'Họ và Tên', key: 'ho_ten', width: 30 },
                { header: 'Lớp', key: 'lop', width: 15 },
                { header: 'Mã Trường', key: 'ma_truong', width: 18, style: { numFmt: '@' } }
            ];
        } else {
            dataSheet.columns = [
                { header: 'STT', key: 'stt', width: 8 },
                { header: 'Mã GV', key: 'ma_gv', width: 18, style: { numFmt: '@' } },
                { header: 'Họ và Tên', key: 'ho_ten', width: 30 },
                { header: 'Quyền (Admin/GiaoVien)', key: 'quyen', width: 25 },
                { header: 'Mã Trường', key: 'ma_truong', width: 18, style: { numFmt: '@' } },
                { header: 'Môn học (tùy chọn)', key: 'mon_hoc', width: 25 }
            ];
        }

        dataSheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A73E8' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Add Huong_Dan worksheet
        const guideSheet = workbook.addWorksheet('Huong_Dan');
        guideSheet.columns = [
            { header: 'Mục', key: 'muc', width: 25 },
            { header: 'Nội dung hướng dẫn', key: 'noi_dung', width: 85 }
        ];
        guideSheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        if (loai === 'HS') {
            guideSheet.addRow({ muc: '1. Cấu trúc file', noi_dung: 'Trang tính đầu tiên (Mau_Nhap_Lieu) là trang chứa dữ liệu import thực tế.' });
            guideSheet.addRow({ muc: '2. Các cột bắt buộc', noi_dung: 'STT, Mã HS, Họ và Tên, Lớp. Cột Mã Trường nếu để trống sẽ lấy theo trường đang chọn trên hệ thống.' });
            guideSheet.addRow({ muc: '3. Mật khẩu mặc định', noi_dung: 'Tài khoản TẠO MỚI được cấp mật khẩu mặc định 123456 (bắt buộc đổi khi đăng nhập). Tài khoản ĐÃ TỒN TẠI sẽ GIỮ NGUYÊN mật khẩu hiện tại.' });
            guideSheet.addRow({ muc: '4. Định dạng Text', noi_dung: 'Cột Mã HS và Mã Trường cần định dạng Text (Văn bản) để tránh mất số 0 ở đầu.' });
            guideSheet.addRow({ muc: '5. Dữ liệu ví dụ', noi_dung: 'STT: 1 | Mã HS: 100401 | Họ và Tên: Nguyễn Văn A | Lớp: 10A4 | Mã Trường: DAMSAN' });
            guideSheet.addRow({ muc: '6. Lưu ý quan trọng', noi_dung: 'Không nhập dữ liệu mẫu từ trang Hướng dẫn vào hệ thống. Hãy nhập dữ liệu thật vào trang Mau_Nhap_Lieu.' });
        } else {
            guideSheet.addRow({ muc: '1. Cấu trúc file', noi_dung: 'Trang tính đầu tiên (Mau_Nhap_Lieu) là trang chứa dữ liệu import thực tế.' });
            guideSheet.addRow({ muc: '2. Các cột bắt buộc', noi_dung: 'STT, Mã GV, Họ và Tên. Cột Mã Trường nếu để trống sẽ lấy theo trường đang chọn.' });
            guideSheet.addRow({ muc: '3. Phân quyền', noi_dung: 'Giá trị hợp lệ: GiaoVien hoặc Admin. Nếu để trống, tài khoản mới mặc định là GiaoVien, tài khoản cũ giữ nguyên quyền hiện tại.' });
            guideSheet.addRow({ muc: '4. Môn học (tùy chọn)', noi_dung: 'Nhập chính xác tên môn học trong hệ thống (VD: Địa lí, Toán...). Nếu để trống, tài khoản cũ giữ nguyên môn học đã gán.' });
            guideSheet.addRow({ muc: '5. Mật khẩu mặc định', noi_dung: 'Tài khoản TẠO MỚI được cấp mật khẩu mặc định 123456. Tài khoản ĐÃ TỒN TẠI sẽ GIỮ NGUYÊN mật khẩu hiện tại.' });
            guideSheet.addRow({ muc: '6. Định dạng Text', noi_dung: 'Cột Mã GV và Mã Trường cần định dạng Text (Văn bản) để tránh mất số 0 ở đầu.' });
            guideSheet.addRow({ muc: '7. Dữ liệu ví dụ', noi_dung: 'STT: 1 | Mã GV: GV001 | Họ và Tên: Nguyễn Văn B | Quyền: GiaoVien | Mã Trường: DAMSAN | Môn học: Địa lí' });
            guideSheet.addRow({ muc: '8. Lưu ý quan trọng', noi_dung: 'Không nhập dữ liệu mẫu từ trang Hướng dẫn vào hệ thống. Hãy nhập dữ liệu thật vào trang Mau_Nhap_Lieu.' });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Mau_Nhap_${loai}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
        }, 1500);
    } catch (e) {
        alert('❌ Lỗi tải file mẫu: ' + e.message);
    } finally {
        if (btn) {
            btn.innerText = oldText;
            btn.disabled = false;
        }
    }
}

async function docFileExcelVaNap(loai) {
    let fileInput = document.getElementById(`fileExcel${loai}`);
    if (!fileInput.files || fileInput.files.length === 0) return alert("Vui lòng chọn file Excel!");
    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        return alert("Hệ thống chỉ hỗ trợ định dạng file .xlsx!");
    }
    let btn = document.getElementById(`btnNap${loai}`);
    let oldText = btn ? btn.innerText : '';
    if (btn) {
        btn.innerText = "⏳ Đang đọc và nạp...";
        btn.disabled = true;
    }
    
    try {
        await ensureExcelJsReady();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file);
        if (!workbook.worksheets || workbook.worksheets.length === 0) {
            throw new Error("File Excel không có trang tính nào.");
        }
        const worksheet = workbook.worksheets[0];

        // Xác minh dòng tiêu đề trước khi đọc dữ liệu
        validateAccountImportHeaders(worksheet, loai);

        if (worksheet.rowCount < 2) {
            throw new Error("File Excel không có dữ liệu để nạp.");
        }

        let rowsToInsert = new Array();

        // Tải bản đồ mã trường -> ID trường để gán động
        const { data: truongs, error: errTruong } = await sb.from('truong_hoc').select('id, ma_truong');
        if (errTruong) throw errTruong;
        const mapTruong = {};
        if (truongs) truongs.forEach(t => {
            if (t.ma_truong) mapTruong[t.ma_truong.toUpperCase()] = t.id;
        });

        // Tải bản đồ môn học cho GV
        let mapMon = {};
        let validMonNames = [];
        if (loai === 'GV') {
            const { data: monHocs, error: errMon } = await sb.from('mon_hoc').select('id, ten_mon');
            if (errMon) throw errMon;
            if (monHocs) {
                monHocs.forEach(m => {
                    if (m.ten_mon) {
                        mapMon[m.ten_mon.trim().toLowerCase()] = m.id;
                        validMonNames.push(m.ten_mon.trim());
                    }
                });
            }
        }

        let maxStt = 0;
        const seenKeys = new Set();

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                // Kiểm tra xem dòng có dữ liệu không
                let hasValue = false;
                for (let c = 1; c <= 7; c++) {
                    const val = row.getCell(c).value;
                    if (val !== null && val !== undefined && String(val).trim() !== '') {
                        hasValue = true;
                        break;
                    }
                }
                if (!hasValue) return; // Bỏ qua dòng trống hoàn toàn

                let sttRaw = row.getCell(1).value;
                let stt = sttRaw ? parseInt(sttRaw.toString().trim()) : 0;
                if (!isNaN(stt) && stt > maxStt) maxStt = stt;

                if (loai === 'HS') {
                    let ma_hs = row.getCell(2).value ? row.getCell(2).value.toString().trim() : '';
                    let ho_ten = row.getCell(3).value ? row.getCell(3).value.toString().trim() : '';
                    let lop = row.getCell(4).value ? row.getCell(4).value.toString().trim() : '';
                    let ma_truong = row.getCell(5).value ? row.getCell(5).value.toString().trim().toUpperCase() : '';

                    if (!ma_hs) throw new Error(`Dòng ${rowNumber}: Thiếu thông tin Mã HS.`);
                    if (!ho_ten) throw new Error(`Dòng ${rowNumber}: Thiếu thông tin Họ và Tên.`);
                    if (!lop) throw new Error(`Dòng ${rowNumber}: Thiếu thông tin Lớp.`);

                    if (ma_truong && !mapTruong[ma_truong]) {
                        throw new Error(`Dòng ${rowNumber}: Mã trường [${ma_truong}] không tồn tại trong hệ thống.`);
                    }
                    let t_id = ma_truong ? mapTruong[ma_truong] : activeWorkspaceTruongId;
                    if (!t_id || t_id === 'ALL') {
                        throw new Error('Dòng dữ liệu chưa có mã trường và chưa chọn trường đích.');
                    }

                    const accountKey = `${t_id}::${ma_hs.toUpperCase()}`;
                    if (seenKeys.has(accountKey)) {
                        throw new Error(`Dòng ${rowNumber}: Trùng lặp mã học sinh [${ma_hs}] trong cùng một trường.`);
                    }
                    seenKeys.add(accountKey);

                    rowsToInsert.push({ ma_hs: ma_hs.toUpperCase(), ho_ten: ho_ten, lop: lop, truong_id: t_id });
                } else {
                    let ma_gv = row.getCell(2).value ? row.getCell(2).value.toString().trim() : '';
                    let ho_ten = row.getCell(3).value ? row.getCell(3).value.toString().trim() : '';
                    let quyenRaw = row.getCell(4).value ? row.getCell(4).value.toString().trim() : '';
                    let ma_truong = row.getCell(5).value ? row.getCell(5).value.toString().trim().toUpperCase() : '';
                    let monRaw = row.getCell(6).value ? row.getCell(6).value.toString().trim() : '';

                    if (!ma_gv) throw new Error(`Dòng ${rowNumber}: Thiếu thông tin Mã GV.`);
                    if (!ho_ten) throw new Error(`Dòng ${rowNumber}: Thiếu thông tin Họ và Tên.`);

                    let quyen;
                    if (quyenRaw) {
                        const normQuyen = quyenRaw.toLowerCase().replace(/[\s_]+/g, '');
                        if (normQuyen === 'gv' || normQuyen === 'giaovien' || normQuyen === 'giáoviên') {
                            quyen = 'GiaoVien';
                        } else if (normQuyen === 'admin') {
                            quyen = 'Admin';
                        } else {
                            throw new Error(`Dòng ${rowNumber}: Quyền [${quyenRaw}] không hợp lệ. Chỉ chấp nhận GiaoVien hoặc Admin.`);
                        }
                    }

                    if (ma_truong && !mapTruong[ma_truong]) {
                        throw new Error(`Dòng ${rowNumber}: Mã trường [${ma_truong}] không tồn tại trong hệ thống.`);
                    }
                    let t_id = ma_truong ? mapTruong[ma_truong] : activeWorkspaceTruongId;
                    if (!t_id || t_id === 'ALL') {
                        throw new Error('Dòng dữ liệu chưa có mã trường và chưa chọn trường đích.');
                    }

                    let mon_id;
                    if (monRaw) {
                        const normMon = monRaw.toLowerCase();
                        if (mapMon[normMon]) {
                            mon_id = mapMon[normMon];
                        } else {
                            throw new Error(`Dòng ${rowNumber}: Môn học [${monRaw}] không tồn tại. Danh sách môn hợp lệ: ${validMonNames.join(', ')}`);
                        }
                    }

                    const accountKey = `${t_id}::${ma_gv.toLowerCase()}`;
                    if (seenKeys.has(accountKey)) {
                        throw new Error(`Dòng ${rowNumber}: Trùng lặp mã giáo viên [${ma_gv}] trong cùng một trường.`);
                    }
                    seenKeys.add(accountKey);

                    const gvRow = { ma_gv: ma_gv, ho_ten: ho_ten, truong_id: t_id };
                    if (quyen) gvRow.quyen = quyen;
                    if (mon_id) gvRow.mon_id = mon_id;
                    rowsToInsert.push(gvRow);
                }
            }
        });

        if (rowsToInsert.length === 0) throw new Error("Không tìm thấy dữ liệu hợp lệ!");

        if (gvData.quyen !== 'Admin') throw new Error('Chỉ Admin được phép nạp tài khoản.');
        const result = await adminImportAccounts(loai, rowsToInsert);

        // Báo cáo đối chiếu số lượng quét được với số STT trong danh sách
        alert(`✅ Nạp thành công: ${result.count || rowsToInsert.length} tài khoản (${result.inserted || 0} thêm mới, ${result.updated || 0} cập nhật).\n📊 Kiểm tra chéo: Số thứ tự (STT) lớn nhất ghi nhận trong file Excel là ${maxStt}.`);
        
        if (loai === 'HS') fetchStudents(true); else fetchTeachers(true);
        fileInput.value = "";
    } catch(e) {
        alert("❌ Lỗi: " + e.message);
    } finally {
        if (btn) {
            btn.innerText = oldText;
            btn.disabled = false;
        }
    }
}
// ==========================================================
// QUẢN LÝ TÀI KHOẢN GIÁO VIÊN VÀ HỌC SINH
// ==========================================================

async function fetchStudents(forceReload = false) { 
    document.getElementById('hsBody').innerHTML = '<tr><td colspan="7">⏳ Đang tải...</td></tr>'; 
    
    let data;
    if (gvData.quyen === 'Admin') data = (await adminRpc('accounts_list', { kind: 'HS', truong_id: activeWorkspaceTruongId === 'ALL' ? null : activeWorkspaceTruongId })).rows;
    else {
        const response = await sb.from('hoc_sinh').select('id, truong_id, ma_hs, ho_ten, lop, quyen').eq('truong_id', gvData.truong_id).order('ma_hs', { ascending: true });
        data = response.data;
    }
    if(data) {
        allStudents = data.map(d => ({ 
            MaHS: d.ma_hs, 
            HoTen: d.ho_ten, 
            Lop: d.lop, 
            TenTruong: d.ten_truong || 'Hệ thống',
            TrangThai: getAccountPasswordState(d),
            Quyen: d.quyen, 
            id: d.id 
        }));
        renderSubTabsHS(); renderStudentTable(); 
        if(document.getElementById('tab3') && document.getElementById('tab3').classList.contains('active')) fetchDashboard(); 
    }
}

function renderSubTabsHS() { let groups = new Set(); allStudents.forEach(s => { if(s.Lop) groups.add(s.Lop); }); let html = `<button class="${currentStudentFilter==='TatCa'?'active':''}" onclick="filterStudents('TatCa')">Tất cả</button>`; groups.forEach(g => { html += `<button class="${currentStudentFilter===g?'active':''}" onclick="filterStudents('${g}')">${g}</button>`; }); document.getElementById('subTabsHS').innerHTML = html; }
function filterStudents(filter) { currentStudentFilter = filter; renderSubTabsHS(); renderStudentTable(); }

function renderStudentTable() { 
    let filtered = [...allStudents]; 
    filtered.sort((a, b) => (a.MaHS || "").localeCompare((b.MaHS || ""), undefined, {numeric: true, sensitivity: 'base'}));

    if(currentStudentFilter !== 'TatCa') { 
        filtered = filtered.filter(s => s.Lop === currentStudentFilter); 
    } 

    // Cập nhật tiêu đề bảng
    let thead = document.querySelector('#hsBody').previousElementSibling;
    if(thead && !thead.innerHTML.includes('Trường')) {
        thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><input type="checkbox" id="chkAllHS" onchange="toggleAll('HS')"></th><th>Mã HS</th><th>Họ và Tên</th><th>Lớp</th><th>Trường học</th><th>Trạng Thái</th><th>Thao Tác</th></tr>`;
    }

    let html = ""; 
    if(filtered.length === 0) html = '<tr><td colspan="7">Không có dữ liệu.</td></tr>'; 
    else { 
        filtered.forEach(hs => { 
            let statusHTML = hs.TrangThai === "KhongXacDinh" ? '<span style="color:#7f8c8d;">—</span>' : hs.TrangThai === "DaDoi"
                ? `<span style="background: #e8f5e9; color: #27ae60; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #27ae60; font-size: 12px;">✅ Đã đổi</span>` 
                : `<span style="background: #f1f3f4; color: #5f6368; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #dadce0; font-size: 12px;">Mặc định</span>`; 
            
            html += `<tr><td><input type="checkbox" class="chk-HS" value="${hs.id}"></td><td><b>${hs.MaHS}</b></td><td style="text-align:left;">${hs.HoTen}</td><td>${hs.Lop}</td><td style="font-size:11px; color:#5f6368;">${hs.TenTruong}</td><td>${statusHTML}</td><td><button style="background:#e74c3c; padding:5px 10px; border:none; border-radius:4px; color:white; cursor:pointer; font-weight:bold;" onclick="resetPass('${hs.MaHS}', '${hs.id}', 'HS')">Khôi phục</button></td></tr>`; 
        }); 
    } 
    document.getElementById('hsBody').innerHTML = html; 
}

async function fetchTeachers(forceReload = false) { 
    document.getElementById('gvBody').innerHTML = '<tr><td colspan="7" style="text-align:center;">⏳ Đang tải dữ liệu...</td></tr>'; 
    
    try {
        let pArr = new Array();
        pArr.push(sb.from('mon_hoc').select('*').order('created_at', {ascending: true}));
        if (gvData.quyen === 'Admin') {
            pArr.push(sb.from('truong_hoc').select('*').order('ten_truong', {ascending: true}));
        }
        let resArr = await Promise.all(pArr);
        g_sysMonList = resArr[0].data || new Array();
        if (resArr.length > 1) g_sysTruongList = resArr[1].data || new Array();

        let data;
        if (gvData.quyen === 'Admin') data = (await adminRpc('accounts_list', { kind: 'GV', truong_id: activeWorkspaceTruongId === 'ALL' ? null : activeWorkspaceTruongId })).rows;
        else {
            const response = await sb.from('giao_vien').select('id, truong_id, ma_gv, ho_ten, quyen, mon_id').eq('truong_id', gvData.truong_id).order('ma_gv', {ascending: true});
            if (response.error) throw response.error;
            data = response.data;
        }

        if(data) {
            allTeachers = data.map(d => {
                let matchedMon = g_sysMonList.find(m => m.id === d.mon_id);
                return { 
                    MaGV: d.ma_gv, 
                    HoTen: d.ho_ten, 
                    MonId: d.mon_id,
                    TruongId: d.truong_id,
                    TenMon: matchedMon ? matchedMon.ten_mon : 'Chưa phân công',
                    TenTruong: d.ten_truong || 'Hệ thống',
                    TrangThai: getAccountPasswordState(d),
                    Quyen: d.quyen, 
                    id: d.id 
                };
            });
            renderTeacherTable();
        }
    } catch (err) {
        console.error("Lỗi tải danh sách giáo viên:", err);
        document.getElementById('gvBody').innerHTML = `<tr><td colspan="7" style="text-align:center; color:#c0392b; font-weight:bold;">❌ Lỗi tải dữ liệu: Vui lòng kiểm tra lại kết nối mạng.</td></tr>`;
    }
}

function renderTeacherTable() {
    let thead = document.querySelector('#gvBody').previousElementSibling;
    if(thead && !thead.innerHTML.includes('Trường học')) {
        thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><input type="checkbox" id="chkAllGV" onchange="toggleAll('GV')"></th><th>Mã GV</th><th>Họ và Tên</th><th>Môn Phụ Trách</th><th>Trường học</th><th>Trạng Thái</th><th>Thao Tác</th></tr>`;
    }

    let html = ""; 
    if(allTeachers.length === 0) html = '<tr><td colspan="7" style="text-align:center;">Không có dữ liệu.</td></tr>'; 
    else { 
        // Sắp xếp cứng danh sách giáo viên theo MaGV
        let sortedTeachers = [...allTeachers].sort((a, b) => (a.MaGV || "").localeCompare((b.MaGV || ""), undefined, {numeric: true, sensitivity: 'base'}));
        
        sortedTeachers.forEach(gv => { 
            let statusHTML = gv.TrangThai === "KhongXacDinh" ? '<span style="color:#7f8c8d;">—</span>' : gv.TrangThai === "DaDoi"
                ? `<span style="background: #e8f5e9; color: #27ae60; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #27ae60; font-size: 12px;">✅ Đã đổi</span>` 
                : `<span style="background: #f1f3f4; color: #5f6368; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #dadce0; font-size: 12px;">Mặc định</span>`; 
            
            let selHtml = `<select onchange="capNhatMonGiaoVien('${gv.id}', this.value)" style="padding:6px; border-radius:4px; border:1px solid #ccc; font-weight:bold; color:#1a73e8; cursor:pointer; width:100%; outline:none; background:#f8faff;">`;
            selHtml += `<option value="">-- Chưa phân công --</option>`;
            g_sysMonList.forEach(m => {
                let sel = (gv.MonId === m.id) ? 'selected' : '';
                selHtml += `<option value="${m.id}" ${sel}>${m.ten_mon}</option>`;
            });
            selHtml += `</select>`;

            let selTruongHtml = `<select onchange="capNhatTruongGiaoVien('${gv.id}', this.value)" style="padding:6px; border-radius:4px; border:1px solid #ccc; font-weight:bold; color:#27ae60; cursor:pointer; width:100%; outline:none; background:#f1f8e9; font-size:11px;">`;
            if (window.g_sysTruongList) {
                g_sysTruongList.forEach(t => {
                    let sel = (gv.TruongId === t.id) ? 'selected' : '';
                    selTruongHtml += `<option value="${t.id}" ${sel}>${t.ten_truong}</option>`;
                });
            } else {
                selTruongHtml += `<option value="${gv.TruongId}">${gv.TenTruong}</option>`;
            }
            selTruongHtml += `</select>`;

            let chucVuHtml = gv.Quyen === 'Admin' ? `<span style="background:#fadbd8; color:#e74c3c; padding:4px 10px; border-radius:20px; font-weight:bold; font-size:12px; display:inline-block; margin-top:4px;">Admin Toàn quyền</span>` : selHtml;
            let truongDisplay = gvData.quyen === 'Admin' ? selTruongHtml : `<span style="font-size:11px; color:#5f6368;">${gv.TenTruong}</span>`;

            html += `<tr>
                <td style="text-align:center;"><input type="checkbox" class="chk-GV" value="${gv.id}" style="transform: scale(1.2);"></td>
                <td><b>${gv.MaGV}</b></td>
                <td>${gv.HoTen}</td>
                <td style="min-width: 150px;">${chucVuHtml}</td>
                <td style="min-width: 150px;">${truongDisplay}</td>
                <td>${statusHTML}</td>
                <td><button style="background:#e74c3c; padding:5px 10px; border:none; border-radius:4px; color:white; cursor:pointer; font-weight:bold;" onclick="resetPass('${gv.MaGV}', '${gv.id}', 'GV')">Khôi phục MK</button></td>
            </tr>`; 
        }); 
    } 
    document.getElementById('gvBody').innerHTML = html; 
}

async function capNhatTruongGiaoVien(gvId, truongId) {
    if(!confirm("Xác nhận chuyển giáo viên này sang trường mới?")) return fetchTeachers();
    try { await adminRpc('teacher_update_school', { id: gvId, truong_id: truongId });
        if (String(gvId) === String(gvData.id)) { gvData.truong_id = truongId; gvData.truong_ten = (g_sysTruongList || []).find((t) => t.id === truongId)?.ten_truong || gvData.truong_ten; sessionStorage.setItem('damSan_GVSession', JSON.stringify(safeGvProfile(gvData))); document.getElementById('truongNameDisplay').innerText = gvData.truong_ten || 'HỆ THỐNG V4'; }
        alert("✅ Đã chuyển trường thành công!");
        fetchTeachers();
    } catch(error) {
        alert("❌ Lỗi cập nhật trường học: " + error.message);
        fetchTeachers();
    }
}

async function capNhatMonGiaoVien(gvId, monId) {
    let valToUpdate = monId ? monId : null;
    try { await adminRpc('teacher_update_subject', { id: gvId, mon_id: valToUpdate });
        if (String(gvId) === String(gvData.id)) { gvData.mon_id = valToUpdate; sessionStorage.setItem('damSan_GVSession', JSON.stringify(safeGvProfile(gvData))); }
    } catch(error) {
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

    let idsToUpdate = Array.from(checkedBoxes).map(cb => cb.value);
    
    let btn = event.target;
    let oldText = btn.innerText; btn.innerText = "⏳ Đang xử lý..."; btn.disabled = true;

    let data = await adminRpc('accounts_reset_password', { kind: loai, ids: idsToUpdate });
    
    btn.innerText = oldText; btn.disabled = false;
    
    if(data && data.status === 'error') return alert(data.message);

    alert(`✅ Đã khôi phục mật khẩu thành công!`);
    if (loai === 'GV' && idsToUpdate.includes(gvData.id)) return clearGvSessionAndReturnToLogin('Tài khoản quản trị hiện tại đã được đưa về mật khẩu mặc định. Vui lòng đăng nhập lại.');
    if(document.getElementById('chkAll' + loai)) document.getElementById('chkAll' + loai).checked = false;
    if(loai === 'HS') fetchStudents(true); else fetchTeachers(true);
}

async function deleteSelectedAccounts(loai) {
    let checkedBoxes = document.querySelectorAll('.chk-' + loai + ':checked');
    if(checkedBoxes.length === 0) return alert("Vui lòng tick chọn ít nhất 1 tài khoản!");
    if(!confirm(`XÓA VĨNH VIỄN ${checkedBoxes.length} tài khoản đã chọn khỏi hệ thống?`)) return;

    let idsToDelete = Array.from(checkedBoxes).map(cb => cb.value);
    
    let btn = event.target;
    let oldText = btn.innerText; btn.innerText = "⏳ Đang xóa..."; btn.disabled = true;

    let data = await adminRpc('accounts_delete', { kind: loai, ids: idsToDelete });
    
    btn.innerText = oldText; btn.disabled = false;
    
    if(data && data.status === 'error') return alert(data.message);

    alert(`✅ Đã xóa tài khoản thành công!`);
    if (loai === 'GV' && idsToDelete.includes(gvData.id)) return clearGvSessionAndReturnToLogin('Tài khoản quản trị hiện tại đã bị xóa. Vui lòng đăng nhập lại.');
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

    try {
        await bankWrite('delete_ids', { ids: idsToDelete });
        document.getElementById('chkAllBank').checked = false;
        fetchFullBank(true);
    } catch (e) {
        alert("❌ Lỗi khi xóa dữ liệu: " + e.message);
    } finally {
        btnElement.innerText = oldText;
        btnElement.disabled = false;
    }
}

async function deleteBankBatch(deleteAll, btnElement) {
    if(deleteAll) {
        if (gvData.quyen !== 'Admin') return alert("Chỉ Admin mới có quyền xóa toàn bộ ngân hàng câu hỏi.");
        if (!activeWorkspaceTruongId || activeWorkspaceTruongId === 'ALL') {
            return alert("Vui lòng chọn TRƯỜNG ĐÍCH cụ thể để quản lý ngân hàng câu hỏi.");
        }
        let tenTruong = "trường đang chọn";
        let tr = (g_sysTruongList || []).find(t => String(t.id) === String(activeWorkspaceTruongId));
        if (tr) tenTruong = tr.ten_truong;

        if(!confirm(`🚨 BẠN ĐANG CHỌN XÓA SẠCH TOÀN BỘ KHO ĐỀ CỦA [${tenTruong}] TRÊN TẤT CẢ BỘ MÔN?\nBạn chắc chắn chứ?`)) return;

        let oldText = btnElement.innerText;
        btnElement.innerText = "⏳ Đang càn quét..."; btnElement.disabled = true; btnElement.style.background = "#7f8c8d";

        try {
            await bankWrite('delete_all', {});
            alert("✅ Đã xóa sạch toàn bộ kho đề của trường thành công!");
            fetchFullBank(true);
            loadBankMeta(true);
        } catch (error) {
            alert("❌ Lỗi máy chủ: " + error.message);
        } finally {
            btnElement.innerText = oldText;
            btnElement.disabled = false;
            btnElement.style.background = "#c0392b";
        }
        return;
    }
    else {
        let bH = document.getElementById("filterBaiHoc").value; let p = document.getElementById("filterPhan").value; let m = document.getElementById("filterMucDo").value;
        if(!bH && !p && !m) return alert("⚠️ Vui lòng chọn ít nhất 1 bộ lọc (Bài Học / Phần / Mức Độ) để xác định mảng câu hỏi cần xóa!");
        if(!confirm("Xóa toàn bộ các câu hỏi đang được lọc hiển thị trên màn hình?")) return;

        let oldText = btnElement.innerText; btnElement.innerText = "⏳ Đang càn quét..."; btnElement.disabled = true; btnElement.style.background = "#7f8c8d";

        let filterPayload = {};
        if(bH) filterPayload.bai_hoc = bH;
        if(p) filterPayload.phan = p;
        if(m) filterPayload.muc_do = m;

        try {
            await bankWrite('delete_filter', filterPayload);
            fetchFullBank(true);
            loadBankMeta(true);
        } catch (error) {
            alert("❌ Lỗi kết nối khi xóa: " + error.message);
        } finally {
            btnElement.innerText = oldText;
            btnElement.disabled = false;
            btnElement.style.background = "#e67e22";
        }
    }
}

/* =======================================================
   QUẢN LÝ TRƯỜNG VÀ MÔN HỌC (LOGIC BỊ THIẾU)
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
    let error = null; try { await adminRpc('school_create', { ma_truong: ma, ten_truong: ten }); } catch (e) { error = e; }
    btn.innerText = "Thêm"; btn.disabled = false;
    if(error) alert("Lỗi: " + error.message);
    else {
        document.getElementById('newMaTruong').value = '';
        document.getElementById('newTenTruong').value = '';
        await loadSysData();
        await refreshWorkspaceSelectors();
        if (isAccountManagementActive()) {
            clearAccountRuntimeState();
            await fetchStudents(true);
            await fetchTeachers(true);
        }
    }
}

async function xoaTruong(id) {
    if(!confirm("Xóa trường này?")) return;
    let error = null; try { await adminRpc('school_delete', { id }); } catch (e) { error = e; }
    if(error) return alert("Lỗi: " + error.message);
    if (String(id) === String(gvData.truong_id)) return clearGvSessionAndReturnToLogin('Trường chứa tài khoản quản trị hiện tại đã bị xóa. Phiên đăng nhập đã kết thúc.');
    if (String(id) === String(activeWorkspaceTruongId)) { activeWorkspaceTruongId = 'ALL'; localStorage.setItem('damSan_WorkspaceSchool', 'ALL'); }
    clearAccountRuntimeState(); await loadSysData(); await refreshWorkspaceSelectors(); loadMetaData(); taiDanhSachPhong(); fetchRadar();
    if (isAccountManagementActive()) {
        await fetchStudents(true);
        await fetchTeachers(true);
    }
}

async function themMonMoi() {
    let ten = document.getElementById('newTenMon').value.trim();
    if(!ten) return alert("Vui lòng nhập tên môn!");
    let btn = document.getElementById('btnThemMon');
    btn.innerText = "..."; btn.disabled = true;
    let error = null; try { await adminRpc('subject_create', { ten_mon: ten }); } catch (e) { error = e; }
    btn.innerText = "Thêm"; btn.disabled = false;
    if(error) alert("Lỗi: " + error.message);
    else {
        document.getElementById('newTenMon').value = '';
        await loadSysData();
        await refreshWorkspaceSelectors();
        loadBankMeta(true);
        if (isAccountManagementActive()) {
            await fetchTeachers(true);
        }
    }
}

async function xoaMon(id) {
    if(!confirm("Xóa môn này?")) return;
    let error = null; try { await adminRpc('subject_delete', { id }); } catch (e) { error = e; }
    if(error) return alert("Lỗi: " + error.message);
    if (String(id) === String(activeWorkspaceMonId)) { activeWorkspaceMonId = 'ALL'; localStorage.setItem('damSan_Workspace', 'ALL'); }
    if (String(id) === String(gvData.mon_id)) { gvData.mon_id = null; sessionStorage.setItem('damSan_GVSession', JSON.stringify(safeGvProfile(gvData))); }
    await loadSysData(); await refreshWorkspaceSelectors(); loadBankMeta(true); fetchFullBank(true); taiDanhSachPhong(); fetchRadar();
    if (isAccountManagementActive()) {
        await fetchTeachers(true);
    }
}

async function resetPass(ma, uid, loai) {
    if(!confirm(`Khôi phục mật khẩu mặc định (123456) cho tài khoản ${ma}?`)) return;
    let data = await adminRpc('accounts_reset_password', { kind: loai, ids: [uid] });
    if(data && data.status === 'error') return alert(data.message);
    if (loai === 'GV' && String(uid) === String(gvData.id)) return clearGvSessionAndReturnToLogin('Tài khoản quản trị hiện tại đã được đưa về mật khẩu mặc định. Vui lòng đăng nhập lại.');
    if(loai === 'HS') fetchStudents(true); else fetchTeachers(true);
}

async function migrateLegacyPasswords(loai, btnElement) {
    if (gvData.quyen !== 'Admin') return alert("Chỉ Admin mới có quyền thực hiện chuẩn hóa hàng loạt.");
    if (!confirm(`Chuẩn hóa mật khẩu legacy cho tài khoản ${loai} trong phạm vi trường đang chọn?`)) return;
    const oldText = btnElement ? btnElement.innerText : "";
    if (btnElement) { btnElement.innerText = "⏳ Đang chuẩn hóa..."; btnElement.disabled = true; }

    try {
        const data = await adminRpc('normalize_legacy_passwords', { kind: loai, truong_id: activeWorkspaceTruongId === 'ALL' ? null : activeWorkspaceTruongId });
        alert(`✅ Đã chuẩn hóa ${data.count || 0} tài khoản ${loai}.`);
        if (loai === 'HS') fetchStudents(true); else fetchTeachers(true);
    } catch (e) {
        alert("❌ Lỗi khi chuẩn hóa mật khẩu legacy: " + e.message);
    } finally {
        if (btnElement) { btnElement.innerText = oldText; btnElement.disabled = false; }
    }
}

// ==========================================================
// TÍNH NĂNG TÌM KIẾM THEO THỜI GIAN THỰC (LIVE SEARCH)
// ==========================================================

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

async function rpcDieuKhienPhongThi(roomId, trangThai, doiTuong = null, tenDot = null, thoiGian = null, setOpenTime = false) {
    const room = (allRoomsData || []).find((item) => String(item.id) === String(roomId));
    if (!room) throw new Error('Không xác định được trường đích của phòng thi.');
    const data = await staffRpc('rpc_dieu_khien_phong_thi', {
        p_ma_gv: gvData.ma_gv,
        p_truong_id: getRoomTargetSchoolId(room),
        p_room_id: roomId,
        p_trang_thai: trangThai,
        p_doi_tuong: doiTuong,
        p_ten_dot: tenDot,
        p_thoi_gian: thoiGian,
        p_set_open_time: setOpenTime
    });
    if (!data || data.status !== 'success') {
        throw new Error(data?.message || "Khong the dieu khien phong thi");
    }
    return data;
}

// ==========================================================
// CHRONOLOGICAL ROOM ORDERING (FLEX-LITE-008)
// ==========================================================

function parseRoomCreatedAtMs(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') {
        return Number.isFinite(val) ? val : null;
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return null;
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            const num = Number(trimmed);
            return Number.isFinite(num) ? num : null;
        }
        const ms = Date.parse(trimmed);
        return Number.isFinite(ms) ? ms : null;
    }
    if (val instanceof Date) {
        const ms = val.getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    return null;
}

function sortRoomsNewestFirstByCreatedAt(rooms) {
    if (!Array.isArray(rooms)) return [];
    if (rooms.length <= 1) return [...rooms];

    const copy = [...rooms];

    const hasAllValidCreatedAt = copy.every(r => {
        if (!r || typeof r !== 'object') return false;
        const raw = r.created_at !== undefined ? r.created_at : r.CreatedAt;
        return parseRoomCreatedAtMs(raw) !== null;
    });

    if (!hasAllValidCreatedAt) {
        return copy;
    }

    return copy
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const timeA = parseRoomCreatedAtMs(a.item.created_at !== undefined ? a.item.created_at : a.item.CreatedAt);
            const timeB = parseRoomCreatedAtMs(b.item.created_at !== undefined ? b.item.created_at : b.item.CreatedAt);
            if (timeB !== timeA) {
                return timeB - timeA;
            }
            return a.index - b.index;
        })
        .map(entry => entry.item);
}

async function rpcLayDanhSachPhongThi() {
    const monId = (activeWorkspaceMonId && activeWorkspaceMonId !== "ALL") ? activeWorkspaceMonId : null;
    const targetTruongId = gvData.quyen === 'Admin' && activeWorkspaceTruongId === 'ALL' ? null : activeWorkspaceTruongId;
    const data = await staffRpc('rpc_lay_danh_sach_phong_thi_gv', {
        p_ma_gv: gvData.ma_gv,
        p_truong_id: targetTruongId,
        p_mon_id: monId,
        p_xem_toan_bo: gvData.quyen === 'Admin' && activeWorkspaceTruongId === 'ALL'
    });
    if (!data || data.status !== 'success') {
        throw new Error(data?.message || "Khong tai duoc danh sach phong thi");
    }
    const rawRooms = data.rooms || new Array();
    return sortRoomsNewestFirstByCreatedAt(rawRooms);
}
