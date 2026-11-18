'use strict';
// OMR-061: real local filesystem I/O, but NO Supabase RPC, DB or student data.
// A production-equivalent Postgres/Storage integration remains a separate hold.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const Core=require('../omr/omr-core.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const V7=require('../omr/omr-v7-candidate.js');
const P=require('../omr/omr-v7-pipeline-060.js');
const Adapter=require('../omr/omr-scan-adapter.js');
const W=require('../omr/omr-result-write.js');
const E=require('../omr/omr-evidence-client.js');
const Q=require('../omr/omr-evidence-queue-059.js');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'omr-061-'));
const at=point=>[350+point[0]*(200/2.54)*(548/2254),
  21+point[1]*(200/2.54)*(548/2254)];
function makeImage(duplicate){
 const w=1080,h=608,gray=new Uint8Array(w*h).fill(235);
 function box(cx,cy,r,v){
  for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)
   for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++)
    gray[y*w+x]=v;
 }
 function dot(cx,cy,r,v){
  for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)
   for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++)
    if((x-cx)**2+(y-cy)**2<=r*r)gray[y*w+x]=v;
 }
 for(const m of T.markers)
  box(...at([m.x,m.y]),Math.max(2,m.size*(200/2.54)*(548/2254)*.45),12);
 const sbd='00120601',code='0103';
 T.sbd.forEach((col,i)=>dot(...at(col[Number(sbd[i])]),3.3,35));
 T.maDe.forEach((col,i)=>dot(...at(col[Number(code[i])]),3.3,35));
 T.p1.forEach((row,i)=>dot(...at(row[i%4]),3.3,38));
 T.p2.forEach((row,i)=>dot(...at(row[i%2]),3.3,38));
 T.p3.forEach((q,i)=>{
  for(let j=0;j<3;j++){
   const pt=q[j][T.p3Labels.indexOf(String((i+j)%10))];
   if(pt)dot(...at(pt),3.3,38);
  }
 });
 if(duplicate)dot(...at(T.sbd[0][8]),3.3,35);
 const rgba=new Uint8Array(w*h*4);
 for(let i=0;i<gray.length;i++){
  const j=i*4;rgba[j]=rgba[j+1]=rgba[j+2]=gray[i];rgba[j+3]=255;
 }
 return {width:w,height:h,data:rgba};
}
function scanPreview(scan){
 return {ok:true,room:{id:'room-synthetic',ma_phong:'LAB_061'},
  student:{id:'student-synthetic',ma_hs:'120601'},variant:{code:'103'},
  rawAnswers:Array.from({length:28},(_,i)=>({chon:String(i%4)})),
  scan,reviewedUncertain:true,grade:{score:8.25}};
}
function readJSON(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function persist(file,data){
 const tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(data));fs.renameSync(tmp,file);
}
(async()=>{
 try{
  const img=makeImage(false);
  const recognized=P.analyze(img,T,{core:Core,V7,
    expectedStudentCode:'00120601',expectedExamCode:'103'});
  assert.equal(recognized.ok,true);
  assert.equal(recognized.readOnly,true);
  assert.equal(recognized.validForSave,false);
  assert.equal(recognized.identity.sbd,'00120601');
  assert.equal(recognized.identity.maDe,'0103');
  assert.equal(recognized.answers.p1.length,18);
  assert.equal(recognized.answers.p2.length,4);
  assert.equal(recognized.answers.p3.length,6);
  const noMatch=P.analyze(img,T,{core:Core,V7,
    expectedStudentCode:'00120602',expectedExamCode:'104'});
  assert.equal(noMatch.ok,false);
  assert(noMatch.identity.issues.some(x=>x.key==='SBD_BINDING'));
  assert(noMatch.identity.issues.some(x=>x.key==='MADE_BINDING'));
  const duplicate=P.analyze(makeImage(true),T,{core:Core,V7});
  assert.equal(duplicate.identity.valid,false);
  assert.throws(()=>Adapter.fromV7({ok:true},recognized.candidate));
  const research=P.toResearchScan(recognized);
  assert.equal(research.captureMode,'compare');
  assert.equal(research._labReadOnly,true);

  let calls=0,receipt=null;
  const rpc=async(name,payload)=>{
   calls++;assert.equal(name,'rpc_staff_submit_omr');
   const key=payload.p_phong_id+'_'+payload.p_hs_id;
   const f=path.join(dir,'grade.json');
   if(fs.existsSync(f))return {status:'conflict',code:'existing_result'};
   receipt={status:'success',submission_id:'synthetic-submission-1',source:'OMR',
     score:8.25,room:key,metadata:payload.p_source_metadata,
     answers:payload.p_raw_answers};
   persist(f,receipt);
   return receipt;
  };
  await assert.rejects(W.submitConfirmed(scanPreview(research),rpc),/comparison_mode_never_writes/);
  assert.equal(calls,0);
  assert.equal(fs.existsSync(path.join(dir,'grade.json')),false);
  // Independent canonical V7 writer fixture. Research results are never promoted.
  const official=scanPreview({recognitionEngine:'V7',captureMode:'v7',
    _labReadOnly:false,_requiresRetake:false,uncertain:[],invalidMarks:[]});
  const written=await W.submitConfirmed(official,rpc);
  assert.equal(written.status,'success');
  assert.equal(written.submission_id,'synthetic-submission-1');
  assert.equal(readJSON(path.join(dir,'grade.json')).source,'OMR');
  assert.equal((await W.submitConfirmed(official,rpc)).status,'conflict');

  // Exercise the actual evidence client/queue API against an isolated local
  // receiver with durable bytes, not the real Supabase Edge Function.
  const fixture=Buffer.from('synthetic-evidence-bytes-no-student-data');
  global.document={createElement:()=>({})};
  const canvas={width:10,height:10,toDataURL:type=>
    'data:'+type+';base64,'+fixture.toString('base64')};
  const body=E.prepare({scanId:'lab-061',revision:1,submissionId:written.submission_id,
    preview:official,report:{schema:1,confirmed:{p1:'ABCD'},grade:{total:8.25}},
    canvas,capture:canvas,mode:'official'});
  assert.equal(body.submission_id,written.submission_id);
  assert.equal(body.student_id,official.student.id);
  const queueFile=path.join(dir,'queue.json');
  const storage={
   list:async()=>fs.existsSync(queueFile)?readJSON(queueFile):[],
   put:async item=>{
    const list=await storage.list(),i=list.findIndex(x=>x.key===item.key);
    if(i>=0)list[i]=item;else list.push(item);persist(queueFile,list);
   },
   remove:async key=>persist(queueFile,(await storage.list()).filter(x=>x.key!==key))
  };
  const token='synthetic-staff-token-061',owner='synthetic-teacher';
  let offline=true,uploads=0;
  const sb={functions:{invoke:async(name,{body:sent})=>{
   assert.equal(name,'omr-evidence');
   uploads++;
   assert.equal(sent.submission_id,written.submission_id);
   assert.equal(sent.room_id,official.room.id);
   assert.equal(sent.student_id,official.student.id);
   assert.equal(sent.evidence.schema,1);
   const bytes=Buffer.from(sent.capture_image.split(',')[1],'base64');
   fs.writeFileSync(path.join(dir,'evidence.bin'),bytes);
   persist(path.join(dir,'artifact.json'),{
    submission_id:sent.submission_id,student_id:sent.student_id,
    sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
   return {data:{status:'success',artifact_id:'synthetic-artifact-1'},error:null};
  }}};
  const queue=Q.create({storage,getOwner:()=>owner,getToken:()=>token,
   send:async(t,p)=>{
    if(offline)throw Error('offline');
    return E.sendPrepared(sb,t,p);
   }});
  await queue.add({roomId:body.room_id,submissionId:body.submission_id,payload:body});
  assert.equal((await queue.list()).length,1);
  await queue.drain();
  assert.equal((await queue.list()).length,1);
  offline=false;
  await queue.drain();
  assert.equal((await queue.list()).length,0);
  assert.equal(uploads,1);
  assert(fs.readFileSync(path.join(dir,'evidence.bin')).equals(fixture));
  assert.equal(readJSON(path.join(dir,'artifact.json')).submission_id,written.submission_id);

  const html=fs.readFileSync('omr/omr-060-integration-lab.html','utf8');
  const js=fs.readFileSync('omr/omr-060-integration-lab.js','utf8');
  for(const script of ['omr-v7-candidate.js','omr-v7-pipeline-060.js',
    'omr-060-integration-lab.js'])assert(html.includes('src="'+script+'"'));
  assert(html.includes("connect-src 'none'"));
  assert(!html.includes('omr-result-write.js'));
  assert(!html.includes('supabase-js'));
  assert(!/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bsubmitConfirmed\b/.test(js));
  for(const p of ['teacher/index.html','omr/omr-teacher-module.js',
    'omr/omr-result-write.js'])assert(!fs.readFileSync(p,'utf8').includes('omr-060-integration-lab.js'));
  console.log('PASS OMR-061: actual 060 synthetic image, identity veto, 060 writer veto, canonical V7 local durable receipt, conflict, evidence queue retry, durable bytes, lab isolation');
  console.log('LIVE_SUPABASE_DB_WRITE=NOT_RUN LIVE_STORAGE_WRITE=NOT_RUN');
 }finally{
  delete global.document;
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
