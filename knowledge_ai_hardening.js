const KNOWLEDGE_AI_HARDENING_VERSION = '032';
const kaiBuildPrompt031B1 = kaiBuildPrompt;

function kai032NormalizeAnalysisInput(input) {
  const clone = JSON.parse(JSON.stringify(input || {}));
  const extraction = clone?.document?.extraction || {};
  const pageCount = Number(extraction.page_count || clone?.document?.page_count || 0);
  const extractedChars = Number(extraction.extracted_chars || 0);
  const unresolved = Array.isArray(extraction.ocr_unresolved_pages) ? extraction.ocr_unresolved_pages : [];
  const boundaryMode = String(extraction.boundary_mode || '').toUpperCase();

  if (!Number.isFinite(extractedChars) || extractedChars <= 0 || (boundaryMode === 'PDF_PAGE' && pageCount > 0 && unresolved.length >= pageCount)) {
    const error = new Error('Tài liệu chưa có văn bản OCR đủ dùng nên không thể tạo gói AI. Hãy quay lại Kho tri thức và đọc lại tài liệu.');
    error.code = 'extraction_no_usable_text';
    throw error;
  }

  if (boundaryMode === 'PDF_PAGE') {
    clone.instructions = clone.instructions || {};
    clone.instructions.provenance_rule = 'This PDF has physical page boundaries. Preserve the supplied page_number values whenever a unit can be localized; never invent a page number.';
  }
  return clone;
}

kaiBuildPrompt = function kaiBuildPrompt032(input, chunks) {
  return kaiBuildPrompt031B1(kai032NormalizeAnalysisInput(input), chunks);
};

kaiCopyPrompt = async function kaiCopyPrompt032() {
  const box = document.getElementById('promptBox');
  const btn = document.getElementById('btnCopyPrompt');
  const value = box?.value || '';
  if (!value) return kaiNotice('Chưa có prompt để sao chép.', 'error');

  const originalText = btn?.textContent || 'Sao chép prompt';
  try {
    await navigator.clipboard.writeText(value);
    if (btn) btn.textContent = '✓ Đã sao chép';
    kaiNotice('Đã sao chép prompt. Dán nguyên văn vào ChatGPT hoặc Gemini.', 'ok');
  } catch {
    box.focus();
    box.select();
    if (btn) btn.textContent = '✓ Đã chọn prompt';
    kaiNotice('Trình duyệt không cho ghi clipboard tự động. Prompt đã được chọn để sao chép thủ công.', 'info');
  }

  window.setTimeout(() => {
    if (btn) btn.textContent = originalText;
  }, 1800);
};

window.knowledgeAiHardeningDiagnostics = Object.freeze({
  version: KNOWLEDGE_AI_HARDENING_VERSION,
  rejectsUnusableExtraction: true,
  treatsPdfPageAsPhysical: true,
  copyFeedback: true
});
