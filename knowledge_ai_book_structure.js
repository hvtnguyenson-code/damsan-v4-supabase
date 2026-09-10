// 036 — whole-book semantic structure guidance.
// Adds stable lesson metadata to DAMSAN_KNOWLEDGE_V1 so later exam requests can select only required lessons.
(function () {
  'use strict';

  const previousBuildPrompt = kaiBuildPrompt;

  kaiBuildPrompt = function kaiBuildPrompt036(input, chunks) {
    const base = previousBuildPrompt(input, chunks);
    const marker = '\nSOURCE PACKAGE:';
    const rules = [
      '',
      'CẤU TRÚC SÁCH / CHƯƠNG / BÀI — BẮT BUỘC:',
      '- Nếu nguồn chứa nhiều bài, phải tách tri thức theo đúng ranh giới từng bài; không gộp kiến thức của hai bài khác nhau vào cùng một unit.',
      '- Mỗi unit thuộc một bài phải có lesson_code và lesson_title. lesson_code phải ổn định trong toàn tài liệu, ưu tiên BAI_01, BAI_02, ... theo số bài in trong nguồn; lesson_title giữ đúng tên bài nhận diện từ nguồn.',
      '- hierarchy phải duy trì đường dẫn logic từ sách/chương/bài đến mục/tiểu mục. Không tự tạo chương hoặc bài không có căn cứ trong nguồn.',
      '- Với PDF, page_start/page_end và provenance phải phản ánh đúng trang vật lý đã OCR; tuyệt đối không suy đoán số trang.',
      '- Unit ở phần mở đầu/mục lục hoặc nội dung dùng chung cho toàn sách mà không thuộc bài cụ thể có thể để lesson_code và lesson_title rỗng.',
      '- Nếu OCR làm tên bài hoặc ranh giới bài không đủ chắc chắn, hạ confidence và đánh dấu is_usable=false thay vì tự đoán.',
      '- Không sao chép mục lục thành các FACT nếu mục lục không chứa kiến thức học tập; mục lục chỉ dùng để nhận diện cấu trúc.',
      '- Mục tiêu của metadata này là để hệ thống sau đó có thể chọn riêng Bài 1, Bài 3, Bài 5... mà không đưa cả cuốn sách vào Knowledge Pack.',
      ''
    ].join('\n');
    const pos = base.lastIndexOf(marker);
    if (pos < 0) return `${base}${rules}`;
    return `${base.slice(0, pos)}${rules}${base.slice(pos)}`;
  };
})();