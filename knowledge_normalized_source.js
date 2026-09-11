// 038 — AI Web -> DAMSAN_SOURCE_V2 normalized-source workflow.
// Grade and source role are explicit, authoritative user selections.
(function () {
  'use strict';

  const ENDPOINT = `${KNOWLEDGE_SUPABASE_URL}/functions/v1/knowledge-normalized-source`;
  const MAX_FILE_BYTES = 7 * 1024 * 1024;
  let normalizedDocuments = [];
  let preparedDocumentId = '';
  let preparedGrade = 0;
  let preparedRole = '';

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
      setStatus(`Đã nạp ${normalizedDocuments.length} tài liệu. Chọn tài liệu, khối và vai trò nguồn để tạo prompt chuẩn hóa.`, 'info');
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
    const grade = selectedGrade();
    const role = selectedRole();
    return {
      action,
      staff_token: active.token,
      ma_gv: active.profile.ma_gv,
      document_id: doc.id,
      grade,
      source_role: role,
      doc
    };
  }

  async function preparePrompt() {
    try {
      const payload = metadataPayload('prepare_prompt');
      setBusy(true);
      setStatus('Đang dựng prompt DAMSAN_SOURCE_V2...', 'info');
      const data = await gateway(payload);
      document.getElementById('normalizedPrompt').value = data.prompt || '';
      preparedDocumentId = payload.document_id;
      preparedGrade = payload.grade;
      preparedRole = payload.source_role;
      setStatus(`Prompt đã khóa metadata: khối ${payload.grade} · ${payload.source_role}. Hãy mở ChatGPT/Gemini, đính kèm đúng file gốc và yêu cầu AI tạo JSONL.`, 'ok');
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
      if (preparedDocumentId && (payload.document_id !== preparedDocumentId || payload.grade !== preparedGrade || payload.source_role !== preparedRole)) {
        throw new Error('Tài liệu/khối/vai trò đã thay đổi sau khi tạo prompt. Hãy tạo lại prompt trước khi nhập JSONL để tránh gắn sai nguồn.');
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
      setStatus(`Đang kiểm định ${file.name}...`, 'info');
      const result = await gateway({
        ...payload,
        payload_text: text,
        ai_provider: provider,
        ai_model: model
      });
      const activeText = result.active_revision
        ? `đã kích hoạt revision ${result.active_revision}`
        : `revision ${result.revision} cần rà soát vì còn ${result.uncertain_page_count || 0} trang chưa chắc chắn`;
      setStatus(`Nhập thành công ${result.unit_count} units · ${activeText} · khối ${result.grade} · ${result.source_role}.`, result.active_revision ? 'ok' : 'info');
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
    preparedGrade = 0;
    preparedRole = '';
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
      <p class="sub">Đam San không cố tự hiểu bố cục của sách hàng trăm trang. Chọn <strong>khối</strong> và <strong>vai trò nguồn</strong>, hệ thống tạo prompt để ChatGPT/Gemini đọc file gốc và xuất <span class="mono-tag">DAMSAN_SOURCE_V2 JSONL</span>. File JSONL quay lại đây sẽ được server kiểm định trước khi trở thành nguồn dùng để ra đề.</p>
      <div class="normalized-grid">
        <div class="hint-row" style="margin-top:0"><label for="normalizedDocument">Tài liệu gốc *</label><select id="normalizedDocument"><option value="">Đang tải...</option></select></div>
        <div class="hint-row" style="margin-top:0"><label for="normalizedGrade">Khối *</label><select id="normalizedGrade"><option value="">-- Chọn khối --</option><option value="10">Khối 10</option><option value="11">Khối 11</option><option value="12">Khối 12</option></select><div class="help">Không có “Tất cả khối”. Khối được ghi xuyên suốt vào source, scope và request ra đề.</div></div>
        <div class="hint-row" style="margin-top:0"><label for="normalizedRole">Vai trò nguồn *</label><select id="normalizedRole"><option value="KNOWLEDGE_SOURCE">Nguồn kiến thức — SGK/tài liệu học</option><option value="ASSESSMENT_RULE">Quy định ra đề — authority</option><option value="ASSESSMENT_BENCHMARK">Đề mẫu/đề tham khảo — benchmark</option></select></div>
        <div class="hint-row" style="margin-top:0"><label for="normalizedProvider">AI đã dùng</label><select id="normalizedProvider"><option value="CHATGPT_WEB">ChatGPT web</option><option value="GEMINI_WEB">Gemini web</option><option value="OTHER_WEB_AI">AI web khác</option></select></div>
      </div>
      <div class="hint-row"><label for="normalizedModel">Tên model — tùy chọn</label><input id="normalizedModel" placeholder="Ví dụ: GPT-5.6 Sol"></div>
      <div class="actions">
        <button id="btnNormalizedPrompt" class="primary" type="button">Tạo prompt chuẩn hóa</button>
        <button id="btnNormalizedCopy" class="secondary" type="button">Sao chép prompt</button>
        <button id="btnNormalizedChatGPT" class="secondary" type="button">Mở ChatGPT</button>
        <button id="btnNormalizedGemini" class="secondary" type="button">Mở Gemini</button>
        <button id="btnNormalizedRefresh" class="secondary" type="button">Làm mới nguồn</button>
      </div>
      <div class="hint-row"><label for="normalizedPrompt">Prompt gửi cho AI web</label><textarea id="normalizedPrompt" class="normalized-prompt" readonly placeholder="Chọn tài liệu + khối + vai trò nguồn rồi bấm Tạo prompt chuẩn hóa..."></textarea></div>
      <div class="normalized-import">
        <div><strong>Bước nhập lại hệ thống</strong><div class="help">Tải file JSONL/NDJSON AI tạo. Server sẽ kiểm schema, đủ trang, unit_key, ranh giới bài, khối, vai trò nguồn và provenance.</div></div>
        <input id="normalizedFile" type="file" accept=".jsonl,.ndjson,.json,application/x-ndjson,application/json,text/plain">
        <button id="btnNormalizedImport" class="primary" type="button">Kiểm định & nhập JSONL</button>
      </div>
      <div id="normalizedStatus" class="normalized-status"></div>`;
    firstCard.parentNode.insertBefore(section, firstCard);

    const style = document.createElement('style');
    style.textContent = '.normalized-grid{display:grid;grid-template-columns:2fr 1fr 1.5fr 1fr;gap:12px}.normalized-grid select,.normalized-grid input,.normalized-import input,.hint-row input{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit;background:#fff}.normalized-prompt{min-height:250px!important;font-family:Consolas,monospace!important;font-size:12px!important}.normalized-import{margin-top:14px;padding:12px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:9px;display:grid;grid-template-columns:1.5fr 1fr auto;gap:10px;align-items:center}.normalized-status{margin-top:10px;font-size:12px;color:#475569}.normalized-status.ok{color:#166534;font-weight:700}.normalized-status.error{color:#991b1b;font-weight:700}.normalized-status.info{color:#1e40af}.mono-tag{font-family:Consolas,monospace;background:#f1f5f9;padding:2px 5px;border-radius:4px}@media(max-width:850px){.normalized-grid,.normalized-import{grid-template-columns:1fr}}';
    document.head.appendChild(style);

    document.getElementById('btnNormalizedPrompt').addEventListener('click', preparePrompt);
    document.getElementById('btnNormalizedCopy').addEventListener('click', copyPrompt);
    document.getElementById('btnNormalizedChatGPT').addEventListener('click', () => openProvider('https://chatgpt.com/'));
    document.getElementById('btnNormalizedGemini').addEventListener('click', () => openProvider('https://gemini.google.com/app'));
    document.getElementById('btnNormalizedImport').addEventListener('click', importJsonl);
    document.getElementById('btnNormalizedRefresh').addEventListener('click', loadDocuments);
    for (const id of ['normalizedDocument', 'normalizedGrade', 'normalizedRole']) {
      document.getElementById(id).addEventListener('change', resetPrepared);
    }
    loadDocuments();
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(installUi, 0));
})();
