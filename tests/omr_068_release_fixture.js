'use strict';
// No student data. All positions and answers have generated ground truth.
function makeFixture(T,{duplicateId=false,unequalMark=false}={}){
 const w=1239,h=1800,sx=(w-1)/T.widthCm,sy=(h-1)/T.heightCm;
 const radius=T.bubbleRadiusCm*(sx+sy)/2;
 const gray=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)gray[y*w+x]=Math.round(230+9*x/w-12*y/h);
 const dot=(p,strength,ring=false)=>{
  if(!p)return;const cx=p[0]*sx,cy=p[1]*sy;
  for(let y=Math.max(0,Math.floor(cy-1.1*radius));y<=Math.min(h-1,Math.ceil(cy+1.1*radius));y++)
   for(let x=Math.max(0,Math.floor(cx-1.1*radius));x<=Math.min(w-1,Math.ceil(cx+1.1*radius));x++){
    const d=Math.hypot((x-cx)/radius,(y-cy)/radius);
    if(ring?d>=.88&&d<=1.05:d<=.8)gray[y*w+x]=Math.round(gray[y*w+x]*(1-strength));
   }
 };
 for(const m of T.markers){
  const x=m.x*sx,y=m.y*sy,r=m.size*(sx+sy)/4;
  for(let yy=Math.max(0,Math.round(y-r));yy<Math.min(h,Math.round(y+r));yy++)
   for(let xx=Math.max(0,Math.round(x-r));xx<Math.min(w,Math.round(x+r));xx++)gray[yy*w+xx]=20;
 }
 const sbd='00120601',exam='0103',p1='ABCDABCDABCDABCDAB',p2=['Đ-S-Đ-S','Đ-S-Đ-S','Đ-S-Đ-S','Đ-S-Đ-S'],p3=['','-7','3,5','0','12',''];
 const fields=[[T.sbd,T.sbdLabels,[...sbd]],[T.maDe,T.maDeLabels,[...exam]],[T.p1,T.p1Labels,[...p1]],[T.p2,T.p2Labels,p2.flatMap(v=>v.split('-'))],
  [T.p3.flat(),T.p3Labels,p3.flatMap(v=>Array.from({length:4},(_,j)=>v[j]||''))]];
 for(const [rows,labels,values] of fields)rows.forEach((row,i)=>{
  row.forEach(p=>dot(p,.45,true));const p=row[labels.indexOf(values[i])];if(p)dot(p,.73);
 });
 if(duplicateId)dot(T.sbd[0][8],.73);
 if(unequalMark)dot(T.p1[0][1],.31);
 const data=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<gray.length;i++){data[4*i]=data[4*i+1]=data[4*i+2]=gray[i];data[4*i+3]=255;}
 const items=[...[...p1].map(dap_an_dung=>({phan:'1',dap_an_dung})),...p2.map(dap_an_dung=>({phan:'2',dap_an_dung})),...p3.map(dap_an_dung=>({phan:'3',dap_an_dung}))];
 return {pixels:{data,width:w,height:h},room:{id:'synthetic-room',MaPhong:'SYNTHETIC_068',assessment_type:'TOT_NGHIEP'},exams:[{ma_de:'103',cau_so:items}],
  students:[{id:'synthetic-student',ma_hs:'120601',ho_ten:'Synthetic',lop:'TEST'}],expected:{sbd,exam,p1,p2,p3}};
}
module.exports={makeFixture};
