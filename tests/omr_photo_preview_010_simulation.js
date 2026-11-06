const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
console.log('=== OMR PHOTO PREVIEW 010 ===');
const body=fs.readFileSync('omr/omr-teacher-module.js','utf8');
let blits=[];
const createCanvas=(w=0,h=0,name='source')=>({
  width:w,height:h,style:{},getContext:()=>({
    drawImage:(...args)=>blits.push({name,args})
  })
});
const globals={
  window:{
    DamSanOmrTemplate:{},
    DamSanOmr:{},
    DamSanOmrRoomBinding:{},
    DamSanOmrScoring:{},
    DamSanOmrResultWrite:{}
  },
  document:{createElement:kind=>{
    assert.strictEqual(kind,'canvas');
    return createCanvas(0,0,'cropped');
  }}
};
vm.runInNewContext(body,globals);
const api=globals.window.DamSanOmrTeacher;
assert(api,'teacher module should expose preview helpers');
const bounds=api._photoCropBounds([[310,130],[990,135],[1000,1060],[290,1050]],1280,1200);
assert(bounds,'valid corner quadrilateral must give bounds');
assert.strictEqual(bounds.x,250);
assert.strictEqual(bounds.y,88);
assert.strictEqual(bounds.width,790);
assert.strictEqual(bounds.height,1014);
assert(bounds.width/bounds.height<1,'portrait sheet must remain portrait in preview');
assert.strictEqual(api._photoCropBounds([[0,0],[5,5],[7,6],[0,8]],1280,1200),null,'degenerate corners must not crop');
assert.strictEqual(api._photoCropBounds(null,1280,1200),null,'missing corners must retain original');
assert.strictEqual(api._photoCropBounds([[0,0],[1,2],[NaN,3],[2,0]],1280,1200),null,'invalid coordinates must retain original');
const edge=api._photoCropBounds([[10,9],[1180,10],[1184,1190],[9,1188]],1200,1200);
assert(edge&&edge.x===0&&edge.y===0,'padding near edge must be clamped');
assert(edge.x+edge.width<=1200&&edge.y+edge.height<=1200);
blits=[];
const source=createCanvas(1280,1200,'source');
assert.strictEqual(api._renderReviewPhoto(source,[[310,130],[990,135],[1000,1060],[290,1050]]),true);
assert.strictEqual(source.width,790);
assert.strictEqual(source.height,1014);
assert.strictEqual(blits.length,2);
assert.strictEqual(blits[0].name,'cropped');
assert.strictEqual(blits[0].args[0],source);
assert.deepStrictEqual(blits[0].args.slice(1),[250,88,790,1014,0,0,790,1014]);
assert.strictEqual(blits[1].name,'source');
assert.strictEqual(blits[1].args.length,3,'source canvas must receive the cropped image after capture');
blits=[];
const fallback=createCanvas(1920,1080,'fallback');
assert.strictEqual(api._renderReviewPhoto(fallback,null),false);
assert.strictEqual(fallback.width,1920);
assert.strictEqual(fallback.height,1080);
assert.strictEqual(blits.length,0);
assert(body.indexOf('O.analyzeImageData(ctx.getImageData')<body.indexOf('renderReviewPhoto(c,scan.markerCorners)'),
  'recognition must happen on the source frame before preview crop');
assert(body.includes('id="omrPhotoLightbox"'));
assert(body.includes("q('omrPhotoExpand').onclick=openPhotoDetail"));
console.log('PASS omr_photo_preview_010');