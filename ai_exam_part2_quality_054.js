// 059 — Geography Part II cognitive-depth + safe table-preview overlay.
// Strengthens 058 authoring depth and renders semantic Part II tables without exposing raw HTML.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  const previousBuildPrompt = window.aieBuildPrompt;
  const previousQuestionPreview = window.aieQuestionPreview;

  function specFrom(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  window.aieBuildPrompt = function aieBuildPrompt059(input, units, localSpec) {
    const prompt = previousBuildPrompt(input, units, localSpec);
    const spec = specFrom(input, localSpec);
    if (!spec?.assessment_standard || spec.assessment_standard.id !== STANDARD_ID) return prompt;

    const part2Rules = [
      '',
      'PHẦN II — 059 ĐỘ SÂU NHẬN THỨC TH/VD THỰC CHẤT:',
      '- Quy tắc 059 này ƯU TIÊN hơn mọi mô tả Part II cũ nếu có khác biệt.',
      '- Mỗi câu Phần II là MỘT stimulus chung và đúng bốn lệnh/nhận định A/B/C/D; A/B/C/D không phải bốn phương án chọn của Phần I.',
      '- Độ dài A/B/C/D được phép khác nhau tự nhiên theo yêu cầu nhận thức. KHÔNG cân bằng độ dài như Phần I và không rút các lệnh về cùng một khuôn câu ngắn.',
      '- Bốn lệnh phải tương đối độc lập; không để đáp án của lệnh trước tiết lộ trực tiếp lệnh sau. Mẫu Đ/S không được cả bốn cùng Đ hoặc cả bốn cùng S.',
      '- Stimulus không được phát biểu sẵn bốn kết luận rồi A/B/C/D chỉ đổi vài từ. Học sinh phải thực sự xử lí dữ kiện/kiến thức để quyết định đúng sai.',
      '- Mỗi cụm BẮT BUỘC có ít nhất 01 lệnh THỰC CHẤT ở mức TH và ít nhất 01 lệnh THỰC CHẤT ở mức VD. Không được chỉ đổi nhãn statement_levels để tạo cảm giác phân hóa.',
      '- NB: trả lời bằng cách đọc/nhận ra trực tiếp một sự kiện, khái niệm, ô số liệu hoặc quan hệ đã hiển thị; không cần biến đổi dữ kiện.',
      '- TH: phải xử lí ít nhất hai dữ kiện hoặc một quan hệ; có thể so sánh, nhận xét xu hướng, giải thích quan hệ, suy luận một bước hoặc tính trực tiếp một bước. TH không được chỉ chép lại một ô số liệu.',
      '- VD: phải áp dụng kiến thức/quy tắc vào KẾT QUẢ DẪN XUẤT hoặc TÌNH HUỐNG KHÔNG ĐƯỢC PHÁT BIỂU SẴN; cần ít nhất hai bước xử lí/suy luận và ít nhất hai dữ kiện liên quan.',
      '- CẤM gắn VD cho: đọc trực tiếp số liệu; chọn giá trị lớn/nhỏ nhất; so sánh hai số đã cho; cộng/trừ trực tiếp một lần; tính chênh lệch đơn giản; hoặc kiểm tra mệnh đề chỉ bằng một hay hai ô của bảng. Các dạng này tối đa là TH.',
      '- CẤM kiểu VD giả: làm một phép tính rồi lặp lại chính kết quả đó trong nhận định mà không cần diễn giải địa lí, không tổng hợp thêm dữ kiện và không áp dụng quan hệ nào.',
      '- Một VD hợp lệ phải thuộc ít nhất một kiểu: (1) tính tỉ lệ/tốc độ/chỉ số rồi dùng kết quả để đánh giá một nhận định; (2) tính từ ít nhất hai bước rồi so với một ngưỡng/quan hệ khác; (3) tổng hợp từ nhiều dữ kiện để kiểm chứng một kết luận; (4) vận dụng quan hệ nhân quả/không gian vào tình huống mới nhưng vẫn chỉ dùng kiến thức trong knowledge_units.',
      '- Với bảng số liệu, ưu tiên cấu trúc 01 NB + 01-02 TH + 01 VD thật. Lệnh VD phải khiến học sinh tạo ít nhất một đại lượng trung gian/kết quả dẫn xuất rồi mới kết luận, hoặc kết hợp số liệu với một quan hệ địa lí từ nguồn.',
      '- VÍ DỤ KHÔNG ĐẠT VD: Bảng cho 21,3°C và 27,1°C; lệnh “Chênh lệch nhiệt độ là 5,8°C”. Đây chỉ là một phép trừ trực tiếp => tối đa TH.',
      '- VÍ DỤ KHÔNG ĐẠT VD: “Quy Nhơn có số giờ nắng lớn hơn Lạng Sơn”. Chỉ cần đọc hai ô và so sánh => TH, không phải VD.',
      '- VÍ DỤ ĐẠT VD VỀ DẠNG TƯ DUY: học sinh phải tính một tỉ lệ/tốc độ/chỉ số từ số liệu, sau đó dùng kết quả đó cùng một dữ kiện/quan hệ khác để xác định nhận định đúng hay sai. Không sao chép số liệu hay nội dung của ví dụ này nếu nguồn không có.',
      '- VÍ DỤ ĐẠT VD VỀ DẠNG TƯ DUY: từ nhiều mốc thời gian/đối tượng, học sinh phải tổng hợp xu hướng hoặc tạo đại lượng dẫn xuất rồi vận dụng kiến thức nguồn để giải thích/đánh giá một kết luận mới.',
      '- Trước khi xuất JSON, tự làm thử từng lệnh như học sinh. Nếu chỉ cần nhìn một ô, nhìn hai ô rồi so sánh, hoặc làm đúng một phép cộng/trừ là xong thì KHÔNG được ghi VD và phải viết lại lệnh.',
      '- Mỗi câu Phần II BẮT BUỘC có statement_levels dạng {"A":"NB|TH|VD","B":"NB|TH|VD","C":"NB|TH|VD","D":"NB|TH|VD"}. muc_do cấp câu bằng mức cao nhất xuất hiện.',
      '- Mỗi câu Phần II BẮT BUỘC có statement_reasoning cho A/B/C/D. Mỗi entry có đúng các trường: operation, evidence_count, reasoning_steps, derived_quantity, transfer_context.',
      '- operation chỉ dùng: direct_lookup, comparison, trend_interpretation, simple_calculation, causal_explanation, multi_step_calculation, rate_ratio_percent, index_normalization, evidence_synthesis, scenario_application, causal_application.',
      '- Với TH: operation không được direct_lookup; evidence_count>=2 hoặc reasoning_steps>=2.',
      '- Với VD: operation phải là multi_step_calculation, rate_ratio_percent, index_normalization, evidence_synthesis, scenario_application hoặc causal_application; evidence_count>=2; reasoning_steps>=2; đồng thời derived_quantity=true hoặc transfer_context=true.',
      '- statement_reasoning phải mô tả đúng thao tác thật sự cần để giải lệnh. CẤM khai metadata sâu hơn nội dung chỉ để vượt kiểm định.',
      '- Nếu stimulus dùng bảng, chỉ dùng HTML ngữ nghĩa tối giản trong noi_dung: table, caption, thead, tbody, tr, th, td; không style/script/iframe/form/phần tử tương tác.',
      '- Trước khi trả kết quả, kiểm tra lại riêng 4 câu Phần II: mỗi cụm phải có TH thật + VD thật; nếu chưa đạt thì tự viết lại trước khi xuất JSON.',
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

  function renderTable059(tableHtml) {
    try {
      const parsed = new DOMParser().parseFromString(String(tableHtml || ''), 'text/html');
      const table = parsed.querySelector('table');
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
      return `<div class="aie-data-table" style="overflow-x:auto;margin:10px 0">${caption ? `<div style="font-weight:700;text-align:center;margin-bottom:6px">${esc(caption)}</div>` : ''}<table style="border-collapse:collapse;width:100%;font-size:13px"><tbody>${rows.map((row) => `<tr>${row.map((cell) => cell.header ? `<th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc">${esc(cell.value)}</th>` : `<td style="border:1px solid #cbd5e1;padding:6px">${esc(cell.value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } catch {
      return '';
    }
  }

  function renderP2Stem059(rawValue) {
    const raw = String(rawValue || '');
    const tablePattern = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
    let cursor = 0;
    let out = '';
    let matched = false;
    let match;
    while ((match = tablePattern.exec(raw)) !== null) {
      matched = true;
      out += aieEscape(raw.slice(cursor, match.index));
      const rendered = renderTable059(match[0]);
      out += rendered || aieEscape(match[0]);
      cursor = match.index + match[0].length;
    }
    if (!matched) return aieEscape(raw);
    out += aieEscape(raw.slice(cursor));
    return out;
  }

  if (typeof previousQuestionPreview === 'function') {
    window.aieQuestionPreview = function aieQuestionPreview059(question, index) {
      const part = String(question?.phan || question?.Phan || '1');
      if (part !== '2') return previousQuestionPreview(question, index);

      const levels = question?.statement_levels;
      const rawStem = question?.noi_dung || question?.NoiDung || '';
      const token = `__DAMSAN_P2_STEM_059_${Number(index) || 0}__`;
      const previewQuestion = { ...question, noi_dung: token, NoiDung: token };
      let html = previousQuestionPreview(previewQuestion, index);
      const renderedStem = renderP2Stem059(rawStem);
      if (html.includes(token)) html = html.replace(token, renderedStem);

      if (levels && typeof levels === 'object' && !Array.isArray(levels)) {
        const labels = ['A','B','C','D'].map((key) => {
          const value = String(levels[key] || '').toUpperCase();
          return `${key}: ${aieEscape(value || '?')}`;
        }).join(' · ');
        const marker = '<div class="answer">';
        const badge = `<div class="source"><strong>Mức độ từng lệnh:</strong> ${labels}</div>`;
        html = html.includes(marker) ? html.replace(marker, `${badge}${marker}`) : `${html}${badge}`;
      }
      return html;
    };
  }
})();
