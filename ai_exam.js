const AIE_SUPABASE_URL = 'https://xcervjnwlchwfqvbeahy.supabase.co';
const AIE_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZXJ2am53bGNod2ZxdmJlYWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzY4NjksImV4cCI6MjA5MDY1Mjg2OX0.xjrY4YPDb5Q9BTenHrh2dUOnmZbegtKSZQPqzyJdxBo';
const AIE_ENDPOINT = `${AIE_SUPABASE_URL}/functions/v1/exam-ai-bridge`;
const AIE_MAX_PROMPT_CHARS = 7_500_000;
const AIE_MAX_PACK_PAGES = 500;
const aieSb = supabase.createClient(AIE_SUPABASE_URL, AIE_SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let aieDocuments = [];
let aieRequests = [];
let aieCapability = '';
let aieCurrentRequestId = '';
let aieBusy = false;

function aieEscape(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function aieSession() {
  const token = sessionStorage.getItem('damSan_StaffToken');
  const expiresAt = sessionStorage.getItem('damSan_StaffExpiresAt');
  let profile = null;
  try { profile = JSON.parse(sessionStorage.getItem('damSan_GVSession') || 'null'); } catch { profile = null; }
  const expiryMs = new Date(expiresAt || '').getTime();
  if (!token || !Number.isFinite(expiryMs) || expiryMs <= Date.now() || !profile?.ma_gv) return null;
  return { token, profile };
}

function aieTargetScope(session) {
  const profile = session.profile;
  if (profile.quyen !== 'Admin') {
    if (!profile.truong_id || !profile.mon_id) return null;
    return { truong_id: profile.truong_id, mon_id: profile.mon_id };
  }
  const school = localStorage.getItem('damSan_WorkspaceSchool') || profile.truong_id || 'ALL';
  const subject = localStorage.getItem('damSan_Workspace') || profile.mon_id || 'ALL';
  if (!school || !subject || school === 'ALL' || subject === 'ALL') return null;
  return { truong_id: school, mon_id: subject };
}

function aieNotice(message, kind = 'info') {
  const el = document.getElementById('notice');
  el.textContent = message || '';
  el.className = message ? `notice ${kind}` : 'notice';
}

function aieSetBusy(value) {
  aieBusy = value;
  for (const id of ['btnCreate','btnRefreshDocs','btnValidate','btnApprove','btnReject']) {
    const el = document.getElementById(id);
    if (el) el.disabled = value;
  }
}

function aieRequireSession() {
  const session = aieSession();
  if (!session) {
    aieNotice('Phiên giáo viên không còn hợp lệ. Hãy đăng nhập lại ở Cổng giáo viên.', 'error');
    aieSetBusy(true);
    return null;
  }
  if (!aieTargetScope(session)) {
    aieNotice(session.profile.quyen === 'Admin'
      ? 'Admin phải chọn một trường và một môn cụ thể ở Cổng giáo viên trước khi tạo đề AI.'
      : 'Tài khoản chưa có trường/môn hợp lệ để tạo đề.', 'error');
    return null;
  }
  return session;
}

async function aieGateway(payload) {
  const response = await fetch(AIE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'apikey':AIE_SUPABASE_KEY },
    cache: 'no-store',
    body: JSON.stringify(payload)
  });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok || !data || data.status !== 'success') {
    const error = new Error(data?.message || `Dịch vụ tạo đề AI trả mã ${response.status}.`);
    error.code = data?.code || 'ai_exam_gateway_failed';
    throw error;
  }
  return data;
}

async function aieLoadDocuments() {
  const session = aieRequireSession();
  if (!session) return;
  const scope = aieTargetScope(session);
  aieSetBusy(true);
  try {
    const { data, error } = await aieSb.rpc('rpc_knowledge_library_read', {
      p_staff_token: session.token,
      p_ma_gv: session.profile.ma_gv
    });
    if (error) throw error;
    if (!data || data.status !== 'success') throw new Error(data?.message || 'Không tải được Kho tri thức.');
    aieDocuments = (Array.isArray(data.documents) ? data.documents : []).filter((doc) =>
      Number(doc.active_revision || 0) > 0 &&
      doc.truong_id === scope.truong_id &&
      (doc.mon_id === scope.mon_id || doc.mon_id == null)
    );
    const box = document.getElementById('knowledgeDocs');
    if (!aieDocuments.length) {
      box.innerHTML = '<div class="doc">Chưa có tài liệu đã kích hoạt cho trường/môn đang chọn.</div>';
      aieNotice('Cần ít nhất một tài liệu có active revision. Nếu tài liệu mới chỉ EXTRACTED, hãy chạy “AI phân tích nguồn” trước.', 'info');
      return;
    }
    box.innerHTML = aieDocuments.map((doc) => `
      <label class="doc">
        <input type="checkbox" class="knowledge-check" value="${aieEscape(doc.id)}" checked>
        <span><strong>${aieEscape(doc.title || doc.original_filename)}</strong><small>${aieEscape(doc.document_type || doc.source_format || 'SOURCE')} · revision ${Number(doc.active_revision)}</small></span>
      </label>`).join('');
    aieNotice(`Đã nạp ${aieDocuments.length} tài liệu nguồn có active revision.`, 'info');
  } catch (error) {
    aieNotice(error.message || 'Không tải được Kho tri thức.', 'error');
  } finally {
    aieSetBusy(false);
  }
}

function aieInt(id, min, max) {
  const value = Number(document.getElementById(id).value);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${id} không hợp lệ.`);
  return value;
}

function aieNumber(id, min, max) {
  const value = Number(document.getElementById(id).value);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${id} không hợp lệ.`);
  return value;
}

function aieSpec() {
  const profile = document.getElementById('profile').value;
  let p1 = aieInt('p1Count',0,300), p2 = aieInt('p2Count',0,300), p3 = aieInt('p3Count',0,300);
  if (profile === 'MCQ_ONLY') { p2 = 0; p3 = 0; }
  if (profile === 'TRUE_FALSE_ONLY') { p1 = 0; p3 = 0; }
  if (profile === 'SHORT_ONLY') { p1 = 0; p2 = 0; }
  if (p1 + p2 + p3 < 1 || p1 + p2 + p3 > 300) throw new Error('Tổng số câu phải từ 1 đến 300.');
  document.getElementById('p1Count').value = p1;
  document.getElementById('p2Count').value = p2;
  document.getElementById('p3Count').value = p3;

  let scoringConfig = {};
  if (profile === 'CUSTOM') {
    const w1 = aieNumber('w1',0,10), w2 = aieNumber('w2',0,10), w3 = aieNumber('w3',0,10);
    const sum = w1 + w2 + w3;
    if (Math.abs(sum - 10) > 1e-9) throw new Error('Tổng trọng số CUSTOM phải bằng đúng 10.');
    if ((p1 === 0 && w1 !== 0) || (p2 === 0 && w2 !== 0) || (p3 === 0 && w3 !== 0)) throw new Error('Phần không có câu phải có trọng số bằng 0.');
    scoringConfig = { p1_weight:w1, p2_weight:w2, p3_weight:w3 };
  }
  const variantCount = aieInt('variantCount',1,8);
  return {
    assessment_type: profile,
    scoring_config: scoringConfig,
    counts: { p1, p2, p3 },
    variant_count: variantCount,
    teacher_requirements: document.getElementById('requirements').value.trim(),
    generation_mode: 'WEB_AI_NO_API',
    grounding_policy: 'SELECTED_ACTIVE_KNOWLEDGE_ONLY'
  };
}

function aieSelectedDocumentIds() {
  return Array.from(document.querySelectorAll('.knowledge-check:checked')).map((el) => el.value).filter(Boolean);
}

async function aieFetchKnowledgePack(capability) {
  const units = [];
  let first = null;
  let offset = 0;
  for (let page = 0; page < AIE_MAX_PACK_PAGES; page += 1) {
    const data = await aieGateway({
      action: 'get_generation_input',
      capability_token: capability,
      worker_id: 'damsan-ai-exam-ui-031b2',
      offset,
      limit: 120
    });
    if (!first) first = data;
    const batch = Array.isArray(data.knowledge_pack?.units) ? data.knowledge_pack.units : [];
    units.push(...batch);
    if (!data.knowledge_pack?.has_more) return { first, units };
    const next = Number(data.knowledge_pack.next_offset);
    if (!Number.isSafeInteger(next) || next <= offset) throw new Error('Knowledge Pack không trả offset tiếp theo hợp lệ.');
    offset = next;
  }
  throw new Error('Knowledge Pack vượt giới hạn phân trang an toàn.');
}

function aieBuildPrompt(input, units, localSpec) {
  const pkg = {
    schema_version: 'DAMSAN_WEB_AI_EXAM_PACKAGE_V1',
    task: 'GROUNDED_EXAM_GENERATION',
    request: input.request,
    instructions: input.instructions,
    authoritative_exam_spec: localSpec,
    knowledge_units: units
  };
  const prompt = [
    'Bạn là bộ tạo đề cho hệ thống kiểm tra Đam San V4.',
    'Chỉ sử dụng KNOWLEDGE PACKAGE bên dưới. Không bổ sung kiến thức vốn có của mô hình và không bịa nguồn.',
    'Tuân thủ tuyệt đối authoritative_exam_spec về loại đề, số câu từng phần, trọng số và số mã đề.',
    'Mỗi câu phải có source_refs là mảng chứa ít nhất một unit_key thực sự xuất hiện trong knowledge_units.',
    'Phần 1: đủ A/B/C/D, dap_an_dung là A/B/C/D. Phần 2: A/B/C/D là 4 nhận định, dap_an_dung dạng Đ-S-Đ-S. Phần 3: trả lời ngắn, A/B/C/D để chuỗi rỗng.',
    'Kết quả phải là DUY NHẤT một JSON object theo DAMSAN_EXAM_V1, không Markdown fence, không lời dẫn ngoài JSON.',
    'Root bắt buộc: schema_version, title, assessment_type, scoring_config, questions.',
    'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs; có thể thêm muc_do và bai_hoc.',
    '',
    'KNOWLEDGE PACKAGE:',
    JSON.stringify(pkg)
  ].join('\n');
  if (prompt.length > AIE_MAX_PROMPT_CHARS) throw new Error('Gói ra đề quá lớn cho clipboard web. Hãy chọn ít tài liệu nguồn hơn.');
  return prompt;
}

async function aieCreatePackage() {
  if (aieBusy) return;
  const session = aieRequireSession();
  if (!session) return;
  const scope = aieTargetScope(session);
  const room = document.getElementById('roomCode').value.trim();
  if (!room) return aieNotice('Hãy nhập mã phòng.', 'error');
  const documentIds = aieSelectedDocumentIds();
  if (!documentIds.length) return aieNotice('Hãy chọn ít nhất một tài liệu nguồn.', 'error');
  let spec;
  try { spec = aieSpec(); } catch (error) { return aieNotice(error.message, 'error'); }

  aieSetBusy(true);
  aieCapability = '';
  aieCurrentRequestId = '';
  document.getElementById('promptBox').value = '';
  document.getElementById('resultBox').value = '';
  document.getElementById('generationStatus').textContent = 'Đang tạo request và gom Knowledge Pack...';
  try {
    const created = await aieGateway({
      action: 'create_generation_request',
      staff_token: session.token,
      ma_gv: session.profile.ma_gv,
      truong_id: scope.truong_id,
      mon_id: scope.mon_id,
      ma_phong: room,
      exam_spec: spec,
      knowledge_document_ids: documentIds
    });
    aieCapability = created.capability_token;
    aieCurrentRequestId = created.request_id;
    const collected = await aieFetchKnowledgePack(aieCapability);
    const prompt = aieBuildPrompt(collected.first, collected.units, spec);
    document.getElementById('promptBox').value = prompt;
    document.getElementById('generationStatus').textContent = `Request ${created.request_id} · ${collected.units.length} knowledge units · ${prompt.length.toLocaleString('vi-VN')} ký tự · capability hết hạn ${new Date(created.expires_at).toLocaleTimeString('vi-VN')}.`;
    aieNotice('Gói ra đề đã sẵn sàng. Sao chép sang ChatGPT/Gemini rồi dán JSON đề trở lại.', 'ok');
    await aieLoadRequests();
  } catch (error) {
    aieCapability = '';
    aieCurrentRequestId = '';
    document.getElementById('generationStatus').textContent = '';
    aieNotice(error.message || 'Không tạo được gói ra đề AI.', 'error');
  } finally { aieSetBusy(false); }
}

function aieLooseJson(raw) {
  let text = String(raw || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
  if (!text.startsWith('{')) {
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start,end+1);
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Kết quả phải là một JSON object.');
  return parsed;
}

async function aieValidateDraft() {
  if (aieBusy) return;
  if (!aieCapability || !aieCurrentRequestId) return aieNotice('Capability tạo đề không còn trong phiên này. Hãy tạo lại gói ra đề.', 'error');
  let exam;
  try { exam = aieLooseJson(document.getElementById('resultBox').value); }
  catch (error) { return aieNotice(`JSON đề không hợp lệ: ${error.message}`, 'error'); }
  aieSetBusy(true);
  document.getElementById('validationStatus').textContent = 'Server đang kiểm định schema, cấu trúc, đáp án và source_refs...';
  try {
    const result = await aieGateway({
      action: 'submit_exam_draft',
      capability_token: aieCapability,
      ai_provider: document.getElementById('provider').value || 'WEB_AI',
      ai_model: document.getElementById('modelName').value.trim() || 'unspecified',
      exam
    });
    document.getElementById('validationStatus').textContent = `VALIDATED · revision ${result.revision} · ${result.validation?.question_count || 0} câu · ${result.validation?.variant_count || 0} mã đề.`;
    aieNotice('Đề đã vượt kiểm định kỹ thuật. Kiểm tra toàn bộ nội dung ở phần xem trước trước khi phê duyệt.', 'ok');
    aieCapability = '';
    await aieLoadRequests(aieCurrentRequestId);
  } catch (error) {
    document.getElementById('validationStatus').textContent = '';
    aieNotice(error.message || 'Đề AI không vượt kiểm định.', 'error');
  } finally { aieSetBusy(false); }
}

async function aieLoadRequests(openId = '') {
  const session = aieSession();
  if (!session) return;
  try {
    const { data, error } = await aieSb.rpc('rpc_ai_exam_request_read', {
      p_staff_token: session.token,
      p_ma_gv: session.profile.ma_gv,
      p_request_id: null
    });
    if (error) throw error;
    if (!data || data.status !== 'success') throw new Error(data?.message || 'Không tải được danh sách request AI.');
    aieRequests = Array.isArray(data.requests) ? data.requests : [];
    const box = document.getElementById('requestList');
    box.innerHTML = aieRequests.length ? aieRequests.slice(0,20).map((r) => `
      <div class="request ${r.request_id === (openId || aieCurrentRequestId) ? 'active' : ''}" data-request-id="${aieEscape(r.request_id)}">
        <strong>${aieEscape(r.ma_phong)}</strong> · ${aieEscape(r.status)}<br><small>${aieEscape(new Date(r.created_at).toLocaleString('vi-VN'))} · ${aieEscape(r.exam_spec?.assessment_type || '')}</small>
      </div>`).join('') : '<div class="request">Chưa có yêu cầu tạo đề AI.</div>';
    if (openId) aieOpenRequest(openId);
  } catch (error) {
    document.getElementById('requestList').innerHTML = `<div class="request">${aieEscape(error.message)}</div>`;
  }
}

function aieQuestionPreview(question, index) {
  const part = String(question.phan || question.Phan || '1');
  const refs = Array.isArray(question.source_refs) ? question.source_refs : [];
  const options = part === '3' ? '' : ['A','B','C','D'].map((key) => `<div class="option"><strong>${key}.</strong> ${aieEscape(question[key] ?? question[key.toLowerCase()] ?? '')}</div>`).join('');
  return `<div class="question"><h3>Câu ${index + 1} · Phần ${aieEscape(part)}</h3><div>${aieEscape(question.noi_dung || question.NoiDung || '')}</div>${options}<div class="answer">Đáp án: ${aieEscape(question.dap_an_dung || question.DapAnDung || '')}</div>${question.loi_giai ? `<div class="source">Giải thích: ${aieEscape(question.loi_giai)}</div>` : ''}<div class="source">Nguồn: ${refs.length ? refs.map(aieEscape).join(', ') : 'server provenance đã kiểm định'}</div></div>`;
}

function aieOpenRequest(requestId) {
  const request = aieRequests.find((r) => r.request_id === requestId);
  if (!request) return;
  aieCurrentRequestId = request.request_id;
  document.querySelectorAll('.request').forEach((el) => el.classList.toggle('active', el.dataset.requestId === requestId));
  const card = document.getElementById('reviewCard');
  const draft = request.draft;
  if (!draft || !['READY_FOR_REVIEW','PUBLISHED'].includes(request.status)) {
    card.classList.add('hidden');
    aieNotice(`Request ${request.ma_phong}: ${request.status}. ${['AWAITING_AI','AI_WORKING'].includes(request.status) ? 'Nếu trang đã tải lại, capability cũ không được khôi phục; có thể từ chối request này và tạo request mới.' : ''}`, 'info');
    return;
  }
  const payload = draft.exam_payload || {};
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  document.getElementById('reviewMeta').textContent = `${request.ma_phong} · ${request.status} · revision ${draft.revision} · ${questions.length} câu · ${draft.validation_report?.variant_count || 0} mã đề · ${draft.ai_provider || 'WEB_AI'} ${draft.ai_model || ''}`;
  document.getElementById('preview').innerHTML = questions.length ? questions.map(aieQuestionPreview).join('') : '<div class="question">Không có câu hỏi để hiển thị.</div>';
  document.getElementById('btnApprove').disabled = request.status !== 'READY_FOR_REVIEW';
  document.getElementById('btnReject').disabled = request.status === 'PUBLISHED';
  card.classList.remove('hidden');
  card.scrollIntoView({ behavior:'smooth', block:'start' });
}

async function aieApprove() {
  if (aieBusy || !aieCurrentRequestId) return;
  const session = aieRequireSession(); if (!session) return;
  if (!window.confirm('Phê duyệt đề này và đưa chính thức lên phòng thi? Đây là hành động ghi đề vào phòng.')) return;
  aieSetBusy(true);
  try {
    const { data, error } = await aieSb.rpc('rpc_ai_exam_approve_and_publish', {
      p_staff_token: session.token,
      p_ma_gv: session.profile.ma_gv,
      p_request_id: aieCurrentRequestId
    });
    if (error) throw error;
    if (!data || data.status !== 'success') throw new Error(data?.message || 'Không publish được đề.');
    aieNotice(`Đã phê duyệt và đưa đề lên phòng. Số mã đề: ${data.count ?? '-'}.`, 'ok');
    await aieLoadRequests(aieCurrentRequestId);
  } catch (error) { aieNotice(error.message || 'Publish thất bại.', 'error'); }
  finally { aieSetBusy(false); }
}

async function aieReject() {
  if (aieBusy || !aieCurrentRequestId) return;
  const session = aieRequireSession(); if (!session) return;
  if (!window.confirm('Từ chối request/đề AI này? Phòng thi sẽ không bị thay đổi bởi thao tác từ chối.')) return;
  aieSetBusy(true);
  try {
    const { data, error } = await aieSb.rpc('rpc_ai_exam_reject', {
      p_staff_token: session.token,
      p_ma_gv: session.profile.ma_gv,
      p_request_id: aieCurrentRequestId
    });
    if (error) throw error;
    if (!data || data.status !== 'success') throw new Error(data?.message || data?.code || 'Không từ chối được request.');
    aieNotice('Đã từ chối đề AI. Không có thay đổi nào được ghi vào phòng thi.', 'info');
    document.getElementById('reviewCard').classList.add('hidden');
    await aieLoadRequests();
  } catch (error) { aieNotice(error.message || 'Từ chối request thất bại.', 'error'); }
  finally { aieSetBusy(false); }
}

async function aieCopyPrompt() {
  const text = document.getElementById('promptBox').value;
  if (!text) return aieNotice('Chưa có prompt để sao chép.', 'error');
  try { await navigator.clipboard.writeText(text); aieNotice('Đã sao chép prompt ra đề.', 'ok'); }
  catch { const box = document.getElementById('promptBox'); box.focus(); box.select(); aieNotice('Prompt đã được chọn; hãy sao chép thủ công.', 'info'); }
}

async function aiePasteResult() {
  try { document.getElementById('resultBox').value = await navigator.clipboard.readText(); aieNotice('Đã dán JSON từ clipboard.', 'ok'); }
  catch { document.getElementById('resultBox').focus(); aieNotice('Trình duyệt không cho đọc clipboard. Hãy dán JSON trực tiếp.', 'info'); }
}

function aieProfileChange() {
  const profile = document.getElementById('profile').value;
  document.getElementById('customWeights').classList.toggle('hidden', profile !== 'CUSTOM');
  const map = {
    MCQ_ONLY:[true,false,false], TRUE_FALSE_ONLY:[false,true,false], SHORT_ONLY:[false,false,true]
  };
  const enabled = map[profile] || [true,true,true];
  ['p1Count','p2Count','p3Count'].forEach((id,i) => {
    const el = document.getElementById(id); el.disabled = !enabled[i]; if (!enabled[i]) el.value = 0;
  });
}

function aieWeightSum() {
  const values = ['w1','w2','w3'].map((id) => Number(document.getElementById(id).value) || 0);
  document.getElementById('weightSum').value = values.reduce((a,b) => a+b,0).toFixed(2).replace(/\.00$/,'');
}

function aieBind() {
  if (!aieRequireSession()) return;
  document.getElementById('btnCreate').addEventListener('click', aieCreatePackage);
  document.getElementById('btnRefreshDocs').addEventListener('click', aieLoadDocuments);
  document.getElementById('btnCopyPrompt').addEventListener('click', aieCopyPrompt);
  document.getElementById('btnPaste').addEventListener('click', aiePasteResult);
  document.getElementById('btnValidate').addEventListener('click', aieValidateDraft);
  document.getElementById('btnApprove').addEventListener('click', aieApprove);
  document.getElementById('btnReject').addEventListener('click', aieReject);
  document.getElementById('profile').addEventListener('change', aieProfileChange);
  ['w1','w2','w3'].forEach((id) => document.getElementById(id).addEventListener('input', aieWeightSum));
  document.getElementById('btnChatGPT').addEventListener('click', () => window.open('https://chatgpt.com/','_blank','noopener'));
  document.getElementById('btnGemini').addEventListener('click', () => window.open('https://gemini.google.com/app','_blank','noopener'));
  document.getElementById('requestList').addEventListener('click', (event) => {
    const item = event.target.closest('[data-request-id]'); if (item) aieOpenRequest(item.dataset.requestId);
  });
  aieProfileChange(); aieWeightSum(); aieLoadDocuments(); aieLoadRequests();
}

document.addEventListener('DOMContentLoaded', aieBind);
