const fs=require('fs');
const prompt=fs.readFileSync('ai_exam_part3_presentation_055.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260929154500_ai_exam_part3_authentic_data_071.sql','utf8');
function must(value,message){if(!value)throw new Error(message);}

// Prompt contract: official-style short-answer tasks must use authentic, cited data.
must(/DỮ LIỆU THẬT \+ LỆNH HỎI THEO MẪU TNTHPT/.test(prompt),'071-01 authentic-data prompt heading missing');
must(/TUYỆT ĐỐI KHÔNG tự đặt số liệu/.test(prompt),'071-02 prompt must ban invented numbers');
must(/quantitative\.inputs phải xuất hiện về mặt số học trong ít nhất một knowledge_unit/.test(prompt),'071-03 inputs must be bound to cited units');
must(/INSUFFICIENT_AUTHENTIC_QUANTITATIVE_DATA/.test(prompt),'071-04 insufficient authentic data must block instead of fabricate');
must(/Căn cứ vào bảng số liệu trên, hãy cho biết/.test(prompt),'071-05 official-style table command missing');
must(/không tự bổ sung nguồn ngoài gói/.test(prompt),'071-06 model must not invent external provenance');
must(/giả định/.test(prompt)&&/mô phỏng/.test(prompt)&&/lãnh thổ A\/B/.test(prompt),'071-07 common fabricated-data patterns must be explicitly forbidden');

// Server profile and hard gate.
must(/'\"071\"'::jsonb/.test(migration),'071-08 assessment standard version 071 missing');
must(/"authentic_source_data_required":true/.test(migration),'071-09 authentic data standard flag missing');
must(/"inputs_must_exist_in_cited_units":true/.test(migration),'071-10 cited-input standard flag missing');
must(/"insufficient_authentic_data_policy":"BLOCK_GENERATION_DO_NOT_INVENT"/.test(migration),'071-11 insufficient-data policy missing');
must(/create or replace function public\._ai_exam_number_grounded_071/.test(migration),'071-12 numeric provenance helper missing');
must(/ku\.document_id=kd\.id/.test(migration)&&/ku\.revision=kd\.active_revision/.test(migration)&&/ku\.is_usable is true/.test(migration),'071-13 provenance must resolve only active usable request-bound units');
must(/ref\.unit_key=ku\.unit_key/.test(migration),'071-14 provenance must be restricted to source_refs');
must(/quality_part3_hypothetical_data_forbidden/.test(migration),'071-15 hypothetical-data hard gate missing');
must(/quality_part3_input_not_grounded_in_source/.test(migration),'071-16 ungrounded-input hard gate missing');
must(/ungrounded_inputs/.test(migration),'071-17 diagnostics must expose offending raw inputs');
must(/_ai_exam_quality_gate_071_base/.test(migration),'071-18 previous 064 quality gate must be preserved as base');
must(/quality_gate_version','071/.test(migration),'071-19 gate version 071 missing');
must(!/drop\s+(table|function)/i.test(migration),'071-20 migration must be non-destructive');

// Regression examples from DL10_Test_3 must now be structurally rejected by the rule set.
const bad=[
  'Trong một bài tập mô phỏng về độ dày vỏ Trái Đất, giáo viên cho bốn giá trị giả định',
  'Trong một bài tập giả định về phương pháp bản đồ – biểu đồ',
  'Trong một lãnh thổ giả định, một nhóm đối tượng có giá trị 45 trên tổng giá trị 160',
  'Trong một bài tập giả định về phân bố dân cư'
];
const forbidden=/(giả\s*định|mô\s*phỏng|lãnh\s*thổ\s*giả\s*định)/i;
for(const stem of bad)must(forbidden.test(stem),'071-21 known fabricated Test_3 stem escaped heuristic');

console.log('PASS ai_geography_part3_authentic_data_071_simulation');
