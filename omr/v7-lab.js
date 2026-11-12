(function(){
'use strict';
const O=window.DamSanOmr,V6=window.DamSanOmrReliabilityV6,V7=window.DamSanOmrV7Candidate,R=window.DamSanOmrV7Research,T=window.DamSanOmrTemplate?.template;
const $=id=>document.getElementById(id);let stream=null,busy=false,lastReport=null;
function status(s,bad=false){$('status').textContent=s;$('status').classList.toggle('error',bad);}
if(!O||!V6||!V7||!R||!T){status('Thiếu mô-đun nhận dạng V7 hoặc mẫu phiếu.',true);return;}
function draw(image,canvas){
canvas.width=image.width;canvas.height=image.height;
const ctx=canvas.getContext('2d',{willReadFrequently:true});
if(image.data)ctx.putImageData(image,0,0);
else{const data=new Uint8ClampedArray(image.width*image.height*4);
for(let i=0,j=0;i<image.gray.length;i++,j+=4){data[j]=data[j+1]=data[j+2]=image.gray[i];data[j+3]=255;}
ctx.putImageData(new ImageData(data,image.width,image.height),0,0);}
}
function rows(id,items,keys){
const body=$(id);body.replaceChildren();
if(!items.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=keys.length;td.textContent='Không có';tr.appendChild(td);body.appendChild(tr);return;}
for(const item of items){const tr=document.createElement('tr');for(const k of keys){const td=document.createElement('td');td.textContent=String(item[k]??'');tr.appendChild(td);}body.appendChild(tr);}
}
function fmt(v){
if(!v)return 'Không có dữ liệu.';
if(v.error)return v.error;
return 'Phần I: '+(v.p1||'—')+'\nPhần II:\n'+(v.p2||[]).map((s,i)=>(i+1)+'. '+s).join('\n')+
'\nPhần III: '+(v.p3||[]).map((s,i)=>(i+1)+': '+(s||'(trống)')).join(' | ');
}

function highlightIssues(canvas,scan){
  if(!scan?.issues?.length)return;
  const ctx=canvas.getContext('2d');
  const sx=(canvas.width-1)/T.widthCm,sy=(canvas.height-1)/T.heightCm;
  ctx.save();ctx.strokeStyle='#d13b27';ctx.lineWidth=Math.max(2,canvas.width*.0028);
  for(const issue of scan.issues){
    let points=null,match=null;
    if((match=/^P1\.(\d+)$/.exec(issue.key))){
      points=T.p1[Number(match[1])-1];
    }else if((match=/^P2\.(\d+)([abcd])$/.exec(issue.key))){
      const index=(Number(match[1])-1)*4+'abcd'.indexOf(match[2]);
      points=T.p2[index];
    }else if((match=/^P3\.(\d+)(?:\.(\d+))?$/.exec(issue.key))){
      const q=T.p3[Number(match[1])-1];
      points=match[2]?q?.[Number(match[2])-1]:q?.flat();
    }
    const xy=(points||[]).filter(Boolean).map(p=>[p[0]*sx,p[1]*sy]);
    if(!xy.length)continue;
    const m=Math.max(5,T.bubbleRadiusCm*sx*1.6);
    const xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]);
    const x0=Math.min(...xs)-m,y0=Math.min(...ys)-m;
    ctx.strokeRect(x0,y0,Math.max(...xs)-x0+m,Math.max(...ys)-y0+m);
  }
  ctx.restore();
}
function exportReport(){
 if(!lastReport)return;
 const text=JSON.stringify(lastReport,null,2);
 const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='damsan-omr-v7-local-report.json';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function render(v6,v7,image,rect,note){
$('results').hidden=false;draw(image,$('sourceImage'));
const target=$('rectifiedImage');if(rect){draw(rect,target);highlightIssues(target,v7);}else{target.width=1;target.height=1;}
$('photoNote').textContent=note;$('warpNote').textContent=rect?'Ảnh nắn để đối chiếu vị trí tô':'Chưa nắn được ảnh theo mốc';
$('v6Text').textContent=fmt(v6);$('v7Text').textContent=fmt(v7);
 lastReport={labVersion:'OMR_V7_INDEPENDENT',createdAt:new Date().toISOString(),
   note,sourceType:image.data?'photo':'synthetic',
   v6:{p1:v6?.p1||null,p2:v6?.p2||null,p3:v6?.p3||null,error:v6?.error||null},
   v7:v7?{p1:v7.p1,p2:v7.p2,p3:v7.p3,issues:v7.issues||[],
     invalidMarks:v7.invalidMarks||[],calibration:v7.calibration||null,
     p3Calibration:v7.p3Calibration||null,quality:v7.quality||null,
     requiresRetake:!!v7.requiresRetake,retakeReasons:v7.retakeReasons||[],
     geometryDiagnostic:v7.geometryDiagnostic||null,geometryModel:v7.geometryModel||null}:null};
 $('downloadReport').disabled=false;
if(!v7||v7.error){$('summary').textContent=v7?.error||'Lỗi nhận dạng';rows('issues',[],['key','state','reason']);rows('differences',[],['key','v6','v7']);return;}
const summary=['I/II: '+(v7.calibration?.reliable?'đã hiệu chuẩn':'chưa hiệu chuẩn'),
'III: '+(v7.p3Calibration?.reliable?'đã hiệu chuẩn':'chưa hiệu chuẩn'),
'Mốc trong: '+(v7.geometryApplied?'đã bù lệch':'không bù lệch'),
'Số cảnh báo: '+(v7.issues?.length||0),'Ghi điểm: KHÔNG'];
if(v7.retakeReasons?.length)summary.push('CẦN QUÉT LẠI: '+v7.retakeReasons.join('; '));
$('summary').textContent=summary.join(' · ');rows('issues',v7.issues||[],['key','state','reason']);
$('issueCount').textContent=(v7.issues?.length||0)+' vị trí không đủ rõ hoặc tô nhiều ô.';
const comparison=V7.compare(v6,v7);
rows('differences',comparison.differences||[],['key','v6','v7']);
$('differenceCount').textContent=comparison.available?comparison.count+' vị trí khác nhau.':'Không có kết quả V6 để so sánh.';
$('results').scrollIntoView({behavior:'smooth',block:'start'});
}
function processImage(image,note){
const v5=O.analyzeImageData(image,T);
let rect=null,v6=null;
if(v5.ok){
const gray=O.grayscale(image.data,image.width,image.height);
rect=O.warpTemplateGray(gray,image.width,image.height,v5.homography,T,1800);
v6=V6.analyzeRectified(rect,T);
}else v6={error:v5.error||'Không nhận diện được mốc góc'};
const v7=V7.analyzeImageData(image,T,O,V6,{requireInternalGeometry:false});
render(v6,v7,image,rect,note);
}
async function upload(file){
if(!file)return;
if(!file.type.startsWith('image/'))throw Error('Hãy chọn tệp hình ảnh.');
const bitmap=await createImageBitmap(file);
try{const ratio=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),c=document.createElement('canvas');
c.width=Math.max(1,Math.round(bitmap.width*ratio));c.height=Math.max(1,Math.round(bitmap.height*ratio));
const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,c.width,c.height);
processImage(ctx.getImageData(0,0,c.width,c.height),'Ảnh của thiết bị; xử lý cục bộ, không tải lên máy chủ');
}finally{bitmap.close?.();}
}
function makeDemo(mode){
const w=850,h=Math.round(w*T.heightCm/T.widthCm),g=new Uint8Array(w*h),radius=T.bubbleRadiusCm*(w-1)/T.widthCm;
g.fill(221);const pt=p=>[p[0]*(w-1)/T.widthCm,p[1]*(h-1)/T.heightCm];
function fill(point,value=53){
if(!point)return;const [x,y]=pt(point),r=radius*.63;
for(let yy=Math.max(0,Math.floor(y-r));yy<=Math.min(h-1,Math.ceil(y+r));yy++)
for(let xx=Math.max(0,Math.floor(x-r));xx<=Math.min(w-1,Math.ceil(x+r));xx++)
if((xx-x)**2+(yy-y)**2<=r*r)g[yy*w+xx]=value;
}
T.p1.forEach((row,i)=>fill(row[i%4]));T.p2.forEach((row,i)=>fill(row[i%2]));
const answers=mode==='p3blank'?['','','','','','']:['300','-12','12,3','3000','1,25','23'];
answers.forEach((word,i)=>Array.from(word).forEach((char,j)=>fill(T.p3[i][j][T.p3Labels.indexOf(char)])));
if(mode==='eraser')fill(T.p2[0][1],187);
if(mode==='double')fill(T.p2[7][0]);
if(['gradient','shadow'].includes(mode))for(let y=0;y<h;y++)for(let x=0;x<w;x++){
let f=.63+.33*x/w;
if(mode==='shadow'){const dx=x/w-.6,dy=y/h-.6;f=.95-.43*Math.exp(-1*((dx*dx+dy*dy)/.03));}
g[y*w+x]=Math.round(g[y*w+x]*f);}
if(mode==='glare'){
const [cx,cy]=pt(T.p2[7][1]),r=radius*2.5;
for(let y=Math.max(0,Math.floor(cy-r));y<Math.min(h,Math.ceil(cy+r));y++)
for(let x=Math.max(0,Math.floor(cx-r));x<Math.min(w,Math.ceil(cx+r));x++){
const k=((x-cx)/r)**2+((y-cy)/r)**2;
if(k<1)g[y*w+x]=Math.min(255,Math.round(g[y*w+x]+240*(1-k)));}}
if(mode==='fold'){
const prev=g.slice();
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const z=(x-w*.52)/(w*.18),shift=Math.round(10*Math.sin(y/85)*Math.exp(-z*z)),xx=x-shift;
g[y*w+x]=xx>=0&&xx<w?prev[y*w+xx]:221;}}
return {gray:g,width:w,height:h};
}
function demo(){
const mode=$('demoMode').value,rect=makeDemo(mode);
render(V6.analyzeRectified(rect,T),V7.analyzeRectified(rect,T),rect,rect,
'Ảnh mô phỏng "'+mode+'"; không phải ảnh thật.');
status('Đã chạy mô phỏng '+mode+' (đáp án chuẩn của mô phỏng đã biết).');
}
function stop(){
if(stream)stream.getTracks().forEach(x=>x.stop());stream=null;
$('liveVideo').srcObject=null;$('liveBox').hidden=true;
$('captureCamera').disabled=true;$('stopCamera').disabled=true;
}
async function openCam(){
stop();
if(!navigator.mediaDevices?.getUserMedia)throw Error('Cần quyền camera và HTTPS/localhost.');
stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
$('liveVideo').srcObject=stream;await $('liveVideo').play();
$('liveBox').hidden=false;$('captureCamera').disabled=false;$('stopCamera').disabled=false;
status('Giữ đủ bốn góc phiếu trong camera.');
}
function frame(){
const video=$('liveVideo');if(!video.videoWidth)throw Error('Camera chưa sẵn sàng');
const k=Math.min(1,1800/Math.max(video.videoWidth,video.videoHeight));
const c=document.createElement('canvas');c.width=Math.round(video.videoWidth*k);c.height=Math.round(video.videoHeight*k);
const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(video,0,0,c.width,c.height);return x.getImageData(0,0,c.width,c.height);
}
async function capture(){
if(busy)return;busy=true;$('captureCamera').disabled=true;
try{const frames=[];
for(let i=0;i<3;i++){frames.push(frame());if(i<2)await new Promise(done=>setTimeout(done,180));}
const gray=frames.map(f=>({gray:O.grayscale(f.data,f.width,f.height),width:f.width,height:f.height}));
const pick=R.chooseFrame(gray);stop();
processImage(frames[pick.index],'Camera: khung '+(pick.index+1)+'/3 có độ nét tương đối tốt nhất.');
status('Đã đọc ảnh, so sánh V6/V7. Không có thao tác lưu điểm.');
}finally{busy=false;if(stream)$('captureCamera').disabled=false;}
}
async function guarded(fn){try{await fn();}catch(e){status('Lỗi: '+String(e?.message||e),true);console.error(e);}}
$('photoFile').addEventListener('change',e=>guarded(()=>upload(e.target.files?.[0])));
$('runDemo').addEventListener('click',()=>guarded(demo));
$('downloadReport').addEventListener('click',exportReport);
$('startCamera').addEventListener('click',()=>guarded(openCam));
$('stopCamera').addEventListener('click',stop);
$('captureCamera').addEventListener('click',()=>guarded(capture));
window.addEventListener('pagehide',stop);
})();