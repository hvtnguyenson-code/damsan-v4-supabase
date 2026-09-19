// 067 — one-click AI orchestration without nested long-running Edge workers.
(() => {
  const ROUTER_ENDPOINT = `${AIE_SUPABASE_URL}/functions/v1/exam-ai-router`;
  const ORCHESTRATOR_ENDPOINT = `${AIE_SUPABASE_URL}/functions/v1/exam-ai-orchestrator`;
  const MAX_AUTO_ATTEMPTS = 10;
  let autoBusy = false;
  let manualVisible = false;

  function sessionBody() {
    const s = aieSession();
    if (!s) throw new Error('Phiên giáo viên không còn hợp lệ.');
    return { staff_token: s.token, ma_gv: s.profile.ma_gv };
  }

  async function postJson(endpoint, payload, fallbackCode) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': AIE_SUPABASE_KEY },
      cache: 'no-store',
      body: JSON.stringify({ ...payload, ...sessionBody() })
    });
    let data = null;
    try {
      const text = await response.text();
      data = text.trim() ? JSON.parse(text.trim()) : null;
    } catch {
      data = null;
    }
    if (!response.ok || !data || data.status !== 'success') {
      const platformCode = response.status === 546 ? 'WORKER_RESOURCE_LIMIT' : '';
      const error = new Error(data?.message || data?.code || platformCode || `${fallbackCode} trả mã ${response.status}.`);
      error.code = data?.code || platformCode || fallbackCode;
      error.detail = data || { status: 'error', code: error.code, http_status: response.status };
      throw error;
    }
    return data;
  }

  function routerPost(payload) {
    return postJson(ROUTER_ENDPOINT, payload, 'ai_route_failed');
  }

  function orchestratorPost(payload) {
    return postJson(ORCHESTRATOR_ENDPOINT, payload, 'api_generation_failed');
  }

  function cardByHeading(prefix) {
    return Array.from(document.querySelectorAll('section.card')).find((card) => String(card.querySelector('h2')?.textContent || '').trim().startsWith(prefix)) || null;
  }

  function setManualVisible(value) {
    manualVisible = !!value;
    const promptCard = cardByHeading('2. Prompt');
    const receiveCard = cardByHeading('3. Nhận đề');
    promptCard?.classList.toggle('hidden', !manualVisible);
    receiveCard?.classList.toggle('hidden', !manualVisible);
    document.getElementById('btnChatGPT')?.classList.toggle('hidden', !manualVisible);
    document.getElementById('btnGemini')?.classList.toggle('hidden', !manualVisible);
    const toggle = document.getElementById('btnManualAiWeb');
    if (toggle) toggle.textContent = manualVisible ? 'Ẩn AI Web thủ công' : 'Dùng AI Web thủ công';
  }

  function setAutoStatus(text, kind = 'info') {
    const el = document.getElementById('aieAutoStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = `authority-panel ${kind}`;
  }

  function mountTargetClass() {
    if (document.getElementById('targetClass')) return;
    const grid = document.getElementById('roomCode')?.closest('.grid4');
    if (!grid) return;
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = '<label for="targetClass">Lớp / đối tượng</label><select id="targetClass"><option value="TatCa">Tất cả các lớp</option></select>';
    grid.appendChild(field);

    const previousSpec = window.aieSpec;
    if (typeof previousSpec === 'function' && !previousSpec.__targetClass066b) {
      const wrapped = function aieSpecTargetClass066b() {
        const spec = previousSpec();
        spec.target_class = document.getElementById('targetClass')?.value || 'TatCa';
        return spec;
      };
      wrapped.__targetClass066b = true;
      window.aieSpec = wrapped;
    }

    document.getElementById('gradeSelect')?.addEventListener('change', loadTargetClasses);
    loadTargetClasses();
  }

  async function loadTargetClasses() {
    const select = document.getElementById('targetClass');
    const session = aieSession();
    if (!select || !session) return;
    const scope = aieTargetScope(session);
    if (!scope) return;
    const grade = Number(document.getElementById('gradeSelect')?.value || 0);
    const previous = select.value || 'TatCa';
    try {
      const { data, error } = await aieSb.rpc('rpc_ai_exam_class_list', {
        p_staff_token: session.token,
        p_ma_gv: session.profile.ma_gv,
        p_truong_id: scope.truong_id,
        p_grade: Number.isInteger(grade) && grade > 0 ? grade : null
      });
      if (error) throw error;
      if (!data || data.status !== 'success') throw new Error(data?.code || 'class_list_failed');
      const classes = Array.isArray(data.classes) ? data.classes.filter(Boolean) : [];
      select.innerHTML = '<option value="TatCa">Tất cả các lớp</option>' + classes.map((name) => `<option value="${aieEscape(name)}">${aieEscape(name)}</option>`).join('');
      if (previous === 'TatCa' || classes.includes(previous)) select.value = previous;
    } catch {
      select.innerHTML = '<option value="TatCa">Tất cả các lớp</option>';
    }
  }

  function safeValidationMessage(detail) {
    const validation = detail && typeof detail.validation === 'object' ? detail.validation : null;
    if (!validation) return '';
    try { return JSON.stringify(validation).slice(0, 6000); } catch { return ''; }
  }

  function repairPrompt(prompt, detail, code) {
    const validation = safeValidationMessage(detail);
    return `${prompt}\n\n---\nLẦN TẠO TRƯỚC CHƯA VƯỢT KIỂM ĐỊNH SERVER.\nMã lỗi: ${code || 'validation_failed'}\n${validation ? `Chi tiết kiểm định: ${validation}\n` : ''}Hãy tạo lại TOÀN BỘ đề, sửa triệt để các lỗi trên nhưng vẫn tuân thủ nguyên vẹn ASSESSMENT AUTHORITY, KNOWLEDGE PACKAGE, source_refs và DAMSAN_EXAM_V1. Chỉ trả về một JSON object hoàn chỉnh.`;
  }

  function shouldRepair(code) {
    const value = String(code || '');
    if (/^WORKER_|^worker_|^provider_|^staff_|^generation_|^handoff_|^orchestrator_http_|^api_generation_failed$|^provider_or_model_invalid$|^model_not_found$/.test(value)) return false;
    if (value.startsWith('request_forbidden') || value.startsWith('provider_forbidden')) return false;
    return true;
  }

  async function refreshRouteStatus() {
    try {
      const data = await routerPost({ action: 'route_status' });
      if (data.ready) setAutoStatus('AI tự động đã sẵn sàng. Hệ thống sẽ tự chọn model, tự kiểm định và tự thử model khác khi cần.', 'ok');
      else setAutoStatus('Chưa có kết nối AI khả dụng. Cấu hình một lần ở “Cấu hình AI”, sau đó việc ra đề chỉ cần một nút.', 'warn');
      return !!data.ready;
    } catch (error) {
      setAutoStatus(`Chưa kiểm tra được AI tự động: ${error.code || error.message}`, 'warn');
      return false;
    }
  }

  async function generateAutomatically(requestId, prompt) {
    const plan = await routerPost({ action: 'route_plan' });
    const candidates = Array.isArray(plan.candidates) ? plan.candidates : [];
    if (!candidates.length) {
      const error = new Error('Không có model AI khả dụng.');
      error.code = 'ai_route_unavailable';
      throw error;
    }

    let attemptNo = 0;
    const failures = [];
    for (const candidate of candidates) {
      if (attemptNo >= MAX_AUTO_ATTEMPTS) break;
      let workingPrompt = prompt;
      for (let localAttempt = 0; localAttempt < 2 && attemptNo < MAX_AUTO_ATTEMPTS; localAttempt += 1) {
        attemptNo += 1;
        setAutoStatus(`Đang tạo và kiểm định đề · lượt ${attemptNo}...`, 'info');
        try {
          const result = await orchestratorPost({
            action: 'generate_exam_stream',
            request_id: requestId,
            provider_id: candidate.provider_id,
            model_profile_id: candidate.model_profile_id,
            prompt: workingPrompt
          });
          result.route_attempts = attemptNo;
          result.route_candidate_count = candidates.length;
          return result;
        } catch (error) {
          const code = error.code || 'api_generation_failed';
          failures.push({ code });
          if (localAttempt === 0 && shouldRepair(code)) {
            workingPrompt = repairPrompt(prompt, error.detail, code);
            continue;
          }
          break;
        }
      }
    }

    const error = new Error('Tất cả model khả dụng đều chưa tạo được đề hợp lệ.');
    error.code = 'ai_route_exhausted';
    error.detail = { status: 'error', code: error.code, attempts: attemptNo, failures };
    throw error;
  }

  async function generateOneClick() {
    if (autoBusy) return;
    autoBusy = true;
    const button = document.getElementById('btnCreate');
    if (button) button.disabled = true;
    setAutoStatus('Đang chuẩn bị phạm vi kiến thức và tiêu chuẩn đề...', 'info');
    try {
      await aieCreatePackage();
      const prompt = document.getElementById('promptBox')?.value || '';
      if (!aieCurrentRequestId || !prompt.trim()) return;

      aieSetBusy(true);
      setAutoStatus('Đang tạo đề bằng AI → kiểm định → tự sửa hoặc đổi model nếu cần...', 'info');
      const result = await generateAutomatically(aieCurrentRequestId, prompt);
      aieCapability = '';
      document.getElementById('validationStatus').textContent = `AI VALIDATED · revision ${result.revision}`;
      setAutoStatus(`Đề đã vượt kiểm định · ${result.route_attempts || 1} lượt AI · revision ${result.revision}.`, 'ok');
      aieNotice('Đề đã sẵn sàng để duyệt. Kiểm tra nội dung rồi phê duyệt để đưa lên phòng.', 'ok');
      await aieLoadRequests(result.request_id);
    } catch (error) {
      const failures = Array.isArray(error.detail?.failures) ? error.detail.failures : [];
      const suffix = failures.length ? ` (${failures.map((x) => x.code).slice(0, 3).join(', ')})` : '';
      setAutoStatus(`AI chưa tạo được đề hợp lệ: ${error.code || error.message}${suffix}`, 'error');
      aieNotice('Hệ thống chưa có đề vượt kiểm định. Request được giữ nguyên để có thể thử lại hoặc dùng AI Web thủ công.', 'error');
      if (aieCurrentRequestId) await aieLoadRequests(aieCurrentRequestId);
    } finally {
      autoBusy = false;
      aieSetBusy(false);
      if (button) button.disabled = false;
    }
  }

  async function createWebPackageOnly() {
    if (autoBusy) return;
    setManualVisible(true);
    await aieCreatePackage();
  }

  function mount() {
    const original = document.getElementById('btnCreate');
    if (!original || document.getElementById('aieAutoControls')) return;

    mountTargetClass();

    // ai_exam.js attached its historical package-only listener first. Replacing the node removes
    // that listener while preserving the stable element id used by the rest of the page.
    const button = original.cloneNode(true);
    button.textContent = 'TẠO ĐỀ BẰNG AI';
    original.replaceWith(button);
    button.addEventListener('click', generateOneClick);

    document.getElementById('btnChatGPT')?.classList.add('hidden');
    document.getElementById('btnGemini')?.classList.add('hidden');
    setManualVisible(false);

    const controls = document.createElement('div');
    controls.id = 'aieAutoControls';
    controls.innerHTML = `
      <div id="aieAutoStatus" class="authority-panel info">Đang kiểm tra AI tự động...</div>
      <div class="actions" style="margin-top:8px">
        <button id="btnManualAiWeb" class="secondary" type="button">Dùng AI Web thủ công</button>
        <button id="btnCreateWebPackage" class="secondary hidden" type="button">Tạo gói cho AI Web</button>
        <a href="ai_provider.html" class="secondary" style="display:inline-block;text-decoration:none;padding:10px 14px;border-radius:7px">Cấu hình AI</a>
      </div>`;
    document.getElementById('generationStatus')?.insertAdjacentElement('afterend', controls);

    document.getElementById('btnManualAiWeb')?.addEventListener('click', () => {
      setManualVisible(!manualVisible);
      document.getElementById('btnCreateWebPackage')?.classList.toggle('hidden', !manualVisible);
    });
    document.getElementById('btnCreateWebPackage')?.addEventListener('click', createWebPackageOnly);
    refreshRouteStatus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();