const fs=require('fs');
const assert=require('assert');

const migration=fs.readFileSync('supabase/migrations/20261105111500_geography_official_2026_benchmark_101.sql','utf8');
const source=fs.readFileSync('supabase/functions/authority-p0-official-2026/index.ts','utf8');

assert(migration.includes("profile_version='101'"),'101 profile version missing');
assert(migration.includes('GOVERNMENT_PORTAL_EXAM_REPRODUCTION_VERIFIED'),'101 verified government-portal locator missing');
assert(migration.includes("'0921'"),'101 exam code missing');
assert(migration.includes('OFFICIAL_ANSWER_PROVENANCE_ONLY_NOT_GENERATION_SOURCE'),'101 answer-use policy missing');
for(const image of ['de-dia-1-','de-dia-2-','de-dia-3-','de-dia-4-']) assert(migration.includes(image),'101 exam image locator missing '+image);

assert(source.includes('BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY'),'101 authority code missing');
assert(source.includes('FULL_VISUAL_4_PAGE_REVIEW'),'101 full exam visual review missing');
assert(source.includes('OFFICIAL_EXAM_2026_VISUAL_FINGERPRINT_STYLE_ONLY_NO_COPY'),'101 no-copy normalization policy missing');
assert(source.includes('Suggested-answer images are excluded'),'101 suggested answers must be excluded');
assert(source.includes('BENCH_2026_P1_CHART_003'),'101 P1 chart fingerprint missing');
assert(source.includes('BENCH_2026_P1_TABLE_004'),'101 P1 table fingerprint missing');
assert(source.includes('BENCH_2026_P2_CHART_006'),'101 P2 chart fingerprint missing');
assert(source.includes('BENCH_2026_P3_TABLE_008'),'101 P3 multistep table fingerprint missing');
assert(source.includes('BENCH_2026_P3_LAPSE_012'),'101 geographic-rate fingerprint missing');
assert(source.includes('rpc_knowledge_import_normalized_source_service'),'101 must reuse canonical import RPC');
assert(!/req\.json\s*\(/.test(source),'101 must not accept arbitrary request JSON');
assert(!source.includes('searchParams'),'101 must not accept arbitrary URL/query input');

console.log('AI_GEOGRAPHY_OFFICIAL_2026_BENCHMARK_101_PASS');
