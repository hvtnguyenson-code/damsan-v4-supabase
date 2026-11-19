'use strict';
const assert=require('node:assert/strict');
const C=require('../omr/field-060/field-comparison-060.js');
// A synthetic 060 export mimics the actual historical V7 identity omission.
// Do not use real student codes or images in a public CI fixture.
const previous={count:2,changes:[
 {key:'SBD',old:null,proposed:'00120001'},
 {key:'MADE',old:null,proposed:'0103'}
]};
const first=C.answerOnly(previous);
assert.equal(first.count,0);
assert.deepEqual(first.changes,[]);
assert.equal(first.scope,'ANSWERS_P1_P2_P3_ONLY');
assert.equal(previous.count,2,'historic evidence must not be mutated');
const report={version:2,readOnly:true,validForSave:false,
 identity:{valid:true},answers:{p1:'A'},comparison:previous};
const exported=C.exportWithAudit(report);
assert.equal(exported.comparison.count,0);
assert.equal(exported.comparisonBeforeCorrection.count,2);
assert.equal(exported.readOnly,true);
assert.equal(exported.validForSave,false);
assert.equal(report.comparison.count,2,'original stored evidence must be immutable');
const real=C.answerOnly({count:4,changes:[
 {key:'SBD',old:null,proposed:'00000000'},
 {key:'MADE',old:null,proposed:'0103'},
 {key:'P1.4',old:'A',proposed:'D'},
 {key:'P2.1b',old:'Đ',proposed:'?'}
]});
assert.equal(real.count,2,'genuine answer mismatch must remain visible');
assert.deepEqual(real.changes.map(x=>x.key),['P1.4','P2.1b']);
assert.equal(C.answerOnly(null),null);
assert.equal(C.answerOnly({count:1,changes:[{key:'OTHER',old:1,proposed:2}]}).count,0);
assert.equal(C.answerOnly({count:2,changes:[{key:'P3.6',old:'21',proposed:'27'},
 {key:'P2.4d',old:'S',proposed:'Đ'}]}).count,2);
console.log('PASS OMR 063 comparison: V7 absent ID excluded; P1/P2/P3 preserved; audit and safety retained');
