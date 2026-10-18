const fs = require('fs');
const assert = require('assert');

const js = fs.readFileSync('giaovien.js', 'utf8');
const html = fs.readFileSync('giaovien.html', 'utf8');

function section(startToken, endToken) {
  const start = js.indexOf(startToken);
  const end = js.indexOf(endToken, start);
  assert(start >= 0 && end > start, 'Cannot extract section: ' + startToken);
  return js.slice(start, end);
}

console.log('=== TEACHER DASHBOARD REFRESH 082 ===');

const toggle = section('function toggleAutoRefresh()', '// Hàm Live Search bị thiếu');
assert(toggle.includes('setInterval(() => {'), '082 polling timer missing');
assert(toggle.includes('}, 20000);'), '082 fallback polling must be exactly 20 seconds');
assert(!toggle.includes('}, 5000);'), '082 must not retain 5-second dashboard polling');
assert(toggle.includes("dashTab.classList.contains('active')"), '082 must keep active-tab guard');
assert(toggle.includes('maPhong'), '082 must keep selected-room guard');
assert(toggle.includes('fetchDashboard(true);'), '082 fallback must reuse existing auto dashboard fetch');
assert(html.includes('Tự động làm mới dự phòng (20s)'), '082 teacher UI must show 20-second fallback cadence');
assert(html.includes('giaovien.js?v=20261018-teacher-dashboard-refresh-082'), '082 teacher cache-bust marker missing');

const realtime = section('function kichHoatLienKetRealtimeGiaoVien()', '/* =======================================================\n   LOGIC CHUYỂN TAB');
assert(realtime.includes("sb.channel('gv-ket-qua-master')"), '082 must preserve existing Realtime channel');
assert(realtime.includes("table: 'ket_qua'"), '082 must preserve ket_qua subscription');
assert(realtime.includes('payload.new?.phong_id || payload.old?.phong_id'), '082 must preserve room-scoped Realtime filter');
assert(realtime.includes('String(selectedRoom.id) === String(changedRoomId)'), '082 must preserve selected-room equality guard');
assert(realtime.includes('fetchDashboard(true);'), '082 Realtime must still refresh through existing dashboard fetch');
assert(realtime.includes('}, 3000);'), '082 must preserve existing 3-second Realtime debounce');

const fetchSection = section('async function fetchDashboard(isAuto = false)', 'function renderDashboardSubTabs');
assert(fetchSection.includes('if (isAuto && dashboardManualRefreshActive)'), '082 must preserve manual-vs-auto guard');
assert(fetchSection.includes("staffRpc('rpc_lay_ket_qua_phong_gv'"), '082 must preserve authoritative result RPC');
assert(fetchSection.includes('let myFetchId = ++globalFetchDashId;'), '082 must preserve stale-response sequencing');
assert(fetchSection.includes('if (myFetchId !== globalFetchDashId)'), '082 must preserve stale-response rejection');
assert(fetchSection.includes("return { status: 'success' };"), '082 must preserve success contract');

assert(html.includes('onclick="refreshDashboardManually()"'), '082 must preserve manual refresh button');
assert(js.includes('async function refreshDashboardManually()'), '082 manual refresh function missing');

console.log('PASS teacher_dashboard_refresh_082_simulation');
