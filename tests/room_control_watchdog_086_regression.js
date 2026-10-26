const fs=require('fs');
const assert=require('assert');

const student=fs.readFileSync('hoc_sinh.js','utf8');
const teacher=fs.readFileSync('giaovien.js','utf8');

assert(student.includes("syncActiveRoomRuntime('poll'); }, 5000)"), 'Active-room fallback polling must be 5 seconds');
assert(!student.includes("syncActiveRoomRuntime('poll'); }, 3000)"), '3-second active-room polling must be removed');

assert(teacher.includes("withClientTimeout(rpcPromise, 6000, 'room_control_timeout')"), 'Room-control RPC watchdog must be 6 seconds');
assert(teacher.includes("rpcLayDanhSachPhongThi(), 3000, 'reconcile_timeout'"), 'Timeout must reconcile against authoritative room list');
assert(teacher.includes("reconciled_after_timeout: true"), 'Confirmed server-side state after timeout must be treated as success');
assert(teacher.includes("Lệnh chưa được xác nhận sau 6 giây. Hệ thống đã nhả khóa; vui lòng thử lại."), 'Unconfirmed timeout must report and release UI');
assert(teacher.includes("Lệnh trước đang xử lý. Vui lòng thử lại sau vài giây."), 'room_busy must no longer fail silently');

console.log('ROOM_CONTROL_WATCHDOG_086_PASS');