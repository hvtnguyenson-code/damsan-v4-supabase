const assert=require('node:assert/strict');
const sharp=require(process.env.OMR060_SHARP_PATH||'sharp');
const C=require('../omr/omr-core.js'),V7=require('../omr/omr-v7-candidate.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template,P=require('../omr/omr-v7-pipeline-060.js');
const W=require('../omr/omr-result-write.js');
const fs=require('node:fs'),path=require('node:path');
const dir=process.env.OMR060_CORPUS_DIR;
if(!dir||!fs.existsSync(path.join(dir,'expected7.json')))
 throw Error('OMR060_CORPUS_DIR with authorized 7 original WebPs and expected7.json required');
const records=JSON.parse(fs.readFileSync(path.join(dir,'expected7.json'),'utf8'));
const ID_CASES=new Set(['precision_06','v7_03','v7_04','v7_10','v7_13']);
(async()=>{
 const rows=[];
 for(const entry of records){
  const {data,info}=await sharp(path.join(dir,entry.id+'.webp')).rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const res=P.analyze({data,width:info.width,height:info.height},T,{core:C,V7,longSide:1500,
    expectedStudentCode:entry.student_code,expectedExamCode:entry.variant});
  assert(res.registration?.internalMatches>=2,entry.id+' fiducials not matched');
  assert.equal(res.readOnly,true);assert.equal(res.validForSave,false);
  const suspicious=ID_CASES.has(entry.id);
  assert.equal(res.identity.valid,!suspicious,entry.id+' identity gate failed');
  assert.equal(res.ok,!suspicious,entry.id+' must not auto-accept unreliable identity');
  let edits=0;
  for(const edit of entry.edits||[]){
   edits++;
   assert.equal(res.answers.p3[Number(edit.key.split('.')[1])-1],edit.before);
   assert(res.issues.some(x=>x.key===edit.key||x.key.startsWith(edit.key+'.')),
     edit.key+' teacher-reviewed answer must remain flagged');
   assert(res.requiresReview,entry.id+' must require human review');
  }
  let fakeWrites=0;
  const preview={ok:true,room:{id:'offline-room'},student:{id:'offline-student'},
   variant:{code:entry.variant},rawAnswers:Array.from({length:28},(_,i)=>({key:i})),
   scan:{...res,_labReadOnly:true,captureMode:'compare'}};
  await assert.rejects(W.submitConfirmed(preview,async()=>{fakeWrites++;return {ok:true};}),
    /comparison_mode_never_writes/);
  assert.equal(fakeWrites,0);
  rows.push({id:entry.id,identityFlagged:!res.identity.valid,reviewCount:res.issues.length,
   manualCorrectionFlags:edits,scoringMatchesRecognized:
    res.answers.p1===entry.recognized.p1 &&
    JSON.stringify(res.answers.p2)===JSON.stringify(entry.recognized.p2) &&
    JSON.stringify(res.answers.p3)===JSON.stringify(entry.recognized.p3),
   calledWriter:fakeWrites});
 }
 const s={images:rows.length,identityBlocked:rows.filter(x=>x.identityFlagged).length,
  teacherCorrectionsProtected:rows.reduce((n,x)=>n+x.manualCorrectionFlags,0),
  readOnlyWrites:rows.reduce((n,x)=>n+x.calledWriter,0),
  answersMatch:rows.filter(x=>x.scoringMatchesRecognized).length};
 assert.deepEqual(s,{images:7,identityBlocked:5,teacherCorrectionsProtected:3,readOnlyWrites:0,answersMatch:7});
 console.log('REAL7_MERGE_GATE',JSON.stringify(s));
})().catch(e=>{console.error('GATE7_FAIL',e.stack);process.exitCode=1;});