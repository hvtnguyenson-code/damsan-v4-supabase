// 072 — Geography Part III presentation + authentic-data contract.
// Quantitative data may come from selected knowledge units or a tiny whitelist of authoritative web sources.
// External datasets are not copied into Supabase; the AI returns only the evidence capsule used by the question.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  const previousBuildPrompt = window.aieBuildPrompt;
  const previousQuestionPreview = window.aieQuestionPreview;

  function specFrom(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  function trustedSources072(spec) {
    const sources = spec?.assessment_standard?.part3?.trusted_external_sources;
    return Array.isArray(sources) ? sources.filter((s) => s && s.source_id) : [];
  }

  function trustedRegistryLines072(spec) {
    const sources = trustedSources072(spec);
    if (!sources.length) return ['- Request này không có nguồn ngoài nào được whitelist; chỉ được dùng LOCAL_GROUNDED.'];
    return [
      '- TRUSTED_EXTERNAL chỉ được chọn từ whitelist sau; source_url phải nằm đúng domain chính thức tương ứng:',
      ...sources.map((s) => {
        const domains = Array.isArray(s.allowed_domains) ? s.allowed_domains.join(', ') : '';
        const scope = Array.isArray(s.scope_tags) ? s.scope_tags.join(', ') : '';
        return `  * ${s.source_id}: ${s.display_name || s.organization || ''}; domain: ${domains}; phạm vi: ${scope}`;
      })
    ];
  }

  window.aieBuildPrompt = function aieBuildPrompt072(input, units, localSpec) {
    let prompt = previousBuildPrompt(input, units, localSpec);
    const spec = specFrom(input, localSpec);
    if (!spec?.assessment_standard || spec.assessment_standard.id !== STANDARD_ID) return prompt;

    // 053's source-only wording remains correct for curriculum/content. 072 introduces one narrow exception:
    // raw quantitative evidence for Part III may be browsed only from the request's authoritative whitelist.
    prompt = prompt.replace(
      'Chỉ sử dụng KNOWLEDGE PACKAGE bên dưới. Không bổ sung kiến thức vốn có của mô hình và không bịa nguồn.',
      'Chỉ dùng KNOWLEDGE PACKAGE bên dưới để xác định kiến thức, kĩ năng và phạm vi được hỏi. Không bổ sung kiến thức vốn có và không bịa nguồn. Riêng SỐ LIỆU THÔ Phần III được phép lấy từ trusted_external_sources trong authoritative_exam_spec theo contract 072.'
    );
    prompt = prompt.replace(
      '- Không dùng kiến thức ngoài knowledge_units; source_refs phải là unit_key có thật.',
      '- Kiến thức/kĩ năng được hỏi phải nằm trong knowledge_units và source_refs phải là unit_key có thật. Riêng dữ liệu định lượng Phần III có thể dùng TRUSTED_EXTERNAL theo whitelist 072, nhưng source_refs vẫn phải neo câu hỏi vào đúng bài đã chọn.'
    );

    const rules = [
      '',
      'PHẦN III — 071 DỮ LIỆU THẬT + LỆNH HỎI THEO MẪU TNTHPT:',
      '- Phần III đánh giá năng lực xử lí số liệu địa lí. TUYỆT ĐỐI KHÔNG tự đặt số liệu để tạo phép tính đẹp. CẤM “giả định”, “mô phỏng”, “số liệu minh họa”, “lãnh thổ A/B”, hoặc con số do mô hình tự nghĩ ra.',
      '- Quy tắc 071 cũ “không tự bổ sung nguồn ngoài gói” được mở rộng có kiểm soát ở 072: kiến thức vẫn chỉ từ Knowledge Package; chỉ SỐ LIỆU THÔ Phần III được phép lấy từ whitelist chính thức bên dưới.',
      '- source_refs luôn phải trỏ tới knowledge_unit của bài đã chọn để chứng minh câu hỏi đúng phạm vi chương trình, kể cả khi số liệu thô đến từ TRUSTED_EXTERNAL.',
      '',
      'MỞ RỘNG 072 — HAI NGUỒN DỮ LIỆU HỢP LỆ:',
      '- Ưu tiên LOCAL_GROUNDED khi SGK/Knowledge Package đã có số liệu phù hợp. Khi đó quantitative.data_origin="LOCAL_GROUNDED" và KHÔNG cần external_evidence.',
      '- LOCAL_GROUNDED: quantitative.inputs phải xuất hiện về mặt số học trong ít nhất một knowledge_unit được source_refs dẫn. Server vẫn kiểm tra lại như 071.',
      '- Chỉ khi dữ liệu trong SGK không đủ để ra câu có ý nghĩa, được dùng quantitative.data_origin="TRUSTED_EXTERNAL".',
      '- TRUSTED_EXTERNAL không cho phép dùng trí nhớ của mô hình. AI web PHẢI truy cập/tra cứu nguồn chính thức, lấy số thật, đối chiếu nguồn rồi mới đặt câu. Nếu không có khả năng duyệt web hoặc không xác minh được nguồn trực tiếp thì KHÔNG được tạo câu đó.',
      '- Không dùng nguồn thứ cấp, blog, Wikipedia, báo chí hoặc domain ngoài whitelist để thay cho nguồn chính thức.',
      ...trustedRegistryLines072(spec),
      '',
      'EVIDENCE CAPSULE 072 — BẮT BUỘC CHO TRUSTED_EXTERNAL:',
      '- quantitative phải có data_origin, operation_code, inputs và các tham số tính thật sự cần thiết.',
      '- Khi data_origin="TRUSTED_EXTERNAL", thêm quantitative.external_evidence với đúng các trường tối thiểu: source_id, source_url, dataset, retrieved_at, values.',
      '- source_id phải đúng một mã trong whitelist. source_url phải là URL HTTPS trực tiếp tới trang/bảng/API chính thức thuộc allowed_domains của source_id; không dùng URL tìm kiếm hoặc trang trung gian.',
      '- dataset ghi tên bộ dữ liệu/bảng/chỉ tiêu đủ để giáo viên lần ngược; retrieved_at ghi ngày truy cập dạng YYYY-MM-DD; values là mảng CHỈ gồm các số liệu thô thật đã lấy từ nguồn.',
      '- Mọi số trong quantitative.inputs phải xuất hiện nguyên giá trị trong external_evidence.values. Không đưa kết quả suy ra, hệ số ×100, ×1000 hoặc hằng số công thức vào values/inputs nếu nguồn không cung cấp chúng.',
      '- Nên bổ sung entity, period, indicator_code/table_name khi nguồn có để tăng khả năng kiểm chứng.',
      '- Trong noi_dung học sinh nhìn thấy phải ghi nguồn ngắn gọn dưới bảng/đoạn số liệu, ví dụ “Nguồn: World Bank, World Development Indicators, truy cập 2026-09-30”.',
      '- Ví dụ cấu trúc: "quantitative":{"data_origin":"TRUSTED_EXTERNAL","operation_code":"GROWTH_INDEX","inputs":[...],"external_evidence":{"source_id":"WORLD_BANK","source_url":"https://data.worldbank.org/...","dataset":"World Development Indicators - Population, total","retrieved_at":"YYYY-MM-DD","values":[...],"entity":"...","period":"..."}}.',
      '- Nếu không đủ dữ liệu LOCAL_GROUNDED và cũng không tìm/xác minh được TRUSTED_EXTERNAL trong whitelist, dừng và trả duy nhất JSON {"schema_version":"DAMSAN_EXAM_GENERATION_BLOCKED","code":"INSUFFICIENT_AUTHENTIC_QUANTITATIVE_DATA","message":"Không đủ dữ liệu định lượng thật có thể kiểm chứng cho phạm vi đã chọn."}. Tuyệt đối không bịa số để đủ số câu.',
      '',
      'CÁCH RA LỆNH HỎI — HỌC THEO ĐỀ THAM KHẢO/TNTHPT, KHÔNG HỌC VẸT CÂU CHỮ:',
      '- Với bảng số liệu thật: nêu tên bảng, đơn vị, dữ liệu và nguồn; sau bảng dùng lệnh ngắn, trực tiếp kiểu “Căn cứ vào bảng số liệu trên, hãy cho biết ... (làm tròn ...).”',
      '- Với hai hoặc vài số liệu thật trình bày bằng câu văn: nêu rõ đối tượng, thời gian, đơn vị và các giá trị; sau đó hỏi trực tiếp “Hãy cho biết ...” hoặc “Tính ...”, kèm yêu cầu làm tròn khi cần.',
      '- Lệnh hỏi phải buộc học sinh nhận diện đại lượng/công thức địa lí phù hợp rồi xử lí dữ liệu; không biến câu trả lời ngắn thành phép cộng/trừ cơ học không có ý nghĩa địa lí.',
      '- Không dùng câu dẫn “trong một bài tập giả định”, “giáo viên cho các giá trị”, “một lãnh thổ giả định” để hợp thức hóa số liệu do AI tự đặt.',
      '',
      'ĐÁP ÁN TỐI ĐA 4 KÍ TỰ:',
      '- dap_an_dung của mỗi câu Phần III là MỘT CHUỖI SỐ tối đa 4 kí tự. Dấu âm và dấu phẩy thập phân đều tính là một kí tự.',
      '- Các dạng hợp lệ điển hình: "2", "22", "222", "2222", "22,2", "2,22", "-222", "-2,2". Không ghi đơn vị, dấu cách, dấu phân cách hàng nghìn hoặc dấu + trong dap_an_dung.',
      '- Dùng dấu phẩy làm dấu thập phân trong dap_an_dung. Nếu kết quả tính tự nhiên dài hơn 4 kí tự, phải lựa chọn đơn vị biểu diễn và/hoặc quy tắc làm tròn hợp lí ngay trong câu hỏi để đáp án cuối cùng vẫn tối đa 4 kí tự; không được cắt chữ số cơ học.',
      '- Nếu đổi đơn vị CHỈ Ở KẾT QUẢ để thu gọn đáp án, thêm quantitative.result_divisor là lũy thừa của 10 dùng để chia kết quả sau phép tính.',
      '- rounding_digits phải khớp yêu cầu làm tròn nêu trong noi_dung. Server sẽ tính lại từ quantitative.inputs, operation_code, result_divisor rồi đối chiếu dap_an_dung.',
      '',
      'TRÌNH BÀY SỐ LIỆU — BẮT BUỘC JSON HỢP LỆ:',
      '- Toàn bộ câu trả lời cuối cùng là JSON. Vì noi_dung là JSON string, KHÔNG chèn dấu nháy kép chưa escape vào HTML bên trong noi_dung.',
      "- Khi câu dùng từ 3 số liệu thô trở lên, hoặc dữ liệu vốn có cấu trúc theo năm/trạm/đối tượng/chỉ tiêu, PHẢI trình bày số liệu bằng BẢNG trong noi_dung; không nối một chuỗi dài bằng dấu chấm phẩy.",
      "- Bảng dùng HTML ngữ nghĩa tối giản và bắt buộc có marker <table data-damsan-p3='1'>. Dùng NHÁY ĐƠN cho thuộc tính HTML để JSON luôn hợp lệ. Chỉ dùng caption, thead, tbody, tr, th, td. KHÔNG dùng style, script, iframe, form hoặc phần tử tương tác.",
      "- Ví dụ khung JSON-safe: <table data-damsan-p3='1'><caption>Bảng số liệu ...</caption><thead><tr><th>Năm</th><th>2020</th><th>2024</th></tr></thead><tbody><tr><th>Giá trị</th><td>...</td><td>...</td></tr></tbody></table>.",
      '- noi_dung gồm lời dẫn/yêu cầu tính toán + bảng. Không lặp lại toàn bộ số liệu của bảng thành câu văn phía trên hoặc phía dưới.',
      '- Với đúng 2 số liệu đơn giản và không có cấu trúc bảng tự nhiên, có thể trình bày trong câu văn thay vì ép thành bảng.',
      '- Mọi giá trị dùng trong quantitative.inputs phải xuất hiện rõ trong phần văn bản hoặc các ô bảng mà học sinh nhìn thấy; server còn kiểm tra nguồn gốc theo data_origin.',
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

  function evidencePreview072(question) {
    const quant = question?.quantitative;
    if (!quant || String(quant.data_origin || '').toUpperCase() !== 'TRUSTED_EXTERNAL') return '';
    const ev = quant.external_evidence;
    if (!ev || typeof ev !== 'object') return '<div class="source">Dữ liệu ngoài: thiếu evidence capsule</div>';
    const parts = [ev.source_id, ev.dataset, ev.entity, ev.period, ev.source_url].filter(Boolean).map((v) => aieEscape(String(v)));
    return `<div class="source">Dữ liệu ngoài đã khai báo: ${parts.join(' · ')}</div>`;
  }

  window.aieQuestionPreview = function aieQuestionPreview055(question, index) {
    const part = String(question?.phan || question?.Phan || '1');
    if (part !== '3' || typeof previousQuestionPreview !== 'function') {
      return typeof previousQuestionPreview === 'function'
        ? previousQuestionPreview(question, index)
        : '';
    }
    const refs = Array.isArray(question.source_refs) ? question.source_refs : [];
    return `<div class="question"><h3>Câu ${index + 1} · Phần 3</h3><div>${renderP3Stem055(question.noi_dung || question.NoiDung || '')}</div><div class="answer">Đáp án: ${aieEscape(question.dap_an_dung || question.DapAnDung || '')}</div>${question.loi_giai ? `<div class="source">Giải thích: ${aieEscape(question.loi_giai)}</div>` : ''}<div class="source">Phạm vi SGK: ${refs.length ? refs.map(aieEscape).join(', ') : 'server provenance đã kiểm định'}</div>${evidencePreview072(question)}</div>`;
  };
})();
