const assert=require('assert'),fs=require('fs');
const E=require('../omr/omr-v7-evidence.js');
const Export=require('../omr/omr-evidence-export.js');
const source=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const html=fs.readFileSync('teacher/index.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
const desktop=fs.readFileSync('giaovien.html','utf8');
const backend=fs.readFileSync('supabase/functions/omr-evidence/index.ts','utf8');
const ddl=fs.readFileSync('docs/omr-evidence-ddl-proposal.sql','utf8');
assert(source.includes('const Evidence=root.DamSanOmrEvidence'));
assert(source.includes('state.evidenceCtx={rect,candidate,original:null'));
assert(source.includes('Evidence.compose(q('));
assert(source.includes("state.evidenceCtx.original={p1:scan.p1"));
assert(source.includes('id="omrEvidenceCanvas"'));
assert(source.includes('id="omrEvidenceHistory"'));
assert(source.includes('id="omrEvidenceExport"'));
assert(source.includes("evidenceRoomCode()==='OMR_V7_TEST'"));
assert(source.includes("state.evidenceData={record,preview,result,capture,signature:confirmed}"));
assert(source.includes("if(info.signature!==state.evidenceData?.signature)return;"));
assert(source.includes('await W.submitConfirmed(state.lastPreview,staffRpc)'));
assert(source.includes("officialEngine:'v7'"));
for(const asset of ['omr-v7-evidence.js','omr-evidence-client.js','omr-evidence-export.js']){
 assert(html.includes(asset),'PWA missing '+asset);
 assert(sw.includes(asset),'worker missing '+asset);
 assert(desktop.includes(asset),'desktop missing '+asset);
}
assert(html.includes('20261116-teacher-pwa-042'));
assert(sw.includes("const VERSION='20261116-teacher-pwa-042'"));
assert(backend.includes('const OFFICIAL_ENABLED = Deno.env.get("OMR_EVIDENCE_OFFICIAL_ENABLED") === "true"'));
assert(backend.includes('if(mode==="test"&&room.ma_phong!=="OMR_V7_TEST")'));
assert(backend.includes('if(mode==="official"&&!OFFICIAL_ENABLED)'));
assert(backend.includes('tokenHash(token)'));
assert(backend.includes('actor.school'));
assert(backend.includes('room.mon_id!==actor.subject'));
assert(backend.includes('student.truong_id!==room.truong_id'));
assert(backend.includes('.createSignedUrl(path,60)'));
assert(backend.includes('next_offset:(data||[]).length===200?offset+200:null'));
assert(backend.includes('storage_revision_content_conflict'));
assert(backend.includes('await sha256(prior)'));
assert(backend.includes('evidence_score_invalid'));
assert(!/console\.log\([^\n]*staff_token/.test(backend));
assert(ddl.includes('alter table public.omr_artifacts enable row level security'));
assert(ddl.includes('revoke all on public.omr_artifacts from public, anon, authenticated'));
assert(ddl.includes("'omr-evidence','omr-evidence',false"));
assert(!ddl.includes('create policy'));
assert.strictEqual(Export.crc32(new TextEncoder().encode('123456789')),0xcbf43926);
assert(fs.readFileSync('omr/omr-evidence-client.js','utf8').includes("for(let page=0;page<50;page++)"));
assert(fs.readFileSync('omr/omr-evidence-export.js','utf8').includes("padStart(2,'0')+'.zip'"));
(async()=>{
 const archive=Export.zip([
  {name:'manifest.json',data:'{"ok":true}'},
  {name:'sheets/test.txt',data:new TextEncoder().encode('Hello')}
 ]);
 assert(archive.size>100);
 const bytes=new Uint8Array(await archive.arrayBuffer());
 assert.strictEqual(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 assert.strictEqual(new DataView(bytes.buffer).getUint32(bytes.length-22,true),0x06054b50);
 const result=Export.rowsFrom([
  {status:'TEST',record:{scan_id:'s',evidence:{
   student_code:'100412',student_name:'Example',class_name:'10A4',exam_code:'105',
   grade:{total:7.35,parts:{p1:3.5,p2:2.6,p3:1.25},
    details:[{q:1,phan:'2',chon:'S-S-Đ-Đ',dung:'S-Đ-Đ-Đ',diem:0.5}]},
   edits:[{key:'P2.1b',before:'?',after:'S'}]
  }}}
 ]);
 assert.strictEqual(result.overview[0][7],7.35);
 assert.strictEqual(result.details[0][5],0.5);
 assert.strictEqual(result.audit[0][1],'P2.1b');
 assert.strictEqual(E.VERSION,'OMR_EVIDENCE_01');
 console.log('PASS OMR 045: evidence UI/export ZIP/Excel rows, sandbox-only cloud writes and private storage');
})().catch(e=>{console.error(e);process.exitCode=1;});
