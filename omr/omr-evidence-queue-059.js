(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DamSanOmrEvidenceQueue=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const DB='damsan-omr-evidence-queue-v1',TABLE='jobs',CAP=40;
function openDb(){
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined')return reject(Error('evidence_queue_storage_unavailable'));
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(TABLE))req.result.createObjectStore(TABLE,{keyPath:'key'});};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error('evidence_queue_open_failed'));
 });
}
async function op(kind,value){
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(TABLE,kind==='getAll'?'readonly':'readwrite');
  const store=tx.objectStore(TABLE);
  const req=kind==='getAll'?store.getAll():kind==='put'?store.put(value):store.delete(value);
  let result;
  req.onsuccess=()=>{result=req.result;};
  req.onerror=()=>reject(req.error||Error('evidence_queue_operation_failed'));
  tx.oncomplete=()=>{db.close();resolve(result);};
  tx.onerror=()=>{db.close();reject(tx.error||Error('evidence_queue_transaction_failed'));};
  tx.onabort=()=>{db.close();reject(tx.error||Error('evidence_queue_transaction_aborted'));};
 });
}
function create({storage={list:()=>op('getAll'),put:item=>op('put',item),remove:key=>op('delete',key)},send,getToken,getOwner,onChange=()=>{}}){
 if(typeof send!=='function'||typeof getOwner!=='function'||typeof getToken!=='function')throw Error('evidence_queue_bad_config');
 let busy=false,rerun=false;
 const owner=()=>String(getOwner()||'');
 const list=async()=>((await storage.list())||[]).filter(x=>x&&x.owner===owner());
 async function publish(){try{onChange(await list());}catch(_){}}
 async function add({submissionId,roomId,payload}){
  if(!owner()||!submissionId||!roomId||!payload||payload.submission_id!==submissionId||payload.room_id!==roomId)throw Error('evidence_queue_invalid_receipt');
  const key=owner()+':'+roomId+':'+submissionId;
  const all=await storage.list();
  if(all.some(x=>x.key===key))return {key,duplicate:true};
  if(all.length>=CAP)throw Error('evidence_queue_capacity_reached');
  const record={key,owner:owner(),roomId,submissionId,payload,queuedAt:Date.now(),tries:0,error:null};
  await storage.put(record); // Do not release the scan until data is durably queued.
  await publish();
  return {key,duplicate:false};
 }
 async function drain(){
  if(busy){rerun=true;return;}
  if(!owner()||!getToken())return;
  busy=true;
  const attempted=new Set();
  try{
   do{
    rerun=false;
    // Every item is attempted at most once per drain, even if the client
    // queues a new student while a prior upload is still running.
    const jobs=(await list()).filter(job=>!attempted.has(job.key));
    for(const job of jobs){
     attempted.add(job.key);
     if(owner()!==job.owner||!getToken())break;
     try{
      const result=await send(getToken(),job.payload);
      if(result?.status!=='success')throw Error(result?.code||'evidence_queue_save_failed');
      await storage.remove(job.key);
     }catch(err){
      await storage.put({...job,tries:(job.tries||0)+1,error:String(err?.message||err).slice(0,140)});
     }
     await publish();
    }
   }while(rerun);
  }finally{busy=false;}
 }
 return {add,drain,list,publish};
}
return {create,CAP};
});