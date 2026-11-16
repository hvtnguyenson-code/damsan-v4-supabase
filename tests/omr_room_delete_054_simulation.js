const assert=require('assert'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('giaovien.js','utf8');
const edge=fs.readFileSync('supabase/functions/omr-evidence/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261116195000_omr_room_storage_cleanup_054.sql','utf8');
const from=source.indexOf('async function staffRpc('),to=source.indexOf('let danhSachDeThi',from);
assert(from>=0&&to>from,'staffRpc source not found');
const snippet=source.slice(from,to);
function harness(cleanup,deleted){
 const events=[];
 const sandbox={console,
  ensureControlSession:()=> 'synthetic-long-lived-staff-token',
  gvLogoutInProgress:false,clearGvSessionAndReturnToLogin(){events.push('logout')},
  sb:{
   functions:{invoke:async(name,{body})=>{
    events.push('storage');
    assert.equal(name,'omr-evidence');
    assert.equal(body.action,'cleanup_room');
    assert.equal(body.teacher_code,'GV001');
    assert.equal(body.school_id,'school-id');
    assert.equal(body.room_id,'room-id');
    return cleanup;
   }},
   rpc:async(name,args)=>{
    events.push('db');
    assert.equal(args.p_staff_token,'synthetic-long-lived-staff-token');
    return deleted||{data:{status:'success'},error:null};
   }
  }
 };
 vm.createContext(sandbox);
 vm.runInContext(snippet,sandbox);
 return {call:sandbox.staffRpc,events};
}
(async()=>{
 const args={p_ma_gv:'GV001',p_truong_id:'school-id',p_phong_id:'room-id'};
 const ok=harness({data:{status:'success',deleted_files:4,estimated_bytes:8192},error:null});
 const result=await ok.call('rpc_xoa_phong_thi',args);
 assert.equal(result.status,'success');
 assert.equal(result.storage_cleanup.deleted_files,4);
 assert.deepStrictEqual(ok.events,['storage','db'],'Storage must be deleted before room SQL');
 const failure=harness({data:{status:'error',code:'cleanup_storage_failed'},error:null});
 await assert.rejects(failure.call('rpc_xoa_phong_thi',args),/Chưa dọn sạch/);
 assert.deepStrictEqual(failure.events,['storage'],'never delete the room on Storage error');
 const unsupported=harness({data:null,error:new Error('unavailable')});
 await assert.rejects(unsupported.call('rpc_xoa_phong_thi',args),/Chưa dọn sạch/);
 assert.deepStrictEqual(unsupported.events,['storage']);
 const ordinary=harness({data:null,error:new Error('would fail if invoked')});
 const generic=await ordinary.call('rpc_grade_pending_room',args);
 assert.equal(generic.status,'success');
 assert.deepStrictEqual(ordinary.events,['db'],'normal RPCs must not purge Storage');
 assert(migration.includes("from storage.objects"),'Postgres inventory must include unregistered objects');
 assert(!/delete\\s+from\\s+storage\\.objects/i.test(migration),'Never remove storage rows with SQL');
 assert(migration.includes('omr_storage_not_empty'),'block DB deletion when Storage still contains files');
 const guard=migration.indexOf("if exists(\n  select 1 from storage.objects");
 const artifactDelete=migration.indexOf("delete from public.omr_artifacts where room_id=p_phong_id");
 const submissionDelete=migration.indexOf("delete from public.exam_submissions where phong_id=p_phong_id");
 assert(guard>0&&guard<artifactDelete&&artifactDelete<submissionDelete,
  'SQL must verify Storage empty and delete artifact FKs before submissions');
 assert(migration.includes("to service_role"),'only service role can enumerate private paths');
 assert(!migration.includes("to anon, authenticated"),'do not grant inventory to browsers');
 assert(edge.includes('case "cleanup_room":return await cleanupRoom(req,body,actor)'));
 assert(edge.includes('db.storage.from(BUCKET).remove('),'use the Storage API');
 assert(edge.includes('remaining.paths.length!==0'),'verify cleanup before continuing');
 assert(edge.includes('allowed.some(prefix=>path.startsWith(prefix))'),'enforce strict school and room path scope');
 console.log('PASS OMR 054: correct single-room purge order, fail closed and safe SQL guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
