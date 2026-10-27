const fs=require('fs');
const assert=require('assert');

const student=fs.readFileSync('hoc_sinh.js','utf8');
const teacher=fs.readFileSync('giaovien.js','utf8');
const studentHtml=fs.readFileSync('hoc_sinh.html','utf8');
const teacherHtml=fs.readFileSync('giaovien.html','utf8');

assert(student.includes("['ma_hs', 'mat_khau'].forEach"), 'Student login inputs must bind Enter');
assert(student.includes("document.getElementById('btn-login')"), 'Student Enter must call existing login button');
assert(student.includes("if (e.key !== 'Enter') return;"), 'Student login must filter Enter');
assert(teacher.includes("['gvUser', 'gvPass'].forEach"), 'Teacher login inputs must bind Enter');
assert(teacher.includes("document.getElementById('btnDangNhapGV')"), 'Teacher Enter must call existing login button');
assert(teacher.includes("if (e.key !== 'Enter') return;"), 'Teacher login must filter Enter');
assert(studentHtml.includes('id="btn-login"'), 'Student login button missing');
assert(teacherHtml.includes('id="btnDangNhapGV"'), 'Teacher login button missing');
assert(studentHtml.includes('20261027-browser-compat-088b'), 'Student HTML cache bust missing');
assert(teacherHtml.includes('20261027-pwa-installability-087'), 'Teacher HTML cache bust missing');

console.log('LOGIN_ENTER_SUBMIT_085_PASS');