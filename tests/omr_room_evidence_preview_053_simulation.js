const assert=require('assert'),fs=require('fs');
const Naming=require('../omr/omr-evidence-naming.js');
const html=fs.readFileSync('giaovien.html','utf8');
const policy=html.match(/img-src ([^;]+);/)?.[1]||'';
assert(policy.includes('blob:'),'desktop CSP must allow a local blob image');
assert(!policy.includes('supabase.co'),'signed URLs must not be assigned directly to img.src');
const elements=new Map();
function element(id){
 if(!elements.has(id))elements.set(id,{
  id,hidden:true,style:{},dataset:{},textContent:'',
  addEventListener(){},removeAttribute(name){delete this[name];},
  scrollIntoView(){}
 });
 return elements.get(id);
}
global.document={
 getElementById:element,addEventListener(){},querySelectorAll(){return [];}
};
global.sessionStorage={getItem:()=> 'staff-token-synthetic'};
const item={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 student_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 student_code:'100434',student_name:'Đinh Cao Thùy Uyên',
 class_name:'10A4',exam_code:'103',revision:1,mode:'test',
 created_at:'2026-11-16T08:00:00Z'};
const url='https://example.supabase.co/storage/v1/object/sign/school/annotated.webp?token=dummy';
global.DamSanOmrEvidenceClient={
 clearPreparedDownload(){},list:async()=>[item],
 signed:async()=>({url,record:{evidence:{grade:{total:7.35}}}})
};
global.DamSanOmrEvidenceExport={};
global.DamSanOmrEvidenceNaming=Naming;
global.DamSanOmrEvidenceRuntime={getClient:()=>({})};
const image=element('omrRoomEvidenceImage');
const originalFetch=global.fetch,originalCreate=URL.createObjectURL,
 originalRevoke=URL.revokeObjectURL;
const revoked=[];let fetchOptions,created=0;
URL.createObjectURL=blob=>{
 assert(blob instanceof Blob&&blob.type==='image/webp');
 created++;return 'blob:omr-test-'+created;
};
URL.revokeObjectURL=href=>revoked.push(href);
global.fetch=async (urlArg,options)=>{
 assert.equal(String(urlArg),url);
 fetchOptions=options;
 return {ok:true,headers:{get:()=> 'image/webp'},
  blob:async()=>new Blob([new Uint8Array([82,73,70,70,1,2,3,4,87,69,66,80])],{type:'image/webp'})};
};
(async()=>{
 const Desktop=require('../omr/omr-room-evidence-desktop.js');
 await Desktop.refreshForRoom({id:'room-test',MaPhong:'OMR_V7_TEST'},{force:true});
 await Desktop.openBySbd('100434');
 assert.equal(fetchOptions.credentials,'omit');
 assert.equal(fetchOptions.cache,'no-store');
 assert.equal(image.src,'blob:omr-test-1','no cross-origin signed URL on img');
 assert.equal(element('omrRoomEvidenceDrawer').hidden,false);
 await Desktop.openBySbd('100434');
 assert(revoked.includes('blob:omr-test-1'),'previous preview URL must be released');
 Desktop.hideDrawer();
 assert.equal(element('omrRoomEvidenceDrawer').hidden,true);
 assert(revoked.includes('blob:omr-test-2'),'closing preview releases memory');
 console.log('PASS OMR 053: signed private preview displays via CSP-safe blob and revokes URLs');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
 global.fetch=originalFetch;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;
 delete global.document;delete global.sessionStorage;
 delete global.DamSanOmrEvidenceClient;delete global.DamSanOmrEvidenceExport;
 delete global.DamSanOmrEvidenceNaming;delete global.DamSanOmrEvidenceRuntime;
});
