// 068 — one-click AI generation split into bounded fragments so no provider call must outlive Edge limits.
(() => {
  const ROUTER_ENDPOINT = `${AIE_SUPABASE_URL}/functions/v1/exam-ai-router`;
  const FRAGMENT_ENDPOINT = `${AIE_SUPABASE_URL}/functions/v1/exam-ai-fragment`;
  const PART_CHUNK_SIZE = { 1: 6, 2: 2, 3: 3 };
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
      const platformCode = response.status === 546 ? 'WORKER_RESOURCE_LIMIT' : (response.status === 504 ? 'IDLE_TIMEOUT' : '');
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

  function fragmentPost(payload) {
    return postJson(FRAGMENT_ENDPOINT, payload, 'ai_fragment_failed');
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

  async function refreshRouteStatus() {
    try {
      const data = await routerPost({ action: 'route_status' });
      if (data.ready) setAutoStatus('AI tự động đã sẵn sàng. Đề lớn sẽ được tạo theo các phân đoạn ngắn rồi kiểm định toàn bộ một lần.', 'ok');
      else setAutoStatus('Chưa có kết nối AI khả dụng. Cấu hình một lần ở “Cấu hình AI”, sau đó việc ra đề chỉ cần một nút.', 'warn');
      return !!data.ready;
    } catch (error) {
      setAutoStatus(`Chưa kiểm tra được AI tự động: ${error.code || error.message}`, 'warn');
      return false;
    }
  }

  function chunkPlan(spec) {
    const counts = spec?.counts || {};
    const plan = [];
    let globalStart = 1;
    for (const part of [1, 2, 3]) {
      let remaining = Math.max(0, Number(counts[`p${part}`]) || 0);
      let partOffset = 0;
      const size = PART_CHUNK_SIZE[part];
      while (remaining > 0) {
        const count = Math.min(size, remaining);
        const start = globalStart + partOffset;
        const end = start + count - 1;
        plan.push({ part, count, start, end, key: `P${part}_${start}_${end}` });
        remaining -= count;
        partOffset += count;
      }
      globalStart += Math.max(0, Number(counts[`p${part}`]) || 0);
    }
    return plan;
  }

  function avoidSummary(questions) {
    return questions.slice(-24).map((q) => ({
      phan: Number(q?.phan || 0),
      noi_dung: String(q?.noi_dung || '').replace(/\s+/g, ' ').slice(0, 220),
      source_refs: Array.isArray(q?.source_refs) ? q.source_refs.slice(0, 4) : [],
      operation_code: q?.quantitative?.operation_code || ''
    }));
  }

  function fragmentPrompt(basePrompt, chunk, previousQuestions) {
    const avoid = avoidSummary(previousQuestions);
    const partNotes = chunk.part === 1
      ? 'Phần I: mỗi câu có A/B/C/D và đúng một dap_an_dung A/B/C/D; phương án nhiễu phải cạnh tranh, đồng dạng và không tự lộ đáp án.'
      : chunk.part === 2
        ? 'Phần II: mỗi question là MỘT cụm gồm đúng bốn nhận định A/B/C/D; giữ statement_levels và statement_reasoning theo hợp đồng hiện có.'
        : 'Phần III: mỗi question là trả lời ngắn; A/B/C/D rỗng; quantitative phải đủ để server tự tính lại đáp án và số liệu phải hiện trong noi_dung.';
    return `${basePrompt}\n\n---\nCHẾ ĐỘ TẠO PHÂN ĐOẠN 068 — CHỈ THỊ CUỐI CÙNG NÀY GHI ĐÈ YÊU CẦU TẠO TOÀN BỘ ĐỀ, NHƯNG KHÔNG GHI ĐÈ CÁC RÀNG BUỘC KIẾN THỨC/CHẤT LƯỢNG.\n- Chỉ tạo chính xác ${chunk.count} question thuộc Phần ${chunk.part}, tương ứng vị trí toàn đề ${chunk.start}-${chunk.end}.\n- Tất cả question phải có phan=${chunk.part}.\n- Chỉ trả DUY NHẤT JSON object dạng {\"questions\":[...]}; không title, không schema_version, không scoring_config, không Markdown.\n- Vẫn phải tuân thủ toàn bộ KNOWLEDGE PACKAGE, source_refs, muc_do, bai_hoc, cấu trúc và tiêu chuẩn khảo thí trong prompt gốc.\n- Không lặp lại câu hỏi/ý tưởng đã tạo ở các phân đoạn trước.\n- ${partNotes}\n- Với các yêu cầu phân bố chất lượng áp dụng cho toàn phần, hãy làm phân đoạn này đóng góp cân đối và tránh dồn một kiểu thao tác/nguồn.\n\nDẤU VẾT CÁC CÂU ĐÃ TẠO TRƯỚC (chỉ để tránh lặp, không phải nguồn kiến thức):\n${JSON.stringify(avoid)}\n`;
  }

  function outputLimitFor(chunk) {
    if (chunk.part === 1) return 5200;
    if (chunk.part === 2) return 5200;
    return 4200;
  }

  async function generateOneFragment(requestId, basePrompt, chunk, previousQuestions, candidates) {
    const failures = [];
    for (const candidate of candidates) {
      const prompt = fragmentPrompt(basePrompt, chunk, previousQuestions);
      setAutoStatus(`Đang tạo ${chunk.key} · ${chunk.count} câu...`, 'info');
      try {
        const result = await fragmentPost({
          action: 'generate_fragment',
          request_id: requestId,
          provider_id: candidate.provider_id,
          model_profile_id: candidate.model_profile_id,
          fragment_key: chunk.key,
          expected_part: chunk.part,
          expected_count: chunk.count,
          parameters: { max_output_tokens: outputLimitFor(chunk) },
          prompt
        });
        if (!Array.isArray(result.questions) || result.questions.length !== chunk.count) {
          const error = new Error('Fragment AI trả sai số câu.');
          error.code = 'fragment_question_count_mismatch';
          throw error;
        }
        return { questions: result.questions, failureCount: failures.length };
      } catch (error) {
        failures.push(error.code || 'ai_fragment_failed');
      }
    }
    const error = new Error(`Không tạo được phân đoạn ${chunk.key}.`);
    error.code = 'ai_fragment_exhausted';
    error.detail = { fragment_key: chunk.key, failures };
    throw error;
  }

  async function generateChunked(requestId, basePrompt, spec) {
    const route = await routerPost({ action: 'route_plan' });
    const candidates = Array.isArray(route.candidates) ? route.candidates : [];
    if (!candidates.length) {
      const error = new Error('Không có model AI khả dụng.');
      error.code = 'ai_route_unavailable';
      throw error;
    }
    const plan = chunkPlan(spec);
    if (!plan.length) {
      const error = new Error('Cấu trúc đề không có câu hỏi.');
      error.code = 'fragment_plan_empty';
      throw error;
    }

    const questions = [];
    let fallbackCount = 0;
    for (let i = 0; i < plan.length; i += 1) {
      const chunk = plan[i];
      setAutoStatus(`Đang tạo đề theo phân đoạn ${i + 1}/${plan.length} · ${questions.length}/${plan.reduce((n, x) => n + x.count, 0)} câu đã xong...`, 'info');
      const result = await generateOneFragment(requestId, basePrompt, chunk, questions, candidates);
      questions.push(...result.questions);
      fallbackCount += result.failureCount;
    }
    return { questions, fragment_count: plan.length, fallback_count: fallbackCount, candidate_count: candidates.length };
  }

  function assembleExam(spec, room, questions) {
    return {
      schema_version: 'DAMSAN_EXAM_V1',
      title: `Đề kiểm tra ${spec.assessment_type || ''} – ${room}`,
      assessment_type: spec.assessment_type,
      scoring_config: spec.scoring_config || {},
      questions
    };
  }

  async function validateAssembledExam(exam, requestId) {
    const box = document.getElementById('resultBox');
    if (box) box.value = JSON.stringify(exam);
    aieSetBusy(false);
    setAutoStatus(`Đã tạo đủ ${exam.questions.length} câu. Server đang kiểm định toàn bộ đề...`, 'info');
    await window.aieValidateDraft();
    await aieLoadRequests(requestId);
    return Array.isArray(aieRequests) ? aieRequests.find((r) => r.request_id === requestId) : null;
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
      const requestId = aieCurrentRequestId;
      const room = document.getElementById('roomCode')?.value?.trim() || 'AI_EXAM';
      const spec = typeof window.aieSpec === 'function' ? window.aieSpec() : aieSpec();

      aieSetBusy(true);
      const generated = await generateChunked(requestId, prompt, spec);
      const exam = assembleExam(spec, room, generated.questions);
      const request = await validateAssembledExam(exam, requestId);
      if (request?.status === 'READY_FOR_REVIEW') {
        setAutoStatus(`Đề đã vượt kiểm định · ${generated.fragment_count} phân đoạn · ${generated.fallback_count} lượt fallback · ${exam.questions.length} câu.`, 'ok');
        aieNotice('Đề đã sẵn sàng để duyệt. Kiểm tra nội dung rồi phê duyệt để đưa lên phòng.', 'ok');
      } else {
        const diagnostic = document.getElementById('validationStatus')?.textContent || request?.status || 'validation_failed';
        setAutoStatus(`AI đã tạo đủ câu nhưng đề chưa vượt kiểm định: ${diagnostic}`, 'error');
      }
    } catch (error) {
      const failures = Array.isArray(error.detail?.failures) ? error.detail.failures : [];
      const suffix = failures.length ? ` (${failures.slice(0, 4).join(', ')})` : '';
      setAutoStatus(`AI chưa tạo được đề hợp lệ: ${error.code || error.message}${suffix}`, 'error');
      aieNotice('Request được giữ nguyên. Hệ thống có thể thử lại hoặc dùng AI Web thủ công.', 'error');
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
