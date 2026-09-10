const KNOWLEDGE_EXTRACTION_ENDPOINT = `${KNOWLEDGE_SUPABASE_URL}/functions/v1/knowledge-extraction`;
const KNOWLEDGE_ARTIFACT_MAX_BYTES = 8 * 1024 * 1024;
const KNOWLEDGE_READER_VERSION = '030B2';
const KNOWLEDGE_PDFJS_VERSION = '6.3.289';
const KNOWLEDGE_TESSERACT_VERSION = '7.0.0';
const KNOWLEDGE_MAMMOTH_VERSION = '1.12.2';
const KNOWLEDGE_DOC_TO_TEXT_REVISION = '821695a884e0c0bb8592a635d9524bb3e116cd67';
const KNOWLEDGE_MIN_PAGE_CHARS = 60;
const KNOWLEDGE_MIN_PAGE_WORDS = 10;
const KNOWLEDGE_OCR_MAX_DIMENSION = 2200;

let knowledgePdfJsPromise = null;
const knowledgeReaderPending = new Map();

function knowledgeReaderNormalizeText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function knowledgeReaderTextStats(text) {
  const clean = knowledgeReaderNormalizeText(text);
  const words = clean ? clean.split(/\s+/u).filter(Boolean).length : 0;
  return { chars: clean.length, words };
}

function knowledgeReaderNeedsOcr(text) {
  const stats = knowledgeReaderTextStats(text);
  return stats.chars < KNOWLEDGE_MIN_PAGE_CHARS || stats.words < KNOWLEDGE_MIN_PAGE_WORDS;
}

async function knowledgeReaderPdfJs() {
  if (!knowledgePdfJsPromise) {
    const url = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${KNOWLEDGE_PDFJS_VERSION}/build/pdf.mjs`;
    knowledgePdfJsPromise = import(url).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${KNOWLEDGE_PDFJS_VERSION}/build/pdf.worker.mjs`;
      return pdfjs;
    });
  }
  return knowledgePdfJsPromise;
}

function knowledgeReaderPdfText(textContent) {
  const pieces = [];
  for (const item of textContent?.items || []) {
    if (!item || typeof item.str !== 'string') continue;
    pieces.push(item.str);
    pieces.push(item.hasEOL ? '\n' : ' ');
  }
  return knowledgeReaderNormalizeText(pieces.join(''));
}

function knowledgeReaderCanvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Không thể tạo ảnh trang để OCR.'));
    }, 'image/png');
  });
}

async function knowledgeReaderRenderPdfPage(page) {
  const natural = page.getViewport({ scale: 1 });
  const naturalMax = Math.max(natural.width, natural.height) || 1;
  const scale = Math.max(1, Math.min(2.25, KNOWLEDGE_OCR_MAX_DIMENSION / naturalMax));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Trình duyệt không hỗ trợ Canvas OCR.');
  await page.render({ canvasContext: context, viewport }).promise;
  const blob = await knowledgeReaderCanvasBlob(canvas);
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}

async function knowledgeReaderCreateOcrWorker(progress) {
  if (!window.Tesseract || typeof window.Tesseract.createWorker !== 'function') {
    throw new Error('Bộ OCR chưa tải được.');
  }
  return window.Tesseract.createWorker('vie+eng', 1, {
    workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@${KNOWLEDGE_TESSERACT_VERSION}/dist/worker.min.js`,
    corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${KNOWLEDGE_TESSERACT_VERSION}`,
    langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
    logger: (message) => {
      if (!message || typeof message.progress !== 'number') return;
      const percent = Math.max(0, Math.min(100, Math.round(message.progress * 100)));
      progress(`OCR ${percent}%`);
    }
  });
}

async function knowledgeReaderExtractPdf(file, progress) {
  const pdfjs = await knowledgeReaderPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const pages = [];
  const sparsePages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    progress(`Đọc lớp chữ PDF · trang ${pageNumber}/${pdf.numPages}`);
    const page = await pdf.getPage(pageNumber);
    const text = knowledgeReaderPdfText(await page.getTextContent());
    const stats = knowledgeReaderTextStats(text);
    pages.push({
      page_number: pageNumber,
      text,
      method: 'PDF_TEXT',
      confidence: null,
      direct_chars: stats.chars
    });
    if (knowledgeReaderNeedsOcr(text)) sparsePages.push(pageNumber);
    page.cleanup();
  }

  const ocrPages = [];
  const unresolved = [];
  if (sparsePages.length) {
    let worker = null;
    try {
      progress(`Phát hiện ${sparsePages.length} trang ít/không có lớp chữ · khởi tạo OCR tiếng Việt`);
      worker = await knowledgeReaderCreateOcrWorker(progress);
      for (let index = 0; index < sparsePages.length; index += 1) {
        const pageNumber = sparsePages[index];
        progress(`OCR trang ${pageNumber} · ${index + 1}/${sparsePages.length}`);
        const page = await pdf.getPage(pageNumber);
        try {
          const imageBlob = await knowledgeReaderRenderPdfPage(page);
          const result = await worker.recognize(imageBlob);
          const ocrText = knowledgeReaderNormalizeText(result?.data?.text || '');
          const target = pages[pageNumber - 1];
          ocrPages.push(pageNumber);
          if (ocrText.length > target.text.length) {
            target.text = ocrText;
            target.method = 'OCR_TESSERACT';
            target.confidence = Number.isFinite(Number(result?.data?.confidence))
              ? Math.max(0, Math.min(1, Number(result.data.confidence) / 100))
              : null;
          }
          if (knowledgeReaderNeedsOcr(target.text)) unresolved.push(pageNumber);
        } catch (error) {
          console.warn(`OCR page ${pageNumber} failed`, error);
          unresolved.push(pageNumber);
        } finally {
          page.cleanup();
        }
      }
    } catch (error) {
      console.warn('Knowledge OCR initialization failed', error);
      unresolved.push(...sparsePages.filter((page) => !unresolved.includes(page)));
    } finally {
      if (worker) {
        try { await worker.terminate(); } catch { /* no-op */ }
      }
    }
  }

  try { await pdf.destroy(); } catch { /* no-op */ }
  return {
    source_format: 'PDF',
    boundary_mode: 'PDF_PAGE',
    pages,
    ocr_pages: Array.from(new Set(ocrPages)).sort((a, b) => a - b),
    ocr_unresolved_pages: Array.from(new Set(unresolved)).sort((a, b) => a - b),
    method: sparsePages.length ? 'PDFJS_TEXT_PLUS_SELECTIVE_TESSERACT' : 'PDFJS_TEXT'
  };
}

async function knowledgeReaderExtractDocx(file, progress) {
  if (!window.mammoth || typeof window.mammoth.extractRawText !== 'function') {
    throw new Error('Bộ đọc DOCX chưa tải được.');
  }
  progress('Đọc nội dung DOCX...');
  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = knowledgeReaderNormalizeText(result?.value || '');
  return {
    source_format: 'DOCX',
    boundary_mode: 'LOGICAL_DOCUMENT',
    pages: [{ page_number: 1, text, method: 'MAMMOTH_RAW_TEXT', confidence: null }],
    ocr_pages: [],
    ocr_unresolved_pages: knowledgeReaderNeedsOcr(text) ? [1] : [],
    method: 'MAMMOTH_RAW_TEXT'
  };
}

async function knowledgeReaderExtractLegacyDoc(file, progress) {
  if (typeof window.docToText !== 'function') {
    throw new Error('Bộ đọc DOC 97-2003 chưa tải được.');
  }
  progress('Đọc nội dung DOC 97-2003...');
  const text = knowledgeReaderNormalizeText(window.docToText(await file.arrayBuffer()) || '');
  if (!text) throw new Error('Tệp DOC không đọc được hoặc dùng định dạng Word quá cũ/mã hóa.');
  return {
    source_format: 'DOC',
    boundary_mode: 'LOGICAL_DOCUMENT',
    pages: [{ page_number: 1, text, method: 'MS_DOC_BINARY_TEXT', confidence: null }],
    ocr_pages: [],
    ocr_unresolved_pages: knowledgeReaderNeedsOcr(text) ? [1] : [],
    method: 'MS_DOC_BINARY_TEXT'
  };
}

async function knowledgeReaderExtract(file, progress) {
  const mime = knowledgeMime(file);
  let extracted;
  if (mime === 'application/pdf') extracted = await knowledgeReaderExtractPdf(file, progress);
  else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') extracted = await knowledgeReaderExtractDocx(file, progress);
  else if (mime === 'application/msword') extracted = await knowledgeReaderExtractLegacyDoc(file, progress);
  else throw new Error('Định dạng tài liệu chưa được bộ đọc hỗ trợ.');

  const pages = extracted.pages.map((page) => ({
    page_number: page.page_number,
    text: knowledgeReaderNormalizeText(page.text),
    method: page.method,
    confidence: page.confidence,
    direct_chars: Number(page.direct_chars || 0)
  }));
  const extractedChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  const unresolved = extracted.ocr_unresolved_pages || [];

  return {
    artifact: {
      schema_version: 'DAMSAN_EXTRACT_V1',
      reader_version: KNOWLEDGE_READER_VERSION,
      generated_at: new Date().toISOString(),
      source: {
        filename: file.name,
        mime_type: mime,
        file_size_bytes: file.size
      },
      source_format: extracted.source_format,
      boundary_mode: extracted.boundary_mode,
      pages,
      extraction: {
        method: extracted.method,
        ocr_engine: extracted.ocr_pages.length ? `tesseract.js@${KNOWLEDGE_TESSERACT_VERSION}:vie+eng` : null,
        ocr_pages: extracted.ocr_pages,
        ocr_unresolved_pages: unresolved
      }
    },
    manifest: {
      schema_version: 'DAMSAN_EXTRACT_V1',
      reader_version: KNOWLEDGE_READER_VERSION,
      source_format: extracted.source_format,
      boundary_mode: extracted.boundary_mode,
      method: extracted.method,
      page_count: pages.length,
      extracted_chars: extractedChars,
      ocr_pages: extracted.ocr_pages,
      ocr_unresolved_pages: unresolved,
      quality: unresolved.length ? 'PARTIAL' : 'COMPLETE',
      generated_at: new Date().toISOString()
    }
  };
}

async function knowledgeExtractionGateway(payload) {
  const response = await fetch(KNOWLEDGE_EXTRACTION_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': KNOWLEDGE_SUPABASE_KEY
    },
    cache: 'no-store',
    body: JSON.stringify(payload)
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok || !data || data.status !== 'success') {
    const error = new Error(data?.message || `Dịch vụ lưu kết quả đọc trả mã ${response.status}.`);
    error.code = data?.code || 'extraction_gateway_failed';
    throw error;
  }
  return data;
}

async function knowledgeReaderPersist(file, session, completed, progress) {
  const extracted = await knowledgeReaderExtract(file, progress);
  const artifactJson = JSON.stringify(extracted.artifact);
  const artifactBlob = new Blob([artifactJson], { type: 'application/json' });
  if (artifactBlob.size <= 0 || artifactBlob.size > KNOWLEDGE_ARTIFACT_MAX_BYTES) {
    throw new Error(`Kết quả đọc có kích thước ${knowledgeFormatBytes(artifactBlob.size)}, vượt giới hạn 8 MiB.`);
  }

  progress('Lưu kết quả đọc vào kho riêng tư...');
  const common = {
    staff_token: session.token,
    ma_gv: session.profile.ma_gv,
    document_id: completed.document_id,
    job_id: completed.job_id,
    artifact_size_bytes: artifactBlob.size
  };
  const prepared = await knowledgeExtractionGateway({ action: 'prepare_artifact', ...common });
  if (prepared.idempotent) return prepared;

  const { error: uploadError } = await knowledgeSb.storage
    .from(prepared.bucket)
    .uploadToSignedUrl(prepared.storage_path, prepared.upload_token, artifactBlob, {
      contentType: 'application/json',
      upsert: false
    });
  if (uploadError) throw new Error(`Lưu kết quả đọc thất bại: ${uploadError.message}`);

  return knowledgeExtractionGateway({
    action: 'complete_artifact',
    ...common,
    storage_path: prepared.storage_path,
    manifest: extracted.manifest
  });
}

const knowledgeUploadSelected030B1 = knowledgeUploadSelected;
knowledgeUploadSelected = async function knowledgeUploadSelected030B2() {
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
  let uploadedCount = 0;
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
          uploadedCount += 1;
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
        statuses.set(key, hasSavedRaw
          ? `Đã lưu file gốc · chưa đọc xong: ${error.message}`
          : `Lỗi tải: ${error.message}`);
        if (error.code === 'staff_session_invalid' || error.code === 'staff_identity_mismatch') break;
      }
      knowledgeRenderUploadQueue(statuses);
    }

    await knowledgeLoadLibrary();
    if (firstError) {
      knowledgeSetNotice(
        `Đã tự đọc xong ${extractedCount}/${knowledgeSelectedFiles.length} tài liệu. File gốc đã tải thành công có thể thử đọc lại mà không cần chuẩn hóa. Lỗi đầu tiên: ${firstError.message}`,
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

window.knowledgeReaderDiagnostics = Object.freeze({
  readerVersion: KNOWLEDGE_READER_VERSION,
  pdfjs: KNOWLEDGE_PDFJS_VERSION,
  tesseract: KNOWLEDGE_TESSERACT_VERSION,
  mammoth: KNOWLEDGE_MAMMOTH_VERSION,
  legacyDocRevision: KNOWLEDGE_DOC_TO_TEXT_REVISION,
  pendingCount: () => knowledgeReaderPending.size
});
