const assert = require('assert');
const {execFileSync} = require('child_process');
const Export = require('../omr/omr-evidence-export.js');

function readDos(view,timeOffset,dateOffset) {
 const t=view.getUint16(timeOffset,true),d=view.getUint16(dateOffset,true);
 return {
  year:1980+(d>>9),month:(d>>5)&15,day:d&31,
  hour:t>>11,minute:(t>>5)&63,second:(t&31)*2,
  rawDate:d,rawTime:t
 };
}
async function check() {
 const moment=new Date(2026,10,16,14,24,22);
 const archive=Export.zip([
  {name:'thong-ke-omr.xlsx',data:new Uint8Array([80,75,3,4,42,32])},
  {name:'sheets/100412.webp',data:new Uint8Array([82,73,70,70])},
  {name:'manifest.json',data:JSON.stringify({created_at:moment.toISOString()})}
 ],moment);
 const bytes=new Uint8Array(await archive.arrayBuffer());
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const central=[];
 for(let i=0;i<bytes.length-4;i++){
  if(view.getUint32(i,true)===0x02014b50) {
   const length=view.getUint16(i+28,true),extra=view.getUint16(i+30,true),comment=view.getUint16(i+32,true);
   const localAt=view.getUint32(i+42,true);
   const middle=readDos(view,i+12,i+14);
   const local=readDos(view,localAt+10,localAt+12);
   assert.deepStrictEqual(local,middle,'local header must match central directory');
   assert.deepStrictEqual({year:middle.year,month:middle.month,day:middle.day,
    hour:middle.hour,minute:middle.minute,second:middle.second},
    {year:2026,month:11,day:16,hour:14,minute:24,second:22});
   assert(middle.rawDate>0,'ZIP dates must never be zero');
   central.push(middle);
   i+=45+length+extra+comment;
  }
 }
 assert.strictEqual(central.length,3,'all three ZIP entries must have valid time');
 const python=[
  'import io, json, sys, zipfile',
  'blob = sys.stdin.buffer.read()',
  'with zipfile.ZipFile(io.BytesIO(blob)) as z:',
  '    assert z.testzip() is None',
  '    rows = [{"name": info.filename, "date_time": list(info.date_time)} for info in z.infolist()]',
  '    print(json.dumps(rows))'
 ].join('\n');
 const stdout=execFileSync('python3',['-c',python],{input:Buffer.from(bytes),encoding:'utf8'});
 const rows=JSON.parse(stdout);
 assert.strictEqual(rows.length,3);
 for(const row of rows)assert.deepStrictEqual(row.date_time,[2026,11,16,14,24,22]);
 assert.throws(()=>Export.zip([{name:'x',data:'1'}],new Date(NaN)),/zip_date_invalid/);
 const earlier=Export.zip([{name:'old',data:'1'}],new Date(1979,10,30));
 const oldView=new DataView(await earlier.arrayBuffer());
 assert.strictEqual(readDos(oldView,10,12).year,1980,'clamp DOS timestamp underflow');
 const later=Export.zip([{name:'far-future',data:'1'}],new Date(2108,1,2));
 const laterView=new DataView(await later.arrayBuffer());
 assert.strictEqual(readDos(laterView,10,12).year,2107,'clamp DOS timestamp overflow');
 console.log('PASS OMR 049: ZIP local/central valid creation date 16/11/2026 14:24:22 + Python zipfile');
}
check().catch(e=>{console.error(e);process.exitCode=1;});
