// 042 — Route long KNOWLEDGE_SOURCE documents to the chunked workflow.
(() => {
  'use strict';
  const LONG_PAGE_THRESHOLD = 40;

  function pageCountFromSelection() {
    const select = document.getElementById('normalizedDocument');
    const text = select?.selectedOptions?.[0]?.textContent || '';
    const match = text.match(/(?:·|\s)(\d+)\s+trang\b/i);
    return match ? Number(match[1]) : 0;
  }

  function isLongKnowledgeSource() {
    const role = document.getElementById('normalizedRole')?.value || '';
    const pages = pageCountFromSelection();
    return role === 'KNOWLEDGE_SOURCE' && pages > LONG_PAGE_THRESHOLD;
  }

  function applyCopy() {
    const card = document.getElementById('normalizedSourceCard');
    if (!card) return false;
    const heading = card.querySelector('h2');
    const sub = card.querySelector('.sub');
    if (heading) heading.textContent = '0B. Chuẩn hóa một lượt — tài liệu ngắn / Quy định / Đề mẫu';
    if (sub) sub.innerHTML = 'Đường một lượt chỉ dành cho <strong>nguồn kiến thức ngắn (≤40 trang)</strong> hoặc tài liệu <strong>Quy định/Benchmark</strong>. Với SGK/PDF dài, dùng khối <strong>0A. Scanner → từng bài/chunk → Assembler</strong> để tránh model dừng giữa chừng.';
    let note = document.getElementById('normalizedLongSourceGuard');
    if (!note) {
      note = document.createElement('div');
      note.id = 'normalizedLongSourceGuard';
      note.style.cssText = 'display:none;margin:10px 0;padding:10px 12px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:8px;font-size:12px;font-weight:700';
      sub?.insertAdjacentElement('afterend', note);
    }
    refreshGuard();
    return true;
  }

  function refreshGuard() {
    const note = document.getElementById('normalizedLongSourceGuard');
    if (!note) return;
    const pages = pageCountFromSelection();
    if (isLongKnowledgeSource()) {
      note.style.display = 'block';
      note.textContent = `Nguồn kiến thức ${pages} trang: đã khóa đường one-shot. Hãy dùng 0A để quét cấu trúc và xử lý từng chunk.`;
    } else {
      note.style.display = 'none';
      note.textContent = '';
    }
  }

  function blockLongOneShot(event) {
    const button = event.target instanceof Element ? event.target.closest('#btnNormalizedPrompt,#btnNormalizedImport') : null;
    if (!button || !isLongKnowledgeSource()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    refreshGuard();
    const status = document.getElementById('normalizedStatus');
    if (status) {
      status.textContent = 'Tài liệu KNOWLEDGE_SOURCE dài hơn 40 trang phải dùng quy trình 0A Scanner → Chunk → Assembler; đường one-shot đã bị chặn.';
      status.className = 'normalized-status error';
    }
  }

  function bind() {
    if (!applyCopy()) return false;
    document.getElementById('normalizedDocument')?.addEventListener('change', refreshGuard);
    document.getElementById('normalizedRole')?.addEventListener('change', refreshGuard);
    document.addEventListener('click', blockLongOneShot, true);
    return true;
  }

  function boot() {
    if (bind()) return;
    const observer = new MutationObserver(() => {
      if (bind()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
