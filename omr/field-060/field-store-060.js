(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DamSanOmrFieldStore060=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Device-local evidence only. NEVER call Supabase or export without a user tap.
const DB_NAME='damsan-omr060-field-evidence-v1',STORE='captures',MAX_RECORDS=60;
function open(indexedDB){
 return new Promise((resolve,reject)=>{
  if(!indexedDB?.open)return reject(Error('field_indexeddb_unavailable'));
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error('field_indexeddb_open_failed'));
  req.onblocked=()=>reject(Error('field_indexeddb_blocked'));
 });
}
function create(indexedDB){
 async function task(mode,worker){
  const db=await open(indexedDB);
  return new Promise((resolve,reject)=>{
   let tx,result,settled=false;
   const fail=error=>{
    if(settled)return;settled=true;db.close();reject(error||Error('field_storage_failed'));
   };
   try{
    tx=db.transaction(STORE,mode);
    const store=tx.objectStore(STORE);
    worker(store,(value)=>{result=value;},tx);
    tx.oncomplete=()=>{if(settled)return;settled=true;db.close();resolve(result);};
    tx.onerror=()=>fail(tx.error);
    tx.onabort=()=>fail(tx.error||Error('field_storage_transaction_aborted'));
   }catch(e){try{tx?.abort()}catch(_){}fail(e);}
  });
 }
 async function add(record){
  if(!record||typeof record.id!=='string'||record.id.length<8||
   !Number.isFinite(Date.parse(record.createdAt))||!record.report||
   typeof record.report!=='object'||!(record.image instanceof Blob)||
   record.image.type!=='image/jpeg'||record.image.size<100)
   throw Error('field_invalid_evidence');
  const n=await count();
  if(n>=MAX_RECORDS)throw Error('field_capacity_reached_export_first');
  return task('readwrite',(store,set)=>{
   const req=store.add(record);
   req.onsuccess=()=>set({id:record.id});
  });
 }
 function count(){return task('readonly',(store,set)=>{
  const req=store.count();req.onsuccess=()=>set(req.result);
 });}
 function get(id){return task('readonly',(store,set)=>{
  const req=store.get(String(id));req.onsuccess=()=>set(req.result||null);
 });}
 function list(){return task('readonly',(store,set)=>{
  const rows=[],req=store.openCursor();
  req.onsuccess=()=>{
   const cursor=req.result;
   if(!cursor){
    rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
    set(rows);return;
   }
   const row=cursor.value;
   rows.push({id:row.id,createdAt:row.createdAt,
    bytes:row.image?.size||0,report:row.report,review:row.review||null});
   cursor.continue();
  };
 });}
 function review(id,verdict,notes){
  if(!['unchecked','correct','needs_review'].includes(verdict)||
    typeof notes!=='string'||notes.length>1000)
   return Promise.reject(Error('field_review_invalid'));
  return task('readwrite',(store,set)=>{
   const request=store.get(String(id));
   request.onsuccess=()=>{
    if(!request.result){set(null);return;}
    const row=request.result;
    row.review={verdict,notes,updatedAt:new Date().toISOString()};
    const put=store.put(row);put.onsuccess=()=>set(row.review);
   };
  });
 }
 function remove(id){return task('readwrite',(store,set)=>{
  const req=store.delete(String(id));req.onsuccess=()=>set(true);
 });}
 function clear(){return task('readwrite',(store,set)=>{
  const req=store.clear();req.onsuccess=()=>set(true);
 });}
 return {add,count,get,list,review,remove,clear};
}
return {create,DB_NAME,STORE,MAX_RECORDS};
});