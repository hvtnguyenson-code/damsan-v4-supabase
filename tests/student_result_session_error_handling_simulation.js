// =========================================================================
// Simulation Test: tests/student_result_session_error_handling_simulation.js
// TASK: FLEX-LITE-005 — Student Result Session & Error Handling Consistency
// =========================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== RUNNING FLEX-LITE-005 STUDENT RESULT SESSION & ERROR HANDLING SUITE ===\n');

// 1. Read source files
const hsJsSource = fs.readFileSync(path.join(__dirname, '..', 'hoc_sinh.js'), 'utf8');
const swJsSource = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const hsHtmlSource = fs.readFileSync(path.join(__dirname, '..', 'hoc_sinh.html'), 'utf8');

function createMockStudentEnv(initialSessionStorage = {}, initialLocalStorage = {}, rpcHandlers = {}) {
    const sessionStorageData = { ...initialSessionStorage };
    const localStorageData = { ...initialLocalStorage };
    const domElements = {};
    const alertCalls = [];

    function getEl(id) {
        if (!domElements[id]) {
            domElements[id] = {
                id,
                value: '',
                innerText: '',
                innerHTML: '',
                style: { display: 'block' },
                classList: {
                    _classes: new Set(),
                    add: function(c) { this._classes.add(c); },
                    remove: function(c) { this._classes.delete(c); },
                    contains: function(c) { return this._classes.has(c); }
                },
                appendChild: () => {},
                removeChild: () => {},
                setAttribute: () => {},
                getAttribute: () => null
            };
        }
        return domElements[id];
    }

    const sandbox = {
        console,
        Math,
        Object,
        Array,
        String,
        Number,
        Date,
        RegExp,
        parseFloat,
        parseInt,
        isNaN,
        JSON,
        Reflect,
        Set,
        Promise,
        setTimeout: (fn, ms) => { return setTimeout(fn, ms); },
        clearTimeout: (id) => clearTimeout(id),
        setInterval: (fn, ms) => { return setInterval(fn, ms); },
        clearInterval: (id) => clearInterval(id),
        safeHTML: (h) => (h || '').trim(),
        dinhDangThoiGianVN: (d) => String(d),
        alert: (msg) => { alertCalls.push(msg); },
        _getAlertCalls: () => alertCalls,
        addEventListener: () => {},
        removeEventListener: () => {},
        sessionStorage: {
            getItem: (k) => sessionStorageData[k] !== undefined ? sessionStorageData[k] : null,
            setItem: (k, v) => { sessionStorageData[k] = String(v); },
            removeItem: (k) => { delete sessionStorageData[k]; },
            _data: sessionStorageData
        },
        localStorage: {
            getItem: (k) => localStorageData[k] !== undefined ? localStorageData[k] : null,
            setItem: (k, v) => { localStorageData[k] = String(v); },
            removeItem: (k) => { delete localStorageData[k]; },
            _data: localStorageData
        },
        document: {
            getElementById: getEl,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({
                appendChild: () => {},
                setAttribute: () => {},
                innerHTML: '',
                textContent: ''
            }),
            addEventListener: () => {},
            removeEventListener: () => {},
            head: { appendChild: () => {}, removeChild: () => {} },
            body: { appendChild: () => {}, removeChild: () => {} }
        },
        navigator: { onLine: true },
        location: { reload: () => {} },
        supabase: {
            createClient: () => ({
                from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [] }) }) }),
                rpc: (name, params) => {
                    if (rpcHandlers[name]) {
                        return rpcHandlers[name](params);
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                channel: () => ({
                    on: function() { return this; },
                    subscribe: function() { return this; }
                }),
                removeChannel: () => {}
            })
        },
        window: {
            addEventListener: () => {},
            removeEventListener: () => {},
            location: { reload: () => {} }
        }
    };
    sandbox.window = sandbox;
    return sandbox;
}

// -------------------------------------------------------------------------
// SESSION-RESULT-01: checkTeacherCommand manual + invalid_session
// -------------------------------------------------------------------------
console.log('Test SESSION-RESULT-01: checkTeacherCommand manual + invalid_session clears auth and navigates to login');
(async () => {
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-123',
            damSan_StudentTokenExpiresAt: validExpiry,
            damSan_HSSession: JSON.stringify({ ma_hs: 'HS001', ho_ten: 'Nguyen Van A' })
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: {
                    status: 'error',
                    code: 'invalid_session',
                    message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
                },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.phong_id = 'phong-1';
    await env.checkTeacherCommand(false);

    assert.strictEqual(env.sessionStorage.getItem('damSan_StudentToken'), null, 'SESSION-RESULT-01: student token cleared');
    assert.strictEqual(env.sessionStorage.getItem('damSan_HSSession'), null, 'SESSION-RESULT-01: student session cleared');
    const alerts = env._getAlertCalls();
    assert.strictEqual(alerts.length, 1, 'SESSION-RESULT-01: exactly 1 alert shown');
    assert(alerts[0].includes('hết hạn') || alerts[0].includes('không hợp lệ'), 'SESSION-RESULT-01: session expiry message reported');
    assert(!alerts[0].includes('Lỗi kết nối máy chủ'), 'SESSION-RESULT-01: must NOT report network failure');
    assert(env.document.getElementById('login-section').classList.contains('active'), 'SESSION-RESULT-01: navigates to login-section');
    console.log('  -> PASSED');
})().then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-02: checkTeacherCommand auto + invalid_session
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-02: checkTeacherCommand auto + invalid_session stops polling and transitions to login');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-auto-123',
            damSan_StudentTokenExpiresAt: validExpiry,
            damSan_HSSession: JSON.stringify({ ma_hs: 'HS001' })
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: {
                    status: 'error',
                    code: 'invalid_session',
                    message: 'Phiên làm việc đã hết hạn.'
                },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.phong_id = 'phong-auto';
    env.state.room_opened_at = 1000;
    env.batDauPostReceiptLifecycleWatcher();

    await env.checkTeacherCommand(true);

    assert.strictEqual(env.sessionStorage.getItem('damSan_StudentToken'), null, 'SESSION-RESULT-02: token cleared');
    assert.strictEqual(env.getPostReceiptLifecyclePollTimer(), null, 'SESSION-RESULT-02: polling timer stopped');
    assert(env.document.getElementById('login-section').classList.contains('active'), 'SESSION-RESULT-02: navigated to login');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-03: Two concurrent invalid_session detections (Idempotency)
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-03: Two concurrent invalid_session calls are idempotent');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-idemp',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: { status: 'error', code: 'invalid_session', message: 'Hết hạn.' },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    // Trigger handleStudentInvalidSession directly twice concurrently
    env.handleStudentInvalidSession('Hết hạn');
    env.handleStudentInvalidSession('Hết hạn');

    const alerts = env._getAlertCalls();
    assert.strictEqual(alerts.length, 1, 'SESSION-RESULT-03: exactly 1 alert shown despite 2 calls');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-04: Network transport failure in manual mode
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-04: Network transport failure in manual mode preserves session and recovery evidence');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const mockReceipt = { submission_id: 'sub-001', received_at: '2026-09-02T10:00:00Z', state: 'SERVER_RECEIVED' };
    const mockFinal = { attempt_id: 'att-001', phong_id: 'phong-1', state: 'SERVER_RECEIVED' };
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-valid',
            damSan_StudentTokenExpiresAt: validExpiry,
            damSan_HSSession: JSON.stringify({ ma_hs: 'HS001' })
        },
        {
            'receipt_HS001_phong-1': JSON.stringify(mockReceipt),
            'final_HS001_phong-1': JSON.stringify(mockFinal)
        },
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: null,
                error: { message: 'Failed to fetch (network disconnected)' }
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.ma_hs = 'HS001';
    env.state.phong_id = 'phong-1';
    await env.checkTeacherCommand(false);

    assert.strictEqual(env.sessionStorage.getItem('damSan_StudentToken'), 'tok-valid', 'SESSION-RESULT-04: valid auth preserved');
    assert.strictEqual(env.localStorage.getItem('receipt_HS001_phong-1'), JSON.stringify(mockReceipt), 'SESSION-RESULT-04: receipt preserved');
    const alerts = env._getAlertCalls();
    assert.strictEqual(alerts.length, 1, 'SESSION-RESULT-04: exactly 1 alert shown');
    assert(alerts[0].includes('Lỗi kết nối máy chủ'), 'SESSION-RESULT-04: network failure surfaced');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-05: Network failure in auto mode
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-05: Network failure in auto mode fails quietly without alert storm');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-valid',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: null,
                error: { message: 'Network timeout' }
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.phong_id = 'phong-1';
    await env.checkTeacherCommand(true);

    assert.strictEqual(env.sessionStorage.getItem('damSan_StudentToken'), 'tok-valid', 'SESSION-RESULT-05: valid auth preserved');
    const alerts = env._getAlertCalls();
    assert.strictEqual(alerts.length, 0, 'SESSION-RESULT-05: no alert shown in auto mode');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-06: Non-session server error
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-06: Non-session server error surfaces message and does not clear session');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-valid',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: { status: 'error', code: 'internal_db_error', message: 'Cơ sở dữ liệu đang bận.' },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.phong_id = 'phong-1';
    await env.checkTeacherCommand(false);

    assert.strictEqual(env.sessionStorage.getItem('damSan_StudentToken'), 'tok-valid', 'SESSION-RESULT-06: valid auth preserved');
    const alerts = env._getAlertCalls();
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0], 'Cơ sở dữ liệu đang bận.', 'SESSION-RESULT-06: server message surfaced accurately');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-07: Successful CONG_BO_DIEM (Score displayed, answers hidden)
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-07: Successful CONG_BO_DIEM displays score and hides answer details');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-valid',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: {
                    status: 'success',
                    room_exists: true,
                    thoi_gian_mo: 1000,
                    trang_thai: 'CONG_BO_DIEM',
                    has_result: true,
                    result: {
                        diem: 8.75,
                        so_cau_dung: 35,
                        tong_so_cau: 40
                    }
                },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.phong_id = 'phong-1';
    env.state.room_opened_at = 1000;
    await env.checkTeacherCommand(false);

    assert.strictEqual(env.document.getElementById('final_score_val').innerText, '8.75', 'SESSION-RESULT-07: score is 8.75');
    assert.strictEqual(env.document.getElementById('score-display-area').style.display, 'block');
    assert.strictEqual(env.document.getElementById('review-content').innerHTML, '', 'SESSION-RESULT-07: review content empty (answers hidden)');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-08: Successful XEM_DAP_AN (Score + answer review rendered)
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-08: Successful XEM_DAP_AN renders score and answer review');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const mockChiTiet = [
        { q: 1, phan: '1', chon: 'A', dung: 'A', diem: 0.25 }
    ];
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-valid',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: {
                    status: 'success',
                    room_exists: true,
                    thoi_gian_mo: 1000,
                    trang_thai: 'XEM_DAP_AN',
                    has_result: true,
                    result: {
                        diem: 0.25,
                        chi_tiet: mockChiTiet
                    }
                },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.phong_id = 'phong-1';
    env.state.room_opened_at = 1000;
    await env.checkTeacherCommand(false);

    assert.strictEqual(env.document.getElementById('final_score_val').innerText, '0.25', 'SESSION-RESULT-08: score is 0.25');
    assert(env.document.getElementById('review-content').innerHTML.includes('CHI TIẾT BÀI LÀM & ĐÁP ÁN'), 'SESSION-RESULT-08: review content rendered');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-09: Authoritative score 0.25 remains 0.25
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-09: Authoritative score 0.25 is formatted directly as 0.25 (no re-scaling)');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-valid',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: {
                    status: 'success',
                    room_exists: true,
                    thoi_gian_mo: 1000,
                    trang_thai: 'CONG_BO_DIEM',
                    has_result: true,
                    result: { diem: 0.25 }
                },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.phong_id = 'phong-1';
    env.state.room_opened_at = 1000;
    await env.checkTeacherCommand(false);

    assert.strictEqual(env.document.getElementById('final_score_val').innerText, '0.25', 'SESSION-RESULT-09: 0.25 displayed');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-10: Authoritative score 10 remains 10 (never 400)
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-10: Authoritative score 10 is formatted as 10.00 (never 400)');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-valid',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: {
                    status: 'success',
                    room_exists: true,
                    thoi_gian_mo: 1000,
                    trang_thai: 'CONG_BO_DIEM',
                    has_result: true,
                    result: { diem: 10 }
                },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.phong_id = 'phong-1';
    env.state.room_opened_at = 1000;
    await env.checkTeacherCommand(false);

    assert.strictEqual(env.document.getElementById('final_score_val').innerText, '10.00', 'SESSION-RESULT-10: 10.00 displayed');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-11: invalid_session does NOT delete durable FINAL snapshot
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-11: invalid_session preserves durable FINAL snapshot');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const mockFinal = { attempt_id: 'att-durable-01', phong_id: 'phong-1', state: 'SERVER_RECEIVED', raw_answers: { 1: 'A' } };
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-expiring',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {
            'final_HS001_phong-1': JSON.stringify(mockFinal)
        },
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: { status: 'error', code: 'invalid_session', message: 'Hết hạn.' },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.ma_hs = 'HS001';
    env.state.phong_id = 'phong-1';
    await env.checkTeacherCommand(false);

    const savedFinal = env.localStorage.getItem('final_HS001_phong-1');
    assert.strictEqual(savedFinal, JSON.stringify(mockFinal), 'SESSION-RESULT-11: FINAL snapshot strictly preserved in localStorage');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-12: invalid_session does NOT delete submission receipt / attempt id
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-12: invalid_session preserves submission receipt and attempt id');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const mockReceipt = { submission_id: 'sub-durable-01', attempt_id: 'att-durable-01', received_at: '2026-09-02T10:00:00Z', state: 'SERVER_RECEIVED' };
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-expiring',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {
            'receipt_HS001_phong-1': JSON.stringify(mockReceipt)
        },
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: { status: 'error', code: 'invalid_session', message: 'Hết hạn.' },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.ma_hs = 'HS001';
    env.state.phong_id = 'phong-1';
    await env.checkTeacherCommand(false);

    const savedReceipt = env.localStorage.getItem('receipt_HS001_phong-1');
    assert.strictEqual(savedReceipt, JSON.stringify(mockReceipt), 'SESSION-RESULT-12: receipt strictly preserved in localStorage');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-13: After invalid session handling, authenticated polling timer is stopped
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-13: Authenticated polling timer/channels are stopped after invalid_session');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-valid',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {},
        {
            rpc_hoc_sinh_result_status: async () => ({
                data: { status: 'error', code: 'invalid_session', message: 'Hết hạn.' },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    env.state.phong_id = 'phong-1';
    env.state.room_opened_at = 1000;
    env.batDauPostReceiptLifecycleWatcher();
    assert.notStrictEqual(env.getPostReceiptLifecyclePollTimer(), null, 'SESSION-RESULT-13: polling timer was active');

    await env.checkTeacherCommand(true);
    assert.strictEqual(env.getPostReceiptLifecyclePollTimer(), null, 'SESSION-RESULT-13: polling timer cleared');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-14: joinRoom and checkTeacherCommand use consistent invalid-session semantics
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-14: joinRoom uses consistent invalid-session semantics');
    const validExpiry = new Date(Date.now() + 3600000).toISOString();
    const env = createMockStudentEnv(
        {
            damSan_StudentToken: 'tok-valid',
            damSan_StudentTokenExpiresAt: validExpiry
        },
        {},
        {
            rpc_hoc_sinh_room_info: async () => ({
                data: { status: 'error', code: 'invalid_session', message: 'Phiên hết hạn.' },
                error: null
            })
        }
    );

    vm.createContext(env);
    vm.runInContext(hsJsSource, env);

    await env.joinRoom('TEST_ROOM');
    assert.strictEqual(env.sessionStorage.getItem('damSan_StudentToken'), null, 'SESSION-RESULT-14: joinRoom clears token on invalid_session');
    assert(env.document.getElementById('login-section').classList.contains('active'), 'SESSION-RESULT-14: joinRoom navigates to login');
    console.log('  -> PASSED');
})()).then(() =>

// -------------------------------------------------------------------------
// SESSION-RESULT-15: Version synchronization
// -------------------------------------------------------------------------
(async () => {
    console.log('Test SESSION-RESULT-15: Version synchronization across hoc_sinh.js, sw.js, hoc_sinh.html');
    const expectedVersion = '20260902-flex-lite-005';
    assert(hsJsSource.includes(`const VERSION = '${expectedVersion}';`), 'SESSION-RESULT-15: hoc_sinh.js VERSION is 20260902-flex-lite-005');
    assert(swJsSource.includes(`const VERSION = '${expectedVersion}';`), 'SESSION-RESULT-15: sw.js VERSION is 20260902-flex-lite-005');
    assert(hsHtmlSource.includes(`hoc_sinh.js?v=${expectedVersion}`), 'SESSION-RESULT-15: hoc_sinh.html script tag uses 20260902-flex-lite-005');
    console.log('  -> PASSED');
})()).then(() => {
    console.log('\n=== ALL 15 FLEX-LITE-005 STUDENT RESULT SESSION & ERROR HANDLING TESTS PASSED ===\n');
}).catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
