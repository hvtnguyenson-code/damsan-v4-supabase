const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const migration = fs.readFileSync('supabase/migrations/20260912002000_normalized_source_explicit_subject_040a.sql','utf8');
const ui = fs.readFileSync('knowledge_normalized_source.js','utf8');
const bridge = fs.readFileSync('supabase/functions/knowledge-normalized-source/index.ts','utf8');

new vm.Script(ui, { filename: 'knowledge_normalized_source.js' });

assert(migration.includes('rpc_knowledge_subject_catalog'), '040A subject catalogue RPC missing');
assert(migration.includes('rpc_knowledge_set_subject_grade'), '040A explicit subject/grade binding RPC missing');
assert(migration.includes("return jsonb_build_object('status','error','code','subject_required')"), '040A subject must be required server-side');
assert(migration.includes("v_actor.mon_id is not null and v_actor.mon_id is distinct from p_mon_id"), '040A teacher subject scope guard missing');
assert(migration.includes("set source_role='KNOWLEDGE_SOURCE'"), '040A subject changes must neutralize stale authority role');
assert(migration.includes('delete from public.assessment_profile_sources'), '040A subject changes must revoke stale authority binding');

assert(ui.includes('id="normalizedSubject"'), '040A UI subject selector missing');
assert(ui.includes('Môn *'), '040A subject must be visibly mandatory');
assert(ui.includes("rpc_knowledge_subject_catalog"), '040A browser must load subjects from server');
assert(ui.includes("rpc_knowledge_set_subject_grade"), '040A browser must persist subject before prompt/import');
assert(ui.includes('AI không được tự đoán'), '040A UX must state subject is not inferred by AI');
assert(ui.includes('payload.mon_id !== preparedSubjectId'), '040A import must reject subject drift after prompt generation');
assert(ui.includes("data?.selected_metadata?.subject_name !== payload.subject_name"), '040A prompt must verify server subject identity');
assert(ui.includes('môn học cũng đã thay đổi'), '040A drift error must explicitly mention subject drift');

assert(bridge.includes('subject_name: subject'), '040A prompt bridge must emit explicit subject_name');
assert(bridge.includes('manifest.subject_name = subject'), '040A import bridge must canonicalize subject_name');

console.log('PASS: 040A explicit normalized-source subject binding');
