// 037 — Geography TNTHPT assessment profile prompt compiler.
// Keeps the Web-AI handoff provider-neutral while making official-style item-writing rules explicit.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';

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
      `Áp dụng assessment_standard ${STANDARD_ID}. Đây là chuẩn phong cách/quality gate; số câu thực tế vẫn phải theo authoritative_exam_spec.counts.`,
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
      'PHẦN III — TRẢ LỜI NGẮN:',
      '- Với chuẩn Địa lí này, câu trả lời ngắn phải là bài toán định lượng có một đáp án số duy nhất.',
      '- Đề bài phải cung cấp đủ số liệu cần thiết trong noi_dung hoặc trong knowledge_units được trích dẫn; không yêu cầu học sinh tự biết một số liệu ngoài nguồn.',
      '- Nêu rõ đại lượng/đơn vị và quy tắc làm tròn (hàng đơn vị, 1 chữ số thập phân, 2 chữ số thập phân...) khi cần.',
      '- Tự tính lại độc lập trước khi xuất; dap_an_dung phải đúng với phép tính và quy tắc làm tròn. loi_giai phải nêu phép tính kiểm chứng ngắn gọn.',
      '',
      'METADATA KIỂM ĐỊNH:',
      '- Mỗi câu bắt buộc có muc_do thuộc NB, TH hoặc VD; bai_hoc phải mô tả đúng phạm vi nội dung; source_refs chỉ dùng unit_key có thật.',
      '- Không được dùng kiến thức nền của mô hình để vá thiếu dữ liệu. Nếu nguồn không đủ để tạo một câu đạt chuẩn, hãy chọn nội dung khác trong knowledge_units thay vì bịa.',
      '- Giữ nguyên DAMSAN_EXAM_V1. Không thêm lời dẫn, Markdown fence hoặc văn bản ngoài JSON.'
    ];
  }

  window.aieBuildPrompt = function aieBuildPrompt037(input, units, localSpec) {
    const spec = serverSpec(input, localSpec);
    const pkg = {
      schema_version: 'DAMSAN_WEB_AI_EXAM_PACKAGE_V1',
      task: 'GROUNDED_EXAM_GENERATION',
      request: input.request,
      instructions: input.instructions,
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
      'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc.',
      '',
      'KNOWLEDGE PACKAGE:',
      JSON.stringify(pkg)
    ].join('\n');
    if (prompt.length > AIE_MAX_PROMPT_CHARS) throw new Error('Gói ra đề quá lớn cho clipboard web. Hãy chọn phạm vi kiến thức hẹp hơn.');
    return prompt;
  };

  const previousProfileChange = window.aieProfileChange;
  window.aieProfileChange = function aieProfileChange037() {
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
})();
