(function(){
  'use strict';
  const $=id=>document.getElementById(id), tpl=DamSanOmrTemplate.template;
  let stream=null,facing='environment';
  const canvas=$('omrCanvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});

  function setStatus(msg,bad=false){const el=$('omrStatus');el.textContent=msg;el.className=bad?'bad':'ok';}
  function renderResult(r){
    $('omrResult').textContent=r.ok?JSON.stringify({sbd:r.sbd,maDe:r.maDe,p1:r.p1,p2:r.p2,p3:r.p3,uncertain:r.uncertain},null,2):JSON.stringify(r,null,2);
  }
  function analyzeCanvas(){
    try{
      const img=ctx.getImageData(0,0,canvas.width,canvas.height),r=DamSanOmr.analyzeImageData(img,tpl);renderResult(r);
      setStatus(r.ok?`Đã đọc phiếu. ${r.uncertain.length} mục cần kiểm tra.`:r.error,!r.ok);
    }catch(e){setStatus(e.message,true);}
  }
  async function loadFile(file){
    const img=new Image();
    img.onload=()=>{
      const max=1800,s=Math.min(1,max/Math.max(img.width,img.height));
      canvas.width=Math.round(img.width*s);canvas.height=Math.round(img.height*s);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      URL.revokeObjectURL(img.src);analyzeCanvas();
    };
    img.src=URL.createObjectURL(file);
  }
  async function openCamera(){
    closeCamera();
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}},audio:false});
      $('omrVideo').srcObject=stream;$('cameraPanel').hidden=false;
      setStatus('Camera sẵn sàng. Giữ trọn phiếu và bốn mốc góc trong khung.');
    }catch(e){setStatus('Không mở được camera: '+e.message,true);}
  }
  function closeCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}$('cameraPanel').hidden=true;}
  function capture(){
    const v=$('omrVideo');if(!v.videoWidth)return;
    const max=1800,s=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
    canvas.width=Math.round(v.videoWidth*s);canvas.height=Math.round(v.videoHeight*s);
    ctx.drawImage(v,0,0,canvas.width,canvas.height);closeCamera();analyzeCanvas();
  }
  $('omrFile').addEventListener('change',e=>e.target.files[0]&&loadFile(e.target.files[0]));
  $('openCamera').onclick=openCamera;$('closeCamera').onclick=closeCamera;$('captureCamera').onclick=capture;
  $('switchCamera').onclick=()=>{facing=facing==='environment'?'user':'environment';openCamera();};
  $('analyzeAgain').onclick=analyzeCanvas;
  $('templateInfo').textContent=`${tpl.name} • SBD ${tpl.expected.sbdDigits} số • mã đề ${tpl.expected.maDeDigits} số • ${tpl.expected.p1}-${tpl.expected.p2Questions}-${tpl.expected.p3}`;
  setStatus('OMR Lab độc lập — không kết nối DB, không ghi điểm.');
})();
