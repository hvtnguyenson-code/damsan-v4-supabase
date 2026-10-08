// 053 — AI exam validation architecture.
// Hard gates objective correctness; pedagogical heuristics become review warnings.
// Part III AI metadata is reduced to a small calculation recipe and validation errors are aggregated.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  let lastFailure053 = null;

  function serverSpec053(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  function generationInstructions053(input) {
    const base = input && input.instructions && typeof input.instructions === 'object' && !Array.isArray(input.instructions)
      ? input.instructions
      : {};
    return {
      ...base,
      question_fields: [
        'phan','noi_dung','A','B','C','D','dap_an_dung','loi_giai',
        'source_refs','muc_do','bai_hoc','quantitative'
      ],
      part_3: 'Short answer. A/B/C/D are empty strings. quantitative is a calculation recipe: operation_code, inputs, optional rounding_digits, unit, scale_factor, group_sizes. Do not self-score skill_code, data_form or reasoning_steps; the server derives those properties.',
      validation_contract: '053 server-canonical contract: AI supplies content plus objective calculation recipe; the server derives descriptive quality metadata and reports all hard errors together.',
      part_1_stem_style: 'Write standalone Vietnamese teacher-authored stems. Never mention the lesson, source package, knowledge_units, source_refs, unit_key, or the authoring process. NB must be concise and direct; TH/VD must require real reasoning rather than a memorization item wrapped in a scenario.'
    };
  }

  function standardLines053(spec) {
    const standard = spec && spec.assessment_standard;
    if (!standard || standard.id !== STANDARD_ID) return [];
    return [
      '',
      'CHUẨN KHẢO THÍ ĐỊA LÍ — 053 SERVER-CANONICAL:',
      '',
      'PHẦN I — CÂU DẪN VÀ PHƯƠNG ÁN:',
      '- Câu dẫn phải đứng độc lập như câu hỏi do giáo viên viết và học sinh hiểu được khi không nhìn thấy Knowledge Package. Tuyệt đối không nhắc “bài học”, “nguồn”, Knowledge Package, knowledge_units, source_refs, unit_key hoặc quy trình tạo đề.',
      '- Ưu tiên câu dẫn ngắn, trực tiếp, tự nhiên. Cấm các vỏ câu kiểu “theo ... được trình bày/nêu trong bài”, “phù hợp nhất với quy luật trong bài”, “theo nguồn nêu”.',
      '- Câu NB hỏi thẳng kiến thức cốt lõi nhưng không sao chép máy móc. Câu TH phải buộc phân biệt, so sánh, giải thích hoặc xác định quan hệ. Câu VD phải có tình huống/dữ kiện làm phát sinh suy luận hoặc chuyển giao thực chất; không được bọc câu nhớ bằng một đoạn dẫn để gắn nhãn VD.',
      '- Mọi dữ kiện trong noi_dung phải cần cho việc giải. Bỏ thông tin thừa chỉ để làm câu có vẻ khó hoặc có vẻ “vận dụng”.',
      '- Nếu có thể viết ngắn hơn mà không mất dữ kiện cần thiết, phải viết lại ngắn hơn. Không dùng các đuôi chung chung như “dự đoán nào phù hợp nhất với quy luật trong bài?”.',
      '- Ví dụ cần tránh: “Theo giả thuyết được trình bày trong bài học, ...?”; viết trực tiếp “Theo giả thuyết về sự hình thành Hệ Mặt Trời, Trái Đất được hình thành từ ...”.',
      '- Trước khi xuất JSON, đọc riêng từng noi_dung như khi giáo viên duyệt đề: rõ chủ thể, rõ nhiệm vụ, không lộ đáp án, không chứa lời bình về SGK/nguồn/hệ thống.',
      '',
      'PHẦN III:',
      '- Mục tiêu Phần III: đánh giá xử lí số liệu địa lí, không tạo phép tính số học tùy tiện từ các fact rời rạc.',
      '- Chuỗi mong muốn: dữ liệu thô hiển thị cho học sinh → xác định đại lượng/công thức → tính toán → làm tròn → một đáp án số.',
      '- Ưu tiên: biên độ; tổng/trung bình/chênh lệch chuỗi; mật độ; năng suất; tỉ trọng; tốc độ tăng trưởng; bình quân đầu người; tỉ số; cán cân; suy thành phần hoặc tổng.',
      '- Tránh: chỉ đổi đơn vị, cộng hai phần trăm đơn giản, trừ hai mốc độ cao, hoặc phép tính không thể hiện kĩ năng định lượng địa lí.',
      '- Với 6 câu Phần III, nên có tối đa 2 câu một bước, ít nhất 4 câu nhiều bước, ít nhất 3 câu dùng từ 3 số liệu thô trở lên và đa dạng dạng phép tính. Đây là mục tiêu chất lượng; server sẽ cảnh báo để giáo viên duyệt thay vì từ chối chỉ vì metadata mô tả.',
      '',
      'QUANTITATIVE — CHỈ KHAI BÁO CÔNG THỨC CÓ THỂ KIỂM CHỨNG:',
      '- Mỗi câu Phần III thêm quantitative gồm operation_code, inputs; nên có rounding_digits và unit. Chỉ thêm scale_factor/group_sizes khi cần.',
      '- KHÔNG cần skill_code, data_form, reasoning_steps. Nếu có, server không dùng chúng làm điều kiện đạt/rớt.',
      '- operation_code hợp lệ: RANGE, SUM, AVERAGE, DIFFERENCE, SUM_DIFFERENCE_TWO_GROUPS, AVERAGE_DIFFERENCE_TWO_GROUPS, SHARE_PERCENT, RATIO_SCALED, DENSITY, YIELD, PER_CAPITA, COMPONENT_FROM_SHARE, TOTAL_FROM_COMPONENT_SHARE, GROWTH_INDEX, GROWTH_PERCENT, BALANCE.',
      '- RANGE=max(inputs)-min(inputs); SUM=tổng; AVERAGE=trung bình; DIFFERENCE=|x1-x2|; SHARE_PERCENT=x1/x2×100; BALANCE=x1-x2.',
      '- DENSITY/YIELD/PER_CAPITA/RATIO_SCALED=x1/x2×scale_factor; COMPONENT_FROM_SHARE=x1×x2/100; TOTAL_FROM_COMPONENT_SHARE=x1×100/x2; GROWTH_INDEX=x1/x2×100; GROWTH_PERCENT=(x1-x2)/x2×100.',
      '- Với hai nhóm: inputs nối tiếp hai nhóm và group_sizes=[n1,n2].',
      '- Tất cả số trong inputs phải xuất hiện trong noi_dung mà học sinh nhìn thấy. Server tự tính lại đáp án.',
      '- Không dùng kiến thức ngoài knowledge_units; source_refs phải là unit_key có thật.',
      '- Giữ nguyên DAMSAN_EXAM_V1 và chỉ trả một JSON object, không Markdown fence.'
    ];
  }

  window.aieBuildPrompt = function aieBuildPrompt053(input, units, localSpec) {
    const spec = serverSpec053(input, localSpec);
    const pkg = {
      schema_version: 'DAMSAN_WEB_AI_EXAM_PACKAGE_V1',
      task: 'GROUNDED_EXAM_GENERATION',
      request: input.request,
      instructions: generationInstructions053(input),
      authoritative_exam_spec: spec,
      knowledge_units: units
    };
    const prompt = [
      'Bạn là bộ tạo đề cho hệ thống kiểm tra Đam San V4.',
      'Chỉ sử dụng KNOWLEDGE PACKAGE bên dưới. Không bổ sung kiến thức vốn có của mô hình và không bịa nguồn.',
      'Tuân thủ tuyệt đối authoritative_exam_spec về loại đề, số câu từng phần, trọng số và số mã đề.',
      'Mỗi câu phải có source_refs chứa ít nhất một unit_key thực sự có trong knowledge_units.',
      'Phần 1: đủ A/B/C/D, dap_an_dung là A/B/C/D. Phần 2: A/B/C/D là 4 nhận định, dap_an_dung dạng Đ-S-Đ-S. Phần 3: trả lời ngắn, A/B/C/D để chuỗi rỗng.',
      ...standardLines053(spec),
      '',
      'YÊU CẦU ĐẦU RA:',
      'Duy nhất một JSON object DAMSAN_EXAM_V1; không lời dẫn, không Markdown fence.',
      'Root: schema_version, title, assessment_type, scoring_config, questions.',
      'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Phần III thêm quantitative theo contract 053.',
      '',
      'KNOWLEDGE PACKAGE:',
      JSON.stringify(pkg)
    ].join('\n');
    if (prompt.length > AIE_MAX_PROMPT_CHARS) throw new Error('Gói ra đề quá lớn cho clipboard web. Hãy chọn phạm vi kiến thức hẹp hơn.');
    return prompt;
  };

  function parseFailure053(raw) {
    if (!raw) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }

  async function readRequest053(requestId) {
    const session = typeof aieSession === 'function' ? aieSession() : null;
    if (!session || !requestId) return null;
    try {
      const { data, error } = await aieSb.rpc('rpc_ai_exam_request_read', {
        p_staff_token: session.token,
        p_ma_gv: session.profile.ma_gv,
        p_request_id: requestId
      });
      if (error || !data || data.status !== 'success') return null;
      return Array.isArray(data.requests) ? data.requests[0] : null;
    } catch { return null; }
  }

  async function renewCapability053(requestId) {
    const session = typeof aieSession === 'function' ? aieSession() : null;
    if (!session || !requestId) throw Object.assign(new Error('Phiên giáo viên hoặc request không hợp lệ.'), { code:'staff_session_invalid' });
    const { data, error } = await aieSb.rpc('rpc_ai_exam_reissue_handoff', {
      p_staff_token: session.token,
      p_ma_gv: session.profile.ma_gv,
      p_request_id: requestId
    });
    if (error || !data || data.status !== 'success' || !data.capability_token) {
      const e = new Error(data?.code || error?.message || 'Không thể khôi phục quyền gửi kiểm định.');
      e.code = data?.code || 'capability_reissue_failed';
      throw e;
    }
    aieCapability = data.capability_token;
    return data;
  }

  const issueMessages053 = {
    quality_part1_duplicate_options_invalid: 'phương án Phần I bị trùng hoặc rỗng.',
    quality_part1_meta_stem_invalid: 'câu dẫn Phần I chứa lời dẫn meta về bài học/nguồn/hệ thống; phải viết lại thành câu hỏi độc lập cho học sinh.',
    quality_part2_statements_invalid: 'bốn nhận định Phần II bị trùng, rỗng hoặc quá ngắn.',
    quality_part2_truth_pattern_invalid: 'đáp án Đúng/Sai không đúng định dạng.',
    quality_part3_numeric_answer_invalid: 'đáp án Phần III không phải một số hợp lệ.',
    quality_part3_quantitative_core_required: 'thiếu quantitative với công thức và dữ liệu thô để server kiểm chứng.',
    quality_part3_operation_invalid: 'operation_code không thuộc các phép tính server hỗ trợ.',
    quality_part3_inputs_invalid: 'inputs không phải mảng số liệu thô hợp lệ.',
    quality_part3_source_data_not_exposed: 'chưa đưa đầy đủ số liệu thô vào nội dung học sinh nhìn thấy.',
    quality_part3_recompute_unsupported: 'công thức/inputs không đủ để server tính lại đáp án.',
    quality_part3_recompute_mismatch: 'đáp án AI không khớp kết quả server tự tính.',
    quality_questions_invalid: 'cấu trúc questions không hợp lệ.',
    knowledge_source_ref_outside_scope: 'source_refs trỏ ra ngoài các bài đã chọn.',
    source_ref_unknown: 'source_ref không tồn tại trong Knowledge Pack.',
    question_count_mismatch: 'số câu không đúng cấu trúc đã khóa.',
    exam_schema_invalid: 'schema JSON không phải DAMSAN_EXAM_V1.',
    assessment_type_mismatch: 'loại đề không khớp request.'
  };

  function oneIssue053(issue) {
    const code = String(issue?.code || 'validation_failed');
    const q = Number(issue?.question_no);
    const prefix = Number.isSafeInteger(q) && q > 0 ? `Câu ${q}: ` : '';
    if (code === 'quality_part3_recompute_mismatch' && issue?.expected != null) {
      return `${prefix}đáp án AI ${issue.actual} không khớp server ${issue.expected}.`;
    }
    return prefix + (issueMessages053[code] || `không đạt ${code}.`);
  }

  function failureText053(failure, fallbackCode = '') {
    const quality = failure?.quality && typeof failure.quality === 'object' ? failure.quality : failure;
    const errors = Array.isArray(quality?.errors) ? quality.errors : [];
    if (errors.length) {
      return errors.map(oneIssue053).join(' | ');
    }
    const code = String(failure?.code || quality?.code || fallbackCode || 'validation_failed');
    if (code === 'capability_expired' || code === 'capability_not_claimed' || code === 'capability_unavailable') {
      return 'quyền gửi kiểm định đã hết hạn; hệ thống có thể cấp lại cho chính request này.';
    }
    return oneIssue053({ ...(quality || {}), code, question_no: quality?.question_no });
  }

  function ensureRepairButton053() {
    const old = document.getElementById('btnRepairAI049');
    if (old) old.hidden = true;
    let button = document.getElementById('btnRepairAI053');
    if (button) return button;
    const validate = document.getElementById('btnValidate');
    const actions = validate?.parentElement;
    if (!validate || !actions) return null;
    button = document.createElement('button');
    button.id = 'btnRepairAI053';
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = 'Sao chép toàn bộ lỗi cho AI sửa';
    button.hidden = true;
    actions.appendChild(button);
    button.addEventListener('click', async () => {
      const currentJson = document.getElementById('resultBox')?.value?.trim() || '';
      if (!currentJson || !lastFailure053) return aieNotice('Chưa có JSON và lỗi kiểm định để tạo yêu cầu sửa.', 'info');
      const prompt = [
        'Sửa JSON đề thi Đam San V4 theo TOÀN BỘ lỗi server dưới đây trong một lượt.',
        'Giữ nguyên phạm vi bài, số câu và source_refs hợp lệ. Chỉ dùng kiến thức đã có trong JSON/Knowledge Package của cuộc trò chuyện này.',
        'Phần III chỉ cần quantitative với operation_code, inputs và các tham số tính thật sự cần thiết. Không cần tự gán skill_code, data_form hoặc reasoning_steps.',
        'Tự tính lại mọi đáp án Phần III. Chỉ trả một JSON DAMSAN_EXAM_V1 hoàn chỉnh, không giải thích, không Markdown fence.',
        '',
        'CHẨN ĐOÁN SERVER:',
        JSON.stringify(lastFailure053, null, 2),
        '',
        'JSON HIỆN TẠI:',
        currentJson
      ].join('\n');
      try {
        await navigator.clipboard.writeText(prompt);
        aieNotice('Đã sao chép toàn bộ chẩn đoán. AI có thể sửa tất cả lỗi trong một lượt.', 'ok');
      } catch {
        aieNotice('Không ghi được clipboard. Hãy cho phép clipboard hoặc sao chép thủ công.', 'error');
      }
    });
    return button;
  }

  function showRepair053(show) {
    const button = ensureRepairButton053();
    if (button) button.hidden = !show;
  }

  async function submit053(exam) {
    return aieGateway({
      action: 'submit_exam_draft',
      capability_token: aieCapability,
      ai_provider: document.getElementById('provider').value || 'WEB_AI',
      ai_model: document.getElementById('modelName').value.trim() || 'unspecified',
      exam
    });
  }

  function setValidationStatus053(message) {
    const el = document.getElementById('validationStatus');
    if (el) el.textContent = String(message || '');
  }

  function recoverCurrentRequest053() {
    if (aieCurrentRequestId) return aieCurrentRequestId;
    const room = String(document.getElementById('roomCode')?.value || '').trim();
    const candidates = (Array.isArray(aieRequests) ? aieRequests : [])
      .filter((r) => ['AWAITING_AI','AI_WORKING'].includes(String(r?.status || '')))
      .filter((r) => !room || String(r?.ma_phong || '') === room)
      .sort((a,b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
    if (!candidates.length) return '';
    aieCurrentRequestId = candidates[0].request_id;
    return aieCurrentRequestId;
  }

  window.aieValidateDraft = async function aieValidateDraft053() {
    if (aieBusy) {
      setValidationStatus053('CHƯA GỬI · Hệ thống đang bận một tác vụ khác. Chờ tác vụ hiện tại kết thúc rồi bấm lại.');
      return;
    }

    const requestId = recoverCurrentRequest053();
    if (!requestId) {
      setValidationStatus053('CHƯA GỬI · Không xác định được request cần kiểm định. Chọn request AI_WORKING tương ứng ở “Yêu cầu gần đây” rồi bấm lại.');
      return aieNotice('Chưa xác định được request AI để kiểm định.', 'error');
    }

    const raw = String(document.getElementById('resultBox')?.value || '').trim();
    if (!raw) {
      setValidationStatus053('CHƯA GỬI · Ô JSON đang trống.');
      return aieNotice('Hãy dán JSON đề AI vào ô kết quả trước khi kiểm định.', 'error');
    }

    let exam;
    try {
      exam = aieLooseJson(raw);
    } catch (error) {
      setValidationStatus053(`CHƯA GỬI · JSON chưa hợp lệ: ${error.message}`);
      return aieNotice(`JSON đề không hợp lệ: ${error.message}`, 'error');
    }

    const questionCount = Array.isArray(exam?.questions) ? exam.questions.length : 0;
    lastFailure053 = null;
    showRepair053(false);
    aieSetBusy(true);
    setValidationStatus053(`ĐÃ NHẬN JSON · ${questionCount} câu · đang chuẩn bị gửi tới máy chủ...`);
    try {
      if (!aieCapability) {
        setValidationStatus053(`ĐÃ NHẬN JSON · ${questionCount} câu · đang cấp lại quyền gửi cho request hiện tại...`);
        await renewCapability053(requestId);
      }

      setValidationStatus053(`ĐANG KIỂM ĐỊNH · ${questionCount} câu · JSON đã được gửi tới máy chủ...`);
      let result;
      try {
        result = await submit053(exam);
      } catch (error) {
        if (['capability_expired','capability_not_claimed','capability_unavailable'].includes(String(error?.code || ''))) {
          setValidationStatus053(`ĐANG KIỂM ĐỊNH · ${questionCount} câu · quyền gửi đã hết hạn, đang cấp lại và gửi lại một lần...`);
          await renewCapability053(requestId);
          result = await submit053(exam);
        } else {
          throw error;
        }
      }
      setValidationStatus053(`VALIDATED · revision ${result.revision} · ${result.validation?.question_count || 0} câu · ${result.validation?.variant_count || 0} mã đề.`);
      aieNotice('Đề đã qua hard gate. Các cảnh báo chất lượng, nếu có, sẽ hiện trong bước xem trước để giáo viên quyết định.', 'ok');
      aieCapability = '';
      await aieLoadRequests(requestId);
    } catch (error) {
      const terminalCode = String(error?.code || '');
      let diagnostic = null;
      if (!['capability_expired','capability_not_claimed','capability_unavailable','staff_session_invalid','exam_request_unavailable'].includes(terminalCode)) {
        const request = await readRequest053(requestId);
        diagnostic = parseFailure053(request?.processing_error);
      }
      lastFailure053 = diagnostic || {
        schema_version: 'DAMSAN_AI_VALIDATION_FAILURE_V1',
        stage: 'VALIDATION',
        code: terminalCode || 'validation_failed',
        recoverable: !['staff_session_invalid','exam_request_unavailable'].includes(terminalCode)
      };
      const reason = failureText053(lastFailure053, terminalCode);
      setValidationStatus053(`KHÔNG ĐẠT · ${reason}`);
      aieNotice(`Kiểm định đã trả toàn bộ lỗi có thể xác định: ${reason}`, 'error');
      showRepair053(!!document.getElementById('resultBox').value.trim());
    } finally {
      aieSetBusy(false);
    }
  };

  const previousOpen053 = window.aieOpenRequest;
  window.aieOpenRequest = function aieOpenRequest053(requestId) {
    const request = Array.isArray(aieRequests) ? aieRequests.find((r) => r.request_id === requestId) : null;
    if (typeof previousOpen053 === 'function') previousOpen053(requestId);

    if (request && !request.draft && ['AWAITING_AI','AI_WORKING'].includes(request.status)) {
      aieCurrentRequestId = request.request_id;
      document.querySelectorAll('.request').forEach((el) => el.classList.toggle('active', el.dataset.requestId === requestId));

      const failure = parseFailure053(request.processing_error);
      const promptAvailable = !!document.getElementById('promptBox')?.value?.trim();
      const meta = document.getElementById('reviewMeta');
      const preview = document.getElementById('preview');
      const approve = document.getElementById('btnApprove');
      const reject = document.getElementById('btnReject');
      const card = document.getElementById('reviewCard');

      if (meta) meta.textContent = `${request.ma_phong} · ${request.status} · request đang chờ JSON từ AI`;
      if (preview) {
        preview.innerHTML = [
          '<div class="question">',
          `<h3>${aieEscape(request.status)} — chưa có draft để duyệt</h3>`,
          promptAvailable
            ? '<div>Prompt của request này vẫn còn ở mục 2. Tiếp tục gửi prompt cho AI, rồi dán JSON kết quả vào mục 3.</div>'
            : '<div>Prompt không còn trong phiên trình duyệt hiện tại. Nếu đã gửi prompt cho AI, chỉ cần lấy JSON kết quả và dán vào mục 3.</div>',
          '<div class="source">Khi bấm “Gửi kiểm định”, capability hết hạn sẽ được cấp lại tự động cho chính request này; không cần tạo request mới chỉ vì capability cũ mất.</div>',
          failure
            ? `<div class="source">Chẩn đoán gần nhất: ${aieEscape(failureText053(failure))}</div>`
            : '<div class="source">Request chưa có lỗi kiểm định được ghi nhận.</div>',
          '</div>'
        ].join('');
      }
      if (approve) approve.style.display = 'none';
      if (reject) {
        reject.style.display = '';
        reject.disabled = false;
      }
      if (card) {
        card.classList.remove('hidden');
        card.scrollIntoView({ behavior:'smooth', block:'start' });
      }

      if (failure) {
        lastFailure053 = failure;
        const reason = failureText053(failure);
        document.getElementById('validationStatus').textContent = `CHƯA ĐẠT · ${reason}`;
        showRepair053(!!document.getElementById('resultBox')?.value?.trim());
        aieNotice(`${request.ma_phong}: ${reason} Khi gửi lại, capability hết hạn sẽ được cấp mới tự động cho chính request này.`, 'info');
      } else {
        document.getElementById('validationStatus').textContent = '';
        showRepair053(false);
        aieNotice(`${request.ma_phong}: ${request.status}. Có thể tiếp tục trên chính request này.`, 'info');
      }
      return;
    }

    setTimeout(() => {
      const selected = Array.isArray(aieRequests) ? aieRequests.find((r) => r.request_id === requestId) : null;
      const warnings = selected?.draft?.validation_report?.assessment_quality?.warnings;
      if (Array.isArray(warnings) && warnings.length) {
        const meta = document.getElementById('reviewMeta');
        if (meta) meta.textContent += ` · ${warnings.length} cảnh báo chất lượng cần xem`;
      }
    }, 0);
  };

  document.addEventListener('DOMContentLoaded', () => ensureRepairButton053());
})();
