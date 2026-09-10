// 036/036B — whole-book structure guidance + lazy lesson-scoped semantic handoff.
(function () {
  'use strict';

  const KSEG_ENDPOINT = `${KAI_SUPABASE_URL}/functions/v1/knowledge-segment-bridge`;
  const previousBuildPrompt = kaiBuildPrompt;
  const previousBuildPackage = kaiBuildPackage;
  const previousSubmitResult = kaiSubmitResult;
  let segmentInspection = null;
  let segmentInspectionPromise = null;
  let segmentMode = false;

  kaiBuildPrompt = function kaiBuildPrompt036(input, chunks) {
    const base = previousBuildPrompt(input, chunks);
    const marker = '\nSOURCE PACKAGE:';
    const rules = [
      '',
      'CẤU TRÚC SÁCH / CHƯƠNG / BÀI — BẮT BUỘC:',
      '- Nếu nguồn chứa nhiều bài, phải tách tri thức theo đúng ranh giới từng bài; không gộp kiến thức của hai bài khác nhau vào cùng một unit.',
      '- Mỗi unit thuộc một bài phải có lesson_code và lesson_title. lesson_code phải đúng segment_code được server cấp (BAI_01, BAI_02, ...); lesson_title giữ đúng tên bài nhận diện từ nguồn.',
      '- Chỉ tạo unit cho các bài nằm trong analysis_scope. Không tái tạo, tóm tắt hoặc tham chiếu bài khác dù mô hình biết nội dung đó.',
      '- hierarchy phải duy trì đường dẫn logic từ sách/chương/bài đến mục/tiểu mục. Không tự tạo chương hoặc bài không có căn cứ trong nguồn.',
      '- Với PDF, page_start/page_end và provenance phải phản ánh đúng trang vật lý đã OCR; tuyệt đối không suy đoán số trang.',
      '- Nếu OCR làm tên bài hoặc ranh giới bài không đủ chắc chắn, hạ confidence và đánh dấu is_usable=false thay vì tự đoán.',
      '- Không sao chép mục lục thành các FACT; mục lục chỉ dùng để nhận diện cấu trúc.',
      '- Server sẽ merge các bài được phân tích lần này với active revision trước đó. Không được sinh lại những bài ngoài analysis_scope.',
      ''
    ].join('\n');
    const pos = base.lastIndexOf(marker);
    if (pos < 0) return `${base}${rules}`;
    return `${base.slice(0, pos)}${rules}${base.slice(pos)}`;
  };

  async function segmentGateway(payload) {
    const response = await fetch(KSEG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey':KAI_SUPABASE_KEY },
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok || !data || data.status !== 'success') {
      const error = new Error(data?.message || `Dịch vụ phân tích theo bài trả mã ${response.status}.`);
      error.code = data?.code || 'segment_bridge_failed';
      throw error;
    }
    return data;
  }

  function ensurePanel() {
    let panel = document.getElementById('bookSegmentPanel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'bookSegmentPanel';
    panel.className = 'book-segment-panel hidden';
    const select = document.getElementById('documentSelect');
    const grid = select?.closest('.grid');
    if (grid) grid.insertAdjacentElement('afterend', panel);
    const style = document.createElement('style');
    style.textContent = '.book-segment-panel{margin-top:12px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:10px;padding:12px}.book-segment-panel.hidden{display:none}.book-segment-head{font-size:13px;font-weight:800;color:#312e81;margin-bottom:6px}.book-segment-note{font-size:12px;color:#475569;margin-bottom:8px}.book-segment-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:260px;overflow:auto}.book-segment-row{display:flex;gap:8px;align-items:flex-start;background:white;border:1px solid #e0e7ff;border-radius:7px;padding:8px}.book-segment-row input{width:auto;margin-top:3px}.book-segment-row strong{font-size:12px}.book-segment-row small{display:block;color:#64748b;font-size:11px;margin-top:2px}.book-segment-done{opacity:.72}.book-segment-badge{display:inline-block;margin-left:5px;border-radius:999px;padding:1px 6px;background:#dcfce7;color:#166534;font-size:10px}@media(max-width:760px){.book-segment-list{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    return panel;
  }

  function renderInspection(info) {
    const panel = ensurePanel();
    const segments = Array.isArray(info?.book_index?.segments) ? info.book_index.segments : [];
    if (!info?.is_book || segments.length < 2) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    const coverage = new Set((Array.isArray(info.semantic_coverage) ? info.semantic_coverage : []).map((x) => String(x).toUpperCase()));
    const done = segments.filter((s) => coverage.has(String(s.segment_code || '').toUpperCase())).length;
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="book-segment-head">Chọn bài cần AI phân tích</div>
      <div class="book-segment-note">Hệ thống nhận diện ${segments.length} bài · đã semantic hóa ${done}/${segments.length}. Chỉ các trang của bài được tick mới đi sang ChatGPT/Gemini.</div>
      <div class="book-segment-list">${segments.map((segment) => {
        const code = String(segment.segment_code || '');
        const analyzed = coverage.has(code.toUpperCase());
        const range = Number(segment.page_start) === Number(segment.page_end)
          ? `trang ${Number(segment.page_start)}` : `trang ${Number(segment.page_start)}–${Number(segment.page_end)}`;
        return `<label class="book-segment-row${analyzed ? ' book-segment-done' : ''}">
          <input type="checkbox" class="book-segment-check" value="${code.replace(/"/g,'&quot;')}">
          <span><strong>${String(segment.title || code).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</strong>${analyzed ? '<span class="book-segment-badge">Đã phân tích</span>' : ''}<small>${range} · ${code}</small></span>
        </label>`;
      }).join('')}</div>`;
  }

  async function inspectSelectedDocument() {
    const session = kaiRequireSession();
    const documentId = document.getElementById('documentSelect')?.value || '';
    segmentInspection = null;
    segmentMode = false;
    const panel = ensurePanel();
    panel.classList.add('hidden');
    panel.innerHTML = '';
    if (!session || !documentId) return null;
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="book-segment-note">Đang nhận diện cấu trúc sách/bài...</div>';
    segmentInspectionPromise = segmentGateway({
      action:'inspect_document',
      staff_token:session.token,
      ma_gv:session.profile.ma_gv,
      document_id:documentId
    }).then((info) => {
      if ((document.getElementById('documentSelect')?.value || '') !== documentId) return null;
      segmentInspection = info;
      renderInspection(info);
      return info;
    }).catch((error) => {
      if ((document.getElementById('documentSelect')?.value || '') === documentId) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        kaiNotice(`Không đọc được cấu trúc sách: ${error.message}`, 'error');
      }
      return null;
    }).finally(() => { segmentInspectionPromise = null; });
    return segmentInspectionPromise;
  }

  function selectedSegmentCodes() {
    return Array.from(document.querySelectorAll('.book-segment-check:checked')).map((el) => el.value).filter(Boolean);
  }

  async function fetchScopedSource(capability) {
    const chunks = [];
    let first = null;
    let pageStart = 1;
    for (let guard = 0; guard < KAI_MAX_CHUNKS; guard += 1) {
      const data = await segmentGateway({
        action:'get_analysis_input',
        capability_token:capability,
        worker_id:'damsan-knowledge-segment-web-ui-036b',
        page_start:pageStart
      });
      if (!first) first = data;
      chunks.push(kaiCompactSourceChunk(data.source_chunk || {}));
      if (!data.source_chunk?.has_more) return { first, chunks };
      const next = Number(data.source_chunk.next_page_start);
      if (!Number.isSafeInteger(next) || next <= pageStart) throw new Error('Luồng bài học không trả trang tiếp theo hợp lệ.');
      pageStart = next;
    }
    throw new Error('Phạm vi bài học vượt số chunk an toàn của phiên phân tích.');
  }

  kaiBuildPackage = async function kaiBuildPackage036B() {
    if (kaiBusy) return;
    const session = kaiRequireSession();
    if (!session) return;
    const documentId = document.getElementById('documentSelect')?.value || '';
    if (!documentId) return previousBuildPackage();
    if (segmentInspectionPromise) await segmentInspectionPromise;
    if (!segmentInspection || segmentInspection.document_id !== documentId) await inspectSelectedDocument();
    if (!segmentInspection?.is_book) return previousBuildPackage();

    const segmentCodes = selectedSegmentCodes();
    if (!segmentCodes.length) {
      kaiNotice('Đây là tài liệu nhiều bài. Hãy tick đúng bài cần phân tích; hệ thống sẽ không gửi cả cuốn sách sang AI.', 'error');
      return;
    }

    kaiSetBusy(true);
    kaiCapability = '';
    kaiHandoff = null;
    segmentMode = false;
    document.getElementById('promptBox').value = '';
    document.getElementById('resultBox').value = '';
    document.getElementById('handoffStatus').textContent = 'Đang khóa capability vào các bài đã chọn...';
    try {
      const handoff = await segmentGateway({
        action:'create_segment_handoff',
        staff_token:session.token,
        ma_gv:session.profile.ma_gv,
        document_id:documentId,
        segment_codes:segmentCodes
      });
      kaiCapability = handoff.capability_token;
      kaiHandoff = handoff;
      segmentMode = true;
      const collected = await fetchScopedSource(kaiCapability);
      const prompt = kaiBuildPrompt(collected.first, collected.chunks);
      document.getElementById('promptBox').value = prompt;
      const pages = collected.chunks.reduce((sum, chunk) => sum + (Array.isArray(chunk.pages) ? chunk.pages.length : 0), 0);
      document.getElementById('handoffStatus').textContent = `${segmentCodes.length} bài · ${pages} trang nguồn · ${prompt.length.toLocaleString('vi-VN')} ký tự · capability hết hạn ${new Date(handoff.expires_at).toLocaleTimeString('vi-VN')}.`;
      kaiNotice('Đã tạo prompt chỉ từ các bài được chọn. Sao chép sang ChatGPT/Gemini rồi dán JSON trở lại.', 'ok');
    } catch (error) {
      kaiCapability = '';
      kaiHandoff = null;
      segmentMode = false;
      document.getElementById('handoffStatus').textContent = '';
      kaiNotice(error.message || 'Không tạo được gói phân tích theo bài.', 'error');
    } finally { kaiSetBusy(false); }
  };

  kaiSubmitResult = async function kaiSubmitResult036B() {
    if (!segmentMode) return previousSubmitResult();
    if (kaiBusy) return;
    if (!kaiCapability) return kaiNotice('Capability phân tích đã hết hoặc bị mất. Hãy tạo lại gói cho bài đã chọn.', 'error');
    let analysis;
    try { analysis = kaiLooseJson(document.getElementById('resultBox').value); }
    catch (error) { return kaiNotice(`JSON không hợp lệ: ${error.message}`, 'error'); }

    kaiSetBusy(true);
    document.getElementById('resultStatus').textContent = 'Đang kiểm định và merge các bài vào Kho tri thức...';
    try {
      const provider = document.getElementById('provider').value || 'WEB_AI';
      const model = document.getElementById('modelName').value.trim() || 'unspecified';
      const result = await segmentGateway({
        action:'submit_analysis', capability_token:kaiCapability, ai_provider:provider, ai_model:model,
        pipeline_version:'DAMSAN_KNOWLEDGE_V1/036B', analysis
      });
      const active = result.active_revision ? `active revision ${result.active_revision}` : 'chưa kích hoạt tự động';
      const remaining = Number(result.remaining_segments || 0);
      document.getElementById('resultStatus').textContent = `Revision ${result.revision} · ${result.quality_status} · ${active} · còn ${remaining} bài chưa phân tích`;
      kaiNotice(remaining > 0
        ? `Đã lưu các bài vừa phân tích. Còn ${remaining} bài; chỉ cần phân tích khi thực sự dùng.`
        : 'Đã hoàn tất semantic hóa toàn bộ các bài được nhận diện trong tài liệu.', result.active_revision ? 'ok' : 'info');
      kaiCapability = '';
      kaiHandoff = null;
      segmentMode = false;
      segmentInspection = null;
      await kaiLoadDocuments();
      ensurePanel().classList.add('hidden');
    } catch (error) {
      document.getElementById('resultStatus').textContent = '';
      kaiNotice(error.message || 'Không lưu được kết quả phân tích theo bài.', 'error');
    } finally { kaiSetBusy(false); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    ensurePanel();
    document.getElementById('documentSelect')?.addEventListener('change', inspectSelectedDocument);
  });
})();
