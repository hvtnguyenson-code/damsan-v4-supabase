const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const migration = fs.readFileSync('supabase/migrations/20261105090000_ai_exam_geography_authority_corpus_p0_097.sql','utf8');
const ui = fs.readFileSync('ai_exam_grade_authority.js','utf8');
const html = fs.readFileSync('ai_exam.html','utf8');

new vm.Script(ui, { filename:'ai_exam_grade_authority.js' });

for (const code of [
  'BGDDT_GEOGRAPHY_CURRICULUM_2018',
  'BGDDT_FORMAT_RULE_2025',
  'BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY',
  'BGDDT_OFFICIAL_EXAM_2025_GEOGRAPHY',
  'BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY'
]) {
  assert(migration.includes(code), 'P0-097 missing authority slot: ' + code);
}

assert(migration.includes("'authority_axes'"), 'P0-097 normative/calibration axes missing');
assert(migration.includes("'normative'") && migration.includes("'calibration'"), 'P0-097 authority axes incomplete');
assert(migration.includes('1F_UfWJSW04Y52Wq90YANGvHjmu9bZHBb'), 'P0-097 official Geography reference artifact locator missing');
assert(migration.includes('vqa.moet.gov.vn/vi/news/thong-bao/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-74.html'), 'P0-097 official format source locator missing');
assert(migration.includes('xaydungchinhsach.chinhphu.vn/thi-tot-nghiep-thpt-2026-de-thi-mon-dia-li'), 'P0-097 2026 government-portal benchmark locator missing');

assert(migration.includes("normalization_schema='DAMSAN_SOURCE_V2'"), 'P0-097 verification must require normalized schema');
assert(migration.includes("pipeline_status='READY'"), 'P0-097 verification must require READY pipeline');
assert(migration.includes("quality_status in ('AUTO_ACCEPTED','TEACHER_ACCEPTED','ACCEPTED')"), 'P0-097 verification must require accepted quality');
assert(migration.includes("u.is_usable is true"), 'P0-097 verification must require usable units');
assert(migration.includes("u.unit_type='ASSESSMENT_RULE'"), 'P0-097 rule unit boundary missing');
assert(migration.includes("u.unit_type='BENCHMARK_PATTERN'"), 'P0-097 benchmark unit boundary missing');
assert(migration.includes("'PARTIAL_SOURCES'"), 'P0-097 partial readiness state missing');
assert(migration.includes("'VERIFIED_SOURCES'"), 'P0-097 verified readiness state missing');
assert(migration.includes("'verified_required_source_count'"), 'P0-097 required-source readiness count missing');

assert(ui.includes("state === 'PARTIAL_SOURCES'"), 'P0-097 UI partial readiness label missing');
assert(ui.includes("match?.verified === true"), 'P0-097 UI must distinguish linked from verified');
assert(ui.includes("nguồn bắt buộc="), 'P0-097 UI required-source counter missing');
assert(ui.includes("chưa đạt điều kiện xác minh"), 'P0-097 UI linked-but-unverified state missing');
assert(html.includes('ai_exam_grade_authority.js?v=20261105-authority-p0-097'), 'P0-097 cache marker missing');

console.log('AI_GEOGRAPHY_AUTHORITY_CORPUS_P0_097_PASS');
