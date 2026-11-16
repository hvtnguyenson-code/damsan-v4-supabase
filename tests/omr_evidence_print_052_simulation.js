const assert=require('assert');
const Print=require('../omr/omr-evidence-print.js');
const Naming=require('../omr/omr-evidence-naming.js');
const Export=require('../omr/omr-evidence-export.js');
const jpeg=new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAcFBQYFBAcGBgYIBwcICxILCwoKCxYPEA0SGhYbGhkWGRgcICgiHB4mHhgZIzAkJiorLS4tGyIyNTEsNSgsLSz/2wBDAQcICAsJCxULCxUsHRkdLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCz/wAARCAAGAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6RooooA//2Q==','base64'));
assert(Print.isJpeg(jpeg));
const pdf=Print.pdfFromJpeg(jpeg,4,6);
const bytes=Buffer.from(pdf),text=bytes.toString('latin1');
assert(text.startsWith('%PDF-1.4'));
assert(text.includes('/Type /Page '));
assert(text.includes('/MediaBox [0 0 595.28 841.89]'));
assert(text.includes('/Filter /DCTDecode'));
assert(text.includes('/Width 4 /Height 6'));
assert(text.endsWith('%%EOF\n'));
assert(bytes.includes(Buffer.from(jpeg)));
const offset=Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
assert(Number.isInteger(offset)&&bytes.subarray(offset,offset+5).toString()==='xref\n');
const entries=text.slice(offset).match(/\d{10} 00000 n /g)||[];
assert.strictEqual(entries.length,5);
for(let i=0;i<entries.length;i++){
 const objectAt=Number(entries[i].slice(0,10));
 assert(bytes.subarray(objectAt,objectAt+7).toString().startsWith(String(i+1)+' 0 obj'));
}
assert.throws(()=>Print.pdfFromJpeg(new Uint8Array([0,1,2]),4,6),/jpeg_invalid/);
assert.throws(()=>Print.pdfFromJpeg(jpeg,0,6),/dimensions_invalid/);
const sample={student_code:'100412',student_name:'H Hồng Niê',class_name:'10A4',exam_code:'105',revision:3,
 scan_id:'c38f32d1-526e-4bbf-b3f9-922f4cf564ed'};
const base=Naming.stem(sample);
assert.strictEqual(base,'100412 - H Hồng Niê - 10A4 - MD105 - L03');
assert(!base.includes('c38f32d1'));
const used=new Set();
const first=Naming.uniqueStem(sample,used),second=Naming.uniqueStem({...sample,scan_id:'other'},used);
assert.strictEqual(first,base);
assert.strictEqual(second,base+' - Ban02');
assert.strictEqual(Naming.pathFromStem(first,'pdf'),'phieu-minh-chung/'+base+'.pdf');
assert.strictEqual(Naming.pathFromStem(first,'jpg'),'anh-jpg/'+base+'.jpg');
assert.strictEqual(Naming.pathFromStem(first,'json'),'doi-chieu-json/'+base+'.json');
(async()=>{
 const zip=Export.zip([
  {name:'thong-ke-omr.xlsx',data:new Uint8Array(1000)},
  {name:Naming.pathFromStem(base,'pdf'),data:pdf}
 ]);
 assert(zip.size>pdf.length+1000);
 const data=Buffer.from(await zip.arrayBuffer());
 const {execFileSync}=require('child_process');
 const check=[
  'import io,zipfile,sys,json',
  'z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))',
  'assert z.testzip() is None',
  'names=z.namelist()',
  'assert len(names)==2',
  'assert any(n.endswith(".pdf") for n in names)',
  'assert any(n.endswith(".xlsx") for n in names)',
  'assert not any(n.endswith(".jpg") or n.endswith(".json") or "c38f32d1" in n for n in names)',
  'print(json.dumps(names,ensure_ascii=False))'
 ].join('\n');
 const names=JSON.parse(execFileSync('python3',['-c',check],{input:data,encoding:'utf8'}));
 assert(names.some(n=>n.includes('H Hồng Niê')));
 console.log('PASS OMR 052: printable A4 PDF plus XLSX only, readable Unicode filename');
})().catch(e=>{console.error(e);process.exitCode=1;});