const assert=require('assert'),V6=require('../omr/omr-reliability-v6.js');
console.log('=== OMR 016 V6 false-review regression ===');
const cal={reliable:true,markReference:.49639,blankReference:.03631};
const m=(score,fill,gradient=0)=>({score,fill,gradient,contrast:score,paper:190});
const check=(label,items,wanted,index)=>{
 const got=V6.classifyRow(items,cal,items.length===2?['Đ','S']:['A','B','C','D']);
 assert.strictEqual(got.state,wanted,label+' '+JSON.stringify(got));
 if(index!==undefined)assert.strictEqual(got.index,index,label+' chosen index');
 return got;
};
// Anonymous mark evidence representative of the real false '?' responses.
const first=check('P1.5 B',[m(.144,.371),m(.507,1,.712),m(.033,.08),m(.006,0)],'single',1);
assert(first.decisiveSingle&&first.separation>.2);
check('P1.14 A',[m(.621,1,.72),m(.006,0),m(.001,0),m(.010,0)],'single',0);
check('P1.16 D',[m(.005,0),m(.012,0),m(.007,0),m(.515,1,.75)],'single',3);
check('P1.17 B',[m(.002,0),m(.518,.968,.69),m(.004,0),m(.010,0)],'single',1);
check('P2.2b S',[m(.022,.063),m(.530,1,.68)],'single',1);
check('strong choice with erased trace',[m(.534,1,.65),m(.262,.921)],'single',0);
const disputed=check('P2.2d multiple evidence',[m(.392,1),m(.482,1,.45)],'review');
assert.strictEqual(disputed.decisiveSingle,false);
check('two filled circles',[m(.520,.95,.5),m(.530,1,.53)],'multiple');
const badlyLit=check('poor light and weak margin',[m(.230,.60,.72),m(.140,.35)],'review');
assert.strictEqual(badlyLit.decisiveSingle,false);
check('unmarked statement',[m(.020,0),m(.010,0)],'blank');
const noCal=V6.classifyRow([m(.60,1),m(.01,0)],{...cal,reliable:false},['Đ','S']);
assert.strictEqual(noCal.state,'review');
const goodLight=check('baseline clear mark',[m(.144,.371),m(.507,1,.05),m(.033,.08),m(.006,0)],'single',1);
assert.strictEqual(goodLight.decisiveSingle,true);
console.log('PASS omr_v6_false_review_016');