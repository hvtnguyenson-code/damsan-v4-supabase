const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('supabase/functions/authority-p0-reference-2025/index.ts','utf8');

assert(source.includes('BGDDT_REFERENCE_EXAM_2025_GEOGRAPHY'), '098 authority code missing');
assert(source.includes('1F_UfWJSW04Y52Wq90YANGvHjmu9bZHBb'), '098 exact official Drive artifact missing');
assert(source.includes('07_DiaLi.pdf'), '098 official artifact filename missing');
assert(source.includes('rpc_knowledge_import_normalized_source_service'), '098 must reuse canonical normalized import RPC');
assert(source.includes('BENCHMARK_PATTERN'), '098 benchmark fingerprint unit type missing');
assert(source.includes('BENCH_2025_P1_CHART_003'), '098 P1 chart fingerprint missing');
assert(source.includes('BENCH_2025_P2_CHART_006'), '098 P2 chart fingerprint missing');
assert(source.includes('BENCH_2025_P3_SERIES_AVG_007'), '098 P3 table fingerprint missing');
assert(source.includes('BENCH_2025_SCORING_013'), '098 scoring fingerprint missing');
assert(source.includes('FULL_VISUAL_5_PAGES'), '098 full PDF review provenance missing');
assert(source.includes('STYLE_ONLY_NO_COPY'), '098 no-copy policy missing');
assert(source.includes('authority_profile_id: PROFILE_ID'), '098 document binding missing');
assert(source.includes('authority_code: AUTHORITY_CODE'), '098 explicit authority slot binding missing');
assert(source.includes('upsert: true'), '098 deterministic storage upload must be idempotent');
assert(source.includes('already_seeded'), '098 idempotent readback missing');

// This endpoint may be temporarily deployed without JWT only because it has no arbitrary source/input surface.
assert(!/req\.json\s*\(/.test(source), '098 must not accept arbitrary request JSON');
assert(!/new URL\(req\.url\).*searchParams/.test(source), '098 must not accept arbitrary query source');
assert(!source.includes('Phần đất liền của lãnh thổ nước ta'), '098 must not persist/copy benchmark item text');
assert(!source.includes('Điểm cực Tây'), '098 must not persist generated/item text');

console.log('AI_GEOGRAPHY_REFERENCE_CORPUS_098_PASS');
