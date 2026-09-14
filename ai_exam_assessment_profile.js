// 048/049 — Geography TNTHPT assessment profile prompt compiler + validation recovery.
// Keeps the Web-AI handoff provider-neutral while enforcing official-style item-writing rules.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  let lastValidationFailure049 = null;

  function serverSpec(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  function standardLines(spec) {
    const standard = spec && spec.assessment_standard;
    if (!standard || standard.id !== STANDARD_ID) return [];
    return [
      '',
      'CHUẨN KHẢO THÍ ĐỊA LÍ — BẮT BUỘC:',
      `Áp dụng assessment_standard ${STANDARD_ID} version 048. Đây là chuẩn phong cách/quality gate; số câu thực tế vẫn phải theo authoritative_exam_spec.counts.`,
      'Nguồn benchmark chỉ dùng để học cấu trúc và kỹ thuật ra câu hỏi; tuyệt đối không sao chép câu chữ, dữ liệu hay đáp án từ đề mẫu nếu chúng không có trong knowledge_units.',
      'Trước khi xuất JSON, tự kiểm tra từng câu theo các quy tắc dưới đây và tự sửa mọi vi phạm.',
      '',
      'PHẦN I — TRẮC NGHIỆM 4 LỰA CHỌN:',
      '- Mỗi câu chỉ có đúng một đáp án đúng, xác định được từ knowledge_units.',
      '- Bốn phương án phải cùng phạm trù, cùng kiểu ngữ pháp và có độ dài tương đối cân bằng; không để đáp án đúng nổi bật vì dài hơn hoặc chi tiết hơn.',
      '- Ba phương án nhiễu phải hợp lí với học sinh chưa nắm chắc kiến thức; cấm phương án vô lí, lạc phạm trù hoặc phủ định hiển nhiên chỉ để đủ A/B/C/D.',
      '- Tránh từ khóa làm lộ đáp án, phủ định kép, câu mẹo, các lựa chọn chồng lấn và các phương án đồng nghĩa.',
      '- Câu TH/VD phải đòi hỏi giải thích, so sánh, nhận xét, xác định quan hệ nhân quả hoặc vận dụng dữ liệu; không chỉ đổi vài từ của một câu SGK.',
      '',
      'PHẦN II — ĐÚNG/SAI:',
      '- Mỗi câu là MỘT cụm gồm một stimulus chung trong noi_dung và đúng bốn nhận định A/B/C/D. Stimulus có thể là đoạn thông tin, bảng số liệu, biểu đồ/mô tả biểu đồ hoặc tình huống địa lí.',
      '- Không tạo bốn nhận định ghi nhớ rời rạc không gắn stimulus. Bốn nhận định phải khai thác cùng ngữ cảnh nhưng tương đối độc lập, không để ý này tiết lộ ý kia.',
      '- Phối hợp mức độ: có nhận định khai thác trực tiếp thông tin và có nhận định cần giải thích/suy luận/vận dụng; mỗi nhận định phải xác định Đ/S rõ ràng, không mơ hồ.',
      '- Không dùng mẫu đáp án cả bốn ý cùng Đ hoặc cùng S.',
      '',
      'PHẦN III — TRẢ LỜI NGẮN ĐỊNH LƯỢNG ĐỊA LÍ:',
      '- Mục tiêu là đánh giá năng lực xử lí số liệu địa lí, không phải tạo một phép tính số học bất kỳ từ hai con số trong SGK.',
      '- Chuỗi tư duy mong muốn: dữ liệu địa lí thô → nhận ra đại lượng cần tính → chọn công thức/quan hệ → xử lí số liệu và đơn vị → làm tròn → một đáp án số duy nhất.',
      '- Ưu tiên các dạng chuẩn thường gặp: biên độ nhiệt; tổng/chênh lệch lượng mưa; lưu lượng trung bình; mật độ; năng suất; tỉ trọng/cơ cấu; tốc độ tăng trưởng; bình quân đầu người; tỉ số; gia tăng tự nhiên; cán cân; suy ra thành phần từ tổng và tỉ lệ hoặc suy ngược tổng.',
      '- CẤM câu chỉ đổi đơn vị; chỉ cộng hai tỉ lệ phần trăm; chỉ trừ hai mốc độ cao; hoặc lấy hai số liệu ghi nhớ bất kỳ rồi yêu cầu cộng/trừ mà không đánh giá kĩ năng định lượng địa lí.',
      '- Không được cho sẵn một đại lượng tổng hợp nếu chính việc tính đại lượng đó là phần cốt lõi cần đánh giá. Ví dụ nếu hỏi chênh lệch tổng lượng mưa giữa hai trạm từ bảng 12 tháng thì phải đưa dữ liệu tháng vào noi_dung, không cho sẵn hai tổng năm.',
      '- Toàn bộ dữ liệu cần để học sinh tính phải xuất hiện trong noi_dung. knowledge_units chỉ là nguồn tạo câu và kiểm chứng, học sinh không nhìn thấy Knowledge Pack.',
      '- Với đề TNTHPT đủ 6 câu: tối đa 2 câu một bước; ít nhất 4 câu từ hai bước suy luận/xử lí trở lên; ít nhất 3 câu dùng chuỗi/bảng hoặc từ 3 số liệu thô trở lên; có ít nhất 4 skill_code khác nhau; không lặp một skill_code quá 2 lần.',
      '- Nêu rõ đơn vị và quy tắc làm tròn. Tự tính lại độc lập trước khi xuất; dap_an_dung phải khớp phép tính và quy tắc làm tròn; loi_giai phải nêu phép tính kiểm chứng ngắn gọn.',
      '',
      'METADATA ĐỊNH LƯỢNG BẮT BUỘC CHO MỖI CÂU PHẦN III:',
      '- Thêm object quantitative gồm: skill_code, operation_code, data_form, inputs, rounding_digits, reasoning_steps, unit. Có thể thêm scale_factor và group_sizes khi operation yêu cầu.',
      '- skill_code chỉ dùng một trong: TEMPERATURE_AMPLITUDE, TEMPERATURE_DIFFERENCE, RAINFALL_TOTAL, RAINFALL_DIFFERENCE, FLOW_AVERAGE, DENSITY, YIELD, SHARE, STRUCTURE, GROWTH, PER_CAPITA, RATIO, NATURAL_INCREASE, BALANCE, COMPONENT_VALUE, TOTAL_VALUE.',
      '- data_form chỉ dùng TABLE_SERIES, MULTI_VALUE hoặc DIRECT_RELATION. inputs là MẢNG SỐ THÔ thực sự xuất hiện trong noi_dung theo đúng thứ tự dùng để tính.',
      '- operation_code và quy ước: RANGE=max(inputs)-min(inputs); SUM=tổng inputs; AVERAGE=trung bình inputs; DIFFERENCE=|x1-x2|; SHARE_PERCENT=x1/x2×100; BALANCE=x1-x2; COMPONENT_FROM_SHARE=x1×x2/100; TOTAL_FROM_COMPONENT_SHARE=x1×100/x2; GROWTH_INDEX=x1/x2×100; GROWTH_PERCENT=(x1-x2)/x2×100.',
      '- Với DENSITY, YIELD, PER_CAPITA hoặc RATIO_SCALED: kết quả=x1/x2×scale_factor, mặc định scale_factor=1. Chỉ dùng scale_factor để đổi bậc đơn vị hợp lệ, không dùng nó để che một phép tính trung gian.',
      '- Với SUM_DIFFERENCE_TWO_GROUPS hoặc AVERAGE_DIFFERENCE_TWO_GROUPS: inputs chứa nối tiếp hai nhóm dữ liệu thô; group_sizes=[số phần tử nhóm 1, số phần tử nhóm 2].',
      '- reasoning_steps phải phản ánh số thao tác nhận thức/tính toán thật: chọn max-min rồi trừ là 2 bước; tính hai tổng rồi lấy chênh lệch là 3 bước; một phép chia trực tiếp là 1 bước.',
      '- rounding_digits là số chữ số thập phân của đáp án cuối; unit là đơn vị của đáp án.',
      '',
      'METADATA KIỂM ĐỊNH CHUNG:',
      '- Mỗi câu bắt buộc có muc_do thuộc NB, TH hoặc VD; bai_hoc phải mô tả đúng phạm vi nội dung; source_refs chỉ dùng unit_key có thật.',
      '- Không được dùng kiến thức nền của mô hình để vá thiếu dữ liệu. Nếu nguồn không đủ để tạo một câu đạt chuẩn, hãy chọn nội dung khác trong knowledge_units thay vì bịa.',
      '- Giữ nguyên DAMSAN_EXAM_V1. Không thêm lời dẫn, Markdown fence hoặc văn bản ngoài JSON.'
    ];
  }

  function generationInstructions049(input) {
    const base = input && input.instructions && typeof input.instructions === 'object' && !Array.isArray(input.instructions)
      ? input.instructions
      : {};
    return {
      ...base,
      question_fields: [
        'phan','noi_dung','A','B','C','D','dap_an_dung','loi_giai',
        'source_refs','muc_do','bai_hoc','quantitative'
      ],
      part_3: 'Short answer. A/B/C/D are empty strings. For Geography assessment standard 048 every Part III question MUST include quantitative metadata exactly as required by the assessment rules in this prompt.',
      validation_contract: 'question_fields is the complete 049 contract. quantitative is mandatory for Geography Part III and is not optional metadata.'
    };
  }

  window.aieBuildPrompt = function aieBuildPrompt049(input, units, localSpec) {
    const spec = serverSpec(input, localSpec);
    const pkg = {
      schema_version: 'DAMSAN_WEB_AI_EXAM_PACKAGE_V1',
      task: 'GROUNDED_EXAM_GENERATION',
      request: input.request,
      instructions: generationInstructions049(input),
      authoritative_exam_spec: spec,
      knowledge_units: units
    };
    const prompt = [
      'Bạn là bộ tạo đề cho hệ thống kiểm tra Đam San V4.',
      'Chỉ sử dụng KNOWLEDGE PACKAGE bên dưới. Không bổ sung kiến thức vốn có của mô hình và không bịa nguồn.',
      'Tuân thủ tuyệt đối authoritative_exam_spec về loại đề, số câu từng phần, trọng số và số mã đề.',
      'Mỗi câu phải có source_refs là mảng chứa ít nhất một unit_key thực sự xuất hiện trong knowledge_units.',
      'Phần 1: đủ A/B/C/D, dap_an_dung là A/B/C/D. Phần 2: A/B/C/D là 4 nhận định, dap_an_dung dạng Đ-S-Đ-S. Phần 3: trả lời ngắn, A/B/C/D để chuỗi rỗng.',
      ...standardLines(spec),
      '',
      'YÊU CẦU ĐẦU RA:',
      'Kết quả phải là DUY NHẤT một JSON object theo DAMSAN_EXAM_V1, không Markdown fence, không lời dẫn ngoài JSON.',
      'Root bắt buộc: schema_version, title, assessment_type, scoring_config, questions.',
      'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Riêng Phần III bắt buộc thêm quantitative theo schema ở trên.',
      '',
      'KNOWLEDGE PACKAGE:',
      JSON.stringify(pkg)
    ].join('\n');
    if (prompt.length > AIE_MAX_PROMPT_CHARS) throw new Error('Gói ra đề quá lớn cho clipboard web. Hãy chọn phạm vi kiến thức hẹp hơn.');
    return prompt;
  };

  const previousProfileChange = window.aieProfileChange;
  window.aieProfileChange = function aieProfileChange049() {
    if (typeof previousProfileChange === 'function') previousProfileChange();
    const profile = document.getElementById('profile')?.value;
    if (profile === 'TOT_NGHIEP') {
      const defaults = { p1Count: 18, p2Count: 4, p3Count: 6 };
      for (const [id, value] of Object.entries(defaults)) {
        const el = document.getElementById(id);
        if (el) el.value = value;
      }
    }
  };

  function parseFailure049(raw) {
    if (!raw) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function failureQuestion049(failure) {
    const n = Number(failure?.quality?.question_no);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }

  function failureMessage049(failure, fallbackCode = '') {
    const code = String(failure?.code || fallbackCode || 'validation_failed');
    const q = failureQuestion049(failure);
    const prefix = q ? `Câu ${q}: ` : '';
    const quality = failure?.quality || {};
    const messages = {
      quality_part3_quantitative_metadata_required: 'thiếu metadata định lượng quantitative của Phần III.',
      quality_part3_skill_invalid: `skill_code không hợp lệ${quality.skill_code ? ` (${quality.skill_code})` : ''}.`,
      quality_part3_operation_invalid: `operation_code không hợp lệ${quality.operation_code ? ` (${quality.operation_code})` : ''}.`,
      quality_part3_skill_operation_mismatch: 'skill_code và operation_code không khớp nhau.',
      quality_part3_data_form_invalid: 'data_form không thuộc TABLE_SERIES, MULTI_VALUE hoặc DIRECT_RELATION.',
      quality_part3_inputs_invalid: 'inputs phải là mảng số liệu thô hợp lệ.',
      quality_part3_source_data_not_exposed: 'số liệu thô trong quantitative chưa được đưa đầy đủ vào nội dung học sinh nhìn thấy.',
      quality_part3_recompute_mismatch: `đáp án AI không khớp phép tính của server${quality.expected != null ? `; server tính ${quality.expected}, AI trả ${quality.actual}` : ''}.`,
      quality_part3_rounding_invalid: 'câu hỏi chưa nêu rõ yêu cầu làm tròn.',
      quality_part3_rounding_metadata_invalid: 'rounding_digits không hợp lệ.',
      quality_part3_reasoning_steps_invalid: 'reasoning_steps không hợp lệ.',
      quality_part3_table_series_too_small: 'TABLE_SERIES phải chứa ít nhất 3 số liệu thô.',
      quality_part3_simple_sum_invalid: 'phép SUM hai số quá đơn giản, không đạt chuẩn Phần III.',
      quality_part3_too_many_single_step: `cả Phần III có quá nhiều câu một bước (${quality.single_step_count ?? '?'}; tối đa 2).`,
      quality_part3_multistep_mix_invalid: `cả Phần III chưa đủ câu nhiều bước (${quality.multistep_count ?? '?'}; cần ít nhất 4).`,
      quality_part3_rich_data_mix_invalid: `cả Phần III chưa đủ câu dùng dữ liệu phong phú (${quality.rich_data_count ?? '?'}; cần ít nhất 3).`,
      quality_part3_skill_diversity_invalid: `cả Phần III chưa đủ đa dạng kĩ năng (${quality.distinct_skills ?? '?'}; cần ít nhất 4).`,
      quality_part3_skill_repetition_invalid: 'một dạng kĩ năng bị lặp quá nhiều trong Phần III.',
      quality_part2_stimulus_invalid: 'stimulus Phần II quá ngắn hoặc chưa đủ ngữ cảnh.',
      quality_part2_statements_invalid: 'bốn nhận định Phần II chưa đạt yêu cầu.',
      quality_part2_truth_pattern_invalid: 'mẫu đáp án Đúng/Sai không hợp lệ.',
      quality_part2_all_same_invalid: 'không được để cả bốn nhận định Phần II cùng Đúng hoặc cùng Sai.',
      quality_part1_duplicate_options_invalid: 'Phần I có phương án trùng/rỗng.',
      knowledge_source_ref_outside_scope: 'source_refs trỏ ra ngoài các bài đã chọn.',
      source_ref_unknown: 'AI dùng source_ref không tồn tại trong Knowledge Pack.',
      question_count_mismatch: 'số câu AI trả về không đúng cấu trúc đã khóa.',
      exam_schema_invalid: 'schema JSON không phải DAMSAN_EXAM_V1.',
      assessment_type_mismatch: 'loại đề AI trả về không khớp request.',
      capability_expired: 'capability đã hết hạn; request này không thể gửi lại.',
      capability_not_claimed: 'capability không còn ở trạng thái cho phép gửi lại.',
      exam_request_unavailable: 'request không còn ở trạng thái nhận bản đề AI.'
    };
    return prefix + (messages[code] || `kiểm định không đạt (${code}).`);
  }

  async function readFailure049(requestId) {
    const session = typeof aieSession === 'function' ? aieSession() : null;
    if (!session || !requestId) return null;
    try {
      const { data, error } = await aieSb.rpc('rpc_ai_exam_request_read', {
        p_staff_token: session.token,
        p_ma_gv: session.profile.ma_gv,
        p_request_id: requestId
      });
      if (error || !data || data.status !== 'success') return null;
      const request = Array.isArray(data.requests) ? data.requests[0] : null;
      return parseFailure049(request?.processing_error);
    } catch {
      return null;
    }
  }

  function ensureRepairButton049() {
    let button = document.getElementById('btnRepairAI049');
    if (button) return button;
    const validate = document.getElementById('btnValidate');
    const actions = validate?.parentElement;
    if (!validate || !actions) return null;
    button = document.createElement('button');
    button.id = 'btnRepairAI049';
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = 'Sao chép yêu cầu AI sửa lỗi';
    button.hidden = true;
    actions.appendChild(button);
    button.addEventListener('click', async () => {
      const currentJson = document.getElementById('resultBox')?.value?.trim() || '';
      if (!currentJson || !lastValidationFailure049) {
        if (typeof aieNotice === 'function') aieNotice('Chưa có lỗi kiểm định và JSON để tạo yêu cầu sửa.', 'info');
        return;
      }
      const repairPrompt = [
        'Bạn đang sửa một JSON đề thi Đam San V4 vừa bị server kiểm định từ chối.',
        'Giữ nguyên phạm vi kiến thức, cấu trúc đề, số câu và source_refs hợp lệ. Chỉ sửa lỗi được nêu và các chỗ phụ thuộc trực tiếp vào lỗi đó.',
        'Đối với Phần III Địa lí, phải tuân thủ đầy đủ chuẩn định lượng 048 và tự tính lại đáp án.',
        'Không giải thích, không Markdown fence. Chỉ trả DUY NHẤT JSON object DAMSAN_EXAM_V1 đã sửa hoàn chỉnh.',
        '',
        'LỖI SERVER:',
        JSON.stringify(lastValidationFailure049, null, 2),
        '',
        'JSON HIỆN TẠI:',
        currentJson
      ].join('\n');
      try {
        await navigator.clipboard.writeText(repairPrompt);
        if (typeof aieNotice === 'function') aieNotice('Đã sao chép yêu cầu sửa lỗi. Dán vào đúng cuộc trò chuyện AI vừa tạo đề, rồi dán JSON đã sửa trở lại đây.', 'ok');
      } catch {
        const temp = document.createElement('textarea');
        temp.value = repairPrompt;
        temp.setAttribute('readonly','');
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        try { document.execCommand('copy'); } catch { /* best effort */ }
        temp.remove();
        if (typeof aieNotice === 'function') aieNotice('Đã chuẩn bị yêu cầu sửa lỗi trong clipboard nếu trình duyệt cho phép.', 'info');
      }
    });
    return button;
  }

  function showRepair049(show) {
    const button = ensureRepairButton049();
    if (button) button.hidden = !show;
  }

  window.aieValidateDraft = async function aieValidateDraft049() {
    if (aieBusy) return;
    if (!aieCapability || !aieCurrentRequestId) return aieNotice('Capability tạo đề không còn trong phiên này. Hãy tạo lại gói ra đề.', 'error');
    let exam;
    try { exam = aieLooseJson(document.getElementById('resultBox').value); }
    catch (error) { return aieNotice(`JSON đề không hợp lệ: ${error.message}`, 'error'); }

    lastValidationFailure049 = null;
    showRepair049(false);
    aieSetBusy(true);
    document.getElementById('validationStatus').textContent = 'Server đang kiểm định schema, cấu trúc, chất lượng, đáp án và nguồn...';
    try {
      const result = await aieGateway({
        action: 'submit_exam_draft',
        capability_token: aieCapability,
        ai_provider: document.getElementById('provider').value || 'WEB_AI',
        ai_model: document.getElementById('modelName').value.trim() || 'unspecified',
        exam
      });
      document.getElementById('validationStatus').textContent = `VALIDATED · revision ${result.revision} · ${result.validation?.question_count || 0} câu · ${result.validation?.variant_count || 0} mã đề.`;
      aieNotice('Đề đã vượt kiểm định kỹ thuật và chất lượng. Kiểm tra toàn bộ nội dung ở phần xem trước trước khi phê duyệt.', 'ok');
      aieCapability = '';
      await aieLoadRequests(aieCurrentRequestId);
    } catch (error) {
      const diagnostic = await readFailure049(aieCurrentRequestId);
      const code = diagnostic?.code || error?.code || 'validation_failed';
      const recoverable = diagnostic?.recoverable === true || !['capability_expired','capability_not_claimed','exam_request_unavailable','staff_session_invalid'].includes(String(code));
      lastValidationFailure049 = diagnostic || {
        schema_version: 'DAMSAN_AI_VALIDATION_FAILURE_V1',
        stage: 'EDGE_VALIDATION',
        code,
        recoverable
      };
      const reason = failureMessage049(lastValidationFailure049, code);
      const suffix = recoverable
        ? ' Request vẫn còn hiệu lực; không cần tạo gói mới. Có thể sửa JSON và bấm Gửi kiểm định đề lại.'
        : '';
      document.getElementById('validationStatus').textContent = `KHÔNG ĐẠT · ${reason}${suffix}`;
      aieNotice(`${reason}${suffix}`, 'error');
      showRepair049(recoverable && !!document.getElementById('resultBox').value.trim());
    } finally {
      aieSetBusy(false);
    }
  };

  const previousOpenRequest049 = window.aieOpenRequest;
  window.aieOpenRequest = function aieOpenRequest049(requestId) {
    const request = Array.isArray(aieRequests) ? aieRequests.find((r) => r.request_id === requestId) : null;
    const failure = parseFailure049(request?.processing_error);
    if (request && failure && !request.draft && ['AWAITING_AI','AI_WORKING','REJECTED'].includes(request.status)) {
      aieCurrentRequestId = request.request_id;
      document.querySelectorAll('.request').forEach((el) => el.classList.toggle('active', el.dataset.requestId === requestId));
      document.getElementById('reviewCard')?.classList.add('hidden');
      const reason = failureMessage049(failure);
      const state = request.status === 'REJECTED'
        ? 'Request đã bị từ chối.'
        : 'Request chưa bị mất; nếu capability của phiên hiện tại còn hiệu lực thì có thể sửa và gửi lại.';
      aieNotice(`${request.ma_phong}: ${reason} ${state}`, 'error');
      return;
    }
    if (typeof previousOpenRequest049 === 'function') previousOpenRequest049(requestId);
  };

  document.addEventListener('DOMContentLoaded', () => ensureRepairButton049());
})();