const assert=require('assert');
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('giaovien.js','utf8');
const html=fs.readFileSync('giaovien.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20261116223000_omr_room_reset_storage_cleanup_055.sql','utf8');
const start=source.indexOf('async function staffRpc('),end=source.indexOf('let danhSachDeThi',start);
assert(start>=0&&end>start);
const fn=source.slice(start,end);
async function checkRPC(name,cleanup,response){
 const events=[];
 const ctx={
  ensureControlSession:()=> 'synthetic-staff-token',
  gvLogoutInProgress:false,
  clearGvSessionAndReturnToLogin:()=>events.push('logout'),
  sb:{
   functions:{invoke:async(slug,opts)=>{
    events.push('storage');
    assert.equal(slug,'omr-evidence');
    assert.equal(opts.body.action,'cleanup_room');
    assert.equal(opts.body.staff_token,'synthetic-staff-token');
    assert.equal(opts.body.teacher_code,'GV001');
    assert.equal(opts.body.room_id,'room-test-1');
    return cleanup;
   }},
   rpc:async(rpc,args)=>{
    events.push('database');
    assert.equal(rpc,name);
    assert.equal(args.p_staff_token,'synthetic-staff-token');
    return response??{data:{status:'success',artifacts_deleted:2},error:null};
   }
  }
 };
 vm.createContext(ctx);
 vm.runInContext(fn,ctx);
 try{return {result:await ctx.staffRpc(name,{
  p_ma_gv:'GV001',p_truong_id:'school-test-1',p_phong_id:'room-test-1'
 }),events}}
 catch(error){return {error,events}}
}
(async()=>{
 const okCleanup={data:{status:'success',deleted_files:4,estimated_bytes:8192},error:null};
 const fresh=await checkRPC('rpc_reset_room_results',okCleanup);
 assert.deepStrictEqual(fresh.events,['storage','database']);
 assert.equal(fresh.result.storage_cleanup.deleted_files,4);
 assert.equal(fresh.result.artifacts_deleted,2);
 const deletedRoom=await checkRPC('rpc_xoa_phong_thi',okCleanup);
 assert.deepStrictEqual(deletedRoom.events,['storage','database']);
 const blocked=await checkRPC('rpc_reset_room_results',{data:{status:'error',code:'cleanup_storage_failed'},error:null});
 assert.deepStrictEqual(blocked.events,['storage']);
 assert.match(String(blocked.error),/Chưa dọn sạch ảnh/);
 const down=await checkRPC('rpc_reset_room_results',{data:null,error:Error('no network')});
 assert.deepStrictEqual(down.events,['storage']);
 assert.match(String(down.error),/Chưa dọn sạch ảnh/);
 const other=await checkRPC('rpc_grade_pending_room', {data:null,error:Error('storage must not run')});
 assert.deepStrictEqual(other.events,['database']);
 const dbFailed=await checkRPC('rpc_reset_room_results',okCleanup,
  {data:{status:'error',code:'omr_storage_not_empty'},error:null});
 assert.deepStrictEqual(dbFailed.events,['storage','database']);
 assert.equal(dbFailed.result.status,'error');
 assert(!dbFailed.result.storage_cleanup,'never claim success on DB failure');
 assert(source.includes('XÓA TOÀN BỘ DỮ LIỆU CHẤM PHÒNG'));
 assert(source.includes('Phòng và mã đề được giữ nguyên'));
 assert(source.includes('data.artifacts_deleted'));
 assert(source.includes('data.storage_cleanup?.deleted_files'));
 assert(html.includes('room-reset=055'));
 const lock=sql.indexOf('for update;'),guard=sql.indexOf('if exists (\n  select 1 from storage.objects');
 const art=sql.indexOf('delete from public.omr_artifacts');
 const score=sql.indexOf('delete from public.ket_qua');
 const receipt=sql.indexOf('delete from public.exam_submissions');
 const attempt=sql.indexOf('delete from public.student_room_attempt_state');
 const update=sql.indexOf('update public.phong_thi');
 assert(lock>=0&&lock<guard&&guard<art&&art<score&&score<receipt&&receipt<attempt&&attempt<update);
 assert(sql.includes("set trang_thai='CHO_THI',thoi_gian_mo=null"));
 assert(!sql.includes('delete from public.de_thi')&&!sql.includes('delete from public.phong_thi'));
 assert(!/delete\\s+from\\s+storage\\.objects/i.test(sql));
 console.log('PASS OMR 055: safe single-click score reset, Storage before DB, no room/exam delete');
})().catch(e=>{console.error(e);process.exitCode=1;});
