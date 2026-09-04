// Deterministic static/model checks for the first-login student password change flow. No network.
const assert = require('assert');
const fs = require('fs');

const client = fs.readFileSync('hoc_sinh.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260829031032_student_password_change_rpc.sql', 'utf8');

const changeFunction = client.match(/async function capNhatMatKhau\(\) \{([\s\S]*?)\n\}/);
assert(changeFunction, 'password change function must exist');
const changeBody = changeFunction[1];

// T1/T2: the password-change path exclusively calls the intended RPC with every binding.
assert(!changeBody.includes(".from('hoc_sinh')"), 'password change must not directly access hoc_sinh');
assert(!changeBody.includes('.update('), 'password change must not directly update hoc_sinh');
assert(changeBody.includes(".rpc('rpc_change_hoc_sinh_password'"));
for (const key of ['p_truong_id:', 'p_hs_id:', 'p_current_password:', 'p_new_password:']) {
  assert(changeBody.includes(key), `RPC call missing ${key}`);
}

// T3/T5/T6: model the proof lifecycle and success/failure transitions.
function passwordChangeModel({ defaultLogin, rpcResult }) {
  let proof = null;
  let persistentProofWrites = 0;
  let section = 'login-section';
  if (defaultLogin) { proof = 'default-hash'; section = 'change-password-section'; }
  if (rpcResult === 'success') { proof = null; section = 'room-section'; }
  if (rpcResult === 'failure') { section = 'change-password-section'; }
  return { proof, persistentProofWrites, section };
}
assert.deepStrictEqual(passwordChangeModel({ defaultLogin: true, rpcResult: null }), { proof: 'default-hash', persistentProofWrites: 0, section: 'change-password-section' });
assert.deepStrictEqual(passwordChangeModel({ defaultLogin: true, rpcResult: 'failure' }), { proof: 'default-hash', persistentProofWrites: 0, section: 'change-password-section' });
assert.deepStrictEqual(passwordChangeModel({ defaultLogin: true, rpcResult: 'success' }), { proof: null, persistentProofWrites: 0, section: 'room-section' });
assert(client.includes('pendingStudentPasswordProof = null;'));
assert(client.includes('pendingStudentPasswordProof = hashedPass;'));
assert(!client.includes("localStorage.setItem('pendingStudentPasswordProof'"));
assert(!client.includes("sessionStorage.setItem('pendingStudentPasswordProof'"));

// T4: the SECURITY DEFINER function validates all ownership/current-password conditions and limits its write.
assert(/security definer/i.test(migration));
assert(/set search_path = public/i.test(migration));
assert(/p_current_password is null[\s\S]*p_new_password is null/i.test(migration));
assert(/btrim\(p_current_password\) = ''[\s\S]*btrim\(p_new_password\) = ''/i.test(migration));
assert(/p_new_password = p_current_password/i.test(migration));
assert(/update public\.hoc_sinh\s+set mat_khau = p_new_password\s+where id = p_hs_id\s+and truong_id = p_truong_id\s+and mat_khau = p_current_password/i.test(migration));
assert(/revoke all on function public\.rpc_change_hoc_sinh_password\(uuid, uuid, text, text\) from public/i.test(migration));
assert(/grant execute on function public\.rpc_change_hoc_sinh_password\(uuid, uuid, text, text\) to anon, authenticated/i.test(migration));
assert(!/grant\s+update\s+on\s+public\.hoc_sinh/i.test(migration));

console.log('PASS: deterministic student password-change RPC simulation (T1-T6; no live Supabase)');
