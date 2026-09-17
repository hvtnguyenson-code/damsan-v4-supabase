const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const overlay = fs.readFileSync('ai_exam_part2_quality_054.js', 'utf8');
const html = fs.readFileSync('ai_exam.html', 'utf8');
const migration054 = fs.readFileSync('supabase/migrations/20260916210500_geography_part2_cognitive_blueprint_054.sql', 'utf8');
const migration058 = fs.readFileSync('supabase/migrations/20260917153500_geography_part2_cognitive_depth_058.sql', 'utf8');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function stripTags(value) { return String(value || '').replace(/<[^>]*>/g, ''); }
class FakeCell {
  constructor(tagName, body) { this.tagName = tagName.toUpperCase(); this.textContent = stripTags(body); }
}
class FakeRow {
  constructor(body) { this.body = body; }
  querySelectorAll(selector) {
    assert.strictEqual(selector, 'th,td');
    const cells = [];
    const re = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(this.body)) !== null) cells.push(new FakeCell(m[1], m[2]));
    return cells;
  }
}
class FakeTable {
  constructor(body) { this.body = body; }
  querySelector(selector) {
    if (selector !== 'caption') return null;
    const m = this.body.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i);
    return m ? { textContent: stripTags(m[1]) } : null;
  }
  querySelectorAll(selector) {
    assert.strictEqual(selector, 'tr');
    const rows = [];
    const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = re.exec(this.body)) !== null) rows.push(new FakeRow(m[1]));
    return rows;
  }
}
class FakeDocument {
  constructor(body) { this.body = body; }
  querySelector(selector) {
    if (selector !== 'table') return null;
    const m = this.body.match(/<table\b[^>]*>[\s\S]*?<\/table>/i);
    return m ? new FakeTable(m[0]) : null;
  }
}
class FakeDOMParser { parseFromString(body) { return new FakeDocument(body); } }

const basePrompt = [
  'BASE PROMPT',
  'Mỗi question: phan, noi_dung, A, B, C, D, dap_an_dung, loi_giai, source_refs, muc_do, bai_hoc. Phần III thêm quantitative theo contract 053.',
  '',
  'YÊU CẦU ĐẦU RA:',
  'END'
].join('\n');

const context = {
  window: {
    aieBuildPrompt: () => basePrompt,
    aieQuestionPreview: (question, index) => {
      const part = String(question.phan || question.Phan || '1');
      if (part === '3') return `<div class="question">P3_SENTINEL_${index}</div>`;
      const options = ['A','B','C','D'].map((key) => `<div class="option"><strong>${key}.</strong> ${escapeHtml(question[key] ?? '')}</div>`).join('');
      return `<div class="question"><h3>Câu ${index + 1} · Phần ${escapeHtml(part)}</h3><div>${escapeHtml(question.noi_dung || question.NoiDung || '')}</div>${options}<div class="answer">Đáp án: ${escapeHtml(question.dap_an_dung || question.DapAnDung || '')}</div></div>`;
    }
  },
  DOMParser: FakeDOMParser,
  aieEscape: escapeHtml,
  console
};
vm.createContext(context);
vm.runInContext(overlay, context);

const spec = { assessment_standard: { id: 'DIA_LI_TNTHPT_2025_PLUS_V1', version: '058' } };
const prompt = context.window.aieBuildPrompt({ request: { exam_spec: spec } }, [], spec);

assert(prompt.includes('PHẦN II — 059 ĐỘ SÂU NHẬN THỨC TH/VD THỰC CHẤT'), '059 Part II depth block missing');
assert(prompt.includes('ít nhất 01 lệnh THỰC CHẤT ở mức TH'), '059 must require genuine TH per cluster');
assert(prompt.includes('ít nhất 01 lệnh THỰC CHẤT ở mức VD'), '059 must require genuine VD per cluster');
assert(prompt.includes('Chênh lệch nhiệt độ là 5,8°C'), '059 must explicitly reject the observed shallow difference pattern as VD');
assert(prompt.includes('Quy Nhơn có số giờ nắng lớn hơn Lạng Sơn'), '059 must explicitly reject two-cell comparison as VD');
assert(prompt.includes('CẤM kiểu VD giả'), '059 must forbid one-step arithmetic dressed up as VD');
assert(prompt.includes('tự làm thử từng lệnh như học sinh'), '059 must require cognitive self-audit');
assert(prompt.includes('statement_reasoning'), '059 statement reasoning contract missing');
assert(prompt.includes('reasoning_steps>=2'), '059 VD minimum reasoning steps missing');
assert(prompt.includes('derived_quantity=true hoặc transfer_context=true'), '059 VD derived/transfer requirement missing');
assert(prompt.includes('Phần II thêm statement_levels và statement_reasoning'), '059 output schema extension missing');
assert(prompt.includes('chỉ dùng HTML ngữ nghĩa tối giản'), '059 Part II table authoring contract missing');

assert(html.includes('ai_exam_part2_quality_054.js?v=20260917-part2-final-059'), '059 Part II overlay cache marker is not loaded');
assert(html.indexOf('ai_exam_validation_architecture_053.js') < html.indexOf('ai_exam_part2_quality_054.js'), 'Part II overlay must wrap final 053 prompt builder');
assert(html.indexOf('ai_exam_part2_quality_054.js') < html.indexOf('ai_exam_part3_presentation_055.js'), 'Part III overlay must still load after Part II overlay');

assert(migration054.includes('statement_levels_required'), '054 base statement-level gate must remain in history');
assert(migration058.includes("profile_version='058'"), '058 profile version sync missing');
assert(migration058.includes('required_levels_per_cluster'), '058 TH/VD requirement missing from authority profile');
assert(migration058.includes('statement_reasoning_required'), '058 reasoning metadata requirement missing');
assert(migration058.includes('quality_part2_th_required'), '058 server must reject clusters without TH');
assert(migration058.includes('quality_part2_vd_required'), '058 server must reject clusters without VD');
assert(migration058.includes('quality_part2_th_too_shallow'), '058 server must reject shallow TH');
assert(migration058.includes('quality_part2_vd_too_shallow'), '058 server must reject shallow VD');
assert(migration058.includes("'multi_step_calculation','rate_ratio_percent','index_normalization','evidence_synthesis'"), '058 VD operation allowlist missing');
assert(migration058.includes('v_evidence<2 or v_steps<2'), '058 VD minimum evidence/steps gate missing');
assert(migration058.includes('(not v_derived and not v_transfer)'), '058 VD derived/transfer gate missing');
assert(!migration058.includes('option_length'), '058 must not import Part I option-length balancing into Part II');

const q19 = {
  phan: 2,
  noi_dung: 'Cho bảng số liệu sau:<table><caption>Nhiệt độ trung bình năm và tổng số giờ nắng năm ở một số trạm khí tượng</caption><thead><tr><th>Trạm</th><th>Nhiệt độ (°C)</th><th>Số giờ nắng (giờ)</th></tr></thead><tbody><tr><th>Lạng Sơn</th><td>21,3</td><td>1 561</td></tr><tr><th>Quy Nhơn</th><td>27,1</td><td>2 445</td></tr></tbody></table>Xác định đúng/sai cho các nhận định sau:',
  A: 'Lạng Sơn có nhiệt độ trung bình năm 21,3°C.',
  B: 'Quy Nhơn có số giờ nắng lớn hơn Lạng Sơn.',
  C: 'Một nhận định vận dụng thực chất.',
  D: 'Một nhận định thông hiểu.',
  dap_an_dung: 'Đ-Đ-S-Đ',
  statement_levels: { A:'NB', B:'TH', C:'VD', D:'TH' }
};
const out19 = context.window.aieQuestionPreview(q19, 18);
assert(out19.includes('<table style="border-collapse:collapse;width:100%;font-size:13px">'), 'Part II table was not reconstructed as real HTML');
assert(!out19.includes('&lt;table'), 'Part II table is still escaped as raw markup');
assert(out19.includes('Nhiệt độ trung bình năm và tổng số giờ nắng năm ở một số trạm khí tượng'), 'Part II table caption missing');
assert(out19.includes('2 445'), 'Part II table cell missing');
assert(out19.includes('Xác định đúng/sai cho các nhận định sau:'), 'Part II text after table missing');
assert(out19.includes('Mức độ từng lệnh:'), 'statement-level badge must be preserved');
assert(out19.includes('A: NB · B: TH · C: VD · D: TH'), 'statement-level labels must be preserved');
assert(out19.includes('Đáp án: Đ-Đ-S-Đ'), 'Part II answer block missing');

const plain = context.window.aieQuestionPreview({ phan:2, noi_dung:'Đọc thông tin: khí hậu < 25°C.', dap_an_dung:'Đ-S-S-Đ', statement_levels:{A:'NB',B:'TH',C:'TH',D:'VD'} }, 0);
assert(plain.includes('khí hậu &lt; 25°C.'), 'plain Part II text must remain escaped');
assert(!plain.includes('<table'), 'plain Part II item must not invent a table');

const unsafe = context.window.aieQuestionPreview({
  phan:2,
  noi_dung:'Trước<table><caption><b>Bảng</b></caption><tbody><tr><td><img src=x onerror="PWNED=1">21,3<script>PWNED=1</script></td></tr></tbody></table>Sau',
  dap_an_dung:'Đ-S-Đ-S', statement_levels:{A:'NB',B:'TH',C:'VD',D:'TH'}
}, 1);
assert(!unsafe.includes('<script'), 'script markup must not survive Part II table reconstruction');
assert(!unsafe.includes('<img'), 'image markup must not survive Part II table reconstruction');
assert(!unsafe.includes('onerror='), 'event-handler attributes must not survive Part II table reconstruction');
assert(unsafe.includes('21,3PWNED=1'), 'cell text should survive only as inert text');

const malformed = context.window.aieQuestionPreview({ phan:2, noi_dung:'Dữ liệu <table><tr><td>1</td></tr> thiếu đóng bảng', dap_an_dung:'Đ-S-Đ-S' }, 2);
assert(malformed.includes('&lt;table&gt;'), 'malformed table source must fall back to escaped text');

const p3 = context.window.aieQuestionPreview({ phan:3, noi_dung:'<table data-damsan-p3=\'1\'></table>' }, 4);
assert.strictEqual(p3, '<div class="question">P3_SENTINEL_4</div>', 'Part III preview must delegate unchanged to the next renderer');

console.log('PASS ai_geography_part2_final_059_simulation');
