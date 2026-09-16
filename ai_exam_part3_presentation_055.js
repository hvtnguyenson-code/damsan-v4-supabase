// 055 — Geography Part III presentation + compact-answer contract.
// Tabular raw data is carried inside noi_dung as a sanitized HTML table so the existing
// student renderer can display it without a second room-data path.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  const previousBuildPrompt = window.aieBuildPrompt;
  const previousQuestionPreview = window.aieQuestionPreview;

  function specFrom(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  window.aieBuildPrompt = function aieBuildPrompt055(input, units, localSpec) {
    const prompt = previousBuildPrompt(input, units, localSpec);
    const spec = specFrom(input, localSpec);
    if (!spec?.assessment_standard || spec.assessment_standard.id !== STANDARD_ID) return prompt;

    const rules = [
      '',
      'PHẦN III — 055 BẢNG SỐ LIỆU + ĐÁP ÁN TỐI ĐA 4 KÍ TỰ:',
      '- dap_an_dung của mỗi câu Phần III phải là CHUỖI số tối đa 4 kí tự. Dấu âm và dấu phẩy thập phân đều được tính là một kí tự.',
      '- Dùng dấu phẩy làm dấu thập phân trong dap_an_dung. Không ghi đơn vị, dấu cách, dấu phân cách hàng nghìn hoặc dấu + trong đáp án.',
      '- Các dạng hợp lệ điển hình: "2", "22", "222", "2222", "22,2", "2,22", "-222", "-2,2". Mọi đáp án dài hơn 4 kí tự đều không đạt.',
      '- Nếu kết quả tính tự nhiên dài hơn 4 kí tự, phải chọn cách làm tròn/đơn vị biểu diễn hợp lí ngay trong câu hỏi để kết quả cuối cùng còn tối đa 4 kí tự. Không được cắt bớt chữ số một cách cơ học và không được làm sai giá trị.',
      '- rounding_digits trong quantitative phải đúng với cách làm tròn đã nêu trong noi_dung và phải tạo ra đúng dap_an_dung sau khi server tính lại.',
      '',
      'TRÌNH BÀY SỐ LIỆU:',
      '- Khi câu dùng từ 3 số liệu thô trở lên, hoặc dữ liệu vốn có cấu trúc theo trạm/năm/đối tượng/chỉ tiêu, PHẢI trình bày số liệu bằng bảng HTML ngay trong noi_dung; không nối một chuỗi dài bằng dấu chấm phẩy.',
      '- Bảng bắt buộc dùng đúng marker <table data-damsan-p3="1" ...> để hệ thống nhận diện. Dùng thead/tbody, th/td; có thể có caption. Không dùng script, iframe, form hoặc phần tử tương tác.',
      '- Mẫu hình thức: <table data-damsan-p3="1" style="border-collapse:collapse;width:100%;margin:10px 0"><thead><tr><th style="border:1px solid #94a3b8;padding:6px">...</th></tr></thead><tbody><tr><td style="border:1px solid #94a3b8;padding:6px">...</td></tr></tbody></table>.',
      '- noi_dung nên gồm lời dẫn/yêu cầu tính toán + bảng. Không lặp lại toàn bộ số liệu của bảng thành một câu văn phía trên hoặc phía dưới.',
      '- Với đúng 2 số liệu đơn giản và không có cấu trúc bảng tự nhiên, có thể trình bày trong câu văn thay vì ép thành bảng.',
      '- Các số dùng trong quantitative.inputs phải xuất hiện rõ trong noi_dung/bảng mà học sinh nhìn thấy.',
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
        Array.from(tr.querySelectorAll('th,td')).map((cell) => cell.textContent?.trim() || '')
      ).filter((row) => row.length);
      if (!rows.length) return '';
      const first = rows[0];
      const body = rows.slice(1);
      const esc = (value) => aieEscape(value);
      return `<div style="overflow-x:auto;margin:10px 0">${caption ? `<div style="font-weight:700;text-align:center;margin-bottom:6px">${esc(caption)}</div>` : ''}<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>${first.map((cell) => `<th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc">${esc(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td style="border:1px solid #cbd5e1;padding:6px">${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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
