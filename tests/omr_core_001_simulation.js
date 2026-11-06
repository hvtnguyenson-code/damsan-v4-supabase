const assert=require('assert');
const T=require('../omr/omr-template-moet-18-4-6.js');
const O=require('../omr/omr-core.js');
console.log('=== OMR CORE 001 ===');

assert.strictEqual(T.validate().ok,true);
assert.strictEqual(T.template.p1.length,18);
assert.strictEqual(T.template.p2.length,16);
assert.strictEqual(T.template.p3.length,6);
assert.strictEqual(T.template.sbd.length,8);
assert.strictEqual(T.template.maDe.length,4);

const src=[[0,0],[10,0],[10,20],[0,20]], dst=[[100,50],[900,80],[850,1180],[120,1150]];
const H=O.homography4(src,dst);
for(let i=0;i<4;i++){
  const p=O.project(H,...src[i]);
  assert(Math.abs(p[0]-dst[i][0])<1e-6);
  assert(Math.abs(p[1]-dst[i][1])<1e-6);
}

assert.deepStrictEqual(O.choose([0.02,0.04,0.29,0.03],{min:0.1,gap:0.03}).index,2);
assert.strictEqual(O.choose([0.02,0.04,0.05,0.03],{min:0.1,gap:0.03}).index,-1);
assert.strictEqual(O.choose([0.02,0.26,0.24,0.03],{min:0.1,gap:0.03}).uncertain,true);

const w=200,h=300,rgba=new Uint8ClampedArray(w*h*4);
for(let i=0;i<rgba.length;i+=4){rgba[i]=rgba[i+1]=rgba[i+2]=255;rgba[i+3]=255;}
function box(cx,cy,s){
  for(let y=cy-s;y<=cy+s;y++) for(let x=cx-s;x<=cx+s;x++){
    const j=(y*w+x)*4;rgba[j]=rgba[j+1]=rgba[j+2]=0;
  }
}
box(12,12,6);box(188,12,6);box(188,288,6);box(12,288,6);
const g=O.grayscale(rgba,w,h),marks=O.detectCornerMarkers(g,w,h);
assert.strictEqual(marks.ok,true);
assert.strictEqual(marks.corners.length,4);

const tpl=T.template, sw=1638, sh=2339, sheet=new Uint8ClampedArray(sw*sh*4);
for(let i=0;i<sheet.length;i+=4){sheet[i]=sheet[i+1]=sheet[i+2]=255;sheet[i+3]=255;}
function blackRect(cx,cy,half){
  for(let y=Math.max(0,Math.round(cy-half));y<=Math.min(sh-1,Math.round(cy+half));y++)
    for(let x=Math.max(0,Math.round(cx-half));x<=Math.min(sw-1,Math.round(cx+half));x++){
      const j=(y*sw+x)*4;sheet[j]=sheet[j+1]=sheet[j+2]=0;
    }
}
function blackDisk(cx,cy,r){
  const rr=r*r;
  for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(sh-1,Math.ceil(cy+r));y++)
    for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(sw-1,Math.ceil(cx+r));x++)
      if((x-cx)**2+(y-cy)**2<=rr){const j=(y*sw+x)*4;sheet[j]=sheet[j+1]=sheet[j+2]=0;}
}
for(const mk of tpl.markers.slice(0,4)) blackRect(mk.x*100,mk.y*100,15);

const p1Expected='ABCDABCDABCDABCDAB';
tpl.p1.forEach((row,i)=>{
  const idx=tpl.p1Labels.indexOf(p1Expected[i]);
  blackDisk(row[idx][0]*100,row[idx][1]*100,9);
});

const p2Expected=['Đ-S-Đ-S','S-Đ-S-Đ','Đ-Đ-S-S','S-S-Đ-Đ'];
tpl.p2.forEach((row,i)=>{
  const label=p2Expected[Math.floor(i/4)].split('-')[i%4],idx=tpl.p2Labels.indexOf(label);
  blackDisk(row[idx][0]*100,row[idx][1]*100,9);
});

const sbdExpected='00001234';
tpl.sbd.forEach((col,i)=>blackDisk(col[Number(sbdExpected[i])][0]*100,col[Number(sbdExpected[i])][1]*100,8));
const maDeExpected='0444';
tpl.maDe.forEach((col,i)=>blackDisk(col[Number(maDeExpected[i])][0]*100,col[Number(maDeExpected[i])][1]*100,8));

const full=O.analyzeImageData({data:sheet,width:sw,height:sh},tpl);
assert.strictEqual(full.ok,true);
assert.strictEqual(full.sbd,sbdExpected);
assert.strictEqual(full.maDe,maDeExpected);
assert.strictEqual(full.p1,p1Expected);
assert.deepStrictEqual(full.p2,p2Expected);

console.log('PASS omr_core_001');
