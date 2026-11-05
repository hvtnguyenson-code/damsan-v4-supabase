const fs=require('fs');
const assert=require('assert');

const migration=fs.readFileSync('supabase/migrations/20261105094500_authority_html_source_capture_099.sql','utf8');
const bucketMigration=fs.readFileSync('supabase/migrations/20261105100500_authority_html_bucket_099a.sql','utf8');
const source=fs.readFileSync('supabase/functions/authority-p0-format-2025/index.ts','utf8');
const upload=fs.readFileSync('supabase/functions/knowledge-upload/index.ts','utf8');

assert(migration.includes("'text/html'::text"),'099 DB HTML mime support missing');
assert(migration.includes("'HTML'::text"),'099 DB HTML source format missing');
assert(source.includes('BGDDT_FORMAT_RULE_2025'),'099 authority code missing');
assert(source.includes('vqa.moet.gov.vn/vi/news/thong-bao/cau-truc-dinh-dang-de-thi-tot-nghiep-thpt-tu-nam-2025-74.html'),'099 exact official source URL missing');
assert(source.includes('OFFICIAL_HTML_CAPTURE'),'099 official HTML provenance missing');
assert(source.includes('rpc_knowledge_import_normalized_source_service'),'099 must reuse normalized import RPC');
assert(source.includes('RULE_FORMAT_2025_001')&&source.includes('RULE_FORMAT_2025_008'),'099 rule unit set incomplete');
assert(source.includes('competency_oriented:true'),'099 competency-oriented rule missing');
assert(source.includes('meaningful_context_preferred:true'),'099 meaningful-context rule missing');
assert(source.includes('allowed_formats:["MCQ_SINGLE","TRUE_FALSE_CLUSTER","SHORT_ANSWER"]'),'099 item formats missing');
assert(source.includes('statement_count:4'),'099 P2 four-statement rule missing');
assert(source.includes('minutes:50'),'099 50-minute rule missing');
assert(source.includes('question_commands:40'),'099 40-command rule missing');
assert(source.includes('later_official_rule_overrides:true'),'099 authority caveat missing');
assert(!/req\.json\s*\(/.test(source),'099 must not accept arbitrary request JSON');
assert(!source.includes('searchParams'),'099 must not accept arbitrary source URL/query');
assert(upload.includes('"application/pdf"')&&!upload.includes('"text/html"'),'099 must NOT open teacher uploads to HTML');
assert(bucketMigration.includes("where id='knowledge-source'"),'099a must scope MIME change to knowledge-source bucket');
assert(bucketMigration.includes("'text/html'"),'099a private source bucket HTML MIME support missing');
assert(!bucketMigration.includes("knowledge-normalized"),'099a must not modify unrelated normalized bucket');

console.log('AI_GEOGRAPHY_FORMAT_RULE_099_PASS');
