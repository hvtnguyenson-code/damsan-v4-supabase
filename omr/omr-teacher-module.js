(function(root){
  'use strict';
  const T=root.DamSanOmrTemplate, O=root.DamSanOmr, B=root.DamSanOmrRoomBinding, S=root.DamSanOmrScoring, W=root.DamSanOmrResultWrite;
  if(!T||!O||!B||!S||!W){console.error('OMR modules missing');return;}

  const state={rooms:[],roomModel:null,stream:null,lastScan:null,lastPreview:null,saved:new Set(),facing:'environment',autoScanEnabled:true,autoScanTimer:null,autoScanBusy:false,autoScanStable:0,autoScanLastCorners:null,lastCaptureMode:'manual',photoZoom:1.65,cameraRequestSerial:0};
  const q=id=>document.getElementById(id);
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
      .omr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}.omr-answer input{font-family:ui-monospace,monospace}
      .omr-score{font-size:30px;font-weight:800;color:#0f766e}.omr-progress{font-weight:700;color:#334155}
      @media(max-width:700px){#omrTeacherOverlay{padding:0}.omr-shell{border-radius:0;max-height:100dvh;height:100dvh;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}.omr-body{padding:12px}.omr-field{min-width:145px}}
    `;
    document.head.appendChild(style);
    const wrap=document.createElement('div');
    wrap.innerHTML=`
    <div id="omrTeacherOverlay"><div class="omr-shell">
      <div class="omr-head"><h2>📷 Chấm phiếu trắc nghiệm</h2><button class="omr-close" id="omrClose">Đóng</button></div>
      <div class="omr-body">
        <div class="omr-card">
          <div class="omr-row">
            <div class="omr-field"><label>Phòng thi</label><select id="omrRoomSelect"></select></div>
            <div class="omr-field"><div class="omr-muted">Phiếu chuẩn</div><b>BGD 2025 • 18–4–6</b></div>
            <div class="omr-field"><div class="omr-muted">Tiến độ phiên này</div><div id="omrProgress" class="omr-progress">0 phiếu đã lưu</div></div>
          </div>
          <div id="omrRoomSummary" class="omr-muted" style="margin-top:8px">Chọn phòng để bắt đầu.</div>
        </div>
        <div class="omr-card">
          <div class="omr-actions">
            <button class="omr-primary" id="omrOpenCamera">Mở camera</button>
            <label class="omr-light" style="display:inline-block;padding:10px 14px;border-radius:8px;font-weight:700;cursor:pointer">Chọn ảnh<input id="omrPickFile" type="file" accept="image/*" style="display:none"></label>
          </div>
          <div class="omr-muted" style="margin-top:8px">Camera chỉ đọc phiếu trên máy. Điểm chỉ được ghi sau khi giáo viên bấm Xác nhận & Lưu.</div>
        </div>
        <div id="omrScanArea" style="display:none">
          <div class="omr-card">
            <div class="omr-photo-head"><span class="omr-muted" id="omrPhotoHint">Ảnh phiếu sau khi chụp</span><button type="button" id="omrPhotoExpand">Xem chi tiết</button></div>
            <canvas id="omrTeacherCanvas" aria-label="Ảnh phiếu để đối chiếu kết quả nhận dạng"></canvas>
          </div>
          <div id="omrWarning" class="omr-card omr-warn" style="display:none"></div>
          <label id="omrReviewUncertainWrap" class="omr-card omr-warn" style="display:none;cursor:pointer">
            <input id="omrReviewUncertain" type="checkbox" style="width:auto;margin-right:8px"> Tôi đã kiểm tra đúng các vị trí được đánh dấu và xác nhận dữ liệu đang hiển thị là đúng.
          </label>
          <div class="omr-card">
            <div class="omr-row">
              <div class="omr-field"><label>SBD / mã học sinh</label><input id="omrSbd" type="text"></div>
              <div class="omr-field"><label>Mã đề</label><input id="omrMaDe" type="text"></div>
              <div class="omr-field"><label>Học sinh</label><select id="omrStudent"></select></div>
            </div>
          </div>
          <details class="omr-card" open><summary><b>Đáp án đọc được</b> — có thể sửa trước khi chấm</summary>
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
          </details>
          <div class="omr-card omr-ok" id="omrGradeCard" style="display:none">
            <div id="omrStudentName" style="font-weight:800"></div>
            <div>Mã đề: <b id="omrGradeCode"></b></div>
            <div>Điểm dự kiến: <span class="omr-score" id="omrScore">-</span></div>
            <div id="omrPartScores" class="omr-muted"></div>
          </div>
          <div class="omr-actions">
            <button class="omr-light" id="omrRecheck">Kiểm tra lại</button>
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
    q('omrNext').onclick=()=>{
      resetScan();
      if(!root.DamSanTeacherNav?.resumeCamera?.())openCamera({navigation:'replace'});
    };
    q('omrSave').onclick=saveCurrent;
    q('omrReviewUncertain').onchange=reviewCurrent;
    ['omrSbd','omrMaDe','omrStudent','omrP1','omrP2_1','omrP2_2','omrP2_3','omrP2_4','omrP3_1','omrP3_2','omrP3_3','omrP3_4','omrP3_5','omrP3_6'].forEach(id=>q(id).addEventListener('change',reviewCurrent));
  }

  async function open(){
    ensureUi();
    q('omrTeacherOverlay').classList.add('show');
    q('omrRoomSelect').innerHTML='<option value="">Đang tải phòng...</option>';
    try{
      const rooms=(await rpcLayDanhSachPhongThi()).map(normalizeRoom);
      state.rooms=rooms;
      q('omrRoomSelect').innerHTML='<option value="">— Chọn phòng thi —</option>'+rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.MaPhong)}${r.DoiTuong&&r.DoiTuong!=='TatCa'?' — '+esc(r.DoiTuong):''}</option>`).join('');
      if(rooms.length===1){q('omrRoomSelect').value=rooms[0].id;await loadRoom(rooms[0].id);}
    }catch(e){q('omrRoomSummary').textContent='Không tải được danh sách phòng: '+e.message;}
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
  function openPhotoDetail({navigation='push'}={}){
    const src=q('omrTeacherCanvas'),viewer=q('omrPhotoLightbox');
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
    try{
      const scan=O.analyzeImageData(ctx.getImageData(0,0,c.width,c.height),T.template);
      if(!scan.ok){
        q('omrScanArea').style.display='block';
        const detail=scan.markerMatches!==undefined?` (${scan.markerMatches} mốc khớp)`:'';
        showWarning((scan.error||'Không đọc được phiếu')+detail);
        if(state.lastCaptureMode==='auto')setTimeout(()=>openCamera({navigation:'none'}).catch(()=>{}),700);
        return;
      }
      scan.templateId=T.template.id;state.lastScan=scan;
      // Presentation only: crop around validated four-corner markers after
      // recognition. Never send the cropped image back to the OMR engine.
      let cropped=false;
      try{cropped=renderReviewPhoto(c,scan.markerCorners);}catch(e){console.warn('OMR preview crop:',e);}
      q('omrPhotoHint').textContent=cropped?'Phiếu đã phóng vừa khung theo 4 mốc góc • Chạm để xem lớn':'Ảnh gốc • Chạm để xem lớn';
      q('omrScanArea').style.display='block';
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
      root.DamSanTeacherNav?.enterOmrStage?.('result');
    }catch(e){showWarning('Lỗi đọc ảnh: '+e.message);}
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
    q('omrSave').disabled=true;q('omrGradeCard').style.display='none';state.lastPreview=null;
    if(!state.roomModel||!state.lastScan)return;
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
    state.lastPreview=preview;
    q('omrStudentName').textContent=`${st.ma_hs} — ${st.ho_ten} (${st.lop})`;
    q('omrGradeCode').textContent=vr.variant.code;
    q('omrScore').textContent=String(preview.grade.score);
    q('omrPartScores').textContent=`P1: ${preview.grade.parts.p1} • P2: ${preview.grade.parts.p2} • P3: ${preview.grade.parts.p3}`;
    q('omrGradeCard').style.display='block';
    if(scan.uncertain.length) showScanWarnings(scan);
    else {clearWarningHighlights();hideWarning();}
    q('omrSave').disabled=hasUncertain && !reviewed;
  }

  async function saveCurrent(){
    if(!state.lastPreview)return;
    const st=state.lastPreview.student;
    if(state.saved.has(String(st.id))){showWarning('Học sinh này đã được lưu trong phiên chấm hiện tại.');return;}
    if(!confirm(`Lưu điểm ${state.lastPreview.grade.score} cho ${st.ho_ten} — mã đề ${state.lastPreview.variant.code}?`))return;
    const btn=q('omrSave'),old=btn.textContent;btn.disabled=true;btn.textContent='Đang lưu...';
    try{
      const data=await W.submitConfirmed(state.lastPreview,staffRpc);
      if(data.status==='conflict'){showWarning(data.message||'Học sinh đã có bài/điểm. Không ghi đè.');return;}
      if(data.status!=='success') throw new Error(data.message||'Không lưu được kết quả.');
      state.saved.add(String(st.id));updateProgress();
      q('omrGradeCard').classList.add('omr-ok');
      alert(`Đã lưu: ${st.ho_ten} — ${data.score} điểm.`);
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
    state.lastScan=null;state.lastPreview=null;
    if(q('omrScanArea'))q('omrScanArea').style.display='none';
    if(q('omrGradeCard'))q('omrGradeCard').style.display='none';
    if(q('omrSave'))q('omrSave').disabled=true;
    if(q('omrReviewUncertain'))q('omrReviewUncertain').checked=false;
    if(q('omrReviewUncertainWrap'))q('omrReviewUncertainWrap').style.display='none';
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
  function showWarning(msg){const el=q('omrWarning');if(!el)return;clearWarningHighlights();el.style.display='block';el.textContent=msg;}
  function hideWarning(){const el=q('omrWarning');if(el){el.style.display='none';el.textContent='';}}

  root.DamSanOmrTeacher={open,close,isOpen,restoreNavigationStage,loadRoom,reviewCurrent,_state:state,_photoCropBounds:photoCropBounds,_renderReviewPhoto:renderReviewPhoto};
})(window);
