// 039 — mandatory assessment grade + authoritative assessment-source resolver.
// Loaded after lesson-scope overlay so grade becomes part of the canonical exam spec.
(function () {
  'use strict';

  const baseSpec = aieSpec;
  const baseLoadDocuments = aieLoadDocuments;
  const baseProfileChange = window.aieProfileChange;
  const baseBuildPrompt = window.aieBuildPrompt;
  let authorityEpoch = 0;
  let currentAuthority = null;
  let currentAuthorityPack = null;
  let currentAuthorityKey = '';

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function gradeOrZero() {
    const value = Number(document.getElementById('gradeSelect')?.value || 0);
    return [10, 11, 12].includes(value) ? value : 0;
  }

  function selectedAuthorityKey() {
    const grade = gradeOrZero();
    const profile = document.getElementById('profile')?.value || '';
    return grade && profile ? `${grade}|${profile}` : '';
  }

  function requireGrade() {
    const grade = gradeOrZero();
    if (!grade) throw new Error('Hãy chọn khối 10, 11 hoặc 12 trước khi chọn nguồn và tạo đề.');
    return grade;
  }

  function sourceStateLabel(state) {
    if (state === 'VERIFIED_SOURCES') return 'Đã gắn đủ nguồn căn cứ';
    if (state === 'DECLARED_NOT_ATTACHED') return 'Profile máy đã có · nguồn căn cứ chưa gắn đủ';
    if (state === 'MACHINE_PROFILE_ONLY') return 'Profile máy · chưa khai báo nguồn bắt buộc';
    return state || 'Chưa có profile';
  }

  function authorityPanel() {
    return document.getElementById('assessmentAuthorityPanel');
  }

  function renderAuthority(authority, authorityPack = null, loading = false) {
    const panel = authorityPanel();
    if (!panel) return;
    if (loading) {
      panel.className = 'authority-panel info';
      panel.innerHTML = '<strong>Đang xác định căn cứ ra đề...</strong>';
      return;
    }
    if (!authority) {
      panel.className = 'authority-panel neutral';
      panel.innerHTML = '<strong>Chưa có assessment profile bắt buộc cho lựa chọn này.</strong><div>Quy định chung và yêu cầu giáo viên vẫn được áp dụng; hệ thống không tự suy đoán một chuẩn thi chính thức.</div>';
      return;
    }
    const profile = authority.profile || {};
    const declared = Array.isArray(authority.declared_sources) ? authority.declared_sources : [];
    const linked = Array.isArray(authority.linked_sources) ? authority.linked_sources : [];
    const sourceState = authority.source_state || '';
    const sourceItems = declared.map((item) => {
      const code = item?.authority_code || item?.label || 'Nguồn căn cứ';
      const match = linked.find((linkedItem) => linkedItem.authority_code === item?.authority_code || linkedItem.source_kind === item?.source_kind);
      return `<li>${match ? '✓' : '○'} <strong>${esc(item?.label || code)}</strong>${match ? ` — ${esc(match.title || '')}` : ' — chưa gắn file chuẩn hóa'}</li>`;
    }).join('');
    const blueprint = profile.official_full_blueprint || {};
    const blueprintText = Number.isFinite(Number(blueprint.p1))
      ? `Blueprint: P1=${Number(blueprint.p1)} · P2=${Number(blueprint.p2)} · P3=${Number(blueprint.p3)}${blueprint.minutes ? ` · ${Number(blueprint.minutes)} phút` : ''}`
      : '';
    const packTotal = Number(authorityPack?.total_units || 0);
    const packReturned = Number(authorityPack?.returned_units || 0);
    const packText = packTotal ? ` · authority corpus=${packReturned}/${packTotal} units` : '';
    panel.className = `authority-panel ${sourceState === 'VERIFIED_SOURCES' ? 'ok' : 'warn'}`;
    panel.innerHTML = `<div class="authority-head"><strong>CĂN CỨ RA ĐỀ</strong><span>${esc(authority.profile_id || '')} · v${esc(authority.profile_version || '')}</span></div>
      <div>${esc(sourceStateLabel(sourceState))}${blueprintText ? ` · ${esc(blueprintText)}` : ''}${esc(packText)}</div>
      ${sourceItems ? `<ul>${sourceItems}</ul>` : ''}
      <div class="authority-hash">Snapshot: ${esc(authority.snapshot_hash || '-')}</div>`;
  }

  function applyCountLock(authority) {
    const counts = authority?.profile?.official_full_blueprint || null;
    const locked = authority?.profile?.counts_locked === true && document.getElementById('profile')?.value === 'TOT_NGHIEP';
    if (!locked || !counts) return;
    const values = { p1Count: Number(counts.p1), p2Count: Number(counts.p2), p3Count: Number(counts.p3) };
    for (const [id, value] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (!el || !Number.isFinite(value)) continue;
      el.value = String(value);
      el.disabled = true;
      el.title = 'Số câu bị khóa bởi assessment authority đang áp dụng.';
    }
  }

  async function refreshAuthority() {
    const epoch = ++authorityEpoch;
    currentAuthority = null;
    currentAuthorityPack = null;
    currentAuthorityKey = '';
    const grade = gradeOrZero();
    const profile = document.getElementById('profile')?.value || '';
    const requestedKey = selectedAuthorityKey();
    if (!grade || !profile) {
      renderAuthority(null);
      return null;
    }
    const session = aieSession();
    const scope = session ? aieTargetScope(session) : null;
    if (!session || !scope?.mon_id) {
      renderAuthority(null);
      return null;
    }
    renderAuthority(null, null, true);
    try {
      const { data, error } = await aieSb.rpc('rpc_assessment_authority_resolve', {
        p_staff_token: session.token,
        p_ma_gv: session.profile.ma_gv,
        p_mon_id: scope.mon_id,
        p_grade: grade,
        p_assessment_type: profile
      });
      if (epoch !== authorityEpoch || requestedKey !== selectedAuthorityKey()) return null;
      if (error) throw error;
      if (!data || data.status !== 'success') throw new Error(data?.code || data?.message || 'Không resolve được assessment authority.');
      currentAuthority = data.authority || null;
      currentAuthorityPack = data.authority_pack || { total_units: 0, units: [] };
      currentAuthorityKey = requestedKey;
      renderAuthority(currentAuthority, currentAuthorityPack);
      applyCountLock(currentAuthority);
      return currentAuthority;
    } catch (error) {
      if (epoch !== authorityEpoch) return null;
      const panel = authorityPanel();
      if (panel) {
        panel.className = 'authority-panel error';
        panel.innerHTML = `<strong>Không đọc được căn cứ ra đề.</strong><div>${esc(error.message || 'authority_resolve_failed')}</div>`;
      }
      return null;
    }
  }

  function applyGradeFilter() {
    const grade = gradeOrZero();
    const allDocs = Array.isArray(aieDocuments) ? [...aieDocuments] : [];
    const eligible = allDocs.filter((doc) => grade && Number(doc.grade || 0) === grade && (!doc.source_role || doc.source_role === 'KNOWLEDGE_SOURCE'));
    const eligibleIds = new Set(eligible.map((doc) => doc.id));
    for (const group of document.querySelectorAll('[data-knowledge-scope-doc]')) {
      const allowed = eligibleIds.has(group.dataset.knowledgeScopeDoc || '');
      group.classList.toggle('hidden', !allowed);
      for (const input of group.querySelectorAll('input')) {
        if (!allowed) input.checked = false;
        input.disabled = !allowed || Boolean(input.disabled && allowed);
      }
    }
    aieDocuments = eligible;
    const box = document.getElementById('knowledgeDocs');
    if (!grade && box) box.innerHTML = '<div class="doc">Hãy chọn khối trước. Hệ thống không hiển thị nguồn “tất cả khối” khi tạo đề.</div>';
    else if (grade && !eligible.length && box) box.innerHTML = `<div class="doc">Chưa có nguồn kiến thức active revision cho khối ${grade}.</div>`;
    return eligible;
  }

  async function loadGradeDocuments() {
    const grade = gradeOrZero();
    if (!grade) {
      aieDocuments = [];
      const box = document.getElementById('knowledgeDocs');
      if (box) box.innerHTML = '<div class="doc">Hãy chọn khối 10, 11 hoặc 12 trước khi chọn bài.</div>';
      return;
    }
    await baseLoadDocuments();
    const eligible = applyGradeFilter();
    if (eligible.length) {
      const multi = eligible.filter((doc) => Number(doc.lesson_count || 0) > 1).length;
      aieNotice(`Khối ${grade}: ${eligible.length} nguồn kiến thức phù hợp${multi ? ` · ${multi} tài liệu có nhiều bài, hãy chọn đúng bài cần kiểm tra` : ''}.`, 'info');
    }
  }

  aieSpec = function aieSpec039() {
    const spec = baseSpec();
    const grade = requireGrade();
    return { ...spec, grade };
  };

  aieLoadDocuments = loadGradeDocuments;

  window.aieBuildPrompt = function aieBuildPrompt039(input, units, localSpec) {
    let prompt = baseBuildPrompt(input, units, localSpec);
    const serverAuthority = input?.request?.exam_spec?.assessment_authority || null;
    const key = `${Number(input?.request?.exam_spec?.grade || 0)}|${input?.request?.exam_spec?.assessment_type || ''}`;
    const pack = currentAuthorityKey === key ? currentAuthorityPack : null;
    const authorityPackage = {
      schema_version: 'DAMSAN_ASSESSMENT_AUTHORITY_PACKAGE_V1',
      assessment_authority: serverAuthority,
      source_state: serverAuthority?.source_state || pack?.source_state || 'NONE',
      total_source_units: Number(pack?.total_units || 0),
      truncated: pack?.truncated === true,
      authority_units: Array.isArray(pack?.units) ? pack.units : []
    };
    const authorityBlock = [
      '',
      'ASSESSMENT AUTHORITY PACKAGE — QUY ĐỊNH CÁCH RA ĐỀ:',
      '1. Đây là lớp quy tắc/phương pháp, KHÔNG phải nguồn kiến thức để trả lời câu hỏi.',
      '2. ASSESSMENT_RULE có quyền ưu tiên cao hơn ASSESSMENT_BENCHMARK. authority_rank nhỏ hơn có quyền cao hơn khi có khác biệt.',
      '3. Benchmark chỉ dùng để học cấu trúc, dạng stimulus, thao tác nhận thức và kỹ thuật viết câu. CẤM sao chép stem, phương án, số liệu hoặc đáp án từ benchmark sang đề mới nếu nội dung đó không có trong KNOWLEDGE PACKAGE.',
      '4. Nếu machine assessment profile mâu thuẫn với một rule nguồn có thẩm quyền cao hơn, không tự chọn tùy tiện: ưu tiên quy định chính thức và giữ output trong giới hạn deterministic gate của server.',
      '5. source_refs của câu hỏi chỉ được trỏ tới KNOWLEDGE PACKAGE; không dùng unit_key của authority/benchmark làm nguồn kiến thức câu hỏi.',
      JSON.stringify(authorityPackage),
      ''
    ].join('\n');
    const marker = '\nKNOWLEDGE PACKAGE:';
    if (prompt.includes(marker)) prompt = prompt.replace(marker, `${authorityBlock}${marker}`);
    else prompt = `${prompt}${authorityBlock}`;
    if (prompt.length > AIE_MAX_PROMPT_CHARS) throw new Error('Gói ra đề quá lớn sau khi ghép nguồn căn cứ. Hãy giảm phạm vi kiến thức hoặc tinh gọn benchmark.');
    return prompt;
  };

  window.aieProfileChange = function aieProfileChange039() {
    if (typeof baseProfileChange === 'function') baseProfileChange();
    refreshAuthority();
  };

  function gradeChanged() {
    const grade = gradeOrZero();
    currentAuthority = null;
    currentAuthorityPack = null;
    currentAuthorityKey = '';
    for (const id of ['p1Count', 'p2Count', 'p3Count']) {
      const el = document.getElementById(id);
      if (el) el.title = '';
    }
    if (typeof baseProfileChange === 'function') baseProfileChange();
    refreshAuthority();
    loadGradeDocuments();
    if (grade) aieNotice(`Đang dùng phạm vi Khối ${grade}. Chỉ nguồn kiến thức cùng khối mới được phép vào Knowledge Pack.`, 'info');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const grade = document.getElementById('gradeSelect');
    grade?.addEventListener('change', gradeChanged);
    const profile = document.getElementById('profile');
    profile?.addEventListener('change', () => setTimeout(refreshAuthority, 0));
    renderAuthority(null);
    setTimeout(() => {
      if (gradeOrZero()) {
        refreshAuthority();
        loadGradeDocuments();
      } else {
        const box = document.getElementById('knowledgeDocs');
        if (box) box.innerHTML = '<div class="doc">Hãy chọn khối 10, 11 hoặc 12 trước khi chọn bài.</div>';
      }
    }, 0);
  });
})();
