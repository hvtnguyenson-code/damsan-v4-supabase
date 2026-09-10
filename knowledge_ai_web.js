const KAI_SUPABASE_URL = 'https://xcervjnwlchwfqvbeahy.supabase.co';
const KAI_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZXJ2am53bGNod2ZxdmJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NjksImV4cCI6MjA5MDY1Mjg2OX0.xjrY4YPDb5Q9BTenHrh2dUOnmZbegtKSZQPqzyJdxBo';
const KAI_ENDPOINT = `${KAI_SUPABASE_URL}/functions/v1/knowledge-ai-bridge`;
const KAI_MAX_CHUNKS = 100;
const KAI_MAX_PROMPT_CHARS = 7_500_000;
const kaiSb = supabase.createClient(KAI_SUPABASE_URL, KAI_SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let kaiDocuments = [];
let kaiCapability = '';
let kaiHandoff = null;
let kaiBusy = false;

function kaiSession() {
  const token = sessionStorage.getItem('damSan_StaffToken');
  const expiresAt = sessionStorage.getItem('damSan_StaffExpiresAt');
  let profile = null;
  try { profile = JSON.parse(sessionStorage.getItem('damSan_GVSession') || 'null'); } catch { profile = null; }
  const expiryMs = new Date(expiresAt || '').getTime();
  if (!token || !Number.isFinite(expiryMs) || expiryMs <= Date.now() || !profile?.ma_gv) return null;
  return { token, profile };
}

function kaiNotice(message, kind = 'info') {
  const el = document.getElementById('notice');
  el.textContent = message || '';
  el.className = message ? `notice ${kind}` : 'notice';
}

function kaiSetBusy(busy) {
  kaiBusy = busy;
  for (const id of ['btnBuild', 'btnRefresh', 'btnSubmit']) {
    const el = document.getElementById(id);
    if (el) el.disabled = busy;
  }
}

function kaiRequireSession() {
  const session = kaiSession();
  if (session) return session;
  kaiNotice('Phiên giáo viên không còn hợp lệ. Hãy đăng nhập lại ở Cổng giáo viên.', 'error');
  kaiSetBusy(true);
  return null;
}

async function kaiGateway(payload) {
  const response = await fetch(KAI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': KAI_SUPABASE_KEY },
    cache: 'no-store',
    body: JSON.stringify(payload)
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok || !data || data.status !== 'success') {
    const error = new Error(data?.message || `AI bridge trả mã ${response.status}.`);
    error.code = data?.code || 'knowledge_ai_bridge_failed';
    throw error;
  }
  return data;
}

async function kaiLoadDocuments() {
  const session = kaiRequireSession();
  if (!session) return;
  kaiSetBusy(true);
  try {
    const { data, error } = await kaiSb.rpc('rpc_knowledge_library_read', {
      p_staff_token: session.token,
      p_ma_gv: session.profile.ma_gv
    });
    if (error) throw error;
    if (!data || data.status !== 'success') {
      const e = new Error(data?.message || 'Không đọc được Kho tri thức.');
      e.code = data?.code;
      throw e;
    }
    kaiDocuments = (Array.isArray(data.documents) ? data.documents : []).filter((doc) =>
      ['EXTRACTED', 'ANALYZING'].includes(String(doc.pipeline_status || '').toUpperCase())
    );
    const select = document.getElementById('documentSelect');
    select.innerHTML = kaiDocuments.length
      ? '<option value="">-- Chọn tài liệu --</option>' + kaiDocuments.map((doc) => {
          const title = String(doc.title || doc.original_filename || doc.id);
          const pages = doc.page_count ? ` · ${doc.page_count} trang` : '';
          return `<option value="${String(doc.id).replace(/"/g, '&quot;')}">${title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}${pages}</option>`;
        }).join('')
      : '<option value="">Không có tài liệu đang chờ AI phân tích</option>';
    if (!kaiDocuments.length) {
      kaiNotice('Chưa có tài liệu ở trạng thái EXTRACTED/ANALYZE. Hãy nạp và tự đọc tài liệu trong Kho tri thức trước.', 'info');
    } else {
      kaiNotice(`Có ${kaiDocuments.length} tài liệu sẵn sàng chuyển sang AI phân tích.`, 'info');
    }
  } catch (error) {
    kaiNotice(error.message || 'Không tải được danh sách tài liệu.', 'error');
  } finally {
    kaiSetBusy(false);
  }
}

async function kaiResolveJob(documentId, session) {
  const { data, error } = await kaiSb.rpc('rpc_knowledge_analysis_job_read', {
    p_staff_token: session.token,
    p_ma_gv: session.profile.ma_gv,
    p_document_id: documentId
  });
  if (error) throw error;
  if (!data || data.status !== 'success' || !data.job_id) {
    const e = new Error(data?.message || 'Không tìm thấy job ANALYZE hợp lệ cho tài liệu này.');
    e.code = data?.code || 'analysis_job_unavailable';
    throw e;
  }
  return data;
}

function kaiCompactSourceChunk(chunk) {
  if (chunk.boundary_mode === 'LOGICAL_DOCUMENT') {
    return {
      boundary_mode: chunk.boundary_mode,
      char_start: chunk.logical_chunk?.char_start,
      char_end: chunk.logical_chunk?.char_end,
      total_chars: chunk.logical_chunk?.total_chars,
      text: chunk.logical_chunk?.text || '',
      method: chunk.logical_chunk?.method || null,
      confidence: chunk.logical_chunk?.confidence ?? null
    };
  }
  return {
    boundary_mode: chunk.boundary_mode,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    page_count: chunk.page_count,
    pages: Array.isArray(chunk.pages) ? chunk.pages.map((page) => ({
      page_number: page.page_number,
      text: page.text || '',
      method: page.method || null,
      confidence: page.confidence ?? null
    })) : []
  };
}

async function kaiFetchAllSource(capability) {
  const chunks = [];
  let first = null;
  let pageStart = 1;
  let charStart = 0;
  for (let guard = 0; guard < KAI_MAX_CHUNKS; guard += 1) {
    const payload = {
      action: 'get_analysis_input',
      capability_token: capability,
      worker_id: 'damsan-knowledge-web-ui-031b1'
    };
    if (first?.source_chunk?.boundary_mode === 'LOGICAL_DOCUMENT') payload.char_start = charStart;
    else payload.page_start = pageStart;

    const data = await kaiGateway(payload);
    if (!first) first = data;
    chunks.push(kaiCompactSourceChunk(data.source_chunk || {}));
    if (!data.source_chunk?.has_more) return { first, chunks };
    if (data.source_chunk.boundary_mode === 'LOGICAL_DOCUMENT') {
      const next = Number(data.source_chunk.next_char_start);
      if (!Number.isSafeInteger(next) || next <= charStart) throw new Error('Luồng tài liệu logic không trả vị trí tiếp theo hợp lệ.');
      charStart = next;
    } else {
      const next = Number(data.source_chunk.next_page_start);
      if (!Number.isSafeInteger(next) || next <= pageStart) throw new Error('Luồng PDF không trả trang tiếp theo hợp lệ.');
      pageStart = next;
    }
  }
  throw new Error('Tài liệu vượt số chunk an toàn của phiên phân tích.');
}

function kaiBuildPrompt(input, chunks) {
  const documentInfo = input.document || {};
  const instructions = input.instructions || {};
  const packageObject = {
    schema_version: 'DAMSAN_WEB_AI_ANALYSIS_PACKAGE_V1',
    task: 'SEMANTIC_KNOWLEDGE_COMPILATION',
    document: documentInfo,
    instructions,
    source_chunks: chunks
  };
  const prompt = [
    'Bạn đang thực hiện bước biên dịch tri thức cho hệ thống Đam San V4.',
    'Chỉ sử dụng SOURCE PACKAGE bên dưới. Không bổ sung kiến thức vốn có của mô hình, không suy đoán ngoài nguồn.',
    'Hãy đọc toàn bộ nguồn, nhận diện cấu trúc bài/mục/tiểu mục/bảng/hình/YCCĐ/quy tắc đánh giá nếu chúng thực sự có trong tài liệu.',
    'Kết quả phải là DUY NHẤT một JSON object hợp lệ theo schema DAMSAN_KNOWLEDGE_V1; không dùng Markdown fence, không thêm lời dẫn hoặc giải thích bên ngoài JSON.',
    'Mỗi unit phải có unit_key duy nhất, unit_type, ordinal_no, hierarchy, content, provenance, confidence và is_usable.',
    'Nếu là PDF có trang vật lý, provenance phải giữ đúng số trang khi xác định được; tuyệt đối không bịa số trang.',
    'Nếu là DOC/DOCX dạng logical-document, không được tự tạo số trang vật lý.',
    '',
    'SOURCE PACKAGE:',
    JSON.stringify(packageObject)
  ].join('\n');
  if (prompt.length > KAI_MAX_PROMPT_CHARS) throw new Error('Gói AI quá lớn cho giao diện web hiện tại. Hãy tách tài liệu nguồn thành tệp nhỏ hơn.');
  return prompt;
}

async function kaiBuildPackage() {
  if (kaiBusy) return;
  const session = kaiRequireSession();
  if (!session) return;
  const documentId = document.getElementById('documentSelect').value;
  if (!documentId) {
    kaiNotice('Hãy chọn một tài liệu cần AI phân tích.', 'error');
    return;
  }
  kaiSetBusy(true);
  kaiCapability = '';
  kaiHandoff = null;
  document.getElementById('promptBox').value = '';
  document.getElementById('resultBox').value = '';
  document.getElementById('handoffStatus').textContent = 'Đang tạo capability và đọc nguồn...';
  try {
    const job = await kaiResolveJob(documentId, session);
    const handoff = await kaiGateway({
      action: 'create_analysis_handoff',
      staff_token: session.token,
      ma_gv: session.profile.ma_gv,
      job_id: job.job_id
    });
    kaiCapability = handoff.capability_token;
    kaiHandoff = handoff;
    const collected = await kaiFetchAllSource(kaiCapability);
    const prompt = kaiBuildPrompt(collected.first, collected.chunks);
    document.getElementById('promptBox').value = prompt;
    document.getElementById('handoffStatus').textContent = `Gói AI đã sẵn sàng · ${prompt.length.toLocaleString('vi-VN')} ký tự · capability hết hạn ${new Date(handoff.expires_at).toLocaleTimeString('vi-VN')}.`;
    kaiNotice('Đã tạo gói phân tích. Sao chép prompt sang ChatGPT/Gemini, rồi dán JSON kết quả trở lại.', 'ok');
  } catch (error) {
    kaiCapability = '';
    kaiHandoff = null;
    document.getElementById('handoffStatus').textContent = '';
    kaiNotice(error.message || 'Không tạo được gói AI.', 'error');
  } finally {
    kaiSetBusy(false);
  }
}

function kaiLooseJson(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Kết quả AI phải là một JSON object.');
  return parsed;
}

async function kaiCopyPrompt() {
  const value = document.getElementById('promptBox').value;
  if (!value) return kaiNotice('Chưa có prompt để sao chép.', 'error');
  try {
    await navigator.clipboard.writeText(value);
    kaiNotice('Đã sao chép prompt. Dán nguyên văn vào ChatGPT hoặc Gemini.', 'ok');
  } catch {
    document.getElementById('promptBox').focus();
    document.getElementById('promptBox').select();
    kaiNotice('Trình duyệt không cho ghi clipboard tự động. Prompt đã được chọn để mày sao chép thủ công.', 'info');
  }
}

async function kaiPasteResult() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('resultBox').value = text;
    kaiNotice('Đã dán nội dung từ clipboard.', 'ok');
  } catch {
    kaiNotice('Trình duyệt không cho đọc clipboard. Hãy dán JSON trực tiếp vào ô kết quả.', 'info');
    document.getElementById('resultBox').focus();
  }
}

async function kaiSubmitResult() {
  if (kaiBusy) return;
  if (!kaiCapability) {
    kaiNotice('Capability phân tích chưa tồn tại hoặc đã bị mất do tải lại trang. Hãy tạo lại gói AI.', 'error');
    return;
  }
  let analysis;
  try { analysis = kaiLooseJson(document.getElementById('resultBox').value); }
  catch (error) { return kaiNotice(`JSON không hợp lệ: ${error.message}`, 'error'); }

  kaiSetBusy(true);
  document.getElementById('resultStatus').textContent = 'Đang gửi server kiểm định...';
  try {
    const provider = document.getElementById('provider').value || 'WEB_AI';
    const model = document.getElementById('modelName').value.trim() || 'unspecified';
    const result = await kaiGateway({
      action: 'submit_analysis',
      capability_token: kaiCapability,
      ai_provider: provider,
      ai_model: model,
      pipeline_version: 'DAMSAN_KNOWLEDGE_V1/031B1',
      analysis
    });
    const active = result.active_revision ? `active revision ${result.active_revision}` : 'chưa kích hoạt tự động';
    document.getElementById('resultStatus').textContent = `Revision ${result.revision} · ${result.quality_status} · ${active}`;
    kaiNotice(`Server đã nhận và kiểm định kết quả AI: ${result.quality_status}.`, result.active_revision ? 'ok' : 'info');
    kaiCapability = '';
    kaiHandoff = null;
    await kaiLoadDocuments();
  } catch (error) {
    document.getElementById('resultStatus').textContent = '';
    kaiNotice(error.message || 'Không lưu được kết quả phân tích AI.', 'error');
  } finally {
    kaiSetBusy(false);
  }
}

function kaiBind() {
  if (!kaiRequireSession()) return;
  document.getElementById('btnBuild').addEventListener('click', kaiBuildPackage);
  document.getElementById('btnRefresh').addEventListener('click', kaiLoadDocuments);
  document.getElementById('btnCopyPrompt').addEventListener('click', kaiCopyPrompt);
  document.getElementById('btnPaste').addEventListener('click', kaiPasteResult);
  document.getElementById('btnSubmit').addEventListener('click', kaiSubmitResult);
  document.getElementById('btnChatGPT').addEventListener('click', () => window.open('https://chatgpt.com/', '_blank', 'noopener'));
  document.getElementById('btnGemini').addEventListener('click', () => window.open('https://gemini.google.com/app', '_blank', 'noopener'));
  kaiLoadDocuments();
}

document.addEventListener('DOMContentLoaded', kaiBind);
