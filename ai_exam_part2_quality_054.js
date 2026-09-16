// 054 — Geography Part II cognitive blueprint overlay.
// Restores/strengthens the Part II authoring contract after 053 focused the overlay on Part III.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  const previousBuildPrompt = window.aieBuildPrompt;

  function specFrom(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  window.aieBuildPrompt = function aieBuildPrompt054(input, units, localSpec) {
    const prompt = previousBuildPrompt(input, units, localSpec);
    const spec = specFrom(input, localSpec);
    if (!spec?.assessment_standard || spec.assessment_standard.id !== STANDARD_ID) return prompt;

    const part2Rules = [
      '',
      'PHẦN II — 054 CỤM ĐÚNG/SAI CÓ PHÂN HÓA NHẬN THỨC:',
      '- Mỗi câu Phần II là MỘT stimulus chung trong noi_dung và đúng bốn LỆNH/NHẬN ĐỊNH A/B/C/D. A/B/C/D không phải bốn phương án lựa chọn của Phần I.',
      '- Độ dài A/B/C/D được phép khác nhau tự nhiên theo yêu cầu nhận thức. KHÔNG cân bằng độ dài như Phần I và không rút các lệnh về cùng một khuôn câu ngắn.',
      '- Trong MỖI câu Phần II, bốn lệnh phải bao phủ ÍT NHẤT HAI mức độ trong NB, TH, VD; ưu tiên ba mức khi dữ liệu và phạm vi kiến thức cho phép. Cấm cả bốn lệnh cùng một mức độ.',
      '- NB: nhận biết/trích xuất trực tiếp một thông tin. TH: so sánh, giải thích, nhận xét, suy luận từ dữ liệu/thông tin. VD: tính toán, tổng hợp từ nhiều dữ kiện, xác định quan hệ nhân quả hoặc vận dụng vào tình huống mới.',
      '- Không để stimulus phát biểu sẵn bốn kết luận rồi A/B/C/D chỉ đổi vài từ. Trong mỗi cụm phải có ít nhất một lệnh buộc học sinh xử lí từ hai dữ kiện trở lên hoặc thực hiện suy luận/tính toán.',
      '- Các lệnh tương đối độc lập; không để đáp án của lệnh trước tiết lộ trực tiếp lệnh sau. Mẫu Đ/S không được cả bốn cùng Đ hoặc cả bốn cùng S.',
      '- Với dữ liệu bảng/chuỗi, có thể có lệnh đọc trực tiếp, lệnh so sánh và lệnh tính/nhận xét xu hướng trong cùng một câu để tạo phân hóa thực.',
      '- Mỗi câu Phần II BẮT BUỘC thêm statement_levels đúng dạng {"A":"NB|TH|VD","B":"NB|TH|VD","C":"NB|TH|VD","D":"NB|TH|VD"}. Đây là metadata blueprint để server kiểm tra độ đa dạng; nội dung lệnh vẫn phải thực sự tương ứng với mức đã khai báo.',
      '- Trường muc_do ở cấp câu giữ để tương thích và phải bằng mức CAO NHẤT xuất hiện trong statement_levels (NB < TH < VD).',
      ''
    ].join('\n');

    let out = prompt.replace('\nYÊU CẦU ĐẦU RA:', `${part2Rules}\nYÊU CẦU ĐẦU RA:`);
    out = out.replace(
      'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Phần III thêm quantitative theo contract 053.',
      'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Phần II thêm statement_levels; Phần III thêm quantitative theo contract 053.'
    );
    return out;
  };
})();
