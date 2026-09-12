// AI-UX-041B — explicit button-state feedback for AI/knowledge workflows.
// This layer is visual-only: it never prevents, replaces, or reroutes existing business actions.
(() => {
  'use strict';

  const RESET_MS = 2200;
  const ACK_MS = 240;
  const restoreTimers = new WeakMap();
  const originalLabels = new WeakMap();
  let lastNormalizedAction = '';
  let lastChunkedAction = '';
  let normalizedStatusObserver = null;
  let normalizedStatusElement = null;
  let chunkedStatusObserver = null;
  let chunkedStatusElement = null;

  const normalizedConfig = {
    btnNormalizedPrompt: { busy: 'Đang tạo prompt…', success: '✓ Prompt sẵn sàng', warning: '⚠ Cần kiểm tra', error: '⚠ Tạo prompt lỗi' },
    btnNormalizedCopy: { busy: 'Đang sao chép…', success: '✓ Đã sao chép', warning: '⚠ Cần kiểm tra', error: '⚠ Chưa sao chép' },
    btnNormalizedRefresh: { busy: 'Đang làm mới…', success: '✓ Đã làm mới', warning: '⚠ Cần kiểm tra', error: '⚠ Làm mới lỗi' },
    btnNormalizedImport: { busy: 'Đang kiểm định…', success: '✓ Đã nhập JSONL', warning: '⚠ Cần rà soát', error: '⚠ Nhập JSONL lỗi' },
    btnNormalizedChatGPT: { busy: 'Đang mở…', success: '✓ Đã mở ChatGPT', warning: '⚠ Cần kiểm tra', error: '⚠ Không mở được' },
    btnNormalizedGemini: { busy: 'Đang mở…', success: '✓ Đã mở Gemini', warning: '⚠ Cần kiểm tra', error: '⚠ Không mở được' }
  };

  const chunkedConfig = {
    btnChunkedStructure: { busy: 'Đang tạo Scanner…', success: '✓ Prompt Scanner sẵn sàng', warning: '⚠ Scanner cần rà soát', error: '⚠ Tạo Scanner lỗi' },
    btnChunkedStructureCopy: { busy: 'Đang sao chép…', success: '✓ Đã sao chép Scanner', warning: '⚠ Cần kiểm tra', error: '⚠ Chưa sao chép' },
    btnChunkedChatGPT: { busy: 'Đang mở…', success: '✓ Đã mở ChatGPT', warning: '⚠ Cần kiểm tra', error: '⚠ Không mở được' },
    btnChunkedRefresh: { busy: 'Đang làm mới…', success: '✓ Đã làm mới', warning: '⚠ Có dữ liệu cần rà soát', error: '⚠ Làm mới lỗi' },
    btnChunkedPlanImport: { busy: 'Đang kiểm định kế hoạch…', success: '✓ Kế hoạch hợp lệ', warning: '⚠ Kế hoạch cần rà soát', error: '⚠ Kế hoạch lỗi' },
    btnChunkedPrompt: { busy: 'Đang tạo prompt chunk…', success: '✓ Prompt chunk sẵn sàng', warning: '⚠ Chunk cần rà soát', error: '⚠ Tạo prompt lỗi' },
    btnChunkedCopy: { busy: 'Đang sao chép…', success: '✓ Đã sao chép chunk', warning: '⚠ Cần kiểm tra', error: '⚠ Chưa sao chép' },
    btnChunkedImport: { busy: 'Đang kiểm định chunk…', success: '✓ Đã nhập chunk', warning: '⚠ Chunk cần rà soát', error: '⚠ Nhập chunk lỗi' },
    btnChunkedAssemble: { busy: 'Đang ghép nguồn…', success: '✓ Đã ghép nguồn', warning: '⚠ Nguồn cần rà soát', error: '⚠ Ghép nguồn lỗi' }
  };

  function installStyles() {
    if (document.getElementById('damsanActionFeedbackStyles')) return;
    const style = document.createElement('style');
    style.id = 'damsanActionFeedbackStyles';
    style.textContent = `
      button:not(:disabled), [role="button"]:not([aria-disabled="true"]) {
        transition: transform .11s ease, box-shadow .14s ease, filter .14s ease, background-color .14s ease, color .14s ease, outline-color .14s ease;
      }
      button:not(:disabled):active, [role="button"]:not([aria-disabled="true"]):active,
      .damsan-action-feedback.is-pressed {
        transform: translateY(2px) scale(.945);
        filter: brightness(.84) saturate(1.15);
        box-shadow: 0 0 0 5px rgba(37,99,235,.28), inset 0 0 0 2px rgba(255,255,255,.42) !important;
      }
      .damsan-action-feedback.is-pressed::after {
        content: '✓';
        display: inline-block;
        margin-left: 7px;
        font-weight: 900;
        animation: damsanAckPop .22s ease-out;
      }
      .damsan-action-feedback.is-busy {
        cursor: progress !important;
        outline: 2px solid rgba(37,99,235,.42) !important;
        outline-offset: 2px;
        box-shadow: 0 0 0 5px rgba(37,99,235,.18) !important;
      }
      .damsan-action-feedback.is-busy::before {
        content: '';
        display: inline-block;
        width: 13px;
        height: 13px;
        margin-right: 8px;
        vertical-align: -2px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: damsanButtonSpin .62s linear infinite;
      }
      .damsan-action-feedback.is-success {
        background: #15803d !important;
        color: #fff !important;
        outline: 2px solid rgba(21,128,61,.38) !important;
        outline-offset: 2px;
        box-shadow: 0 0 0 5px rgba(21,128,61,.22) !important;
        animation: damsanSuccessPop .22s ease-out;
      }
      .damsan-action-feedback.is-warning {
        background: #b45309 !important;
        color: #fff !important;
        outline: 2px solid rgba(180,83,9,.34) !important;
        outline-offset: 2px;
        box-shadow: 0 0 0 5px rgba(180,83,9,.18) !important;
      }
      .damsan-action-feedback.is-error {
        background: #b91c1c !important;
        color: #fff !important;
        outline: 2px solid rgba(185,28,28,.34) !important;
        outline-offset: 2px;
        box-shadow: 0 0 0 5px rgba(185,28,28,.20) !important;
        animation: damsanButtonNudge .22s ease-in-out 2;
      }
      @keyframes damsanButtonSpin { to { transform: rotate(360deg); } }
      @keyframes damsanAckPop { 0% { transform: scale(.4); opacity: .2; } 100% { transform: scale(1); opacity: 1; } }
      @keyframes damsanSuccessPop { 0% { transform: scale(.96); } 70% { transform: scale(1.025); } 100% { transform: scale(1); } }
      @keyframes damsanButtonNudge { 0%,100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
      @media (prefers-reduced-motion: reduce) {
        button, [role="button"], .damsan-action-feedback { transition: none !important; animation: none !important; }
        .damsan-action-feedback.is-busy::before { animation-duration: 1.4s; }
      }
    `;
    document.head.appendChild(style);
  }

  function rememberLabel(button) {
    if (!button || originalLabels.has(button)) return;
    originalLabels.set(button, (button.textContent || '').trim());
  }

  function pulse(button) {
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    rememberLabel(button);
    button.classList.add('damsan-action-feedback', 'is-pressed');
    window.setTimeout(() => button.classList.remove('is-pressed'), ACK_MS);
  }

  function clearRestoreTimer(button) {
    const timer = restoreTimers.get(button);
    if (timer) window.clearTimeout(timer);
    restoreTimers.delete(button);
  }

  function begin(button, label) {
    if (!button) return;
    rememberLabel(button);
    clearRestoreTimer(button);
    button.classList.add('damsan-action-feedback', 'is-busy');
    button.classList.remove('is-success', 'is-warning', 'is-error');
    button.setAttribute('aria-busy', 'true');
    if (label) button.textContent = label;
  }

  function finish(button, state, label) {
    if (!button) return;
    rememberLabel(button);
    clearRestoreTimer(button);
    button.classList.remove('is-busy', 'is-pressed');
    button.classList.toggle('is-success', state === 'success');
    button.classList.toggle('is-warning', state === 'warning');
    button.classList.toggle('is-error', state === 'error');
    button.setAttribute('aria-busy', 'false');
    if (label) button.textContent = label;
    const timer = window.setTimeout(() => restore(button), RESET_MS);
    restoreTimers.set(button, timer);
  }

  function restore(button) {
    if (!button) return;
    clearRestoreTimer(button);
    button.classList.remove('is-busy', 'is-success', 'is-warning', 'is-error', 'is-pressed');
    button.removeAttribute('aria-busy');
    const label = originalLabels.get(button);
    if (typeof label === 'string' && label) button.textContent = label;
  }

  function buttonIn(id, containerId) {
    const container = document.getElementById(containerId);
    const button = document.getElementById(id);
    return container && button && container.contains(button) ? button : null;
  }

  function normalizedButton(id) {
    return buttonIn(id, 'normalizedSourceCard');
  }

  function chunkedButton(id) {
    return buttonIn(id, 'chunkedNormalizationCard');
  }

  function beginConfigured(id, configMap, resolver, channel) {
    const button = resolver(id);
    const config = configMap[id];
    if (!button || !config) return;
    begin(button, config.busy);
    if (channel === 'normalized') lastNormalizedAction = id;
    if (channel === 'chunked') lastChunkedAction = id;
  }

  function finishConfigured(id, state, configMap, resolver, channel) {
    const button = resolver(id);
    const config = configMap[id];
    if (!button || !config) return;
    const label = state === 'success' ? config.success : state === 'warning' ? config.warning : config.error;
    finish(button, state, label);
    if (channel === 'normalized' && lastNormalizedAction === id) lastNormalizedAction = '';
    if (channel === 'chunked' && lastChunkedAction === id) lastChunkedAction = '';
  }

  function beginNormalized(id) {
    beginConfigured(id, normalizedConfig, normalizedButton, 'normalized');
  }

  function finishNormalized(id, state) {
    finishConfigured(id, state, normalizedConfig, normalizedButton, 'normalized');
  }

  function beginChunked(id) {
    beginConfigured(id, chunkedConfig, chunkedButton, 'chunked');
  }

  function finishChunked(id, state) {
    finishConfigured(id, state, chunkedConfig, chunkedButton, 'chunked');
  }

  function handleNormalizedStatus() {
    const el = normalizedStatusElement;
    if (!el) return;
    const text = (el.textContent || '').trim();
    if (!text) return;

    if (/^Prompt đã khóa metadata:/i.test(text)) return finishNormalized('btnNormalizedPrompt', 'success');
    if (/^Đã sao chép prompt chuẩn hóa\.?$/i.test(text)) return finishNormalized('btnNormalizedCopy', 'success');
    if (/^Nhập thành công\b/i.test(text)) return finishNormalized('btnNormalizedImport', el.classList.contains('warn') ? 'warning' : 'success');
    if (/^Đã nạp \d+ tài liệu\b/i.test(text)) {
      const refresh = normalizedButton('btnNormalizedRefresh');
      if (refresh?.classList.contains('is-busy')) finishNormalized('btnNormalizedRefresh', 'success');
      return;
    }
    if (el.classList.contains('error') && lastNormalizedAction) finishNormalized(lastNormalizedAction, 'error');
  }

  function handleChunkedStatus() {
    const el = chunkedStatusElement;
    if (!el) return;
    const text = (el.textContent || '').trim();
    if (!text) return;

    if (/^Prompt Scanner đã sẵn sàng:/i.test(text)) return finishChunked('btnChunkedStructure', 'success');
    if (/^Đã sao chép prompt Scanner\.?$/i.test(text)) return finishChunked('btnChunkedStructureCopy', 'success');
    if (/^Kế hoạch hợp lệ:/i.test(text)) return finishChunked('btnChunkedPlanImport', el.classList.contains('warn') ? 'warning' : 'success');
    if (/^Đã sao chép prompt chunk\.?$/i.test(text)) return finishChunked('btnChunkedCopy', 'success');
    if (/^Đã nạp \d+ nguồn kiến thức\b/i.test(text)) {
      const refresh = chunkedButton('btnChunkedRefresh');
      if (refresh?.classList.contains('is-busy')) finishChunked('btnChunkedRefresh', 'success');
      return;
    }

    if (!lastChunkedAction) return;
    if (el.classList.contains('error')) return finishChunked(lastChunkedAction, 'error');
    if (el.classList.contains('warn')) return finishChunked(lastChunkedAction, 'warning');
    if (el.classList.contains('ok')) return finishChunked(lastChunkedAction, 'success');
  }

  function bindStatusElement(id, current, observer, handler, setter) {
    const el = document.getElementById(id);
    if (!el || el === current) return Boolean(el);
    observer?.disconnect();
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    const nextObserver = new MutationObserver(handler);
    nextObserver.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    setter(el, nextObserver);
    handler();
    return true;
  }

  function bindNormalizedStatus() {
    return bindStatusElement('normalizedStatus', normalizedStatusElement, normalizedStatusObserver, handleNormalizedStatus, (el, observer) => {
      normalizedStatusElement = el;
      normalizedStatusObserver = observer;
    });
  }

  function bindChunkedStatus() {
    return bindStatusElement('chunkedStatus', chunkedStatusElement, chunkedStatusObserver, handleChunkedStatus, (el, observer) => {
      chunkedStatusElement = el;
      chunkedStatusObserver = observer;
    });
  }

  function makeStatusRegionsAccessible() {
    for (const id of ['notice', 'handoffStatus', 'resultStatus', 'generationStatus', 'validationStatus', 'normalizedStatus', 'chunkedStatus']) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (!el.getAttribute('role')) el.setAttribute('role', 'status');
      if (!el.getAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
    }
  }

  function installStatusWatchers() {
    const normalizedReady = bindNormalizedStatus();
    const chunkedReady = bindChunkedStatus();
    if (normalizedReady && chunkedReady) return;
    const bodyObserver = new MutationObserver(() => {
      const a = bindNormalizedStatus();
      const b = bindChunkedStatus();
      if (a && b) bodyObserver.disconnect();
    });
    if (document.body) bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function handleClickCapture(event) {
    const target = event.target instanceof Element ? event.target.closest('button, [role="button"]') : null;
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    pulse(target);

    if (target.id && normalizedConfig[target.id] && normalizedButton(target.id)) {
      beginNormalized(target.id);
      if (target.id === 'btnNormalizedChatGPT' || target.id === 'btnNormalizedGemini') {
        window.setTimeout(() => finishNormalized(target.id, 'success'), 260);
      }
      return;
    }

    if (target.id && chunkedConfig[target.id] && chunkedButton(target.id)) {
      beginChunked(target.id);
      if (target.id === 'btnChunkedChatGPT') {
        window.setTimeout(() => finishChunked(target.id, 'success'), 260);
      }
    }
  }

  function init() {
    installStyles();
    makeStatusRegionsAccessible();
    installStatusWatchers();
    document.addEventListener('click', handleClickCapture, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
