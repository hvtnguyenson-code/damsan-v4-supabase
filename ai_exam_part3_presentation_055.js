// 056 — Geography Part III presentation + compact-answer contract.
// Quantitative data with a natural table structure is authored as semantic HTML inside noi_dung.
// HTML attributes use SINGLE quotes so the surrounding JSON string stays valid without manual escaping.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  const previousBuildPrompt = window.aieBuildPrompt;
  const previousQuestionPreview = window.aieQuestionPreview;

  function specFrom(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  window.aieBuildPrompt = function aieBuildPrompt056(input, units, localSpec) {
    const prompt = previousBuildPrompt(input, units, localSpec);
    const spec = specFrom(input, localSpec);
    if (!spec?.assessment_standard || spec.assessment_standard.id !== STANDARD_ID) return prompt;

    const rules = [
      '',
      'PHẦN III — 056 BẢNG SỐ LIỆU + ĐÁP ÁN TỐI ĐA 4 KÍ TỰ:',
      '- dap_an_dung của mỗi câu Phần III là MỘT CHUỖI SỐ tối đa 4 kí tự. Dấu âm và dấu phẩy thập phân đều tính là một kí tự.',
      '- Các dạng hợp lệ điển hình: "2", "22", "222", "2222", "22,2", "2,22", "-222", "-2,2". Không ghi đơn vị, dấu cách, dấu phân cách hàng nghìn hoặc dấu + trong dap_an_dung.',
      '- Dùng dấu phẩy làm dấu thập phân trong dap_an_dung. Nếu kết quả tính tự nhiên dài hơn 4 kí tự, phải lựa chọn đơn vị biểu diễn và/hoặc quy tắc làm tròn hợp lí ngay trong câu hỏi để đáp án cuối cùng vẫn tối đa 4 kí tự; không được cắt chữ số cơ học.',
      '- Nếu đổi đơn vị CHỈ Ở KẾT QUẢ để thu gọn đáp án (ví dụ người -> nghìn người, ha -> nghìn ha), thêm quantitative.result_divisor là lũy thừa của 10 dùng để chia kết quả sau phép tính. Ví dụ 12345 người -> 12,3 nghìn người: result_divisor=1000, rounding_digits=1, dap_an_dung="12,3".',
      '- rounding_digits phải khớp yêu cầu làm tròn nêu trong noi_dung. Server sẽ tính lại từ quantitative.inputs, operation_code, result_divisor rồi đối chiếu dap_an_dung.',
      '',
      'TRÌNH BÀY SỐ LIỆU — BẮT BUỘC JSON HỢP LỆ:',
      '- Toàn bộ câu trả lời cuối cùng là JSON. Vì noi_dung là JSON string, KHÔNG chèn dấu nháy kép chưa escape vào HTML bên trong noi_dung.',
      "- Khi câu dùng từ 3 số liệu thô trở lên, hoặc dữ liệu vốn có cấu trúc theo năm/trạm/đối tượng/chỉ tiêu, PHẢI trình bày số liệu bằng BẢNG trong noi_dung; không nối một chuỗi dài bằng dấu chấm phẩy.",
      "- Bảng dùng HTML ngữ nghĩa tối giản và bắt buộc có marker <table data-damsan-p3='1'>. Dùng NHÁY ĐƠN cho thuộc tính HTML để JSON luôn hợp lệ. Chỉ dùng caption, thead, tbody, tr, th, td. KHÔNG dùng style, script, iframe, form hoặc phần tử tương tác.",
      "- Ví dụ khung JSON-safe: <table data-damsan-p3='1'><caption>Bảng số liệu ...</caption><thead><tr><th>Năm</th><th>2020</th><th>2024</th></tr></thead><tbody><tr><th>Giá trị</th><td>...</td><td>...</td></tr></tbody></table>.",
      '- noi_dung gồm lời dẫn/yêu cầu tính toán + bảng. Không lặp lại toàn bộ số liệu của bảng thành câu văn phía trên hoặc phía dưới.',
      '- Với đúng 2 số liệu đơn giản và không có cấu trúc bảng tự nhiên, có thể trình bày trong câu văn thay vì ép thành bảng.',
      '- Mọi giá trị dùng trong quantitative.inputs phải xuất hiện rõ trong phần văn bản hoặc các ô bảng mà học sinh nhìn thấy.',
      '- Trước khi trả kết quả, tự kiểm tra toàn bộ output bằng JSON.parse tương đương; nếu JSON không hợp lệ thì sửa trước khi trả.',
      ''
    ].join('\n');

    return prompt.replace('\nYÊU CẦU ĐẦU RA:', `${rules}\nYÊU CẦU ĐẦU RA:`);
  };

  function renderTable055(tableHtml) {
    try {
      const parsed = new DOMParser().parseFromString(tableHtml, 'text/html');
      const table = parsed.querySelector('table[data-damsan-p3="1"]');
      if (!table) return '';
      const caption = table.querySelector('caption')?.textContent?.trim() || '';
      const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th,td')).map((cell) => ({
          value: cell.textContent?.trim() || '',
          header: cell.tagName.toLowerCase() === 'th'
        }))
      ).filter((row) => row.length);
      if (!rows.length) return '';
      const esc = (value) => aieEscape(value);
      return `<div style="overflow-x:auto;margin:10px 0">${caption ? `<div style="font-weight:700;text-align:center;margin-bottom:6px">${esc(caption)}</div>` : ''}<table style="border-collapse:collapse;width:100%;font-size:13px"><tbody>${rows.map((row) => `<tr>${row.map((cell) => cell.header ? `<th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc">${esc(cell.value)}</th>` : `<td style="border:1px solid #cbd5e1;padding:6px">${esc(cell.value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } catch {
      return '';
    }
  }

  function renderP3Stem055(rawValue) {
    const raw = String(rawValue || '');
    const match = raw.match(/<table\b[^>]*data-damsan-p3=["']1["'][^>]*>[\s\S]*?<\/table>/i);
    if (!match) return aieEscape(raw);
    const before = raw.slice(0, match.index);
    const after = raw.slice((match.index || 0) + match[0].length);
    return `${aieEscape(before)}${renderTable055(match[0])}${aieEscape(after)}`;
  }

  window.aieQuestionPreview = function aieQuestionPreview055(question, index) {
    const part = String(question?.phan || question?.Phan || '1');
    if (part !== '3' || typeof previousQuestionPreview !== 'function') {
      return typeof previousQuestionPreview === 'function'
        ? previousQuestionPreview(question, index)
        : '';
    }
    const refs = Array.isArray(question.source_refs) ? question.source_refs : [];
    return `<div class="question"><h3>Câu ${index + 1} · Phần 3</h3><div>${renderP3Stem055(question.noi_dung || question.NoiDung || '')}</div><div class="answer">Đáp án: ${aieEscape(question.dap_an_dung || question.DapAnDung || '')}</div>${question.loi_giai ? `<div class="source">Giải thích: ${aieEscape(question.loi_giai)}</div>` : ''}<div class="source">Nguồn: ${refs.length ? refs.map(aieEscape).join(', ') : 'server provenance đã kiểm định'}</div></div>`;
  };
})();
