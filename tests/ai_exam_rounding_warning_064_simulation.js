const fs = require('fs');
const assert = require('assert');

const migration = fs.readFileSync('supabase/migrations/20260918134500_ai_exam_exact_result_rounding_warning_064.sql','utf8');

assert(migration.includes('_ai_exam_quality_gate_056_base'), '064 must preserve the complete 056 gate');
assert(migration.includes('_ai_exam_rounding_warning_needed_064'), '064 exact-result helper missing');
assert(migration.includes("if v_quant ? 'rounding_digits' then return true"), 'explicit rounding metadata must preserve legacy warnings');
assert(migration.includes('v_result:=public._ai_exam_part3_recompute_053(v_quant)'), '064 must use canonical server recomputation');
assert(migration.includes('return v_result is distinct from v_answer'), '064 must suppress only exact-result rounding warnings');
assert(migration.includes("'part3_rounding_instruction_missing','rounding_digits_server_derived'"), '064 must target only the two noisy rounding warnings');
assert(migration.includes("'quality_gate_version','064'"), '064 quality gate version missing');
assert(!/drop\s+function|drop\s+table/i.test(migration), '064 must be non-destructive');

function warningNeeded({ result, answer, hasRoundingDigits }) {
  if (hasRoundingDigits) return true;
  return Number(result) !== Number(String(answer).replace(',', '.'));
}

assert.strictEqual(warningNeeded({ result: 1.7, answer: '1,7', hasRoundingDigits: false }), false, 'exact RANGE result must not require rounding warning');
assert.strictEqual(warningNeeded({ result: 4.8, answer: '4,8', hasRoundingDigits: false }), false, 'exact BALANCE result must not require rounding warning');
assert.strictEqual(warningNeeded({ result: 11.19402985, answer: '11,2', hasRoundingDigits: false }), true, 'rounded growth result still requires a rounding warning');
assert.strictEqual(warningNeeded({ result: 27.659574, answer: '27,7', hasRoundingDigits: true }), true, 'explicit rounding contract must remain visible');

console.log('PASS ai_exam_rounding_warning_064_simulation');
