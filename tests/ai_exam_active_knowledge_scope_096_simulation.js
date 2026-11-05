const fs = require('fs');
const vm = require('vm');

const subject = fs.readFileSync('ai_exam_subject_scope.js', 'utf8');
const scope = fs.readFileSync('ai_exam_knowledge_scope.js', 'utf8');
const grade = fs.readFileSync('ai_exam_grade_authority.js', 'utf8');
const html = fs.readFileSync('ai_exam.html', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('=== AI ACTIVE KNOWLEDGE SCOPE 096 ===');

// Runtime regression: Admin workspace=ALL must fall back to the Admin profile school.
{
  const storage = new Map([
    ['damSan_WorkspaceSchool', 'ALL'],
    ['damSan_Workspace', 'geo-subject']
  ]);
  const subjectSelect = {
    value: 'geo-subject',
    selectedIndex: 0,
    options: [{ textContent: 'Địa lí' }],
    addEventListener() {}
  };
  const context = {
    console,
    window: {},
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    document: {
      getElementById(id) {
        if (id === 'subjectSelect') return subjectSelect;
        return null;
      },
      addEventListener() {}
    },
    aieTargetScope(session) {
      const profile = session?.profile || {};
      return profile.truong_id && profile.mon_id
        ? { truong_id: profile.truong_id, mon_id: profile.mon_id }
        : null;
    },
    aieSession() { return null; },
    aieSb: {},
    aieEscape(value) { return String(value); },
    aieCapability: '',
    aieCurrentRequestId: ''
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(subject, context, { filename: 'ai_exam_subject_scope.js' });

  const admin = {
    profile: {
      quyen: 'Admin',
      truong_id: 'damsan-school',
      mon_id: null
    }
  };

  const fallback = context.aieTargetScope(admin);
  assert(fallback?.truong_id === 'damsan-school', 'A096-01 workspace ALL must fall back to Admin profile school');
  assert(fallback?.mon_id === 'geo-subject', 'A096-02 visible subject must remain authoritative');

  storage.set('damSan_WorkspaceSchool', 'other-school');
  const explicit = context.aieTargetScope(admin);
  assert(explicit?.truong_id === 'other-school', 'A096-03 explicit concrete Admin workspace school must be preserved');
}

// Structural regression: one canonical lesson-scope loader owns AI knowledge loading.
assert(scope.includes("rpc_knowledge_scope_catalog_read"), 'A096-04 lesson-scope catalog RPC missing');
assert(!scope.includes("rpc_knowledge_library_read"), 'A096-05 legacy library RPC must not drive AI exam scope');
assert(scope.includes("window.aieLoadScopeCatalog = loadScopeCatalog036"), 'A096-06 canonical scope loader export missing');
assert(scope.includes("window.aieKnowledgeCatalogDocuments = docs"), 'A096-07 immutable catalog snapshot missing');
assert(scope.includes("aieDocuments = [...docs]"), 'A096-08 working document list must be copied from catalog');
assert(scope.includes("if (typeof aieLoadDocuments === 'function') aieLoadDocuments();"), 'A096-09 refresh must use final canonical loader chain');
assert(!scope.includes('loadAfterBaseInitialization'), 'A096-10 duplicate auto-loader must be removed');

// Grade filtering must always start from the immutable catalog, never from a previously filtered list.
assert(grade.includes("window.aieKnowledgeCatalogDocuments"), 'A096-11 grade filter must read immutable catalog');
assert(grade.includes("await window.aieLoadScopeCatalog();"), 'A096-12 grade load must call canonical lesson-scope loader');
assert(!grade.includes("await baseLoadDocuments();"), 'A096-13 legacy loader fallback must not be used');
assert(grade.includes("Chưa có nguồn kiến thức đã kích hoạt cho khối"), 'A096-14 grade-specific empty-state message missing');
assert(grade.includes("Chưa có nguồn kiến thức đã kích hoạt cho trường/môn đang chọn."), 'A096-15 scope-specific empty-state message missing');

// Cache-bust all three coordinating overlays so deployed browsers cannot keep the stale chain.
const marker = '20261104-active-knowledge-scope-096';
assert(html.includes('ai_exam_subject_scope.js?v=' + marker), 'A096-16 subject-scope cache marker missing');
assert(html.includes('ai_exam_knowledge_scope.js?v=' + marker), 'A096-17 knowledge-scope cache marker missing');
assert(html.includes('ai_exam_grade_authority.js?v=20261105-authority-p0-097'), 'A096-18 grade-authority cache marker missing');

console.log('AI_ACTIVE_KNOWLEDGE_SCOPE_096_PASS');
