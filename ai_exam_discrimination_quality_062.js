// 062 — Discrimination quality envelope for grounded Geography exam generation.
// Keeps 060 creativity and all server hard gates, but improves competitive distractors,
// non-trivial Part II reasoning and operation-faithful Part III wording.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  const previousBuildPrompt = window.aieBuildPrompt;

  function specFrom(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  function discriminationBlock() {
    return [
      '',
      'CHẤT LƯỢNG PHÂN HÓA — 062:',
      '- Đây là SOFT QUALITY ENVELOPE, không thay thế hard gate. Mục tiêu là làm học sinh phải hiểu kiến thức mới phân biệt được đáp án, không tăng độ khó bằng câu chữ rối hoặc dữ kiện thừa vô nghĩa.',
      '- Phần I TH/VD: bốn phương án phải cùng trường nghĩa, cùng kiểu trả lời và đều liên quan trực tiếp câu hỏi. Không tạo một đáp án hợp lí nổi bật bên cạnh ba phương án vô lí hoặc sai quá thô.',
      '- Với mỗi câu TH/VD Phần I, khi nguồn cho phép hãy tạo ít nhất hai distractor kiểu near-miss: nghe hợp lí với học sinh hiểu chưa đầy đủ nhưng sai ở đúng một quan hệ, điều kiện, phạm vi, nguyên nhân hoặc hệ quả có thể chỉ ra bằng nguồn.',
      '- Không dùng bất đối xứng từ khóa để lộ đáp án. Tránh để nhiều phương án sai chứa các từ tuyệt đối/cực đoan như “chỉ”, “hoàn toàn”, “duy nhất”, “không cần”, “toàn bộ”, “luôn luôn”, “không bao giờ” trong khi đáp án đúng có giọng điệu cân bằng hơn, trừ khi chính kiến thức nguồn bắt buộc cách diễn đạt đó.',
      '- Không làm đáp án đúng trở thành phương án duy nhất dài hơn, cụ thể hơn, tích cực hơn hoặc mang tính “thực hành tốt” rõ rệt. Các phương án nên có cấu trúc ngữ pháp và mức độ chi tiết tương đương, nhưng không ép cân bằng độ dài máy móc.',
      '- Câu VD Phần I phải buộc học sinh dùng ít nhất hai mảnh bằng chứng/quan hệ hoặc một điều kiện chuyển giao thực chất. Nếu chỉ cần chọn “biện pháp tốt” đối lập với ba lựa chọn hiển nhiên có hại thì chưa đủ phân hóa; hãy viết lại các distractor thành các quyết định cạnh tranh nhưng sai ở điều kiện then chốt.',
      '- Tự kiểm tra Phần I trước khi xuất JSON: tạm giấu đáp án. Nếu người không học Địa lí vẫn loại được từ hai phương án trở lên chỉ nhờ từ cực đoan, sắc thái tích cực/tiêu cực hoặc độ vô lí bề mặt, phải viết lại câu đó.',
      '- Phần II: nhận định TH/VD sai nên là near-miss có căn cứ, không phải đảo ngược thô một fact. Với tình huống VD, các nhận định cần buộc học sinh cân nhắc các hệ quả/giải pháp cạnh tranh dựa trên stimulus và nguồn, không dùng cặp “giải pháp hợp lí” đối lập với “hành vi rõ ràng có hại”.',
      '- Phần III: câu lệnh phải gọi đúng đại lượng mà quantitative.operation_code thực sự tính. SUM hỏi tổng; AVERAGE hỏi giá trị trung bình; DIFFERENCE hỏi chênh lệch; các phép hai nhóm phải nêu rõ đang so tổng hay trung bình. Không dùng cụm mâu thuẫn kiểu “tổng ... trung bình”.',
      '- Chỉ khai báo quantitative.rounding_digits khi thực sự cần làm tròn. Khi có rounding_digits, nội dung học sinh nhìn thấy phải nói rõ mức làm tròn tương ứng. Nếu kết quả chính xác đã là số nguyên và không cần làm tròn, ưu tiên bỏ rounding_digits.',
      '- Trước khi chốt toàn đề, lập rationale nội bộ cho từng distractor TH/VD: vì sao một học sinh chưa vững có thể chọn nó và chính xác điều kiện nào làm nó sai. Không xuất rationale này vào JSON.',
      '- Giữ tự do sáng tạo của 060: các nguyên tắc trên là tiêu chí chọn phương án tốt, không phải mẫu câu cố định và không được khiến các đề sau lặp lại cùng một skeleton.',
      ''
    ].join('\n');
  }

  function injectBeforeOutput(prompt) {
    const marker = '\nYÊU CẦU ĐẦU RA:';
    const block = discriminationBlock();
    return prompt.includes(marker) ? prompt.replace(marker, `${block}${marker}`) : `${prompt}${block}`;
  }

  window.aieBuildPrompt = function aieBuildPrompt062(input, units, localSpec) {
    const prompt = previousBuildPrompt(input, units, localSpec);
    const spec = specFrom(input, localSpec);
    if (!spec?.assessment_standard || spec.assessment_standard.id !== STANDARD_ID) return prompt;
    return injectBeforeOutput(prompt);
  };

  const extremePattern = /(^|[\s,.;:()])(chỉ|hoàn toàn|duy nhất|không cần|toàn bộ|luôn luôn|không bao giờ)(?=$|[\s,.;:()])/i;

  function part1Warning(question, questionNo) {
    const part = String(question?.phan ?? question?.Phan ?? '');
    const level = String(question?.muc_do || '').toUpperCase();
    if (part !== '1' || !['TH','VD'].includes(level)) return null;
    const answer = String(question?.dap_an_dung || question?.DapAnDung || '').toUpperCase();
    if (!['A','B','C','D'].includes(answer)) return null;
    const options = ['A','B','C','D'].map((key) => ({ key, text: String(question?.[key] || '') }));
    const correct = options.find((item) => item.key === answer);
    const wrongExtreme = options.filter((item) => item.key !== answer && extremePattern.test(item.text)).length;
    if (wrongExtreme >= 2 && correct && !extremePattern.test(correct.text)) {
      return { code:'part1_distractor_extreme_clues', question_no:questionNo, wrong_extreme_count:wrongExtreme };
    }
    return null;
  }

  function part3WordingWarning(question, questionNo) {
    if (String(question?.phan ?? question?.Phan ?? '') !== '3') return null;
    const stem = String(question?.noi_dung || question?.NoiDung || '').replace(/<[^>]+>/g, ' ');
    const op = String(question?.quantitative?.operation_code || '').toUpperCase();
    if (!op) return null;

    const mismatch =
      (op === 'AVERAGE' && (!/trung bình/i.test(stem) || /tổng.{0,45}trung bình|trung bình.{0,45}tổng/i.test(stem))) ||
      (op === 'SUM' && !/\btổng\b/i.test(stem)) ||
      (op === 'AVERAGE_DIFFERENCE_TWO_GROUPS' && (!/trung bình/i.test(stem) || !/chênh lệch/i.test(stem))) ||
      (op === 'SUM_DIFFERENCE_TWO_GROUPS' && (!/\btổng\b/i.test(stem) || !/chênh lệch/i.test(stem)));
    if (mismatch) return { code:'part3_operation_wording_mismatch', question_no:questionNo, operation_code:op };
    return null;
  }

  function analyzeQuestions(questions) {
    if (!Array.isArray(questions)) return [];
    const warnings = [];
    questions.forEach((question, index) => {
      const qNo = index + 1;
      const p1 = part1Warning(question, qNo);
      const p3 = part3WordingWarning(question, qNo);
      if (p1) warnings.push(p1);
      if (p3) warnings.push(p3);
    });
    return warnings;
  }

  window.aieAnalyzeDiscrimination062 = analyzeQuestions;

  const warningMessages = {
    part1_distractor_extreme_clues: 'Nhiều distractor dùng từ tuyệt đối/cực đoan trong khi đáp án đúng không có; học sinh có thể loại phương án bằng mẹo ngôn ngữ thay vì kiến thức.',
    part3_operation_wording_mismatch: 'Câu lệnh có dấu hiệu không khớp phép tính server thực hiện; cần kiểm tra cách gọi tổng, trung bình hoặc chênh lệch.'
  };

  function ensurePanel() {
    let panel = document.getElementById('qualityWarnings062');
    if (panel) return panel;
    const anchor = document.getElementById('qualityWarnings053') || document.getElementById('reviewMeta');
    if (!anchor?.parentElement) return null;
    panel = document.createElement('div');
    panel.id = 'qualityWarnings062';
    panel.className = 'authority-panel warn hidden';
    anchor.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function render(requestId) {
    const panel = ensurePanel();
    if (!panel) return;
    const request = Array.isArray(aieRequests) ? aieRequests.find((r) => r.request_id === requestId) : null;
    const questions = request?.draft?.exam_payload?.questions;
    const warnings = analyzeQuestions(questions);
    if (!warnings.length) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.innerHTML = `<strong>Cảnh báo phân hóa 062 cần giáo viên xem (${warnings.length})</strong><div class="sub" style="margin:5px 0 0">Đây là heuristic tư vấn, không phải hard gate và không thay thế việc đọc đề.</div><ul>${warnings.map((warning) => {
      const prefix = Number.isSafeInteger(Number(warning.question_no)) ? `Câu ${warning.question_no}: ` : '';
      return `<li>${aieEscape(prefix + (warningMessages[warning.code] || warning.code))}</li>`;
    }).join('')}</ul>`;
    panel.classList.remove('hidden');
  }

  const previousOpen = window.aieOpenRequest;
  window.aieOpenRequest = function aieOpenRequest062(requestId) {
    if (typeof previousOpen === 'function') previousOpen(requestId);
    setTimeout(() => render(requestId), 0);
  };

  document.addEventListener('DOMContentLoaded', () => ensurePanel());
})();
