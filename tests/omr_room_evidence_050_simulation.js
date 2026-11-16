const assert=require('assert'),fs=require('fs');
const {execFileSync}=require('child_process');
const Naming=require('../omr/omr-evidence-naming.js');
const Export=require('../omr/omr-evidence-export.js');
const sample=[
 {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',scan_id:'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
  student_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',student_code:'100412',
  student_name:'H Hồng Niê',class_name:'10A4',exam_code:'105',revision:1,
  preview_score:7.35,created_at:'2026-11-16T05:00:00Z',
  record:{scan_id:'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',revision:1,
   evidence:{grade:{total:7.35,parts:{p1:3.5,p2:2.6,p3:1.25},details:[]},
   student_code:'100412',student_name:'H Hồng Niê',class_name:'10A4',edits:[],uncertain_details:[]}}},
 {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',scan_id:'cccccccc-dddd-4ccc-8ccc-cccccccccccc',
  student_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',student_code:'100434',
  student_name:'Đinh Cao Thùy Uyên',class_name:'10A4',exam_code:'103',revision:1,
  preview_score:1.95,created_at:'2026-11-16T05:12:00Z',
  record:{scan_id:'cccccccc-dddd-4ccc-8ccc-cccccccccccc',revision:1,
   evidence:{grade:{total:1.95,parts:{p1:1.5,p2:.45,p3:0},details:[]},
    edits:[{key:'P2.1b',before:'?',after:'S'}]}}}
];
const name=Naming.filename(sample[0]);
assert.strictEqual(name,'100412 - H Hồng Niê - 10A4 - MD105 - L01.jpg');
assert(!/[0-9a-f]{8}\.jpg$/.test(name),'File names must not show opaque scan IDs');
const seen=new Set();
assert.strictEqual(Naming.uniqueStem(sample[0],seen),Naming.stem(sample[0]));
assert.strictEqual(Naming.uniqueStem({...sample[0],scan_id:'zzzzzzzz-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},seen),
 Naming.stem(sample[0])+' - Ban02','duplicate scans get a human-readable collision index');
assert.strictEqual(Naming.pdfPath(sample[0]),'phieu-minh-chung/'+Naming.stem(sample[0])+'.pdf');
assert(!Naming.filename({...sample[0],student_name:'Cô/Trò:<Tên>|?'})
 .includes('/'),'Windows-invalid characters must not leak');
const history=[...sample,{...sample[0],id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 revision:2,created_at:'2026-11-16T05:22:00Z'}];
const latest=Naming.latestByStudent(history);
assert.strictEqual(Naming.findByStudent(latest,{id:sample[0].student_id}).revision,2);
assert.strictEqual(Naming.findByStudent(latest,{MaHS:'100434'}).student_name,'Đinh Cao Thùy Uyên');
const roster=[
 {MaHS:'100434',HoTen:'Đinh Cao Thùy Uyên',Lop:'10A4',id:sample[1].student_id,officialScore:null},
 {MaHS:'100411',HoTen:'Chưa nộp',Lop:'10A4',officialScore:null},
 {MaHS:'100412',HoTen:'H Hồng Niê',Lop:'10A4',id:sample[0].student_id,
  officialScore:7.35,P1:3.5,P2:2.6,P3:1.25,MaDe:'105'}
];
const links=sample.map(item=>({...item,filename:Naming.imagePath(item)}));
const rows=Export.roomRows(roster,links);
assert.deepStrictEqual(rows.map(x=>x[0]),['100411','100412','100434']);
assert.strictEqual(rows[0][9],'Chưa có điểm');
assert.strictEqual(rows[1][4],7.35);
assert.strictEqual(rows[1][10],Naming.imagePath(sample[0]));
assert.strictEqual(rows[2][4],'','preview is not an official score');
assert.strictEqual(rows[2][8],1.95);
assert.strictEqual(rows[2][9],'Có minh chứng, chưa lưu điểm');
const mismatch=Export.roomRows([{...roster[2],officialScore:7.0}],links);
assert.strictEqual(mismatch[0][9],'Cần đối chiếu');
const moduleJs=fs.readFileSync('omr/omr-teacher-module.js','utf8');
const pwa=fs.readFileSync('teacher/index.html','utf8');
const desktop=fs.readFileSync('giaovien.html','utf8');
const desktopJs=fs.readFileSync('giaovien.js','utf8');
const edge=fs.readFileSync('supabase/functions/omr-evidence/index.ts','utf8');
assert(moduleJs.indexOf('id="omrEvidenceCanvas"')<moduleJs.indexOf('id="omrTeacherCanvas"'));
assert(moduleJs.includes('id="omrTechnicalDetails"'));
assert(moduleJs.includes('id="omrReviewDetails"'));
assert(moduleJs.includes('id="omrEvidenceToolsDetails"'));
assert(moduleJs.includes("q('omrTechnicalDetails').open=false"));
assert(moduleJs.includes('Read-only annotated preview in every room'));
assert(moduleJs.includes("if(evidenceRoomCode()==='OMR_V7_TEST')"));
assert(edge.includes('if(mode==="test"&&room.ma_phong!=="OMR_V7_TEST")'));
assert(edge.includes('if(mode==="official"&&!OFFICIAL_ENABLED)'));
assert(desktop.includes('id="omrRoomEvidencePanel"')&&desktop.includes('<th>Phiếu OMR</th>'));
assert(desktopJs.includes('data-omr-sbd=')&&desktopJs.includes('getOmrDashboardRoster'));
assert(pwa.includes('omr-evidence-naming.js'));
assert(fs.readFileSync('teacher/sw.js','utf8').includes("'../omr/omr-evidence-naming.js'"));
assert(!fs.readFileSync('omr/omr-evidence-export.js','utf8').includes('evidence_write_rpc'));
(async()=>{
 const zip=Export.zip([{name:Naming.imagePath(sample[0]),data:new Uint8Array([82,73,70,70])},
   {name:Naming.jsonPath(sample[1]),data:'{"ok":true}'}],new Date(2026,10,16,14,25,0));
 const bytes=Buffer.from(await zip.arrayBuffer());
 const python=[
  'import io,sys,json,zipfile',
  'with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:',
  '  assert z.testzip() is None',
  '  print(json.dumps(z.namelist(),ensure_ascii=False))'
 ].join('\n');
 const names=JSON.parse(execFileSync('python3',['-c',python],{input:bytes,encoding:'utf8'}));
 assert(names.some(x=>x.includes('H Hồng Niê')));
 assert(names.some(x=>x.includes('Đinh Cao Thùy Uyên')));
 console.log('PASS OMR 050: named UTF-8 photos, stable newest scan, full-room roster, safe preview/official distinction');
})().catch(e=>{console.error(e);process.exitCode=1;});
