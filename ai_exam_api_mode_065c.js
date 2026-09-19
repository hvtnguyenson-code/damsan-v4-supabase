// 065D — simplified API execution UI. Web-AI remains the default; provider secrets stay server-side.
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
      method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': AIE_SUPABASE_KEY },
      cache: 'no-store', body: JSON.stringify({ ...payload, ...apiSessionBody() })
    });
    let data = null; try { data = await response.json(); } catch { data = null; }
    if (!response.ok || !data || data.status !== 'success') {
      const error = new Error(data?.code || data?.message || `API AI trả mã ${response.status}.`);
      error.code = data?.code || 'api_generation_failed'; error.detail = data; throw error;
    }
    return data;
  }
  function currentProvider() {
    const id = document.getElementById('apiProviderSelect')?.value || '';
    return providers.find((p) => p.id === id) || null;
  }
  function renderModels() {
    const select = document.getElementById('apiModelSelect'); if (!select) return;
    const p = currentProvider();
    const models = Array.isArray(p?.models) ? p.models.filter((m) => m.enabled !== false) : [];
    select.innerHTML = models.length
      ? models.map((m) => `<option value="${aieEscape(m.id)}">${aieEscape(m.display_name || m.model_id)}</option>`).join('')
      : '<option value="">-- Chưa có model --</option>';
    const state = document.getElementById('apiProviderState');
    if (state && p) state.textContent = models.length ? `${p.display_name}: ${models.length} model sẵn sàng.` : `${p.display_name}: chưa có model. Mở “Kết nối AI” để thêm.`;
  }
  function renderProviders() {
    const select = document.getElementById('apiProviderSelect'); if (!select) return;
    const usable = providers.filter((p) => p.enabled !== false);
    select.innerHTML = usable.length
      ? usable.map((p) => `<option value="${aieEscape(p.id)}">${aieEscape(p.display_name)}</option>`).join('')
      : '<option value="">-- Chưa có kết nối AI --</option>';
    renderModels();
  }
  async function loadProviders() {
    const data = await apiPost(CONTROL_ENDPOINT, { action: 'list' });
    providers = Array.isArray(data.providers) ? data.providers : [];
    renderProviders();
    const state = document.getElementById('apiProviderState');
    if (!providers.length && state) state.innerHTML = 'Chưa có kết nối. <a href="ai_provider.html">Thêm kết nối AI</a> trước.';
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
    const raw = document.getElementById(id)?.value?.trim(); if (!raw) return undefined;
    const n = Number(raw); return Number.isFinite(n) ? n : undefined;
  }
  async function generateByApi() {
    if (apiBusy) return;
    const prompt = document.getElementById('promptBox')?.value || '';
    const providerId = document.getElementById('apiProviderSelect')?.value || '';
    const modelProfileId = document.getElementById('apiModelSelect')?.value || '';
    if (!aieCurrentRequestId || !prompt.trim()) return aieNotice('Hãy bấm “Tạo gói ra đề AI” trước.', 'error');
    if (!providerId || !modelProfileId) return aieNotice('Chưa có kết nối AI hoặc model khả dụng.', 'error');
    const parameters = {};
    const temperature = numericValue('apiTemperature'), topP = numericValue('apiTopP'), maxOutput = numericValue('apiMaxOutput');
    const reasoning = document.getElementById('apiReasoning')?.value || '';
    if (temperature !== undefined) parameters.temperature = temperature;
    if (topP !== undefined) parameters.top_p = topP;
    if (maxOutput !== undefined) parameters.max_output_tokens = maxOutput;
    if (reasoning) parameters.reasoning_effort = reasoning;

    apiBusy = true; const button = document.getElementById('btnGenerateApi'); if (button) button.disabled = true;
    aieSetBusy(true); const status = document.getElementById('apiGenerationStatus');
    if (status) status.textContent = 'Đang tạo đề và kiểm định tự động...';
    try {
      const result = await apiPost(ORCHESTRATOR_ENDPOINT, { action: 'generate_exam', request_id: aieCurrentRequestId, provider_id: providerId, model_profile_id: modelProfileId, prompt, parameters });
      aieCapability = '';
      if (status) status.textContent = `ĐÃ KIỂM ĐỊNH · ${result.model} · revision ${result.revision}`;
      document.getElementById('validationStatus').textContent = `API VALIDATED · revision ${result.revision}`;
      aieNotice('Đề đã được AI tạo và server kiểm định. Kiểm tra ở bước duyệt trước khi đưa lên phòng.', 'ok');
      await aieLoadRequests(result.request_id);
    } catch (error) {
      const detail = error.detail?.validation; const qualityCode = detail?.code || detail?.quality?.code || '';
      if (status) status.textContent = `CHƯA ĐẠT · ${qualityCode || error.code || error.message}`;
      aieNotice('Đề chưa vượt kiểm định. Có thể tạo lại bằng cùng model hoặc đổi model.', 'error');
      await aieLoadRequests(aieCurrentRequestId);
    } finally { apiBusy = false; aieSetBusy(false); if (button) button.disabled = false; }
  }
  function mount() {
    const resultBox = document.getElementById('resultBox'); const section = resultBox?.closest('.card');
    if (!section || document.getElementById('aieApiModePanel')) return;
    const panel = document.createElement('div'); panel.id = 'aieApiModePanel';
    panel.innerHTML = `
      <div class="grid" style="margin:10px 0 12px">
        <div class="field"><label for="aiExecutionMode">Cách tạo đề</label><select id="aiExecutionMode"><option value="WEB">Dùng AI Web như hiện tại</option><option value="API">Tạo tự động bằng API</option></select></div>
        <div class="field"><label>Kết nối AI</label><a class="secondary" style="display:inline-block;text-decoration:none;padding:10px 14px;border-radius:7px" href="ai_provider.html">Thiết lập kết nối</a></div>
      </div>
      <div id="apiGenerationControls" class="hidden authority-panel info">
        <div class="grid">
          <div class="field"><label for="apiProviderSelect">Kết nối</label><select id="apiProviderSelect"><option value="">Đang tải...</option></select></div>
          <div class="field"><label for="apiModelSelect">Model</label><select id="apiModelSelect"><option value="">-- Chọn kết nối trước --</option></select></div>
        </div>
        <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">Tùy chọn nâng cao — có thể bỏ qua</summary>
          <div class="grid4" style="margin-top:10px">
            <div class="field"><label for="apiReasoning">Reasoning</label><select id="apiReasoning"><option value="">Mặc định</option><option value="minimal">minimal</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></div>
            <div class="field"><label for="apiTemperature">Temperature</label><input id="apiTemperature" type="number" min="0" max="2" step="0.1" placeholder="Auto"></div>
            <div class="field"><label for="apiTopP">Top P</label><input id="apiTopP" type="number" min="0" max="1" step="0.05" placeholder="Auto"></div>
            <div class="field"><label for="apiMaxOutput">Max output</label><input id="apiMaxOutput" type="number" min="512" max="65536" step="256" placeholder="Auto"></div>
          </div>
        </details>
        <div id="apiProviderState" class="statusline"></div>
        <div class="actions"><button id="btnGenerateApi" class="primary">TẠO ĐỀ</button><button id="btnReloadApiProviders" class="secondary">Làm mới kết nối</button></div>
        <div id="apiGenerationStatus" class="statusline"></div>
      </div>`;
    section.querySelector('h2')?.insertAdjacentElement('afterend', panel);
    document.getElementById('aiExecutionMode')?.addEventListener('change', modeChanged);
    document.getElementById('apiProviderSelect')?.addEventListener('change', renderModels);
    document.getElementById('btnReloadApiProviders')?.addEventListener('click', () => loadProviders().catch((e) => aieNotice(e.message, 'error')));
    document.getElementById('btnGenerateApi')?.addEventListener('click', generateByApi);
    modeChanged();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();