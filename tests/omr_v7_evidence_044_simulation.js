const assert=require('assert');
const E=require('../omr/omr-v7-evidence.js');
const S=require('../omr/omr-scoring.js');
const T=require('../omr/omr-template-moet-18-4-6.js').template;
const answerKey=[
 ...Array.from({length:18},()=>({phan:'1',dap_an_dung:'B'})),
 {phan:'2',dap_an_dung:'S-Đ-Đ-Đ'},
 {phan:'2',dap_an_dung:'S-Đ-Đ-S'},
 {phan:'2',dap_an_dung:'Đ-S-S-Đ'},
 {phan:'2',dap_an_dung:'Đ-Đ-Đ-S'},
 ...['150','10','11','18','7','21'].map(dap_an_dung=>({phan:'3',dap_an_dung}))
];
const scan={
 p1:'B'+'A'.repeat(17),p2:['S-S-Đ-Đ','S-Đ-Đ-S','Đ-S-S-Đ','Đ-S-S-Đ'],
 p3:['150','10','11','18','7','21'],
 uncertain:[],uncertainDetails:[],invalidMarks:[]
};
const prior={...scan,p2:['S-?-Đ-Đ',...scan.p2.slice(1)]};
const variant={code:'105',items:answerKey};
const raw=S.buildRawAnswers(scan,variant);
const grade=S.previewGrade(raw,variant,'TOT_NGHIEP',{});
assert.strictEqual(grade.parts.p2,2.6);
const preview={ok:true,room:{id:'room1'},student:{id:'student1',ho_ten:'Test'},
 variant,scan,grade,rawAnswers:raw};
const report=E.makeMarks(preview,T,prior);
assert.strictEqual(report.summary.manual,1);
assert(report.edits.some(e=>e.key==='P2.1b'&&e.before==='?'&&e.after==='S'));
const p2b=report.marks.filter(m=>m.key==='P2.1b');
assert.deepStrictEqual(p2b.map(m=>m.kind).sort(),['expected','wrong']);
assert(p2b.some(m=>m.edited));
assert(report.marks.some(m=>m.key==='P1.1'&&m.kind==='correct'));
assert(report.marks.some(m=>m.key==='P1.2'&&m.kind==='wrong'));
assert(report.marks.some(m=>m.key==='P1.2'&&m.kind==='expected'));
assert.deepStrictEqual(E.slotsOf('150'),['1','5','0','']);
assert.deepStrictEqual(E.slotsOf('-1,5'),['-','1',',','5']);
assert.strictEqual(E.slotsOf('12345'),null);
assert(report.marks.some(m=>m.key==='P3.1.1'&&m.kind==='correct'));
const wrongDigitDetails=grade.details.map((d,i)=>i===22?{...d,chon:'151',dung:'150',diem:0}:d);
const wrongDigit=E.makeMarks({...preview,grade:{...grade,details:wrongDigitDetails}},T,prior);
assert(wrongDigit.marks.some(m=>m.key==='P3.1.1'&&m.kind==='correct'));
assert(wrongDigit.marks.some(m=>m.key==='P3.1.2'&&m.kind==='correct'));
assert(wrongDigit.marks.some(m=>m.key==='P3.1.3'&&m.kind==='wrong'));
assert(wrongDigit.marks.some(m=>m.key==='P3.1.3'&&m.kind==='expected'));
const compact={...preview,grade:{...grade,details:[...grade.details.slice(0,22),{q:23,phan:'3',chon:'12345',dung:'123456',diem:0},...grade.details.slice(23)]}};
const over=E.makeMarks(compact,T,prior);
assert(over.summary.unsafeP3Answer>=1);
const artifact=E.record(preview,prior,report,{scanId:'sample-44',mode:'test'});
assert.strictEqual(artifact.confirmed.p2[0],'S-S-Đ-Đ');
assert.strictEqual(artifact.recognized.p2[0],'S-?-Đ-Đ');
assert.strictEqual(artifact.scan_id,'sample-44');
assert.strictEqual(E.displayScore(7.3500000000000005),'7,35');
assert.throws(()=>E.makeMarks({ok:false},T,prior),/PREVIEW_REQUIRED/);
console.log('PASS OMR 044: independent correct/wrong expected rings, teacher edits, P1/P2/P3, JSON evidence');
