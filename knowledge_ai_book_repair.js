// 036B4 — re-check large-book indexes using multiline TOC blocks + printed-page calibration.
(function () {
  'use strict';

  const BOOK_INDEX_ENDPOINT = `${KAI_SUPABASE_URL}/functions/v1/knowledge-book-index-v2`;
  const LARGE_DOCUMENT_PAGE_THRESHOLD = 40;
  const attempted = new Set();
  let observer = null;
  let activeRequest = null;

  async function bookIndexGateway(payload) {
    const response = await fetch(BOOK_INDEX_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey':KAI_SUPABASE_KEY },
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok || !data || data.status !== 'success') {
      const error = new Error(data?.message || `Dịch vụ chỉ mục sách trả mã ${response.status}.`);
      error.code = data?.code || 'book_index_repair_failed';
      error.detection = data?.detection || null;
      throw error;
    }
    return data;
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
    }).catch((error) => {
      if ((document.getElementById('documentSelect')?.value || '') !== documentId) return;
      renderRepairFailure(panel, error);
      kaiNotice(`Chưa sửa được chỉ mục sách: ${error.message}`, 'error');
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
