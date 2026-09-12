// 045 — explicit document/book → lesson-aware knowledge scoping for AI exam generation.
// The server remains authoritative; this layer makes the lesson boundary impossible to miss in the teacher UI.
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
    if (!items.length) throw new Error('Hãy chọn ít nhất một bài học hoặc chọn toàn bộ tài liệu nguồn.');
    return {
      ...spec,
      knowledge_scope: {
        schema_version: SCOPE_SCHEMA,
        items
      }
    };
  }

  function updateSelectionSummary(group) {
    const allCheck = group.querySelector('.knowledge-doc-all');
    const lessonChecks = Array.from(group.querySelectorAll('.knowledge-lesson-check'));
    const summary = group.querySelector('.scope-selection-summary');
    if (!summary) return;
    if (allCheck?.checked) {
      summary.textContent = `Đang dùng toàn bộ ${lessonChecks.length} bài`;
      summary.className = 'scope-selection-summary all';
      return;
    }
    const selected = lessonChecks.filter((el) => el.checked).length;
    summary.textContent = selected ? `Đã chọn ${selected}/${lessonChecks.length} bài` : 'Chưa chọn bài nào';
    summary.className = `scope-selection-summary${selected ? ' selected' : ''}`;
  }

  function bindScopeControls() {
    for (const group of document.querySelectorAll('[data-knowledge-scope-doc]')) {
      const allCheck = group.querySelector('.knowledge-doc-all');
      const lessonChecks = Array.from(group.querySelectorAll('.knowledge-lesson-check'));
      if (!allCheck) continue;

      const sync = () => {
        const all = Boolean(allCheck.checked);
        for (const child of lessonChecks) {
          child.disabled = all;
          if (all) child.checked = false;
        }
        updateSelectionSummary(group);
      };

      allCheck.addEventListener('change', sync);
      for (const child of lessonChecks) child.addEventListener('change', () => {
        if (child.checked) allCheck.checked = false;
        updateSelectionSummary(group);
      });

      for (const button of group.querySelectorAll('[data-scope-action]')) {
        button.addEventListener('click', () => {
          const action = button.dataset.scopeAction;
          allCheck.checked = false;
          for (const child of lessonChecks) {
            child.disabled = false;
            child.checked = action === 'all-lessons';
          }
          updateSelectionSummary(group);
        });
      }
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

      const lessonRows = lessons.map((lesson, index) => `<label class="scope-lesson-row">
        <input type="checkbox" class="knowledge-lesson-check" data-scope-key="${esc(lesson.scope_key)}">
        <span><strong>${index + 1}. ${esc(lesson.lesson_title || lesson.scope_key)}</strong><small>${esc(pageLabel(lesson))} · ${Number(lesson.unit_count || 0)} đơn vị tri thức</small></span>
      </label>`).join('');

      return `<div class="scope-doc-group" data-knowledge-scope-doc="${esc(doc.id)}">
        <div class="scope-title-block">
          <div><strong>PHẠM VI KIẾN THỨC</strong><small>Chọn đúng bài cần đưa vào đề. Không cần nhập tên bài bằng tay.</small></div>
          <span class="scope-selection-summary">Chưa chọn bài nào</span>
        </div>
        <div class="scope-doc-info"><strong>${esc(docTitle)}</strong><small>${esc(meta)} · ${lessons.length} bài</small></div>
        <div class="scope-toolbar" role="group" aria-label="Chọn nhanh phạm vi bài học">
          <button type="button" class="secondary scope-quick" data-scope-action="all-lessons">Chọn tất cả ${lessons.length} bài</button>
          <button type="button" class="secondary scope-quick" data-scope-action="none">Bỏ chọn</button>
        </div>
        <label class="scope-all-row">
          <input type="checkbox" class="knowledge-doc-all knowledge-check" value="${esc(doc.id)}">
          <span><strong>Dùng toàn bộ sách</strong><small>Chỉ chọn khi đề thực sự bao quát toàn bộ ${lessons.length} bài.</small></span>
        </label>
        <div class="scope-lessons" aria-label="Danh sách bài học">${lessonRows}</div>
      </div>`;
    }).join('');
    bindScopeControls();
  }

  async function loadScopeCatalog036() {
    const session = aieRequireSession();
    if (!session) return;
    const scope = aieTargetScope(session);
    if (!scope) return;
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
        aieNotice(`Đã nạp ${docs.length} nguồn. Hãy chọn trực tiếp các bài cần kiểm tra trong mục PHẠM VI KIẾN THỨC.`, 'info');
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
  style.textContent = `
    #knowledgeDocs{max-height:460px}
    .scope-doc-group{border:1px solid #cbd5e1;border-radius:10px;margin:8px;background:#fff;overflow:hidden}
    .scope-title-block{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#eff6ff;border-bottom:1px solid #bfdbfe;color:#1e3a8a}
    .scope-title-block>div>strong{display:block;font-size:13px;letter-spacing:.03em}.scope-title-block small{display:block;color:#475569;margin-top:3px;font-size:11px}
    .scope-selection-summary{white-space:nowrap;border-radius:999px;padding:5px 9px;background:#e2e8f0;color:#475569;font-size:11px;font-weight:800}.scope-selection-summary.selected{background:#dcfce7;color:#166534}.scope-selection-summary.all{background:#dbeafe;color:#1d4ed8}
    .scope-doc-info{padding:10px 14px}.scope-doc-info>strong{display:block;font-size:13px}.scope-doc-info small{display:block;color:#64748b;margin-top:2px;font-size:11px}
    .scope-toolbar{display:flex;gap:8px;flex-wrap:wrap;padding:0 14px 10px}.scope-quick{padding:7px 10px;font-size:11px}
    .scope-all-row{display:flex;gap:9px;align-items:flex-start;margin:0 14px 10px;padding:9px 10px;border:1px solid #fde68a;background:#fffbeb;border-radius:8px}.scope-all-row input{width:auto;margin-top:3px}.scope-all-row strong{font-size:12px}.scope-all-row small{display:block;color:#92400e;margin-top:2px;font-size:11px}
    .scope-lessons{padding:0 14px 12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
    .scope-lesson-row{display:flex;gap:9px;align-items:flex-start;padding:8px 9px;border:1px solid #e2e8f0;border-radius:7px;background:#fff}.scope-lesson-row:hover{background:#f8fafc}.scope-lesson-row input{width:auto;margin-top:3px}.scope-lesson-row strong{font-size:12px}.scope-lesson-row small{display:block;color:#64748b;margin-top:2px;font-size:11px}
    @media(max-width:760px){.scope-lessons{grid-template-columns:1fr}.scope-title-block{align-items:flex-start;flex-direction:column}}
  `;
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
