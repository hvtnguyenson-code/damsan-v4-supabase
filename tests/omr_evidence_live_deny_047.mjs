// This test uses no account credentials and writes no data.
// A public caller without the school's opaque staff token must be denied.
import assert from 'node:assert/strict';
const url='https://xcervjnwlchwfqvbeahy.supabase.co/functions/v1/omr-evidence';
const origin='https://hvtnguyenson-code.github.io';
const timer=AbortSignal.timeout(14000);
const preflight=await fetch(url,{method:'OPTIONS',headers:{
  'Origin':origin,'Access-Control-Request-Method':'POST',
  'Access-Control-Request-Headers':'content-type,apikey'
},signal:timer});
assert.equal(preflight.status,204,'Preflight must use OPTIONS 204');
assert.equal(preflight.headers.get('access-control-allow-origin'),origin,
  'Only the approved PWA origin should receive CORS access');
const unauthorized=await fetch(url,{method:'POST',headers:{
 'Origin':origin,'Content-Type':'application/json'
},body:JSON.stringify({
  action:'list',room_id:'00000000-0000-4000-8000-000000000000',
  staff_token:'invalid_synthetic_token_for_ci_testing_only'
}),signal:AbortSignal.timeout(14000)});
const raw=await unauthorized.text();
let body;try{body=JSON.parse(raw)}catch{
 throw Error('Expected JSON denial, not HTML/stack trace: HTTP '+unauthorized.status+' '+raw.slice(0,100))
}
assert.equal(unauthorized.status,403,'Unauthenticated live Edge call must be denied');
assert.equal(body.status,'error');
assert.equal(body.code,'staff_session_invalid');
assert(!raw.includes('SERVICE_ROLE_KEY'),'Never leak server secrets');
console.log('PASS OMR 047: deployed Free-tier Edge rejects unknown staff token; no data written');
