// 042C/043/044 — Action feedback, compact source intake, and guided-flow bootstrap.
// Visual-only helper: canonical validation remains in the dedicated knowledge services.
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
      const state = status.classList.contains('error') ? 'error' : status.classList.contains('warn') ? 'warning' : status.classList.contains('ok') ? 'success' : '';
      if (!state) return;
      const successLabel = config[lastAction]?.[1] || '✓ Hoàn tất';
      setState(lastAction, state, state === 'success' ? successLabel : state === 'warning' ? '⚠ Cần rà soát' : '⚠ Thao tác lỗi');
      lastAction = '';
    };
    new MutationObserver(finish).observe(status, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    return true;
  }

  function installCompactIntake() {
    const uploadButton = document.getElementById('btnUpload');
    const card = uploadButton?.closest('.card');
    if (!card) return false;
    if (card.dataset.knowledgeIntake043 === '1') return true;
    card.dataset.knowledgeIntake043 = '1';
    card.classList.add('knowledge-intake-compact');

    const heading = card.querySelector('h2');
    if (heading) heading.textContent = 'Thêm tài liệu nguồn';
    const sub = card.querySelector('.sub');
    if (sub) sub.textContent = 'Chỉ mở khi cần bổ sung PDF/DOC/DOCX mới. Sau khi tải lên, hệ thống sẽ tự xác định tiến độ và hướng dẫn đúng bước tiếp theo.';

    const hint = document.getElementById('knowledgeHint');
    if (hint) {
      hint.value = '';
      const hintRow = hint.closest('.hint-row');
      if (hintRow) hintRow.style.display = 'none';
    }
    card.querySelector('.pipeline-note')?.remove();

    const dropzone = document.getElementById('dropzone');
    const actions = uploadButton.closest('.actions');
    const queue = document.getElementById('uploadQueue');
    if (!dropzone || !actions || !queue) return true;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'btnToggleKnowledgeIntake';
    toggle.className = 'secondary knowledge-intake-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '＋ Thêm file mới';

    const body = document.createElement('div');
    body.id = 'knowledgeIntakeBody';
    body.className = 'knowledge-intake-body';
    body.hidden = true;
    sub?.insertAdjacentElement('afterend', toggle);
    toggle.insertAdjacentElement('afterend', body);
    body.append(dropzone, actions, queue);

    uploadButton.textContent = 'Tải lên kho';
    const clearButton = document.getElementById('btnClearSelection');
    if (clearButton) clearButton.textContent = 'Bỏ lựa chọn';

    const setOpen = (open) => {
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? '− Đóng phần thêm tài liệu' : '＋ Thêm file mới';
    };
    toggle.addEventListener('click', () => setOpen(body.hidden));

    const style = document.createElement('style');
    style.textContent = `
      .knowledge-intake-compact{padding:14px 18px}.knowledge-intake-compact h2{margin-bottom:4px}.knowledge-intake-compact .sub{margin-bottom:10px}.knowledge-intake-toggle{margin:0}.knowledge-intake-body{margin-top:12px}.knowledge-intake-body .dropzone{min-height:110px;padding:16px}.knowledge-intake-body .actions{margin-top:10px}.knowledge-intake-body .upload-queue{margin-top:10px}`;
    document.head.appendChild(style);
    return true;
  }

  function loadGuidedFlow044() {
    if (document.getElementById('damsanGuidedFlow044Loader') || document.getElementById('guidedKnowledgeCard')) return true;
    const script = document.createElement('script');
    script.id = 'damsanGuidedFlow044Loader';
    script.src = 'knowledge_guided_flow.js?v=20260912-guided-flow-044';
    script.async = false;
    document.head.appendChild(script);
    return true;
  }

  function boot() {
    const ready = bindButtons() && bindStatus();
    const compact = installCompactIntake();
    const guided = loadGuidedFlow044();
    if (ready && compact && guided) return;
    const observer = new MutationObserver(() => {
      if (bindButtons() && bindStatus() && installCompactIntake() && loadGuidedFlow044()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  else setTimeout(boot, 0);
})();
