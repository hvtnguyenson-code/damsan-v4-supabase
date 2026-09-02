// Deterministic simulation & static verification for FLEX-LITE server scoring foundation.
// Validates supabase/migrations/20260901000001_flex_lite_scoring_foundation.sql. No network.
const assert = require('assert');
const fs = require('fs');

const migrationPath = 'supabase/migrations/20260901000001_flex_lite_scoring_foundation.sql';
assert(fs.existsSync(migrationPath), `Migration file not found: ${migrationPath}`);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

// =========================================================================
// STATIC CHECKS ON ACTUAL MIGRATION SQL SOURCE
// =========================================================================

// SCORE-01: Schema adds assessment_type default 'LEGACY'
assert(
  /alter\s+table\s+public\.phong_thi[\s\S]*add\s+column\s+(if\s+not\s+exists\s+)?assessment_type\s+text\s+not\s+null\s+default\s+'LEGACY'/i.test(migrationSql),
  'SCORE-01: migration must add assessment_type text NOT NULL DEFAULT LEGACY to public.phong_thi'
);

// SCORE-02: CHECK constraint has exactly 6 values
const checkConstraintMatch = migrationSql.match(/check\s*\(\s*assessment_type\s+in\s*\(([^)]+)\)\s*\)/i);
assert(checkConstraintMatch, 'SCORE-02: phong_thi_assessment_type_check constraint must exist');
const allowedTypes = checkConstraintMatch[1]
  .split(',')
  .map(s => s.trim().replace(/^'|'$/g, ''));
const expectedTypes = ['LEGACY', 'TOT_NGHIEP', 'MCQ_ONLY', 'TRUE_FALSE_ONLY', 'SHORT_ONLY', 'CUSTOM'];
assert.deepStrictEqual(
  allowedTypes.sort(),
  expectedTypes.sort(),
  'SCORE-02: assessment_type CHECK constraint must contain exactly the 6 allowed values'
);

// SCORE-03: scoring_config default {} and NOT NULL
assert(
  /alter\s+table\s+public\.phong_thi[\s\S]*add\s+column\s+(if\s+not\s+exists\s+)?scoring_config\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i.test(migrationSql),
  'SCORE-03: migration must add scoring_config jsonb NOT NULL DEFAULT {} to public.phong_thi'
);

// Check column comments exist
assert(
  /comment\s+on\s+column\s+public\.phong_thi\.assessment_type\s+is\s+/i.test(migrationSql),
  'SCORE-01: migration must include comment on assessment_type'
);
assert(
  /comment\s+on\s+column\s+public\.phong_thi\.scoring_config\s+is\s+/i.test(migrationSql),
  'SCORE-03: migration must include comment on scoring_config'
);

// Common exam guard: must preserve baseline semantics (reject null / non-array, but DO NOT reject [] globally)
assert(
  /if\s+v_exam\s+is\s+null\s+or\s+jsonb_typeof\(v_exam\)\s*<>\s*'array'\s+then/i.test(migrationSql),
  'Common exam guard must check is null or jsonb_typeof <> array'
);
assert(
  !/if\s+v_exam\s+is\s+null\s+or\s+jsonb_typeof\(v_exam\)\s*<>\s*'array'\s+or\s+jsonb_array_length/i.test(migrationSql),
  'Common exam guard must NOT reject empty array [] globally'
);

// Grader formula static assertions on actual SQL
assert(
  /v_final_score\s*:=\s*v_raw_sum;/i.test(migrationSql),
  'LEGACY branch must set v_final_score := v_raw_sum'
);
assert(
  /v_final_score\s*:=\s*v_p1_earned\s*\+\s*v_p2_earned\s*\+\s*v_p3_earned;/i.test(migrationSql),
  'TOT_NGHIEP branch must set v_final_score := v_p1_earned + v_p2_earned + v_p3_earned'
);
assert(
  /v_final_score\s*:=\s*round\(\(v_p1_earned\s*\/\s*v_p1_max\)\s*\*\s*10,\s*2\);/i.test(migrationSql),
  'MCQ_ONLY branch must use formula round((v_p1_earned / v_p1_max) * 10, 2)'
);
assert(
  /v_final_score\s*:=\s*round\(\(v_p2_earned\s*\/\s*v_p2_max\)\s*\*\s*10,\s*2\);/i.test(migrationSql),
  'TRUE_FALSE_ONLY branch must use formula round((v_p2_earned / v_p2_max) * 10, 2)'
);
assert(
  /v_final_score\s*:=\s*round\(\(v_p3_earned\s*\/\s*v_p3_max\)\s*\*\s*10,\s*2\);/i.test(migrationSql),
  'SHORT_ONLY branch must use formula round((v_p3_earned / v_p3_max) * 10, 2)'
);

// CUSTOM validation static assertions on actual SQL
assert(
  /v_scoring_config\s*\?\s*'p1_weight'[\s\S]*v_scoring_config\s*\?\s*'p2_weight'[\s\S]*v_scoring_config\s*\?\s*'p3_weight'/i.test(migrationSql),
  'CUSTOM validation must require all 3 keys (p1_weight, p2_weight, p3_weight)'
);
assert(
  /if\s+v_p1_weight\s+is\s+null\s+or\s+v_p2_weight\s+is\s+null\s+or\s+v_p3_weight\s+is\s+null\s+then\s+raise\s+exception/i.test(migrationSql),
  'CUSTOM validation must explicitly reject NULL weights'
);
assert(
  /v_p1_weight\s*<\s*0\s+or\s+v_p1_weight\s*>\s*10[\s\S]*v_p2_weight\s*<\s*0\s+or\s+v_p2_weight\s*>\s*10[\s\S]*v_p3_weight\s*<\s*0\s+or\s+v_p3_weight\s*>\s*10/i.test(migrationSql),
  'CUSTOM validation must enforce 0 <= weight <= 10 for all 3 weights'
);
assert(
  /\(v_p1_weight\s*\+\s*v_p2_weight\s*\+\s*v_p3_weight\)\s*<>\s*10/i.test(migrationSql),
  'CUSTOM validation must check weights sum to exactly 10'
);
assert(
  /v_p1_count\s*=\s*0\s+and\s+v_p1_weight\s*<>\s*0[\s\S]*v_p2_count\s*=\s*0\s+and\s+v_p2_weight\s*<>\s*0[\s\S]*v_p3_count\s*=\s*0\s+and\s+v_p3_weight\s*<>\s*0/i.test(migrationSql),
  'CUSTOM validation must require weight = 0 when part has 0 questions'
);

// Part 2 positional four-slot scoring static assertion
assert(
  /v_part2_answer_slots\s*:=\s*string_to_array\(v_answer,\s*'-'\);[\s\S]*v_part2_correct_slots\s*:=\s*string_to_array\(v_correct,\s*'-'\);/i.test(migrationSql),
  'Part 2 must parse 4 positional slots using string_to_array with delimiter -'
);
assert(
  /v_points\s*:=\s*case\s+v_part2_matches\s+when\s+1\s+then\s+0\.1\s+when\s+2\s+then\s+0\.25\s+when\s+3\s+then\s+0\.5\s+when\s+4\s+then\s+1\.0\s+else\s+0\s+end;/i.test(migrationSql),
  'Part 2 must score matching statements according to scale (1->0.1, 2->0.25, 3->0.5, 4->1.0)'
);

// Unknown part rejection static assertion
assert(
  /raise\s+exception\s+'Unknown\s+question\s+part\s+%\s+in\s+assessment\s+type\s+%',\s*v_part,\s*v_assessment_type;/i.test(migrationSql),
  'Grader must raise exception for unknown non-legacy question part'
);

// Score authority & Exception path
assert(
  /insert\s+into\s+public\.ket_qua[\s\S]*?values\s*\([^)]*?v_final_score/i.test(migrationSql),
  'SCORE-16: ket_qua must be inserted/updated with v_final_score'
);
assert(
  /update\s+public\.exam_submissions\s+set\s+status\s*=\s*'graded',\s*score\s*=\s*v_final_score/i.test(migrationSql),
  'SCORE-16: exam_submissions.score must be set to v_final_score'
);
assert(
  /exception\s+when\s+others\s+then\s+update\s+public\.exam_submissions\s+set\s+status\s*=\s*'grading_error',\s*grading_error\s*=\s*left\(sqlerrm,\s*1000\)/i.test(migrationSql),
  'Exception path must update status = grading_error with sqlerrm'
);

// SCORE-19: direct rpc_grade_submission browser execute revoked
assert(
  /revoke\s+all\s+on\s+function\s+public\.rpc_grade_submission\(uuid\)\s+from\s+public,\s*anon,\s*authenticated;/i.test(migrationSql),
  'SCORE-19: direct rpc_grade_submission execute must be revoked from public, anon, authenticated'
);

// SCORE-20: migration does not replace unapproved RPCs
const forbiddenReplacements = [
  'rpc_receive_submission',
  'rpc_hoc_sinh_grade_submission',
  'rpc_grade_pending_room',
  'rpc_reset_room_results',
  'rpc_dieu_khien_phong_thi',
  'rpc_luu_de_thi_len_phong',
  'nop_bai_va_cham_diem'
];
for (const fn of forbiddenReplacements) {
  const re = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?${fn}`, 'i');
  assert(!re.test(migrationSql), `SCORE-20: migration must NOT create or replace ${fn}`);
}

// Ensure security definer and set search_path = public are preserved
assert(
  /create\s+or\s+replace\s+function\s+public\.rpc_grade_submission\(p_submission_id\s+uuid\)[\s\S]*security\s+definer[\s\S]*set\s+search_path\s*=\s*public/i.test(migrationSql),
  'rpc_grade_submission must be SECURITY DEFINER with set search_path = public'
);

// =========================================================================
// EMULATED GRADER IMPLEMENTING THE EXACT SPECIFICATION & SQL LOGIC
// =========================================================================

function gradeSubmissionEngine({
  room: { assessment_type = 'LEGACY', scoring_config = {} },
  exam, // array of questions: { phan, dap_an_dung }
  submission: { raw_answers = [] }
}) {
  if (!exam || !Array.isArray(exam)) {
    throw new Error('Exam data not found for stored room and exam code');
  }

  let p1_count = 0;
  let p2_count = 0;
  let p3_count = 0;
  let p1_earned = 0;
  let p2_earned = 0;
  let p3_earned = 0;
  let raw_sum = 0;
  const grading_details = [];

  for (let i = 0; i < exam.length; i++) {
    const q = exam[i];
    const part = String(q.phan || q.Phan || '1');
    const answer = String(raw_answers[i]?.chon || '');
    const correct = String(q.dap_an_dung || q.DapAnDung || '');
    let points = 0;

    if (part === '1') {
      p1_count++;
      if (answer.trim() !== '' && answer.trim().toUpperCase() === correct.trim().toUpperCase()) {
        points = 0.25;
      }
      p1_earned += points;
    } else if (part === '2') {
      p2_count++;
      const ansSlots = answer.split('-');
      const corSlots = correct.split('-');
      let matches = 0;
      for (let slot = 0; slot < 4; slot++) {
        const a = (ansSlots[slot] || '').trim().toUpperCase().replace(/Đ/g, 'D');
        const c = (corSlots[slot] || '').trim().toUpperCase().replace(/Đ/g, 'D');
        if (a !== '' && a === c) {
          matches++;
        }
      }
      const p2Scale = [0, 0.1, 0.25, 0.5, 1.0];
      points = p2Scale[matches] || 0;
      p2_earned += points;
    } else if (part === '3') {
      p3_count++;
      const normA = answer.replace(/,/g, '.').replace(/'/g, '').replace(/\s/g, '').toLowerCase();
      const normC = correct.replace(/,/g, '.').replace(/'/g, '').replace(/\s/g, '').toLowerCase();
      if (normA !== '' && normA === normC) {
        points = 0.25;
      }
      p3_earned += points;
    } else {
      if (assessment_type === 'LEGACY') {
        const normA = answer.replace(/,/g, '.').replace(/'/g, '').replace(/\s/g, '').toLowerCase();
        const normC = correct.replace(/,/g, '.').replace(/'/g, '').replace(/\s/g, '').toLowerCase();
        if (normA !== '' && normA === normC) {
          points = 0.25;
        }
      } else {
        throw new Error(`Unknown question part ${part} in assessment type ${assessment_type}`);
      }
    }

    raw_sum += points;
    grading_details.push({
      q: i + 1,
      phan: part,
      chon: answer,
      dung: correct,
      diem: points
    });
  }

  const p1_max = p1_count * 0.25;
  const p2_max = p2_count * 1.0;
  const p3_max = p3_count * 0.25;
  const total_questions = exam.length;
  let final_score = 0;

  if (assessment_type === 'LEGACY') {
    final_score = raw_sum;
  } else if (assessment_type === 'TOT_NGHIEP') {
    if (p1_count + p2_count + p3_count !== total_questions) {
      throw new Error('TOT_NGHIEP exam contains invalid question parts');
    }
    final_score = p1_earned + p2_earned + p3_earned;
  } else if (assessment_type === 'MCQ_ONLY') {
    if (p1_count !== total_questions || p1_count < 1 || p1_max <= 0) {
      throw new Error('MCQ_ONLY requires all questions to be Part 1 (at least 1 question)');
    }
    final_score = Math.round(((p1_earned / p1_max) * 10) * 100) / 100;
  } else if (assessment_type === 'TRUE_FALSE_ONLY') {
    if (p2_count !== total_questions || p2_count < 1 || p2_max <= 0) {
      throw new Error('TRUE_FALSE_ONLY requires all questions to be Part 2 (at least 1 question)');
    }
    final_score = Math.round(((p2_earned / p2_max) * 10) * 100) / 100;
  } else if (assessment_type === 'SHORT_ONLY') {
    if (p3_count !== total_questions || p3_count < 1 || p3_max <= 0) {
      throw new Error('SHORT_ONLY requires all questions to be Part 3 (at least 1 question)');
    }
    final_score = Math.round(((p3_earned / p3_max) * 10) * 100) / 100;
  } else if (assessment_type === 'CUSTOM') {
    if (p1_count + p2_count + p3_count !== total_questions || total_questions < 1) {
      throw new Error('CUSTOM exam contains invalid question parts or no questions');
    }
    if (
      typeof scoring_config !== 'object' ||
      scoring_config === null ||
      !('p1_weight' in scoring_config) ||
      !('p2_weight' in scoring_config) ||
      !('p3_weight' in scoring_config)
    ) {
      throw new Error('CUSTOM scoring_config must be an object with p1_weight, p2_weight, p3_weight');
    }

    // Explicitly reject null values (in JS, Number(null) evaluates to 0, which would bypass null check)
    if (
      scoring_config.p1_weight === null ||
      scoring_config.p2_weight === null ||
      scoring_config.p3_weight === null
    ) {
      throw new Error('CUSTOM weights must be valid numeric values');
    }

    const p1_weight = Number(scoring_config.p1_weight);
    const p2_weight = Number(scoring_config.p2_weight);
    const p3_weight = Number(scoring_config.p3_weight);

    if (isNaN(p1_weight) || isNaN(p2_weight) || isNaN(p3_weight)) {
      throw new Error('CUSTOM weights must be valid numeric values');
    }
    if (p1_weight < 0 || p1_weight > 10 || p2_weight < 0 || p2_weight > 10 || p3_weight < 0 || p3_weight > 10) {
      throw new Error('CUSTOM weights must each be between 0 and 10');
    }
    if (Math.abs((p1_weight + p2_weight + p3_weight) - 10) > 0.0001) {
      throw new Error('CUSTOM weights must sum to exactly 10');
    }
    if (p1_count === 0 && p1_weight !== 0) {
      throw new Error('CUSTOM p1_weight must be 0 when Part 1 has no questions');
    }
    if (p2_count === 0 && p2_weight !== 0) {
      throw new Error('CUSTOM p2_weight must be 0 when Part 2 has no questions');
    }
    if (p3_count === 0 && p3_weight !== 0) {
      throw new Error('CUSTOM p3_weight must be 0 when Part 3 has no questions');
    }

    const p1_score = p1_max > 0 ? (p1_earned / p1_max) * p1_weight : 0;
    const p2_score = p2_max > 0 ? (p2_earned / p2_max) * p2_weight : 0;
    const p3_score = p3_max > 0 ? (p3_earned / p3_max) * p3_weight : 0;

    final_score = Math.round((p1_score + p2_score + p3_score) * 100) / 100;
  } else {
    throw new Error(`Unsupported assessment_type: ${assessment_type}`);
  }

  return {
    final_score,
    grading_details,
    raw_maxima: { p1_max, p2_max, p3_max },
    raw_earned: { p1_earned, p2_earned, p3_earned }
  };
}

// =========================================================================
// SCORE TEST CASES
// =========================================================================

// SCORE-04: LEGACY P1-only: 1 correct answer -> 0.25, NOT 10
{
  const result = gradeSubmissionEngine({
    room: { assessment_type: 'LEGACY' },
    exam: [{ phan: '1', dap_an_dung: 'A' }],
    submission: { raw_answers: [{ chon: 'A' }] }
  });
  assert.strictEqual(result.final_score, 0.25, 'SCORE-04: LEGACY 1 correct question must yield 0.25 (not normalized to 10)');
}

// SCORE-05: TOT_NGHIEP mixed: P1 + P2 + P3 raw scoring correct, no normalization
{
  const result = gradeSubmissionEngine({
    room: { assessment_type: 'TOT_NGHIEP' },
    exam: [
      { phan: '1', dap_an_dung: 'A' },
      { phan: '2', dap_an_dung: 'Đ-Đ-S-S' },
      { phan: '3', dap_an_dung: '1.5' }
    ],
    submission: {
      raw_answers: [
        { chon: 'A' },      // P1 correct: 0.25
        { chon: 'Đ-Đ-S-Đ' },  // P2 3 matches: 0.5
        { chon: '1,5' }     // P3 correct: 0.25
      ]
    }
  });
  assert.strictEqual(result.final_score, 1.00, 'SCORE-05: TOT_NGHIEP score must be unnormalized sum (0.25 + 0.5 + 0.25 = 1.00)');
}

// SCORE-06: MCQ_ONLY: 3/4 correct -> 7.50
{
  const result = gradeSubmissionEngine({
    room: { assessment_type: 'MCQ_ONLY' },
    exam: [
      { phan: '1', dap_an_dung: 'A' },
      { phan: '1', dap_an_dung: 'B' },
      { phan: '1', dap_an_dung: 'C' },
      { phan: '1', dap_an_dung: 'D' }
    ],
    submission: {
      raw_answers: [
        { chon: 'A' },
        { chon: 'B' },
        { chon: 'C' },
        { chon: 'A' } // wrong
      ]
    }
  });
  assert.strictEqual(result.final_score, 7.50, 'SCORE-06: MCQ_ONLY 3/4 correct must be 7.50');
}

// SCORE-07: TRUE_FALSE_ONLY: e.g. 2 questions: raw earned 1.25 / raw max 2 -> 6.25
{
  const result = gradeSubmissionEngine({
    room: { assessment_type: 'TRUE_FALSE_ONLY' },
    exam: [
      { phan: '2', dap_an_dung: 'Đ-Đ-S-S' }, // Q1 max 1.0
      { phan: '2', dap_an_dung: 'D-S-D-S' }  // Q2 max 1.0
    ],
    submission: {
      raw_answers: [
        { chon: 'Đ-Đ-S-S' }, // 4 matches -> 1.0
        { chon: 'D-S-S-D' }  // 2 matches -> 0.25
      ]
    }
  });
  assert.strictEqual(result.final_score, 6.25, 'SCORE-07: TRUE_FALSE_ONLY (1.25 / 2.0) * 10 must be 6.25');
}

// SCORE-08: SHORT_ONLY: 3/4 correct -> 7.50
{
  const result = gradeSubmissionEngine({
    room: { assessment_type: 'SHORT_ONLY' },
    exam: [
      { phan: '3', dap_an_dung: '1.5' },
      { phan: '3', dap_an_dung: '1/2' },
      { phan: '3', dap_an_dung: 'xyz' },
      { phan: '3', dap_an_dung: '100' }
    ],
    submission: {
      raw_answers: [
        { chon: '1,5' },
        { chon: ' 1/2 ' },
        { chon: 'XYZ' },
        { chon: '999' } // wrong
      ]
    }
  });
  assert.strictEqual(result.final_score, 7.50, 'SCORE-08: SHORT_ONLY 3/4 correct must be 7.50');
}

// SCORE-09: CUSTOM: test example with P1/P2/P3 and accurate 2-decimal final score
{
  const result = gradeSubmissionEngine({
    room: {
      assessment_type: 'CUSTOM',
      scoring_config: { p1_weight: 4, p2_weight: 4, p3_weight: 2 }
    },
    exam: [
      { phan: '1', dap_an_dung: 'A' },
      { phan: '1', dap_an_dung: 'B' },
      { phan: '2', dap_an_dung: 'Đ-Đ-S-S' },
      { phan: '3', dap_an_dung: '10' }
    ],
    submission: {
      raw_answers: [
        { chon: 'A' }, // P1: 1/2 -> 2.00
        { chon: 'C' },
        { chon: 'Đ-Đ-S-S' }, // P2: 4/4 -> 4.00
        { chon: '10' } // P3: 1/1 -> 2.00
      ]
    }
  });
  assert.strictEqual(result.final_score, 8.00, 'SCORE-09: CUSTOM score must be 8.00');
}

// SCORE-10: CUSTOM weights not summing to 10 -> reject
{
  assert.throws(() => {
    gradeSubmissionEngine({
      room: {
        assessment_type: 'CUSTOM',
        scoring_config: { p1_weight: 5, p2_weight: 4, p3_weight: 2 } // sum = 11
      },
      exam: [{ phan: '1', dap_an_dung: 'A' }],
      submission: { raw_answers: [{ chon: 'A' }] }
    });
  }, /sum to exactly 10/i, 'SCORE-10: CUSTOM weights not summing to 10 must throw exception');
}

// SCORE-11: CUSTOM absent part but weight > 0 -> reject
{
  assert.throws(() => {
    gradeSubmissionEngine({
      room: {
        assessment_type: 'CUSTOM',
        scoring_config: { p1_weight: 7, p2_weight: 3, p3_weight: 0 } // P2 has weight 3 but no P2 questions
      },
      exam: [{ phan: '1', dap_an_dung: 'A' }],
      submission: { raw_answers: [{ chon: 'A' }] }
    });
  }, /p2_weight must be 0/i, 'SCORE-11: CUSTOM absent part with weight > 0 must throw exception');
}

// SCORE-12: MCQ_ONLY containing P2/P3 -> reject
{
  assert.throws(() => {
    gradeSubmissionEngine({
      room: { assessment_type: 'MCQ_ONLY' },
      exam: [
        { phan: '1', dap_an_dung: 'A' },
        { phan: '2', dap_an_dung: 'Đ-Đ-S-S' }
      ],
      submission: { raw_answers: [{ chon: 'A' }, { chon: 'Đ-Đ-S-S' }] }
    });
  }, /MCQ_ONLY requires all questions to be Part 1/i, 'SCORE-12: MCQ_ONLY containing P2 must throw exception');
}

// SCORE-13: TRUE_FALSE_ONLY containing part other than P2 -> reject
{
  assert.throws(() => {
    gradeSubmissionEngine({
      room: { assessment_type: 'TRUE_FALSE_ONLY' },
      exam: [
        { phan: '1', dap_an_dung: 'A' },
        { phan: '2', dap_an_dung: 'Đ-Đ-S-S' }
      ],
      submission: { raw_answers: [{ chon: 'A' }, { chon: 'Đ-Đ-S-S' }] }
    });
  }, /TRUE_FALSE_ONLY requires all questions to be Part 2/i, 'SCORE-13: TRUE_FALSE_ONLY containing P1 must throw exception');
}

// SCORE-14: SHORT_ONLY containing part other than P3 -> reject
{
  assert.throws(() => {
    gradeSubmissionEngine({
      room: { assessment_type: 'SHORT_ONLY' },
      exam: [
        { phan: '1', dap_an_dung: 'A' },
        { phan: '3', dap_an_dung: '10' }
      ],
      submission: { raw_answers: [{ chon: 'A' }, { chon: '10' }] }
    });
  }, /SHORT_ONLY requires all questions to be Part 3/i, 'SCORE-14: SHORT_ONLY containing P1 must throw exception');
}

// SCORE-15: Unknown non-legacy part in new assessment type -> reject
{
  assert.throws(() => {
    gradeSubmissionEngine({
      room: { assessment_type: 'TOT_NGHIEP' },
      exam: [{ phan: '99', dap_an_dung: 'A' }],
      submission: { raw_answers: [{ chon: 'A' }] }
    });
  }, /Unknown question part|invalid question parts/i, 'SCORE-15: Unknown non-legacy part in TOT_NGHIEP must throw exception');
}

// SCORE-16: ket_qua.diem and exam_submissions.score use identical final_score
{
  const insertKetQuaMatch = migrationSql.match(/insert\s+into\s+public\.ket_qua[\s\S]*?values\s*\([^)]*?v_final_score/i);
  const updateSubMatch = migrationSql.match(/update\s+public\.exam_submissions\s+set\s+status\s*=\s*'graded',\s*score\s*=\s*v_final_score/i);
  assert(insertKetQuaMatch, 'SCORE-16: ket_qua must be inserted/updated with v_final_score');
  assert(updateSubMatch, 'SCORE-16: exam_submissions.score must be set to v_final_score');
}

// SCORE-17: grading_details still raw per-question details
{
  const result = gradeSubmissionEngine({
    room: { assessment_type: 'MCQ_ONLY' },
    exam: [
      { phan: '1', dap_an_dung: 'A' },
      { phan: '1', dap_an_dung: 'B' }
    ],
    submission: {
      raw_answers: [
        { chon: 'A' },
        { chon: 'C' }
      ]
    }
  });
  assert.strictEqual(result.grading_details.length, 2);
  assert.strictEqual(result.grading_details[0].diem, 0.25, 'SCORE-17: raw diem in grading_details must be 0.25');
  assert.strictEqual(result.grading_details[1].diem, 0, 'SCORE-17: raw diem in grading_details must be 0');
  assert.deepStrictEqual(Object.keys(result.grading_details[0]).sort(), ['chon', 'diem', 'dung', 'phan', 'q'].sort());
}

// SCORE-18: graded submission idempotency returns stored score
{
  assert(
    /if\s+v_submission\.status\s*=\s*'graded'\s+then[\s\S]*return\s+jsonb_build_object\('status',\s*'graded',\s*'submission_id',\s*v_submission\.id,\s*'score',\s*v_submission\.score/i.test(migrationSql),
    'SCORE-18: rpc_grade_submission must return stored score idempotently if already graded'
  );
}

// SCORE-21: CUSTOM with null weights (p1_weight: 10, p2_weight: null, p3_weight: null) -> reject
{
  assert.throws(() => {
    gradeSubmissionEngine({
      room: {
        assessment_type: 'CUSTOM',
        scoring_config: { p1_weight: 10, p2_weight: null, p3_weight: null }
      },
      exam: [{ phan: '1', dap_an_dung: 'A' }],
      submission: { raw_answers: [{ chon: 'A' }] }
    });
  }, /valid numeric values/i, 'SCORE-21: CUSTOM with null weights must throw exception');
}

// SCORE-22: CUSTOM with partial null weights (p1_weight: null, p2_weight: 0, p3_weight: 10) -> reject
{
  assert.throws(() => {
    gradeSubmissionEngine({
      room: {
        assessment_type: 'CUSTOM',
        scoring_config: { p1_weight: null, p2_weight: 0, p3_weight: 10 }
      },
      exam: [
        { phan: '1', dap_an_dung: 'A' },
        { phan: '3', dap_an_dung: '1.5' }
      ],
      submission: { raw_answers: [{ chon: 'A' }, { chon: '1,5' }] }
    });
  }, /valid numeric values/i, 'SCORE-22: CUSTOM with partial null weights must throw exception');
}

// SCORE-23: LEGACY empty array cau_so=[] -> graded with score 0
{
  const result = gradeSubmissionEngine({
    room: { assessment_type: 'LEGACY' },
    exam: [],
    submission: { raw_answers: [] }
  });
  assert.strictEqual(result.final_score, 0, 'SCORE-23: LEGACY empty array must produce score 0');
  assert.strictEqual(result.grading_details.length, 0);
}

console.log('PASS: flex_lite_scoring_server_simulation.js (SCORE-01 through SCORE-23 passed)');
