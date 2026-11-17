(function(root){
  'use strict';
  const T=root.DamSanOmrTemplate, O=root.DamSanOmr, B=root.DamSanOmrRoomBinding, S=root.DamSanOmrScoring, W=root.DamSanOmrResultWrite, E=root.DamSanOmrScanAdapter;
  const V7=root.DamSanOmrV7Candidate;
  const LabScore=root.DamSanOmrV7LabScore;
  const Evidence=root.DamSanOmrEvidence, EvidenceClient=root.DamSanOmrEvidenceClient, EvidenceExport=root.DamSanOmrEvidenceExport, Naming=root.DamSanOmrEvidenceNaming,
    EvidencePrint=root.DamSanOmrEvidencePrint;
  if(!T||!O||!B||!S||!W){console.error('OMR modules missing');return;}

  const precisionCapture=typeof location!=='undefined'&&new URLSearchParams(location.search).get('omrPrecision')==='1'&&!!root.DamSanOmrPrecisionCapture;
  const state={rooms:[],roomModel:null,stream:null,lastScan:null,lastPreview:null,saved:new Set(),facing:'environment',autoScanEnabled:true,autoScanTimer:null,autoScanBusy:false,autoScanStable:0,autoScanLastCorners:null,lastCaptureMode:'manual',photoZoom:1.65,cameraRequestSerial:0,labEnabled:false,officialEngine:'v7',lastV6:null,evidenceCtx:null,evidenceData:null,evidenceTimer:null,evidenceSave:null,evidenceExportNext:0,evidenceExportRoom:null,evidenceCommittedSubmissionId:null};
  const q=id=>document.getElementById(id);
  // Desktop keeps its V5/V6 fallback comparison. The teacher PWA, when
  // loaded with V7 modules, compares V6/V7 without any second route or RPC.
  const hasV7Comparison=()=>!!V7?.analyzeValidatedRectified&&!!E?.fromV7;
  const expectedEngineLabel=(engine,compare=false)=>compare
    ?(hasV7Comparison()?'V6':'V5')
    :engine==='v7'?'V7':engine==='v6'?'V6':'V5';
  const formatScore=value=>{const n=Number(value);return value===null||value===undefined||value===''||!Number.isFinite(n)?'—':n.toFixed(2).replace('.',',');};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function normalizeRoom(r){
    return {
      ...r,
      id:r.id,
      MaPhong:r.MaPhong??r.ma_phong??'',
      DoiTuong:r.DoiTuong??r.doi_tuong??'TatCa',
      truong_id:r.truong_id??r.TruongId??r.TruongID,
      assessment_type:r.assessment_type??r.AssessmentType??'LEGACY',
      scoring_config:r.scoring_config??r.ScoringConfig??{}
    };
  }
  function allowedStudents(rows,room){
    const target=String(room.DoiTuong||'TatCa').trim();
    if(!target||target==='TatCa') return rows;
    const allow=target.split(',').map(s=>s.trim()).filter(Boolean);
    return rows.filter(s=>allow.includes(String(s.lop||'').trim())||allow.includes(String(s.ma_hs||'').trim()));
  }
  async function loadStudents(room){
    const res=await sb.from('hoc_sinh').select('id,truong_id,ma_hs,ho_ten,lop,quyen').eq('truong_id',room.truong_id);
    if(res.error) throw res.error;
    return allowedStudents(res.data||[],room);
  }


  const OMR_RESTORE_KEY='damSan_TeacherOmrReload_v1';
  function omrOwner(){
    try{return String(JSON.parse(sessionStorage.getItem('damSan_GVSession')||'null')?.id||'');}
    catch(_){return '';}
  }
  function readOmrReload(){
    try{
      const data=JSON.parse(sessionStorage.getItem(OMR_RESTORE_KEY)||'null');
      if(!data||data.v!==1||!data.owner||data.owner!==omrOwner()||
        Date.now()-data.at>6*60*60*1000)return null;
      return data;
    }catch(_){return null;}
  }
  function rememberOmr({clearDraft=false,withPhoto=false}={}){
    const owner=omrOwner();if(!owner)return;
    try{
      const old=readOmrReload()||{},roomId=q('omrRoomSelect')?.value||'';
      const data={v:1,owner,at:Date.now(),roomId,
        engine:state.officialEngine,compare:state.labEnabled,
        draft:clearDraft?null:(old.draft||null)};
      if(withPhoto&&state.lastScan?.ok&&roomId){
        const canvas=q('omrTeacherCanvas'),max=1250;
        let photo='';
        if(canvas?.width&&canvas?.height){
          const scale=Math.min(1,max/canvas.width,max/canvas.height);
          const preview=document.createElement('canvas');
          preview.width=Math.max(1,Math.round(canvas.width*scale));
          preview.height=Math.max(1,Math.round(canvas.height*scale));
          preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
          photo=preview.toDataURL('image/jpeg',.78);
          if(photo.length>1200000)photo='';
        }
        const ids=['omrSbd','omrMaDe','omrP1',
          ...[1,2,3,4].map(i=>'omrP2_'+i),...[1,2,3,4,5,6].map(i=>'omrP3_'+i)];
        data.draft={photo,scan:state.lastScan,comparison:state.lastV6,
          values:Object.fromEntries(ids.map(id=>[id,q(id).value])),
          roomId,engine:state.officialEngine,compare:state.labEnabled};
      }
      sessionStorage.setItem(OMR_RESTORE_KEY,JSON.stringify(data));
    }catch(e){
      // Session quota or disabled storage must never interrupt a camera scan.
      console.warn('OMR session draft unavailable:',e?.name||'unavailable');
    }
  }
  function clearOmrDraft(){rememberOmr({clearDraft:true});}
  function restoreOmrDraft(draft){
    return new Promise(resolve=>{
      if(!draft?.photo||!draft.scan?.ok||!state.roomModel?.valid1846
        ||draft.roomId!==String(q('omrRoomSelect').value)
        ||draft.engine!==state.officialEngine||draft.compare!==state.labEnabled
        ||!Array.isArray(draft.scan.p2)||!Array.isArray(draft.scan.p3)
        ||draft.scan.recognitionEngine!==expectedEngineLabel(state.officialEngine,state.labEnabled)){
        resolve(false);return;
      }
      const img=new Image();
      img.onload=()=>{
        try{
          const c=q('omrTeacherCanvas'),ctx=c.getContext('2d');
          c.width=img.naturalWidth;c.height=img.naturalHeight;
          ctx.drawImage(img,0,0);
          state.lastScan=draft.scan;state.lastV6=draft.comparison||null;
          const values=draft.values||{};
          for(const [id,value] of Object.entries(values)){
            const el=q(id);if(el&&typeof value==='string')el.value=value;
          }
          q('omrPhotoHint').textContent='Ảnh phiếu đã khôi phục sau tải lại • Chạm để xem lớn';
          q('omrScanArea').style.display='block';
          q('omrEngineResult').textContent=state.labEnabled
            ?'ĐỐI CHIẾU '+(hasV7Comparison()?'V6/V7':'V5/V6')+' – chỉ xem, không lưu điểm'
            :'Đang chấm bằng '+expectedEngineLabel(state.officialEngine);
          // Clear the previous manual acknowledgement. Revalidate answers
          // and marks with the currently reloaded room/variant before saving.
          q('omrReviewUncertain').checked=false;
          reviewCurrent();
          showV6Comparison();
          resolve(!!state.lastPreview);
        }catch(e){console.warn('OMR draft restore failed:',e);resolve(false);}
      };
      img.onerror=()=>resolve(false);
      img.src=draft.photo;
    });
  }

  function ensureUi(){
    if(q('omrTeacherOverlay')) return;
    const style=document.createElement('style');
    style.textContent=`
      #omrTeacherOverlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:4000;align-items:center;justify-content:center;padding:10px}
      #omrTeacherOverlay.show{display:flex}
      .omr-shell{width:min(980px,100%);max-height:96dvh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 18px 55px rgba(0,0,0,.28)}
      .omr-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid #e2e8f0;position:sticky;top:0;background:#fff;z-index:3}
      .omr-head h2{margin:0;font-size:18px}.omr-close{border:0;background:#fee2e2;color:#991b1b;border-radius:8px;padding:8px 11px;font-weight:700}
      .omr-body{padding:16px}.omr-row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.omr-field{flex:1;min-width:180px}.omr-field label{font-size:12px;margin-bottom:4px}
      /* Room selector must never share a flex row with template/progress data. */
      #omrTeacherOverlay .omr-room-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}
      #omrTeacherOverlay .omr-room-picker{min-width:0}
      #omrTeacherOverlay .omr-room-picker label{display:block;font-size:13px;font-weight:700;margin:0 0 6px}
      #omrTeacherOverlay #omrRoomSelect{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;white-space:nowrap;text-overflow:ellipsis}
      #omrTeacherOverlay .omr-room-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-width:0}
      #omrTeacherOverlay .omr-room-info-item{min-width:0;overflow-wrap:anywhere}
      #omrTeacherOverlay .omr-room-info-item .omr-muted{display:block;margin-bottom:4px}
      .omr-card{border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin:12px 0;background:#fff}.omr-muted{color:#64748b;font-size:12px}.omr-warn{background:#fff7ed;border-color:#fdba74}.omr-ok{background:#f0fdf4;border-color:#86efac}.omr-alert-field input,.omr-alert-field select{border:2px solid #f59e0b!important;background:#fffbeb!important}.omr-warning-list{margin:8px 0 0 18px;padding:0}.omr-warning-list li{margin:5px 0;line-height:1.4}
      .omr-actions{display:flex;gap:8px;flex-wrap:wrap}.omr-actions button{border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}.omr-primary{background:#1769e0;color:#fff}.omr-green{background:#15803d;color:#fff}.omr-light{background:#eef2f7;color:#1f2937}
      #omrTeacherVideoWrap{display:none;position:fixed;inset:0;background:#000;z-index:4500;padding:calc(8px + env(safe-area-inset-top)) 8px calc(8px + env(safe-area-inset-bottom));flex-direction:column}#omrTeacherVideoWrap.show{display:flex}
      #omrAutoHud{position:absolute;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);z-index:2;background:rgba(15,23,42,.78);color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;max-width:88vw;text-align:center;pointer-events:none}
      #omrAutoGuide{position:absolute;left:8%;right:8%;top:9%;bottom:17%;border:2px solid rgba(255,255,255,.72);border-radius:18px;box-shadow:0 0 0 9999px rgba(0,0,0,.12);pointer-events:none;z-index:1}
      #omrAutoGuide.ready{border-color:#22c55e;box-shadow:0 0 0 9999px rgba(0,0,0,.06),0 0 0 3px rgba(34,197,94,.22) inset}
      #omrTeacherVideo{flex:1;width:100%;min-height:0;object-fit:contain}.omr-camera-bar{display:flex;gap:8px;justify-content:center;padding:10px;flex-wrap:wrap}
      .omr-photo-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .omr-photo-head button{border:0;border-radius:8px;background:#eef2f7;color:#1f2937;font-weight:700;padding:8px 10px;cursor:pointer}
      #omrTeacherCanvas{display:block;max-width:100%;width:auto;height:auto;max-height:75dvh;object-fit:contain;background:#111;border-radius:8px;margin:auto;cursor:zoom-in}
      #omrPhotoLightbox{display:none;position:fixed;inset:0;z-index:4700;background:#0b1220;color:white;flex-direction:column;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
      #omrPhotoLightbox.show{display:flex}
      .omr-photo-controls{flex-shrink:0;display:flex;gap:8px;align-items:center;padding:10px;background:#0f172a}
      .omr-photo-controls button{border:0;border-radius:8px;background:#334155;color:#fff;font-weight:700;padding:10px 14px;cursor:pointer}
      #omrPhotoPan{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-x pan-y}
      #omrPhotoZoomCanvas{display:block;max-width:none;height:auto;margin:0 auto}
      #omrTeacherOverlay .omr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;min-width:0;max-width:100%}
      #omrTeacherOverlay .omr-grid>.omr-answer{min-width:0;max-width:100%}
      #omrTeacherOverlay .omr-grid>.omr-answer input{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;font-family:ui-monospace,monospace}
      #omrTeacherOverlay #omrStudentName{overflow-wrap:anywhere}
      .omr-score{font-size:30px;font-weight:800;color:#0f766e}.omr-progress{font-weight:700;color:#334155}
      /* Fixed V7 map: no collapsed details and no responsive overflow. */
      #omrTeacherOverlay .omr-shell,#omrTeacherOverlay .omr-body,#omrTeacherOverlay .omr-card{box-sizing:border-box;min-width:0;max-width:100%}
      #omrTeacherOverlay #omrV7OverlayPanel{width:100%;min-width:0}
      #omrTeacherOverlay .omr-overlay-title{font-size:16px;line-height:1.4;margin:0;font-weight:800;color:#0f172a}
      #omrTeacherOverlay #omrV7OverlayCanvas{display:block;width:100%;max-width:100%;height:auto;max-height:75dvh;object-fit:contain;border-radius:8px;background:#f1f5f9}
      #omrTeacherOverlay #omrV7OverlayLegend{font-size:12px;line-height:1.6;margin:8px 0;color:#334155}
      #omrTeacherOverlay #omrV7OverlayStatus{overflow-wrap:anywhere;margin-top:6px}
      #omrTeacherOverlay .omr-identity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:end;min-width:0;width:100%}
      #omrTeacherOverlay .omr-identity-grid>.omr-field{min-width:0;max-width:100%;width:100%;box-sizing:border-box}
      #omrTeacherOverlay .omr-identity-grid>.omr-field-student{grid-column:1/-1}
      #omrTeacherOverlay .omr-identity-grid label{display:block;margin:0 0 6px;font-size:13px;line-height:1.4;font-weight:600;overflow-wrap:anywhere}
      #omrTeacherOverlay .omr-identity-grid input,#omrTeacherOverlay .omr-identity-grid select{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;min-height:44px;padding:8px 10px;border:1px solid #94a3b8;border-radius:8px;background:#fff;color:#0f172a;font-size:16px;text-overflow:ellipsis}
      #omrTeacherOverlay .omr-identity-grid select{white-space:nowrap;overflow:hidden}
      #omrTeacherOverlay #omrEvidenceCanvas{display:block;width:100%;max-width:100%;height:auto;max-height:72dvh;object-fit:contain;background:white;border:1px solid #dbe3ed;border-radius:8px}
      #omrTeacherOverlay #omrEvidenceStatus{font-size:12px;margin-top:8px;overflow-wrap:anywhere}
      #omrTeacherOverlay #omrEvidenceCard{margin-top:0}
      #omrTeacherOverlay #omrEvidenceCard>strong{display:block;font-size:16px;margin-bottom:5px}
      #omrTeacherOverlay .omr-evidence-extra{margin-top:12px;border-top:1px solid #e2e8f0;padding-top:10px}
      #omrTeacherOverlay .omr-evidence-extra>summary,#omrTeacherOverlay #omrReviewDetails>summary,
      #omrTeacherOverlay #omrTechnicalDetails>summary{cursor:pointer;font-weight:700;line-height:1.45;color:#334155}
      #omrTeacherOverlay #omrReviewDetails .omr-identity-grid{margin-top:10px}
      #omrTeacherOverlay #omrEvidenceCanvas{cursor:zoom-in}
      #omrTeacherOverlay #omrScanArea>.omr-actions{position:sticky;bottom:0;z-index:2;
         padding:10px 5px;background:#fff;border-top:1px solid #e2e8f0;justify-content:center}
      #omrTeacherOverlay #omrScanArea>.omr-actions button{min-height:43px}
      #omrTeacherOverlay #omrTechnicalDetails:not([open]){padding:9px 12px;font-size:12px}
      /* Explicit display:grid/block rules on child canvases used to override
         the browser's native closed-details styles. Guarantee one visible image. */
      #omrTeacherOverlay details:not([open]) > :not(summary){display:none!important}
      #omrTeacherOverlay #omrEvidenceArchiveList{font-size:13px;line-height:1.5;max-height:250px;overflow:auto}
      #omrTeacherOverlay .omr-evidence-tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
      #omrTeacherOverlay #omrEvidenceReady{display:none;box-sizing:border-box;width:100%;margin-top:10px;
        padding:12px;background:#047857;color:white;border-radius:9px;text-align:center;
        text-decoration:none;font-weight:750;font-size:15px;line-height:1.5;
        overflow-wrap:anywhere;min-height:48px}
      @media(max-width:340px){#omrTeacherOverlay .omr-identity-grid{grid-template-columns:minmax(0,1fr)}}
      .omr-lab-details{white-space:pre-line;line-height:1.55;overflow-wrap:anywhere}.omr-lab-toggle{display:flex;gap:8px;align-items:flex-start;cursor:pointer}.omr-lab-toggle input{width:20px;height:20px;flex:0 0 20px;accent-color:#7c3aed}
      @media(max-width:700px){#omrTeacherOverlay{padding:0}.omr-shell{border-radius:0;max-height:100dvh;height:100dvh;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}.omr-body{padding:12px}.omr-field{min-width:145px}#omrTeacherOverlay .omr-room-info{grid-template-columns:minmax(0,1fr)}}
    `;
    document.head.appendChild(style);
    const wrap=document.createElement('div');
    wrap.innerHTML=`
    <div id="omrTeacherOverlay"><div class="omr-shell">
      <div class="omr-head"><h2>📷 Chấm phiếu trắc nghiệm</h2><button class="omr-close" id="omrClose">Đóng</button></div>
      <div class="omr-body">
        <div class="omr-card">
          <div class="omr-room-layout">
            <div class="omr-room-picker">
              <label for="omrRoomSelect">Phòng thi</label>
              <select id="omrRoomSelect" aria-label="Chọn phòng thi"></select>
            </div>
            <div class="omr-room-info">
              <div class="omr-room-info-item"><span class="omr-muted">Phiếu chuẩn</span><strong>BGD 2025 • 18–4–6</strong></div>
              <div class="omr-room-info-item"><span class="omr-muted">Tiến độ phiên này</span><div id="omrProgress" class="omr-progress">0 phiếu đã lưu</div></div>
            </div>
          </div>
          <div id="omrRoomSummary" class="omr-muted" style="margin-top:8px">Chọn phòng để bắt đầu.</div>
           <div class="omr-card" id="omrEngineWrap">
              <strong>OMR V7 — chấm và lưu điểm chính thức</strong>
              <div class="omr-muted" style="margin-top:6px">Một bộ chấm duy nhất. Kiểm tra SBD, mã đề và các vị trí được đánh dấu trước khi xác nhận.</div>
              <div class="omr-muted" id="omrV7LoadStatus" style="display:none;margin-top:6px" role="status"></div>
            </div>
        </div>
        <div class="omr-card">
          <div class="omr-actions">
            <button class="omr-primary" id="omrOpenCamera">Mở camera</button>
            <label class="omr-light" style="display:inline-block;padding:10px 14px;border-radius:8px;font-weight:700;cursor:pointer">Chọn ảnh<input id="omrPickFile" type="file" accept="image/*" style="display:none"></label>
          </div>
          <div class="omr-muted" style="margin-top:8px">Camera chỉ đọc phiếu trên máy. Điểm chỉ được ghi sau khi giáo viên bấm Xác nhận & Lưu.</div>
        </div>
        <div id="omrScanArea" style="display:none">
          <section id="omrEvidenceCard" class="omr-card" style="display:none" aria-label="Phiếu minh chứng đã đánh dấu đúng sai">
            <strong>Phiếu có đánh dấu đúng/sai</strong>
            <div class="omr-muted">Xanh: đúng • Đỏ: lựa chọn sai • Vàng: đáp án đúng • Cam: chưa rõ • Tím: GV sửa. Phiếu minh chứng không thay đổi điểm chính thức.</div>
            <canvas id="omrEvidenceCanvas" role="img" aria-label="Ảnh phiếu trắc nghiệm đã đánh dấu đáp án đúng sai"></canvas>
            <div id="omrEvidenceStatus" role="status"></div>
            <details id="omrEvidenceToolsDetails" class="omr-evidence-extra">
           <summary>Công cụ minh chứng và xuất file</summary>
           <div class="omr-evidence-tools">
               <button type="button" class="omr-light" id="omrEvidencePdf">Tải phiếu PDF</button>
              <button type="button" class="omr-light" id="omrEvidenceHistory">Phiếu OMR đã lưu</button>
              <button type="button" class="omr-light" id="omrEvidenceExport">Xuất Excel + phiếu PDF</button>
              <button type="button" class="omr-light" id="omrEvidenceRetry" style="display:none">Lưu lại minh chứng</button>
            </div>
            <a id="omrEvidenceReady" href="#" download style="display:none">Tải gói ZIP đã tạo</a>
            <div id="omrEvidenceArchiveList" style="display:none"></div>
           </details>
          </section>

          <details id="omrTechnicalDetails" class="omr-card" open>
          <summary>Ảnh nguồn và bản đồ mốc — xem khi cần kiểm tra kỹ thuật</summary>
          <div class="omr-card">
            <div class="omr-photo-head"><span class="omr-muted" id="omrPhotoHint">Ảnh phiếu sau khi chụp</span><button type="button" id="omrPhotoExpand">Xem chi tiết</button></div>
            <canvas id="omrTeacherCanvas" aria-label="Ảnh phiếu để đối chiếu kết quả nhận dạng"></canvas>
          </div>
          <section id="omrV7OverlayPanel" class="omr-card" style="display:none" aria-labelledby="omrV7OverlayTitle">
             <h3 class="omr-overlay-title" id="omrV7OverlayTitle">Bản đồ định vị V7 — mốc nội bộ và vị trí tô</h3>
             <div id="omrV7OverlayLegend">Xanh lá: nhận một ô; vàng: cần kiểm tra; đỏ: nhiều dấu tô; xanh dương: mốc. Xem lại các cảnh báo trước khi xác nhận lưu điểm.</div>
             <canvas id="omrV7OverlayCanvas" role="img" aria-label="Bản đồ vị trí nhận dạng V7, chỉ xem"></canvas>
             <div class="omr-muted" id="omrV7OverlayStatus" role="status"></div>
          </section>
          </details>
           <div id="omrEngineResult" class="omr-muted" style="margin:8px 0;font-weight:700"></div>
           <div id="omrWarning" class="omr-card omr-warn" style="display:none"></div>
          <label id="omrReviewUncertainWrap" class="omr-card omr-warn" style="display:none;cursor:pointer">
            <input id="omrReviewUncertain" type="checkbox" style="width:auto;margin-right:8px"> Tôi đã kiểm tra đúng các vị trí được đánh dấu và xác nhận dữ liệu đang hiển thị là đúng.
          </label>
          <details id="omrReviewDetails" class="omr-card">
          <summary>Thông tin và đáp án đọc được — chạm để kiểm tra / sửa</summary>
          <div class="omr-identity-grid">
              <div class="omr-field"><label for="omrSbd">SBD / mã học sinh</label><input id="omrSbd" type="text" inputmode="numeric" autocomplete="off"></div>
              <div class="omr-field"><label for="omrMaDe">Mã đề</label><input id="omrMaDe" type="text" autocomplete="off"></div>
              <div class="omr-field omr-field-student"><label for="omrStudent">Học sinh</label><select id="omrStudent"></select></div>
            </div>
          <div style="margin-top:12px;font-weight:700">Đáp án V7 nhận dạng</div>
            <div class="omr-grid" style="margin-top:10px">
              <div class="omr-answer"><label>Phần I (18 ký tự A/B/C/D)</label><input id="omrP1" type="text" maxlength="18"></div>
              <div class="omr-answer"><label>P2 Câu 1</label><input id="omrP2_1" type="text"></div>
              <div class="omr-answer"><label>P2 Câu 2</label><input id="omrP2_2" type="text"></div>
              <div class="omr-answer"><label>P2 Câu 3</label><input id="omrP2_3" type="text"></div>
              <div class="omr-answer"><label>P2 Câu 4</label><input id="omrP2_4" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 1</label><input id="omrP3_1" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 2</label><input id="omrP3_2" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 3</label><input id="omrP3_3" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 4</label><input id="omrP3_4" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 5</label><input id="omrP3_5" type="text"></div>
              <div class="omr-answer"><label>P3 Câu 6</label><input id="omrP3_6" type="text"></div>
            </div>
          <div style="margin-top:10px"><button type="button" class="omr-light" id="omrRecheck">Kiểm tra lại</button></div>
         </details>
         <div class="omr-card omr-ok" id="omrGradeCard" style="display:none">
            <div id="omrStudentName" style="font-weight:800"></div>
            <div>Mã đề: <b id="omrGradeCode"></b></div>
            <div>Điểm dự kiến (<span id="omrGradeEngine">V7</span>): <span class="omr-score" id="omrScore">-</span></div>
            <div id="omrPartScores" class="omr-muted"></div>
          </div>

          <div class="omr-actions">
            <button type="button" class="omr-light" id="omrEditAnswers">Kiểm tra / sửa</button>
            <button class="omr-green" id="omrSave" disabled>Xác nhận & Lưu</button>
            <button class="omr-light" id="omrNext">Quét lại</button>
          </div>
        </div>
      </div>
    </div></div>
    <div id="omrTeacherVideoWrap"><div id="omrAutoHud">Đưa trọn phiếu vào khung</div><div id="omrAutoGuide"></div><video id="omrTeacherVideo" autoplay playsinline muted></video><div class="omr-camera-bar"><button id="omrCameraClose">Đóng</button><button id="omrAutoToggle">Tự động: Bật</button><button id="omrCameraSwitch">Đổi camera</button><button id="omrCameraCapture" class="omr-primary">Chụp thủ công</button></div></div>
    <div id="omrPhotoLightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh phiếu phóng to">
      <div class="omr-photo-controls"><strong style="flex:1">Ảnh phiếu đã phóng</strong>
        <button type="button" id="omrPhotoMinus" aria-label="Thu nhỏ">−</button>
        <button type="button" id="omrPhotoPlus" aria-label="Phóng to">+</button>
        <button type="button" id="omrPhotoClose">Đóng</button>
      </div><div id="omrPhotoPan"><canvas id="omrPhotoZoomCanvas"></canvas></div>
    </div>`;
    document.body.appendChild(wrap);
    q('omrClose').onclick=()=>{if(!root.DamSanTeacherNav?.closeOmr?.())close();};
    q('omrRoomSelect').onchange=()=>loadRoom(q('omrRoomSelect').value);
    q('omrOpenCamera').onclick=openCamera;
    q('omrPickFile').onchange=e=>e.target.files[0]&&loadImageFile(e.target.files[0]);
    q('omrCameraClose').onclick=()=>{if(!root.DamSanTeacherNav?.backFrom?.('camera'))closeCamera();};
    q('omrCameraSwitch').onclick=()=>{state.facing=state.facing==='environment'?'user':'environment';openCamera();};
    q('omrCameraCapture').onclick=()=>capture('manual');
    q('omrPhotoExpand').onclick=openPhotoDetail;
    q('omrEvidenceCanvas').onclick=()=>openPhotoDetail({fromEvidence:true});
    q('omrEditAnswers').onclick=()=>{
      const details=q('omrReviewDetails');details.open=!details.open;
      if(details.open)details.scrollIntoView?.({block:'nearest',behavior:'smooth'});
    };
    q('omrTeacherCanvas').onclick=openPhotoDetail;
    q('omrPhotoClose').onclick=()=>{if(!root.DamSanTeacherNav?.backFrom?.('photo'))closePhotoDetail();};
    q('omrPhotoPlus').onclick=()=>setPhotoZoom(state.photoZoom+.45);
    q('omrPhotoMinus').onclick=()=>setPhotoZoom(state.photoZoom-.45);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closePhotoDetail();});
    q('omrAutoToggle').onclick=()=>{
      state.autoScanEnabled=!state.autoScanEnabled;
      state.autoScanStable=0;state.autoScanLastCorners=null;
      q('omrAutoToggle').textContent='Tự động: '+(state.autoScanEnabled?'Bật':'Tắt');
      updateAutoHud(state.autoScanEnabled?'Đưa trọn phiếu vào khung':'Chế độ thủ công',false);
      if(state.autoScanEnabled&&state.stream)startAutoScanLoop();
      else if(!state.autoScanEnabled)stopAutoScanLoop();
    };
    q('omrRecheck').onclick=reviewCurrent;
    const evidenceFileStem=()=>{
      if(!state.evidenceData)return '';
      return Naming.stem({...state.evidenceData.record,
        exam_code:state.evidenceData.preview.variant.code,
        student_code:state.evidenceData.preview.student.ma_hs,
        student_name:state.evidenceData.preview.student.ho_ten,
        class_name:state.evidenceData.preview.student.lop});
    };
    q('omrEvidencePdf').onclick=async()=>{
      const btn=q('omrEvidencePdf');
      if(!state.evidenceData||!EvidencePrint||btn.disabled)return;
      btn.disabled=true;
      try{
        const pdf=await EvidencePrint.pdfFromCanvas(q('omrEvidenceCanvas'));
        EvidenceClient.downloadBlob(new Blob([pdf],{type:'application/pdf'}),
          evidenceFileStem()+'.pdf');
      }catch(err){
        q('omrEvidenceStatus').textContent='Không tạo được PDF: '+(err?.message||err);
      }finally{btn.disabled=false;}
    };
    q('omrEvidenceHistory').onclick=showEvidenceArchive;
    // A keyboard-accessible reader can expand the optional tools when needed.
    q('omrEvidenceToolsDetails').addEventListener('toggle',()=>{
      if(q('omrEvidenceToolsDetails').open&&state.evidenceData)
        q('omrEvidenceStatus').setAttribute('aria-live','polite');
    });
    q('omrEvidenceExport').onclick=exportEvidenceRoom;
    q('omrEvidenceRetry').onclick=()=>saveTestEvidence(true);
    q('omrNext').onclick=()=>{
      resetScan();
      if(!root.DamSanTeacherNav?.resumeCamera?.())openCamera({navigation:'replace'});
    };
    q('omrSave').onclick=saveCurrent;
    q('omrReviewUncertain').onchange=reviewCurrent;
    const gradeInputs=['omrSbd','omrMaDe','omrStudent','omrP1',
      'omrP2_1','omrP2_2','omrP2_3','omrP2_4',
      'omrP3_1','omrP3_2','omrP3_3','omrP3_4','omrP3_5','omrP3_6'];
    let gradeDebounce=null;
    for(const id of gradeInputs){
      q(id).addEventListener('change',()=>{
        if(gradeDebounce)clearTimeout(gradeDebounce);
        reviewCurrent();
      });
      if(id==='omrStudent')continue;
      q(id).addEventListener('input',()=>{
        if(gradeDebounce)clearTimeout(gradeDebounce);
        gradeDebounce=setTimeout(reviewCurrent,300);
      });
    }
  }

  async function open(){
    ensureUi();
    const saved=readOmrReload();
    const v7Available=hasV7Comparison();
    const draft=saved?.draft;
    // Never restore a V5/V6 or comparison scan into an official V7 session.
    const resumeDraft=!!(v7Available
      &&typeof draft?.photo==='string'
      &&draft.photo.startsWith('data:image/jpeg;base64,')
      &&draft.scan?.ok===true
      &&draft.roomId===saved.roomId
      &&saved.engine==='v7'&&saved.compare===false
      &&draft.engine==='v7'&&draft.compare===false
      &&draft.scan.recognitionEngine==='V7'
      &&draft.scan.captureMode==='v7'
      &&draft.scan._labReadOnly===false
      &&draft.scan._requiresRetake===false);
    state.restoring=true;
    state.officialEngine='v7';
    state.labEnabled=false;
    const v7Status=q('omrV7LoadStatus');
    v7Status.style.display=v7Available?'none':'block';
    v7Status.textContent=v7Available?''
      :'Không tải được đầy đủ thuật toán V7. Hãy đóng và mở lại PWA. Chấm điểm tạm khóa; không tự chuyển sang V5/V6.';
    q('omrOpenCamera').disabled=!v7Available;
    q('omrPickFile').disabled=!v7Available;
    q('omrTeacherOverlay').classList.add('show');
    q('omrRoomSelect').innerHTML='<option value="">Đang tải phòng...</option>';
    try{
      const rooms=(await rpcLayDanhSachPhongThi()).map(normalizeRoom);
      state.rooms=rooms;
      q('omrRoomSelect').innerHTML='<option value="">— Chọn phòng thi —</option>'+rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.MaPhong)}${r.DoiTuong&&r.DoiTuong!=='TatCa'?' — '+esc(r.DoiTuong):''}</option>`).join('');
      const chosen=rooms.find(r=>String(r.id)===String(saved?.roomId||''))?.id||(rooms.length===1?rooms[0].id:null);
      if(chosen){
        q('omrRoomSelect').value=chosen;
        await loadRoom(chosen);
        if(resumeDraft&&state.roomModel?.valid1846){
          const restored=await restoreOmrDraft(draft);
          if(!restored)q('omrRoomSummary').textContent+=' • Phiếu trước đó không khôi phục được, cần quét lại.';
        }
      }
    }catch(e){q('omrRoomSummary').textContent='Không tải được danh sách phòng: '+e.message;}
    finally{state.restoring=false;rememberOmr({clearDraft:!resumeDraft});}
  }
  function close(){closePhotoDetail();closeCamera();q('omrTeacherOverlay')?.classList.remove('show');}
  function isOpen(){return !!q('omrTeacherOverlay')?.classList.contains('show');}
  async function restoreNavigationStage(stage){
    if(!isOpen())await open();
    if(stage==='photo'){
      closeCamera();
      if(state.lastScan)openPhotoDetail({navigation:'none'});
      else closePhotoDetail();
    }else if(stage==='result'){
      closePhotoDetail();closeCamera();
      if(state.lastScan)q('omrScanArea').style.display='block';
    }else if(stage==='camera'){
      closePhotoDetail();
      await openCamera({navigation:'none'});
    }else{
      closePhotoDetail();closeCamera();resetScan();
    }
  }
  async function loadRoom(id){
    resetScan();
    state.roomModel=null;
    if(!id){q('omrRoomSummary').textContent='Chọn phòng để bắt đầu.';return;}
    const room=state.rooms.find(r=>String(r.id)===String(id)); if(!room)return;
    q('omrRoomSummary').textContent='Đang tải đề và danh sách học sinh...';
    try{
      state.roomModel=await B.loadReadOnlyContext({room,staffRpc:staffRpc,loadStudents});
      if(!state.roomModel.valid1846){
        q('omrRoomSummary').textContent='Phòng này không có cấu trúc 18–4–6 hợp lệ. Không thể chấm bằng phiếu chuẩn.';
        return;
      }
      fillStudentSelect();
      q('omrRoomSummary').textContent=`${state.roomModel.students.length} học sinh • ${state.roomModel.codes.length} mã đề: ${state.roomModel.codes.join(', ')}`;
      updateProgress();
      if(!state.restoring)rememberOmr({clearDraft:true});
    }catch(e){q('omrRoomSummary').textContent='Không tải được phòng: '+e.message;}
  }
  function fillStudentSelect(selected){
    if(!state.roomModel)return;
    q('omrStudent').innerHTML='<option value="">— Chưa xác định —</option>'+state.roomModel.students.map(s=>`<option value="${esc(s.id)}">${esc(s.ma_hs)} — ${esc(s.ho_ten)} (${esc(s.lop)})</option>`).join('');
    if(selected)q('omrStudent').value=selected;
  }

  function updateAutoHud(text,ready=false){
    const hud=q('omrAutoHud'),guide=q('omrAutoGuide');
    if(hud)hud.textContent=text;
    if(guide)guide.classList.toggle('ready',!!ready);
  }
  function stopAutoScanLoop(){
    if(state.autoScanTimer){clearInterval(state.autoScanTimer);state.autoScanTimer=null;}
    state.autoScanStable=0;state.autoScanLastCorners=null;state.autoScanBusy=false;
  }
  function cornerMotion(a,b,scale){
    if(!a||!b||a.length!==b.length)return Infinity;
    let sum=0;
    for(let i=0;i<a.length;i++)sum+=Math.hypot(a[i][0]-b[i][0],a[i][1]-b[i][1]);
    return sum/a.length/Math.max(1,scale);
  }
  function startAutoScanLoop(){
    stopAutoScanLoop();
    const probe=document.createElement('canvas'),pctx=probe.getContext('2d',{willReadFrequently:true});
    state.autoScanTimer=setInterval(()=>{
      if(!state.autoScanEnabled||state.autoScanBusy||!state.stream)return;
      const v=q('omrTeacherVideo');
      if(!v?.videoWidth||!v?.videoHeight)return;
      try{
        const max=720,s=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
        probe.width=Math.max(1,Math.round(v.videoWidth*s));probe.height=Math.max(1,Math.round(v.videoHeight*s));
        pctx.drawImage(v,0,0,probe.width,probe.height);
        const img=pctx.getImageData(0,0,probe.width,probe.height);
        const gray=O.grayscale(img.data,probe.width,probe.height);
        if(precisionCapture){
          const assessment=root.DamSanOmrPrecisionCapture.evaluate(gray,probe.width,probe.height,T.template,O);
          if(!assessment.ready){
            state.autoScanStable=0;state.autoScanLastCorners=null;
            const reason=(assessment.reasons||[assessment.reason])[0];
            const messages={
              four_corners_missing:'Cần đủ 4 mốc vuông đen',
              invalid_quad:'Phiếu nghiêng hoặc thiếu góc',
              internal_controls_unverified:'Chưa khớp mốc nội bộ của mẫu phiếu',
              illumination:'Ánh sáng chưa phù hợp',
              blur_or_low_texture:'Ảnh chưa đủ nét — giữ điện thoại ổn định'
            };
            updateAutoHud(messages[reason]||'Đang xác minh phiếu',false);
            return;
          }
          const motion=cornerMotion(assessment.corners,state.autoScanLastCorners,Math.min(probe.width,probe.height));
          state.autoScanLastCorners=assessment.corners.map(p=>p.slice());
          state.autoScanStable=motion<0.009?state.autoScanStable+1:1;
          const need=3;
          updateAutoHud('Precision Capture • '+assessment.internalMatches+' mốc nội bộ • giữ yên '+Math.min(state.autoScanStable,need)+'/'+need,true);
          if(state.autoScanStable>=need){
            state.autoScanBusy=true;
            updateAutoHud('Ảnh đủ chất lượng — đang nhận dạng…',true);
            capture('auto');
          }
          return;
        }
        const markers=O.detectCornerMarkers(gray,probe.width,probe.height);
        if(!markers.ok){
          state.autoScanStable=0;state.autoScanLastCorners=null;
          updateAutoHud('Đưa trọn phiếu và 4 mốc góc vào khung',false);
          return;
        }
        const geometry=O.fastTemplateRegistration(T.template,markers,probe.width,probe.height);
        if(!geometry.ok){
          state.autoScanStable=0;state.autoScanLastCorners=markers.corners;
          updateAutoHud('Đang căn phiếu — giữ đủ 4 góc',false);
          return;
        }
        const motion=cornerMotion(markers.corners,state.autoScanLastCorners,Math.min(probe.width,probe.height));
        state.autoScanLastCorners=markers.corners.map(p=>p.slice());
        state.autoScanStable=motion<0.018?state.autoScanStable+1:1;
        const need=2;
        updateAutoHud('Đã bắt 4 mốc ngoài • giữ yên '+Math.min(state.autoScanStable,need)+'/'+need,true);
        if(state.autoScanStable>=need){
          state.autoScanBusy=true;
          updateAutoHud('Đang tự chụp và nhận dạng…',true);
          setTimeout(()=>capture('auto'),80);
        }
      }catch(e){
        state.autoScanStable=0;state.autoScanLastCorners=null;
        updateAutoHud('Không nhận được phiếu — thử giữ thẳng hơn',false);
      }
    },240);
  }
  async function openCamera({navigation='push'}={}){
    if(!state.roomModel?.valid1846){alert('Hãy chọn phòng 18–4–6 hợp lệ trước.');return false;}
    closeCamera();
    const request=state.cameraRequestSerial;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:state.facing},width:{ideal:1920},height:{ideal:1080}},audio:false});
      if(request!==state.cameraRequestSerial||!isOpen()){
        stream.getTracks().forEach(t=>t.stop());
        return false;
      }
      state.stream=stream;
      const v=q('omrTeacherVideo');
      v.srcObject=stream;q('omrTeacherVideoWrap').classList.add('show');
      q('omrAutoToggle').textContent='Tự động: '+(state.autoScanEnabled?'Bật':'Tắt');
      updateAutoHud(state.autoScanEnabled?'Đưa trọn phiếu vào khung':'Chế độ thủ công',false);
      try{await v.play();}catch(_){}
      if(request!==state.cameraRequestSerial)return false;
      if(state.autoScanEnabled)startAutoScanLoop();
      if(navigation!=='none')root.DamSanTeacherNav?.enterOmrStage?.('camera',{replace:navigation==='replace'});
      return true;
    }catch(e){alert('Không mở được camera: '+e.message);return false;}
  }
  function closeCamera(){
    ++state.cameraRequestSerial;
    stopAutoScanLoop();
    if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
    q('omrTeacherVideoWrap')?.classList.remove('show');
  }

  function capture(mode='manual'){
    const v=q('omrTeacherVideo');if(!state.stream||!v.videoWidth)return;
    state.lastCaptureMode=mode;
    const c=q('omrTeacherCanvas'),ctx=c.getContext('2d',{willReadFrequently:true}),max=2200,s=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
    c.width=Math.round(v.videoWidth*s);c.height=Math.round(v.videoHeight*s);ctx.drawImage(v,0,0,c.width,c.height);closeCamera();analyzeCanvas();
  }
  function loadImageFile(file){
    if(!state.roomModel?.valid1846){alert('Hãy chọn phòng 18–4–6 hợp lệ trước.');return;}
    state.lastCaptureMode='file';
    const img=new Image();img.onload=()=>{
      const c=q('omrTeacherCanvas'),ctx=c.getContext('2d',{willReadFrequently:true}),max=1800,s=Math.min(1,max/Math.max(img.width,img.height));
      c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);ctx.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);analyzeCanvas();
    };img.src=URL.createObjectURL(file);
  }
  // The source image is only cropped AFTER OMR analysis has used the full
  // camera frame. Marker coordinates are in that original image pixel space.
  function photoCropBounds(corners,width,height){
    if(!Array.isArray(corners)||corners.length!==4||width<1||height<1)return null;
    if(corners.some(p=>!Array.isArray(p)||p.length<2||!p.every(Number.isFinite)))return null;
    const xx=corners.map(p=>p[0]),yy=corners.map(p=>p[1]);
    const minX=Math.min(...xx),maxX=Math.max(...xx),minY=Math.min(...yy),maxY=Math.max(...yy);
    const spanX=maxX-minX,spanY=maxY-minY;
    if(spanX<width*.22||spanY<height*.22)return null;
    const area=Math.abs(corners.reduce((s,p,i)=>{
      const q=corners[(i+1)%corners.length];return s+p[0]*q[1]-q[0]*p[1];
    },0))*.5;
    if(area<width*height*.07)return null;
    // The outer printed markers sit about 3% inside each paper edge.
    const padX=Math.max(6,spanX*.055),padY=Math.max(6,spanY*.045);
    const x=Math.max(0,Math.floor(minX-padX)),y=Math.max(0,Math.floor(minY-padY));
    const right=Math.min(width,Math.ceil(maxX+padX)),bottom=Math.min(height,Math.ceil(maxY+padY));
    return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
  }
  function renderReviewPhoto(canvas,corners){
    const bounds=photoCropBounds(corners,canvas.width,canvas.height);
    if(!bounds)return false;
    const cropped=document.createElement('canvas');
    cropped.width=bounds.width;cropped.height=bounds.height;
    const croppedCtx=cropped.getContext('2d');
    if(!croppedCtx)return false;
    croppedCtx.drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
    canvas.width=bounds.width;canvas.height=bounds.height;
    canvas.getContext('2d').drawImage(cropped,0,0);
    return true;
  }
  function setPhotoZoom(value){
    state.photoZoom=Math.max(1,Math.min(3.2,value));
    const c=q('omrPhotoZoomCanvas');
    if(c)c.style.width=Math.round(state.photoZoom*100)+'%';
  }
  function openPhotoDetail({navigation='push',fromEvidence=false}={}){
    const src=fromEvidence&&state.evidenceData?q('omrEvidenceCanvas'):
      q('omrTeacherCanvas'),viewer=q('omrPhotoLightbox');
    if(!src?.width||!src?.height||!viewer)return;
    const zoom=q('omrPhotoZoomCanvas');
    zoom.width=src.width;zoom.height=src.height;
    zoom.getContext('2d').drawImage(src,0,0);
    viewer.classList.add('show');
    setPhotoZoom(1.65);
    const pan=q('omrPhotoPan');if(pan){pan.scrollLeft=0;pan.scrollTop=0;}
    if(navigation!=='none')root.DamSanTeacherNav?.enterOmrStage?.('photo');
  }
  function closePhotoDetail(){
    q('omrPhotoLightbox')?.classList.remove('show');
    const zoom=q('omrPhotoZoomCanvas');
    if(zoom){zoom.width=0;zoom.height=0;}
  }
  function analyzeCanvas(){
    const c=q('omrTeacherCanvas'),ctx=c.getContext('2d',{willReadFrequently:true});
    state.lastScan=null;state.lastPreview=null;
    state.evidenceCtx=null;state.evidenceData=null;
    if(q('omrEvidenceCard'))q('omrEvidenceCard').style.display='none';
    if(q('omrTechnicalDetails'))q('omrTechnicalDetails').open=true;
    if(state.evidenceTimer)clearTimeout(state.evidenceTimer);
    q('omrSave').disabled=true;
    try{
      const pixels=ctx.getImageData(0,0,c.width,c.height);
      const v5=O.analyzeImageData(pixels,T.template);
      const mode='v7'; // The only official capture/write engine.
      let scan=v5;
      if(!v5.ok){
        q('omrScanArea').style.display='block';
        const detail=v5.markerMatches!==undefined?` (${v5.markerMatches} mốc khớp)`:'';
        showWarning((v5.error||'Không đọc được phiếu')+detail);
        if(state.lastCaptureMode==='auto')setTimeout(()=>openCamera({navigation:'none'}).catch(()=>{}),700);
        return;
      }
      state.lastV6=null;
      if(mode!=='v5'){
        const begun=performance.now();
        try{
          if(!E)throw Error('Thiếu mô-đun chuẩn hóa kết quả V7');
          const gray=O.grayscale(pixels.data,pixels.width,pixels.height);
          const rect=O.warpTemplateGray(gray,pixels.width,pixels.height,
            v5.homography,T.template,1800);
          if(mode==='compare'&&hasV7Comparison()){
            // One V5 four-corner homography and ONE rectified image for both
            // independent engines. Never reuse V6 marks as V7 answers.
            const info={candidate:null,candidateV7:null,
              elapsedMs:null,v7ElapsedMs:null,error:'',v7Error:''};
            state.lastV6=info;
            try{
              const t6=performance.now();
              info.candidate=root.DamSanOmrReliabilityV6.analyzeRectified(rect,T.template);
              info.elapsedMs=Math.round(performance.now()-t6);
              // Only the display scan is normalized. _labReadOnly is set below
              // and write-level checks also reject every comparison capture.
              scan=E.fromV6(v5,info.candidate);
            }catch(err){info.error='V6: '+(err?.message||String(err));}
            try{
              const t7=performance.now();
              // A/B experiment is ALWAYS read-only; expose the full
              // V7 candidate here, never in the save-enabled V7 path.
              info.candidateV7=V7.analyzeValidatedRectified(
                rect,T.template,root.DamSanOmrReliabilityV6,
                {experimentalRefinement:true});
              info.v7ElapsedMs=Math.round(performance.now()-t7);
              if(!info.candidateV7.ok)
                info.v7Error=(info.candidateV7.retakeReasons||[]).join('; ')||
                  'V7 yêu cầu kiểm tra lại ảnh';
              // Show the same rectified pixels used for V6/V7 decisions.
              // The overlay never changes a score or enables saving.
              const overlayPanel=q('omrV7OverlayPanel');
              if(overlayPanel&&root.DamSanOmrV7Overlay?.draw){
                try{
                  const image=root.DamSanOmrV7Overlay.draw(
                    q('omrV7OverlayCanvas'),rect,T.template,info.candidateV7);
                  overlayPanel.style.display='block';
                  q('omrV7OverlayStatus').textContent=
                    'Dấu nhận một ô: '+image.counts.single+
                    ' • Cần xem lại: '+image.counts.review+
                    ' • Nhiều dấu: '+image.counts.multiple+
                    ' • Mốc nội bộ: '+image.controls.length+
                    ' (chỉ quan sát, không lưu điểm)';
                }catch(e){console.warn('V7 overlay:',e);}
              }
            }catch(err){info.v7Error='V7: '+(err?.message||String(err));}
          }else if(mode==='v7'){
            if(!V7?.analyzeValidatedRectified||!E.fromV7)
              throw Error('Thiếu thuật toán V7 trên PWA');
            // Official writer uses the same refined candidate tested in comparison.
            const candidate=V7.analyzeValidatedRectified(
              rect,T.template,null,{experimentalRefinement:true});
            scan=E.fromV7(v5,candidate);
            if(Evidence){
              state.evidenceCtx={rect,candidate,original:null,scanId:crypto.randomUUID(),
                revision:0,signature:null};
            }
            if(root.DamSanOmrV7Overlay?.draw){
              try{
                const panel=q('omrV7OverlayPanel');
                panel.style.display='block';
                const image=root.DamSanOmrV7Overlay.draw(
                  q('omrV7OverlayCanvas'),rect,T.template,candidate);
                panel.style.display='block';
                q('omrV7OverlayStatus').textContent=
                  'Dấu nhận một ô: '+image.counts.single+
                  ' • Cần xem lại: '+image.counts.review+
                  ' • Nhiều dấu: '+image.counts.multiple+
                  ' • Mốc nội bộ: '+image.controls.length;
              }catch(err){
                q('omrV7OverlayStatus').textContent='Không hiển thị được bản đồ V7: '+(err?.message||'lỗi vẽ');
                console.warn('V7 overlay:',err);
              }
            }
            const roomCode=String(state.roomModel?.room?.MaPhong||
              state.roomModel?.room?.ma_phong||'').trim();
            if(roomCode==='OMR_V7_TEST'){
              // Research evidence is collected ONLY in the explicitly
              // designated test room and only after teacher confirmation.
              // The same rectified image is used; no image upload, new RPC,
              // new database table, or extra UI step is introduced.
              const evidence={schema:1,room:'OMR_V7_TEST',
                v7:{p1:candidate.p1,p2:[...candidate.p2],p3:[...candidate.p3],
                  warningCount:candidate.issues.length,
                  invalidMarks:[...candidate.invalidMarks]},
                v7Ms:Math.round(performance.now()-begun),
                v6:null,v6Ms:null,comparison:null,v6Error:null};
              try{
                const t6=performance.now();
                const baseline=root.DamSanOmrReliabilityV6.analyzeRectified(
                  rect,T.template);
                evidence.v6Ms=Math.round(performance.now()-t6);
                evidence.v6={p1:baseline.p1,p2:[...baseline.p2],
                  p3:[...baseline.p3],
                  warningCount:(baseline.issues||[]).length,
                  invalidMarks:[...(baseline.invalidMarks||[])]};
                const difference=V7.compare(baseline,candidate);
                evidence.comparison={count:difference.count,
                  differences:difference.differences};
              }catch(err){
                // V6 reference failure is recorded as diagnostic evidence.
                // It must not change V7 grading or bypass any V7 safety gate.
                evidence.v6Error=String(err?.message||err).slice(0,180);
              }
              scan.omrV7TestEvidence=evidence;
            }
          }else{
            const candidate=root.DamSanOmrReliabilityV6.analyzeRectified(rect,T.template);
            state.lastV6={candidate,elapsedMs:Math.round(performance.now()-begun)};
            if(mode==='v6')scan=E.fromV6(v5,candidate);
          }
        }catch(e){
          if(mode==='compare'){
            state.lastV6={error:'Không đối chiếu được: '+(e?.message||String(e))};
          }else{
            q('omrScanArea').style.display='block';
            showWarning('Không xử lý được bằng '+expectedEngineLabel(mode)+': '+
              (e?.message||String(e))+'. Hãy quét lại ảnh đạt yêu cầu; không lưu từ ảnh này.');
            return;
          }
        }
      }
      scan.templateId=T.template.id;
      scan._labReadOnly=mode==='compare';
      scan.captureMode=mode;
      if(mode==='v5'||(mode==='compare'&&!hasV7Comparison()))
        scan.recognitionEngine='V5';
      state.lastScan=scan;
      if(state.evidenceCtx){
        state.evidenceCtx.original={p1:scan.p1,p2:[...(scan.p2||[])],
          p3:[...(scan.p3||[])]};
      }
      // Presentation only: crop around validated four-corner markers after
      // recognition. Never send the cropped image back to the OMR engine.
      let cropped=false;
      try{cropped=renderReviewPhoto(c,scan.markerCorners);}catch(e){console.warn('OMR preview crop:',e);}
      q('omrPhotoHint').textContent=cropped?'Phiếu đã phóng vừa khung theo 4 mốc góc • Chạm để xem lớn':'Ảnh gốc • Chạm để xem lớn';
      q('omrScanArea').style.display='block';
      q('omrEngineResult').textContent=mode==='compare'
        ?'ĐỐI CHIẾU '+(hasV7Comparison()?'V6/V7':'V5/V6')+' – chỉ xem, không lưu điểm'
        :'Đang chấm bằng '+expectedEngineLabel(mode);
      q('omrSbd').value=scan.sbd;
      q('omrMaDe').value=scan.maDe;
      q('omrP1').value=scan.p1;
      scan.p2.forEach((v,i)=>q('omrP2_'+(i+1)).value=v);
      scan.p3.forEach((v,i)=>q('omrP3_'+(i+1)).value=v);
      const sr=B.resolveStudent(scan.sbd,state.roomModel.studentIndex);
      fillStudentSelect(sr.status==='matched'?sr.student.id:null);
      if(scan.uncertain.length) showScanWarnings(scan);
      else {clearWarningHighlights();hideWarning();}
      reviewCurrent();
      showV6Comparison();
      rememberOmr({withPhoto:true});
      root.DamSanTeacherNav?.enterOmrStage?.('result');
    }catch(e){showWarning('Lỗi đọc ảnh: '+e.message);}
  }

  // Comparison never mutates the V5 scan or the canonical answer key.
  function compareV5V6(v5,v6){
    const diffs=[];
    for(let i=0;i<18;i++){
      const old=v5.p1?.[i]||'?',now=v6.p1?.[i]||'?';
      if(old!==now)diffs.push({key:'P1.'+(i+1),old,now});
    }
    const a=(v5.p2||[]).flatMap(row=>row.split('-'));
    const b=(v6.p2||[]).flatMap(row=>row.split('-'));
    for(let i=0;i<16;i++){
      const old=a[i]||'?',now=b[i]||'?';
      if(old!==now)diffs.push({key:'P2.'+(Math.floor(i/4)+1)+'abcd'[i%4],old,now});
    }
    if(Array.isArray(v5.p3)&&Array.isArray(v6.p3)){
      for(let i=0;i<6;i++){
        const old=v5.p3[i]??'?',now=v6.p3[i]??'?';
        if(old!==now)diffs.push({key:'P3.'+(i+1),old,now});
      }
    }
    return diffs;
  }

  // Read-only comparison in the EXISTING PWA OMR result panel. This function
  // does not perform any RPC, storage write or mutation of the answer key.
  function showV7Comparison(){
    const panel=q('omrV6Comparison'),scan=state.lastScan;
    if(!panel)return;
    panel.style.display=scan?._labReadOnly?'block':'none';
    if(!scan?._labReadOnly)return;
    const data=state.lastV6||{},v6=data.candidate,v7=data.candidateV7;
    const summary=q('omrV6Summary'),scores=q('omrV6Scores'),diffs=q('omrV6Diffs');
    const failures=[data.error,data.v7Error].filter(Boolean);
    const changes=(v6&&v7)?compareV5V6(v6,v7):[];
    const counts=[v6?.issues?.length??'—',v7?.issues?.length??'—'];
    summary.textContent=changes.length+' vị trí khác nhau ở Phần I/II/III. '+
      'Thời gian đọc: V6 '+(data.elapsedMs??'—')+' ms, V7 '+
      (data.v7ElapsedMs??'—')+' ms (không gồm căn phiếu). '+
      'Cảnh báo: V6 '+counts[0]+', V7 '+counts[1]+'.';
    const lines=changes.map(item=>item.key+': V6='+item.old+' | V7='+item.now);
    if(!changes.length&&v6&&v7)lines.push('Không có khác biệt đáp án trên ảnh này.');
    for(const [name,candidate] of [['V6',v6],['V7',v7]])
      if(candidate?.issues?.length)
        lines.push(name+' cần kiểm tra: '+candidate.issues.map(item=>
          item.key+(item.state==='multiple'?' (tô nhiều ô)':
            item.reason?' ('+item.reason+')':'')).join('; '));
    if(failures.length)lines.push('Điều kiện ảnh/mốc: '+failures.join('; '));
    if(!v6)lines.push('Không đọc được V6 trên ảnh này.');
    if(!v7)lines.push('Không đọc được V7 trên ảnh này.');
    diffs.textContent=lines.join('\n');
    // Scoring remains possible for V7 when ONLY the V6 P3 calibration
    // failed. Bind the ORIGINAL scanned SBD/exam code against the loaded
    // room; never depend on reviewCurrent()/lastPreview (which V6 may block).
    // The lab flag stays set and the submission RPC still rejects this scan.
    if(!LabScore?.estimate){
      scores.textContent='Không tải được mô-đun điểm đối chiếu; đóng và mở lại PWA.';
      return;
    }
    const v6Estimate=LabScore.estimate(scan,v6,state.roomModel,B,S,E);
    const v7Estimate=LabScore.estimate(scan,v7,state.roomModel,B,S,E);
    const display=(out,name)=>out.ok
      ?String(out.score)+(out.requiresReview?' (còn '+out.warningCount+
        ' vị trí cần kiểm tra)':'')+(name==='V7'?' [thử nghiệm]':'')
      :'chưa tính được ('+out.reason+')';
    scores.textContent='Điểm dự kiến: V6 '+display(v6Estimate,'V6')+
      ' • V7 '+display(v7Estimate,'V7')+
      ' (chỉ so sánh, không ghi điểm).';
  }
  function showV6Comparison(){
    if(hasV7Comparison()){showV7Comparison();return;}
    const panel=q('omrV6Comparison'),scan=state.lastScan;
    if(!panel)return;
    panel.style.display=scan?._labReadOnly?'block':'none';
    if(!scan?._labReadOnly)return;
    const data=state.lastV6||{},v6=data.candidate;
    const summary=q('omrV6Summary'),scores=q('omrV6Scores'),diffs=q('omrV6Diffs');
    scores.textContent='';
    if(!v6){
      summary.textContent=data.error||'Chưa có kết quả V6';
      diffs.textContent='V5 vẫn hiển thị bình thường. Không thể lưu điểm khi thử nghiệm.';
      return;
    }
    const changes=compareV5V6(scan,v6),geometry=v6.geometry||{};
    summary.textContent=changes.length+' câu/ý khác nhau (P1/P2/P3) • V6 thêm '+
      data.elapsedMs+' ms • Mốc nội vùng: '+(geometry.status||'không rõ')+
      ' ('+(geometry.matched||0)+'/'+(geometry.total||0)+').';
    diffs.textContent=changes.length
      ?changes.map(d=>d.key+': V5='+d.old+', V6='+d.now).join('\n')
      :'Không có khác biệt Phần I/II/III trên ảnh này.';
    if(v6.issues?.length)diffs.textContent+='\nV6 cảnh báo: '+v6.issues
      .map(x=>x.key+' ('+x.reason+')').join('; ');
    if(!state.lastPreview?.ok){
      scores.textContent='Chưa có học sinh/mã đề hợp lệ để so điểm.';
      return;
    }
    try{
      // P3 answers now come from the independent V6 P3 decoder.
      // Student identity and exam code still come from the V5 camera scan.
      const alt={...scan,p1:v6.p1,p2:v6.p2,p3:v6.p3,
        invalidMarks:v6.invalidMarks,
        uncertain:(v6.issues||[]).map(x=>x.key)};
      const binding={ok:true,room:state.lastPreview.room,
        student:state.lastPreview.student,variant:state.lastPreview.variant};
      const estimate=S.previewScan(alt,binding,{allowUncertain:true});
      scores.textContent=estimate.ok
        ?'V5: '+formatScore(state.lastPreview.grade.score)+
          ' điểm • V6: '+formatScore(estimate.grade.score)+' điểm (V6 nhận dạng độc lập Phần III)'
        :'V6 chưa thể tính điểm dự kiến.';
    }catch(e){scores.textContent='Không so được điểm: '+(e.message||'lỗi');}
  }
  function scanFromForm(){
    return {
      ...(state.lastScan||{}),
      templateId:T.template.id,
      sbd:q('omrSbd').value.trim(),
      maDe:q('omrMaDe').value.trim(),
      p1:q('omrP1').value.trim().toUpperCase(),
      p2:[1,2,3,4].map(i=>q('omrP2_'+i).value.trim().toUpperCase()),
      p3:[1,2,3,4,5,6].map(i=>q('omrP3_'+i).value.trim()),
      uncertain:[...(state.lastScan?.uncertain||[])],
      uncertainDetails:[...(state.lastScan?.uncertainDetails||[])],
      invalidMarks:[...(state.lastScan?.invalidMarks||[])]
    };
  }
  function selectedStudent(){return state.roomModel?.students.find(s=>String(s.id)===String(q('omrStudent').value));}
  function reviewCurrent(){
    // Never show the previous student's evidence when a changed identity or
    // exam code temporarily fails validation.
    if(state.evidenceTimer){clearTimeout(state.evidenceTimer);state.evidenceTimer=null;}
    if(q('omrEvidenceCard'))q('omrEvidenceCard').style.display='none';
    q('omrSave').disabled=true;
    q('omrSave').hidden=!!state.lastScan?._labReadOnly;
    q('omrGradeCard').style.display='none';state.lastPreview=null;
    if(!state.roomModel||!state.lastScan)return;
    if(state.lastScan._requiresRetake){
      q('omrReviewUncertainWrap').style.display='none';
      showWarning(expectedEngineLabel(state.officialEngine)+' chưa đủ điều kiện nhận dạng: '+
        state.lastScan._retakeReason+'. Quét lại phiếu này; không thể lưu khi nhận dạng chưa tin cậy.');
      return;
    }
    if(state.lastScan.recognitionEngine!=='V7'||
      state.lastScan.captureMode!=='v7'||state.lastScan._labReadOnly!==false){
      showWarning('Chỉ nhận kết quả chụp bằng V7 chính thức. Hãy quét lại phiếu.');return;
    }
    const scan=S.enforceInvalidMarks(scanFromForm()),vr=B.resolveVariant(scan.maDe,state.roomModel.variants);
    if(scan.invalidMarks.length){
      if(q('omrP1').value!==scan.p1)q('omrP1').value=scan.p1;
      scan.p2.forEach((v,i)=>{const f=q('omrP2_'+(i+1));if(f.value!==v)f.value=v;});
    }
    if(vr.status!=='matched'){showWarning('Mã đề không tồn tại trong phòng.');return;}
    const sr=B.resolveStudent(scan.sbd,state.roomModel.studentIndex);
    if(sr.status==='invalid_format'){showWarning('SBD trên phiếu phải đủ đúng 8 chữ số.');return;}
    if(sr.status==='invalid_prefix'){showWarning('SBD phiếu phải theo quy ước 00 + mã học sinh 6 số. Hai số đầu phải là 00.');return;}
    if(sr.status==='not_found'){showWarning('Không tìm thấy mã học sinh '+(sr.studentCode||'')+' trong phòng đã chọn.');return;}
    if(sr.status==='ambiguous'){showWarning('Mã học sinh bị trùng trong danh sách phòng. Không thể tự chấm.');return;}
    const st=sr.student;
    fillStudentSelect(st.id);
    const manualSelected=selectedStudent();
    if(!manualSelected || String(manualSelected.id)!==String(st.id)){
      showWarning('SBD không khớp học sinh đang chọn. Hệ thống đã trả về đúng học sinh theo SBD.');
      fillStudentSelect(st.id);
    }
    const binding={ok:true,room:state.roomModel.room,student:st,variant:vr.variant,scan};
    let preview;
    try{preview=S.previewScan(scan,binding,{allowUncertain:true});}catch(e){showWarning('Không thể chấm thử: '+e.message);return;}
    if(!preview.ok){
      showWarning('Chưa thể chấm: '+preview.coverage.errors.join('; '));
      return;
    }
    const hasUncertain=(scan.uncertain||[]).length>0;
    const reviewed=hasUncertain && q('omrReviewUncertain').checked;
    preview.reviewedUncertain=reviewed;
    q('omrReviewUncertainWrap').style.display=hasUncertain?'block':'none';
    if(hasUncertain&&q('omrReviewDetails'))q('omrReviewDetails').open=true;
    state.lastPreview=preview;
    scheduleEvidence();
    q('omrStudentName').textContent=`${st.ma_hs} — ${st.ho_ten} (${st.lop})`;
    q('omrGradeCode').textContent=vr.variant.code;
    q('omrScore').textContent=formatScore(preview.grade.score);
    q('omrGradeEngine').textContent=scan.recognitionEngine||'V5';
    q('omrPartScores').textContent=`P1: ${formatScore(preview.grade.parts.p1)} • P2: ${formatScore(preview.grade.parts.p2)} • P3: ${formatScore(preview.grade.parts.p3)}`;
    q('omrGradeCard').style.display='block';
    if(scan.uncertain.length) showScanWarnings(scan);
    else {clearWarningHighlights();hideWarning();}
    q('omrSave').disabled=(hasUncertain && !reviewed)||!!state.lastScan?._labReadOnly||!!state.lastScan?._requiresRetake;
    if(state.lastScan?._labReadOnly)showV6Comparison();
    // Keep edits of an unsaved answer in the current browsing session only.
    if(state.lastScan?.ok&&!state.restoring){
      const snapshot=readOmrReload();
      if(snapshot?.draft){
        const ids=['omrSbd','omrMaDe','omrP1',
          ...[1,2,3,4].map(i=>'omrP2_'+i),...[1,2,3,4,5,6].map(i=>'omrP3_'+i)];
        snapshot.draft.values=Object.fromEntries(ids.map(id=>[id,q(id).value]));
        snapshot.at=Date.now();
        try{sessionStorage.setItem(OMR_RESTORE_KEY,JSON.stringify(snapshot));}catch(_){}
      }
    }
  }

  function evidenceRoomCode(){
    return String(state.roomModel?.room?.MaPhong||
      state.roomModel?.room?.ma_phong||'').trim();
  }
  function scheduleEvidence(){
    if(state.evidenceTimer)clearTimeout(state.evidenceTimer);
    // Render an in-memory preview in every V7 room; persisted evidence is written
    // once AFTER the canonical score commit, with a verified submission ID.
    if(!Evidence||!state.evidenceCtx||!state.lastPreview?.ok)return;
    state.evidenceTimer=setTimeout(renderEvidence,420);
  }
  function renderEvidence(){
    const ctx=state.evidenceCtx,preview=state.lastPreview;
    if(!ctx||!preview?.ok||!Evidence)return;
    try{
      const confirmed=JSON.stringify([preview.scan.p1,preview.scan.p2,
        preview.scan.p3,preview.variant.code,preview.student.id,
        state.evidenceCommittedSubmissionId||'draft']);
      if(ctx.signature===confirmed){
        if(state.evidenceData)q('omrEvidenceCard').style.display='block';
        return;
      }
      ctx.signature=confirmed;ctx.revision++;
      const trial=evidenceRoomCode()==='OMR_V7_TEST';
      const meta={studentName:preview.student.ho_ten,studentCode:preview.student.ma_hs,
        roomName:preview.room?.ten_dot||preview.room?.TenDot||'',
        status:trial?'test':(state.evidenceCommittedSubmissionId?'official':'preview'),
        timestamp:new Date().toISOString(),
        scanId:ctx.scanId,revision:ctx.revision,mode:trial?'test':'official'};
      const result=Evidence.compose(q('omrEvidenceCanvas'),ctx.rect,T.template,
        preview,ctx.original,meta);
      const record=Evidence.record(preview,ctx.original,result.report,meta);
      const source=q('omrTeacherCanvas');
      const capture=document.createElement('canvas');
      const scale=Math.min(1,1900/Math.max(source.width,source.height));
      capture.width=Math.max(1,Math.round(source.width*scale));
      capture.height=Math.max(1,Math.round(source.height*scale));
      capture.getContext('2d').drawImage(source,0,0,capture.width,capture.height);
      state.evidenceData={record,preview,result,capture,signature:confirmed};
      q('omrEvidenceCard').style.display='block';
      if(q('omrTechnicalDetails'))q('omrTechnicalDetails').open=false;
      if(q('omrEvidenceHistory'))q('omrEvidenceHistory').style.display='';
      if(q('omrEvidenceExport'))q('omrEvidenceExport').style.display='';
      q('omrEvidenceStatus').textContent='Đã tạo ảnh minh chứng • '+
        result.report.summary.manual+' vị trí GV sửa'+
        ' • chỉ lưu một phiếu cuối cùng sau khi bấm Xác nhận & Lưu';
      q('omrEvidenceRetry').style.display='none';
      // NEVER upload a preview or an intermediate correction to Storage.
      // Only saveCurrent(), after a successful canonical score write, can
      // persist the final annotated sheet for this student.
    }catch(e){
      q('omrEvidenceStatus').textContent='Không tạo được ảnh minh chứng: '+(e.message||e);
    }
  }
  async function saveTestEvidence(force){
    const info=state.evidenceData;
    if(!info||!EvidenceClient)return {status:'skipped'};
    if(!force&&state.evidenceSave===info.signature)return {status:'success',idempotent:true};
    if(info.signature!==state.evidenceData?.signature)return {status:'stale'};
    try{
      const result=await EvidenceClient.save(sb,
        sessionStorage.getItem('damSan_StaffToken'),{
          scanId:info.record.scan_id,revision:info.record.revision,
          submissionId:state.evidenceCommittedSubmissionId,
          preview:info.preview,original:state.evidenceCtx?.original,
          report:info.record,canvas:q('omrEvidenceCanvas'),
          capture:info.capture,
          mode:evidenceRoomCode()==='OMR_V7_TEST'?'test':'official'});
      state.evidenceSave=info.signature;
      if(state.evidenceData?.signature===info.signature)
        q('omrEvidenceStatus').textContent='Phiếu cuối cùng đã lưu an toàn • mã '+result.artifact_id;
      return {status:'success',artifact_id:result.artifact_id};
    }catch(err){
      if(state.evidenceData?.signature===info.signature){
        q('omrEvidenceStatus').textContent='Ảnh minh chứng đã tạo; chưa lưu lên Storage ('+(err.message||err)+'). Có thể tải về hoặc thử lại.';
        q('omrEvidenceRetry').style.display='inline-block';
      }
      return {status:'error',message:err?.message||String(err)};
    }
  }
  async function showEvidenceArchive(){
    const panel=q('omrEvidenceArchiveList');
    panel.style.display='block';
    panel.textContent='Đang đọc danh sách minh chứng OMR của phòng...';
    try{
      const token=sessionStorage.getItem('damSan_StaffToken');
      const list=await EvidenceClient.list(sb,token,state.roomModel.room.id);
      if(!list.length){panel.textContent='Chưa có minh chứng đã lưu.';return;}
      panel.textContent='';
      for(const item of list.slice(0,100)){
        const row=document.createElement('div'),btn=document.createElement('button');
        btn.type='button';btn.className='omr-light';
        btn.textContent=(item.student_code||'Chưa rõ SBD')+' — '+(item.student_name||'Chưa xác định')+
          ' • Mã đề '+(item.exam_code||'?')+' • '+formatScore(item.preview_score)+
          ' • '+new Date(item.created_at).toLocaleString('vi-VN');
        btn.onclick=async()=>{
          btn.disabled=true;
          try{
            const signed=await EvidenceClient.signed(sb,token,item.id);
            const a=document.createElement('a');
            a.href=signed.url;a.target='_blank';a.rel='noopener noreferrer';
            a.textContent='Mở phiếu đã đánh dấu';row.appendChild(a);
          }catch(e){row.append(' Không mở được: '+(e.message||e));}
          finally{btn.disabled=false;}
        };
        row.appendChild(btn);panel.appendChild(row);
      }
    }catch(e){panel.textContent='Không đọc được minh chứng: '+(e.message||e);}
  }
  async function exportEvidenceRoom(){
    const status=q('omrEvidenceStatus'),btn=q('omrEvidenceExport'),link=q('omrEvidenceReady');
    if(!EvidenceExport||!EvidenceClient||!state.roomModel?.room?.id){
      status.textContent='Chưa thể xuất minh chứng OMR: chưa chọn phòng hoặc thiếu mô-đun.';return;
    }
    if(btn.disabled)return;
    btn.disabled=true;btn.setAttribute('aria-busy','true');
    btn.textContent='Đang tạo Excel + phiếu PDF...';
    EvidenceClient.clearPreparedDownload(link);
    status.textContent='Đang đọc danh sách minh chứng của phòng...';
    try{
      const token=sessionStorage.getItem('damSan_StaffToken'),roomId=state.roomModel.room.id;
      const entries=await EvidenceClient.list(sb,token,roomId);
      if(!entries.length)throw Error('Phòng chưa có minh chứng đã lưu');
      if(state.evidenceExportRoom!==roomId){
        state.evidenceExportRoom=roomId;state.evidenceExportNext=0;
      }
      const start=state.evidenceExportNext>=entries.length?0:state.evidenceExportNext;
      const slice=entries.slice(start,start+20);
      const output=await EvidenceExport.exportBatch(slice,EvidenceClient,sb,token,{
        part:Math.floor(start/20)+1,download:false,
        status:message=>{status.textContent=message;}
      });
      const prepared=EvidenceClient.prepareDownload(output.archive,output.filename,link);
      state.evidenceExportNext=start+slice.length;
      const left=entries.length-state.evidenceExportNext;
      status.textContent='Đã chuẩn bị '+output.records+' phiếu ('+
        (prepared.bytes/1024/1024).toFixed(2)+' MB). Excel nằm trong ZIP. '+
        'Nếu điện thoại chưa tải tự động, chạm nút xanh “Tải tệp” bên dưới.'+
        (left>0?' Còn '+left+' phiếu chưa xuất.':'');
      btn.textContent=left>0?'Tạo ZIP tiếp ('+left+' phiếu)':'Xuất Excel + ZIP';
      // Best effort for desktop browsers. The visible anchor is the reliable
      // mobile fallback and preserves a real user gesture on the second tap.
      try{link.click();}catch(_){/* manual anchor stays available */}
      link.scrollIntoView?.({block:'center',behavior:'smooth'});
    }catch(e){
      status.textContent='Xuất Excel + ZIP chưa thành công: '+(e?.message||String(e))+
        '. Chưa thay đổi điểm hoặc ảnh đã lưu.';
      status.scrollIntoView?.({block:'center',behavior:'smooth'});
    }finally{
      btn.disabled=false;btn.removeAttribute('aria-busy');
      if(btn.textContent==='Đang tạo Excel + ZIP...')btn.textContent='Xuất Excel + ZIP';
    }
  }
  async function saveCurrent(){
    if(state.labEnabled||state.lastScan?._labReadOnly){
      showWarning('Đang đối chiếu '+(hasV7Comparison()?'V6/V7':'V5/V6')+
        ': không lưu điểm. Hãy bỏ đối chiếu và quét lại.');
      return;
    }
    if(state.lastScan?._requiresRetake){
      showWarning(expectedEngineLabel(state.officialEngine)+' cần quét lại: '+state.lastScan._retakeReason);return;
    }
    if(!state.lastPreview)return;
    // Revalidate text fields before the irreversible submission step.
    reviewCurrent();
    if(!state.lastPreview)return;
    const expectedEngine=expectedEngineLabel(state.officialEngine);
    if(state.lastScan?.recognitionEngine!==expectedEngine||
       state.lastPreview.scan?.recognitionEngine!==expectedEngine||
       state.lastScan?.captureMode!=='v7'||
       state.lastPreview.scan?.captureMode!=='v7'){
      showWarning('Đã thay đổi thuật toán chấm; cần quét lại để bảo đảm kết quả.');return;
    }
    const st=state.lastPreview.student;
    if(state.saved.has(String(st.id))){showWarning('Học sinh này đã được lưu trong phiên chấm hiện tại.');return;}
    if(!confirm(`Lưu điểm ${formatScore(state.lastPreview.grade.score)} cho ${st.ho_ten} — mã đề ${state.lastPreview.variant.code}?`))return;
    const btn=q('omrSave'),old=btn.textContent;btn.disabled=true;btn.textContent='Đang lưu...';
    try{
      const data=await W.submitConfirmed(state.lastPreview,staffRpc);
      if(data.status==='conflict'){showWarning(data.message||'Học sinh đã có bài/điểm. Không ghi đè.');return;}
      if(data.status!=='success') throw new Error(data.message||'Không lưu được kết quả.');
      state.saved.add(String(st.id));updateProgress();
      q('omrGradeCard').classList.add('omr-ok');
      // Every V7 room now persists the FINAL artifact after the canonical
      // score commit; the submission ID binds OFFICIAL evidence to its receipt.
      // Keep the current scan for an explicit retry if Storage is unavailable.
      state.evidenceCommittedSubmissionId=data.submission_id||null;
      if(state.evidenceTimer){clearTimeout(state.evidenceTimer);state.evidenceTimer=null;}
      renderEvidence();
      const savedEvidence=await saveTestEvidence(true);
      if(savedEvidence?.status!=='success'){
        showWarning('Điểm của '+st.ho_ten+' đã lưu thành công ('+
          formatScore(data.score)+'). Ảnh phiếu chưa lưu; nhấn Lưu lại minh chứng. KHÔNG quét lại học sinh này và không đóng màn hình.');
        return;
      }
      alert(`Đã lưu: ${st.ho_ten} — ${formatScore(data.score)} điểm.`);
      resetScan();
      if(!root.DamSanTeacherNav?.resumeCamera?.())await openCamera({navigation:'replace'});
    }catch(e){showWarning('Lưu thất bại: '+e.message);}
    finally{btn.textContent=old;btn.disabled=!state.lastPreview;}
  }
  function updateProgress(){
    const total=state.roomModel?.students.length||0;
    q('omrProgress').textContent=`${state.saved.size} phiếu đã lưu trong phiên${total?' / '+total+' học sinh':''}`;
  }
  function resetScan(){
    closePhotoDetail();
    state.lastScan=null;state.lastPreview=null;state.lastV6=null;
    state.evidenceCtx=null;state.evidenceData=null;state.evidenceSave=null;
    state.evidenceCommittedSubmissionId=null;
    if(state.evidenceTimer){clearTimeout(state.evidenceTimer);state.evidenceTimer=null;}
    if(q('omrEvidenceCard'))q('omrEvidenceCard').style.display='none';
    if(q('omrTechnicalDetails'))q('omrTechnicalDetails').open=true;
    if(q('omrReviewDetails'))q('omrReviewDetails').open=false;
    if(q('omrEvidenceToolsDetails'))q('omrEvidenceToolsDetails').open=false;
    if(q('omrEvidenceArchiveList'))q('omrEvidenceArchiveList').style.display='none';
    if(q('omrV7OverlayPanel'))q('omrV7OverlayPanel').style.display='none';
    if(q('omrV6Comparison'))q('omrV6Comparison').style.display='none';
    if(q('omrEngineResult'))q('omrEngineResult').textContent='';
    if(q('omrSave'))q('omrSave').hidden=false;
    if(q('omrScanArea'))q('omrScanArea').style.display='none';
    if(q('omrGradeCard'))q('omrGradeCard').style.display='none';
    if(q('omrSave'))q('omrSave').disabled=true;
    if(q('omrReviewUncertain'))q('omrReviewUncertain').checked=false;
    if(q('omrReviewUncertainWrap'))q('omrReviewUncertainWrap').style.display='none';
    if(!state.restoring)clearOmrDraft();
    clearWarningHighlights();hideWarning();
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function warningFieldId(key){
    if(/^P1\./.test(key))return 'omrP1';
    const p2=key.match(/^P2\.(\d)/);if(p2)return 'omrP2_'+p2[1];
    const p3=key.match(/^P3\.(\d)/);if(p3)return 'omrP3_'+p3[1];
    if(/^SBD\./.test(key))return 'omrSbd';
    if(/^MADE\./.test(key))return 'omrMaDe';
    return null;
  }
  function clearWarningHighlights(){
    document.querySelectorAll('#omrTeacherOverlay .omr-alert-field').forEach(el=>el.classList.remove('omr-alert-field'));
  }
  function showScanWarnings(scan){
    const el=q('omrWarning');if(!el)return;
    clearWarningHighlights();
    const details=Array.isArray(scan?.uncertainDetails)&&scan.uncertainDetails.length
      ? scan.uncertainDetails
      : (scan?.uncertain||[]).map(key=>({key,label:key,reason:'Cần kiểm tra lại vị trí này'}));
    details.forEach(d=>{
      const id=warningFieldId(d.key||'');const field=id?q(id):null;
      field?.parentElement?.classList.add('omr-alert-field');
    });
    el.style.display='block';
    const invalid=details.filter(d=>d.invalidMultiple).length;
    el.innerHTML='<b>Có '+details.length+' vị trí cần kiểm tra</b>'+
      (invalid?' — '+invalid+' câu/ý tô nhiều ô đã bị tính sai, không sửa bằng nhập tay.':'')+
      ':<ul class="omr-warning-list">'+
      details.map(d=>'<li><b>'+escapeHtml(d.label||d.key)+'</b>: '+escapeHtml(d.reason||'Cần kiểm tra lại')+'</li>').join('')+
      '</ul><div class="omr-muted" style="margin-top:8px">Các ô liên quan đã được đánh dấu màu vàng bên dưới.</div>';
  }
  function showWarning(msg){
    const el=q('omrWarning');if(!el)return;
    clearWarningHighlights();el.style.display='block';el.textContent=msg;
    if(!state.lastPreview&&state.lastScan&&q('omrReviewDetails'))
      q('omrReviewDetails').open=true;
  }
  function hideWarning(){const el=q('omrWarning');if(el){el.style.display='none';el.textContent='';}}

  root.DamSanOmrTeacher={open,close,isOpen,restoreNavigationStage,loadRoom,reviewCurrent,
    persistForReload:()=>{if(isOpen())rememberOmr();},_state:state,_photoCropBounds:photoCropBounds,_renderReviewPhoto:renderReviewPhoto,_compareV5V6:compareV5V6};
})(window);
