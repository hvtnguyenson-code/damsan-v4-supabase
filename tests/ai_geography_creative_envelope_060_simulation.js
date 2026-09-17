const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const overlay = fs.readFileSync('ai_exam_creative_envelope_060.js', 'utf8');
const html = fs.readFileSync('ai_exam.html', 'utf8');

const rigid059 = [
  'BASE',
  'PHẦN II — 059 ĐỘ SÂU NHẬN THỨC TH/VD THỰC CHẤT:',
  '- VÍ DỤ KHÔNG ĐẠT VD: Bảng cho 21,3°C và 27,1°C; lệnh “Chênh lệch nhiệt độ là 5,8°C”.',
  '- VÍ DỤ KHÔNG ĐẠT VD: “Quy Nhơn có số giờ nắng lớn hơn Lạng Sơn”.',
  '- rất nhiều luật cứng khác',
  '',
  'PHẦN III — 056 BẢNG SỐ LIỆU + ĐÁP ÁN TỐI ĐA 4 KÍ TỰ:',
  '- KEEP_056_RULE',
  '',
  'YÊU CẦU ĐẦU RA:',
  'END'
].join('\n');

const oldQuestions = [
  { phan:1, muc_do:'NB', noi_dung:'OLD STEM SHOULD NEVER BE COPIED', source_refs:['BAI_01_U1'] },
  { phan:1, muc_do:'TH', noi_dung:'OLD P1 CAUSAL STEM', source_refs:['BAI_02_U1'] },
  {
    phan:2,
    noi_dung:'OLD TABLE STEM<table><tr><td>1</td></tr></table>',
    source_refs:['BAI_02_T1'],
    statement_levels:{A:'NB',B:'TH',C:'VD',D:'TH'},
    statement_reasoning:{
      A:{operation:'direct_lookup'},
      B:{operation:'comparison'},
      C:{operation:'rate_ratio_percent'},
      D:{operation:'evidence_synthesis'}
    }
  },
  {
    phan:2,
    noi_dung:'OLD SCENARIO STEM nếu một khu vực ...',
    source_refs:['BAI_03_U2'],
    statement_levels:{A:'NB',B:'TH',C:'TH',D:'VD'},
    statement_reasoning:{
      A:{operation:'direct_lookup'},
      B:{operation:'causal_explanation'},
      C:{operation:'evidence_synthesis'},
      D:{operation:'scenario_application'}
    }
  },
  { phan:3, noi_dung:'OLD RANGE STEM', source_refs:['BAI_02_T1'], quantitative:{operation_code:'RANGE'} },
  { phan:3, noi_dung:'OLD GROWTH STEM', source_refs:['BAI_05_T1'], quantitative:{operation_code:'GROWTH_PERCENT'} }
];

const context = {
  window: { aieBuildPrompt: () => rigid059 },
  aieRequests: [
    {
      request_id:'old-request', ma_phong:'Dia_12_Test_6', status:'PUBLISHED',
      exam_spec:{grade:12,assessment_type:'TOT_NGHIEP'},
      draft:{exam_payload:{questions:oldQuestions}}
    },
    {
      request_id:'other-grade', ma_phong:'Other', status:'PUBLISHED',
      exam_spec:{grade:11,assessment_type:'TOT_NGHIEP'},
      draft:{exam_payload:{questions:oldQuestions}}
    }
  ],
  console
};
vm.createContext(context);
vm.runInContext(overlay, context);

const spec = {
  grade:12,
  assessment_type:'TOT_NGHIEP',
  teacher_requirements:'',
  assessment_standard:{id:'DIA_LI_TNTHPT_2025_PLUS_V1',version:'058'},
  knowledge_scope:{items:[{document_id:'doc1',scope_keys:['CODE:bai_01','CODE:bai_02']}]}
};

function build(id, room='Dia_12_Test_7', localSpec=spec) {
  return context.window.aieBuildPrompt({request:{request_id:id,ma_phong:room,exam_spec:localSpec}}, [], localSpec);
}

const promptA = build('request-060-A');
const promptA2 = build('request-060-A');
const promptB = build('request-060-B');

assert(promptA.includes('KHUNG SÁNG TẠO CÓ KIỂM SOÁT — 060'), '060 creative envelope missing');
assert(!promptA.includes('PHẦN II — 059 ĐỘ SÂU NHẬN THỨC'), 'rigid 059 authoring block must be replaced');
assert(!promptA.includes('21,3°C'), 'concrete 059 number example must not anchor production prompt');
assert(!promptA.includes('Quy Nhơn có số giờ nắng'), 'concrete 059 place-name example must not anchor production prompt');
assert(promptA.includes('HARD INVARIANTS không được nới'), 'hard grounding/schema invariants must remain explicit');
assert(promptA.includes('Được phép dựng tình huống giả định mới'), 'controlled scenario creativity missing');
assert(promptA.includes('không biến tình huống giả định thành một sự thật mới'), 'hypothetical safety boundary missing');
assert(promptA.includes('Tạo nhiều ứng viên hơn số câu cần dùng'), 'private candidate-bank planning missing');
assert(promptA.includes('khoảng 4-5 NB, 8-9 TH và 4-6 VD'), 'default P1 differentiation target missing');
assert(promptA.includes('ít nhất 3 họ thao tác VD khác nhau'), 'Part II operation diversity target missing');
assert(promptA.includes('không mặc định VD = tính phần trăm'), 'Part II anti-template instruction missing');
assert(promptA.includes('RECENT DESIGN FINGERPRINTS'), 'recent design anti-repeat context missing');
assert(promptA.includes('Dia_12_Test_6:'), 'matching recent exam fingerprint missing');
assert(promptA.includes('rate_ratio_percent'), 'recent Part II operation fingerprint missing');
assert(promptA.includes('scenario_application'), 'recent scenario operation fingerprint missing');
assert(promptA.includes('P3 ops=RANGE,GROWTH_PERCENT'), 'recent Part III operation fingerprint missing');
assert(!promptA.includes('OLD STEM SHOULD NEVER BE COPIED'), 'recent raw stem leaked into prompt');
assert(!promptA.includes('OLD TABLE STEM'), 'recent Part II raw stem leaked into prompt');
assert(!promptA.includes('other-grade'), 'different-grade history must not enter fingerprints');
assert(promptA.includes('PHẦN III — 056'), '060 must preserve Part III 056 block');
assert(promptA.includes('KEEP_056_RULE'), '060 must preserve Part III rules verbatim');
assert(promptA.includes('YÊU CẦU ĐẦU RA:'), 'output contract marker missing');

const keyA = promptA.match(/variation_key=(V[A-Z0-9]+)/)?.[1];
const keyA2 = promptA2.match(/variation_key=(V[A-Z0-9]+)/)?.[1];
const keyB = promptB.match(/variation_key=(V[A-Z0-9]+)/)?.[1];
assert(keyA && keyA2 && keyB, 'variation key missing');
assert.strictEqual(keyA, keyA2, 'same request must yield stable variation key');
assert.notStrictEqual(keyA, keyB, 'different request must yield different variation key');

const teacherSpec = {...spec, teacher_requirements:'NB 40%, TH 30%, VD 30%'};
const teacherPrompt = build('request-teacher', 'TeacherMix', teacherSpec);
assert(teacherPrompt.includes('giáo viên đã nêu yêu cầu riêng'), 'teacher cognitive distribution must override default target');
assert(!teacherPrompt.includes('khoảng 4-5 NB, 8-9 TH và 4-6 VD'), 'default mix must not compete with explicit teacher mix');

const otherSpec = {grade:12,assessment_type:'TOT_NGHIEP',assessment_standard:{id:'OTHER_STANDARD'}};
const otherPrompt = build('request-other','Other',otherSpec);
assert.strictEqual(otherPrompt, rigid059, '060 must not alter non-target standards');

assert(html.includes('ai_exam_creative_envelope_060.js?v=20260917-creative-envelope-060'), '060 overlay cache marker missing from HTML');
assert(html.indexOf('ai_exam_part3_presentation_055.js') < html.indexOf('ai_exam_creative_envelope_060.js'), '060 must wrap the final Part III prompt builder');
assert(html.indexOf('ai_exam_creative_envelope_060.js') < html.indexOf('ai_exam_quality_review_053.js'), '060 must load before quality review UI');

console.log('PASS ai_geography_creative_envelope_060_simulation');
