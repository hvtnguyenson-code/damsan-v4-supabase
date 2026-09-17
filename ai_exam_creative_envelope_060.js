// 060 — Controlled creative envelope for grounded Geography exam generation.
// Keeps deterministic/server-verifiable invariants, but removes prompt anchoring to concrete examples
// and asks the model to diversify cognitive operations, stimuli and recent design patterns.
(function () {
  'use strict';

  const STANDARD_ID = 'DIA_LI_TNTHPT_2025_PLUS_V1';
  const previousBuildPrompt = window.aieBuildPrompt;

  function specFrom(input, localSpec) {
    const remote = input && input.request && input.request.exam_spec;
    return remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : localSpec;
  }

  function hash32(value) {
    let h = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(-7);
  }

  function variationKey(input, spec) {
    const request = input?.request || {};
    const basis = [
      request.request_id || request.id || '',
      request.ma_phong || '',
      spec?.grade || '',
      spec?.assessment_type || '',
      JSON.stringify(spec?.knowledge_scope || {})
    ].join('|');
    return `V${hash32(basis)}`;
  }

  function stimulusFamily(question) {
    const stem = String(question?.noi_dung || question?.NoiDung || '');
    if (/<table\b/i.test(stem)) return 'table';
    if (/nếu |giả sử|tình huống|một .* muốn|một .* đang|trong trường hợp/i.test(stem)) return 'scenario';
    if (/đọc thông tin|cho thông tin|thông tin sau/i.test(stem)) return 'text-stimulus';
    return 'direct-text';
  }

  function p1Summary(questions) {
    const counts = { NB: 0, TH: 0, VD: 0, OTHER: 0 };
    const sources = new Set();
    for (const q of questions.filter((item) => String(item?.phan || item?.Phan || '') === '1')) {
      const level = String(q?.muc_do || '').toUpperCase();
      if (Object.prototype.hasOwnProperty.call(counts, level)) counts[level] += 1;
      else counts.OTHER += 1;
      for (const ref of Array.isArray(q?.source_refs) ? q.source_refs : []) sources.add(String(ref));
    }
    const countText = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(',');
    return countText ? `P1 levels=${countText}; source-spread=${sources.size}` : '';
  }

  function p2Summary(questions) {
    const rows = [];
    for (const q of questions.filter((item) => String(item?.phan || item?.Phan || '') === '2').slice(0, 4)) {
      const reasoning = q?.statement_reasoning && typeof q.statement_reasoning === 'object' ? q.statement_reasoning : {};
      const ops = ['A','B','C','D'].map((k) => String(reasoning?.[k]?.operation || '')).filter(Boolean);
      const levels = ['A','B','C','D'].map((k) => String(q?.statement_levels?.[k] || '')).filter(Boolean);
      const refs = (Array.isArray(q?.source_refs) ? q.source_refs : []).slice(0, 3).map(String);
      rows.push(`${stimulusFamily(q)}|src=${refs.join('+') || '-'}|levels=${levels.join('/') || '-'}|ops=${ops.join('/') || '-'}`);
    }
    return rows.length ? `P2 ${rows.join(' ; ')}` : '';
  }

  function p3Summary(questions) {
    const ops = [];
    for (const q of questions.filter((item) => String(item?.phan || item?.Phan || '') === '3')) {
      const op = String(q?.quantitative?.operation_code || '');
      if (op) ops.push(op);
    }
    return ops.length ? `P3 ops=${ops.join(',')}` : '';
  }

  function recentDesignFingerprints(input, spec) {
    let requests = [];
    try {
      requests = typeof aieRequests !== 'undefined' && Array.isArray(aieRequests) ? aieRequests : [];
    } catch {
      requests = [];
    }
    const currentId = String(input?.request?.request_id || input?.request?.id || '');
    const targetGrade = Number(spec?.grade || 0);
    const targetType = String(spec?.assessment_type || '');
    const selected = requests.filter((r) => {
      if (!r || String(r.request_id || '') === currentId) return false;
      if (!['READY_FOR_REVIEW','PUBLISHED'].includes(String(r.status || ''))) return false;
      if (!r.draft?.exam_payload || !Array.isArray(r.draft.exam_payload.questions)) return false;
      if (targetGrade && Number(r.exam_spec?.grade || 0) && Number(r.exam_spec.grade) !== targetGrade) return false;
      if (targetType && r.exam_spec?.assessment_type && String(r.exam_spec.assessment_type) !== targetType) return false;
      return true;
    }).slice(0, 3);

    return selected.map((r) => {
      const questions = r.draft.exam_payload.questions;
      const parts = [p1Summary(questions), p2Summary(questions), p3Summary(questions)].filter(Boolean);
      return `${String(r.ma_phong || r.request_id || 'recent')}: ${parts.join(' | ')}`;
    });
  }

  function hasTeacherCognitiveDistribution(spec) {
    const text = String(spec?.teacher_requirements || '');
    return /(NB|nhận biết).{0,20}%|%\s*(NB|nhận biết)|(TH|thông hiểu).{0,20}%|%\s*(TH|thông hiểu)|(VD|vận dụng).{0,20}%|%\s*(VD|vận dụng)/i.test(text);
  }

  function creativeBlock(input, spec) {
    const key = variationKey(input, spec);
    const recent = recentDesignFingerprints(input, spec);
    const teacherHasMix = hasTeacherCognitiveDistribution(spec);
    const lines = [
      '',
      'KHUNG SÁNG TẠO CÓ KIỂM SOÁT — 060:',
      `- variation_key=${key}. Dùng khóa này để chọn một phương án thiết kế khác với các lần tạo khác; KHÔNG xuất variation_key vào JSON.`,
      '- Mục tiêu kép: (1) tuyệt đối đúng kiến thức/nguồn/định dạng có thể kiểm chứng; (2) đề tự nhiên, có phân hóa và không lặp máy móc cùng một khuôn câu.',
      '- HARD INVARIANTS không được nới: chỉ dùng KNOWLEDGE PACKAGE đã chọn; source_refs phải có thật; giữ đúng schema/số câu; đáp án phải tự kiểm tra; Part II phải có TH thật + VD thật cùng statement_levels/statement_reasoning hợp lệ; Part III phải giữ quantitative để server tính lại.',
      '- Ngoài các hard invariants trên, KHÔNG coi những ví dụ minh họa, cách mở câu, thứ tự thao tác hay một công thức cụ thể là mẫu bắt buộc phải lặp lại.',
      '- Được phép kết hợp nhiều knowledge_units trong phạm vi đã chọn để tạo câu hỏi tổng hợp, miễn từng kết luận cần để chấm đều truy nguyên được về source_refs.',
      '- Được phép dựng tình huống giả định mới để vận dụng. Mọi tiền đề giả định phải được nêu rõ ngay trong stimulus; không biến tình huống giả định thành một sự thật mới về Việt Nam hoặc địa phương.',
      '- Không chép nguyên câu nguồn thành câu hỏi nếu có thể kiểm tra cùng kiến thức bằng quan hệ, so sánh, nguyên nhân-kết quả, lựa chọn quyết định hoặc bối cảnh mới.',
      '- Trước khi viết JSON, lập kế hoạch nội bộ cho toàn đề: source -> stimulus family -> cognitive operation -> mức độ. Không xuất kế hoạch này.',
      '- Tạo nhiều ứng viên hơn số câu cần dùng rồi chọn bộ câu có độ phủ và độ phân hóa tốt nhất; tránh để nhiều câu liên tiếp kiểm tra cùng một thao tác nhận thức.',
      '- Với Phần I, ưu tiên distractor cùng trường nghĩa và có sức nhiễu; VD phải đòi hỏi áp dụng/ra quyết định/tổng hợp quan hệ chứ không chỉ nhớ lại một fact.',
      teacherHasMix
        ? '- Phân bố NB/TH/VD của Phần I: giáo viên đã nêu yêu cầu riêng trong teacher_requirements, phải ưu tiên yêu cầu đó.'
        : '- Nếu giáo viên không nêu tỉ lệ nhận thức riêng, dùng định hướng mềm cho 18 câu Phần I khoảng 4-5 NB, 8-9 TH và 4-6 VD; không cần ép đúng tuyệt đối nếu phạm vi kiến thức không phù hợp.',
      '- Với 4 cụm Phần II, vẫn giữ tối thiểu một TH thật và một VD thật mỗi cụm. Khi nguồn cho phép, dùng ít nhất 3 họ thao tác VD khác nhau trong toàn Phần II và không để một họ thao tác VD chiếm quá 2 cụm.',
      '- Với bảng số liệu, không mặc định VD = tính phần trăm. Có thể dùng tổng hợp xu hướng, chỉ số dẫn xuất, quan hệ không gian/nhân quả, kiểm chứng kết luận hoặc tình huống chuyển giao nếu nguồn hỗ trợ.',
      '- Với Phần III, giữ contract 056 và server-canonical; đồng thời ưu tiên đa dạng operation_code và tránh tái dùng cùng dữ liệu chỉ để hỏi một phép tính gần như tương đương.',
      '- Tự rà soát cuối: nếu hai câu có thể giải bằng cùng một khuôn thao tác chỉ thay số/địa danh thì viết lại ít nhất một câu, trừ khi teacher_requirements yêu cầu lặp dạng.',
    ];
    if (recent.length) {
      lines.push(
        '',
        'RECENT DESIGN FINGERPRINTS — CHỈ DÙNG ĐỂ TRÁNH LẶP KHUÔN, KHÔNG PHẢI NGUỒN KIẾN THỨC:',
        '- Các fingerprint dưới đây không chứa stem/đáp án cũ. Khi có phương án hợp lệ khác, tránh lặp cùng tổ hợp source + stimulus family + operation.',
        ...recent.map((item) => `- ${item}`)
      );
    }
    lines.push('');
    return lines.join('\n');
  }

  function replaceRigidPart2Block(prompt, block) {
    const header = '\nPHẦN II — 059 ĐỘ SÂU NHẬN THỨC TH/VD THỰC CHẤT:';
    const start = prompt.indexOf(header);
    if (start < 0) {
      const marker = '\nYÊU CẦU ĐẦU RA:';
      return prompt.includes(marker) ? prompt.replace(marker, `${block}${marker}`) : `${prompt}${block}`;
    }
    const candidateEnds = [
      prompt.indexOf('\nPHẦN III — 056', start + header.length),
      prompt.indexOf('\nYÊU CẦU ĐẦU RA:', start + header.length)
    ].filter((n) => n >= 0);
    const end = candidateEnds.length ? Math.min(...candidateEnds) : prompt.length;
    return `${prompt.slice(0, start)}${block}${prompt.slice(end)}`;
  }

  window.aieBuildPrompt = function aieBuildPrompt060(input, units, localSpec) {
    const prompt = previousBuildPrompt(input, units, localSpec);
    const spec = specFrom(input, localSpec);
    if (!spec?.assessment_standard || spec.assessment_standard.id !== STANDARD_ID) return prompt;
    return replaceRigidPart2Block(prompt, creativeBlock(input, spec));
  };
})();
