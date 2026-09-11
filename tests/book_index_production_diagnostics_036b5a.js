const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('supabase/functions/knowledge-book-index-diagnostics/index.ts', 'utf8');
const docs = fs.readFileSync('docs/BOOK_INDEX_DIAGNOSTICS_036B5A.md', 'utf8');

assert(source.includes('diagnose_book_index'), '036B5A diagnostic action missing');
assert(source.includes('read_only: true'), '036B5A must explicitly report read-only mode');
assert(source.includes('knowledge-artifacts'), '036B5A must inspect the existing extraction artifact');
assert(source.includes('MAX_EARLY_PAGES = 15'), '036B5A early-page bound missing');
assert(source.includes('MAX_LINES_PER_PAGE = 24'), '036B5A line bound missing');
assert(source.includes('MAX_BODY_SAMPLES = 20'), '036B5A body sample bound missing');
assert(source.includes('STRICT_RAW') && source.includes('SPACED_RAW') && source.includes('CURRENT_FOLDED'), '036B5A comparison modes missing');
assert(!source.includes('.update('), '036B5A must not update database rows');
assert(!source.includes('.insert('), '036B5A must not insert database rows');
assert(!source.includes('.upsert('), '036B5A must not upsert database rows');
assert(!source.includes('.delete('), '036B5A must not delete database rows');
assert(!source.includes('rpc_knowledge_store_book_index_service'), '036B5A must not persist book indexes');
assert(!source.includes('knowledge_ai_handoffs'), '036B5A must not create AI handoffs');
assert(docs.includes('never re-OCR') && docs.includes('do not mutate'), '036B5A safety contract is not documented');

console.log('BOOK_INDEX_DIAGNOSTICS_036B5A_PASS');
