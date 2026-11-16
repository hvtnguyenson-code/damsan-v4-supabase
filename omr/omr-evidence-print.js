(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrEvidencePrint=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const encoder=new TextEncoder();
const byteText=s=>encoder.encode(s);
function isJpeg(bytes){return bytes?.length>8&&bytes[0]===255&&bytes[1]===216&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;}
function pdfFromJpeg(jpeg,width,height){
 if(!(jpeg instanceof Uint8Array)||!isJpeg(jpeg))throw Error('omr_pdf_jpeg_invalid');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8000||height>8000)
  throw Error('omr_pdf_dimensions_invalid');
 const pageW=595.28,pageH=841.89,margin=18;
 const scale=Math.min((pageW-2*margin)/width,(pageH-2*margin)/height);
 const w=width*scale,h=height*scale,tx=(pageW-w)/2,ty=(pageH-h)/2;
 const fmt=n=>Number(n.toFixed(3)).toString();
 const commands=byteText('q\n'+[w,0,0,h,tx,ty].map(fmt).join(' ')+' cm\n/Im0 Do\nQ\n');
 const chunks=[],offsets=[0];let total=0;
 const put=part=>{const b=typeof part==='string'?byteText(part):part;chunks.push(b);total+=b.length;};
 const open=n=>{offsets[n]=total;put(n+' 0 obj\n');};
 const close=()=>put('\nendobj\n');
 put('%PDF-1.4\n%OMR\n');
 open(1);put('<< /Type /Catalog /Pages 2 0 R >>');close();
 open(2);put('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');close();
 open(3);put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+fmt(pageW)+' '+fmt(pageH)+
  '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');close();
 open(4);put('<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+
  ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n');
 put(jpeg);put('\nendstream');close();
 open(5);put('<< /Length '+commands.length+' >>\nstream\n');put(commands);put('endstream');close();
 const xref=total;
 put('xref\n0 6\n0000000000 65535 f \n');
 for(let i=1;i<=5;i++)put(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 put('trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n'+xref+'\n%%EOF\n');
 const out=new Uint8Array(total);let p=0;
 for(const part of chunks){out.set(part,p);p+=part.length;}
 return out;
}
async function canvasJpeg(canvas,quality=.87){
 if(!canvas?.width||!canvas?.height)throw Error('omr_jpg_canvas_empty');
 const blob=await new Promise((resolve,reject)=>{
  canvas.toBlob(b=>b?resolve(b):reject(Error('omr_jpg_encode_failed')),'image/jpeg',quality);
 });
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if(!isJpeg(bytes))throw Error('omr_jpg_encode_invalid');
 return {bytes,width:canvas.width,height:canvas.height};
}
async function bytesToJpeg(source,mime='image/webp'){
 if(!(source instanceof Uint8Array)||source.length<12||source.length>2000000)
  throw Error('omr_image_input_invalid');
 if(typeof document==='undefined')throw Error('omr_image_browser_required');
 const blob=new Blob([source],{type:mime});
 let image=null,objectUrl=null;
 try{
  if(typeof createImageBitmap==='function'){
   try{image=await createImageBitmap(blob);}catch(_){/* legacy mobile fallback below */}
  }
  if(!image){
   objectUrl=URL.createObjectURL(blob);
   image=await new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);
    img.onerror=()=>reject(Error('omr_image_decode_failed'));img.src=objectUrl;
   });
  }
  const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
  if(!width||!height||width>8000||height>8000||width*height>24000000)
   throw Error('omr_image_dimensions_invalid');
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('omr_image_canvas_unavailable');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  ctx.drawImage(image,0,0,width,height);
  return await canvasJpeg(canvas,.87);
 }finally{
  if(image&&typeof image.close==='function')image.close();
  if(objectUrl)URL.revokeObjectURL(objectUrl);
 }
}
async function pdfFromCanvas(canvas){
 const jpeg=await canvasJpeg(canvas,.87);
 return pdfFromJpeg(jpeg.bytes,jpeg.width,jpeg.height);
}
return {isJpeg,canvasJpeg,bytesToJpeg,pdfFromJpeg,pdfFromCanvas};
});