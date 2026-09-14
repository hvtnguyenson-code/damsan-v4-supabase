// 048 — Geography TNTHPT assessment profile prompt compiler.
// Keeps the Web-AI handoff provider-neutral while enforcing official-style item-writing rules.
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

  window.aieBuildPrompt = function aieBuildPrompt048(input, units, localSpec) {
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
      'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Riêng Phần III bắt buộc thêm quantitative theo schema ở trên.',
      '',
      'KNOWLEDGE PACKAGE:',
      JSON.stringify(pkg)
    ].join('\n');
    if (prompt.length > AIE_MAX_PROMPT_CHARS) throw new Error('Gói ra đề quá lớn cho clipboard web. Hãy chọn phạm vi kiến thức hẹp hơn.');
    return prompt;
  };

  const previousProfileChange = window.aieProfileChange;
  window.aieProfileChange = function aieProfileChange048() {
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
