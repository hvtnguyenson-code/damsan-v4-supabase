(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.DamSanOmrRoomBinding=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function text(v){return String(v??'').trim();}
  function digits(v){return text(v).replace(/\D/g,'');}
  function canonicalNumericCode(v){
    const s=text(v);
    if(!/^\d+$/.test(s)) return null;
    return String(Number(s));
  }
  function sameExamCode(a,b){
    const aa=text(a),bb=text(b);
    if(aa===bb) return true;
    const na=canonicalNumericCode(aa),nb=canonicalNumericCode(bb);
    return na!==null&&nb!==null&&na===nb;
  }
  function normalizeExamRows(exams){
    const variants=[];
    for(const row of exams||[]){
      const code=text(row.ma_de??row.MaDe);
      let items=row.cau_so??row.CauSo??[];
      if(typeof items==='string'){try{items=JSON.parse(items);}catch(_){items=[];}}
      if(!Array.isArray(items)) items=[];
      variants.push({code,items});
    }
    return variants;
  }
  function structureOf(items){
    const count={p1:0,p2:0,p3:0,total:0};
    for(const q of items||[]){
      const p=text(q.phan??q.Phan);
      if(p==='1') count.p1++;
      else if(p==='2') count.p2++;
      else if(p==='3') count.p3++;
      count.total++;
    }
    return count;
  }
  function validate1846(variant){
    const s=structureOf(variant.items);
    const errors=[];
    if(s.p1!==18) errors.push(`P1=${s.p1}, cần 18`);
    if(s.p2!==4) errors.push(`P2=${s.p2}, cần 4`);
    if(s.p3!==6) errors.push(`P3=${s.p3}, cần 6`);
    return {ok:errors.length===0,structure:s,errors};
  }
  function studentKeys(student){
    const vals=[student.ma_hs,student.MaHS,student.sbd,student.SBD,student.id_hoc_sinh].filter(v=>v!==undefined&&v!==null);
    const out=new Set();
    for(const v of vals){
      const raw=text(v); if(raw) out.add(raw);
      const d=digits(v); if(d){out.add(d);out.add(d.replace(/^0+/,'')||'0');}
    }
    return [...out];
  }
  function buildStudentIndex(students){
    const idx=new Map();
    for(const st of students||[]) for(const k of studentKeys(st)){
      if(!idx.has(k)) idx.set(k,[]);
      idx.get(k).push(st);
    }
    return idx;
  }
  function resolveStudent(scanSbd,students){
    const idx=students instanceof Map?students:buildStudentIndex(students);
    const raw=text(scanSbd), d=digits(scanSbd), keys=[raw,d,d.replace(/^0+/,'')||'0'].filter(Boolean);
    const matches=[]; const seen=new Set();
    for(const k of keys) for(const st of idx.get(k)||[]){
      const id=text(st.id??st.ma_hs??st.MaHS);
      if(!seen.has(id)){seen.add(id);matches.push(st);}
    }
    if(matches.length===1) return {status:'matched',student:matches[0]};
    if(matches.length>1) return {status:'ambiguous',students:matches};
    return {status:'not_found',students:[]};
  }
  function resolveVariant(scanCode,variants){
    const matches=(variants||[]).filter(v=>sameExamCode(scanCode,v.code));
    if(matches.length===1) return {status:'matched',variant:matches[0]};
    if(matches.length>1) return {status:'ambiguous',variants:matches};
    return {status:'not_found',variants:[]};
  }
  function buildRoomModel(room,previewExams,students){
    const variants=normalizeExamRows(previewExams);
    const invalid=variants.map(v=>({code:v.code,...validate1846(v)})).filter(v=>!v.ok);
    return {
      room:{...room},
      variants,
      students:[...(students||[])],
      studentIndex:buildStudentIndex(students),
      codes:variants.map(v=>v.code),
      valid1846:invalid.length===0&&variants.length>0,
      invalidVariants:invalid
    };
  }
  function bindScan(scan,roomModel){
    if(!roomModel) return {ok:false,reason:'room_not_loaded'};
    if(!roomModel.valid1846) return {ok:false,reason:'room_exam_structure_invalid',invalidVariants:roomModel.invalidVariants};
    const vr=resolveVariant(scan.maDe,roomModel.variants);
    if(vr.status!=='matched') return {ok:false,reason:'exam_code_'+vr.status,detail:vr};
    const sr=resolveStudent(scan.sbd,roomModel.studentIndex);
    if(sr.status!=='matched') return {ok:false,reason:'student_'+sr.status,detail:sr};
    return {ok:true,room:roomModel.room,student:sr.student,variant:vr.variant,scan};
  }
  async function loadReadOnlyContext(options){
    const {room,staffRpc,loadStudents}=options||{};
    if(!room||!room.id) throw new Error('room_required');
    if(typeof staffRpc!=='function') throw new Error('staffRpc_required');
    if(typeof loadStudents!=='function') throw new Error('loadStudents_required');
    const preview=await staffRpc('rpc_staff_exam_preview',{p_phong_id:room.id});
    if(!preview||preview.status!=='success') throw new Error(preview?.message||'exam_preview_failed');
    const students=await loadStudents(room);
    return buildRoomModel(room,preview.exams||[],students||[]);
  }
  return {canonicalNumericCode,sameExamCode,normalizeExamRows,structureOf,validate1846,studentKeys,buildStudentIndex,resolveStudent,resolveVariant,buildRoomModel,bindScan,loadReadOnlyContext};
});
