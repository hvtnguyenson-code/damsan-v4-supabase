const assert=require('assert'),fs=require('fs');
const Client=require('../omr/omr-evidence-client.js');
const Export=require('../omr/omr-evidence-export.js');
const moduleJs=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const html=fs.readFileSync('teacher/index.html','utf8');
const sw=fs.readFileSync('teacher/sw.js','utf8');
assert(moduleJs.includes('id="omrEvidenceReady"'),'real download anchor required');
assert(moduleJs.includes("EvidenceClient.prepareDownload(output.archive,output.filename,link)"));
assert(moduleJs.includes('download:false'),'never rely solely on an async auto-download');
assert(moduleJs.includes("status.scrollIntoView?.("),'mobile errors must be brought into view');
assert(moduleJs.includes("link.scrollIntoView?.("),'ready link must be brought into view');
assert(html.includes('20261116-teacher-pwa-043'));
assert(sw.includes("const VERSION='20261116-teacher-pwa-043'"));
const urls=new Set();
const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
let next=0;
URL.createObjectURL=()=>{const href='blob:mock-'+(++next);urls.add(href);return href;};
URL.revokeObjectURL=href=>{assert(urls.has(href));urls.delete(href);};
const anchor={tagName:'A',style:{display:'none'},removeAttribute(name){delete this[name];}};
try {
 const zip=new Blob(['zip-content'],{type:'application/zip'});
 const ready=Client.prepareDownload(zip,'omr-minh-chung.zip',anchor);
 assert.equal(ready.bytes,zip.size);
 assert.equal(anchor.download,'omr-minh-chung.zip');
 assert.equal(anchor.href,'blob:mock-1');
 assert.equal(anchor.style.display,'block');
 assert.equal(urls.size,1,'keep blob alive until explicit revocation');
 Client.prepareDownload(zip,'omr-minh-chung-2.zip',anchor);
 assert.equal(urls.size,1,'release previous export when replaced');
 Client.clearPreparedDownload(anchor);
 assert.equal(urls.size,0);
 assert.equal(anchor.style.display,'none');
 assert.equal(anchor.href,undefined);
}finally{
 URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;
}
class MockSheet {
 constructor(){this.rows=[];this.autoFilter={};}
 addRow(values){
  const cells=[];
  const row={getCell(i){return cells[i]||= {address:'N'+i};},font:null};
  this.rows.push({values,row});return row;
 }
 getRow(n){return this.rows[n-1].row;}
 set columns(value){this._columns=value;}
}
class MockBook{
 constructor(){this.xlsx={writeBuffer:async()=>new Uint8Array(1400).fill(23)};}
 addWorksheet(){return new MockSheet();}
}
global.window={ExcelJS:{Workbook:MockBook}};
const oldFetch=global.fetch;
let opened=0,automatic=0;
global.fetch=async (url,options)=>{
 assert(String(url).startsWith('https://example.supabase.co/storage/v1/object/sign/'));
 assert.strictEqual(options.credentials,'omit');
 opened++;
 return {ok:true,headers:{get:(name)=>name==='content-type'?'image/webp':null},
  arrayBuffer:async()=>new Uint8Array([82,73,70,70,9,8,7,6,87,69,66,80]).buffer};
};
const client={
 signed:async()=>({url:'https://example.supabase.co/storage/v1/object/sign/private/a?token=example',
  record:{evidence:{student_code:'100412',student_name:'Sample',class_name:'10A4',exam_code:'105',
   grade:{total:7.35,parts:{p1:3.5,p2:2.6,p3:1.25},details:[]},edits:[]},scan_id:'abc'}}),
 downloadBlob:()=>automatic++
};
(async()=>{
 const result=await Export.exportBatch([{id:'12345678-1234-4234-8234-123456789abc',scan_id:'abc',
  exam_code:'105'}],client,null,null,{download:false,part:1});
 assert.equal(opened,1,'retrieve one private annotated image');
 assert.equal(automatic,0,'the UI must prepare a visible link instead of depending on auto-download');
 assert.equal(result.filename,'omr-minh-chung-'+new Date().toISOString().slice(0,10)+'-phan-01.zip');
 assert(result.archive.size>1500);
 const bytes=new Uint8Array(await result.archive.arrayBuffer());
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 assert.equal(new DataView(bytes.buffer).getUint32(bytes.length-22,true),0x06054b50);
 console.log('PASS OMR 048: private image -> XLSX + ZIP -> durable mobile download link');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{
 global.fetch=oldFetch;delete global.window;
});