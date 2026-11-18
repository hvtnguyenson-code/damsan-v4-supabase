'use strict';
// Private offline replay only. Never commit capture.webp or expected.json.
const fs=require('fs'),path=require('path'),performance=require('perf_hooks').performance;
const sharp=require(process.env.OMR060_SHARP_PATH||'sharp');
const C=require('../omr/omr-core.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const V7=require('../omr/omr-v7-candidate.js');
const P060=require('../omr/omr-v7-pipeline-060.js');
const CORPUS=process.env.OMR060_CORPUS_DIR;
if(!CORPUS||!fs.existsSync(path.join(CORPUS,'expected.json')))throw Error('OMR060_CORPUS_DIR must contain authorized private expected.json and capture.webp images');
const orig=JSON.parse(fs.readFileSync(path.join(CORPUS,'expected.json'),'utf8'));
if(orig.length!==32)throw Error('expected corpus 32 image records');
function compare(actual,stored){
 if(actual===undefined||actual===null||stored===undefined||stored===null)return null;
 const a=typeof actual==='string'?Array.from(actual):Array.isArray(actual)?actual:null;
 const b=typeof stored==='string'?Array.from(stored):Array.isArray(stored)?stored:null;
 if(!a||!b)return null;
 let wrong=0;
 for(let i=0;i<Math.max(a.length,b.length);i++){
  const x=Array.isArray(a[i])?JSON.stringify(a[i]):String(a[i]??'');
  const y=Array.isArray(b[i])?JSON.stringify(b[i]):String(b[i]??'');
  if(x!==y)wrong++;
 }
 return wrong;
}
function slim(v){
 if(!v)return {pass:false};
 return {pass:v.ok===true,stage:v.stage||null,
  reason:v.reason||v.error||null,
  registration:v.registration||null,
  confidence:v.identity?.valid,
  internalMatches:v.registration?.internalMatches||0,
  identityCodeMatch:v.identity?.maDe===undefined?null:null,
  issues:(v.issues||[]).length,
  requiresRetake:!!v.requiresRetake,elapsedMs:v.elapsedMs||null};
}
async function runOne(rec){
 const file=path.join(CORPUS,rec.id+'.webp');
 if(!fs.existsSync(file))return {id:rec.id,exception:'missing_file'};
 const {data,info}=await sharp(file).rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const image={data,width:info.width,height:info.height};
 let old,now,v5,tOld,tNew,tV5,errorOld=null,errorNew=null,errorV5=null;
 let t=performance.now();
 try{v5=C.analyzeImageData(image,T);}catch(e){errorV5=e.message;}
 tV5=Math.round(performance.now()-t);
 t=performance.now();
 try{old=V7.analyzeImageData(image,T,C,null,{longSide:1800});}catch(e){errorOld=e.message;}
 tOld=Math.round(performance.now()-t);
 t=performance.now();
 try{now=P060.analyze(image,T,{core:C,V7,longSide:1500,expectedStudentCode:rec.expected_student_code,expectedExamCode:rec.exam_code});}catch(e){errorNew=e.message;}
 tNew=Math.round(performance.now()-t);
 const baseline=rec.recognized||{};
 const oldParts=old?.p1===undefined?null:{p1:old.p1,p2:old.p2,p3:old.p3};
 const newParts=now?.answers||null;
 return {
  id:rec.id,origin:rec.room,examCode:rec.exam_code,px:[info.width,info.height],
  existingManualEdits:rec.edits?.length||0,existingWarnings:rec.uncertainties?.length||0,
  v5:{ok:!!v5?.ok,exception:errorV5,ms:tV5,studentCodeMatch:v5?.sbd===undefined?null:Number(v5.sbd)===Number(rec.expected_student_code),examCodeMatch:v5?.maDe===undefined?null:Number(v5.maDe)===Number(rec.exam_code),identityWarnings:(v5?.uncertain||[]).filter(x=>x.startsWith('SBD.')||x.startsWith('MADE.')).length},
  old:{...slim(old),exception:errorOld,ms:tOld,
    changedAgainstRecord:oldParts?{
      p1:compare(oldParts.p1,baseline.p1),p2:compare(oldParts.p2,baseline.p2),p3:compare(oldParts.p3,baseline.p3)
    }:null},
  v060:{...slim(now),exception:errorNew,ms:tNew,
    examCodeMatch:now?.identity?.maDe===undefined?null:Number(now.identity.maDe)===Number(rec.exam_code),
    studentCodeMatch:now?.identity?.sbd===undefined?null:Number(now.identity.sbd)===Number(rec.expected_student_code),
    changedAgainstRecord:newParts?{
      p1:compare(newParts.p1,baseline.p1),p2:compare(newParts.p2,baseline.p2),p3:compare(newParts.p3,baseline.p3)
    }:null,
    changedAgainstConfirmed:newParts?{
      p1:compare(newParts.p1,rec.confirmed?.p1),p2:compare(newParts.p2,rec.confirmed?.p2),p3:compare(newParts.p3,rec.confirmed?.p3)
    }:null,
    changedAgainstRerunV7:oldParts&&newParts?{
      p1:compare(newParts.p1,oldParts.p1),p2:compare(newParts.p2,oldParts.p2),p3:compare(newParts.p3,oldParts.p3)
    }:null,
    warnings:(now?.issues||[]).slice(0,20).map(x=>x.key),
    inkFlags:(now?.ink?.flags||[]).map(x=>({key:x.key,kind:x.kind}))
  }
 };
}
(async()=>{
 const out=[];
 for(const rec of orig){
  const r=await runOne(rec);out.push(r);
  console.log('REPLAY_FINAL',out.length,'/'+orig.length,rec.id,
    'old',r.old?.pass,'060',r.v060?.pass,'reg',r.v060?.registration?.internalMatches||0,
    'ms',r.v5?.ms,r.old?.ms,r.v060?.ms,'code',r.v060?.examCodeMatch,'student',r.v060?.studentCodeMatch,'error',r.v060?.reason||r.v060?.exception||'');
  if(out.length%4===0)fs.writeFileSync(path.join(CORPUS,'replay_guard_results.json'),JSON.stringify(out,null,2));
  await new Promise(x=>setTimeout(x,110));
 }
 fs.writeFileSync(path.join(CORPUS,'replay_results.json'),JSON.stringify(out,null,2));
 const stats={count:out.length,
 legacyV5Pass:out.filter(x=>x.v5.ok).length,
 legacyV5StudentCodeCorrect:out.filter(x=>x.v5.studentCodeMatch).length,
 legacyV5ExamCodeCorrect:out.filter(x=>x.v5.examCodeMatch).length,
 newStudentCodeCorrect:out.filter(x=>x.v060.studentCodeMatch).length,
 newStudentCodeWrong:out.filter(x=>x.v060.studentCodeMatch===false).length,
 legacyIdentityWarningSheets:out.filter(x=>x.v5.identityWarnings).length,
 newIdentityWarningSheets:out.filter(x=>x.v060.warnings.some(y=>y.startsWith('SBD.')||y.startsWith('MADE.'))).length,
   oldRegistrationPass:out.filter(x=>x.old.pass).length,
   newRegistrationPass:out.filter(x=>x.v060.registration?.internalMatches>=2).length,
   newOk:out.filter(x=>x.v060.pass).length,
   oldException:out.filter(x=>x.old.exception).length,
   newException:out.filter(x=>x.v060.exception).length,
   oldTimeMs:out.reduce((n,x)=>n+(x.old.ms||0),0),
 legacyV5TimeMs:out.reduce((n,x)=>n+(x.v5.ms||0),0),
   newTimeMs:out.reduce((n,x)=>n+(x.v060.ms||0),0),
   newExamCodeCorrect:out.filter(x=>x.v060.examCodeMatch).length,
   newExamCodeWrong:out.filter(x=>x.v060.examCodeMatch===false).length,
   oldVsNewDisagreement:out.filter(x=>Object.values(x.v060.changedAgainstRerunV7||{}).some(n=>n>0)).length,
   rooms:{}};
 for(const room of ['v7','precision']){
  const list=out.filter(x=>x.origin===room);
  stats.rooms[room]={n:list.length,oldPass:list.filter(x=>x.old.pass).length,
   newPass:list.filter(x=>x.v060.pass).length,
   newUncertain:list.filter(x=>x.v060.issues>0).length};
 }
 fs.writeFileSync(path.join(CORPUS,'replay_guard_summary.json'),JSON.stringify(stats,null,2));
 console.log('FINISHED',JSON.stringify(stats));
})().catch(e=>{console.error('REPLAY_FATAL',e.message);process.exitCode=1;});