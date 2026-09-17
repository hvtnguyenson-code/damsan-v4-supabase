// 058 — Geography Part II cognitive-depth overlay.
// Keeps the 054 statement-level blueprint, but prevents self-labelled TH/VD from passing on metadata alone.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  const previousBuildPrompt = window.aieBuildPrompt;
  const previousQuestionPreview = window.aieQuestionPreview;

  function specFrom(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  window.aieBuildPrompt = function aieBuildPrompt058(input, units, localSpec) {
    const prompt = previousBuildPrompt(input, units, localSpec);
    const spec = specFrom(input, localSpec);
    if (!spec?.assessment_standard || spec.assessment_standard.id !== STANDARD_ID) return prompt;

    const part2Rules = [
      '',
      'PHẦN II — 058 ĐỘ SÂU NHẬN THỨC TH/VD:',
      '- Quy tắc 058 này ƯU TIÊN hơn mô tả Part II cũ nếu có khác biệt.',
      '- Mỗi câu Phần II vẫn là MỘT stimulus chung và đúng bốn lệnh/nhận định A/B/C/D; A/B/C/D không phải bốn phương án chọn của Phần I.',
      '- Độ dài A/B/C/D được phép khác nhau tự nhiên theo yêu cầu nhận thức. KHÔNG cân bằng độ dài như Phần I và không rút các lệnh về cùng một khuôn câu ngắn.',
      '- Bốn lệnh phải tương đối độc lập; không để đáp án của lệnh trước tiết lộ trực tiếp lệnh sau. Mẫu Đ/S không được cả bốn cùng Đ hoặc cả bốn cùng S.',
      '- Stimulus không được phát biểu sẵn bốn kết luận rồi A/B/C/D chỉ đổi vài từ. Ít nhất một lệnh phải buộc học sinh xử lí/tổng hợp dữ kiện thay vì chép lại.',
      '- Mỗi cụm BẮT BUỘC có ít nhất 01 lệnh THỰC CHẤT ở mức TH và ít nhất 01 lệnh THỰC CHẤT ở mức VD. Không được chỉ đổi nhãn statement_levels để tạo cảm giác phân hóa.',
      '- NB: học sinh có thể trả lời bằng cách đọc/nhận ra trực tiếp một sự kiện, khái niệm, ô số liệu hoặc quan hệ đã hiển thị; không cần biến đổi dữ kiện.',
      '- TH: học sinh phải xử lí ít nhất hai dữ kiện hoặc một quan hệ; có thể so sánh, nhận xét xu hướng, giải thích quan hệ, suy luận một bước hoặc thực hiện phép tính trực tiếp một bước. TH không được chỉ là chép lại một ô số liệu.',
      '- VD: học sinh phải áp dụng kiến thức/quy tắc vào một kết quả dẫn xuất hoặc tình huống không được phát biểu sẵn. Phải có ít nhất hai bước xử lí/suy luận và ít nhất hai dữ kiện liên quan.',
      '- CẤM gắn nhãn VD cho: đọc trực tiếp số liệu; so sánh hai số đã cho; cộng/trừ trực tiếp một lần; tính một chênh lệch đơn giản; hoặc chỉ kiểm tra một mệnh đề bằng đúng một ô/hai ô của bảng. Những dạng này tối đa là TH.',
      '- Một lệnh VD hợp lệ phải thuộc ít nhất một trong các kiểu: tính toán nhiều bước; tỉ lệ/tốc độ/chỉ số rồi dùng kết quả để kết luận; tổng hợp từ nhiều dữ kiện để kiểm chứng một nhận định; vận dụng quan hệ nhân quả/không gian vào tình huống mới nhưng vẫn chỉ dùng kiến thức trong knowledge_units.',
      '- Nếu stimulus là bảng số liệu, ưu tiên cấu trúc phân hóa: 01 lệnh đọc dữ liệu (NB), 01-02 lệnh so sánh/nhận xét/giải thích (TH), và 01 lệnh buộc tính/tổng hợp nhiều bước hoặc vận dụng kết quả dẫn xuất (VD).',
      '- Trước khi xuất JSON, tự kiểm tra từng lệnh: nếu một học sinh chỉ cần nhìn một ô, nhìn hai ô rồi so sánh, hoặc làm đúng một phép cộng/trừ là trả lời được thì KHÔNG được ghi mức VD.',
      '- Mỗi câu Phần II BẮT BUỘC có statement_levels dạng {"A":"NB|TH|VD","B":"NB|TH|VD","C":"NB|TH|VD","D":"NB|TH|VD"}. muc_do cấp câu bằng mức cao nhất xuất hiện.',
      '- Mỗi câu Phần II BẮT BUỘC thêm statement_reasoning cho A/B/C/D. Mỗi entry có đúng các trường: operation, evidence_count, reasoning_steps, derived_quantity, transfer_context.',
      '- operation chỉ dùng một trong: direct_lookup, comparison, trend_interpretation, simple_calculation, causal_explanation, multi_step_calculation, rate_ratio_percent, index_normalization, evidence_synthesis, scenario_application, causal_application.',
      '- Với TH: operation không được là direct_lookup; evidence_count phải >=2 hoặc reasoning_steps phải >=2.',
      '- Với VD: operation phải là multi_step_calculation, rate_ratio_percent, index_normalization, evidence_synthesis, scenario_application hoặc causal_application; evidence_count>=2; reasoning_steps>=2; đồng thời derived_quantity=true hoặc transfer_context=true. Không khai metadata giả để hợp thức hóa câu hỏi đơn giản.',
      ''
    ].join('\n');

    let out = prompt.replace('\nYÊU CẦU ĐẦU RA:', `${part2Rules}\nYÊU CẦU ĐẦU RA:`);
    out = out.replace(
      'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Phần III thêm quantitative theo contract 053.',
      'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Phần II thêm statement_levels và statement_reasoning; Phần III thêm quantitative theo contract 053.'
    );
    out = out.replace(
      '"source_refs","muc_do","bai_hoc","quantitative"]',
      '"source_refs","muc_do","bai_hoc","statement_levels","statement_reasoning","quantitative"]'
    );
    return out;
  };

  if (typeof previousQuestionPreview === 'function') {
    window.aieQuestionPreview = function aieQuestionPreview058(question, index) {
      let html = previousQuestionPreview(question, index);
      const part = String(question?.phan || question?.Phan || '1');
      const levels = question?.statement_levels;
      if (part !== '2' || !levels || typeof levels !== 'object' || Array.isArray(levels)) return html;
      const labels = ['A','B','C','D'].map((key) => {
        const value = String(levels[key] || '').toUpperCase();
        return `${key}: ${aieEscape(value || '?')}`;
      }).join(' · ');
      const marker = '<div class="answer">';
      const badge = `<div class="source"><strong>Mức độ từng lệnh:</strong> ${labels}</div>`;
      return html.includes(marker) ? html.replace(marker, `${badge}${marker}`) : `${html}${badge}`;
    };
  }
})();
