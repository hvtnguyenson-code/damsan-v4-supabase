const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'exam-ai-bridge', 'index.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('=== AI-EXAM-047 NUMERIC PART COMPAT ===');

assert(/function normalizePart\(value: unknown\)/.test(source), 'A047-01 normalizePart helper missing');
assert(/typeof value === "number"/.test(source), 'A047-02 numeric part values are not recognized');
assert(/Number\.isSafeInteger\(value\)/.test(source), 'A047-03 numeric part must be a safe integer');
assert(/return String\(value\)/.test(source), 'A047-04 numeric part is not normalized to canonical string');
assert(/const phan = normalizePart\(raw\.phan \?\? raw\.Phan\)/.test(source), 'A047-05 question parser does not use numeric-compatible normalization');
assert(/if \(!\["1", "2", "3"\]\.includes\(phan\)\) throw new Error\("question_part_invalid"\)/.test(source), 'A047-06 canonical part gate changed unexpectedly');
assert(/function cleanString\(value: unknown, maxLength: number\)[\s\S]*?typeof value === "string"/.test(source), 'A047-07 generic string sanitizer must remain strict');

console.log('PASS: AI-EXAM-047 accepts phan as 1/2/3 numbers while retaining canonical string validation.');
