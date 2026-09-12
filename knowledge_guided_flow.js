// AI-UX-044 — Guided knowledge normalization.
// The teacher sees one next action, one result inbox, and a persisted progress summary.
// Canonical validation remains server-side in knowledge-chunked-normalization.
(() => {
  'use strict';

  const ENDPOINT = `${KNOWLEDGE_SUPABASE_URL}/functions/v1/knowledge-chunked-normalization`;
  const MAX_RESULT_BYTES = 6 * 1024 * 1024;
  const MAX_BATCH_CHUNKS = 5;
  const MAX_BATCH_PAGES = 24;
  const STORAGE_PREFIX = 'damsan.guided.knowledge.v1';
  const DONE_STATUSES = new Set(['IMPORTED', 'NEEDS_REVIEW']);

  let documents = [];
  let subjects = [];
  let currentPlanData = null;
  let currentMode = 'idle';
  let currentReviewChunk = null;
  let busy = false;
  let refreshTimer = null;

  function activeSession() {
    return typeof knowledgeSession === 'function' ? knowledgeSession() : null;
  }

  function storageKey(suffix = 'state') {
    const active = activeSession();
    return `${STORAGE_PREFIX}.${active?.profile?.ma_gv || 'anonymous'}.${suffix}`;
  }

  function readSaved() {
    try {
      return JSON.parse(localStorage.getItem(storageKey()) || '{}') || {};
    } catch {
      return {};
    }
  }

  function writeSaved(patch) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ ...readSaved(), ...patch, saved_at: new Date().toISOString() }));
    } catch {
      // Server state remains authoritative.
    }
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setStatus(message, kind = 'info') {
    const el = document.getElementById('guidedStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = `guided-status ${kind}`;
  }

  function setBusy(next, label = '') {
    busy = next;
    const button = document.getElementById('btnGuidedPrimary');
    const paste = document.getElementById('btnGuidedPaste');
    const file = document.getElementById('guidedResultFile');
    if (button) {
      button.disabled = next || currentMode === 'done' || currentMode === 'idle';
      button.classList.toggle('is-busy', next);
      if (next && label) button.textContent = label;
    }
    if (paste) paste.disabled = next;
    if (file) file.disabled = next;
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
      const error = new Error(data?.detail || data?.message || `Dịch vụ chuẩn hóa trả mã ${response.status}.`);
      error.code = data?.code || 'guided_gateway_failed';
      throw error;
    }
    return data;
  }

  function selectedDocument() {
    const id = document.getElementById('guidedDocument')?.value || '';
    return documents.find((doc) => doc.id === id) || null;
  }

  function selectedSubject() {
    const id = document.getElementById('guidedSubject')?.value || '';
    return subjects.find((subject) => subject.id === id) || null;
  }

  function selectedGrade() {
    const value = Number(document.getElementById('guidedGrade')?.value || 0);
    return [10, 11, 12].includes(value) ? value : 0;
  }

  function selectedProvider() {
    return document.getElementById('guidedProvider')?.value || 'CHATGPT_WEB';
  }

  function selectedModel() {
    return document.getElementById('guidedModel')?.value.trim() || '';
  }

  function providerName() {
    return selectedProvider() === 'GEMINI_WEB' ? 'Gemini' : selectedProvider() === 'OTHER_WEB_AI' ? 'AI web' : 'ChatGPT';
  }

  function providerUrl() {
    return selectedProvider() === 'GEMINI_WEB' ? 'https://gemini.google.com/' : 'https://chatgpt.com/';
  }

  function copyOptions(target, items, getLabel) {
    const old = target.value;
    target.innerHTML = '<option value="">-- Chọn --</option>' + items.map((item) => `<option value="${esc(item.id)}">${esc(getLabel(item))}</option>`).join('');
    if (items.some((item) => item.id === old)) target.value = old;
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function lockIdentity() {
    const active = activeSession();
    const doc = selectedDocument();
    const subject = selectedSubject();
    const grade = selectedGrade();
    if (!active) throw new Error('Phiên giáo viên không còn hợp lệ.');
    if (!doc) throw new Error('Hãy chọn tài liệu cần chuẩn hóa.');
    if (!subject) throw new Error('Hãy chọn môn học.');
    if (!grade) throw new Error('Hãy chọn khối 10, 11 hoặc 12.');

    const identity = await knowledgeSb.rpc('rpc_knowledge_set_subject_grade', {
      p_staff_token: active.token,
      p_ma_gv: active.profile.ma_gv,
      p_document_id: doc.id,
      p_mon_id: subject.id,
      p_grade: grade
    });
    if (identity.error) throw identity.error;
    if (!identity.data || identity.data.status !== 'success') throw new Error(identity.data?.message || identity.data?.code || 'Không khóa được môn/khối.');

    const role = await knowledgeSb.rpc('rpc_knowledge_set_authority_binding', {
      p_staff_token: active.token,
      p_ma_gv: active.profile.ma_gv,
      p_document_id: doc.id,
      p_grade: grade,
      p_source_role: 'KNOWLEDGE_SOURCE',
      p_profile_id: null,
      p_authority_code: null
    });
    if (role.error) throw role.error;
    if (!role.data || role.data.status !== 'success') throw new Error(role.data?.message || role.data?.code || 'Không khóa được vai trò nguồn.');
    return { active, doc, subject, grade };
  }

  async function readPlan(documentId = selectedDocument()?.id || '') {
    const active = activeSession();
    if (!active || !documentId) return { plan: null, chunks: [] };
    return gateway({ action: 'read_plan', staff_token: active.token, ma_gv: active.profile.ma_gv, document_id: documentId });
  }

  function planPriority(plan) {
    if (!plan) return 0;
    if (plan.plan_status === 'ACTIVE') return 4;
    if (plan.plan_status === 'NEEDS_REVIEW') return 3;
    if (plan.plan_status === 'ASSEMBLED') return 2;
    return 1;
  }

  function planTime(plan) {
    return Date.parse(plan?.updated_at || plan?.created_at || '') || 0;
  }

  async function findBestPlan() {
    const saved = readSaved();
    if (saved.document_id && documents.some((doc) => doc.id === saved.document_id)) {
      const data = await readPlan(saved.document_id);
      if (data?.plan) return { documentId: saved.document_id, data };
    }
    const candidates = await Promise.all(documents.map(async (doc) => {
      try {
        const data = await readPlan(doc.id);
        return data?.plan ? { documentId: doc.id, data } : null;
      } catch {
        return null;
      }
    }));
    return candidates.filter(Boolean).sort((a, b) => {
      const priority = planPriority(b.data.plan) - planPriority(a.data.plan);
      return priority || (planTime(b.data.plan) - planTime(a.data.plan));
    })[0] || null;
  }

  function chunkStats(data) {
    const chunks = Array.isArray(data?.chunks) ? data.chunks : [];
    const lessonChunks = chunks.filter((chunk) => chunk.chunk_type === 'LESSON');
    const unresolved = chunks.filter((chunk) => chunk.chunk_type === 'UNRESOLVED');
    const imported = lessonChunks.filter((chunk) => chunk.status === 'IMPORTED');
    const review = lessonChunks.filter((chunk) => chunk.status === 'NEEDS_REVIEW');
    const pending = lessonChunks.filter((chunk) => !DONE_STATUSES.has(chunk.status));
    const groups = new Map();
    for (const chunk of lessonChunks) {
      const key = chunk.lesson_code || chunk.chunk_key;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(chunk);
    }
    let doneLessons = 0;
    let reviewLessons = 0;
    for (const parts of groups.values()) {
      if (parts.every((part) => DONE_STATUSES.has(part.status))) doneLessons += 1;
      if (parts.every((part) => DONE_STATUSES.has(part.status)) && parts.some((part) => part.status === 'NEEDS_REVIEW')) reviewLessons += 1;
    }
    return {
      chunks,
      lessonChunks,
      unresolved,
      imported,
      review,
      pending,
      totalLessons: groups.size,
      doneLessons,
      reviewLessons
    };
  }

  function nextBatch(chunks) {
    const pending = (chunks || [])
      .filter((chunk) => chunk.chunk_type === 'LESSON' && !DONE_STATUSES.has(chunk.status))
      .sort((a, b) => Number(a.chunk_no) - Number(b.chunk_no));
    const batch = [];
    let pages = 0;
    for (const chunk of pending) {
      const count = Number(chunk.page_end) - Number(chunk.page_start) + 1;
      if (batch.length && (batch.length >= MAX_BATCH_CHUNKS || pages + count > MAX_BATCH_PAGES)) break;
      batch.push(chunk);
      pages += count;
    }
    return { batch, pages, pendingCount: pending.length };
  }

  function canonicalChunkPromptFix(prompt) {
    return String(prompt || '').replaceAll(
      'DÒNG 1 BẮT BUỘC — chunk_status',
      'RECORD ĐẦU TIÊN BẮT BUỘC CỦA CHUNK — chunk_status'
    );
  }

  function outputInstruction(filename) {
    return [
      '',
      'YÊU CẦU GIAO KẾT QUẢ:',
      `- Nếu giao diện hỗ trợ tạo tệp, hãy tạo tệp ${filename} để tải về.`,
      '- Nếu chỉ có thể trả nội dung, chỉ trả JSONL/NDJSON thuần để người dùng bấm Copy; không thêm lời giải thích.'
    ].join('\n');
  }

  function combinedBatchPrompt(prompts, batch, pages) {
    const first = batch[0]?.lesson_code || 'START';
    const last = batch[batch.length - 1]?.lesson_code || first;
    const filename = `DAMSAN_${first}_${last}.jsonl`;
    const header = [
      'Bạn là BATCH LESSON NORMALIZATION WORKER cho hệ thống Đam San V4.',
      `Lượt này có ${batch.length} chunk, tổng cộng ${pages} trang vật lý. Xử lý LẦN LƯỢT từng chunk theo metadata khóa bên dưới.`,
      'ĐẦU RA DUY NHẤT: một luồng JSONL/NDJSON thuần. Không dùng JSON array, không Markdown fence, không lời giải thích.',
      'Mỗi chunk phải bắt đầu bằng đúng một record_type=chunk_status của chính chunk đó, sau đó mới đến các record nội dung của chunk đó.',
      'Không gộp hai chunk. Không bỏ chunk. Không đổi chunk_key. Không dùng kiến thức ngoài PDF.',
      'Nếu một chunk có trang không đọc được, khai đúng missing_pages/uncertain_pages cho chunk đó và vẫn tiếp tục các chunk còn lại.',
      '',
      `DANH SÁCH CHUNK KHÓA: ${batch.map((chunk) => `${chunk.chunk_key}:${chunk.page_start}-${chunk.page_end}`).join(' | ')}`,
      '',
      '===== CÁC PROMPT CHUNK CANONICAL ====='
    ];
    return header
      .concat(prompts.map((prompt, index) => `\n===== CHUNK ${index + 1}/${prompts.length} =====\n${canonicalChunkPromptFix(prompt)}`))
      .join('\n') + outputInstruction(filename);
  }

  async function prepareScannerPrompt() {
    const { active, doc, grade } = await lockIdentity();
    const result = await gateway({
      action: 'prepare_structure_prompt',
      staff_token: active.token,
      ma_gv: active.profile.ma_gv,
      document_id: doc.id,
      grade
    });
    const filename = `${String(doc.original_filename || doc.title || 'DAMSAN').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '_')}_PLAN.jsonl`;
    return `${result.prompt || ''}${outputInstruction(filename)}`;
  }

  async function prepareBatchPrompt() {
    const active = activeSession();
    if (!active) throw new Error('Phiên giáo viên không còn hợp lệ.');
    const data = await readPlan();
    if (!data.plan) throw new Error('Chưa có kế hoạch cấu trúc.');
    const { batch, pages } = nextBatch(data.chunks);
    if (!batch.length) throw new Error('Không còn phần nào chờ chuẩn hóa.');
    const prompts = [];
    for (const chunk of batch) {
      const result = await gateway({
        action: 'prepare_chunk_prompt',
        staff_token: active.token,
        ma_gv: active.profile.ma_gv,
        plan_id: data.plan.id,
        chunk_id: chunk.id
      });
      prompts.push(result.prompt || '');
    }
    writeSaved({ expected_chunk_keys: batch.map((chunk) => chunk.chunk_key) });
    return combinedBatchPrompt(prompts, batch, pages);
  }

  async function prepareReviewPrompt() {
    const active = activeSession();
    if (!active || !currentPlanData?.plan || !currentReviewChunk) throw new Error('Không tìm thấy phần cần rà soát.');
    const result = await gateway({
      action: 'prepare_chunk_prompt',
      staff_token: active.token,
      ma_gv: active.profile.ma_gv,
      plan_id: currentPlanData.plan.id,
      chunk_id: currentReviewChunk.id
    });
    writeSaved({ expected_chunk_keys: [currentReviewChunk.chunk_key] });
    return `${canonicalChunkPromptFix(result.prompt || '')}${outputInstruction(`${currentReviewChunk.chunk_key}_RETRY.jsonl`)}`;
  }

  async function copyPrompt(text) {
    if (!text) throw new Error('Không tạo được prompt.');
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.focus();
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) throw new Error('Trình duyệt không cho phép sao chép tự động.');
    }
  }

  function maybeOpenProvider() {
    const doc = selectedDocument();
    if (!doc) return false;
    const key = storageKey(`handoff.${doc.id}`);
    let alreadyOpened = false;
    try { alreadyOpened = localStorage.getItem(key) === '1'; } catch { alreadyOpened = false; }
    if (alreadyOpened) return false;
    const popup = window.open(providerUrl(), '_blank', 'noopener,noreferrer');
    if (popup) {
      try { localStorage.setItem(key, '1'); } catch { /* no-op */ }
      return true;
    }
    return false;
  }

  function openProviderManually() {
    window.open(providerUrl(), '_blank', 'noopener,noreferrer');
  }

  function cleanAiText(raw) {
    let text = String(raw || '').replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('Kết quả AI đang trống.');
    const fenced = text.match(/```(?:jsonl|ndjson|json)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();
    return text;
  }

  function normalizeAiRecords(raw) {
    const text = cleanAiText(raw);
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > MAX_RESULT_BYTES) throw new Error('Kết quả AI vượt giới hạn 6 MiB.');

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        if (!parsed.length || parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('JSON array phải chỉ chứa object.');
        return { records: parsed, jsonl: `${parsed.map((item) => JSON.stringify(item)).join('\n')}\n` };
      }
      if (parsed && typeof parsed === 'object') return { records: [parsed], jsonl: `${JSON.stringify(parsed)}\n` };
    } catch {
      // Fall through to JSONL parsing.
    }

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const records = lines.map((line, index) => {
      try {
        const record = JSON.parse(line);
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('not_object');
        return record;
      } catch {
        throw new Error(`JSONL không hợp lệ ở dòng ${index + 1}. Hãy Copy đúng phần kết quả AI.`);
      }
    });
    if (!records.length) throw new Error('Không tìm thấy JSON object nào.');
    return { records, jsonl: `${records.map((item) => JSON.stringify(item)).join('\n')}\n` };
  }

  function splitChunkGroups(records) {
    const groups = [];
    let current = null;
    for (const record of records) {
      if (String(record.record_type || '').toLowerCase() === 'chunk_status') {
        if (current) groups.push(current);
        const key = String(record.chunk_key || '').trim();
        if (!key) throw new Error('chunk_status thiếu chunk_key.');
        current = { key, records: [record] };
      } else {
        if (!current) throw new Error('Kết quả chunk phải bắt đầu bằng chunk_status.');
        current.records.push(record);
      }
    }
    if (current) groups.push(current);
    if (!groups.length) throw new Error('Không tìm thấy chunk_status trong kết quả AI.');
    if (new Set(groups.map((group) => group.key)).size !== groups.length) throw new Error('Kết quả AI có chunk_key trùng.');
    return groups;
  }

  async function importPlanJsonl(jsonl) {
    const active = activeSession();
    const doc = selectedDocument();
    const grade = selectedGrade();
    if (!active || !doc || !grade) throw new Error('Thiếu tài liệu hoặc khối để nhập kế hoạch.');
    return gateway({
      action: 'import_structure_plan',
      staff_token: active.token,
      ma_gv: active.profile.ma_gv,
      document_id: doc.id,
      grade,
      payload_text: jsonl,
      ai_provider: selectedProvider(),
      ai_model: selectedModel()
    });
  }

  async function importChunkGroups(groups) {
    const active = activeSession();
    const data = await readPlan();
    if (!active || !data.plan) throw new Error('Không tìm thấy kế hoạch đang làm.');
    const chunkMap = new Map((data.chunks || []).filter((chunk) => chunk.chunk_type === 'LESSON').map((chunk) => [chunk.chunk_key, chunk]));
    const expected = Array.isArray(readSaved().expected_chunk_keys) ? readSaved().expected_chunk_keys : [];
    const warnings = [];
    for (const group of groups) {
      const chunk = chunkMap.get(group.key);
      if (!chunk) throw new Error(`Phần ${group.key} không thuộc tài liệu đang xử lý.`);
      if (expected.length && !expected.includes(group.key)) throw new Error(`Phần ${group.key} không thuộc lượt AI vừa tạo. Hãy dùng đúng kết quả của lượt hiện tại.`);
      const one = await gateway({
        action: 'import_chunk_jsonl',
        staff_token: active.token,
        ma_gv: active.profile.ma_gv,
        plan_id: data.plan.id,
        chunk_id: chunk.id,
        payload_text: `${group.records.map((record) => JSON.stringify(record)).join('\n')}\n`,
        ai_provider: selectedProvider(),
        ai_model: selectedModel()
      });
      if (one.chunk_status !== 'IMPORTED') warnings.push(`${group.key}: ${one.chunk_status}`);
    }
    writeSaved({ expected_chunk_keys: [] });
    return { warnings, imported: groups.map((group) => group.key) };
  }

  async function acceptAiResult(raw, sourceLabel = 'kết quả AI') {
    if (busy) return;
    try {
      setBusy(true, 'Đang kiểm định…');
      setStatus(`Đang kiểm định ${sourceLabel}…`, 'info');
      const normalized = normalizeAiRecords(raw);
      const firstType = String(normalized.records[0]?.record_type || '').toLowerCase();
      if (firstType === 'plan_manifest') {
        const result = await importPlanJsonl(normalized.jsonl);
        setStatus(`Đã nhận cấu trúc: ${result.lesson_count} bài. Hệ thống đã lưu tiến độ và sẵn sàng chuẩn hóa nội dung.`, result.unresolved_range_count ? 'warn' : 'ok');
      } else if (firstType === 'chunk_status') {
        const groups = splitChunkGroups(normalized.records);
        const result = await importChunkGroups(groups);
        setStatus(result.warnings.length
          ? `Đã nhập ${result.imported.length} phần; còn ${result.warnings.length} phần cần rà soát.`
          : `Đã nhập và kiểm định ${result.imported.length} phần. Tiến độ đã được lưu.`, result.warnings.length ? 'warn' : 'ok');
      } else {
        throw new Error('Hệ thống chỉ nhận kế hoạch cấu trúc hoặc kết quả chuẩn hóa do luồng hiện tại tạo ra.');
      }
      await refreshState();
    } catch (error) {
      setStatus(error.message || 'Không nhập được kết quả AI.', 'error');
    } finally {
      setBusy(false);
      renderState();
    }
  }

  async function pasteResult() {
    try {
      if (!navigator.clipboard?.readText) throw new Error('Trình duyệt này không hỗ trợ đọc clipboard. Hãy dùng Chọn file kết quả.');
      const text = await navigator.clipboard.readText();
      await acceptAiResult(text, 'nội dung từ clipboard');
    } catch (error) {
      setStatus(error.message || 'Không đọc được clipboard. Hãy dùng Chọn file kết quả.', 'error');
    }
  }

  async function fileResult(file) {
    if (!file) return;
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_RESULT_BYTES) {
      setStatus('File kết quả rỗng hoặc vượt 6 MiB.', 'error');
      return;
    }
    await acceptAiResult(await file.text(), file.name);
  }

  async function assemble() {
    const active = activeSession();
    if (!active || !currentPlanData?.plan) throw new Error('Không tìm thấy kế hoạch để ghép nguồn.');
    const result = await gateway({
      action: 'assemble_chunks',
      staff_token: active.token,
      ma_gv: active.profile.ma_gv,
      plan_id: currentPlanData.plan.id,
      ai_model: selectedModel()
    });
    if (typeof knowledgeLoadLibrary === 'function') await knowledgeLoadLibrary();
    setStatus(result.active_revision
      ? `Hoàn tất. Nguồn đã được kích hoạt ở revision ${result.active_revision}.`
      : `Đã ghép revision ${result.revision}, nhưng còn nội dung cần rà soát trước khi kích hoạt.`, result.active_revision ? 'ok' : 'warn');
    await refreshState();
  }

  async function handoff() {
    if (busy) return;
    try {
      setBusy(true, currentMode === 'scanner' ? 'Đang chuẩn bị cấu trúc…' : currentMode === 'review' ? 'Đang chuẩn bị phần cần rà soát…' : 'Đang chuẩn bị lượt tiếp theo…');
      let prompt = '';
      if (currentMode === 'scanner') prompt = await prepareScannerPrompt();
      else if (currentMode === 'batch') prompt = await prepareBatchPrompt();
      else if (currentMode === 'review') prompt = await prepareReviewPrompt();
      else if (currentMode === 'assemble') {
        await assemble();
        return;
      } else return;

      await copyPrompt(prompt);
      const opened = maybeOpenProvider();
      const provider = providerName();
      setStatus(opened
        ? `Prompt đã được sao chép và ${provider} đã mở. Dán prompt, gửi; lần đầu hãy đính kèm PDF. Giữ nguyên cuộc chat này cho các lượt sau.`
        : `Prompt đã được sao chép. Quay lại cuộc chat ${provider} đang dùng, dán và gửi. Khi AI xong, Copy kết quả rồi quay lại bấm “Dán kết quả AI”.`, 'ok');
    } catch (error) {
      setStatus(error.message || 'Không chuẩn bị được lượt AI.', 'error');
    } finally {
      setBusy(false);
      renderState();
    }
  }

  function updateStep(id, state, sub = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `guided-step ${state}`;
    const small = el.querySelector('small');
    if (small) small.textContent = sub;
  }

  function renderState() {
    const primary = document.getElementById('btnGuidedPrimary');
    const progressText = document.getElementById('guidedProgressText');
    const progressFill = document.getElementById('guidedProgressFill');
    const title = document.getElementById('guidedTitle');
    const next = document.getElementById('guidedNext');
    const setup = document.getElementById('guidedSetup');
    const meta = document.getElementById('guidedMeta');
    const doc = selectedDocument();
    const plan = currentPlanData?.plan || null;
    const stats = chunkStats(currentPlanData);

    if (title) title.textContent = doc ? (doc.title || doc.original_filename || 'Tài liệu') : 'Chọn tài liệu để bắt đầu';
    if (meta) meta.textContent = doc
      ? `${selectedSubject()?.ten_mon || currentPlanData?.plan?.subject_name || 'Chưa chọn môn'} · ${selectedGrade() ? `Khối ${selectedGrade()}` : 'Chưa chọn khối'}${doc.page_count ? ` · ${doc.page_count} trang` : ''}`
      : 'Hệ thống sẽ tự lưu và tự khôi phục tiến độ.';

    if (!doc || !selectedSubject() || !selectedGrade()) {
      currentMode = 'idle';
      if (setup) setup.hidden = false;
      updateStep('guidedStep1', 'current', 'Chọn nguồn');
      updateStep('guidedStep2', 'future', 'Chưa bắt đầu');
      updateStep('guidedStep3', 'future', 'Chưa bắt đầu');
      if (next) next.textContent = 'Chọn tài liệu, môn và khối. Các trường đã có metadata sẽ được điền tự động.';
      if (progressText) progressText.textContent = 'Chưa bắt đầu';
      if (progressFill) progressFill.style.width = '0%';
      if (primary) { primary.textContent = 'Chọn đủ thông tin để tiếp tục'; primary.disabled = true; }
      return;
    }

    if (setup) setup.hidden = Boolean(plan);

    if (!plan || stats.unresolved.length) {
      currentMode = 'scanner';
      updateStep('guidedStep1', 'current', stats.unresolved.length ? 'Cần quét lại' : 'Sắp quét');
      updateStep('guidedStep2', 'future', 'Chờ cấu trúc');
      updateStep('guidedStep3', 'future', 'Chưa sẵn sàng');
      if (next) next.textContent = stats.unresolved.length
        ? `Cấu trúc còn ${stats.unresolved.length} vùng trang chưa xác định. Hệ thống sẽ tạo lại một lượt Scanner; không cần tự sửa JSON.`
        : 'Việc tiếp theo: gửi một prompt Scanner cho AI để xác định các bài và phạm vi trang. Đây là lượt cấu trúc duy nhất.';
      if (progressText) progressText.textContent = stats.unresolved.length ? 'Cần xác định lại cấu trúc' : 'Bước 1/3 · Xác định cấu trúc';
      if (progressFill) progressFill.style.width = '12%';
      if (primary) { primary.textContent = stats.unresolved.length ? `Quét lại cấu trúc với ${providerName()}` : `Bắt đầu với ${providerName()}`; primary.disabled = busy; }
      return;
    }

    updateStep('guidedStep1', 'done', 'Đã có cấu trúc');

    if (stats.pending.length) {
      currentMode = 'batch';
      const percent = stats.totalLessons ? Math.round((stats.doneLessons / stats.totalLessons) * 100) : 0;
      updateStep('guidedStep2', 'current', `${stats.doneLessons}/${stats.totalLessons} bài`);
      updateStep('guidedStep3', 'future', 'Chờ đủ nội dung');
      if (next) next.textContent = `Việc tiếp theo: chuẩn hóa lô kế tiếp. Hệ thống tự chọn các phần chưa xong, tối đa ${MAX_BATCH_CHUNKS} phần / ${MAX_BATCH_PAGES} trang và kiểm định riêng từng phần.`;
      if (progressText) progressText.textContent = `${stats.doneLessons}/${stats.totalLessons} bài hoàn tất · ${stats.pending.length} phần còn chờ`;
      if (progressFill) progressFill.style.width = `${33 + Math.round(percent * 0.5)}%`;
      if (primary) { primary.textContent = `Sao chép lượt tiếp theo cho ${providerName()}`; primary.disabled = busy; }
      return;
    }

    if (stats.review.length) {
      currentMode = 'review';
      currentReviewChunk = stats.review[0];
      updateStep('guidedStep2', 'warning', `${stats.review.length} phần cần rà soát`);
      updateStep('guidedStep3', 'future', 'Chưa kích hoạt');
      if (next) next.textContent = `Nội dung đã đi hết sách nhưng còn ${stats.review.length} phần AI đánh dấu chưa chắc chắn. Hệ thống sẽ xử lý lại từng phần này trước khi kích hoạt nguồn.`;
      if (progressText) progressText.textContent = `${stats.totalLessons}/${stats.totalLessons} bài đã đi qua · còn ${stats.review.length} phần cần làm sạch`;
      if (progressFill) progressFill.style.width = '88%';
      if (primary) { primary.textContent = `Xử lý lại phần cần rà soát`; primary.disabled = busy; }
      return;
    }

    if (plan.plan_status !== 'ASSEMBLED') {
      currentMode = 'assemble';
      updateStep('guidedStep2', 'done', `${stats.totalLessons}/${stats.totalLessons} bài`);
      updateStep('guidedStep3', 'current', 'Sẵn sàng ghép');
      if (next) next.textContent = 'Tất cả nội dung đã qua kiểm định. Bấm một lần để hệ thống tự ghép, kiểm coverage toàn sách và kích hoạt nguồn nếu sạch.';
      if (progressText) progressText.textContent = 'Nội dung đã đủ · chờ ghép nguồn';
      if (progressFill) progressFill.style.width = '94%';
      if (primary) { primary.textContent = 'Hoàn tất & kích hoạt nguồn'; primary.disabled = busy; }
      return;
    }

    currentMode = 'done';
    updateStep('guidedStep2', 'done', `${stats.totalLessons}/${stats.totalLessons} bài`);
    updateStep('guidedStep3', 'done', 'Đã ghép');
    if (next) next.textContent = 'Nguồn đã được ghép. Xem trạng thái kho bên dưới; hệ thống sẽ dùng revision đạt kiểm định cho AI ra đề.';
    if (progressText) progressText.textContent = 'Hoàn tất';
    if (progressFill) progressFill.style.width = '100%';
    if (primary) { primary.textContent = '✓ Đã hoàn tất nguồn'; primary.disabled = true; }
  }

  async function refreshState() {
    const doc = selectedDocument();
    currentPlanData = doc ? await readPlan(doc.id) : { plan: null, chunks: [] };
    if (currentPlanData?.plan) {
      const subjectId = currentPlanData.plan.mon_id || doc?.mon_id || '';
      const subjectSelect = document.getElementById('guidedSubject');
      if (subjectSelect && subjectId && subjects.some((subject) => subject.id === subjectId)) subjectSelect.value = subjectId;
      const gradeSelect = document.getElementById('guidedGrade');
      if (gradeSelect && currentPlanData.plan.grade) gradeSelect.value = String(currentPlanData.plan.grade);
    }
    renderState();
  }

  async function loadCatalog() {
    const active = activeSession();
    if (!active) throw new Error('Phiên giáo viên không còn hợp lệ.');
    const [libraryResult, subjectResult] = await Promise.all([
      knowledgeSb.rpc('rpc_knowledge_library_read', { p_staff_token: active.token, p_ma_gv: active.profile.ma_gv }),
      knowledgeSb.rpc('rpc_knowledge_subject_catalog', { p_staff_token: active.token, p_ma_gv: active.profile.ma_gv })
    ]);
    if (libraryResult.error) throw libraryResult.error;
    if (subjectResult.error) throw subjectResult.error;
    if (!libraryResult.data || libraryResult.data.status !== 'success') throw new Error(libraryResult.data?.message || 'Không tải được kho tri thức.');
    if (!subjectResult.data || subjectResult.data.status !== 'success') throw new Error(subjectResult.data?.message || 'Không tải được danh sách môn.');

    documents = (Array.isArray(libraryResult.data.documents) ? libraryResult.data.documents : [])
      .filter((doc) => doc?.id && (doc.source_role || 'KNOWLEDGE_SOURCE') === 'KNOWLEDGE_SOURCE');
    subjects = (Array.isArray(subjectResult.data.subjects) ? subjectResult.data.subjects : [])
      .filter((subject) => subject?.id && subject?.ten_mon);

    const docSelect = document.getElementById('guidedDocument');
    const subjectSelect = document.getElementById('guidedSubject');
    copyOptions(docSelect, documents, (doc) => `${doc.title || doc.original_filename}${doc.page_count ? ` · ${doc.page_count} trang` : ''}`);
    copyOptions(subjectSelect, subjects, (subject) => subject.ten_mon);

    const best = await findBestPlan();
    const saved = readSaved();
    const preferredDoc = best?.documentId || (saved.document_id && documents.some((doc) => doc.id === saved.document_id) ? saved.document_id : '') || (documents.length === 1 ? documents[0].id : '');
    if (preferredDoc) docSelect.value = preferredDoc;
    const doc = selectedDocument();
    if (doc?.mon_id && subjects.some((subject) => subject.id === doc.mon_id)) subjectSelect.value = doc.mon_id;
    else if (saved.subject_id && subjects.some((subject) => subject.id === saved.subject_id)) subjectSelect.value = saved.subject_id;
    const gradeSelect = document.getElementById('guidedGrade');
    const grade = Number(best?.data?.plan?.grade || doc?.grade || saved.grade || 0);
    if ([10, 11, 12].includes(grade)) gradeSelect.value = String(grade);
    const provider = document.getElementById('guidedProvider');
    if (saved.provider && Array.from(provider.options).some((option) => option.value === saved.provider)) provider.value = saved.provider;
    const model = document.getElementById('guidedModel');
    model.value = typeof saved.model === 'string' && saved.model ? saved.model : 'GPT-5.6 Sol';
    if (best?.data) currentPlanData = best.data;
    else await refreshState();
    renderState();
  }

  function persistSelection() {
    writeSaved({
      document_id: document.getElementById('guidedDocument')?.value || '',
      subject_id: document.getElementById('guidedSubject')?.value || '',
      grade: document.getElementById('guidedGrade')?.value || '',
      provider: document.getElementById('guidedProvider')?.value || '',
      model: document.getElementById('guidedModel')?.value || ''
    });
  }

  async function selectionChanged() {
    persistSelection();
    const doc = selectedDocument();
    if (doc) {
      const subject = document.getElementById('guidedSubject');
      if (!subject.value && doc.mon_id && subjects.some((item) => item.id === doc.mon_id)) subject.value = doc.mon_id;
      const grade = document.getElementById('guidedGrade');
      if (!grade.value && [10, 11, 12].includes(Number(doc.grade))) grade.value = String(doc.grade);
    }
    await refreshState();
  }

  function toggleTechnical(mode = 'both') {
    const chunked = document.getElementById('chunkedSourceCard');
    const normalized = document.getElementById('normalizedSourceCard');
    const show = (mode === 'normalized' && normalized?.style.display === 'none') || (mode === 'both' && chunked?.style.display === 'none');
    if (chunked) chunked.style.display = show && mode === 'both' ? '' : 'none';
    if (normalized) normalized.style.display = show ? '' : 'none';
    if (show) (mode === 'normalized' ? normalized : chunked)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hideTechnicalCards() {
    const chunked = document.getElementById('chunkedSourceCard');
    const normalized = document.getElementById('normalizedSourceCard');
    if (chunked) chunked.style.display = 'none';
    if (normalized) normalized.style.display = 'none';
  }

  function installCard() {
    if (document.getElementById('guidedKnowledgeCard')) return true;
    const chunked = document.getElementById('chunkedSourceCard');
    const batch = document.getElementById('chunkedBatchStage');
    if (!chunked || !batch) return false;

    const section = document.createElement('section');
    section.className = 'card guided-card';
    section.id = 'guidedKnowledgeCard';
    section.innerHTML = `
      <div class="guided-head">
        <div><h2>Chuẩn hóa nguồn tri thức</h2><p class="sub">Hệ thống tự nhớ tiến độ, tự chọn phần tiếp theo và tự kiểm định kết quả. Mỗi lúc chỉ cần làm đúng một việc được hiển thị.</p></div>
        <div class="guided-head-actions"><button id="btnGuidedOther" class="secondary" type="button">Nguồn ngắn / Quy định / Đề mẫu</button><button id="btnGuidedTechnical" class="secondary" type="button">Chi tiết kỹ thuật</button></div>
      </div>

      <div class="guided-source"><div><strong id="guidedTitle">Đang tải…</strong><div id="guidedMeta" class="muted"></div></div><button id="btnGuidedChange" class="link-button" type="button">Đổi nguồn</button></div>

      <div id="guidedSetup" class="guided-setup">
        <label>Tài liệu<select id="guidedDocument"><option value="">Đang tải…</option></select></label>
        <label>Môn<select id="guidedSubject"><option value="">Đang tải…</option></select></label>
        <label>Khối<select id="guidedGrade"><option value="">-- Chọn --</option><option value="10">Khối 10</option><option value="11">Khối 11</option><option value="12">Khối 12</option></select></label>
        <label class="guided-advanced">AI<select id="guidedProvider"><option value="CHATGPT_WEB">ChatGPT web</option><option value="GEMINI_WEB">Gemini web</option><option value="OTHER_WEB_AI">AI web khác</option></select></label>
        <label class="guided-advanced">Model<input id="guidedModel" value="GPT-5.6 Sol" placeholder="GPT-5.6 Sol"></label>
      </div>

      <div class="guided-progress" aria-label="Tiến độ chuẩn hóa">
        <div id="guidedStep1" class="guided-step future"><span>1</span><div>Cấu trúc<small>Chưa bắt đầu</small></div></div>
        <div class="guided-line"></div>
        <div id="guidedStep2" class="guided-step future"><span>2</span><div>Nội dung<small>Chưa bắt đầu</small></div></div>
        <div class="guided-line"></div>
        <div id="guidedStep3" class="guided-step future"><span>3</span><div>Sẵn sàng<small>Chưa bắt đầu</small></div></div>
      </div>
      <div class="guided-meter"><div id="guidedProgressFill"></div></div>
      <div id="guidedProgressText" class="guided-progress-text"></div>

      <div class="guided-next-card">
        <div><div class="guided-kicker">VIỆC TIẾP THEO</div><div id="guidedNext" class="guided-next-text">Đang xác định tiến độ…</div></div>
        <button id="btnGuidedPrimary" class="primary guided-primary" type="button">Đang tải…</button>
      </div>

      <div class="guided-return">
        <div><strong>Đưa kết quả AI trở lại hệ thống</strong><div class="muted">Không cần nhớ đang ở Scanner hay lô nào. Hệ thống tự nhận loại kết quả và đưa vào đúng bước.</div></div>
        <div class="guided-return-actions"><button id="btnGuidedPaste" class="secondary" type="button">Dán kết quả AI</button><label class="guided-file-button">Chọn file kết quả<input id="guidedResultFile" type="file" accept=".jsonl,.ndjson,.json,.txt,application/json,text/plain"></label></div>
        <div id="guidedResultDrop" class="guided-drop">Hoặc kéo file JSON/JSONL vào đây</div>
      </div>

      <div class="guided-foot"><button id="btnGuidedOpenAi" class="link-button" type="button">Mở ${providerName()} nếu đã đóng chat</button><span>Tiến độ được lưu trên server; có thể rời trang và quay lại sau.</span></div>
      <div id="guidedStatus" class="guided-status" role="status" aria-live="polite" aria-atomic="true"></div>`;
    chunked.parentNode.insertBefore(section, chunked);

    const style = document.createElement('style');
    style.textContent = `
      .guided-card{border-color:#bfdbfe;box-shadow:0 8px 24px rgba(37,99,235,.08)}.guided-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.guided-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.guided-source{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-top:12px}.guided-source strong{font-size:16px}.link-button{background:transparent;color:#1d4ed8;padding:6px 8px}.guided-setup{display:grid;grid-template-columns:2fr 1fr .8fr 1fr 1fr;gap:10px;margin-top:12px}.guided-setup[hidden]{display:none}.guided-setup label{font-size:12px;font-weight:700}.guided-setup select,.guided-setup input{width:100%;margin-top:5px;border:1px solid #cbd5e1;border-radius:8px;padding:9px;background:white;font:inherit}.guided-progress{display:flex;align-items:center;margin-top:20px}.guided-step{display:flex;align-items:center;gap:8px;min-width:120px}.guided-step>span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:800;border:2px solid #cbd5e1;background:#fff;color:#64748b}.guided-step>div{font-weight:800;font-size:13px}.guided-step small{display:block;font-weight:500;color:#64748b;margin-top:2px}.guided-step.done>span{border-color:#16a34a;background:#dcfce7;color:#166534}.guided-step.current>span{border-color:#2563eb;background:#2563eb;color:#fff}.guided-step.warning>span{border-color:#d97706;background:#fef3c7;color:#92400e}.guided-line{height:2px;background:#e2e8f0;flex:1;margin:0 10px}.guided-meter{height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:14px}.guided-meter>div{height:100%;width:0;background:#2563eb;transition:width .25s ease}.guided-progress-text{font-size:12px;color:#475569;margin-top:6px}.guided-next-card{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;padding:16px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;margin-top:16px}.guided-kicker{font-size:10px;font-weight:900;color:#1d4ed8;letter-spacing:.08em}.guided-next-text{font-size:14px;line-height:1.5;margin-top:4px}.guided-primary{min-width:230px;min-height:44px;font-size:14px}.guided-primary.is-busy{opacity:.8}.guided-return{margin-top:16px;padding:14px;border:1px solid #e2e8f0;border-radius:10px}.guided-return-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.guided-file-button{display:inline-flex;align-items:center;background:#e2e8f0;color:#334155;border-radius:7px;padding:10px 15px;font-weight:700;cursor:pointer}.guided-file-button input{display:none}.guided-drop{margin-top:10px;border:2px dashed #cbd5e1;border-radius:9px;padding:13px;text-align:center;color:#64748b;font-size:12px}.guided-drop.dragover{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.guided-foot{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:10px;font-size:11px;color:#64748b}.guided-status{min-height:20px;margin-top:8px;font-size:12px}.guided-status.ok{color:#166534;font-weight:700}.guided-status.warn{color:#92400e;font-weight:700}.guided-status.error{color:#991b1b;font-weight:700}.guided-status.info{color:#1e40af}.guided-head button,.guided-return button,.guided-primary{transition:transform .08s ease,box-shadow .15s ease}.guided-head button:active,.guided-return button:active,.guided-primary:active{transform:scale(.97)}
      @media(max-width:850px){.guided-setup{grid-template-columns:1fr 1fr}.guided-next-card{grid-template-columns:1fr}.guided-primary{width:100%}.guided-progress{align-items:flex-start}.guided-step{min-width:0;flex:1;flex-direction:column;text-align:center}.guided-line{margin-top:14px}.guided-head{flex-direction:column}.guided-head-actions{justify-content:flex-start}}
      @media(max-width:560px){.guided-setup{grid-template-columns:1fr}.guided-advanced{display:none}.guided-return-actions{flex-direction:column}.guided-file-button{justify-content:center}.guided-foot{align-items:flex-start;flex-direction:column}}
      @media(prefers-reduced-motion:reduce){.guided-meter>div,.guided-head button,.guided-return button,.guided-primary{transition:none!important}}
    `;
    document.head.appendChild(style);

    const changeIds = ['guidedDocument', 'guidedSubject', 'guidedGrade', 'guidedProvider'];
    for (const id of changeIds) document.getElementById(id).addEventListener('change', selectionChanged);
    document.getElementById('guidedModel').addEventListener('change', selectionChanged);
    document.getElementById('btnGuidedPrimary').addEventListener('click', handoff);
    document.getElementById('btnGuidedPaste').addEventListener('click', pasteResult);
    document.getElementById('btnGuidedOpenAi').addEventListener('click', openProviderManually);
    document.getElementById('btnGuidedOther').addEventListener('click', () => toggleTechnical('normalized'));
    document.getElementById('btnGuidedTechnical').addEventListener('click', () => toggleTechnical('both'));
    document.getElementById('btnGuidedChange').addEventListener('click', () => {
      document.getElementById('guidedSetup').hidden = false;
      document.getElementById('guidedDocument').focus();
    });
    document.getElementById('guidedResultFile').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      await fileResult(file);
      event.target.value = '';
    });
    const drop = document.getElementById('guidedResultDrop');
    for (const eventName of ['dragenter', 'dragover']) drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.add('dragover'); });
    for (const eventName of ['dragleave', 'drop']) drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.remove('dragover'); });
    drop.addEventListener('drop', async (event) => fileResult(event.dataTransfer?.files?.[0]));

    hideTechnicalCards();
    return true;
  }

  async function boot() {
    if (!installCard()) {
      const observer = new MutationObserver(() => {
        if (!installCard()) return;
        observer.disconnect();
        boot();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return;
    }
    try {
      setStatus('Đang khôi phục tiến độ…', 'info');
      await loadCatalog();
      setStatus(currentPlanData?.plan ? 'Đã khôi phục tiến độ từ server.' : 'Sẵn sàng bắt đầu.', 'ok');
    } catch (error) {
      setStatus(error.message || 'Không tải được trạng thái chuẩn hóa.', 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  else setTimeout(boot, 0);

  window.addEventListener('beforeunload', () => {
    if (refreshTimer) clearTimeout(refreshTimer);
  });
})();
