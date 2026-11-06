(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.DamSanOmrScoring=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function text(v){return String(v??'').trim();}
  function partOf(q){return text(q.phan??q.Phan??'1');}
  function correctOf(q){return text(q.dap_an_dung??q.DapAnDung);}
  function normalizeShort(v){return text(v).replace(/'/g,'').replace(/,/g,'.').replace(/\s/g,'').toLowerCase();}
  function normalizeDs(v){return text(v).toUpperCase().replace(/Đ/g,'D');}
  function scoreP2(answer,correct){
    const a=text(answer).split('-'),c=text(correct).split('-'); let matches=0;
    for(let i=0;i<4;i++) if(normalizeDs(a[i])&&normalizeDs(a[i])===normalizeDs(c[i])) matches++;
    return ({1:0.1,2:0.25,3:0.5,4:1})[matches]||0;
  }
  function scanAnswers(scan){
    const p1=text(scan?.p1).split('');
    const p2=Array.isArray(scan?.p2)?scan.p2.map(text):[];
    const p3=Array.isArray(scan?.p3)?scan.p3.map(text):[];
    return {p1,p2,p3};
  }
  function enforceInvalidMarks(scan){
    const keys=Array.isArray(scan?.invalidMarks)?scan.invalidMarks:[];
    if(!keys.length)return scan;
    const p1=text(scan?.p1).split(''),p2=Array.isArray(scan?.p2)?scan.p2.map(text):[];
    for(const key of keys){
      const a=/^P1\.(\d{1,2})$/.exec(key);
      if(a){const i=Number(a[1])-1;if(i>=0&&i<p1.length)p1[i]='?';continue;}
      const b=/^P2\.(\d+)([abcd])$/.exec(key);
      if(b){
        const i=Number(b[1])-1,j='abcd'.indexOf(b[2]);
        if(i>=0&&i<p2.length){
          const parts=p2[i].split('-');
          if(j<parts.length){parts[j]='?';p2[i]=parts.join('-');}
        }
      }
    }
    return {...scan,p1:p1.join(''),p2};
  }

  function buildRawAnswers(scan,variant){
    const pools=scanAnswers(enforceInvalidMarks(scan)),idx={1:0,2:0,3:0};
    return (variant?.items||[]).map(q=>{
      const p=partOf(q);
      let chosen='';
      if(p==='1') chosen=pools.p1[idx[1]++]||'';
      else if(p==='2') chosen=pools.p2[idx[2]++]||'';
      else if(p==='3') chosen=pools.p3[idx[3]++]||'';
      return {chon:chosen};
    });
  }
  function validateScanCoverage(scan,variant,options={}){
    const s=scanAnswers(scan);
    const counts=(variant?.items||[]).reduce((a,q)=>{const p=partOf(q);if(a[p]!==undefined)a[p]++;return a;},{1:0,2:0,3:0});
    const errors=[];
    if(s.p1.length!==counts[1]) errors.push(`P1 nhận ${s.p1.length}/${counts[1]}`);
    if(s.p2.length!==counts[2]) errors.push(`P2 nhận ${s.p2.length}/${counts[2]}`);
    if(s.p3.length!==counts[3]) errors.push(`P3 nhận ${s.p3.length}/${counts[3]}`);
    if((scan?.uncertain||[]).length && options.allowUncertain !== true) errors.push('Có ô chưa chắc chắn');
    return {ok:errors.length===0,errors,counts};
  }
  function previewGrade(rawAnswers,variant,assessmentType='LEGACY',scoringConfig={}){
    const items=variant?.items||[], details=[];
    let raw=0,p1Count=0,p2Count=0,p3Count=0,p1Earned=0,p2Earned=0,p3Earned=0;
    items.forEach((q,i)=>{
      const part=partOf(q),answer=text(rawAnswers?.[i]?.chon),correct=correctOf(q); let points=0;
      if(part==='1'){
        p1Count++; if(answer&&answer.toUpperCase()===correct.toUpperCase()) points=0.25; p1Earned+=points;
      }else if(part==='2'){
        p2Count++; points=scoreP2(answer,correct); p2Earned+=points;
      }else if(part==='3'){
        p3Count++; if(normalizeShort(answer)&&normalizeShort(answer)===normalizeShort(correct)) points=0.25; p3Earned+=points;
      }else if(assessmentType==='LEGACY'){
        if(normalizeShort(answer)&&normalizeShort(answer)===normalizeShort(correct)) points=0.25;
      }else throw new Error('Unknown question part '+part);
      raw+=points; details.push({q:i+1,phan:part,chon:answer,dung:correct,diem:points});
    });
    const total=items.length,p1Max=p1Count*0.25,p2Max=p2Count,p3Max=p3Count*0.25;
    let score=0;
    if(assessmentType==='LEGACY'||assessmentType==='TOT_NGHIEP'){
      if(assessmentType==='TOT_NGHIEP'&&p1Count+p2Count+p3Count!==total) throw new Error('TOT_NGHIEP exam contains invalid question parts');
      score=raw;
    }else if(assessmentType==='MCQ_ONLY'){
      if(p1Count!==total||p1Count<1) throw new Error('MCQ_ONLY invalid structure'); score=Math.round((p1Earned/p1Max)*100)/10;
    }else if(assessmentType==='TRUE_FALSE_ONLY'){
      if(p2Count!==total||p2Count<1) throw new Error('TRUE_FALSE_ONLY invalid structure'); score=Math.round((p2Earned/p2Max)*100)/10;
    }else if(assessmentType==='SHORT_ONLY'){
      if(p3Count!==total||p3Count<1) throw new Error('SHORT_ONLY invalid structure'); score=Math.round((p3Earned/p3Max)*100)/10;
    }else if(assessmentType==='CUSTOM'){
      const w1=Number(scoringConfig.p1_weight),w2=Number(scoringConfig.p2_weight),w3=Number(scoringConfig.p3_weight);
      if(![w1,w2,w3].every(Number.isFinite)||w1<0||w2<0||w3<0||w1>10||w2>10||w3>10||Math.abs(w1+w2+w3-10)>1e-9) throw new Error('CUSTOM weights invalid');
      if((!p1Count&&w1)||(!p2Count&&w2)||(!p3Count&&w3)) throw new Error('CUSTOM weight without part');
      score=(p1Max?p1Earned/p1Max*w1:0)+(p2Max?p2Earned/p2Max*w2:0)+(p3Max?p3Earned/p3Max*w3:0);
      score=Math.round(score*100)/100;
    }else throw new Error('Unsupported assessment_type: '+assessmentType);
    return {score,rawScore:raw,parts:{p1:p1Earned,p2:p2Earned,p3:p3Earned},details};
  }
  function previewScan(scan,binding,options={}){
    if(!binding?.ok) throw new Error('binding_required');
    const coverage=validateScanCoverage(scan,binding.variant,options);
    if(!coverage.ok) return {ok:false,reason:'scan_incomplete',coverage};
    const rawAnswers=buildRawAnswers(scan,binding.variant);
    const room=binding.room||{};
    const grade=previewGrade(rawAnswers,binding.variant,room.assessment_type||room.AssessmentType||'LEGACY',room.scoring_config||room.ScoringConfig||{});
    return {ok:true,room:binding.room,student:binding.student,variant:binding.variant,scan,rawAnswers,grade,reviewedUncertain:false};
  }
  return {normalizeShort,normalizeDs,scoreP2,scanAnswers,enforceInvalidMarks,buildRawAnswers,validateScanCoverage,previewGrade,previewScan};
});
