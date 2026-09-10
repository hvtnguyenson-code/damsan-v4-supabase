const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const readerHardening = fs.readFileSync(path.join(root, 'knowledge_reader_hardening.js'), 'utf8');
const aiHardening = fs.readFileSync(path.join(root, 'knowledge_ai_hardening.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260910100503_knowledge_ocr_usability_gate_032.sql'), 'utf8');
const knowledgeHtml = fs.readFileSync(path.join(root, 'knowledge.html'), 'utf8');
const aiHtml = fs.readFileSync(path.join(root, 'knowledge_ai.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function must(source, regex, message) {
  assert(regex.test(source), message);
}

console.log('=== KNOWLEDGE-032 OCR USABILITY HARDENING ===');

must(readerHardening, /createWorker\(\['vie', 'eng'\], 1/i, 'K032-01 OCR uses explicit Vietnamese + English language array');
must(readerHardening, /Khởi tạo OCR tiếng Việt \+ tiếng Anh bằng CDN mặc định/i, 'K032-02 default CDN is attempted first');
must(readerHardening, /thử lại bằng đường dẫn dự phòng/i, 'K032-03 OCR has a pinned fallback path');
must(readerHardening, /extractedChars <= 0/i, 'K032-04 zero extracted text is rejected in browser');
must(readerHardening, /unresolved\.length >= pageCount/i, 'K032-05 all unresolved PDF pages are rejected in browser');
must(readerHardening, /error\.code = 'extraction_no_usable_text'/i, 'K032-06 browser returns a specific unusable-extraction code');

must(migration, /_knowledge_extraction_manifest_usable/i, 'K032-07 database defines canonical extraction usability predicate');
must(migration, /\(p_manifest->>'extracted_chars'\)::bigint > 0/i, 'K032-08 database rejects zero extracted characters');
must(migration, /jsonb_array_length[\s\S]*< \(p_manifest->>'page_count'\)::integer/i, 'K032-09 database rejects PDF with every page unresolved');
must(migration, /trg_knowledge_guard_extracted_document/i, 'K032-10 document state transition is guarded');
must(migration, /trg_knowledge_guard_ai_handoff_source/i, 'K032-11 AI handoff is guarded');
must(migration, /set pipeline_status = 'FAILED'/i, 'K032-12 historical unusable rows are quarantined');
must(migration, /set status = 'REVOKED'/i, 'K032-13 historical AI capabilities are revoked');

must(aiHardening, /boundaryMode === 'PDF_PAGE'/i, 'K032-14 PDF_PAGE is treated as physical-page provenance');
must(aiHardening, /physical page boundaries/i, 'K032-15 prompt receives correct physical-page instruction');
must(aiHardening, /✓ Đã sao chép/i, 'K032-16 copy button gives visible success feedback');
must(aiHardening, /1800/i, 'K032-17 copy feedback automatically resets');

must(knowledgeHtml, /knowledge_reader\.js[^<]*<\/script>[\s\S]*knowledge_reader_hardening\.js/i, 'K032-18 OCR hardening loads after base reader');
must(aiHtml, /knowledge_ai_web\.js[^<]*<\/script>[\s\S]*knowledge_ai_hardening\.js/i, 'K032-19 AI hardening loads after base web bridge');

console.log('PASS: KNOWLEDGE-032 OCR usability hardening structural simulation');
