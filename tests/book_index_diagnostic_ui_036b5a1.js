const fs = require('fs');
const assert = require('assert');

const repair = fs.readFileSync('knowledge_ai_book_repair.js', 'utf8');
const html = fs.readFileSync('knowledge_ai.html', 'utf8');

assert(repair.includes('knowledge-book-index-diagnostics'), '036B5A diagnostic endpoint missing from repair UI');
assert(repair.includes("action:'diagnose_book_index'"), '036B5A diagnostic action missing');
assert(repair.includes('compactDiagnostic'), '036B5A must compact server diagnostics before exposing them to copy UI');
assert(repair.includes('__DAMSAN_BOOK_DIAGNOSTIC_036B5A__'), '036B5A compact diagnostic browser handle missing');
assert(repair.includes('Sao chép chẩn đoán 036B5A'), '036B5A copy action missing');
assert(repair.includes("hit.mode === 'STRICT_RAW'"), '036B5A must preserve raw heading positions for prefix analysis');
assert(repair.includes('index > 3500'), '036B5A must report headings that fall beyond the old 3500-character body prefix');
assert(!/first_lines:\s*page\?\.first_lines/.test(repair), '036B5A compact copy must not retain OCR line text');
assert(!/context:\s*String\(hit\?\.context/.test(repair), '036B5A compact copy must not retain OCR context text');
assert(html.includes('knowledge_ai_book_repair.js?v=20260911-whole-book-toc-036b5a1'), '036B5A1 cache-bust missing from semantic-analysis UI');

console.log('BOOK_INDEX_DIAGNOSTIC_UI_036B5A1_PASS');
