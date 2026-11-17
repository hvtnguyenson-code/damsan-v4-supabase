const assert=require('assert'),fs=require('fs');
const P=require('../omr/omr-precision-capture-experiment.js');
const w=120,h=180,gray=new Uint8Array(w*h).fill(180);
for(let y=20;y<160;y++)for(let x=15;x<105;x++)if((x+y)%9===0)gray[y*w+x]=45;
const corners=[[15,15],[105,15],[105,165],[15,165]];
const T={markers:[{name:'TOP-C'},{name:'MID-L'},{name:'MID-C'},{name:'MID-R'},{name:'P3-B3'}]};
const core={
 detectCornerMarkers:()=>({ok:true,corners,candidates:Array.from({length:12},()=>({cx:1,cy:1}))}),
 fastTemplateRegistration:()=>({ok:true,H:[1,0,0,0,1,0,0,0,1],area:.8}),
 matchTemplateMarkers:()=>({pairs:[{},{},{},{}],rmse:1})
};
const accepted=P.evaluate(gray,w,h,T,core,{minFocus:.1,minEdgeDensity:.0001});
assert(accepted.ready,'qualified frame must pass');
const badCorner=P.evaluate(gray,w,h,T,{...core,detectCornerMarkers:()=>({ok:false,candidates:[]})});
assert(!badCorner.ready&&badCorner.reason==='four_corners_missing');
const badInternal=P.evaluate(gray,w,h,T,{...core,matchTemplateMarkers:()=>({pairs:[],rmse:Infinity})},{minFocus:.1,minEdgeDensity:.0001});
assert(!badInternal.ready&&badInternal.reasons.includes('internal_controls_unverified'));
assert(P.chooseBest([{result:{ready:false,score:99}},{result:{ready:true,score:10}},{result:{ready:true,score:20}}]).frame.result.score===20);
const mod=fs.readFileSync('omr/omr-teacher-module.js','utf8');
assert(mod.includes("const PRECISION_TEST_ROOM_CODE='OMR_V7_PRECISION_TEST'"),'Must identify the dedicated test room');
assert(mod.includes('if(precisionCapture&&evidenceRoomCode()===PRECISION_TEST_ROOM_CODE)'), 'Experimental gate must be room-scoped');
assert(mod.includes("capture('auto');"),'capture must use current frame immediately');
assert(!mod.includes("get('omrPrecision')"), 'Global URL parameter must not enable experimental capture');
console.log('PASS precision capture test-room isolation, safety gates and best-frame selection');
