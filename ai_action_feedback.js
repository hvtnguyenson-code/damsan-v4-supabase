// AI-UX-041A — immediate button feedback for AI/knowledge workflows.
// This layer is visual-only: it never prevents, replaces, or reroutes existing business actions.
(() => {
  'use strict';

  const RESET_MS = 1400;
  const ACK_MS = 180;
  const restoreTimers = new WeakMap();
  const originalLabels = new WeakMap();
  let lastNormalizedAction = '';
  let normalizedStatusObserver = null;
  let normalizedStatusElement = null;

  const normalizedConfig = {
    btnNormalizedPrompt: {
      busy: 'Đang tạo prompt…',
      success: '✓ Prompt sẵn sàng',
      error: '⚠ Tạo prompt lỗi'
    },
    btnNormalizedCopy: {
      busy: 'Đang sao chép…',
      success: '✓ Đã sao chép',
      error: '⚠ Chưa sao chép'
    },
    btnNormalizedRefresh: {
      busy: 'Đang làm mới…',
      success: '✓ Đã làm mới',
      error: '⚠ Làm mới lỗi'
    },
    btnNormalizedImport: {
      busy: 'Đang kiểm định…',
      success: '✓ Đã nhập JSONL',
      error: '⚠ Nhập JSONL lỗi'
    },
    btnNormalizedChatGPT: {
      busy: 'Đang mở…',
      success: '✓ Đã gửi lệnh mở ChatGPT',
      error: '⚠ Không mở được'
    },
    btnNormalizedGemini: {
      busy: 'Đang mở…',
      success: '✓ Đã gửi lệnh mở Gemini',
      error: '⚠ Không mở được'
    }
  };

  function installStyles() {
    if (document.getElementById('damsanActionFeedbackStyles')) return;
    const style = document.createElement('style');
    style.id = 'damsanActionFeedbackStyles';
    style.textContent = `
      button:not(:disabled), [role="button"]:not([aria-disabled="true"]) {
        transition: transform .10s ease, box-shadow .14s ease, filter .14s ease, background-color .14s ease, color .14s ease;
      }
      button:not(:disabled):active, [role="button"]:not([aria-disabled="true"]):active,
      .damsan-action-feedback.is-pressed {
        transform: translateY(1px) scale(.975);
        filter: brightness(.96);
        box-shadow: 0 0 0 3px rgba(37,99,235,.18) !important;
      }
      .damsan-action-feedback.is-busy {
        cursor: progress !important;
        box-shadow: 0 0 0 3px rgba(37,99,235,.14) !important;
      }
      .damsan-action-feedback.is-busy::before {
        content: '';
        display: inline-block;
        width: 12px;
        height: 12px;
        margin-right: 7px;
        vertical-align: -1px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: damsanButtonSpin .65s linear infinite;
      }
      .damsan-action-feedback.is-success {
        background: #15803d !important;
        color: #fff !important;
        box-shadow: 0 0 0 4px rgba(21,128,61,.18) !important;
      }
      .damsan-action-feedback.is-error {
        background: #b91c1c !important;
        color: #fff !important;
        box-shadow: 0 0 0 4px rgba(185,28,28,.16) !important;
        animation: damsanButtonNudge .22s ease-in-out 2;
      }
      @keyframes damsanButtonSpin { to { transform: rotate(360deg); } }
      @keyframes damsanButtonNudge {
        0%,100% { transform: translateX(0); }
        50% { transform: translateX(2px); }
      }
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
    button.classList.remove('is-success', 'is-error');
    button.setAttribute('aria-busy', 'true');
    if (label) button.textContent = label;
  }

  function finish(button, state, label) {
    if (!button) return;
    rememberLabel(button);
    clearRestoreTimer(button);
    button.classList.remove('is-busy');
    button.classList.toggle('is-success', state === 'success');
    button.classList.toggle('is-error', state === 'error');
    button.setAttribute('aria-busy', 'false');
    if (label) button.textContent = label;
    const timer = window.setTimeout(() => restore(button), RESET_MS);
    restoreTimers.set(button, timer);
  }

  function restore(button) {
    if (!button) return;
    clearRestoreTimer(button);
    button.classList.remove('is-busy', 'is-success', 'is-error', 'is-pressed');
    button.removeAttribute('aria-busy');
    const label = originalLabels.get(button);
    if (typeof label === 'string' && label) button.textContent = label;
  }

  function normalizedButton(id) {
    const card = document.getElementById('normalizedSourceCard');
    const button = document.getElementById(id);
    return card && button && card.contains(button) ? button : null;
  }

  function beginNormalized(id) {
    const button = normalizedButton(id);
    const config = normalizedConfig[id];
    if (!button || !config) return;
    begin(button, config.busy);
    if (id !== 'btnNormalizedChatGPT' && id !== 'btnNormalizedGemini') {
      lastNormalizedAction = id;
    }
  }

  function finishNormalized(id, state) {
    const button = normalizedButton(id);
    const config = normalizedConfig[id];
    if (!button || !config) return;
    finish(button, state, state === 'success' ? config.success : config.error);
    if (lastNormalizedAction === id) lastNormalizedAction = '';
  }

  function handleNormalizedStatus() {
    const el = normalizedStatusElement;
    if (!el) return;
    const text = (el.textContent || '').trim();
    if (!text) return;

    if (/^Prompt đã khóa metadata:/i.test(text)) {
      finishNormalized('btnNormalizedPrompt', 'success');
      return;
    }
    if (/^Đã sao chép prompt chuẩn hóa\.?$/i.test(text)) {
      finishNormalized('btnNormalizedCopy', 'success');
      return;
    }
    if (/^Nhập thành công\b/i.test(text)) {
      finishNormalized('btnNormalizedImport', 'success');
      return;
    }
    if (/^Đã nạp \d+ tài liệu\b/i.test(text)) {
      const refresh = normalizedButton('btnNormalizedRefresh');
      if (refresh?.classList.contains('is-busy')) finishNormalized('btnNormalizedRefresh', 'success');
      return;
    }

    if (el.classList.contains('error') && lastNormalizedAction) {
      finishNormalized(lastNormalizedAction, 'error');
    }
  }

  function bindNormalizedStatus() {
    const el = document.getElementById('normalizedStatus');
    if (!el || el === normalizedStatusElement) return Boolean(el);
    normalizedStatusObserver?.disconnect();
    normalizedStatusElement = el;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    normalizedStatusObserver = new MutationObserver(handleNormalizedStatus);
    normalizedStatusObserver.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    handleNormalizedStatus();
    return true;
  }

  function makeStatusRegionsAccessible() {
    for (const id of ['notice', 'handoffStatus', 'resultStatus', 'generationStatus', 'validationStatus']) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (!el.getAttribute('role')) el.setAttribute('role', 'status');
      if (!el.getAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
    }
  }

  function installNormalizedWatcher() {
    if (bindNormalizedStatus()) return;
    const bodyObserver = new MutationObserver(() => {
      if (bindNormalizedStatus()) bodyObserver.disconnect();
    });
    if (document.body) bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  function handleClickCapture(event) {
    const target = event.target instanceof Element ? event.target.closest('button, [role="button"]') : null;
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    pulse(target);

    const card = document.getElementById('normalizedSourceCard');
    if (!card || !card.contains(target) || !target.id || !normalizedConfig[target.id]) return;

    beginNormalized(target.id);
    if (target.id === 'btnNormalizedChatGPT' || target.id === 'btnNormalizedGemini') {
      window.setTimeout(() => finishNormalized(target.id, 'success'), 220);
    }
  }

  function init() {
    installStyles();
    makeStatusRegionsAccessible();
    installNormalizedWatcher();
    document.addEventListener('click', handleClickCapture, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
