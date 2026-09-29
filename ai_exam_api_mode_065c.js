// 070 — Web-AI first: creating an exam never calls paid provider APIs implicitly.
(() => {
  const OTHER_URL_KEY = 'damsan_ai_exam_other_web_url';
  const WEB_TARGETS = {
    chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/', provider: 'CHATGPT_WEB' },
    gemini: { label: 'Gemini', url: 'https://gemini.google.com/app', provider: 'GEMINI_WEB' },
    claude: { label: 'Claude', url: 'https://claude.ai/', provider: 'CLAUDE_WEB' }
  };
  let webBusy = false;

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

  function setWebStatus(text, kind = 'info') {
    const el = document.getElementById('aieWebStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = `authority-panel ${kind}`;
  }

  function setButtonsDisabled(disabled) {
    ['btnCreate', 'btnWebGemini', 'btnWebClaude', 'btnWebOther'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !!disabled;
    });
  }

  function normalizeOtherUrl(raw) {
    let value = String(raw || '').trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) return '';
      return parsed.href;
    } catch {
      return '';
    }
  }

  function otherTarget() {
    let remembered = '';
    try { remembered = localStorage.getItem(OTHER_URL_KEY) || ''; } catch { remembered = ''; }
    const raw = window.prompt('Địa chỉ AI web muốn mở:', remembered || 'https://');
    if (raw === null) return null;
    const url = normalizeOtherUrl(raw);
    if (!url) {
      aieNotice('Địa chỉ AI web không hợp lệ. Chỉ dùng địa chỉ http/https.', 'error');
      return null;
    }
    try { localStorage.setItem(OTHER_URL_KEY, url); } catch { /* URL only; persistence is optional. */ }
    return { label: 'AI web khác', url, provider: 'OTHER_WEB_AI' };
  }

  function reserveTab() {
    try {
      const tab = window.open('about:blank', '_blank');
      if (tab) tab.opener = null;
      return tab;
    } catch {
      return null;
    }
  }

  async function copyPrompt(prompt) {
    try {
      await navigator.clipboard.writeText(prompt);
      return true;
    } catch {
      const box = document.getElementById('promptBox');
      if (box) {
        box.focus();
        box.select();
      }
      return false;
    }
  }

  function bindProviderMetadata(provider) {
    const select = document.getElementById('provider');
    if (select) {
      if (![...select.options].some((option) => option.value === provider)) {
        const option = document.createElement('option');
        option.value = provider;
        option.textContent = provider === 'CLAUDE_WEB' ? 'Claude web' : 'AI web khác';
        select.appendChild(option);
      }
      select.value = provider;
    }
    const model = document.getElementById('modelName');
    if (model) model.value = '';
  }

  async function createPackageAndOpen(targetKey) {
    if (webBusy) return;
    const target = targetKey === 'other' ? otherTarget() : WEB_TARGETS[targetKey];
    if (!target) return;

    const tab = reserveTab();
    webBusy = true;
    setButtonsDisabled(true);
    setWebStatus(`Đang tạo Knowledge Package cho ${target.label}. Không gọi API trả phí.`, 'info');

    try {
      await aieCreatePackage();
      const prompt = String(document.getElementById('promptBox')?.value || '').trim();
      if (!aieCurrentRequestId || !prompt) {
        if (tab && !tab.closed) tab.close();
        setWebStatus('Chưa tạo được gói ra đề. Hãy kiểm tra mã phòng, môn, khối và phạm vi kiến thức.', 'error');
        return;
      }

      bindProviderMetadata(target.provider);
      const copied = await copyPrompt(prompt);

      if (tab && !tab.closed) {
        tab.location.replace(target.url);
      } else {
        window.open(target.url, '_blank', 'noopener');
      }

      if (copied) {
        setWebStatus(`Đã tạo gói và sao chép prompt. ${target.label} đã được mở ở tab mới; dán prompt bằng Ctrl+V.`, 'ok');
        aieNotice(`Đã sao chép prompt. Chuyển sang ${target.label} và nhấn Ctrl+V.`, 'ok');
      } else {
        setWebStatus(`Đã tạo gói và mở ${target.label}. Trình duyệt không cho sao chép tự động; prompt đã được chọn để mày sao chép thủ công.`, 'warn');
        aieNotice('Prompt đã được chọn. Hãy Ctrl+C rồi chuyển sang AI web vừa mở.', 'info');
      }
    } catch (error) {
      if (tab && !tab.closed) tab.close();
      setWebStatus(error?.message || 'Không tạo được gói ra đề AI Web.', 'error');
    } finally {
      webBusy = false;
      setButtonsDisabled(false);
    }
  }

  function replaceLegacyCreateListener() {
    const original = document.getElementById('btnCreate');
    if (!original) return null;
    const button = original.cloneNode(true);
    original.replaceWith(button);
    return button;
  }

  function mount() {
    if (document.getElementById('aieWebStatus')) return;
    mountTargetClass();

    const chatgptButton = replaceLegacyCreateListener();
    if (!chatgptButton) return;
    chatgptButton.textContent = 'Tạo gói & mở ChatGPT';
    chatgptButton.addEventListener('click', () => createPackageAndOpen('chatgpt'));

    document.getElementById('btnWebGemini')?.addEventListener('click', () => createPackageAndOpen('gemini'));
    document.getElementById('btnWebClaude')?.addEventListener('click', () => createPackageAndOpen('claude'));
    document.getElementById('btnWebOther')?.addEventListener('click', () => createPackageAndOpen('other'));

    // Historical opener buttons are retained only so ai_exam.js can bind safely; they are never shown.
    document.getElementById('btnChatGPT')?.classList.add('hidden');
    document.getElementById('btnGemini')?.classList.add('hidden');

    const status = document.createElement('div');
    status.id = 'aieWebStatus';
    status.className = 'authority-panel ok';
    status.textContent = 'Mặc định: AI Web. Nút tạo đề không gọi Vertex/API và không tự retry/fallback có tính phí.';
    document.getElementById('generationStatus')?.insertAdjacentElement('afterend', status);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
