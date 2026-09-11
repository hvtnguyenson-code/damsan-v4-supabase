// 038/039C/040A — AI Web -> DAMSAN_SOURCE_V2 normalized-source workflow.
// Subject, grade, source role, and authority slot are explicit authoritative teacher selections.
(function () {
  'use strict';

  const ENDPOINT = `${KNOWLEDGE_SUPABASE_URL}/functions/v1/knowledge-normalized-source`;
  const MAX_FILE_BYTES = 7 * 1024 * 1024;
  let normalizedDocuments = [];
  let normalizedSubjects = [];
  let authoritySlots = [];
  let preparedDocumentId = '';
  let preparedSubjectId = '';
  let preparedGrade = 0;
  let preparedRole = '';
  let preparedAuthorityProfileId = '';
  let preparedAuthorityCode = '';

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

  function isAuthorityRole(role) {
    return role === 'ASSESSMENT_RULE' || role === 'ASSESSMENT_BENCHMARK';
  }

  function selectedSubject() {
    const id = document.getElementById('normalizedSubject')?.value || '';
    const subject = normalizedSubjects.find((item) => item.id === id);
    if (!subject) throw new Error('Hãy chọn môn học. Môn là bắt buộc và không được để AI tự suy đoán.');
    return subject;
  }

  function selectedGrade() {
    const value = Number(document.getElementById('normalizedGrade')?.value || 0);
    if (![10, 11, 12].includes(value)) throw new Error('Hãy chọn khối 10, 11 hoặc 12. Khối là bắt buộc.');
    return value;
  }

  function selectedRole() {
    const value = document.getElementById('normalizedRole')?.value || '';
    if (!['KNOWLEDGE_SOURCE', 'ASSESSMENT_RULE', 'ASSESSMENT_BENCHMARK'].includes(value)) throw new Error('Vai trò nguồn không hợp lệ.');
    return value;
  }

  function selectedDocument() {
    const id = document.getElementById('normalizedDocument')?.value || '';
    const doc = normalizedDocuments.find((item) => item.id === id);
    if (!doc) throw new Error('Hãy chọn tài liệu nguồn đã nạp vào Kho tri thức.');
    return doc;
  }

  function selectedAuthorityBinding(role) {
    if (!isAuthorityRole(role)) return null;
    const raw = document.getElementById('normalizedAuthoritySlot')?.value ?? '';
    if (raw === '') throw new Error('Hãy chọn chính xác căn cứ đích cho tài liệu Quy định/Benchmark. Hệ thống không tự gắn theo suy đoán.');
    const index = Number(raw);
    const slot = Number.isInteger(index) ? authoritySlots[index] : null;
    if (!slot || slot.source_kind !== role || !slot.profile_id || !slot.authority_code) {
      throw new Error('Căn cứ đích không còn hợp lệ. Hãy tải lại danh sách căn cứ.');
    }
    return slot;
  }

  function setStatus(message, kind = '') {
    const el = document.getElementById('normalizedStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = `normalized-status${kind ? ` ${kind}` : ''}`;
  }

  function setBusy(busy) {
    for (const id of ['btnNormalizedPrompt', 'btnNormalizedImport', 'btnNormalizedRefresh']) {
      const el = document.getElementById(id);
      if (el) el.disabled = busy;
    }
  }

  async function gateway(payload) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KNOWLEDGE_SUPABASE_KEY },
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok || !data || data.status !== 'success') {
      const error = new Error(data?.detail || data?.message || `Dịch vụ nguồn chuẩn hóa trả mã ${response.status}.`);
      error.code = data?.code || 'normalized_source_failed';
      throw error;
    }
    return data;
  }

  async function loadSubjects() {
    const active = session();
    const select = document.getElementById('normalizedSubject');
    if (!active || !select) return;
    select.disabled = true;
    try {
      const { data, error } = await knowledgeSb.rpc('rpc_knowledge_subject_catalog', {
        p_staff_token: active.token,
        p_ma_gv: active.profile.ma_gv
      });
      if (error) throw error;
      if (!data || data.status !== 'success') throw new Error(data?.code || 'Không tải được danh sách môn học.');
      normalizedSubjects = (Array.isArray(data.subjects) ? data.subjects : []).filter((item) => item?.id && item?.ten_mon);
      const old = select.value;
      select.innerHTML = '<option value="">-- Chọn môn --</option>' + normalizedSubjects.map((subject) =>
        `<option value="${esc(subject.id)}">${esc(subject.ten_mon)}</option>`
      ).join('');
      if (normalizedSubjects.some((subject) => subject.id === old)) select.value = old;
      const doc = normalizedDocuments.find((item) => item.id === (document.getElementById('normalizedDocument')?.value || ''));
      if (!select.value && doc?.mon_id && normalizedSubjects.some((subject) => subject.id === doc.mon_id)) select.value = doc.mon_id;
    } catch (error) {
      normalizedSubjects = [];
      select.innerHTML = '<option value="">-- Không tải được môn --</option>';
      setStatus(error.message || 'Không tải được danh sách môn học.', 'error');
    } finally {
      select.disabled = false;
    }
  }

  async function loadAuthoritySlots() {
    const wrap = document.getElementById('normalizedAuthorityWrap');
    const select = document.getElementById('normalizedAuthoritySlot');
    if (!wrap || !select) return;

    const role = document.getElementById('normalizedRole')?.value || 'KNOWLEDGE_SOURCE';
    authoritySlots = [];
    select.innerHTML = '<option value="">-- Chọn căn cứ đích --</option>';
    if (!isAuthorityRole(role)) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');

    const active = session();
    const monId = document.getElementById('normalizedSubject')?.value || '';
    const grade = Number(document.getElementById('normalizedGrade')?.value || 0);
    if (!active || !monId || ![10, 11, 12].includes(grade)) {
      select.innerHTML = '<option value="">-- Chọn môn và khối trước --</option>';
      return;
    }

    select.disabled = true;
    try {
      const { data, error } = await knowledgeSb.rpc('rpc_assessment_authority_slots', {
        p_staff_token: active.token,
        p_ma_gv: active.profile.ma_gv,
        p_mon_id: monId,
        p_grade: grade,
        p_source_role: role
      });
      if (error) throw error;
      if (!data || data.status !== 'success') throw new Error(data?.code || 'Không tải được danh sách căn cứ khảo thí.');
      authoritySlots = (Array.isArray(data.slots) ? data.slots : []).filter((slot) =>
        slot && slot.profile_id && slot.authority_code && slot.source_kind === role
      );
      select.innerHTML = '<option value="">-- Chọn chính xác căn cứ đích --</option>' + authoritySlots.map((slot, index) => {
        const required = slot.required ? ' · bắt buộc' : '';
        const type = slot.assessment_type ? `${slot.assessment_type} · ` : '';
        return `<option value="${index}">${esc(type + (slot.label || slot.authority_code) + ' · ' + slot.authority_code + required)}</option>`;
      }).join('');
      if (!authoritySlots.length) {
        setStatus(`Không có authority slot ${role} phù hợp cho môn/khối đã chọn. Không thể gắn tài liệu này vào căn cứ ra đề.`, 'error');
      } else {
        setStatus(`Có ${authoritySlots.length} căn cứ ${role} phù hợp. Hãy chọn rõ căn cứ đích; hệ thống sẽ không tự gắn theo profile duy nhất.`, 'info');
      }
    } catch (error) {
      select.innerHTML = '<option value="">-- Không tải được căn cứ --</option>';
      setStatus(error.message || 'Không tải được danh sách căn cứ khảo thí.', 'error');
    } finally {
      select.disabled = false;
    }
  }

  async function loadDocuments() {
    const active = session();
    if (!active) {
      setStatus('Phiên giáo viên không còn hợp lệ.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await knowledgeSb.rpc('rpc_knowledge_library_read', {
        p_staff_token: active.token,
        p_ma_gv: active.profile.ma_gv
      });
      if (error) throw error;
      if (!data || data.status !== 'success') throw new Error(data?.message || 'Không tải được Kho tri thức.');
      normalizedDocuments = (Array.isArray(data.documents) ? data.documents : []).filter((doc) => doc?.id);
      const select = document.getElementById('normalizedDocument');
      if (!select) return;
      const old = select.value;
      select.innerHTML = '<option value="">-- Chọn tài liệu gốc --</option>' + normalizedDocuments.map((doc) => {
        const role = doc.source_role && doc.source_role !== 'KNOWLEDGE_SOURCE' ? ` · ${doc.source_role}` : '';
        const grade = doc.grade ? ` · khối ${doc.grade}` : '';
        const pages = doc.page_count ? ` · ${doc.page_count} trang` : '';
        return `<option value="${esc(doc.id)}">${esc(doc.title || doc.original_filename)}${esc(pages + grade + role)}</option>`;
      }).join('');
      if (normalizedDocuments.some((doc) => doc.id === old)) select.value = old;
      await loadSubjects();
      const selected = normalizedDocuments.find((doc) => doc.id === select.value);
      const subjectSelect = document.getElementById('normalizedSubject');
      if (subjectSelect && selected?.mon_id && normalizedSubjects.some((subject) => subject.id === selected.mon_id)) subjectSelect.value = selected.mon_id;
      setStatus(`Đã nạp ${normalizedDocuments.length} tài liệu. Chọn tài liệu, môn, khối và vai trò nguồn để tạo prompt chuẩn hóa.`, 'info');
      await loadAuthoritySlots();
    } catch (error) {
      setStatus(error.message || 'Không tải được danh sách tài liệu.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function metadataPayload(action) {
    const active = session();
    if (!active) throw new Error('Phiên giáo viên không còn hợp lệ.');
    const doc = selectedDocument();
    const subject = selectedSubject();
    const grade = selectedGrade();
    const role = selectedRole();
    const binding = selectedAuthorityBinding(role);
    return {
      action,
      staff_token: active.token,
      ma_gv: active.profile.ma_gv,
      document_id: doc.id,
      mon_id: subject.id,
      subject_name: subject.ten_mon,
      grade,
      source_role: role,
      authority_profile_id: binding?.profile_id || null,
      authority_code: binding?.authority_code || null,
      authority_label: binding?.label || '',
      assessment_type: binding?.assessment_type || '',
      doc
    };
  }

  async function lockMetadata(payload) {
    const identity = await knowledgeSb.rpc('rpc_knowledge_set_subject_grade', {
      p_staff_token: payload.staff_token,
      p_ma_gv: payload.ma_gv,
      p_document_id: payload.document_id,
      p_mon_id: payload.mon_id,
      p_grade: payload.grade
    });
    if (identity.error) throw identity.error;
    if (!identity.data || identity.data.status !== 'success') throw new Error(identity.data?.code || 'subject_binding_failed');
    if (identity.data.mon_id !== payload.mon_id || identity.data.subject_name !== payload.subject_name) {
      throw new Error('Môn học server xác nhận không khớp lựa chọn hiện tại. Hãy làm mới nguồn và chọn lại.');
    }

    const { data, error } = await knowledgeSb.rpc('rpc_knowledge_set_authority_binding', {
      p_staff_token: payload.staff_token,
      p_ma_gv: payload.ma_gv,
      p_document_id: payload.document_id,
      p_grade: payload.grade,
      p_source_role: payload.source_role,
      p_profile_id: payload.authority_profile_id,
      p_authority_code: payload.authority_code
    });
    if (error) throw error;
    if (!data || data.status !== 'success') {
      const code = data?.code || 'authority_binding_failed';
      if (code === 'authority_slot_already_bound') {
        throw new Error('Căn cứ này đã được gắn với một tài liệu khác. Không tự thay thế nguồn authority hiện có.');
      }
      throw new Error(code);
    }
    return { identity: identity.data, authority: data };
  }

  function appendAuthorityLock(prompt, payload) {
    if (!isAuthorityRole(payload.source_role)) return prompt;
    return [
      prompt,
      '',
      'AUTHORITY BINDING DO HỆ THỐNG/GIÁO VIÊN CHỐT — KHÔNG ĐƯỢC SUY ĐOÁN HAY THAY ĐỔI:',
      `assessment_profile_id=${payload.authority_profile_id}`,
      `authority_code=${payload.authority_code}`,
      `source_role=${payload.source_role}`,
      'Trong manifest, assessment_profile_ids phải chứa đúng duy nhất assessment_profile_id ở trên và authority_code phải khớp chính xác. Hệ thống vẫn kiểm định lại server-side; AI không có quyền tự chọn profile khác.'
    ].join('\n');
  }

  async function preparePrompt() {
    try {
      const payload = metadataPayload('prepare_prompt');
      setBusy(true);
      setStatus('Đang khóa môn/khối/metadata và dựng prompt DAMSAN_SOURCE_V2...', 'info');
      await lockMetadata(payload);
      const data = await gateway(payload);
      if (data?.selected_metadata?.subject_name !== payload.subject_name) {
        throw new Error('Prompt server trả về sai môn học. Đã chặn để tránh tạo nguồn tri thức sai môn.');
      }
      document.getElementById('normalizedPrompt').value = appendAuthorityLock(data.prompt || '', payload);
      preparedDocumentId = payload.document_id;
      preparedSubjectId = payload.mon_id;
      preparedGrade = payload.grade;
      preparedRole = payload.source_role;
      preparedAuthorityProfileId = payload.authority_profile_id || '';
      preparedAuthorityCode = payload.authority_code || '';
      const authorityText = isAuthorityRole(payload.source_role)
        ? ` · ${payload.authority_label || payload.authority_code} [${payload.authority_code}]`
        : '';
      setStatus(`Prompt đã khóa metadata: ${payload.subject_name} · khối ${payload.grade} · ${payload.source_role}${authorityText}. Hãy mở ChatGPT/Gemini, đính kèm đúng file gốc và yêu cầu AI tạo JSONL.`, 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    const text = document.getElementById('normalizedPrompt')?.value || '';
    if (!text) return setStatus('Chưa có prompt để sao chép.', 'error');
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Đã sao chép prompt chuẩn hóa.', 'ok');
    } catch {
      const area = document.getElementById('normalizedPrompt');
      area?.select();
      document.execCommand('copy');
      setStatus('Đã sao chép prompt chuẩn hóa.', 'ok');
    }
  }

  function openProvider(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function importJsonl() {
    try {
      const payload = metadataPayload('import_jsonl');
      const authorityProfile = payload.authority_profile_id || '';
      const authorityCode = payload.authority_code || '';
      if (preparedDocumentId && (
        payload.document_id !== preparedDocumentId ||
        payload.mon_id !== preparedSubjectId ||
        payload.grade !== preparedGrade ||
        payload.source_role !== preparedRole ||
        authorityProfile !== preparedAuthorityProfileId ||
        authorityCode !== preparedAuthorityCode
      )) {
        throw new Error('Tài liệu/môn/khối/vai trò/căn cứ đích đã thay đổi sau khi tạo prompt. Hãy tạo lại prompt trước khi nhập JSONL để tránh gắn sai nguồn.');
      }
      const input = document.getElementById('normalizedFile');
      const file = input?.files?.[0];
      if (!file) throw new Error('Hãy chọn file JSONL/NDJSON do AI web xuất ra.');
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error('File JSONL rỗng hoặc vượt giới hạn 7 MiB.');
      if (!/\.(jsonl|ndjson|json)$/i.test(file.name)) throw new Error('Chỉ nhận file .jsonl, .ndjson hoặc .json dạng JSONL.');
      const text = await file.text();
      const provider = document.getElementById('normalizedProvider')?.value || 'WEB_AI';
      const model = document.getElementById('normalizedModel')?.value.trim() || '';
      setBusy(true);
      setStatus(`Đang khóa lại môn/khối và kiểm định ${file.name}...`, 'info');
      await lockMetadata(payload);
      const result = await gateway({
        ...payload,
        payload_text: text,
        ai_provider: provider,
        ai_model: model
      });
      const activeText = result.active_revision
        ? `đã kích hoạt revision ${result.active_revision}`
        : `revision ${result.revision} cần rà soát vì còn ${result.uncertain_page_count || 0} trang chưa chắc chắn`;
      const bindingText = isAuthorityRole(payload.source_role) ? ` · authority=${payload.authority_code}` : '';
      setStatus(`Nhập thành công ${result.unit_count} units · ${activeText} · ${payload.subject_name} · khối ${result.grade} · ${result.source_role}${bindingText}.`, result.active_revision ? 'ok' : 'info');
      if (typeof knowledgeLoadLibrary === 'function') await knowledgeLoadLibrary();
      await loadDocuments();
    } catch (error) {
      setStatus(error.message || 'Không nhập được nguồn chuẩn hóa.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function resetPrepared() {
    preparedDocumentId = '';
    preparedSubjectId = '';
    preparedGrade = 0;
    preparedRole = '';
    preparedAuthorityProfileId = '';
    preparedAuthorityCode = '';
    const prompt = document.getElementById('normalizedPrompt');
    if (prompt) prompt.value = '';
  }

  function installUi() {
    const firstCard = document.querySelector('main .card');
    if (!firstCard || document.getElementById('normalizedSourceCard')) return;
    const section = document.createElement('section');
    section.className = 'card';
    section.id = 'normalizedSourceCard';
    section.innerHTML = `
      <h2>0. Nguồn AI chuẩn hóa — khuyến nghị cho SGK/PDF dài</h2>
      <p class="sub">Đam San không cố tự hiểu bố cục của sách hàng trăm trang. Chọn <strong>môn</strong>, <strong>khối</strong> và <strong>vai trò nguồn</strong>, hệ thống tạo prompt để ChatGPT/Gemini đọc file gốc và xuất <span class="mono-tag">DAMSAN_SOURCE_V2 JSONL</span>. Với tài liệu Quy định/Benchmark, phải chọn thêm <strong>đúng căn cứ đích</strong>; hệ thống không tự gắn chỉ vì môn/khối có một profile.</p>
      <div class="normalized-grid">
        <div class="hint-row" style="margin-top:0"><label for="normalizedDocument">Tài liệu gốc *</label><select id="normalizedDocument"><option value="">Đang tải...</option></select></div>
        <div class="hint-row" style="margin-top:0"><label for="normalizedSubject">Môn *</label><select id="normalizedSubject"><option value="">Đang tải...</option></select><div class="help">Môn do giáo viên chọn và được server khóa trước khi tạo prompt; AI không được tự đoán.</div></div>
        <div class="hint-row" style="margin-top:0"><label for="normalizedGrade">Khối *</label><select id="normalizedGrade"><option value="">-- Chọn khối --</option><option value="10">Khối 10</option><option value="11">Khối 11</option><option value="12">Khối 12</option></select><div class="help">Không có “Tất cả khối”. Khối được ghi xuyên suốt vào source, scope và request ra đề.</div></div>
        <div class="hint-row" style="margin-top:0"><label for="normalizedRole">Vai trò nguồn *</label><select id="normalizedRole"><option value="KNOWLEDGE_SOURCE">Nguồn kiến thức — SGK/tài liệu học</option><option value="ASSESSMENT_RULE">Quy định ra đề — authority</option><option value="ASSESSMENT_BENCHMARK">Đề mẫu/đề tham khảo — benchmark</option></select></div>
        <div class="hint-row" style="margin-top:0"><label for="normalizedProvider">AI đã dùng</label><select id="normalizedProvider"><option value="CHATGPT_WEB">ChatGPT web</option><option value="GEMINI_WEB">Gemini web</option><option value="OTHER_WEB_AI">AI web khác</option></select></div>
      </div>
      <div id="normalizedAuthorityWrap" class="hint-row hidden">
        <label for="normalizedAuthoritySlot">Căn cứ đích *</label>
        <select id="normalizedAuthoritySlot"><option value="">-- Chọn môn và khối trước --</option></select>
        <div class="help">Chọn đúng slot do assessment profile khai báo, ví dụ “Quy định/cấu trúc chính thức” hoặc “Đề tham khảo chính thức”. Không auto-link.</div>
      </div>
      <div class="hint-row"><label for="normalizedModel">Tên model — tùy chọn</label><input id="normalizedModel" placeholder="Ví dụ: GPT-5.6 Sol"></div>
      <div class="actions">
        <button id="btnNormalizedPrompt" class="primary" type="button">Tạo prompt chuẩn hóa</button>
        <button id="btnNormalizedCopy" class="secondary" type="button">Sao chép prompt</button>
        <button id="btnNormalizedChatGPT" class="secondary" type="button">Mở ChatGPT</button>
        <button id="btnNormalizedGemini" class="secondary" type="button">Mở Gemini</button>
        <button id="btnNormalizedRefresh" class="secondary" type="button">Làm mới nguồn</button>
      </div>
      <div class="hint-row"><label for="normalizedPrompt">Prompt gửi cho AI web</label><textarea id="normalizedPrompt" class="normalized-prompt" readonly placeholder="Chọn tài liệu + môn + khối + vai trò nguồn; với Authority/Benchmark chọn thêm căn cứ đích, rồi bấm Tạo prompt chuẩn hóa..."></textarea></div>
      <div class="normalized-import">
        <div><strong>Bước nhập lại hệ thống</strong><div class="help">Tải file JSONL/NDJSON AI tạo. Server sẽ kiểm schema, đủ trang, unit_key, ranh giới bài, môn, khối, vai trò nguồn, provenance; authority binding lấy từ lựa chọn giáo viên chứ không lấy từ AI.</div></div>
        <input id="normalizedFile" type="file" accept=".jsonl,.ndjson,.json,application/x-ndjson,application/json,text/plain">
        <button id="btnNormalizedImport" class="primary" type="button">Kiểm định & nhập JSONL</button>
      </div>
      <div id="normalizedStatus" class="normalized-status"></div>`;
    firstCard.parentNode.insertBefore(section, firstCard);

    const style = document.createElement('style');
    style.textContent = '.normalized-grid{display:grid;grid-template-columns:2fr 1.1fr .8fr 1.5fr 1fr;gap:12px}.normalized-grid select,.normalized-grid input,.normalized-import input,.hint-row input,.hint-row select{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit;background:#fff}.normalized-prompt{min-height:250px!important;font-family:Consolas,monospace!important;font-size:12px!important}.normalized-import{margin-top:14px;padding:12px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:9px;display:grid;grid-template-columns:1.5fr 1fr auto;gap:10px;align-items:center}.normalized-status{margin-top:10px;font-size:12px;color:#475569}.normalized-status.ok{color:#166534;font-weight:700}.normalized-status.error{color:#991b1b;font-weight:700}.normalized-status.info{color:#1e40af}.mono-tag{font-family:Consolas,monospace;background:#f1f5f9;padding:2px 5px;border-radius:4px}.hidden{display:none!important}@media(max-width:980px){.normalized-grid{grid-template-columns:1fr 1fr}}@media(max-width:850px){.normalized-grid,.normalized-import{grid-template-columns:1fr}}';
    document.head.appendChild(style);

    document.getElementById('btnNormalizedPrompt').addEventListener('click', preparePrompt);
    document.getElementById('btnNormalizedCopy').addEventListener('click', copyPrompt);
    document.getElementById('btnNormalizedChatGPT').addEventListener('click', () => openProvider('https://chatgpt.com/'));
    document.getElementById('btnNormalizedGemini').addEventListener('click', () => openProvider('https://gemini.google.com/app'));
    document.getElementById('btnNormalizedImport').addEventListener('click', importJsonl);
    document.getElementById('btnNormalizedRefresh').addEventListener('click', loadDocuments);

    for (const id of ['normalizedDocument', 'normalizedSubject', 'normalizedGrade', 'normalizedRole']) {
      document.getElementById(id).addEventListener('change', async () => {
        resetPrepared();
        if (id === 'normalizedDocument') {
          const doc = normalizedDocuments.find((item) => item.id === document.getElementById('normalizedDocument').value);
          const subjectSelect = document.getElementById('normalizedSubject');
          if (subjectSelect && doc?.mon_id && normalizedSubjects.some((subject) => subject.id === doc.mon_id)) subjectSelect.value = doc.mon_id;
          if (doc?.grade && [10,11,12].includes(Number(doc.grade))) document.getElementById('normalizedGrade').value = String(doc.grade);
        }
        await loadAuthoritySlots();
      });
    }
    document.getElementById('normalizedAuthoritySlot').addEventListener('change', resetPrepared);
    loadDocuments();
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(installUi, 0));
})();