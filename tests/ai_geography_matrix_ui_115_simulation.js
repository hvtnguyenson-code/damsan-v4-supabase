const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('ai_exam.html','utf8');
const ui=fs.readFileSync('ai_exam_geography_matrix_111.js','utf8');

assert(html.includes('ai_exam_geography_matrix_111.js?v=20261105-matrix-resume-116'),'115 cache marker missing');
for(const id of ['geoMatrixSource115','geoMatrixCognitive115','geoMatrixCompetency115','geoMatrixPreview115','geoMatrixWarnings115']){
  assert(ui.includes(id),'115 UI target missing '+id);
}
for(const label of ['NGUỒN YCCĐ / MAPPING','PHÂN BỐ MỨC ĐỘ','PHÂN BỐ NĂNG LỰC','Preview đề:']){
  assert(ui.includes(label),'115 visible label missing '+label);
}
for(const fn of ['function commandTotals()','function competencySummary()','function sourceStats()','function warnings()','function renderOverview()']){
  assert(ui.includes(fn),'115 dashboard logic missing '+fn);
}
assert(ui.includes("CURRENT_AUTHORITY_EXACT"),'115 exact authority badge missing');
assert(ui.includes("CURRICULUM_ALIGNED_CATALOG"),'115 aligned catalog state missing');
assert(ui.includes("ACTIVE_NORMALIZED_TEXTBOOK"),'115 normalized textbook mapping visibility missing');
assert(ui.includes("mapping_confidence"),'115 mapping confidence missing');
assert(ui.includes("requirement_id"),'115 requirement id visibility missing');
assert(ui.includes("authority_revision"),'115 authority revision visibility missing');
assert(ui.includes("if(!isGeography()||strict()) return spec"),'115 must preserve STRICT isolation');
assert(!/rpc_luu_de_thi_len_phong|rpc_ai_exam_approve_and_publish|service_role|SERVICE_ROLE/.test(ui),'115 must not publish or expose privileged credentials');
assert(!ui.includes('hoc_sinh'),'115 must not couple to student runtime');
assert(ui.includes("Tỉ trọng Vận dụng đang thấp dưới 15%"),'115 apply warning missing');
assert(ui.includes("Tỉ trọng Biết đang cao trên 55%"),'115 know warning missing');
assert(ui.includes("Ma trận mới phủ một nhóm năng lực"),'115 competency warning missing');
assert(ui.includes("Tổng phân bổ chưa khớp cấu trúc"),'115 structure mismatch warning missing');
console.log('AI_GEOGRAPHY_MATRIX_UI_115_PASS');
