const fs=require('fs');
const assert=require('assert');

const migration=fs.readFileSync('supabase/migrations/20261105103000_geography_current_curriculum_authority_100.sql','utf8');
const source=fs.readFileSync('supabase/functions/authority-p0-geography-curriculum/index.ts','utf8');

assert(migration.includes("profile_version='100'"),'100 profile version missing');
assert(migration.includes('CURRENT_AUTHORITY_BUNDLE_LOCATED'),'100 current authority bundle marker missing');
assert(migration.includes('17-bgddt.pdf'),'100 current TT17/2025 amendment source missing');
assert(migration.includes('chuong-trinh-gdtx-thptsigned.pdf'),'100 official MOET competency-alignment source missing');

assert(source.includes('BGDDT_GEOGRAPHY_CURRICULUM_2018'),'100 stable curriculum authority code missing');
assert(source.includes('GDPT_2018_CURRENT'),'100 current-effective curriculum code missing');
assert(source.includes('CURRENT_CURRICULUM_AUTHORITY_BUNDLE_100'),'100 authority-bundle normalization policy missing');
assert(source.includes('CURRENT_CURRICULUM_BUNDLE_100'),'100 importer model marker missing');

for(const code of ['GEO_NK_SPATIAL','GEO_NK_CAUSAL','GEO_TH_TOOL','GEO_TH_FIELD','GEO_TH_INFO','GEO_VD_REALITY','GEO_VD_PROBLEM','GEO_VD_RESEARCH']){
  assert(source.includes(code),'100 competency ontology missing '+code);
}
assert(source.includes('READ_MAP')&&source.includes('READ_CHART')&&source.includes('READ_TABLE'),'100 geographic tool operations missing');
assert(source.includes('atlas_dependency:false'),'100 current atlas-independent policy missing');
assert(source.includes('map_first_class:true')&&source.includes('table_first_class:true'),'100 current map/table policy missing');
assert(source.includes('physical_pdf_page:17')&&source.includes('physical_pdf_page:19'),'100 TT17 appendix provenance missing');
assert(source.includes('rpc_knowledge_import_normalized_source_service'),'100 must reuse canonical normalized import RPC');
assert(!/req\.json\s*\(/.test(source),'100 must not accept arbitrary request JSON');
assert(!source.includes('searchParams'),'100 must not accept arbitrary URL/query input');

console.log('AI_GEOGRAPHY_CURRICULUM_AUTHORITY_100_PASS');
