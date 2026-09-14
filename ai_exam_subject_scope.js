// 046 — visible subject scope for AI exam generation.
// Removes the hidden Admin-workspace dependency from the exam setup UX while
// preserving the existing school/subject authorization boundary.
(function () {
  'use strict';

  const baseTargetScope = aieTargetScope;

  function subjectSelect() {
    return document.getElementById('subjectSelect');
  }

  function subjectName() {
    const select = subjectSelect();
    if (!select || !select.value) return '';
    return select.options[select.selectedIndex]?.textContent?.trim() || '';
  }

  // Admin scope remains restricted to the current school, but the subject is now
  // chosen explicitly on this page. Non-Admin teachers keep their server-bound subject.
  aieTargetScope = function aieTargetScope046(session) {
    const profile = session?.profile || {};
    if (profile.quyen !== 'Admin') return baseTargetScope(session);

    const school = localStorage.getItem('damSan_WorkspaceSchool') || profile.truong_id || 'ALL';
    const explicitSubject = subjectSelect()?.value || '';
    const storedSubject = localStorage.getItem('damSan_Workspace') || profile.mon_id || 'ALL';
    const subject = explicitSubject || storedSubject;
    if (!school || !subject || school === 'ALL' || subject === 'ALL') return null;
    return { truong_id: school, mon_id: subject };
  };

  function renderSubjectState(message = '') {
    const el = document.getElementById('subjectScopeState');
    if (!el) return;
    const label = subjectName();
    if (message) {
      el.textContent = message;
      return;
    }
    el.textContent = label ? `Đang ra đề cho môn: ${label}.` : 'Hãy chọn môn trước khi chọn phạm vi bài học.';
  }

  async function loadSubjects() {
    const session = aieSession();
    const select = subjectSelect();
    if (!session || !select) return;

    renderSubjectState('Đang nạp danh sách môn...');
    const { data, error } = await aieSb.from('mon_hoc').select('id,ten_mon').order('ten_mon', { ascending: true });
    if (error) {
      select.innerHTML = '<option value="">-- Không tải được môn --</option>';
      renderSubjectState('Không tải được danh sách môn. Hãy thử tải lại trang.');
      return;
    }

    const allRows = Array.isArray(data) ? data.filter((row) => row?.id && row?.ten_mon) : [];
    const rows = session.profile.quyen === 'Admin'
      ? allRows
      : allRows.filter((row) => row.id === session.profile.mon_id);

    const stored = session.profile.quyen === 'Admin'
      ? (localStorage.getItem('damSan_Workspace') || '')
      : (session.profile.mon_id || '');

    select.innerHTML = '<option value="">-- Chọn môn --</option>' + rows.map((row) =>
      `<option value="${aieEscape(row.id)}">${aieEscape(row.ten_mon)}</option>`
    ).join('');

    if (rows.some((row) => row.id === stored)) select.value = stored;
    if (session.profile.quyen !== 'Admin') {
      select.disabled = true;
      if (session.profile.mon_id) select.value = session.profile.mon_id;
    }

    renderSubjectState();
  }

  function clearScopeUiForSubjectChange() {
    aieCapability = '';
    aieCurrentRequestId = '';
    const prompt = document.getElementById('promptBox');
    const result = document.getElementById('resultBox');
    const status = document.getElementById('generationStatus');
    const docs = document.getElementById('knowledgeDocs');
    if (prompt) prompt.value = '';
    if (result) result.value = '';
    if (status) status.textContent = '';
    if (docs) docs.innerHTML = '<div class="doc">Đang nạp nguồn kiến thức của môn đã chọn...</div>';
  }

  function reloadForSelectedSubject() {
    const session = aieSession();
    const select = subjectSelect();
    if (!session || !select) return;

    if (session.profile.quyen === 'Admin') {
      localStorage.setItem('damSan_Workspace', select.value || 'ALL');
    }
    clearScopeUiForSubjectChange();
    renderSubjectState();

    const grade = document.getElementById('gradeSelect');
    if (grade?.value) {
      // Reuse the canonical 039 grade/authority refresh path so subject, authority,
      // knowledge catalog, and lesson scope move together.
      grade.dispatchEvent(new Event('change'));
    } else if (typeof aieLoadDocuments === 'function') {
      aieLoadDocuments();
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const select = subjectSelect();
    if (!select) return;
    select.addEventListener('change', reloadForSelectedSubject);
    await loadSubjects();

    // If the page already retained a grade selection, refresh once after the visible
    // subject selector has been hydrated so the UI cannot remain on a stale hidden scope.
    const grade = document.getElementById('gradeSelect');
    if (select.value && grade?.value) grade.dispatchEvent(new Event('change'));
  });
})();