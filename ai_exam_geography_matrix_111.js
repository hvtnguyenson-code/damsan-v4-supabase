// 111 — Geography assessment matrix: lesson → normalized YCCĐ/indicator → cognitive allocation.
// STRICT_TNTHPT remains server-owned 18-4-6; FLEX_GEOGRAPHY sends a teacher-locked matrix.
(function () {
  'use strict';

  const SCHEMA='DAMSAN_GEO_ASSESSMENT_MATRIX_V1';
  const baseSpec=window.aieSpec;
  const state={rows:[],mode:'AUTO',lastKey:'',dirty:false};
  window.aieGeoMatrix111=state;

  const COMP_LABEL={
    GEO_NK_SPATIAL:'Nhận thức không gian',
    GEO_NK_CAUSAL:'Giải thích địa lí',
    GEO_TH_TOOL:'Sử dụng công cụ địa lí',
    GEO_TH_INFO:'Khai thác thông tin địa lí',
    GEO_VD_REALITY:'Liên hệ thực tiễn',
    GEO_VD_PROBLEM:'Vận dụng giải quyết vấn đề'
  };

  function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function grade(){return Number(document.getElementById('gradeSelect')?.value||0);}
  function profile(){return document.getElementById('profile')?.value||'';}
  function isGeography(){
    const text=(document.getElementById('subjectSelect')?.selectedOptions?.[0]?.textContent||'').toLowerCase();
    return text.includes('địa')||text.includes('dia li')||text.includes('geography');
  }
  function strict(){return profile()==='TOT_NGHIEP';}

  function selectedLessons(){
    const g=grade();
    const out=[];
    const docs=(window.aieKnowledgeCatalogDocuments||[]).filter(d=>Number(d.grade||0)===g&&(!d.source_role||d.source_role==='KNOWLEDGE_SOURCE'));
    const byId=new Map(docs.map(d=>[d.id,d]));
    for(const group of document.querySelectorAll('[data-knowledge-scope-doc]')){
      const doc=byId.get(group.dataset.knowledgeScopeDoc||'');
      if(!doc)continue;
      const lessons=Array.isArray(doc.lesson_scopes)?doc.lesson_scopes:[];
      const all=group.querySelector('.knowledge-doc-all');
      if(all?.checked){
        for(const lesson of lessons) out.push({...lesson,document_id:doc.id});
        continue;
      }
      const selected=new Set(Array.from(group.querySelectorAll('.knowledge-lesson-check:checked')).map(el=>el.dataset.scopeKey||''));
      for(const lesson of lessons) if(selected.has(lesson.scope_key)) out.push({...lesson,document_id:doc.id});
    }
    return out;
  }

  function curriculumCatalog(){
    return window.aieGeoCurriculumCatalog114||null;
  }

  function candidatesForLesson(g,lesson){
    const catalog=curriculumCatalog();
    if(!catalog||typeof catalog.candidatesForLesson!=='function') return [];
    return catalog.candidatesForLesson(g,lesson);
  }

  function rowKey(scopeKey,indicatorId){return scopeKey+'::'+indicatorId;}
  function buildRows(){
    const g=grade();
    const previous=new Map(state.rows.map(r=>[rowKey(r.scope_key,r.indicator_id),r]));
    const next=[];
    for(const lesson of selectedLessons()){
      for(const candidate of candidatesForLesson(g,lesson)){
        const key=rowKey(lesson.scope_key,candidate.indicator_id);
        const old=previous.get(key);
        next.push({
          matrix_row_id:key,
          grade:g,
          scope_key:lesson.scope_key,
          lesson_code:lesson.lesson_code||'',
          lesson_title:lesson.lesson_title||lesson.scope_key,
          curriculum_topic:candidate.curriculum_topic||'Nội dung địa lí',
          ...candidate,
          allocations:old?.allocations||{p1:{KNOW:0,UNDERSTAND:0,APPLY:0},p2:0,p3:0}
        });
      }
    }
    state.rows=next;
  }

  function distribute(total,eligible,assign){
    if(total<=0||!eligible.length)return;
    for(let i=0;i<total;i++)assign(eligible[i%eligible.length],i);
  }

  function autoAllocate(){
    buildRows();
    for(const r of state.rows) r.allocations={p1:{KNOW:0,UNDERSTAND:0,APPLY:0},p2:0,p3:0};
    const p1=Math.max(0,Number(document.getElementById('p1Count')?.value||0));
    const p2=Math.max(0,Number(document.getElementById('p2Count')?.value||0));
    const p3=Math.max(0,Number(document.getElementById('p3Count')?.value||0));
    const know=Math.min(p1,Math.round(p1*5/18));
    const understand=Math.min(p1-know,Math.round(p1*8/18));
    const apply=p1-know-understand;
    for(const [level,total] of [['KNOW',know],['UNDERSTAND',understand],['APPLY',apply]]){
      const eligible=state.rows.filter(r=>r.allowed_cognitive_levels.includes(level));
      distribute(total,eligible,(r)=>r.allocations.p1[level]++);
    }
    distribute(p2,state.rows.filter(r=>r.allowed_cognitive_levels.includes('UNDERSTAND')||r.allowed_cognitive_levels.includes('APPLY')),(r)=>r.allocations.p2++);
    const p3Rows=state.rows.filter(r=>r.competency_code==='GEO_TH_TOOL'||r.allowed_cognitive_levels.includes('APPLY'));
    distribute(p3,p3Rows.length?p3Rows:state.rows,(r)=>r.allocations.p3++);
    state.dirty=false;
    render();
  }

  function totals(){
    return state.rows.reduce((a,r)=>{
      a.know+=r.allocations.p1.KNOW;a.understand+=r.allocations.p1.UNDERSTAND;a.apply+=r.allocations.p1.APPLY;
      a.p2+=r.allocations.p2;a.p3+=r.allocations.p3;return a;
    },{know:0,understand:0,apply:0,p2:0,p3:0});
  }

  function matrixObject(){
    const t=totals();
    const requested={
      p1:Number(document.getElementById('p1Count')?.value||0),
      p2:Number(document.getElementById('p2Count')?.value||0),
      p3:Number(document.getElementById('p3Count')?.value||0)
    };
    if(t.know+t.understand+t.apply!==requested.p1||t.p2!==requested.p2||t.p3!==requested.p3){
      throw new Error(`Ma trận chưa khớp số câu: P1=${t.know+t.understand+t.apply}/${requested.p1}, P2=${t.p2}/${requested.p2}, P3=${t.p3}/${requested.p3}.`);
    }
    if(!state.rows.length)throw new Error('Hãy chọn bài trong phạm vi kiến thức để lập ma trận.');
    return {
      schema_version:SCHEMA,
      matrix_version:'114',
      mode:'FLEX_GEOGRAPHY',
      grade:grade(),
      source_policy:{
        curriculum_base:'TT32_2018_GEOGRAPHY',
        current_patch:grade()===12?'TT17_2025_CURRENT':null,
        lesson_mapping:'CURRICULUM_CATALOG_114_ACTIVE_NORMALIZED_TEXTBOOK',
        curriculum_catalog_version:'114'
      },
      time_minutes:Number(document.getElementById('matrixTime111')?.value||Math.max(15,Math.ceil((requested.p1+requested.p2*4+requested.p3)*1.25))),
      counts:requested,
      cognitive_command_summary:{
        KNOW:t.know+t.p2,
        UNDERSTAND:t.understand+t.p2*2,
        APPLY:t.apply+t.p2+t.p3
      },
      rows:state.rows
    };
  }

  function spec111(){
    const spec=baseSpec();
    if(!isGeography()||strict()) return spec;
    return {...spec,assessment_mode:'FLEX_GEOGRAPHY',assessment_matrix:matrixObject()};
  }
  window.aieSpec=spec111;

  function render(){
    const panel=document.getElementById('geoMatrixPanel111');
    if(!panel)return;
    const geo=isGeography(), g=grade();
    panel.classList.toggle('hidden',!geo||!g);
    if(!geo||!g)return;
    buildRows();
    const body=document.getElementById('geoMatrixBody111');
    const summary=document.getElementById('geoMatrixSummary111');
    const mode=document.getElementById('geoMatrixMode111');
    if(mode)mode.textContent=strict()?'STRICT_TNTHPT — ma trận chỉ hiển thị YCCĐ/phạm vi; cấu trúc 18–4–6 không đổi.':'FLEX_GEOGRAPHY — ma trận này khóa cấu trúc và được server biên dịch thành slot.';
    if(!state.rows.length){
      body.innerHTML=`<tr><td colspan="10">${g===11?'Khối 11 chưa có SGK normalized trong Kho tri thức. Catalog 114 khóa lesson mapping lớp 11; hệ thống không tự bịa ánh xạ theo bài.':'Không có mapping catalog 114 phù hợp với phạm vi đã chọn. Hãy kiểm tra bài/khối hoặc nguồn normalized.'}</td></tr>`;
      if(summary)summary.textContent='Chưa có dòng ma trận.';
      return;
    }
    body.innerHTML=state.rows.map((r,i)=>`<tr data-matrix-row="${i}">
      <td><strong>${esc(r.lesson_code||'')}</strong><div class="matrix-small">${esc(r.lesson_title)}</div></td>
      <td><div>${esc(r.requirement_text)}</div><div class="matrix-small">${esc(r.requirement_basis)} · confidence ${Math.round(r.mapping_confidence*100)}%</div></td>
      <td><div>${esc(r.indicator_text)}</div><div class="matrix-small">${esc(COMP_LABEL[r.competency_code]||r.competency_code)} · ${esc(r.operation_code)}</div></td>
      <td><input class="matrix-num" data-field="KNOW" type="number" min="0" max="99" value="${r.allocations.p1.KNOW}" ${strict()?'disabled':''}></td>
      <td><input class="matrix-num" data-field="UNDERSTAND" type="number" min="0" max="99" value="${r.allocations.p1.UNDERSTAND}" ${strict()?'disabled':''}></td>
      <td><input class="matrix-num" data-field="APPLY" type="number" min="0" max="99" value="${r.allocations.p1.APPLY}" ${strict()?'disabled':''}></td>
      <td><input class="matrix-num" data-field="P2" type="number" min="0" max="99" value="${r.allocations.p2}" ${strict()?'disabled':''}></td>
      <td><input class="matrix-num" data-field="P3" type="number" min="0" max="99" value="${r.allocations.p3}" ${strict()?'disabled':''}></td>
      <td>${esc(r.preferred_stimuli.join(' / '))}</td>
      <td>${r.allowed_cognitive_levels.map(x=>esc(x)).join('<br>')}</td>
    </tr>`).join('');
    const t=totals(), p1=t.know+t.understand+t.apply;
    if(summary)summary.textContent=`P1 ${p1} (Biết ${t.know} · Hiểu ${t.understand} · Vận dụng ${t.apply}) · P2 ${t.p2} cluster · P3 ${t.p3} · ${state.rows.length} indicator.`;
  }

  function syncInputsFromMatrix(){
    const t=totals();
    document.getElementById('p1Count').value=String(t.know+t.understand+t.apply);
    document.getElementById('p2Count').value=String(t.p2);
    document.getElementById('p3Count').value=String(t.p3);
    render();
  }

  function mount(){
    const knowledge=document.getElementById('knowledgeDocs');
    if(!knowledge||document.getElementById('geoMatrixPanel111'))return;
    const field=knowledge.closest('.field');
    const panel=document.createElement('div');
    panel.id='geoMatrixPanel111';
    panel.className='matrix-panel hidden';
    panel.innerHTML=`
      <div class="matrix-head">
        <div><strong>THIẾT LẬP MA TRẬN ĐÁNH GIÁ ĐỊA LÍ</strong><div id="geoMatrixMode111" class="matrix-small"></div></div>
        <div class="actions matrix-actions"><button type="button" id="matrixAuto111" class="secondary">Tự phân bổ theo chuẩn TN</button><button type="button" id="matrixSync111" class="secondary">Đồng bộ số câu từ ma trận</button></div>
      </div>
      <div class="grid4 matrix-meta"><div class="field"><label>Thời gian FLEX (phút)</label><input id="matrixTime111" type="number" min="10" max="240" value="45"></div><div class="field"><label>Chuẩn mức độ</label><input readonly value="Biết · Hiểu · Vận dụng"></div><div class="field"><label>Chuẩn chất lượng</label><input readonly value="TNTHPT 2025/2026"></div><div class="field"><label>Đơn vị gốc</label><input readonly value="YCCĐ → Indicator → Slot"></div></div>
      <div class="matrix-scroll"><table class="matrix-table"><thead><tr><th>Bài</th><th>YCCĐ chuẩn hóa</th><th>Indicator / năng lực</th><th>P1 Biết</th><th>P1 Hiểu</th><th>P1 VD</th><th>P2</th><th>P3</th><th>Stimulus</th><th>Mức cho phép</th></tr></thead><tbody id="geoMatrixBody111"></tbody></table></div>
      <div id="geoMatrixSummary111" class="statusline"></div>`;
    field.insertAdjacentElement('afterend',panel);

    panel.addEventListener('input',(event)=>{
      const input=event.target.closest('.matrix-num');
      if(!input)return;
      const tr=input.closest('[data-matrix-row]');
      const row=state.rows[Number(tr?.dataset.matrixRow)];
      if(!row)return;
      const value=Math.max(0,Number(input.value||0));
      const f=input.dataset.field;
      if(f==='P2')row.allocations.p2=value;
      else if(f==='P3')row.allocations.p3=value;
      else row.allocations.p1[f]=value;
      state.dirty=true;render();
    });
    document.getElementById('matrixAuto111').addEventListener('click',autoAllocate);
    document.getElementById('matrixSync111').addEventListener('click',syncInputsFromMatrix);

    document.addEventListener('change',(event)=>{
      if(event.target.matches('.knowledge-lesson-check,.knowledge-doc-all,#gradeSelect,#profile,#subjectSelect')){
        state.dirty=false;
        setTimeout(()=>{buildRows();if(!strict()&&state.rows.length)autoAllocate();else render();},0);
      }
    });
    for(const id of ['p1Count','p2Count','p3Count']) document.getElementById(id)?.addEventListener('change',()=>{if(!strict())autoAllocate();else render();});
    setTimeout(render,0);
  }

  const style=document.createElement('style');
  style.textContent=`
    .matrix-panel{margin-top:14px;border:1px solid #cbd5e1;border-radius:12px;padding:12px;background:#f8fafc}
    .matrix-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.matrix-small{font-size:11px;color:#64748b;margin-top:3px}
    .matrix-actions{margin:0}.matrix-meta{margin-top:10px}.matrix-scroll{overflow:auto;max-height:520px;border:1px solid #e2e8f0;border-radius:8px;background:#fff}
    .matrix-table{border-collapse:collapse;width:100%;min-width:1250px;font-size:12px}.matrix-table th,.matrix-table td{border-bottom:1px solid #e2e8f0;border-right:1px solid #f1f5f9;padding:7px;vertical-align:top}
    .matrix-table th{position:sticky;top:0;background:#eef2ff;z-index:1;text-align:left}.matrix-num{width:62px;padding:6px}
    @media(max-width:760px){.matrix-head{flex-direction:column}.matrix-meta{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
