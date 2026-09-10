const KNOWLEDGE_OCR_HARDENING_VERSION = '033';
const knowledgeReaderCreateOcrWorker030B2 = knowledgeReaderCreateOcrWorker;
const knowledgeReaderExtractPdf030B2 = knowledgeReaderExtractPdf;
const knowledgeReaderExtract030B2 = knowledgeReaderExtract;

let knowledgeOcrForceRefresh = false;
let knowledgeOcrLastFailure = '';

function knowledgeReaderOcrErrorText(error) {
  return String(error?.message || error || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 360);
}

function knowledgeReaderRememberOcrFailure(error) {
  const detail = knowledgeReaderOcrErrorText(error);
  if (detail) knowledgeOcrLastFailure = detail;
  if (error) console.error('Knowledge OCR runtime error', error);
}

function knowledgeReaderOcrLogger(progress) {
  return (message) => {
    if (!message || typeof message.progress !== 'number') return;
    const percent = Math.max(0, Math.min(100, Math.round(message.progress * 100)));
    const status = String(message.status || '').trim();
    progress(status ? `OCR ${percent}% · ${status}` : `OCR ${percent}%`);
  };
}

async function knowledgeReaderCreateWorkerWithProfile(progress, profile) {
  const logger = knowledgeReaderOcrLogger(progress);
  const options = {
    logger,
    errorHandler: knowledgeReaderRememberOcrFailure,
    ...(profile.options || {})
  };
  progress(profile.message);
  return window.Tesseract.createWorker(['vie', 'eng'], 1, options);
}

knowledgeReaderCreateOcrWorker = async function knowledgeReaderCreateOcrWorker033(progress) {
  if (!window.Tesseract || typeof window.Tesseract.createWorker !== 'function') {
    const error = new Error('Bộ OCR Tesseract chưa tải được. Kiểm tra kết nối mạng rồi thử lại.');
    error.code = 'ocr_runtime_unavailable';
    knowledgeReaderRememberOcrFailure(error);
    throw error;
  }

  const profiles = knowledgeOcrForceRefresh
    ? [
        {
          id: 'refresh-default-v7',
          message: 'Làm mới dữ liệu OCR tiếng Việt + tiếng Anh và khởi tạo lại...',
          options: { cacheMethod: 'refresh' }
        },
        {
          id: 'refresh-nosimd-v7',
          message: 'Thử bộ OCR tương thích dự phòng...',
          options: {
            workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@v${KNOWLEDGE_TESSERACT_VERSION}/dist/worker.min.js`,
            corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@v${KNOWLEDGE_TESSERACT_VERSION}/tesseract-core-lstm.wasm.js`,
            cacheMethod: 'refresh'
          }
        }
      ]
    : [
        {
          id: 'default-v7',
          message: 'Khởi tạo OCR tiếng Việt + tiếng Anh...',
          options: {}
        },
        {
          id: 'refresh-default-v7',
          message: 'OCR mặc định chưa khởi tạo được · làm mới dữ liệu OCR và thử lại...',
          options: { cacheMethod: 'refresh' }
        },
        {
          id: 'refresh-nosimd-v7',
          message: 'Thử bộ OCR tương thích dự phòng...',
          options: {
            workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@v${KNOWLEDGE_TESSERACT_VERSION}/dist/worker.min.js`,
            corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@v${KNOWLEDGE_TESSERACT_VERSION}/tesseract-core-lstm.wasm.js`,
            cacheMethod: 'refresh'
          }
        }
      ];

  const errors = [];
  for (const profile of profiles) {
    try {
      const worker = await knowledgeReaderCreateWorkerWithProfile(progress, profile);
      worker.__damsanOcrProfile = profile.id;
      return worker;
    } catch (error) {
      errors.push(error);
      knowledgeReaderRememberOcrFailure(error);
    }
  }

  const detail = errors.map(knowledgeReaderOcrErrorText).filter(Boolean).slice(-2).join(' | ');
  const error = new Error(`Không thể khởi tạo OCR tiếng Việt. ${detail || 'Kiểm tra kết nối tới CDN OCR rồi thử lại.'}`);
  error.code = 'ocr_initialization_failed';
  throw error;
};

function knowledgeReaderPdfAttemptUsable(extracted) {
  const pages = Array.isArray(extracted?.pages) ? extracted.pages : [];
  const chars = pages.reduce((sum, page) => sum + knowledgeReaderNormalizeText(page?.text).length, 0);
  const unresolved = Array.isArray(extracted?.ocr_unresolved_pages) ? extracted.ocr_unresolved_pages : [];
  return chars > 0 && !(pages.length > 0 && unresolved.length >= pages.length);
}

knowledgeReaderExtractPdf = async function knowledgeReaderExtractPdf033(file, progress) {
  knowledgeOcrLastFailure = '';
  const first = await knowledgeReaderExtractPdf030B2(file, progress);
  if (knowledgeReaderPdfAttemptUsable(first)) return first;

  progress('OCR lần đầu không tạo được văn bản · làm mới bộ dữ liệu OCR và thử lại một lần...');
  knowledgeOcrForceRefresh = true;
  try {
    return await knowledgeReaderExtractPdf030B2(file, progress);
  } finally {
    knowledgeOcrForceRefresh = false;
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

  const runtimeDetail = knowledgeOcrLastFailure ? ` Chi tiết OCR: ${knowledgeOcrLastFailure}` : '';
  const error = new Error(
    boundaryMode === 'PDF_PAGE'
      ? `OCR không đọc được nội dung đủ dùng từ PDF (${Math.max(pageCount, unresolved.length)} trang).${runtimeDetail} Tài liệu gốc vẫn được giữ.`
      : `Bộ đọc không trích xuất được nội dung văn bản đủ dùng.${runtimeDetail} Tài liệu gốc vẫn được giữ.`
  );
  error.code = 'extraction_no_usable_text';
  error.extraction = { page_count: pageCount, extracted_chars: extractedChars, unresolved_pages: unresolved };
  throw error;
}

knowledgeReaderExtract = async function knowledgeReaderExtract033(file, progress) {
  const result = await knowledgeReaderExtract030B2(file, progress);
  return knowledgeReaderAssertUsableExtraction(result);
};

async function knowledgeReaderReportFailure033(session, completed, error) {
  if (!completed?.document_id || !completed?.job_id) return null;
  try {
    return await knowledgeExtractionGateway({
      action: 'fail_extraction',
      staff_token: session.token,
      ma_gv: session.profile.ma_gv,
      document_id: completed.document_id,
      job_id: completed.job_id,
      error_code: String(error?.code || 'browser_extraction_failed').slice(0, 80),
      error_message: String(error?.message || 'Không thể đọc nội dung tài liệu.').slice(0, 500)
    });
  } catch (reportError) {
    console.error('Không thể ghi nhận trạng thái FAILED của tài liệu', reportError);
    return null;
  }
}

knowledgeUploadSelected = async function knowledgeUploadSelected033() {
  if (knowledgeUploadBusy) return;
  const session = knowledgeRequireSession();
  if (!session) return;
  if (!knowledgeSelectedFiles.length) {
    knowledgeSetNotice('Chưa có tài liệu nào được chọn.', 'error');
    return;
  }

  const invalid = knowledgeSelectedFiles.find((file) => !knowledgeValidateFile(file).valid);
  if (invalid) {
    knowledgeSetNotice(`Không thể tải ${invalid.name}: ${knowledgeValidateFile(invalid).message}`, 'error');
    return;
  }

  knowledgeUploadBusy = true;
  const btn = document.getElementById('btnUpload');
  const clearBtn = document.getElementById('btnClearSelection');
  btn.disabled = true;
  clearBtn.disabled = true;
  knowledgeSetNotice('', '');

  const statuses = new Map();
  const hint = document.getElementById('knowledgeHint').value.trim();
  let extractedCount = 0;
  let firstError = null;

  try {
    for (const file of knowledgeSelectedFiles) {
      const key = knowledgeSelectionKey(file);
      let completed = knowledgeReaderPending.get(key)?.completed || null;
      try {
        if (!completed) {
          statuses.set(key, 'Đang tải file gốc...');
          knowledgeRenderUploadQueue(statuses);
          completed = await knowledgeUploadOne(file, session, hint);
        } else {
          statuses.set(key, 'Thử đọc lại file đã lưu...');
          knowledgeRenderUploadQueue(statuses);
        }

        knowledgeReaderPending.set(key, { file, completed });
        const result = await knowledgeReaderPersist(file, session, completed, (message) => {
          statuses.set(key, message);
          knowledgeRenderUploadQueue(statuses);
        });
        knowledgeReaderPending.delete(key);
        statuses.set(key, `Hoàn tất · ${result.pipeline_status || 'EXTRACTED'}`);
        extractedCount += 1;
      } catch (error) {
        if (!firstError) firstError = error;
        const hasSavedRaw = Boolean(completed?.document_id && completed?.job_id);
        if (hasSavedRaw) {
          statuses.set(key, 'Đã lưu file gốc · đang ghi nhận lỗi đọc...');
          knowledgeRenderUploadQueue(statuses);
          await knowledgeReaderReportFailure033(session, completed, error);
          knowledgeReaderPending.delete(key);
        }
        statuses.set(key, hasSavedRaw
          ? `Đã lưu file gốc · đọc thất bại: ${error.message}`
          : `Lỗi tải: ${error.message}`);
        if (error.code === 'staff_session_invalid' || error.code === 'staff_identity_mismatch') break;
      }
      knowledgeRenderUploadQueue(statuses);
    }

    await knowledgeLoadLibrary();
    if (firstError) {
      knowledgeSetNotice(
        `Đã tự đọc xong ${extractedCount}/${knowledgeSelectedFiles.length} tài liệu. Tài liệu đọc lỗi được ghi nhận FAILED thay vì treo ở hàng đợi. Lỗi đầu tiên: ${firstError.message}`,
        'error'
      );
    } else {
      knowledgeSetNotice(`Đã tải và tự đọc xong ${extractedCount} tài liệu. Bước tiếp theo của pipeline là AI phân tích ngữ nghĩa.`, 'ok');
      knowledgeSelectedFiles = [];
      document.getElementById('knowledgeFiles').value = '';
      knowledgeRenderUploadQueue();
    }
  } finally {
    knowledgeUploadBusy = false;
    btn.disabled = false;
    clearBtn.disabled = false;
  }
};

window.knowledgeOcrHardeningDiagnostics = Object.freeze({
  version: KNOWLEDGE_OCR_HARDENING_VERSION,
  languages: ['vie', 'eng'],
  rejectsZeroText: true,
  rejectsAllPdfPagesUnresolved: true,
  retriesWithFreshOcrData: true,
  reportsBrowserFailure: true,
  legacyCreateWorkerAvailable: typeof knowledgeReaderCreateOcrWorker030B2 === 'function'
});
