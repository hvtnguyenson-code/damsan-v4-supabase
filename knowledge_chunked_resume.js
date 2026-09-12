// AI-UX-042B — restore long-book normalization progress after page refresh.
// Read-only recovery helper: it never mutates room/exam data and never creates/imports chunks.
(() => {
  'use strict';

  const ENDPOINT = `${KNOWLEDGE_SUPABASE_URL}/functions/v1/knowledge-chunked-normalization`;
  const STORAGE_PREFIX = 'damsan.chunked.resume.v1';
  let restoring = false;

  function activeSession() {
    return typeof knowledgeSession === 'function' ? knowledgeSession() : null;
  }

  function storageKey() {
    const active = activeSession();
    const maGv = active?.profile?.ma_gv || 'anonymous';
    return `${STORAGE_PREFIX}.${maGv}`;
  }

  function readSaved() {
    try {
      const raw = window.localStorage.getItem(storageKey());
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeSaved(patch = {}) {
    try {
      const next = { ...readSaved(), ...patch, saved_at: new Date().toISOString() };
      window.localStorage.setItem(storageKey(), JSON.stringify(next));
    } catch {
      // Recovery persistence is best-effort; server state remains authoritative.
    }
  }

  function setResumeStatus(message, kind = 'info') {
    const el = document.getElementById('chunkedStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `chunked-status ${kind}`;
  }

  async function readPlan(documentId) {
    const active = activeSession();
    if (!active || !documentId) return null;
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KNOWLEDGE_SUPABASE_KEY },
      cache: 'no-store',
      body: JSON.stringify({
        action: 'read_plan',
        staff_token: active.token,
        ma_gv: active.profile.ma_gv,
        document_id: documentId
      })
    });
    if (!response.ok) return null;
    let data = null;
    try { data = await response.json(); } catch { return null; }
    if (!data || data.status !== 'success' || !data.plan) return null;
    return data;
  }

  function optionValues(select) {
    return Array.from(select?.options || []).map((option) => option.value).filter(Boolean);
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitForOptions(id, timeoutMs = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const select = document.getElementById(id);
      if (select && optionValues(select).length) return select;
      await wait(80);
    }
    return document.getElementById(id);
  }

  function planPriority(plan) {
    if (!plan) return 0;
    if (plan.plan_status === 'ACTIVE') return 3;
    if (plan.plan_status === 'NEEDS_REVIEW') return 2;
    if (plan.plan_status === 'ASSEMBLED') return 1;
    return 0;
  }

  function planTime(plan) {
    return Date.parse(plan?.updated_at || plan?.created_at || '') || 0;
  }

  async function findLatestServerPlan(documentIds) {
    const results = await Promise.all(documentIds.map(async (documentId) => {
      const data = await readPlan(documentId);
      return data?.plan ? { documentId, data } : null;
    }));
    return results
      .filter(Boolean)
      .sort((a, b) => {
        const priority = planPriority(b.data.plan) - planPriority(a.data.plan);
        return priority || (planTime(b.data.plan) - planTime(a.data.plan));
      })[0] || null;
  }

  async function restoreChunkSelection(savedChunkId) {
    if (!savedChunkId) return;
    for (let i = 0; i < 30; i += 1) {
      const select = document.getElementById('chunkedChunkSelect');
      if (select && Array.from(select.options || []).some((option) => option.value === savedChunkId)) {
        select.value = savedChunkId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      await wait(100);
    }
  }

  async function activateDocument(documentId, sourceLabel, planData = null) {
    const docSelect = document.getElementById('chunkedDocument');
    if (!docSelect || !Array.from(docSelect.options || []).some((option) => option.value === documentId)) return false;
    docSelect.value = documentId;
    writeSaved({ document_id: documentId });
    docSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(250);

    const saved = readSaved();
    await restoreChunkSelection(saved.chunk_id || '');

    if (planData?.plan) {
      const lessonChunks = Array.isArray(planData.chunks) ? planData.chunks.filter((chunk) => chunk.chunk_type === 'LESSON') : [];
      const done = lessonChunks.filter((chunk) => ['IMPORTED', 'NEEDS_REVIEW'].includes(chunk.status)).length;
      const name = docSelect.options[docSelect.selectedIndex]?.textContent?.trim() || 'tài liệu đang làm dở';
      setResumeStatus(`Đã tự khôi phục tiến độ sau tải lại: ${name} · ${planData.plan.plan_status} · ${done}/${lessonChunks.length} chunk hoàn tất. Không cần nhập lại kế hoạch.`, sourceLabel === 'server' ? 'ok' : 'info');
    }
    return true;
  }

  function persistVisibleState() {
    const doc = document.getElementById('chunkedDocument');
    const subject = document.getElementById('chunkedSubject');
    const grade = document.getElementById('chunkedGrade');
    const provider = document.getElementById('chunkedProvider');
    const model = document.getElementById('chunkedModel');
    const chunk = document.getElementById('chunkedChunkSelect');
    writeSaved({
      document_id: doc?.value || '',
      subject_id: subject?.value || '',
      grade: grade?.value || '',
      provider: provider?.value || '',
      model: model?.value || '',
      chunk_id: chunk?.value || ''
    });
  }

  function bindPersistence() {
    for (const id of ['chunkedDocument', 'chunkedSubject', 'chunkedGrade', 'chunkedProvider', 'chunkedChunkSelect']) {
      document.getElementById(id)?.addEventListener('change', persistVisibleState);
    }
    document.getElementById('chunkedModel')?.addEventListener('input', persistVisibleState);
  }

  function restoreSimpleFields(saved) {
    const provider = document.getElementById('chunkedProvider');
    if (provider && saved.provider && Array.from(provider.options || []).some((option) => option.value === saved.provider)) provider.value = saved.provider;
    const model = document.getElementById('chunkedModel');
    if (model && typeof saved.model === 'string') model.value = saved.model;
  }

  async function recover() {
    if (restoring) return;
    restoring = true;
    try {
      const docSelect = await waitForOptions('chunkedDocument');
      if (!docSelect) return;
      bindPersistence();
      const saved = readSaved();
      restoreSimpleFields(saved);
      const ids = optionValues(docSelect);
      if (!ids.length) return;

      if (saved.document_id && ids.includes(saved.document_id)) {
        const savedPlan = await readPlan(saved.document_id);
        if (savedPlan?.plan) {
          await activateDocument(saved.document_id, 'local', savedPlan);
          return;
        }
      }

      // First refresh after upgrading from 042/041B has no saved document yet.
      // Probe only authoritative server plan state and restore the most recent unfinished plan.
      const latest = await findLatestServerPlan(ids);
      if (latest) {
        await activateDocument(latest.documentId, 'server', latest.data);
        return;
      }
    } finally {
      restoring = false;
    }
  }

  function boot() {
    if (document.getElementById('chunkedDocument')) {
      recover();
      return;
    }
    const observer = new MutationObserver(() => {
      if (!document.getElementById('chunkedDocument')) return;
      observer.disconnect();
      recover();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true });
  else setTimeout(boot, 0);
})();
