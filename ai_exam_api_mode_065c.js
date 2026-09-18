// 065C — optional API execution path layered onto the existing Web-AI authoring UI.
// Web-AI remains the default. Provider credentials never enter this browser context.
(() => {
  const CONTROL_ENDPOINT = `${AIE_SUPABASE_URL}/functions/v1/ai-provider-control`;
  const ORCHESTRATOR_ENDPOINT = `${AIE_SUPABASE_URL}/functions/v1/exam-ai-orchestrator`;
  let providers = [];
  let apiBusy = false;

  function apiSessionBody() {
    const s = aieSession();
    if (!s) throw new Error('Phiên giáo viên không còn hợp lệ.');
    return { staff_token: s.token, ma_gv: s.profile.ma_gv };
  }

  async function apiPost(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': AIE_SUPABASE_KEY },
      cache: 'no-store',
      body: JSON.stringify({ ...payload, ...apiSessionBody() })
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok || !data || data.status !== 'success') {
      const error = new Error(data?.code || data?.message || `API AI trả mã ${response.status}.`);
      error.code = data?.code || 'api_generation_failed';
      error.detail = data;
      throw error;
    }
    return data;
  }

  function currentProvider() {
    const id = document.getElementById('apiProviderSelect')?.value || '';
    return providers.find((p) => p.id === id) || null;
  }

  function renderModels() {
    const select = document.getElementById('apiModelSelect');
    if (!select) return;
    const p = currentProvider();
    const models = Array.isArray(p?.models) ? p.models.filter((m) => m.enabled !== false) : [];
    select.innerHTML = models.length
      ? models.map((m) => `<option value="${aieEscape(m.id)}">${aieEscape(m.display_name || m.model_id)} · ${aieEscape(m.model_id)}</option>`).join('')
      : '<option value="">-- Provider chưa có model khả dụng --</option>';
  }

  function renderProviders() {
    const select = document.getElementById('apiProviderSelect');
    if (!select) return;
    const usable = providers.filter((p) => p.enabled !== false);
    select.innerHTML = usable.length
      ? usable.map((p) => `<option value="${aieEscape(p.id)}">${aieEscape(p.display_name)} · ${aieEscape(p.adapter_type)} · ${aieEscape(p.owner_scope)}</option>`).join('')
      : '<option value="">-- Chưa có kết nối API --</option>';
    renderModels();
  }

  async function loadProviders() {
    const data = await apiPost(CONTROL_ENDPOINT, { action: 'list' });
    providers = Array.isArray(data.providers) ? data.providers : [];
    renderProviders();
    const state = document.getElementById('apiProviderState');
    if (state) state.textContent = providers.length
      ? `Đã nạp ${providers.length} provider. API key chỉ được đọc ở server từ Supabase Vault.`
      : 'Chưa có provider. Mở “Quản lí kết nối API” để thêm OpenAI, Gemini, Claude, OpenRouter hoặc API trung gian.';
  }

  function modeChanged() {
    const api = document.getElementById('aiExecutionMode')?.value === 'API';
    document.getElementById('apiGenerationControls')?.classList.toggle('hidden', !api);
    document.getElementById('provider')?.closest('.grid')?.classList.toggle('hidden', api);
    document.getElementById('resultBox')?.classList.toggle('hidden', api);
    document.getElementById('btnPaste')?.closest('.actions')?.classList.toggle('hidden', api);
    if (api && !providers.length) loadProviders().catch((e) => aieNotice(e.message, 'error'));
  }

  function numericValue(id) {
    const raw = document.getElementById(id)?.value?.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  async function generateByApi() {
    if (apiBusy) return;
    const prompt = document.getElementById('promptBox')?.value || '';
    const providerId = document.getElementById('apiProviderSelect')?.value || '';
    const modelProfileId = document.getElementById('apiModelSelect')?.value || '';
    if (!aieCurrentRequestId || !prompt.trim()) return aieNotice('Hãy bấm “Tạo gói ra đề AI” trước. API sử dụng chính request và prompt đã được 060/062 tạo.', 'error');
    if (!providerId || !modelProfileId) return aieNotice('Cần chọn provider và model API.', 'error');

    const parameters = {};
    const temperature = numericValue('apiTemperature');
    const topP = numericValue('apiTopP');
    const maxOutput = numericValue('apiMaxOutput');
    const reasoning = document.getElementById('apiReasoning')?.value || '';
    if (temperature !== undefined) parameters.temperature = temperature;
    if (topP !== undefined) parameters.top_p = topP;
    if (maxOutput !== undefined) parameters.max_output_tokens = maxOutput;
    if (reasoning) parameters.reasoning_effort = reasoning;

    apiBusy = true;
    const button = document.getElementById('btnGenerateApi');
    if (button) button.disabled = true;
    aieSetBusy(true);
    const status = document.getElementById('apiGenerationStatus');
    if (status) status.textContent = 'Đang gọi model qua server. Không đóng tab cho đến khi provider trả kết quả...';
    try {
      const result = await apiPost(ORCHESTRATOR_ENDPOINT, {
        action: 'generate_exam',
        request_id: aieCurrentRequestId,
        provider_id: providerId,
        model_profile_id: modelProfileId,
        prompt,
        parameters
      });
      aieCapability = '';
      if (status) status.textContent = `VALIDATED · ${result.provider} · ${result.model} · revision ${result.revision} · run ${String(result.run_id).slice(0, 8)}`;
      document.getElementById('validationStatus').textContent = `API VALIDATED · revision ${result.revision}`;
      aieNotice('API đã sinh đề và đề đã đi qua đúng hard gate hiện tại. Kiểm tra toàn bộ đề ở bước duyệt trước khi đưa lên phòng.', 'ok');
      await aieLoadRequests(result.request_id);
    } catch (error) {
      const detail = error.detail?.validation;
      const qualityCode = detail?.code || detail?.quality?.code || '';
      if (status) status.textContent = `KHÔNG ĐẠT · ${error.code || error.message}${qualityCode ? ` · ${qualityCode}` : ''}`;
      aieNotice(`API chưa tạo được draft hợp lệ: ${error.code || error.message}. Request hiện tại vẫn có thể tạo lại bằng model khác hoặc sửa cấu hình provider.`, 'error');
      await aieLoadRequests(aieCurrentRequestId);
    } finally {
      apiBusy = false;
      aieSetBusy(false);
      if (button) button.disabled = false;
    }
  }

  function mount() {
    const resultBox = document.getElementById('resultBox');
    const section = resultBox?.closest('.card');
    if (!section || document.getElementById('aieApiModePanel')) return;
    const panel = document.createElement('div');
    panel.id = 'aieApiModePanel';
    panel.innerHTML = `
      <div class="grid" style="margin:10px 0 12px">
        <div class="field"><label for="aiExecutionMode">Phương thức tạo đề</label><select id="aiExecutionMode"><option value="WEB">AI Web — sao chép prompt / dán JSON</option><option value="API">API — server gọi model và kiểm định tự động</option></select></div>
        <div class="field"><label>Kết nối API</label><a class="secondary" style="display:inline-block;text-decoration:none;padding:10px 14px;border-radius:7px" href="ai_provider.html">Quản lí kết nối API</a></div>
      </div>
      <div id="apiGenerationControls" class="hidden authority-panel info">
        <div class="grid">
          <div class="field"><label for="apiProviderSelect">Provider</label><select id="apiProviderSelect"><option value="">Đang tải...</option></select></div>
          <div class="field"><label for="apiModelSelect">Model</label><select id="apiModelSelect"><option value="">-- Chọn provider trước --</option></select></div>
        </div>
        <div class="grid4" style="margin-top:10px">
          <div class="field"><label for="apiReasoning">Reasoning</label><select id="apiReasoning"><option value="">Mặc định của model</option><option value="minimal">minimal</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></div>
          <div class="field"><label for="apiTemperature">Temperature</label><input id="apiTemperature" type="number" min="0" max="2" step="0.1" placeholder="Auto"></div>
          <div class="field"><label for="apiTopP">Top P</label><input id="apiTopP" type="number" min="0" max="1" step="0.05" placeholder="Auto"></div>
          <div class="field"><label for="apiMaxOutput">Max output tokens</label><input id="apiMaxOutput" type="number" min="512" max="65536" step="256" placeholder="Auto"></div>
        </div>
        <div id="apiProviderState" class="statusline"></div>
        <div class="actions"><button id="btnGenerateApi" class="primary">TẠO ĐỀ BẰNG API</button><button id="btnReloadApiProviders" class="secondary">Làm mới provider</button></div>
        <div id="apiGenerationStatus" class="statusline"></div>
      </div>`;
    section.querySelector('h2')?.insertAdjacentElement('afterend', panel);
    document.getElementById('aiExecutionMode')?.addEventListener('change', modeChanged);
    document.getElementById('apiProviderSelect')?.addEventListener('change', renderModels);
    document.getElementById('btnReloadApiProviders')?.addEventListener('click', () => loadProviders().catch((e) => aieNotice(e.message, 'error')));
    document.getElementById('btnGenerateApi')?.addEventListener('click', generateByApi);
    modeChanged();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
