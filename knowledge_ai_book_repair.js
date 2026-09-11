// 036B5A1 — repair whole-book index, then surface bounded read-only OCR diagnostics on failure.
(function () {
  'use strict';

  const BOOK_INDEX_ENDPOINT = `${KAI_SUPABASE_URL}/functions/v1/knowledge-book-index-v2`;
  const BOOK_DIAGNOSTIC_ENDPOINT = `${KAI_SUPABASE_URL}/functions/v1/knowledge-book-index-diagnostics`;
  const LARGE_DOCUMENT_PAGE_THRESHOLD = 40;
  const attempted = new Set();
  const diagnosticAttempted = new Set();
  let observer = null;
  let activeRequest = null;

  async function postGateway(endpoint, payload, fallbackMessage, fallbackCode) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey':KAI_SUPABASE_KEY },
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok || !data || data.status !== 'success') {
      const error = new Error(data?.message || `${fallbackMessage} (${response.status}).`);
      error.code = data?.code || fallbackCode;
      error.detection = data?.detection || null;
      throw error;
    }
    return data;
  }

  function bookIndexGateway(payload) {
    return postGateway(BOOK_INDEX_ENDPOINT, payload, 'Dịch vụ chỉ mục sách trả lỗi', 'book_index_repair_failed');
  }

  function bookDiagnosticGateway(payload) {
    return postGateway(BOOK_DIAGNOSTIC_ENDPOINT, payload, 'Dịch vụ chẩn đoán sách trả lỗi', 'book_index_diagnostic_failed');
  }

  function selectedPageCount(select) {
    const text = select?.selectedOptions?.[0]?.textContent || '';
    const match = /·\s*(\d+)\s*trang/i.exec(text);
    return match ? Number(match[1]) : 0;
  }

  function diagnosticText(detection) {
    if (!detection) return '';
    const tocCount = Number(detection.toc_entry_count || 0);
    const anchorCount = Number(detection.body_anchor_count || 0);
    const offset = detection.chosen_offset ?? detection.page_number_offset?.offset ?? '?';
    const source = detection.offset_source || 'none';
    const status = detection.status || '';
    return `TOC=${tocCount} · anchors=${anchorCount} · offset=${offset} · source=${source}${status ? ` · ${status}` : ''}`;
  }

  function renderRepairing(panel) {
    if (!panel) return;
    panel.classList.remove('hidden');
    panel.classList.add('warning');
    panel.innerHTML = '<div class="book-segment-head">Đang kiểm tra lại chỉ mục toàn cuốn...</div>' +
      '<div class="book-segment-note">036B4 đang đọc các khối mục lục nhiều dòng và đối chiếu số trang in với trang PDF. Không gửi nội dung sách sang AI.</div>';
  }

  function renderRepairFailure(panel, error) {
    if (!panel) return;
    const diag = diagnosticText(error?.detection);
    panel.classList.remove('hidden');
    panel.classList.add('warning');
    panel.innerHTML = '<div class="book-segment-head">Chưa dựng được chỉ mục bài đầy đủ — vẫn chặn gửi toàn cuốn</div>' +
      '<div class="book-segment-note">Bộ sửa 036B4 chưa đủ bằng chứng để xác lập toàn bộ ranh giới bài an toàn. Không fallback sang prompt toàn tài liệu.</div>' +
      `<div class="book-segment-diag">${diag || 'Không có diagnostic bổ sung.'}</div>`;
  }

  function compactHits(hits) {
    return Array.isArray(hits) ? hits.map((hit) => ({
      mode: String(hit?.mode || ''),
      lesson_token: String(hit?.lesson_token || ''),
      index: Number.isFinite(Number(hit?.index)) ? Number(hit.index) : null
    })) : [];
  }

  function compactDiagnostic(result) {
    const diagnostics = result?.diagnostics || {};
    return {
      detector_version: String(result?.detector_version || '036B5A'),
      read_only: result?.read_only === true,
      document: {
        id: String(result?.document?.id || ''),
        title: String(result?.document?.title || ''),
        page_count: Number(result?.document?.page_count || 0),
        pipeline_status: String(result?.document?.pipeline_status || ''),
        current_book_index_detector: result?.document?.current_book_index_detector || null,
        current_book_index_segments: Number(result?.document?.current_book_index_segments || 0)
      },
      artifact: {
        schema_version: String(result?.artifact?.schema_version || ''),
        boundary_mode: String(result?.artifact?.boundary_mode || ''),
        page_count: Number(result?.artifact?.page_count || 0)
      },
      early_pages: Array.isArray(diagnostics.early_pages) ? diagnostics.early_pages.map((page) => ({
        page_number: Number(page?.page_number || 0),
        text_chars: Number(page?.text_chars || 0),
        line_count: Number(page?.line_count || 0),
        hits: compactHits(page?.lesson_hits)
      })) : [],
      body_samples: Array.isArray(diagnostics.body_samples) ? diagnostics.body_samples.map((page) => ({
        page_number: Number(page?.page_number || 0),
        text_chars: Number(page?.text_chars || 0),
        hits: compactHits(page?.lesson_hits)
      })) : []
    };
  }

  function summarizeCompactDiagnostic(compact) {
    const earlyHitPages = compact.early_pages.filter((page) => page.hits.length).map((page) => page.page_number);
    const bodyHitPages = compact.body_samples.filter((page) => page.hits.length).map((page) => page.page_number);
    const rawPositions = compact.body_samples.flatMap((page) => page.hits
      .filter((hit) => hit.mode === 'STRICT_RAW' && Number.isFinite(hit.index))
      .map((hit) => hit.index));
    const lateRaw = rawPositions.filter((index) => index > 3500).length;
    const earlyText = earlyHitPages.length ? earlyHitPages.join(',') : 'none';
    const bodyText = bodyHitPages.length ? bodyHitPages.slice(0, 12).join(',') : 'none';
    return `036B5A · early-hit pages=${earlyText} · body-hit pages=${bodyText} · raw-index>3500=${lateRaw}/${rawPositions.length}`;
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.select();
    const ok = document.execCommand('copy');
    temp.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('clipboard_unavailable'));
  }

  function renderDiagnostic(panel, compact) {
    if (!panel) return;
    const summary = summarizeCompactDiagnostic(compact);
    panel.insertAdjacentHTML('beforeend',
      '<div class="book-segment-note" style="margin-top:8px"><strong>Chẩn đoán 036B5A đã sẵn sàng.</strong> ' + summary + '</div>' +
      '<div class="actions" style="margin-top:8px"><button type="button" id="btnCopyBookDiagnostic036B5A" class="secondary">Sao chép chẩn đoán 036B5A</button></div>');
    window.__DAMSAN_BOOK_DIAGNOSTIC_036B5A__ = compact;
    const button = document.getElementById('btnCopyBookDiagnostic036B5A');
    button?.addEventListener('click', async () => {
      const previous = button.textContent;
      try {
        await copyText(JSON.stringify(compact, null, 2));
        button.textContent = '✓ Đã sao chép chẩn đoán';
      } catch {
        button.textContent = 'Không sao chép được — mở Console để lấy dữ liệu';
        console.info('DAMSAN_BOOK_DIAGNOSTIC_036B5A', compact);
      }
      setTimeout(() => { button.textContent = previous; }, 2200);
    }, { once:false });
  }

  function renderDiagnosticFailure(panel, error) {
    if (!panel) return;
    panel.insertAdjacentHTML('beforeend',
      `<div class="book-segment-diag" style="margin-top:8px">036B5A diagnostic failed: ${String(error?.code || error?.message || 'unknown')}</div>`);
  }

  async function runDiagnostics(documentId, session, panel) {
    if (!documentId || diagnosticAttempted.has(documentId)) return;
    diagnosticAttempted.add(documentId);
    try {
      const result = await bookDiagnosticGateway({
        action:'diagnose_book_index',
        staff_token:session.token,
        ma_gv:session.profile.ma_gv,
        document_id:documentId
      });
      if ((document.getElementById('documentSelect')?.value || '') !== documentId) return;
      renderDiagnostic(panel, compactDiagnostic(result));
    } catch (error) {
      if ((document.getElementById('documentSelect')?.value || '') !== documentId) return;
      renderDiagnosticFailure(panel, error);
    }
  }

  async function tryRepair() {
    const panel = document.getElementById('bookSegmentPanel');
    const select = document.getElementById('documentSelect');
    if (!panel || !select) return;
    const documentId = select.value || '';
    if (!documentId || attempted.has(documentId) || activeRequest) return;
    const pageCount = selectedPageCount(select);
    const unresolved = panel.classList.contains('warning');
    if (!unresolved && pageCount < LARGE_DOCUMENT_PAGE_THRESHOLD) return;
    const session = kaiRequireSession();
    if (!session) return;

    attempted.add(documentId);
    renderRepairing(panel);
    activeRequest = bookIndexGateway({
      action:'repair_book_index',
      staff_token:session.token,
      ma_gv:session.profile.ma_gv,
      document_id:documentId
    }).then((result) => {
      if ((document.getElementById('documentSelect')?.value || '') !== documentId) return;
      const count = Number(result?.book_index?.segment_count || 0);
      const diag = diagnosticText(result?.detection);
      kaiNotice(`Đã dựng lại chỉ mục ${count} bài${diag ? ` · ${diag}` : ''}. Đang nạp lại phạm vi bài...`, 'ok');
      setTimeout(() => {
        if ((document.getElementById('documentSelect')?.value || '') === documentId) {
          document.getElementById('documentSelect')?.dispatchEvent(new Event('change', { bubbles:true }));
        }
      }, 80);
    }).catch(async (error) => {
      if ((document.getElementById('documentSelect')?.value || '') !== documentId) return;
      renderRepairFailure(panel, error);
      kaiNotice(`Chưa sửa được chỉ mục sách: ${error.message}`, 'error');
      await runDiagnostics(documentId, session, panel);
    }).finally(() => { activeRequest = null; });
    return activeRequest;
  }

  function observePanel() {
    const panel = document.getElementById('bookSegmentPanel');
    if (!panel) return;
    observer?.disconnect();
    observer = new MutationObserver(() => { setTimeout(tryRepair, 0); });
    observer.observe(panel, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
    setTimeout(tryRepair, 0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(observePanel, 0);
    document.getElementById('documentSelect')?.addEventListener('change', () => setTimeout(tryRepair, 0));
  });
})();
