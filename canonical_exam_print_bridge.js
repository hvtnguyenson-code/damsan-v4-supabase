/* Canonical room exam -> existing A4/DOCX print bridge 080.
 * Read-only: consumes canonical exam rows already returned by rpc_staff_exam_preview.
 * Never writes room/exam state.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DamSanCanonicalPrint = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const VERSION = '20261013-canonical-room-print-080';
  const FRAME_SRC = 'Tron_De_Trac_Nghiem_V8.html?v=20261013-canonical-room-print-080';
  const FRAME_ID = 'canonicalPrintBridgeFrame';
  const REQUEST_TIMEOUT_MS = 20000;

  function parseQuestionArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error('cau_so không phải mảng câu hỏi.');
      return parsed;
    }
    throw new Error('Dữ liệu cau_so của mã đề không hợp lệ.');
  }

  function firstDefined(obj, keys, fallback = '') {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return fallback;
  }

  function normalizePart(value) {
    const part = String(value ?? '1').trim();
    return ['1', '2', '3'].includes(part) ? part : '1';
  }

  function normalizeCanonicalExams(exams) {
    if (!Array.isArray(exams) || exams.length === 0) {
      throw new Error('Phòng thi chưa có đề chính thức để xuất Word.');
    }

    const flat = [];
    for (const row of exams) {
      const maDe = String(row?.ma_de ?? '').trim();
      if (!maDe) throw new Error('Mã đề trong phòng không hợp lệ.');
      const questions = parseQuestionArray(row?.cau_so);
      const counters = { '1': 0, '2': 0, '3': 0 };

      for (const q of questions) {
        const part = normalizePart(firstDefined(q, ['phan', 'Phan'], '1'));
        counters[part] += 1;
        flat.push({
          Phan: part,
          MucDo: String(firstDefined(q, ['muc_do', 'MucDo'], '') ?? ''),
          NoiDung: String(firstDefined(q, ['noi_dung', 'NoiDung'], '') ?? ''),
          DapAnA: String(firstDefined(q, ['A', 'a', 'DapAnA', 'dap_an_a'], '') ?? ''),
          DapAnB: String(firstDefined(q, ['B', 'b', 'DapAnB', 'dap_an_b'], '') ?? ''),
          DapAnC: String(firstDefined(q, ['C', 'c', 'DapAnC', 'dap_an_c'], '') ?? ''),
          DapAnD: String(firstDefined(q, ['D', 'd', 'DapAnD', 'dap_an_d'], '') ?? ''),
          DapAnDung: String(firstDefined(q, ['dap_an_dung', 'DapAnDung'], '') ?? ''),
          CauSo: 'P' + part + '_' + counters[part],
          MaDe: maDe
        });
      }
    }

    if (!flat.length) throw new Error('Đề chính thức không có câu hỏi để xuất.');
    return flat;
  }

  function frameOrigin(frame) {
    try {
      const url = new URL(frame.src, root.location.href);
      return url.origin && url.origin !== 'null' ? url.origin : root.location.origin;
    } catch {
      return root.location.origin;
    }
  }

  function getOrCreateFrame() {
    if (!root || !root.document) throw new Error('Print bridge chỉ chạy trong trình duyệt.');
    const existing = root.document.getElementById('frameV8');
    if (existing?.contentWindow) return existing;

    let frame = root.document.getElementById(FRAME_ID);
    if (!frame) {
      frame = root.document.createElement('iframe');
      frame.id = FRAME_ID;
      frame.src = FRAME_SRC;
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.position = 'fixed';
      frame.style.width = '1px';
      frame.style.height = '1px';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      frame.style.left = '-10000px';
      frame.style.top = '-10000px';
      root.document.body.appendChild(frame);
    }
    return frame;
  }

  function requestBridge(frame, type, payload) {
    const requestId = 'print_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const origin = frameOrigin(frame);

    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        root.removeEventListener('message', onMessage);
        clearTimeout(timer);
      };
      const onMessage = (event) => {
        if (event.source !== frame.contentWindow) return;
        if (origin !== '*' && event.origin !== origin) return;
        const data = event.data || {};
        if (data.requestId !== requestId) return;
        if (data.type === 'DAMSAN_CANONICAL_PRINT_RESULT') {
          cleanup();
          if (data.status === 'accepted') resolve(data);
          else reject(new Error(data.message || 'Không thể chuyển đề sang bộ dàn trang Word.'));
        }
      };
      root.addEventListener('message', onMessage);

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Bộ dàn trang Word không phản hồi. Hãy tải lại trang và thử lại.'));
      }, REQUEST_TIMEOUT_MS);

      const send = () => {
        try {
          frame.contentWindow.postMessage({ type, requestId, ...payload }, origin);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      if (frame.dataset?.damSanPrintLoaded === '1') {
        send();
      } else if (frame.contentDocument?.readyState === 'complete') {
        frame.dataset.damSanPrintLoaded = '1';
        send();
      } else {
        frame.addEventListener('load', () => {
          frame.dataset.damSanPrintLoaded = '1';
          send();
        }, { once: true });
      }
    });
  }

  async function exportCanonicalExams(exams, options = {}) {
    const payload = normalizeCanonicalExams(exams);
    const frame = getOrCreateFrame();
    return requestBridge(frame, 'DAMSAN_EXPORT_CANONICAL_PRINT', {
      payload,
      exportMode: options.exportMode || 'exam',
      source: options.source || 'canonical-room',
      printContext: options.printContext && typeof options.printContext === 'object'
        ? options.printContext
        : null
    });
  }

  return Object.freeze({
    version: VERSION,
    normalizeCanonicalExams,
    exportCanonicalExams
  });
});
