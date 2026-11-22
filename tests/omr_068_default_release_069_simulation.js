'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');
const pieces=['omr-v7-geometry-060','omr-v7-geometry-066','omr-v7-ink-060',
 'omr-v7-photometry-067','omr-v7-photometry-068','omr-v7-pipeline-068',
 'omr-result-write','omr-v7-evidence','omr-release-068','omr-teacher-module-068'];
const bundle=pieces.map(name=>read('omr/'+name+'.js').trimEnd()).join('\n;\n')+'\n';
const path='omr/omr-runtime-068-default-20261122.js';
assert.equal(read(path),bundle,'new versioned browser runtime must match source exactly');
const module=read('omr/omr-teacher-module-068.js');
const html=read('teacher/index.html'),desktop=read('giaovien.html'),sw=read('teacher/sw.js');
assert(module.includes("officialEngine:'v7_068'"),'068 must be initial default');
assert(module.includes("state.officialEngine=targetEngine;"));
assert(module.includes("resumeDraft?'v7':'v7_068'"),'valid unfinished V7 draft must resume V7');
assert(module.includes('const inMemoryEngine=state.lastScan?.ok'), 'unfinished in-memory scans must not switch engines');
assert(module.includes('const resumeCommitted=!!state.evidenceCommittedSubmissionId'), 'already committed receipt must not change engine');
assert(module.includes('if(!resumeCommitted&&state.officialEngine!==targetEngine&&state.lastScan)'));
assert(module.includes("state.restoring=true;"),'temporary recovery flag prevents persisted draft deletion');
assert(module.includes('V7 — dự phòng'), 'V7 fallback choice is required');
assert(module.includes('068 — mặc định (nhận dạng cải tiến)'));
assert(module.indexOf('option value="v7_068"')<module.indexOf('option value="v7"'));
assert(module.includes("if(!['v7','v7_068'].includes(chosen))"));
assert(module.includes('closeCamera();resetScan();state.officialEngine=chosen'));
for(const [name,src] of [['PWA',html],['desktop',desktop]]){
 assert(src.includes('omr-runtime-068-default-20261122.js'),name+' new runtime missing');
 assert(!src.includes('src="../omr/omr-runtime-068-20261122.js"')&&!src.includes('src="omr/omr-runtime-068-20261122.js'),name+' old activation must be absent');
}
assert(html.includes('omr-v7-runtime-20261116-046.js'),'V7 fallback bundle must remain loaded');
assert(fs.existsSync('omr/omr-runtime-068-20261122.js'),'prior 068 asset must remain for installed clients');
assert(sw.includes("'../omr/omr-runtime-068-default-20261122.js'"),'service worker offline precache missing');
assert(sw.includes("'-omr059-omr068-default'"),'new cache revision required');
assert(sw.includes("'./omr-v7-runtime-20261116-046.js'"),'V7 must stay in the offline cache');
assert(read('omr/omr-teacher-module.js').includes("officialEngine:'v7'"),'old canonical V7 code must remain intact');
const test=read('tests/run_teacher_omr_068_release.mjs');
assert(test.includes("Expected 068 default and V7 fallback"));
assert(test.includes("Unfinished in-memory V7 scan must keep V7"));
assert(test.includes("Committed evidence must retain the selected engine"));
console.log('PASS OMR 069: default 068, isolated V7 fallback, unfinished V7 work protected, offline assets versioned');
