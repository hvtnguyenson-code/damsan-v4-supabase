// 042 — Long-book scanner -> lesson chunks -> assembler.
// This browser layer never touches room/exam data; it only talks to the chunked knowledge Edge service.
(() => {
  'use strict';

  const ENDPOINT = `${KNOWLEDGE_SUPABASE_URL}/functions/v1/knowledge-chunked-normalization`;
  const MAX_UPLOAD_BYTES = 1024 * 1024;
  let documents = [];
  let subjects = [];
  let activePlan = null;
  let activeChunks = [];
  let preparedDocumentId = '';
  let preparedSubjectId = '';
  let preparedGrade = 0;
  let preparedChunkId = '';

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function session() {
    return typeof knowledgeSession === 'function' ? knowledgeSession() : null;
  }

  function setStatus(message, kind = '') {
    const el = document.getElementById('chunkedStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = `chunked-status${kind ? ` ${kind}` : ''}`;
  }

  function setBusy(busy) {
    for (const id of ['btnChunkedStructure', 'btnChunkedPlanImport', 'btnChunkedPrompt', 'btnChunkedImport', 'btnChunkedAssemble', 'btnChunkedRefresh']) {
      const el = document.getElementById(id);
      if (el) el.disabled = busy;
    }
  }

  async function gateway(payload) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KNOWLEDGE_SUPABASE_KEY },
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok || !data || data.status !== 'success') {
      const error = new Error(data?.detail || data?.message || `Chunked normalization trả mã ${response.status}.`);
      error.code = data?.code || 'chunked_normalization_failed';
      throw error;
    }
    return data;
  }

  function selectedDocument() {
    const id = document.getElementById('chunkedDocument')?.value || '';
    const doc = documents.find((item) => item.id === id);
    if (!doc) throw new Error('Hãy chọn tài liệu dài cần chuẩn hóa.');
    return doc;
  }

  function selectedSubject() {
    const id = document.getElementById('chunkedSubject')?.value || '';
    const subject = subjects.find((item) => item.id === id);
    if (!subject) throw new Error('Hãy chọn môn học.');
    return subject;
  }

  function selectedGrade() {
    const grade = Number(document.getElementById('chunkedGrade')?.value || 0);
    if (![10, 11, 12].includes(grade)) throw new Error('Hãy chọn khối 10, 11 hoặc 12.');
    return grade;
  }

  function basePayload(action) {
    const active = session();
    if (!active) throw new Error('Phiên giáo viên không còn hợp lệ.');
    const doc = selectedDocument();
    const subject = selectedSubject();
    const grade = selectedGrade();
    return {
      action,
      staff_token: active.token,
      ma_gv: active.profile.ma_gv,
      document_id: doc.id,
      mon_id: subject.id,
      subject_name: subject.ten_mon,
      grade,
      ai_provider: document.getElementById('chunkedProvider')?.value || 'CHATGPT_WEB',
      ai_model: document.getElementById('chunkedModel')?.value.trim() || '',
      doc,
      subject
    };
  }

  async function lockIdentity(payload) {
    const identity = await knowledgeSb.rpc('rpc_knowledge_set_subject_grade', {
      p_staff_token: payload.staff_token,
      p_ma_gv: payload.ma_gv,
      p_document_id: payload.document_id,
      p_mon_id: payload.mon_id,
      p_grade: payload.grade
    });
    if (identity.error) throw identity.error;
    if (!identity.data || identity.data.status !== 'success') throw new Error(identity.data?.code || 'subject_binding_failed');
    if (identity.data.mon_id !== payload.mon_id || identity.data.subject_name !== payload.subject_name) throw new Error('Môn server xác nhận không khớp lựa chọn.');

    const authority = await knowledgeSb.rpc('rpc_knowledge_set_authority_binding', {
      p_staff_token: payload.staff_token,
      p_ma_gv: payload.ma_gv,
      p_document_id: payload.document_id,
      p_grade: payload.grade,
      p_source_role: 'KNOWLEDGE_SOURCE',
      p_profile_id: null,
      p_authority_code: null
    });
    if (authority.error) throw authority.error;
    if (!authority.data || authority.data.status !== 'success') throw new Error(authority.data?.code || 'knowledge_role_binding_failed');
  }

  async function loadCatalog() {
    const active = session();
    if (!active) return setStatus('Phiên giáo viên không còn hợp lệ.', 'error');
    setBusy(true);
    try {
      const [libraryResult, subjectResult] = await Promise.all([
        knowledgeSb.rpc('rpc_knowledge_library_read', { p_staff_token: active.token, p_ma_gv: active.profile.ma_gv }),
        knowledgeSb.rpc('rpc_knowledge_subject_catalog', { p_staff_token: active.token, p_ma_gv: active.profile.ma_gv })
      ]);
      if (libraryResult.error) throw libraryResult.error;
      if (subjectResult.error) throw subjectResult.error;
      if (!libraryResult.data || libraryResult.data.status !== 'success') throw new Error(libraryResult.data?.message || 'Không tải được Kho tri thức.');
      if (!subjectResult.data || subjectResult.data.status !== 'success') throw new Error(subjectResult.data?.code || 'Không tải được danh sách môn.');
      documents = (Array.isArray(libraryResult.data.documents) ? libraryResult.data.documents : []).filter((doc) => doc?.id && (doc.source_role || 'KNOWLEDGE_SOURCE') === 'KNOWLEDGE_SOURCE');
      subjects = (Array.isArray(subjectResult.data.subjects) ? subjectResult.data.subjects : []).filter((subject) => subject?.id && subject?.ten_mon);

      const docSelect = document.getElementById('chunkedDocument');
      const subjectSelect = document.getElementById('chunkedSubject');
      const oldDoc = docSelect?.value || '';
      const oldSubject = subjectSelect?.value || '';
      if (docSelect) {
        docSelect.innerHTML = '<option value="">-- Chọn tài liệu dài --</option>' + documents.map((doc) => {
          const pages = doc.page_count ? ` · ${doc.page_count} trang` : '';
          const grade = doc.grade ? ` · khối ${doc.grade}` : '';
          return `<option value="${esc(doc.id)}">${esc(doc.title || doc.original_filename)}${esc(pages + grade)}</option>`;
        }).join('');
        if (documents.some((doc) => doc.id === oldDoc)) docSelect.value = oldDoc;
      }
      if (subjectSelect) {
        subjectSelect.innerHTML = '<option value="">-- Chọn môn --</option>' + subjects.map((subject) => `<option value="${esc(subject.id)}">${esc(subject.ten_mon)}</option>`).join('');
        if (subjects.some((subject) => subject.id === oldSubject)) subjectSelect.value = oldSubject;
      }
      applyDocumentMetadata();
      setStatus(`Đã nạp ${documents.length} nguồn kiến thức. Sách dài nên dùng quy trình Scanner → Chunk → Assembler.`, 'info');
      await loadPlan();
    } catch (error) {
      setStatus(error.message || 'Không tải được dữ liệu.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function applyDocumentMetadata() {
    const doc = documents.find((item) => item.id === (document.getElementById('chunkedDocument')?.value || ''));
    if (!doc) return;
    const subjectSelect = document.getElementById('chunkedSubject');
    if (subjectSelect && doc.mon_id && subjects.some((subject) => subject.id === doc.mon_id)) subjectSelect.value = doc.mon_id;
    if (doc.grade && [10, 11, 12].includes(Number(doc.grade))) document.getElementById('chunkedGrade').value = String(doc.grade);
  }

  function resetPrepared() {
    preparedDocumentId = '';
    preparedSubjectId = '';
    preparedGrade = 0;
    preparedChunkId = '';
    const scanner = document.getElementById('chunkedStructurePrompt');
    const chunk = document.getElementById('chunkedPrompt');
    if (scanner) scanner.value = '';
    if (chunk) chunk.value = '';
  }

  async function prepareStructurePrompt() {
    try {
      const payload = basePayload('prepare_structure_prompt');
      setBusy(true);
      setStatus('Đang khóa môn/khối và dựng prompt quét cấu trúc...', 'info');
      await lockIdentity(payload);
      const result = await gateway(payload);
      document.getElementById('chunkedStructurePrompt').value = result.prompt || '';
      preparedDocumentId = payload.document_id;
      preparedSubjectId = payload.mon_id;
      preparedGrade = payload.grade;
      setStatus(`Prompt Scanner đã sẵn sàng: ${payload.subject_name} · khối ${payload.grade} · ${payload.doc.page_count || '?'} trang.`, 'ok');
    } catch (error) {
      setStatus(error.message || 'Không tạo được prompt Scanner.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyText(id, label) {
    const text = document.getElementById(id)?.value || '';
    if (!text) return setStatus(`Chưa có ${label} để sao chép.`, 'error');
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Đã sao chép ${label}.`, 'ok');
    } catch {
      const area = document.getElementById(id);
      area?.focus();
      area?.select();
      document.execCommand('copy');
      setStatus(`Đã sao chép ${label}.`, 'ok');
    }
  }

  async function readFile(inputId) {
    const file = document.getElementById(inputId)?.files?.[0];
    if (!file) throw new Error('Hãy chọn file JSONL/NDJSON do AI web xuất ra.');
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new Error('File rỗng hoặc vượt giới hạn 1 MiB cho một bước chunk/plan.');
    if (!/\.(jsonl|ndjson|json)$/i.test(file.name)) throw new Error('Chỉ nhận file .jsonl, .ndjson hoặc .json dạng JSONL.');
    return { file, text: await file.text() };
  }

  async function importPlan() {
    try {
      const payload = basePayload('import_structure_plan');
      if (preparedDocumentId && (payload.document_id !== preparedDocumentId || payload.mon_id !== preparedSubjectId || payload.grade !== preparedGrade)) throw new Error('Tài liệu/môn/khối đã thay đổi sau khi tạo prompt Scanner. Hãy tạo lại prompt.');
      const { file, text } = await readFile('chunkedPlanFile');
      setBusy(true);
      setStatus(`Đang kiểm định kế hoạch ${file.name}...`, 'info');
      await lockIdentity(payload);
      const result = await gateway({ ...payload, payload_text: text });
      setStatus(`Kế hoạch hợp lệ: ${result.lesson_count} bài · ${result.lesson_chunk_count} chunk bài học · ${result.unresolved_range_count} khoảng chưa xác định.`, result.unresolved_range_count ? 'warn' : 'ok');
      await loadPlan();
    } catch (error) {
      setStatus(error.message || 'Không nhập được kế hoạch.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadPlan() {
    const active = session();
    const documentId = document.getElementById('chunkedDocument')?.value || '';
    if (!active || !documentId) {
      activePlan = null;
      activeChunks = [];
      renderPlan();
      return;
    }
    try {
      const result = await gateway({ action: 'read_plan', staff_token: active.token, ma_gv: active.profile.ma_gv, document_id: documentId });
      activePlan = result.plan || null;
      activeChunks = Array.isArray(result.chunks) ? result.chunks : [];
      renderPlan();
    } catch (error) {
      activePlan = null;
      activeChunks = [];
      renderPlan();
      setStatus(error.message || 'Không đọc được trạng thái kế hoạch.', 'error');
    }
  }

  function badge(status) {
    const map = {
      PENDING: 'Chờ xử lý',
      IMPORTED: 'Đã nhập',
      NEEDS_REVIEW: 'Cần rà soát',
      INCOMPLETE: 'Thiếu trang',
      ACCOUNTED: 'Đã tính coverage',
      ASSEMBLED: 'Đã ghép'
    };
    return `<span class="chunked-badge ${esc(status)}">${esc(map[status] || status || '—')}</span>`;
  }

  function renderPlan() {
    const summary = document.getElementById('chunkedPlanSummary');
    const list = document.getElementById('chunkedList');
    const select = document.getElementById('chunkedChunkSelect');
    const assemble = document.getElementById('btnChunkedAssemble');
    if (!summary || !list || !select || !assemble) return;
    if (!activePlan) {
      summary.innerHTML = '<strong>Chưa có kế hoạch cấu trúc.</strong> Hãy tạo prompt Scanner, đưa PDF + prompt cho AI web rồi nhập file kế hoạch.';
      list.innerHTML = '';
      select.innerHTML = '<option value="">-- Chưa có chunk --</option>';
      assemble.disabled = true;
      return;
    }
    const lessonChunks = activeChunks.filter((chunk) => chunk.chunk_type === 'LESSON');
    const done = lessonChunks.filter((chunk) => ['IMPORTED', 'NEEDS_REVIEW'].includes(chunk.status)).length;
    const incomplete = lessonChunks.filter((chunk) => chunk.status === 'INCOMPLETE').length;
    const unresolved = activeChunks.filter((chunk) => chunk.chunk_type === 'UNRESOLVED').length;
    const lessons = Array.isArray(activePlan.plan_json?.lessons) ? activePlan.plan_json.lessons.length : 0;
    summary.innerHTML = `<strong>${esc(activePlan.plan_status)}</strong> · ${lessons} bài · ${done}/${lessonChunks.length} chunk hoàn tất${incomplete ? ` · ${incomplete} chunk thiếu trang` : ''}${unresolved ? ` · ${unresolved} khoảng chưa xác định` : ''}.`;
    list.innerHTML = activeChunks.map((chunk) => {
      const name = chunk.chunk_type === 'LESSON'
        ? `${chunk.lesson_code} · ${chunk.lesson_title}${chunk.part_count > 1 ? ` · phần ${chunk.part_no}/${chunk.part_count}` : ''}`
        : `${chunk.chunk_type} · ${chunk.range_label || ''}`;
      return `<div class="chunked-row"><div><strong>${esc(name)}</strong><small>Trang vật lý ${chunk.page_start}–${chunk.page_end}</small></div>${badge(chunk.status)}</div>`;
    }).join('');

    const old = select.value;
    select.innerHTML = '<option value="">-- Chọn chunk bài học --</option>' + lessonChunks.map((chunk) => `<option value="${esc(chunk.id)}">${esc(chunk.lesson_code)} · trang ${chunk.page_start}–${chunk.page_end} · ${esc(chunk.status)}</option>`).join('');
    if (lessonChunks.some((chunk) => chunk.id === old)) select.value = old;
    else {
      const next = lessonChunks.find((chunk) => !['IMPORTED', 'NEEDS_REVIEW'].includes(chunk.status)) || lessonChunks[0];
      if (next) select.value = next.id;
    }
    assemble.disabled = Boolean(unresolved || incomplete || done !== lessonChunks.length || activePlan.plan_status === 'ASSEMBLED');
  }

  async function prepareChunkPrompt() {
    try {
      if (!activePlan) throw new Error('Chưa có kế hoạch cấu trúc.');
      const active = session();
      if (!active) throw new Error('Phiên giáo viên không còn hợp lệ.');
      const chunkId = document.getElementById('chunkedChunkSelect')?.value || '';
      if (!chunkId) throw new Error('Hãy chọn một chunk bài học.');
      setBusy(true);
      setStatus('Đang dựng prompt cho đúng phạm vi chunk...', 'info');
      const result = await gateway({ action: 'prepare_chunk_prompt', staff_token: active.token, ma_gv: active.profile.ma_gv, plan_id: activePlan.id, chunk_id: chunkId });
      document.getElementById('chunkedPrompt').value = result.prompt || '';
      preparedChunkId = chunkId;
      setStatus(`Prompt chunk ${result.chunk.chunk_key} sẵn sàng · ${result.chunk.lesson_title} · trang ${result.chunk.page_start}–${result.chunk.page_end}.`, 'ok');
    } catch (error) {
      setStatus(error.message || 'Không tạo được prompt chunk.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function importChunk() {
    try {
      if (!activePlan) throw new Error('Chưa có kế hoạch cấu trúc.');
      const active = session();
      if (!active) throw new Error('Phiên giáo viên không còn hợp lệ.');
      const chunkId = document.getElementById('chunkedChunkSelect')?.value || '';
      if (!chunkId) throw new Error('Hãy chọn chunk tương ứng với file JSONL.');
      if (preparedChunkId && preparedChunkId !== chunkId) throw new Error('Chunk đã thay đổi sau khi tạo prompt. Hãy tạo lại prompt chunk trước khi nhập.');
      const { file, text } = await readFile('chunkedFile');
      setBusy(true);
      setStatus(`Đang kiểm định ${file.name}...`, 'info');
      const result = await gateway({
        action: 'import_chunk_jsonl',
        staff_token: active.token,
        ma_gv: active.profile.ma_gv,
        plan_id: activePlan.id,
        chunk_id: chunkId,
        payload_text: text,
        ai_provider: document.getElementById('chunkedProvider')?.value || 'CHATGPT_WEB',
        ai_model: document.getElementById('chunkedModel')?.value.trim() || ''
      });
      const detail = result.missing_pages?.length
        ? `thiếu ${result.missing_pages.length} trang`
        : result.uncertain_pages?.length
          ? `${result.uncertain_pages.length} trang cần rà soát`
          : `${result.unit_count} units`;
      setStatus(`Chunk ${result.chunk_key}: ${result.chunk_status} · ${detail}.`, result.chunk_status === 'IMPORTED' ? 'ok' : result.chunk_status === 'NEEDS_REVIEW' ? 'warn' : 'error');
      preparedChunkId = '';
      document.getElementById('chunkedPrompt').value = '';
      document.getElementById('chunkedFile').value = '';
      await loadPlan();
    } catch (error) {
      setStatus(error.message || 'Không nhập được chunk.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function assemble() {
    try {
      if (!activePlan) throw new Error('Chưa có kế hoạch cấu trúc.');
      const active = session();
      if (!active) throw new Error('Phiên giáo viên không còn hợp lệ.');
      setBusy(true);
      setStatus('Đang ghép các chunk, kiểm coverage toàn sách và tạo manifest cuối...', 'info');
      const result = await gateway({ action: 'assemble_chunks', staff_token: active.token, ma_gv: active.profile.ma_gv, plan_id: activePlan.id, ai_model: document.getElementById('chunkedModel')?.value.trim() || '' });
      const activeText = result.active_revision ? `đã kích hoạt revision ${result.active_revision}` : `revision ${result.revision} cần rà soát`;
      setStatus(`Ghép thành công ${result.lesson_count} bài · ${result.unit_count} units · ${result.processed_pages_count} trang · ${activeText}.`, result.active_revision ? 'ok' : 'warn');
      if (typeof knowledgeLoadLibrary === 'function') await knowledgeLoadLibrary();
      await loadPlan();
    } catch (error) {
      setStatus(error.message || 'Không ghép được nguồn.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function installUi() {
    if (document.getElementById('chunkedSourceCard')) return;
    const normalizedCard = document.getElementById('normalizedSourceCard');
    const firstCard = document.querySelector('main .card');
    const anchor = normalizedCard || firstCard;
    if (!anchor) return false;
    const section = document.createElement('section');
    section.className = 'card';
    section.id = 'chunkedSourceCard';
    section.innerHTML = `
      <h2>0A. Sách dài — Scanner → từng bài/chunk → Assembler</h2>
      <p class="sub"><strong>Dùng đường này cho SGK/PDF dài.</strong> AI không còn bị yêu cầu xử lý cả cuốn trong một lượt. Scanner chỉ dựng ranh giới bài; server chia mỗi bài thành chunk tối đa 12 trang; manifest toàn sách chỉ được sinh sau khi tất cả chunk đã qua kiểm định.</p>
      <div class="chunked-grid">
        <div class="hint-row" style="margin-top:0"><label for="chunkedDocument">Tài liệu *</label><select id="chunkedDocument"><option value="">Đang tải...</option></select></div>
        <div class="hint-row" style="margin-top:0"><label for="chunkedSubject">Môn *</label><select id="chunkedSubject"><option value="">Đang tải...</option></select></div>
        <div class="hint-row" style="margin-top:0"><label for="chunkedGrade">Khối *</label><select id="chunkedGrade"><option value="">-- Chọn khối --</option><option value="10">Khối 10</option><option value="11">Khối 11</option><option value="12">Khối 12</option></select></div>
        <div class="hint-row" style="margin-top:0"><label for="chunkedProvider">AI web</label><select id="chunkedProvider"><option value="CHATGPT_WEB">ChatGPT web</option><option value="GEMINI_WEB">Gemini web</option><option value="OTHER_WEB_AI">AI web khác</option></select></div>
      </div>
      <div class="hint-row"><label for="chunkedModel">Tên model — tùy chọn</label><input id="chunkedModel" placeholder="Ví dụ: GPT-5.6 Sol"></div>

      <div class="chunked-stage">
        <strong>1. Quét cấu trúc sách</strong>
        <div class="actions"><button id="btnChunkedStructure" class="primary" type="button">Tạo prompt Scanner</button><button id="btnChunkedStructureCopy" class="secondary" type="button">Sao chép prompt Scanner</button><button id="btnChunkedChatGPT" class="secondary" type="button">Mở ChatGPT</button><button id="btnChunkedRefresh" class="secondary" type="button">Làm mới</button></div>
        <textarea id="chunkedStructurePrompt" class="chunked-prompt" readonly placeholder="Scanner chỉ xác định Bài 1...n và phạm vi trang vật lý; không trích nội dung toàn sách."></textarea>
        <div class="chunked-import"><input id="chunkedPlanFile" type="file" accept=".jsonl,.ndjson,.json,application/x-ndjson,application/json,text/plain"><button id="btnChunkedPlanImport" class="primary" type="button">Kiểm định kế hoạch</button></div>
      </div>

      <div class="chunked-stage">
        <strong>2. Chuẩn hóa từng chunk bài học</strong>
        <div id="chunkedPlanSummary" class="chunked-summary"></div>
        <div id="chunkedList" class="chunked-list"></div>
        <div class="hint-row"><label for="chunkedChunkSelect">Chunk đang xử lý</label><select id="chunkedChunkSelect"><option value="">-- Chưa có chunk --</option></select></div>
        <div class="actions"><button id="btnChunkedPrompt" class="primary" type="button">Tạo prompt chunk</button><button id="btnChunkedCopy" class="secondary" type="button">Sao chép prompt chunk</button></div>
        <textarea id="chunkedPrompt" class="chunked-prompt" readonly placeholder="Mỗi prompt chỉ giao đúng một phạm vi trang vật lý."></textarea>
        <div class="chunked-import"><input id="chunkedFile" type="file" accept=".jsonl,.ndjson,.json,application/x-ndjson,application/json,text/plain"><button id="btnChunkedImport" class="primary" type="button">Kiểm định & nhập chunk</button></div>
      </div>

      <div class="chunked-stage chunked-assemble"><div><strong>3. Ghép nguồn cuối</strong><div class="help">Chỉ mở khi mọi lesson chunk đã đủ trang và không còn unresolved range. Manifest cuối do server tính coverage, không lấy số cứng từ prompt AI.</div></div><button id="btnChunkedAssemble" class="primary" type="button" disabled>Ghép & kích hoạt nguồn</button></div>
      <div id="chunkedStatus" class="chunked-status" role="status" aria-live="polite" aria-atomic="true"></div>`;
    anchor.parentNode.insertBefore(section, anchor);

    const style = document.createElement('style');
    style.textContent = `
      .chunked-grid{display:grid;grid-template-columns:2fr 1fr .8fr 1fr;gap:12px}.chunked-grid select,.chunked-grid input,.chunked-stage select,.chunked-stage input{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit;background:#fff}.chunked-stage{margin-top:16px;padding:14px;border:1px solid #dbeafe;border-radius:10px;background:#f8fbff}.chunked-prompt{width:100%;min-height:180px;margin-top:10px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:12px/1.45 Consolas,monospace;resize:vertical}.chunked-import{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-top:10px}.chunked-summary{margin-top:9px;padding:9px 11px;border-radius:8px;background:#eff6ff;color:#1e40af;font-size:12px}.chunked-list{max-height:280px;overflow:auto;margin-top:9px;border:1px solid #e2e8f0;border-radius:8px;background:#fff}.chunked-row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px}.chunked-row:last-child{border-bottom:0}.chunked-row small{display:block;color:#64748b;margin-top:2px}.chunked-badge{display:inline-block;padding:3px 7px;border-radius:999px;font-size:10px;font-weight:800;background:#e2e8f0;color:#475569;white-space:nowrap}.chunked-badge.IMPORTED,.chunked-badge.ACCOUNTED{background:#dcfce7;color:#166534}.chunked-badge.NEEDS_REVIEW{background:#fef3c7;color:#92400e}.chunked-badge.INCOMPLETE{background:#fee2e2;color:#991b1b}.chunked-badge.PENDING{background:#dbeafe;color:#1e40af}.chunked-assemble{display:flex;justify-content:space-between;gap:16px;align-items:center}.chunked-status{margin-top:10px;font-size:12px;color:#475569}.chunked-status.ok{color:#166534;font-weight:700}.chunked-status.error{color:#991b1b;font-weight:700}.chunked-status.warn{color:#92400e;font-weight:700}.chunked-status.info{color:#1e40af}@media(max-width:900px){.chunked-grid{grid-template-columns:1fr 1fr}}@media(max-width:700px){.chunked-grid,.chunked-import{grid-template-columns:1fr}.chunked-assemble{align-items:flex-start;flex-direction:column}}`;
    document.head.appendChild(style);

    document.getElementById('btnChunkedStructure').addEventListener('click', prepareStructurePrompt);
    document.getElementById('btnChunkedStructureCopy').addEventListener('click', () => copyText('chunkedStructurePrompt', 'prompt Scanner'));
    document.getElementById('btnChunkedChatGPT').addEventListener('click', () => window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer'));
    document.getElementById('btnChunkedRefresh').addEventListener('click', loadCatalog);
    document.getElementById('btnChunkedPlanImport').addEventListener('click', importPlan);
    document.getElementById('btnChunkedPrompt').addEventListener('click', prepareChunkPrompt);
    document.getElementById('btnChunkedCopy').addEventListener('click', () => copyText('chunkedPrompt', 'prompt chunk'));
    document.getElementById('btnChunkedImport').addEventListener('click', importChunk);
    document.getElementById('btnChunkedAssemble').addEventListener('click', assemble);
    document.getElementById('chunkedChunkSelect').addEventListener('change', () => { preparedChunkId = ''; document.getElementById('chunkedPrompt').value = ''; });
    for (const id of ['chunkedDocument', 'chunkedSubject', 'chunkedGrade']) {
      document.getElementById(id).addEventListener('change', async () => {
        resetPrepared();
        if (id === 'chunkedDocument') applyDocumentMetadata();
        await loadPlan();
      });
    }
    loadCatalog();
    return true;
  }

  function boot() {
    if (installUi()) return;
    const observer = new MutationObserver(() => {
      if (installUi()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  else setTimeout(boot, 0);
})();
