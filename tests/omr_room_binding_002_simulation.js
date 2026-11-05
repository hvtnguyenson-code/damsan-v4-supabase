const assert=require('assert');
const B=require('../omr/omr-room-binding.js');
console.log('=== OMR ROOM BINDING 002 ===');
assert.strictEqual(B.sameExamCode('0444','444'),true);
assert.strictEqual(B.sameExamCode('0000','0'),true);
assert.strictEqual(B.sameExamCode('A444','444'),false);

function items(){
  return [
    ...Array.from({length:18},(_,i)=>({phan:'1',noi_dung:'P1-'+i,dap_an_dung:'A'})),
    ...Array.from({length:4},(_,i)=>({phan:'2',noi_dung:'P2-'+i,dap_an_dung:'Đ-S-Đ-S'})),
    ...Array.from({length:6},(_,i)=>({phan:'3',noi_dung:'P3-'+i,dap_an_dung:"'12,5"}))
  ];
}
const room={id:'room-test',MaPhong:'TEST_OMR',DoiTuong:'12A3',assessment_type:'TOT_NGHIEP'};
const exams=['444','445','446','447'].map(ma_de=>({ma_de,cau_so:items()}));
const students=[
  {id:'s1',ma_hs:'1234',ho_ten:'HS 1',lop:'12A3'},
  {id:'s2',ma_hs:'5678',ho_ten:'HS 2',lop:'12A3'}
];
const model=B.buildRoomModel(room,exams,students);
assert.strictEqual(model.valid1846,true);
assert.deepStrictEqual(model.codes,['444','445','446','447']);
let r=B.bindScan({sbd:'00001234',maDe:'0444'},model);
assert.strictEqual(r.ok,true);
assert.strictEqual(r.student.id,'s1');
assert.strictEqual(r.variant.code,'444');
assert.strictEqual(B.bindScan({sbd:'00009999',maDe:'0444'},model).reason,'student_not_found');
assert.strictEqual(B.bindScan({sbd:'00001234',maDe:'0999'},model).reason,'exam_code_not_found');

(async()=>{
  let called='';
  const loaded=await B.loadReadOnlyContext({
    room,
    staffRpc:async(name,args)=>{called=name;assert.deepStrictEqual(args,{p_phong_id:'room-test'});return {status:'success',exams};},
    loadStudents:async r=>{assert.strictEqual(r.id,'room-test');return students;}
  });
  assert.strictEqual(called,'rpc_staff_exam_preview');
  assert.strictEqual(loaded.valid1846,true);
  console.log('PASS omr_room_binding_002');
})().catch(e=>{console.error(e);process.exit(1);});
