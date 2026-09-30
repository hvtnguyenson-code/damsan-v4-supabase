const fs=require('fs');
const assert=require('assert');

const prompt=fs.readFileSync('ai_exam_part3_presentation_055.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260930101500_ai_exam_trusted_external_evidence_072.sql','utf8');

function must(value,message){if(!value)throw new Error(message);}

// Storage architecture: keep a tiny registry/evidence capsule, not a copied statistical warehouse.
must(/create table if not exists public\.ai_exam_trusted_external_sources/i.test(migration),'072-01 trusted-source registry missing');
must(/WORLD_BANK/.test(migration)&&/FAOSTAT/.test(migration)&&/NOAA_NCEI/.test(migration)&&/NASA_EARTHDATA/.test(migration)&&/USGS/.test(migration)&&/VIETNAM_NSO/.test(migration),'072-02 expected official source families missing');
must(/trusted_external_sources/.test(migration),'072-03 source registry must be snapshotted into assessment standard');
must(/'\"072\"'::jsonb/.test(migration),'072-04 standard version 072 missing');
must(/LOCAL_GROUNDED/.test(migration)&&/TRUSTED_EXTERNAL/.test(migration),'072-05 dual provenance modes missing');
must(/REGISTRY_WHITELIST_WITH_EVIDENCE_CAPSULE/.test(migration),'072-06 evidence-capsule policy missing');
must(/source_id.*source_url.*dataset.*retrieved_at.*values/s.test(migration),'072-07 minimum external evidence fields missing');

// Server hard gate must validate source, HTTPS domain and exact raw values before relaxing 071 local-only grounding.
must(/_ai_exam_url_host_072/.test(migration)&&/_ai_exam_host_allowed_072/.test(migration),'072-08 URL/domain helpers missing');
must(/quality_part3_external_source_untrusted/.test(migration),'072-09 untrusted source rejection missing');
must(/quality_part3_external_url_invalid/.test(migration),'072-10 external URL rejection missing');
must(/quality_part3_external_values_mismatch/.test(migration),'072-11 evidence/input mismatch rejection missing');
must(/if v_external_valid then[\s\S]*quality_part3_input_not_grounded_in_source/.test(migration),'072-12 071 local-only error may be relaxed only after full external validation');
must(/quality_gate_version','072/.test(migration),'072-13 gate version 072 missing');
must(!/drop\s+(table|function)/i.test(migration),'072-14 migration must be non-destructive');

// Prompt contract: external data is only for Part III raw evidence; curriculum remains in selected SGK units.
must(/MỞ RỘNG 072 — HAI NGUỒN DỮ LIỆU HỢP LỆ/.test(prompt),'072-15 prompt dual-origin section missing');
must(/AI web PHẢI truy cập\/tra cứu nguồn chính thức/.test(prompt),'072-16 model must verify live source instead of using memory');
must(/source_refs luôn phải trỏ tới knowledge_unit của bài đã chọn/.test(prompt),'072-17 curricular scope must remain locally grounded');
must(/external_evidence/.test(prompt)&&/source_id/.test(prompt)&&/source_url/.test(prompt)&&/retrieved_at/.test(prompt)&&/values/.test(prompt),'072-18 evidence capsule schema missing from prompt');
must(/Không dùng nguồn thứ cấp, blog, Wikipedia, báo chí/.test(prompt),'072-19 secondary sources must be forbidden');
must(/INSUFFICIENT_AUTHENTIC_QUANTITATIVE_DATA/.test(prompt),'072-20 unavailable evidence must block instead of fabricate');
must(/Dữ liệu ngoài đã khai báo/.test(prompt),'072-21 teacher preview must expose external provenance');

// Equivalent domain behavior: official host and subdomains pass; lookalikes fail.
function hostAllowed(host,domains){
  host=String(host||'').toLowerCase();
  return domains.some((d)=>host===d.toLowerCase()||host.endsWith('.'+d.toLowerCase()));
}
assert(hostAllowed('data.worldbank.org',['worldbank.org']));
assert(hostAllowed('api.worldbank.org',['worldbank.org']));
assert(hostAllowed('www.nso.gov.vn',['nso.gov.vn','gso.gov.vn']));
assert(!hostAllowed('worldbank.org.evil.example',['worldbank.org']));
assert(!hostAllowed('fake-nso.gov.vn.example',['nso.gov.vn']));

// Evidence values must cover every raw quantitative input exactly.
const evidence={source_id:'WORLD_BANK',source_url:'https://data.worldbank.org/indicator/SP.POP.TOTL',dataset:'World Development Indicators - Population, total',retrieved_at:'2026-09-30',values:[100.3,101.6]};
const inputs=[100.3,101.6];
assert(inputs.every((v)=>evidence.values.includes(v)));
assert(![100.3,102.0].every((v)=>evidence.values.includes(v)));

console.log('PASS ai_geography_part3_trusted_external_072_simulation');
