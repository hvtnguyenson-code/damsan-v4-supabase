// 104 — Canonical stimulus preview adapter.
// The server already renders/validates structured stimuli into canonical noi_dung.
// This layer only exposes the same sanitized canonical HTML in teacher review.
(function () {
  'use strict';

  const previousQuestionPreview = window.aieQuestionPreview;
  const ROOT_MARKER = 'data-damsan-stimulus-root';

  function sanitizeCanonicalStem104(rawValue) {
    const raw = String(rawValue || '');
    if (!raw.includes(ROOT_MARKER)) return '';
    if (!window.DOMPurify || typeof window.DOMPurify.sanitize !== 'function') {
      return aieEscape(raw);
    }
    return window.DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'div','span','p','br','strong','b','em','i',
        'table','caption','thead','tbody','tr','th','td','img'
      ],
      ALLOWED_ATTR: [
        'src','alt','width','height','class',
        'data-damsan-stimulus-root',
        'data-damsan-stimulus-type',
        'data-damsan-stimulus-block',
        'data-damsan-stimulus',
        'data-damsan-stimulus-image',
        'data-damsan-stimulus-intro',
        'data-damsan-stimulus-title',
        'data-damsan-stimulus-kind',
        'data-damsan-stimulus-caption',
        'data-damsan-stimulus-unit',
        'data-damsan-stimulus-source',
        'data-damsan-stimulus-provenance',
        'data-damsan-stimulus-question',
        'data-damsan-p3'
      ],
      ALLOW_DATA_ATTR: true
    });
  }

  if (typeof previousQuestionPreview === 'function') {
    window.aieQuestionPreview = function aieQuestionPreview104(question, index) {
      const rawStem = String(question?.noi_dung || question?.NoiDung || '');
      if (!rawStem.includes(ROOT_MARKER)) return previousQuestionPreview(question, index);

      const safeStem = sanitizeCanonicalStem104(rawStem);
      const token = `__DAMSAN_STIMULUS_104_${Number(index) || 0}__`;
      const proxyQuestion = { ...question, noi_dung: token, NoiDung: token };
      let html = previousQuestionPreview(proxyQuestion, index);
      if (html.includes(token)) html = html.replace(token, safeStem);
      return html;
    };
  }

  window.DamSanStimulusPreview104 = Object.freeze({
    version: '104',
    rootMarker: ROOT_MARKER,
    sanitizeCanonicalStem: sanitizeCanonicalStem104
  });
})();
