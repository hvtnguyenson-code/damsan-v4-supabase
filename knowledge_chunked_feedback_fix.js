// 042C — Correct chunked-card action feedback target.
// The 041B helper looked for a stale container id; this patch binds visible states directly to #chunkedSourceCard.
(() => {
  'use strict';

  const config = {
    btnChunkedStructure: ['Đang tạo Scanner…', '✓ Prompt Scanner sẵn sàng'],
    btnChunkedStructureCopy: ['Đang sao chép…', '✓ Đã sao chép Scanner'],
    btnChunkedRefresh: ['Đang làm mới…', '✓ Đã làm mới'],
    btnChunkedPlanImport: ['Đang kiểm định kế hoạch…', '✓ Kế hoạch hợp lệ'],
    btnChunkedPrompt: ['Đang tạo prompt chunk…', '✓ Prompt chunk sẵn sàng'],
    btnChunkedCopy: ['Đang sao chép…', '✓ Đã sao chép chunk'],
    btnChunkedImport: ['Đang kiểm định chunk…', '✓ Đã nhập chunk'],
    btnChunkedAssemble: ['Đang ghép nguồn…', '✓ Đã ghép nguồn']
  };
  let lastAction = '';

  function remember(button) {
    if (button && !button.dataset.damsanChunkOriginalLabel) button.dataset.damsanChunkOriginalLabel = (button.textContent || '').trim();
  }

  function setState(id, state, label) {
    const card = document.getElementById('chunkedSourceCard');
    const button = document.getElementById(id);
    if (!card || !button || !card.contains(button)) return;
    remember(button);
    button.classList.add('damsan-action-feedback');
    button.classList.remove('is-busy', 'is-success', 'is-warning', 'is-error');
    if (state) button.classList.add(`is-${state}`);
    button.setAttribute('aria-busy', state === 'busy' ? 'true' : 'false');
    button.textContent = label || button.dataset.damsanChunkOriginalLabel;
    if (state && state !== 'busy') {
      window.setTimeout(() => {
        button.classList.remove('is-success', 'is-warning', 'is-error');
        button.removeAttribute('aria-busy');
        button.textContent = button.dataset.damsanChunkOriginalLabel || button.textContent;
      }, 2200);
    }
  }

  function bindButtons() {
    const card = document.getElementById('chunkedSourceCard');
    if (!card) return false;
    for (const [id, labels] of Object.entries(config)) {
      const button = document.getElementById(id);
      if (!button || button.dataset.chunkFeedbackBound) continue;
      button.dataset.chunkFeedbackBound = '1';
      button.addEventListener('click', () => {
        if (button.disabled) return;
        lastAction = id;
        setState(id, 'busy', labels[0]);
      }, { capture: true });
    }
    return true;
  }

  function bindStatus() {
    const status = document.getElementById('chunkedStatus');
    if (!status || status.dataset.chunkFeedbackObserved) return Boolean(status);
    status.dataset.chunkFeedbackObserved = '1';
    const finish = () => {
      const text = (status.textContent || '').trim();
      if (!text || !lastAction) return;
      let state = status.classList.contains('error') ? 'error' : status.classList.contains('warn') ? 'warning' : status.classList.contains('ok') ? 'success' : '';
      if (!state) return;
      const successLabel = config[lastAction]?.[1] || '✓ Hoàn tất';
      setState(lastAction, state, state === 'success' ? successLabel : state === 'warning' ? '⚠ Cần rà soát' : '⚠ Thao tác lỗi');
      lastAction = '';
    };
    new MutationObserver(finish).observe(status, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    return true;
  }

  function boot() {
    if (bindButtons() && bindStatus()) return;
    const observer = new MutationObserver(() => {
      if (bindButtons() && bindStatus()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  else setTimeout(boot, 0);
})();
