const assert=require('assert'),fs=require('fs'),vm=require('vm');
const Lab=require('../omr/omr-v7-lab-score.js');
const B=require('../omr/omr-room-binding.js');
const S=require('../omr/omr-scoring.js');
const E=require('../omr/omr-scan-adapter.js');
const adapter=fs.readFileSync('omr/omr-scan-adapter.js','utf8');
const teacherModule=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const html=fs.readFileSync('teacher/index.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
const rev='20261116-teacher-pwa-041';
const bridge='omr-v7-runtime-20261116-041.js';
assert(html.includes('omr-v7-lab-score.js?v='+rev));
assert(sw.includes("'../omr/omr-v7-lab-score.js'"));
const a=html.indexOf('omr-v7-lab-score.js'),b=html.indexOf('omr-teacher-module.js');
assert(a>=0&&b>a);
assert(html.includes('src="./'+bridge+'?v='+rev+'"'));
assert(sw.includes("'./"+bridge+"'"));
const bundled=fs.readFileSync('teacher/'+bridge,'utf8');
assert.strictEqual(bundled,(adapter+'\n;\n'+teacherModule).replace(/\n+$/,'\n'));
assert(!teacherModule.includes('const module=fs.readFileSync'), 'test references real teacher module');
assert(teacherModule.includes('const LabScore=root.DamSanOmrV7LabScore;'));
assert(teacherModule.includes('LabScore.estimate(scan,v6,state.roomModel,B,S,E)'));
assert(teacherModule.includes('LabScore.estimate(scan,v7,state.roomModel,B,S,E)'));
const block=teacherModule.slice(teacherModule.indexOf('  function showV7Comparison(){'),
 teacherModule.indexOf('  function showV6Comparison(){'));
assert(!block.includes('state.lastPreview?.ok'),
 'V7 lab points must not require a successful V6 reviewCurrent');
assert(teacherModule.includes('scan._labReadOnly=mode===\'compare\''));
assert(teacherModule.includes("q('omrSave').hidden=!!state.lastScan?._labReadOnly"));
assert(teacherModule.includes('if(state.labEnabled||state.lastScan?._labReadOnly)'));
assert(fs.readFileSync('omr/omr-result-write.js','utf8').includes(
 "preview.scan?._labReadOnly||preview.scan?.captureMode==='compare'"));
const items=[
 ...Array.from({length:18},(_,i)=>({phan:'1',cau_so:i+1,dap_an_dung:'A'})),
 ...Array.from({length:4},(_,i)=>({phan:'2',cau_so:i+1,dap_an_dung:'Đ-S-Đ-S'})),
 ...['','175','15','','',''].map((answer,i)=>({phan:'3',cau_so:i+1,
   dap_an_dung:answer||'99999'}))
];
const room={id:'test',ma_phong:'OMR_V7_TEST',assessment_type:'TOT_NGHIEP'};
const model=B.buildRoomModel(room,[{ma_de:'103',cau_so:items}],
 [{id:'student-1',ma_hs:'100434',ho_ten:'Fixture'}]);
assert(model.valid1846);
const scan={ok:true,sbd:'00100434',maDe:'0103',
 p1:'A'.repeat(18),p2:Array(4).fill('Đ-S-Đ-S'),
 p3:Array(6).fill('?'),uncertain:[],invalidMarks:[],
 _labReadOnly:true,captureMode:'compare',_requiresRetake:true};
const v6={p1:scan.p1,p2:scan.p2,p3:Array(6).fill('?'),
 issues:Array.from({length:24},(_,i)=>({key:'P3.'+(Math.floor(i/4)+1)+'.'+(i%4+1)})),
 invalidMarks:[],calibration:{reliable:true},p3Calibration:{reliable:false},
 geometry:{status:'ok'}};
const v7={...v6,p3:['','175','15','','',''],issues:[],
 p3Calibration:{reliable:true},engine:'V7_COMPLETE_CANDIDATE',
 geometryDiagnostic:'ok',ok:true,requiresRetake:false,retakeReasons:[],
 readOnly:true,validForSave:false};
const previous=Lab.estimate(scan,v6,model,B,S,E);
const updated=Lab.estimate(scan,v7,model,B,S,E);
assert(!previous.ok&&/Phần III/.test(previous.reason));
assert(updated.ok&&updated.score===9,
 'V7 must score independently of V6 P3 calibration fail (18+4+6)');
assert(updated.readOnly===true&&updated.warningCount===0);
const veto=(mut,reason)=>{
 const result=Lab.estimate({...scan,...mut.scan},
  {...v7,...mut.candidate},mut.model||model,B,S,E);
 assert.strictEqual(result.ok,false,reason);
};
veto({scan:{_labReadOnly:false}},'normal grading must not use lab');
veto({scan:{captureMode:'v6'}},'not read-only compare');
veto({scan:{sbd:'11153389'}},'unidentified SBD');
veto({scan:{maDe:'1260'}},'unknown exam code');
veto({scan:{ok:false}},'invalid image');
veto({candidate:{p3Calibration:{reliable:false}}},'V7 failed P3 calibration');
veto({candidate:{calibration:{reliable:false}}},'V7 failed P1 calibration');
veto({candidate:{geometry:{status:'review'}}},'invalid interior markers');
veto({candidate:{requiresRetake:true}},'V7 retake veto');
veto({candidate:{p3:['7']}},'malformed 18–4–6');
veto({candidate:{readOnly:false}},'V7 candidate safety tag removed');
veto({model:{...model,valid1846:false}},'invalid room');
const withIssue={...v7,issues:[{key:'P2.1b',state:'review',reason:'Vết tẩy'}],
 p2:['Đ-?-Đ-S',...v7.p2.slice(1)]};
const tentative=Lab.estimate(scan,withIssue,model,B,S,E);
assert(tentative.ok&&tentative.requiresReview&&tentative.warningCount===1);
assert(tentative.score<updated.score,'unknown answer must not be counted as correct');
const globals={};
vm.runInNewContext(fs.readFileSync('omr/omr-v7-lab-score.js','utf8'),
 {globalThis:globals});
assert.strictEqual(typeof globals.DamSanOmrV7LabScore?.estimate,'function');
console.log('PASS OMR 040: independent V7 score, invalid V6 P3, all identity/geometry/write guards');
