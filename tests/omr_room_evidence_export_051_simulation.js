const assert=require('assert');
const {execFileSync}=require('child_process');
const Export=require('../omr/omr-evidence-export.js');
class FakeRow {
 constructor(values){this.values=values;this.cells={};this.font={};}
 getCell(i){return this.cells[i]||=( {address:'N'+i,value:this.values?.[i-1]} );}
}
class FakeSheet{
 constructor(name){this.name=name;this.rows=[];this.autoFilter={};this.columns=[];}
 addRow(values){const row=new FakeRow(values);this.rows.push(row);return row;}
 getRow(i){return this.rows[i-1];}
 getColumn(){return {numFmt:''};}
}
const books=[];
class FakeWorkbook{
 constructor(){this.sheets=[];this.xlsx={writeBuffer:async()=>new Uint8Array(1500).fill(80)};books.push(this);}
 addWorksheet(name){const s=new FakeSheet(name);this.sheets.push(s);return s;}
}
global.window={ExcelJS:{Workbook:FakeWorkbook}};
const origFetch=global.fetch;
global.fetch=async()=>({ok:true,headers:{get:()=> 'image/webp'},
 arrayBuffer:async()=>new Uint8Array([82,73,70,70,1,2,3,4,87,69,66,80]).buffer});
const records=[
 {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  student_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  student_code:'100412',student_name:'H Hồng Niê',class_name:'10A4',
  exam_code:'105',scan_id:'12345678-1234-4234-8234-123456789abc',revision:1,
  preview_score:7.35,created_at:'2026-11-16T08:00:00Z'}
];
const roster=[
 {MaHS:'100412',HoTen:'H Hồng Niê',Lop:'10A4',id:records[0].student_id,MaDe:'105',
  officialScore:7.35,P1:3.5,P2:2.6,P3:1.25},
 {MaHS:'100413',HoTen:'Lê Ngọc Hà',Lop:'10A4',officialScore:null,MaDe:''}
];
const client={
 signed:async()=>({url:'https://example.supabase.co/storage/v1/object/sign/demo.jpg?token=dummy',
  record:{scan_id:records[0].scan_id,revision:1,evidence:{
   student_name:'WRONG_UNTRUSTED_NAME',student_code:'100412',
   grade:{total:7.35,parts:{p1:3.5,p2:2.6,p3:1.25},details:[]},
   edits:[],uncertain_details:[]}}}),
 downloadBlob:()=>{throw Error('automatic download must remain disabled')}
};
(async()=>{
 const out=await Export.exportBatch(records,client,null,null,{
  roster,roomLabel:'OMR_V7_TEST',maxItems:60,download:false,part:1});
 assert(out.filename.includes('OMR_V7_TEST')&&out.filename.endsWith('.zip'));
 const buffer=Buffer.from(await out.archive.arrayBuffer());
 const python=[
  'import sys,io,json,zipfile',
  'with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:',
  '  assert z.testzip() is None',
  '  names=z.namelist()',
  '  manifest=json.loads(z.read("manifest.json").decode("utf-8"))',
  '  print(json.dumps({"names":names,"items":manifest["items"]},ensure_ascii=False))'
 ].join('\n');
 const r=JSON.parse(execFileSync('python3',['-c',python],{input:buffer,encoding:'utf8'}));
 assert(r.names.some(x=>x.includes('100412 - H Hồng Niê - 10A4 - MD105')));
 assert(!r.names.some(x=>x.includes('WRONG_UNTRUSTED_NAME')));
 assert(r.names.some(x=>x.endsWith('.json')&&x.includes('H Hồng Niê')));
 assert(r.names.some(x=>x==='thong-ke-omr.xlsx'));
 assert.equal(r.items[0].student_name,'H Hồng Niê');
 assert(books[0].sheets.some(s=>s.name==='Điểm phòng thi'));
 const sheet=books[0].sheets.find(s=>s.name==='Điểm phòng thi');
 assert.equal(sheet.rows.length,3,'header and BOTH students, including one without score');
 assert.equal(sheet.rows[2].values[0],'100413');
 assert.equal(sheet.rows[2].values[4],'','unsubmitted score must stay blank');
 assert.equal(sheet.rows[1].values[10],r.items[0].filename);
 console.log('PASS OMR 051: one ZIP with authentic student names, roster, Excel and matching JSON/images');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>{
 global.fetch=origFetch;delete global.window;
});
