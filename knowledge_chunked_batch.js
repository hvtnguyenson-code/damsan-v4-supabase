// 042C — Batch web-AI helper for long-book normalization.
// Keeps canonical server validation per chunk while reducing teacher interactions.
(() => {
  'use strict';

  const ENDPOINT = `${KNOWLEDGE_SUPABASE_URL}/functions/v1/knowledge-chunked-normalization`;
  const MAX_BATCH_CHUNKS = 5;
  const MAX_BATCH_PAGES = 24;
  const MAX_BATCH_FILE_BYTES = 5 * 1024 * 1024;
  let preparedBatchKeys = [];

  function session() {
    return typeof knowledgeSession === 'function' ? knowledgeSession() : null;
  }

  function setStatus(message, kind = 'info') {
    const el = document.getElementById('chunkedBatchStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = `chunked-status ${kind}`;
  }

  function buttonState(id, state, label) {
    const button = document.getElementById(id);
    if (!button) return;
    if (!button.dataset.originalLabel) button.dataset.originalLabel = (button.textContent || '').trim();
    button.classList.remove('is-busy', 'is-success', 'is-warning', 'is-error');
    if (state) button.classList.add('damsan-action-feedback', `is-${state}`);
    button.setAttribute('aria-busy', state === 'busy' ? 'true' : 'false');
    button.textContent = label || button.dataset.originalLabel;
    if (state && state !== 'busy') {
      window.setTimeout(() => {
        button.classList.remove('is-success', 'is-warning', 'is-error');
        button.removeAttribute('aria-busy');
        button.textContent = button.dataset.originalLabel || button.textContent;
      }, 2200);
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
      throw new Error(data?.detail || data?.message || `Batch normalization trả mã ${response.status}.`);
    }
    return data;
  }

  function selectedDocumentId() {
    return document.getElementById('chunkedDocument')?.value || '';
  }

  async function readCurrentPlan() {
    const active = session();
    const documentId = selectedDocumentId();
    if (!active) throw new Error('Phiên giáo viên không còn hợp lệ.');
    if (!documentId) throw new Error('Hãy chọn tài liệu dài.');
    return gateway({ action: 'read_plan', staff_token: active.token, ma_gv: active.profile.ma_gv, document_id: documentId });
  }

  function pendingLessonChunks(chunks) {
    return (Array.isArray(chunks) ? chunks : [])
      .filter((chunk) => chunk?.chunk_type === 'LESSON' && !['IMPORTED', 'NEEDS_REVIEW'].includes(chunk.status))
      .sort((a, b) => Number(a.chunk_no) - Number(b.chunk_no));
  }

  function nextBatch(chunks) {
    const pending = pendingLessonChunks(chunks);
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

  function batchLabel(batch, pages) {
    const first = batch[0]?.lesson_code || '?';
    const last = batch[batch.length - 1]?.lesson_code || first;
    return `${first}${last !== first ? ` → ${last}` : ''} · ${batch.length} chunk · ${pages} trang`;
  }

  function combinedPrompt(prompts, batch, pages) {
    const header = [
      'Bạn là BATCH LESSON NORMALIZATION WORKER cho hệ thống Đam San V4.',
      `Lượt này có ${batch.length} chunk, tổng cộng ${pages} trang vật lý. Hãy xử lý LẦN LƯỢT từng chunk theo đúng prompt khóa bên dưới.`,
      'ĐẦU RA DUY NHẤT: một luồng JSONL/NDJSON thuần. Không dùng JSON array, không Markdown fence, không lời giải thích.',
      'Mỗi chunk phải bắt đầu bằng đúng một record_type=chunk_status của chính chunk đó, sau đó là các record nội dung của chunk đó; xong chunk này mới chuyển sang chunk tiếp theo.',
      'Không gộp hai chunk. Không bỏ chunk. Không đổi chunk_key. Không dùng kiến thức ngoài PDF.',
      'Nếu một chunk có trang không đọc được, khai đúng missing_pages/uncertain_pages cho chunk đó; vẫn tiếp tục xử lý các chunk còn lại.',
      '',
      `DANH SÁCH CHUNK KHÓA: ${batch.map((c) => `${c.chunk_key}:${c.page_start}-${c.page_end}`).join(' | ')}`,
      '',
      '===== CÁC PROMPT CHUNK CANONICAL ====='
    ];
    return header.concat(prompts.map((prompt, index) => `\n===== CHUNK ${index + 1}/${prompts.length} =====\n${prompt}`)).join('\n');
  }

  async function prepareBatch() {
    try {
      buttonState('btnChunkedBatchPrepare', 'busy', 'Đang tạo prompt lô…');
      setStatus('Đang đọc tiến độ server và gom các chunk tiếp theo…', 'info');
      const active = session();
      const result = await readCurrentPlan();
      if (!result.plan) throw new Error('Chưa có kế hoạch cấu trúc.');
      const { batch, pages, pendingCount } = nextBatch(result.chunks);
      if (!batch.length) throw new Error('Không còn chunk nào chờ xử lý.');
      const prompts = [];
      for (const chunk of batch) {
        const one = await gateway({ action: 'prepare_chunk_prompt', staff_token: active.token, ma_gv: active.profile.ma_gv, plan_id: result.plan.id, chunk_id: chunk.id });
        prompts.push(one.prompt || '');
      }
      preparedBatchKeys = batch.map((chunk) => chunk.chunk_key);
      const area = document.getElementById('chunkedBatchPrompt');
      if (area) area.value = combinedPrompt(prompts, batch, pages);
      const summary = document.getElementById('chunkedBatchSummary');
      if (summary) summary.textContent = `Lô tiếp theo: ${batchLabel(batch, pages)}. Còn ${pendingCount} chunk chưa hoàn tất.`;
      setStatus(`Prompt lô sẵn sàng: ${batchLabel(batch, pages)}.`, 'ok');
      buttonState('btnChunkedBatchPrepare', 'success', '✓ Prompt lô sẵn sàng');
    } catch (error) {
      setStatus(error.message || 'Không tạo được prompt lô.', 'error');
      buttonState('btnChunkedBatchPrepare', 'error', '⚠ Tạo lô lỗi');
    }
  }

  async function copyBatch() {
    const text = document.getElementById('chunkedBatchPrompt')?.value || '';
    if (!text) return setStatus('Chưa có prompt lô để sao chép.', 'error');
    try {
      buttonState('btnChunkedBatchCopy', 'busy', 'Đang sao chép…');
      await navigator.clipboard.writeText(text);
      setStatus('Đã sao chép prompt lô.', 'ok');
      buttonState('btnChunkedBatchCopy', 'success', '✓ Đã sao chép lô');
    } catch {
      const area = document.getElementById('chunkedBatchPrompt');
      area?.focus();
      area?.select();
      document.execCommand('copy');
      setStatus('Đã sao chép prompt lô.', 'ok');
      buttonState('btnChunkedBatchCopy', 'success', '✓ Đã sao chép lô');
    }
  }

  function splitBatchJsonl(text) {
    const bytes = new TextEncoder().encode(text).byteLength;
    if (!text.trim() || bytes > MAX_BATCH_FILE_BYTES) throw new Error('File lô rỗng hoặc vượt 5 MiB.');
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const groups = [];
    let current = null;
    for (let index = 0; index < lines.length; index += 1) {
      let record;
      try { record = JSON.parse(lines[index]); } catch { throw new Error(`JSON không hợp lệ ở dòng ${index + 1}.`); }
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Dòng ${index + 1} phải là một JSON object.`);
      if (String(record.record_type || '').toLowerCase() === 'chunk_status') {
        if (current) groups.push(current);
        const key = String(record.chunk_key || '').trim();
        if (!key) throw new Error(`chunk_status dòng ${index + 1} thiếu chunk_key.`);
        current = { key, lines: [lines[index]] };
      } else {
        if (!current) throw new Error('File lô phải bắt đầu bằng chunk_status.');
        current.lines.push(lines[index]);
      }
    }
    if (current) groups.push(current);
    if (!groups.length || groups.length > MAX_BATCH_CHUNKS) throw new Error('File lô không có chunk hợp lệ hoặc vượt số chunk cho phép.');
    const keys = groups.map((g) => g.key);
    if (new Set(keys).size !== keys.length) throw new Error('File lô có chunk_key trùng.');
    return groups;
  }

  async function importBatch() {
    try {
      const input = document.getElementById('chunkedBatchFile');
      const file = input?.files?.[0];
      if (!file) throw new Error('Hãy chọn file JSONL lô do AI web xuất ra.');
      buttonState('btnChunkedBatchImport', 'busy', 'Đang kiểm định & nhập lô…');
      setStatus(`Đang kiểm định ${file.name}…`, 'info');
      const groups = splitBatchJsonl(await file.text());
      const result = await readCurrentPlan();
      if (!result.plan) throw new Error('Không còn kế hoạch đang hoạt động.');
      const chunkMap = new Map((result.chunks || []).filter((c) => c.chunk_type === 'LESSON').map((c) => [c.chunk_key, c]));
      for (const group of groups) {
        if (!chunkMap.has(group.key)) throw new Error(`Chunk ${group.key} không thuộc kế hoạch hiện tại.`);
      }
      if (preparedBatchKeys.length) {
        const unexpected = groups.map((g) => g.key).filter((key) => !preparedBatchKeys.includes(key));
        if (unexpected.length) throw new Error(`File chứa chunk ngoài lô đã tạo: ${unexpected.join(', ')}.`);
      }
      const active = session();
      const imported = [];
      const warnings = [];
      for (const group of groups) {
        const chunk = chunkMap.get(group.key);
        const one = await gateway({
          action: 'import_chunk_jsonl',
          staff_token: active.token,
          ma_gv: active.profile.ma_gv,
          plan_id: result.plan.id,
          chunk_id: chunk.id,
          payload_text: `${group.lines.join('\n')}\n`,
          ai_provider: document.getElementById('chunkedProvider')?.value || 'CHATGPT_WEB',
          ai_model: document.getElementById('chunkedModel')?.value.trim() || ''
        });
        imported.push(group.key);
        if (one.chunk_status !== 'IMPORTED') warnings.push(`${group.key}:${one.chunk_status}`);
      }
      preparedBatchKeys = [];
      if (input) input.value = '';
      const prompt = document.getElementById('chunkedBatchPrompt');
      if (prompt) prompt.value = '';
      const documentSelect = document.getElementById('chunkedDocument');
      documentSelect?.dispatchEvent(new Event('change', { bubbles: true }));
      const kind = warnings.length ? 'warn' : 'ok';
      setStatus(`Đã nhập ${imported.length} chunk: ${imported.join(', ')}${warnings.length ? ` · cần rà soát: ${warnings.join(', ')}` : ''}.`, kind);
      buttonState('btnChunkedBatchImport', warnings.length ? 'warning' : 'success', warnings.length ? '⚠ Đã nhập, cần rà soát' : '✓ Đã nhập lô');
    } catch (error) {
      setStatus(error.message || 'Không nhập được file lô.', 'error');
      buttonState('btnChunkedBatchImport', 'error', '⚠ Nhập lô lỗi');
    }
  }

  function openChatGPT() {
    buttonState('btnChunkedBatchChatGPT', 'success', '✓ Đã mở ChatGPT');
    window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
  }

  async function refreshBatchSummary() {
    try {
      const result = await readCurrentPlan();
      const pending = pendingLessonChunks(result.chunks);
      const summary = document.getElementById('chunkedBatchSummary');
      if (!summary) return;
      if (!pending.length) {
        summary.textContent = 'Tất cả lesson chunk đã hoàn tất. Có thể chuyển sang Ghép nguồn cuối.';
        return;
      }
      let remaining = [...pending];
      let batches = 0;
      while (remaining.length) {
        const { batch } = nextBatch(remaining);
        if (!batch.length) break;
        const keys = new Set(batch.map((c) => c.id));
        remaining = remaining.filter((c) => !keys.has(c.id));
        batches += 1;
      }
      summary.textContent = `Còn ${pending.length} chunk. Với chính sách tối đa ${MAX_BATCH_CHUNKS} chunk / ${MAX_BATCH_PAGES} trang, ước tính ${batches} lô AI web.`;
    } catch {
      // Base 042 UI owns the authoritative error surface; batch summary can stay quiet.
    }
  }

  function install() {
    if (document.getElementById('chunkedBatchStage')) return true;
    const card = document.getElementById('chunkedSourceCard');
    const assemble = card?.querySelector('.chunked-assemble');
    if (!card || !assemble) return false;
    const stage = document.createElement('div');
    stage.className = 'chunked-stage';
    stage.id = 'chunkedBatchStage';
    stage.innerHTML = `
      <strong>2B. Xử lý theo lô — khuyến nghị</strong>
      <div class="help" style="margin-top:5px">Giữ kiểm định riêng từng chunk ở server, nhưng gom tối đa ${MAX_BATCH_CHUNKS} chunk / ${MAX_BATCH_PAGES} trang vào một lượt ChatGPT. Cùng một chat thì chỉ cần đính kèm PDF một lần.</div>
      <div id="chunkedBatchSummary" class="chunked-summary">Đang tính số lô còn lại…</div>
      <div class="actions">
        <button id="btnChunkedBatchPrepare" class="primary" type="button">Tạo prompt lô tiếp theo</button>
        <button id="btnChunkedBatchCopy" class="secondary" type="button">Sao chép prompt lô</button>
        <button id="btnChunkedBatchChatGPT" class="secondary" type="button">Mở ChatGPT</button>
      </div>
      <textarea id="chunkedBatchPrompt" class="chunked-prompt" readonly placeholder="Hệ thống sẽ gom các chunk tiếp theo nhưng vẫn giữ metadata/coverage riêng cho từng chunk."></textarea>
      <div class="chunked-import"><input id="chunkedBatchFile" type="file" accept=".jsonl,.ndjson,.json,application/x-ndjson,application/json,text/plain"><button id="btnChunkedBatchImport" class="primary" type="button">Kiểm định & nhập lô</button></div>
      <div id="chunkedBatchStatus" class="chunked-status" role="status" aria-live="polite" aria-atomic="true"></div>`;
    card.insertBefore(stage, assemble);
    document.getElementById('btnChunkedBatchPrepare').addEventListener('click', prepareBatch);
    document.getElementById('btnChunkedBatchCopy').addEventListener('click', copyBatch);
    document.getElementById('btnChunkedBatchChatGPT').addEventListener('click', openChatGPT);
    document.getElementById('btnChunkedBatchImport').addEventListener('click', importBatch);
    document.getElementById('chunkedDocument')?.addEventListener('change', () => window.setTimeout(refreshBatchSummary, 350));
    window.setTimeout(refreshBatchSummary, 500);
    return true;
  }

  function boot() {
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  else setTimeout(boot, 0);
})();
