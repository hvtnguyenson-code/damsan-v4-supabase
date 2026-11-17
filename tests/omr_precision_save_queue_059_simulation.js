const fs=require('fs');
const assert=require('assert');
const Q=require('../omr/omr-evidence-queue-059.js');
const E=require('../omr/omr-evidence-client.js');
const items=new Map(),state=[];
let token='staff-token',owner='teacher-a',calls=0,fail=true;
const storage={
 list:async()=>[...items.values()],
 put:async x=>{items.set(x.key,structuredClone(x));},
 remove:async key=>{items.delete(key);}
};
const queue=Q.create({storage,getOwner:()=>owner,getToken:()=>token,
 send:async(t,p)=>{assert.equal(t,token);assert.equal(p.action,'save');assert.equal(p.submission_id,'submission-1');calls++;if(fail)throw Error('offline');return {status:'success'};},
 onChange:s=>{state.push(s.length);}
});
(async()=>{
 const payload={action:'save',submission_id:'submission-1',room_id:'room-precision',student_id:'student-1',mode:'official'};
 assert.deepEqual(await queue.add({roomId:'room-precision',submissionId:'submission-1',payload}),{key:'teacher-a:room-precision:submission-1',duplicate:false});
 assert.equal((await queue.list()).length,1,'image must be durable before camera resets');
 assert.equal((await queue.add({roomId:'room-precision',submissionId:'submission-1',payload})).duplicate,true);
 assert.equal(items.size,1,'duplicate receipt must not enqueue twice');
 await queue.drain();assert.equal(calls,1);assert.equal((await queue.list())[0].tries,1);assert.equal((await queue.list())[0].error,'offline');
 fail=false;await queue.drain();assert.equal(calls,2);assert.equal(items.size,0);
 await queue.add({roomId:'room-precision',submissionId:'submission-1',payload});
 owner='teacher-b';await queue.drain();assert.equal(calls,2,'other teacher must not drain private evidence');
 owner='teacher-a';await queue.drain();assert.equal(calls,3);assert.equal(items.size,0);
 const source=fs.readFileSync('omr/omr-teacher-module.js','utf8');
 const client=fs.readFileSync('omr/omr-evidence-client.js','utf8');
 assert(source.includes("if(isPrecisionRoom()){"),'fast queue applies to isolated test room');
 assert(source.includes("await queue.add("),'durable enqueue is awaited');
 assert(source.includes("void queue.drain()"),'network upload must be detached from UI');
 assert(source.indexOf("await W.submitConfirmed(")<source.indexOf("await queue.add("),'receipt first');
 assert(client.includes("submission_id:submissionId"),'receipts must bind to evidence');
 assert(fs.readFileSync('teacher/sw.js','utf8').includes("omr-evidence-queue-059.js"));
 assert(fs.readFileSync('teacher/index.html','utf8').includes("queue=059"));
 // A second learner's receipt may arrive while the first background upload
 // is running. It must not become stranded until the next online event.
 let releaseFirst,enteredFirst;
 const firstEntered=new Promise(resolve=>enteredFirst=resolve);
 const firstRelease=new Promise(resolve=>releaseFirst=resolve);
 const seen=[];
 const parallel=Q.create({storage,getOwner:()=>owner,getToken:()=>token,
  send:async(t,p)=>{
   seen.push(p.submission_id);
   if(p.submission_id==='concurrent-1'){enteredFirst();await firstRelease;}
   return {status:'success'};
  }});
 const p1={action:'save',submission_id:'concurrent-1',room_id:'room-precision',student_id:'a'};
 const p2={action:'save',submission_id:'concurrent-2',room_id:'room-precision',student_id:'b'};
 await parallel.add({submissionId:p1.submission_id,roomId:p1.room_id,payload:p1});
 const active=parallel.drain();
 await firstEntered;
 await parallel.add({submissionId:p2.submission_id,roomId:p2.room_id,payload:p2});
 await parallel.drain(); // signals rerun while active; never starts second worker
 releaseFirst();
 await active;
 assert.deepStrictEqual(seen,['concurrent-1','concurrent-2']);
 assert.equal(items.size,0,'second queued scan must drain automatically');
 assert(source.includes('eraser_diagnostic_v1'),'P3 eraser diagnostics should be recorded for validation');
 assert(source.includes('if(isPrecisionRoom()&&Array.isArray(ctx.candidate?.p3Evidence))'),
  'P3 eraser telemetry is limited to test room');
 assert(source.includes("if(!isPrecisionRoom()&&!confirm("),'normal V7 rooms must keep confirmation');
 console.log('PASS OMR 059: durable queue, asynchronous upload, retry, teacher isolation, official receipt, new PWA asset');
})().catch(err=>{console.error(err);process.exitCode=1});
