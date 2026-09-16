// 053 — teacher-facing quality review warnings.
// Warnings are advisory, but they must be visible before the canonical publish decision.
(function () {
  'use strict';

  const messages = {
    cognitive_level_missing_or_invalid: 'Mức độ nhận thức chưa được AI gắn hợp lệ; cần đọc câu để tự xác nhận.',
    lesson_label_missing: 'Thiếu nhãn bài học mô tả; grounding source_refs vẫn được server kiểm riêng.',
    explanation_too_short: 'Lời giải/giải thích quá ngắn để hỗ trợ rà soát.',
    part1_option_length_imbalance: 'Các phương án Phần I chênh lệch độ dài nhiều; kiểm tra khả năng lộ đáp án.',
    part2_stimulus_short: 'Stimulus Phần II ngắn; kiểm tra xem bốn nhận định có thực sự khai thác một ngữ cảnh chung.',
    part2_all_same_truth_pattern: 'Cả bốn nhận định Phần II cùng Đúng hoặc cùng Sai; nên xem lại độ tự nhiên của cụm.',
    part3_rounding_instruction_missing: 'Phần III chưa nêu rõ yêu cầu làm tròn trong nội dung học sinh thấy.',
    rounding_digits_server_derived: 'Server phải tự suy ra số chữ số làm tròn từ đáp án AI.',
    part3_unit_metadata_missing: 'Thiếu metadata đơn vị; kiểm tra đơn vị đã xuất hiện rõ trong câu hỏi.',
    part3_simple_two_value_sum: 'Phần III chỉ cộng hai giá trị; kiểm tra xem có đánh giá kĩ năng địa lí thực chất hay không.',
    part3_too_many_single_step: 'Phần III có quá nhiều câu một bước so với mục tiêu chất lượng.',
    part3_multistep_mix_below_target: 'Phần III chưa đạt mục tiêu số câu nhiều bước.',
    part3_rich_data_mix_below_target: 'Phần III chưa đạt mục tiêu số câu dùng chuỗi/bảng dữ liệu đủ phong phú.',
    part3_operation_diversity_below_target: 'Các dạng tính toán Phần III chưa đủ đa dạng.',
    part3_operation_family_repeated: 'Một họ phép tính bị lặp nhiều trong Phần III.'
  };

  function ensurePanel() {
    let panel = document.getElementById('qualityWarnings053');
    if (panel) return panel;
    const reviewMeta = document.getElementById('reviewMeta');
    if (!reviewMeta?.parentElement) return null;
    panel = document.createElement('div');
    panel.id = 'qualityWarnings053';
    panel.className = 'authority-panel warn hidden';
    reviewMeta.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function textForWarning(warning) {
    const code = String(warning?.code || 'quality_warning');
    const q = Number(warning?.question_no);
    const prefix = Number.isSafeInteger(q) && q > 0 ? `Câu ${q}: ` : '';
    let detail = messages[code] || code;
    if (code === 'part3_too_many_single_step' && warning?.single_step_count != null) {
      detail += ` (${warning.single_step_count} câu; mục tiêu tối đa ${warning.recommended_max ?? 2}).`;
    } else if (code === 'part3_multistep_mix_below_target' && warning?.multistep_count != null) {
      detail += ` (${warning.multistep_count} câu; mục tiêu ít nhất ${warning.recommended_min ?? 4}).`;
    } else if (code === 'part3_rich_data_mix_below_target' && warning?.rich_data_count != null) {
      detail += ` (${warning.rich_data_count} câu; mục tiêu ít nhất ${warning.recommended_min ?? 3}).`;
    } else if (code === 'part3_operation_diversity_below_target' && warning?.distinct_families != null) {
      detail += ` (${warning.distinct_families} họ; mục tiêu ít nhất ${warning.recommended_min ?? 4}).`;
    }
    return prefix + detail;
  }

  function render(requestId) {
    const panel = ensurePanel();
    if (!panel) return;
    const request = Array.isArray(aieRequests) ? aieRequests.find((r) => r.request_id === requestId) : null;
    const warnings = request?.draft?.validation_report?.assessment_quality?.warnings;
    if (!Array.isArray(warnings) || !warnings.length) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.innerHTML = `<strong>Cảnh báo chất lượng cần giáo viên xem trước khi phê duyệt (${warnings.length})</strong><div class="sub" style="margin:5px 0 0">Đây không phải lỗi tính đúng/sai. Hard gate đã qua; các cảnh báo này giúp quyết định có nên dùng đề hay yêu cầu AI chỉnh lại.</div><ul>${warnings.map((w) => `<li>${aieEscape(textForWarning(w))}</li>`).join('')}</ul>`;
    panel.classList.remove('hidden');
  }

  const previousOpen = window.aieOpenRequest;
  window.aieOpenRequest = function aieOpenRequestQuality053(requestId) {
    if (typeof previousOpen === 'function') previousOpen(requestId);
    setTimeout(() => render(requestId), 0);
  };

  document.addEventListener('DOMContentLoaded', () => ensurePanel());
})();
