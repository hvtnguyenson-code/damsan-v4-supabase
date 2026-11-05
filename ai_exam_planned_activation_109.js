// 109 — Activate the P0-P6 Geography pipeline for Web AI without changing student/runtime exam flows.
(function () {
  'use strict';

  const legacyCreatePackage = window.aieCreatePackage;
  const legacyValidateDraft = window.aieValidateDraft;
  const WEB_TARGETS = {
    CHATGPT_WEB: { label:'ChatGPT', url:'https://chatgpt.com/' },
    GEMINI_WEB: { label:'Gemini', url:'https://gemini.google.com/app' },
    CLAUDE_WEB: { label:'Claude', url:'https://claude.ai/new' }
  };

  const state = {
    mode: 'idle',
    stage: 'idle',
    capability: '',
    requestId: '',
    room: '',
    localSpec: null,
    manifest: null,
    batchIndex: 0,
    batchInputs: [],
    batchOutputs: [],
    exam: null,
    generatorProvider: '',
    generatorModel: '',
    criticProvider: '',
    criticModel: ''
  };
  window.aiePlanned109 = state;

  function reset() {
    Object.assign(state, {
      mode:'idle', stage:'idle', capability:'', requestId:'', room:'', localSpec:null,
      manifest:null, batchIndex:0, batchInputs:[], batchOutputs:[], exam:null,
      generatorProvider:'', generatorModel:'', criticProvider:'', criticModel:''
    });
    renderProgress();
    renderCriticActions(false);
  }

  function setStatus(text, kind='info') {
    const el = document.getElementById('validationStatus');
    if (el) {
      el.textContent = text || '';
      el.className = 'statusline' + (kind ? ' ' + kind : '');
    }
  }

  function jsonPrompt(title, payload) {
    return [
      title,
      'Chỉ trả về DUY NHẤT JSON đúng schema được yêu cầu; không Markdown, không giải thích ngoài JSON.',
      '',
      JSON.stringify(payload)
    ].join('\n');
  }

  function batchPrompt(data) {
    return jsonPrompt(
      `ĐAM SAN V4 — PLANNED GENERATION 109 — batch ${Number(data.batch?.batch_index || 0)+1}/${data.manifest?.batch_count || 8}`,
      {
        task:'GENERATE_ONE_PLANNED_BATCH',
        instructions:data.instructions,
        knowledge_pack:data.knowledge_pack
      }
    );
  }

  function criticPrompt(data) {
    return jsonPrompt(
      'ĐAM SAN V4 — INDEPENDENT CRITIC 106. Mày là reviewer độc lập, không phải generator. Không sửa đề; chỉ chẩn đoán/chấm rubric.',
      data.critic_input
    );
  }

  function renderProgress() {
    let el = document.getElementById('aiePlannedProgress109');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aiePlannedProgress109';
      el.className = 'authority-panel hidden';
      document.getElementById('generationStatus')?.insertAdjacentElement('afterend', el);
    }
    if (state.mode !== 'planned') {
      el.className = 'authority-panel hidden';
      el.textContent = '';
      return;
    }
    const total = Number(state.manifest?.batch_count || 8);
    let detail = '';
    if (state.stage === 'batch') detail = `Đang tạo batch ${state.batchIndex+1}/${total}; đã kiểm định ${state.batchOutputs.length}/${total} batch.`;
    else if (state.stage === 'critic') detail = 'Đã đủ 28 slot. Đang chờ phản biện độc lập P4.';
    else if (state.stage === 'ready_submit') detail = 'Critic PASS. Đang sẵn sàng calibration + canonical validation.';
    else if (state.stage === 'done') detail = 'P0–P6 PASS. Draft đã vào bước giáo viên duyệt.';
    el.className = 'authority-panel ok';
    el.textContent = `AI Địa lí P0–P6 đang hoạt động. ${detail}`;
  }

  function renderCriticActions(show) {
    let panel = document.getElementById('aieCriticActions109');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'aieCriticActions109';
      panel.className = 'actions hidden';
      panel.innerHTML = `
        <span class="sub" style="align-self:center"><strong>Phản biện độc lập:</strong></span>
        <button type="button" class="secondary" data-critic-provider="CHATGPT_WEB">Mở ChatGPT</button>
        <button type="button" class="secondary" data-critic-provider="GEMINI_WEB">Mở Gemini</button>
        <button type="button" class="secondary" data-critic-provider="CLAUDE_WEB">Mở Claude</button>
        <input id="criticModel109" style="max-width:220px" placeholder="Model phản biện (tùy chọn)">
      `;
      document.getElementById('btnCopyPrompt')?.parentElement?.insertAdjacentElement('afterend', panel);
      panel.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-critic-provider]');
        if (!button) return;
        const provider = button.dataset.criticProvider;
        if (provider === state.generatorProvider) {
          return aieNotice('Critic phải dùng AI web khác generator để bảo đảm phản biện độc lập.', 'error');
        }
        state.criticProvider = provider;
        state.criticModel = String(document.getElementById('criticModel109')?.value || '').trim() || 'web-critic-unspecified';
        try {
          await navigator.clipboard.writeText(document.getElementById('promptBox')?.value || '');
        } catch { /* prompt remains selectable */ }
        window.open(WEB_TARGETS[provider].url, '_blank', 'noopener');
        aieNotice(`Đã chọn ${WEB_TARGETS[provider].label} làm critic độc lập. Dán prompt phản biện và đưa JSON kết quả trở lại.`, 'ok');
      });
    }
    panel.classList.toggle('hidden', !show);
    panel.querySelectorAll('[data-critic-provider]').forEach((button) => {
      button.disabled = button.dataset.criticProvider === state.generatorProvider;
    });
  }

  async function fetchLegacyPack(capability) {
    const units = [];
    let first = null, offset = 0;
    for (let page=0; page<25; page++) {
      const data = await aieGateway({
        action:'get_generation_input', capability_token:capability,
        worker_id:'damsan-ai-exam-ui-109-legacy-fallback', offset, limit:120
      });
      if (!first) first = data;
      units.push(...(Array.isArray(data.knowledge_pack?.units) ? data.knowledge_pack.units : []));
      if (!data.knowledge_pack?.has_more) return { first, units };
      const next = Number(data.knowledge_pack.next_offset);
      if (!Number.isSafeInteger(next) || next <= offset) throw new Error('Knowledge Pack fallback trả offset không hợp lệ.');
      offset = next;
    }
    throw new Error('Knowledge Pack fallback vượt giới hạn an toàn.');
  }

  async function fetchBatch(index) {
    const data = await aieGateway({
      action:'get_planned_generation_input',
      capability_token:state.capability,
      worker_id:'damsan-ai-exam-ui-planned-109',
      batch_index:index
    });
    state.manifest = data.manifest;
    state.batchInputs[index] = data;
    state.batchIndex = index;
    document.getElementById('promptBox').value = batchPrompt(data);
    document.getElementById('resultBox').value = '';
    document.getElementById('btnValidate').textContent = `Kiểm định batch ${index+1}/${data.manifest.batch_count}`;
    document.getElementById('generationStatus').textContent =
      `Request ${state.requestId} · Planned Generation 105/109 · batch ${index+1}/${data.manifest.batch_count} · ${data.knowledge_pack.batch_unit_count} unit trong phạm vi slot.`;
    renderProgress();
  }

  async function plannedCreatePackage109() {
    if (aieBusy) return;
    const session = aieRequireSession();
    if (!session) return;
    const scope = aieTargetScope(session);
    const room = document.getElementById('roomCode').value.trim();
    if (!room) return aieNotice('Hãy nhập mã phòng.', 'error');
    const documentIds = aieSelectedDocumentIds();
    if (!documentIds.length) return aieNotice('Hãy chọn ít nhất một tài liệu nguồn.', 'error');

    let spec;
    try { spec = aieSpec(); }
    catch (error) { return aieNotice(error.message, 'error'); }

    aieSetBusy(true);
    reset();
    document.getElementById('promptBox').value = '';
    document.getElementById('resultBox').value = '';
    try {
      const created = await aieGateway({
        action:'create_generation_request',
        staff_token:session.token,
        ma_gv:session.profile.ma_gv,
        truong_id:scope.truong_id,
        mon_id:scope.mon_id,
        ma_phong:room,
        exam_spec:spec,
        knowledge_document_ids:documentIds
      });
      aieCapability = created.capability_token;
      aieCurrentRequestId = created.request_id;
      state.capability = created.capability_token;
      state.requestId = created.request_id;
      state.room = room;
      state.localSpec = spec;

      try {
        await fetchBatch(0);
        state.mode = 'planned';
        state.stage = 'batch';
        renderProgress();
        aieNotice('Đã kích hoạt Planned Generation P0–P6. Tạo từng batch theo prompt; server sẽ khóa đúng slot và nguồn.', 'ok');
      } catch (error) {
        const code = String(error?.code || error?.message || '');
        if (!/planned_(design_plan|blueprint|slot|generation)|independent_critic|calibration/.test(code)) throw error;
        state.mode = 'legacy';
        const collected = await fetchLegacyPack(state.capability);
        document.getElementById('promptBox').value = aieBuildPrompt(collected.first, collected.units, spec);
        document.getElementById('btnValidate').textContent = 'Gửi kiểm định đề';
        aieNotice('Request này không thuộc blueprint P0–P6; hệ thống tự dùng luồng tương thích cũ.', 'info');
      }
      await aieLoadRequests();
    } catch (error) {
      reset();
      aieCapability = '';
      aieCurrentRequestId = '';
      aieNotice(error?.message || 'Không tạo được gói đề AI.', 'error');
    } finally {
      aieSetBusy(false);
    }
  }

  function assembleExam() {
    const questions = state.batchOutputs.flatMap((batch) => Array.isArray(batch.items) ? batch.items : []);
    if (questions.length !== 28) throw new Error(`Planned exam phải có đúng 28 slot, hiện có ${questions.length}.`);
    return {
      schema_version:'DAMSAN_EXAM_V1',
      title:`Đề AI Địa lí - ${state.room}`,
      assessment_type:state.localSpec?.assessment_type || 'TOT_NGHIEP',
      scoring_config:state.localSpec?.scoring_config || {},
      questions
    };
  }

  async function moveToCritic() {
    state.exam = assembleExam();
    const critic = await aieGateway({
      action:'get_independent_critic_input',
      capability_token:state.capability,
      worker_id:'damsan-ai-exam-ui-critic-109',
      exam:state.exam
    });
    state.stage = 'critic';
    document.getElementById('promptBox').value = criticPrompt(critic);
    document.getElementById('resultBox').value = '';
    document.getElementById('btnValidate').textContent = 'Kiểm định phản biện & hoàn tất';
    renderProgress();
    renderCriticActions(true);
    aieNotice('28 slot đã qua planned validation. Hãy dùng một AI web KHÁC generator để phản biện độc lập.', 'ok');
  }

  async function validateBatch() {
    const raw = document.getElementById('resultBox').value;
    let payload;
    try { payload = aieLooseJson(raw); }
    catch (error) { throw new Error(`JSON batch không hợp lệ: ${error.message}`); }

    if (!state.generatorProvider) {
      state.generatorProvider = document.getElementById('provider').value || 'WEB_AI';
      state.generatorModel = document.getElementById('modelName').value.trim() || 'web-generator-unspecified';
    }

    const checked = await aieGateway({
      action:'validate_planned_batch',
      capability_token:state.capability,
      worker_id:'damsan-ai-exam-ui-planned-109',
      batch_index:state.batchIndex,
      batch:payload
    });
    state.batchOutputs[state.batchIndex] = checked.normalized_batch;
    const total = Number(state.manifest?.batch_count || 8);
    if (state.batchIndex + 1 < total) {
      await fetchBatch(state.batchIndex + 1);
      aieNotice(`Batch ${state.batchIndex}/${total} đã PASS. Prompt batch tiếp theo đã sẵn sàng.`, 'ok');
    } else {
      await moveToCritic();
    }
  }

  async function validateCriticAndSubmit() {
    if (!state.criticProvider) throw new Error('Hãy chọn và mở một AI phản biện khác generator trước.');
    if (state.criticProvider === state.generatorProvider) throw new Error('Critic phải khác provider generator.');
    let report;
    try { report = aieLooseJson(document.getElementById('resultBox').value); }
    catch (error) { throw new Error(`JSON phản biện không hợp lệ: ${error.message}`); }

    report.schema_version = 'DAMSAN_INDEPENDENT_CRITIC_V1';
    report.critic_run_id = report.critic_run_id || `web-critic-${state.requestId}-${Date.now()}`;
    report.reviewer = {
      provider:state.criticProvider,
      model:String(document.getElementById('criticModel109')?.value || '').trim() || state.criticModel || 'web-critic-unspecified',
      independent_run:true
    };

    const criticCheck = await aieGateway({
      action:'validate_independent_critic_report',
      capability_token:state.capability,
      worker_id:'damsan-ai-exam-ui-critic-109',
      exam:state.exam,
      critic_report:report
    });
    if (criticCheck.validation?.decision !== 'PASS') {
      setStatus(`Critic yêu cầu REVISE · ${criticCheck.validation?.revision_item_count || 0} câu cần sửa · ${criticCheck.validation?.fail_item_count || 0} câu FAIL.`, 'warn');
      throw new Error('Đề chưa vượt Independent Critic. Hãy tạo lại request để sửa theo phản biện; hệ thống chưa ghi draft.');
    }

    state.stage = 'ready_submit';
    renderProgress();
    const result = await aieGateway({
      action:'submit_planned_exam_draft',
      capability_token:state.capability,
      worker_id:'damsan-ai-exam-ui-final-109',
      ai_provider:state.generatorProvider || 'WEB_AI_PLANNED_109',
      ai_model:state.generatorModel || 'web-generator-unspecified',
      exam:state.exam,
      critic_report:report
    });

    state.stage = 'done';
    renderProgress();
    renderCriticActions(false);
    setStatus(
      `P0–P6 VALIDATED · revision ${result.revision} · calibration ${result.validation?.calibration?.overall_score ?? '-'} · ${result.validation?.question_count || 28} câu.`,
      'ok'
    );
    aieNotice('Đề đã vượt Planned Generation, Independent Critic, Calibration và canonical validator. Hãy kiểm tra preview trước khi phê duyệt.', 'ok');
    aieCapability = '';
    state.capability = '';
    document.getElementById('btnValidate').textContent = 'Gửi kiểm định đề';
    await aieLoadRequests(state.requestId);
  }

  async function plannedValidate109() {
    if (state.mode !== 'planned') return legacyValidateDraft();
    if (aieBusy) return;
    aieSetBusy(true);
    try {
      if (state.stage === 'batch') await validateBatch();
      else if (state.stage === 'critic') await validateCriticAndSubmit();
      else throw new Error('Trạng thái P0–P6 không hợp lệ; hãy tạo request mới.');
    } catch (error) {
      aieNotice(error?.message || 'P0–P6 validation thất bại.', 'error');
    } finally {
      aieSetBusy(false);
    }
  }

  window.aieCreatePackage = plannedCreatePackage109;
  window.aieValidateDraft = plannedValidate109;

  function mount() {
    // aieBind already bound the legacy validator by reference; replace only this button to avoid double submit.
    const old = document.getElementById('btnValidate');
    if (old && !old.dataset.planned109) {
      const button = old.cloneNode(true);
      button.dataset.planned109 = '1';
      old.replaceWith(button);
      button.addEventListener('click', plannedValidate109);
    }
    renderProgress();
    renderCriticActions(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
