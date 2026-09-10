// 036 — document/book → lesson-aware knowledge scoping for AI exam generation.
// Keeps the existing request flow, but makes the selected lesson scope explicit in exam_spec.
(function () {
  'use strict';

  const SCOPE_SCHEMA = 'DAMSAN_KNOWLEDGE_SCOPE_V1';
  const baseSpec = aieSpec;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function pageLabel(lesson) {
    const start = Number(lesson?.page_start || 0);
    const end = Number(lesson?.page_end || 0);
    if (start > 0 && end >= start) return start === end ? `trang ${start}` : `trang ${start}–${end}`;
    return 'chưa xác định trang';
  }

  function selectedScopeItems() {
    const items = [];
    for (const group of document.querySelectorAll('[data-knowledge-scope-doc]')) {
      const documentId = group.dataset.knowledgeScopeDoc || '';
      const allCheck = group.querySelector('.knowledge-doc-all');
      const lessonChecks = Array.from(group.querySelectorAll('.knowledge-lesson-check'));
      if (!documentId) continue;
      if (allCheck?.checked) {
        items.push({ document_id: documentId, mode: 'ALL', scope_keys: [] });
        continue;
      }
      const scopeKeys = lessonChecks.filter((el) => el.checked).map((el) => el.dataset.scopeKey || '').filter(Boolean);
      if (scopeKeys.length) items.push({ document_id: documentId, mode: 'LESSONS', scope_keys: Array.from(new Set(scopeKeys)) });
    }
    return items;
  }

  function selectedDocumentIds036() {
    return selectedScopeItems().map((item) => item.document_id);
  }

  function spec036() {
    const spec = baseSpec();
    const items = selectedScopeItems();
    if (!items.length) throw new Error('Hãy chọn ít nhất một tài liệu hoặc một bài trong tài liệu nguồn.');
    return {
      ...spec,
      knowledge_scope: {
        schema_version: SCOPE_SCHEMA,
        items
      }
    };
  }

  function bindScopeControls() {
    for (const group of document.querySelectorAll('[data-knowledge-scope-doc]')) {
      const allCheck = group.querySelector('.knowledge-doc-all');
      const lessonChecks = Array.from(group.querySelectorAll('.knowledge-lesson-check'));
      if (!allCheck || !lessonChecks.length) continue;
      const sync = () => {
        const all = Boolean(allCheck.checked);
        for (const child of lessonChecks) {
          child.disabled = all;
          if (all) child.checked = false;
        }
      };
      allCheck.addEventListener('change', sync);
      for (const child of lessonChecks) child.addEventListener('change', () => {
        if (child.checked) allCheck.checked = false;
      });
      sync();
    }
  }

  function renderScopeCatalog(documents) {
    const box = document.getElementById('knowledgeDocs');
    if (!box) return;
    if (!documents.length) {
      box.innerHTML = '<div class="doc">Chưa có tài liệu đã kích hoạt cho trường/môn đang chọn.</div>';
      return;
    }

    box.innerHTML = documents.map((doc) => {
      const lessons = Array.isArray(doc.lesson_scopes) ? doc.lesson_scopes : [];
      const manyLessons = lessons.length > 1;
      const docTitle = doc.title || doc.original_filename || doc.id;
      const meta = `${doc.document_type || doc.source_format || 'SOURCE'} · revision ${Number(doc.active_revision || 0)}${doc.page_count ? ` · ${Number(doc.page_count)} trang` : ''}`;

      if (!manyLessons) {
        const lessonNote = lessons.length === 1 ? ` · ${esc(lessons[0].lesson_title || '1 bài')}` : '';
        return `<div class="scope-doc-group" data-knowledge-scope-doc="${esc(doc.id)}">
          <label class="doc scope-doc-head">
            <input type="checkbox" class="knowledge-doc-all knowledge-check" value="${esc(doc.id)}" checked>
            <span><strong>${esc(docTitle)}</strong><small>${esc(meta)}${lessonNote}</small></span>
          </label>
        </div>`;
      }

      const lessonRows = lessons.map((lesson) => `<label class="scope-lesson-row">
        <input type="checkbox" class="knowledge-lesson-check" data-scope-key="${esc(lesson.scope_key)}">
        <span><strong>${esc(lesson.lesson_title || lesson.scope_key)}</strong><small>${esc(pageLabel(lesson))} · ${Number(lesson.unit_count || 0)} units</small></span>
      </label>`).join('');

      return `<div class="scope-doc-group" data-knowledge-scope-doc="${esc(doc.id)}">
        <label class="doc scope-doc-head">
          <input type="checkbox" class="knowledge-doc-all knowledge-check" value="${esc(doc.id)}">
          <span><strong>${esc(docTitle)}</strong><small>${esc(meta)} · ${lessons.length} bài · tick ô này nếu thật sự muốn dùng toàn bộ tài liệu</small></span>
        </label>
        <div class="scope-lessons">${lessonRows}</div>
      </div>`;
    }).join('');
    bindScopeControls();
  }

  async function loadScopeCatalog036() {
    const session = aieRequireSession();
    if (!session) return;
    const scope = aieTargetScope(session);
    aieSetBusy(true);
    try {
      const { data, error } = await aieSb.rpc('rpc_knowledge_scope_catalog_read', {
        p_staff_token: session.token,
        p_ma_gv: session.profile.ma_gv
      });
      if (error) throw error;
      if (!data || data.status !== 'success') throw new Error(data?.message || 'Không tải được phạm vi bài học trong Kho tri thức.');
      const docs = (Array.isArray(data.documents) ? data.documents : []).filter((doc) =>
        Number(doc.active_revision || 0) > 0 &&
        doc.truong_id === scope.truong_id &&
        (doc.mon_id === scope.mon_id || doc.mon_id == null)
      );
      aieDocuments = docs;
      renderScopeCatalog(docs);
      const multi = docs.filter((doc) => Number(doc.lesson_count || 0) > 1).length;
      if (!docs.length) {
        aieNotice('Cần ít nhất một tài liệu có active revision.', 'info');
      } else if (multi) {
        aieNotice(`Đã nạp ${docs.length} tài liệu. Có ${multi} tài liệu nhiều bài: hãy chỉ tick đúng bài cần đưa vào đề.`, 'info');
      } else {
        aieNotice(`Đã nạp ${docs.length} tài liệu nguồn có active revision.`, 'info');
      }
    } catch (error) {
      aieNotice(error.message || 'Không tải được phạm vi bài học trong Kho tri thức.', 'error');
    } finally {
      aieSetBusy(false);
    }
  }

  const style = document.createElement('style');
  style.textContent = '.scope-doc-group{border-bottom:1px solid #e2e8f0}.scope-doc-group:last-child{border-bottom:0}.scope-doc-head{border-bottom:0!important;background:#fff}.scope-lessons{padding:0 10px 9px 34px}.scope-lesson-row{display:flex;gap:9px;align-items:flex-start;padding:7px 9px;border-left:2px solid #ccfbf1}.scope-lesson-row input{width:auto;margin-top:3px}.scope-lesson-row strong{font-size:12px}.scope-lesson-row small{display:block;color:#64748b;margin-top:2px;font-size:11px}';
  document.head.appendChild(style);

  aieSelectedDocumentIds = selectedDocumentIds036;
  aieSpec = spec036;
  aieLoadDocuments = loadScopeCatalog036;

  const refresh = document.getElementById('btnRefreshDocs');
  if (refresh) refresh.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    loadScopeCatalog036();
  }, true);

  function loadAfterBaseInitialization() {
    if (typeof aieBusy !== 'undefined' && aieBusy) {
      setTimeout(loadAfterBaseInitialization, 100);
      return;
    }
    loadScopeCatalog036();
  }
  setTimeout(loadAfterBaseInitialization, 0);
})();