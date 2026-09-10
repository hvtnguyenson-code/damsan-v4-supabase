const KNOWLEDGE_OCR_HARDENING_VERSION = '032';
const knowledgeReaderCreateOcrWorker030B2 = knowledgeReaderCreateOcrWorker;
const knowledgeReaderExtract030B2 = knowledgeReaderExtract;

function knowledgeReaderOcrLogger(progress) {
  return (message) => {
    if (!message || typeof message.progress !== 'number') return;
    const percent = Math.max(0, Math.min(100, Math.round(message.progress * 100)));
    const status = String(message.status || '').trim();
    progress(status ? `OCR ${percent}% · ${status}` : `OCR ${percent}%`);
  };
}

knowledgeReaderCreateOcrWorker = async function knowledgeReaderCreateOcrWorker032(progress) {
  if (!window.Tesseract || typeof window.Tesseract.createWorker !== 'function') {
    const error = new Error('Bộ OCR Tesseract chưa tải được. Kiểm tra kết nối mạng rồi thử lại.');
    error.code = 'ocr_runtime_unavailable';
    throw error;
  }

  const logger = knowledgeReaderOcrLogger(progress);
  const errors = [];
  const recordError = (error) => {
    errors.push(error);
    console.error('Knowledge OCR worker error', error);
  };

  try {
    progress('Khởi tạo OCR tiếng Việt + tiếng Anh bằng CDN mặc định...');
    return await window.Tesseract.createWorker(['vie', 'eng'], 1, {
      logger,
      errorHandler: recordError
    });
  } catch (primaryError) {
    errors.push(primaryError);
    console.warn('Default Tesseract CDN initialization failed; retry explicit pinned paths.', primaryError);
  }

  try {
    progress('OCR mặc định chưa khởi tạo được · thử lại bằng đường dẫn dự phòng...');
    return await window.Tesseract.createWorker(['vie', 'eng'], 1, {
      workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@${KNOWLEDGE_TESSERACT_VERSION}/dist/worker.min.js`,
      corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${KNOWLEDGE_TESSERACT_VERSION}`,
      langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
      logger,
      errorHandler: recordError
    });
  } catch (fallbackError) {
    errors.push(fallbackError);
    console.error('Fallback Tesseract initialization failed', fallbackError);
    const detail = errors.map((error) => String(error?.message || error || '')).filter(Boolean).slice(-2).join(' | ');
    const error = new Error(`Không thể khởi tạo OCR tiếng Việt. ${detail || 'Kiểm tra kết nối tới CDN OCR rồi thử lại.'}`);
    error.code = 'ocr_initialization_failed';
    throw error;
  }
};

function knowledgeReaderAssertUsableExtraction(result) {
  const manifest = result?.manifest || {};
  const pageCount = Number(manifest.page_count || 0);
  const extractedChars = Number(manifest.extracted_chars || 0);
  const unresolved = Array.isArray(manifest.ocr_unresolved_pages) ? manifest.ocr_unresolved_pages : [];
  const boundaryMode = String(manifest.boundary_mode || '').toUpperCase();
  const noText = !Number.isFinite(extractedChars) || extractedChars <= 0;
  const allPdfPagesUnresolved = boundaryMode === 'PDF_PAGE' && pageCount > 0 && unresolved.length >= pageCount;

  if (!noText && !allPdfPagesUnresolved) return result;

  const error = new Error(
    boundaryMode === 'PDF_PAGE'
      ? `OCR không đọc được nội dung đủ dùng từ PDF (${Math.max(pageCount, unresolved.length)} trang). Tài liệu gốc vẫn được giữ; hãy thử đọc lại sau khi kiểm tra kết nối tới bộ OCR.`
      : 'Bộ đọc không trích xuất được nội dung văn bản đủ dùng. Tài liệu gốc vẫn được giữ để thử lại.'
  );
  error.code = 'extraction_no_usable_text';
  error.extraction = { page_count: pageCount, extracted_chars: extractedChars, unresolved_pages: unresolved };
  throw error;
}

knowledgeReaderExtract = async function knowledgeReaderExtract032(file, progress) {
  const result = await knowledgeReaderExtract030B2(file, progress);
  return knowledgeReaderAssertUsableExtraction(result);
};

window.knowledgeOcrHardeningDiagnostics = Object.freeze({
  version: KNOWLEDGE_OCR_HARDENING_VERSION,
  languages: ['vie', 'eng'],
  rejectsZeroText: true,
  rejectsAllPdfPagesUnresolved: true,
  legacyCreateWorkerAvailable: typeof knowledgeReaderCreateOcrWorker030B2 === 'function'
});
