const KNOWLEDGE_SUPABASE_URL = 'https://xcervjnwlchwfqvbeahy.supabase.co';
const KNOWLEDGE_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZXJ2am53bGNod2ZxdmJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NjksImV4cCI6MjA5MDY1Mjg2OX0.xjrY4YPDb5Q9BTenHrh2dUOnmZbegtKSZQPqzyJdxBo';
const KNOWLEDGE_UPLOAD_ENDPOINT = `${KNOWLEDGE_SUPABASE_URL}/functions/v1/knowledge-upload`;
const KNOWLEDGE_MAX_FILE_SIZE = 50 * 1024 * 1024;
const KNOWLEDGE_ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const knowledgeSb = supabase.createClient(KNOWLEDGE_SUPABASE_URL, KNOWLEDGE_SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let knowledgeSelectedFiles = [];
let knowledgePollTimer = null;
let knowledgeUploadBusy = false;

function knowledgeIsExpired(raw) {
  if (!raw) return true;
  const ms = new Date(raw).getTime();
  return !Number.isFinite(ms) || ms <= Date.now();
}

function knowledgeSession() {
  const token = sessionStorage.getItem('damSan_StaffToken');
  const expiresAt = sessionStorage.getItem('damSan_StaffExpiresAt');
  let profile = null;
  try {
    profile = JSON.parse(sessionStorage.getItem('damSan_GVSession') || 'null');
  } catch {
    profile = null;
  }

  if (!token || knowledgeIsExpired(expiresAt) || !profile || !profile.ma_gv) {
    return null;
  }
  return { token, expiresAt, profile };
}

function knowledgeRequireSession() {
  const session = knowledgeSession();
  if (session) return session;
  knowledgeSetNotice('Phiên giáo viên không còn hợp lệ. Hãy quay lại Cổng giáo viên và đăng nhập lại.', 'error');
  document.getElementById('btnUpload').disabled = true;
  document.getElementById('btnRefresh').disabled = true;
  return null;
}

function knowledgeSetNotice(message, kind = '') {
  const el = document.getElementById('notice');
  el.textContent = message || '';
  el.className = `notice${kind ? ` ${kind}` : ''}`;
  if (!message) el.style.display = 'none';
  else el.style.display = '';
}

function knowledgeEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function knowledgeFormatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function knowledgeFormatDate(raw) {
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN');
}

function knowledgeMime(file) {
  if (file.type && KNOWLEDGE_ALLOWED_MIME.has(file.type)) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  return '';
}

function knowledgeValidateFile(file) {
  const mime = knowledgeMime(file);
  if (!mime) return { valid: false, message: 'Không đúng định dạng PDF/DOC/DOCX.' };
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return { valid: false, message: 'Tệp rỗng hoặc kích thước không hợp lệ.' };
  if (file.size > KNOWLEDGE_MAX_FILE_SIZE) return { valid: false, message: 'Vượt giới hạn 50 MiB.' };
  return { valid: true, mime };
}

function knowledgeSelectionKey(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function knowledgeAddFiles(fileList) {
  const existing = new Set(knowledgeSelectedFiles.map(knowledgeSelectionKey));
  for (const file of Array.from(fileList || [])) {
    const key = knowledgeSelectionKey(file);
    if (!existing.has(key)) {
      knowledgeSelectedFiles.push(file);
      existing.add(key);
    }
  }
  knowledgeRenderUploadQueue();
}

function knowledgeRenderUploadQueue(statusMap = new Map()) {
  const box = document.getElementById('uploadQueue');
  if (!knowledgeSelectedFiles.length) {
    box.innerHTML = '<div class="muted" style="font-size:13px;">Chưa chọn tài liệu.</div>';
    return;
  }

  box.innerHTML = knowledgeSelectedFiles.map((file) => {
    const validation = knowledgeValidateFile(file);
    const status = statusMap.get(knowledgeSelectionKey(file));
    const statusText = status || (validation.valid ? 'Sẵn sàng tải' : validation.message);
    const badgeClass = status && status.includes('Hoàn tất') ? 'READY' : validation.valid ? 'QUEUED' : 'FAILED';
    return `
      <div class="upload-item">
        <div class="meta">
          <div class="name">${knowledgeEscapeHtml(file.name)}</div>
          <div class="status">${knowledgeFormatBytes(file.size)} · ${knowledgeEscapeHtml(validation.valid ? validation.mime : statusText)}</div>
        </div>
        <span class="badge ${badgeClass}">${knowledgeEscapeHtml(statusText)}</span>
      </div>`;
  }).join('');
}

async function knowledgeGateway(payload) {
  const response = await fetch(KNOWLEDGE_UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': KNOWLEDGE_SUPABASE_KEY
    },
    cache: 'no-store',
    body: JSON.stringify(payload)
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !data || data.status !== 'success') {
    const error = new Error(data?.message || `Dịch vụ tải tài liệu trả mã ${response.status}.`);
    error.code = data?.code || 'gateway_failed';
    throw error;
  }
  return data;
}

async function knowledgeUploadOne(file, session, contextHint) {
  const validation = knowledgeValidateFile(file);
  if (!validation.valid) throw new Error(validation.message);

  const common = {
    staff_token: session.token,
    ma_gv: session.profile.ma_gv,
    original_filename: file.name,
    mime_type: validation.mime,
    file_size_bytes: file.size,
    context_hint: contextHint ? { note: contextHint } : {}
  };

  const prepared = await knowledgeGateway({ action: 'prepare', ...common });
  const { error: uploadError } = await knowledgeSb.storage
    .from(prepared.bucket)
    .uploadToSignedUrl(prepared.storage_path, prepared.upload_token, file, {
      contentType: validation.mime,
      upsert: false
    });

  if (uploadError) throw new Error(`Tải tệp lên Storage thất bại: ${uploadError.message}`);

  return knowledgeGateway({
    action: 'complete',
    ...common,
    storage_path: prepared.storage_path
  });
}

async function knowledgeUploadSelected() {
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
  let successCount = 0;
  let firstError = null;

  try {
    for (const file of knowledgeSelectedFiles) {
      const key = knowledgeSelectionKey(file);
      statuses.set(key, 'Đang tải...');
      knowledgeRenderUploadQueue(statuses);
      try {
        await knowledgeUploadOne(file, session, hint);
        statuses.set(key, 'Hoàn tất · QUEUED');
        successCount += 1;
      } catch (error) {
        statuses.set(key, `Lỗi: ${error.message}`);
        if (!firstError) firstError = error;
        if (error.code === 'staff_session_invalid' || error.code === 'staff_identity_mismatch') break;
      }
      knowledgeRenderUploadQueue(statuses);
    }

    await knowledgeLoadLibrary();
    if (firstError) {
      knowledgeSetNotice(`Đã nạp ${successCount}/${knowledgeSelectedFiles.length} tài liệu. Có lỗi: ${firstError.message}`, 'error');
    } else {
      knowledgeSetNotice(`Đã nạp ${successCount} tài liệu vào hàng đợi. Không cần chuẩn hóa thủ công.`, 'ok');
      knowledgeSelectedFiles = [];
      document.getElementById('knowledgeFiles').value = '';
      knowledgeRenderUploadQueue();
    }
  } finally {
    knowledgeUploadBusy = false;
    btn.disabled = false;
    clearBtn.disabled = false;
  }
}

function knowledgeBadge(value) {
  const clean = String(value || 'UNASSESSED').toUpperCase();
  return `<span class="badge ${knowledgeEscapeHtml(clean)}">${knowledgeEscapeHtml(clean)}</span>`;
}

function knowledgeRenderLibrary(documents) {
  const body = document.getElementById('knowledgeBody');
  if (!documents.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty">Kho tri thức chưa có tài liệu.</td></tr>';
    return;
  }

  body.innerHTML = documents.map((doc) => {
    const revision = `${Number(doc.active_revision || 0)} / ${Number(doc.analysis_revision || 0)}`;
    const title = doc.title || doc.original_filename;
    const error = doc.processing_error ? `<div style="color:#991b1b;margin-top:4px;max-width:320px;">${knowledgeEscapeHtml(doc.processing_error)}</div>` : '';
    return `
      <tr>
        <td><strong>${knowledgeEscapeHtml(title)}</strong><div class="muted">${knowledgeEscapeHtml(doc.original_filename)} · ${knowledgeFormatBytes(doc.file_size_bytes)}</div>${error}</td>
        <td>${knowledgeEscapeHtml(doc.document_type || doc.source_format || '-')}</td>
        <td>${knowledgeEscapeHtml(doc.grade || '-')}</td>
        <td>${knowledgeEscapeHtml(doc.page_count || '-')}</td>
        <td>${knowledgeBadge(doc.pipeline_status)}</td>
        <td>${knowledgeBadge(doc.quality_status)}</td>
        <td>${knowledgeEscapeHtml(revision)}</td>
        <td>${knowledgeEscapeHtml(knowledgeFormatDate(doc.updated_at))}</td>
      </tr>`;
  }).join('');
}

async function knowledgeLoadLibrary() {
  const session = knowledgeRequireSession();
  if (!session) return;
  const refreshBtn = document.getElementById('btnRefresh');
  refreshBtn.disabled = true;
  try {
    const { data, error } = await knowledgeSb.rpc('rpc_knowledge_library_read', {
      p_staff_token: session.token,
      p_ma_gv: session.profile.ma_gv
    });
    if (error) throw error;
    if (!data || data.status !== 'success') {
      const err = new Error(data?.message || 'Không thể tải kho tri thức.');
      err.code = data?.code;
      throw err;
    }

    const documents = Array.isArray(data.documents) ? data.documents : [];
    knowledgeRenderLibrary(documents);
    const hasActive = documents.some((doc) => ['QUEUED', 'EXTRACTING', 'OCR', 'ANALYZING'].includes(String(doc.pipeline_status || '').toUpperCase()));
    knowledgeSchedulePoll(hasActive);
  } catch (error) {
    document.getElementById('knowledgeBody').innerHTML = `<tr><td colspan="8" class="empty" style="color:#991b1b;">${knowledgeEscapeHtml(error.message)}</td></tr>`;
    if (error.code === 'staff_session_invalid' || error.code === 'staff_identity_mismatch') {
      knowledgeSetNotice('Phiên giáo viên đã hết hạn hoặc không còn hợp lệ. Hãy đăng nhập lại.', 'error');
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

function knowledgeSchedulePoll(shouldPoll) {
  if (knowledgePollTimer) {
    clearTimeout(knowledgePollTimer);
    knowledgePollTimer = null;
  }
  if (shouldPoll) {
    knowledgePollTimer = setTimeout(() => knowledgeLoadLibrary(), 5000);
  }
}

function knowledgeClearSelection() {
  if (knowledgeUploadBusy) return;
  knowledgeSelectedFiles = [];
  document.getElementById('knowledgeFiles').value = '';
  knowledgeRenderUploadQueue();
}

function knowledgeBindUi() {
  const session = knowledgeRequireSession();
  if (session) {
    document.getElementById('sessionInfo').textContent = `${session.profile.ho_ten || session.profile.ma_gv} · ${session.profile.quyen || 'Giáo viên'}`;
  }

  const dropzone = document.getElementById('dropzone');
  const input = document.getElementById('knowledgeFiles');
  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => knowledgeAddFiles(input.files));

  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
    });
  }
  dropzone.addEventListener('drop', (event) => knowledgeAddFiles(event.dataTransfer.files));

  document.getElementById('btnUpload').addEventListener('click', knowledgeUploadSelected);
  document.getElementById('btnClearSelection').addEventListener('click', knowledgeClearSelection);
  document.getElementById('btnRefresh').addEventListener('click', knowledgeLoadLibrary);

  knowledgeRenderUploadQueue();
  if (session) knowledgeLoadLibrary();
}

document.addEventListener('DOMContentLoaded', knowledgeBindUi);
window.addEventListener('beforeunload', () => {
  if (knowledgePollTimer) clearTimeout(knowledgePollTimer);
});
