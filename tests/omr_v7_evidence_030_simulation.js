const assert=require('assert');
const R=require('../omr/omr-v7-research.js');
const V=require('../omr/omr-v7-candidate.js');
const evidence=(score,fill,gradient=0,clipped=0)=>({score,fill,gradient,clipped});
const p1Cal={reliable:true,mark:.5,blank:.055,span:.445};
const p3Cal={reliable:true,mark:.505,background:.055,span:.45};
const row=(scores)=>R.decideRow(scores,p1Cal,['A','B','C','D']);
const col=(scores)=>V.decideP3Column(scores,['0','1','2','3'],p3Cal);
console.log('=== OMR V7 030 screenshot-derived difficult mark evidence ===');
// Test values approximate problem categories observed in real PWA screenshots;
// they are not pixel ground truth, nor a validated accuracy study.
assert.strictEqual(row([evidence(.30,.33),evidence(.06,.04),evidence(.07,.06),evidence(.055,.02)]).value,'A',
  'moderately shaded real pencil should not automatically become ?');
assert.strictEqual(row([evidence(.54,.88),evidence(.41,.70),evidence(.04,.04)]).state,'multiple',
  'two clearly shaded bubbles must remain invalid');
assert.strictEqual(row([evidence(.52,.70),evidence(.25,.34),evidence(.05,.04)]).state,'review',
  'possible erasure must not be silently accepted');
assert.strictEqual(col([evidence(.10,.20),evidence(.09,.15),evidence(.08,.14)]).state,'blank',
  'a blank numeric slot with grey printed outlines must not create a fake review');
assert.strictEqual(col([evidence(.24,.32),evidence(.07,.09),evidence(.06,.06)]).state,'single',
  'light but separated numeral should be read');
assert.strictEqual(col([evidence(.54,.86),evidence(.48,.74),evidence(.07,.05)]).state,'multiple',
  'two numeric marks require invalid/review');
assert.strictEqual(col([evidence(.49,.78),evidence(.23,.30),evidence(.07,.03)]).state,'review',
  'faint second numeric stroke must not be ignored');
assert.strictEqual(V.decodeP3([{state:'single',token:'3'},{state:'single',token:'0'},
  {state:'single',token:'0'},{state:'blank',token:''}]).value,'300');
assert.strictEqual(V.decodeP3([{state:'single',token:'3'},{state:'single',token:'0'},
  {state:'single',token:'0'},{state:'single',token:'0'}]).value,'3000');
assert.strictEqual(V.decodeP3([{state:'single',token:'3'},{state:'blank',token:''},
  {state:'single',token:'0'},{state:'blank',token:''}]).value,'?',
  'cannot interpolate an unmarked digit');
console.log('PASS OMR V7 030 failure-mode regression; not a real-photo accuracy claim');