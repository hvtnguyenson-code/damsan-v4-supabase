const fs=require('fs');
const assert=require('assert');

const shared=fs.readFileSync('supabase/functions/_shared/exam_stimulus_104.ts','utf8');
const bridge=fs.readFileSync('supabase/functions/exam-ai-bridge/index.ts','utf8');
const probe=fs.readFileSync('supabase/functions/stimulus-engine-probe-104/index.ts','utf8');
const preview=fs.readFileSync('ai_exam_stimulus_engine_104.js','utf8');
const aiHtml=fs.readFileSync('ai_exam.html','utf8');
const studentHtml=fs.readFileSync('hoc_sinh.html','utf8');
const studentJs=fs.readFileSync('hoc_sinh.js','utf8');
const docx=fs.readFileSync('print_docx_exporter.js','utf8');

for(const type of ['TABLE','CHART','MAP','SCHEMATIC_MAP','IMAGE','DIAGRAM','CLIMOGRAPH','CROSS_SECTION','MULTI_SOURCE']){
  assert(shared.includes('"'+type+'"'),'104 shared engine missing '+type);
  assert(probe.includes(type+':')||probe.includes('name === "'+type+'"'),'104 runtime probe missing '+type);
}
for(const kind of ['BAR','LINE','GROUPED_BAR','STACKED_100']){
  assert(shared.includes('"'+kind+'"'),'104 chart kind missing '+kind);
}

assert(shared.includes('DAMSAN_STIMULUS_V1'),'104 stimulus schema missing');
assert(shared.includes('normalizeAndRenderStimulus104'),'104 normalizer/renderer export missing');
assert(shared.includes('composeStimulusStem104'),'104 canonical stem composer missing');
assert(shared.includes('data-damsan-stimulus-root'),'104 canonical root marker missing');
assert(shared.includes('data-damsan-stimulus-image'),'104 canonical image marker missing');
assert(shared.includes("data-damsan-p3='1'"),'104 structured P3 table must preserve quantitative marker');
assert(shared.includes('data:image/svg+xml;base64,'),'104 server SVG data URI renderer missing');
assert(shared.includes('SOURCE_GROUNDED'),'104 grounded MAP policy missing');
assert(shared.includes('stimulus_map_provenance_required'),'104 real MAP provenance guard missing');
assert(shared.includes('external_http_images:false'),'104 external image prohibition missing');
assert(shared.includes('inline_svg_input:false'),'104 arbitrary SVG input must be forbidden');
assert(shared.includes('^data:image\\/(?:png|jpe?g|webp);base64,'),'104 IMAGE input whitelist missing');

assert(bridge.includes('../_shared/exam_stimulus_104.ts'),'104 bridge shared-module import missing');
assert(bridge.includes('stimulus_not_enabled'),'104 non-Geography/unplanned stimulus guard missing');
assert(bridge.includes('DAMSAN_GEO_BLUEPRINT_V1')&&bridge.includes('DAMSAN_GEO_DESIGN_PLAN_V1'),'104 must require P1 blueprint+plan');
assert(bridge.includes('questions: normalizedQuestions'),'104 normalized rendered questions must feed quality gates');
assert(bridge.includes('stimulus_engine_version: "104"'),'104 validation telemetry missing');
assert(bridge.includes('stimulus_types: Array.from(stimulusTypes).sort()'),'104 stimulus telemetry missing');
assert(bridge.includes('noi_dung: noiDung'),'104 canonical room variant must carry rendered stem');

const instructionStart=bridge.indexOf('function generationInstructions');
const instructionEnd=bridge.indexOf('async function getGenerationInput',instructionStart);
assert(instructionStart>=0&&instructionEnd>instructionStart,'104 generation instruction block not found');
const instructions=bridge.slice(instructionStart,instructionEnd);
assert(!/question_fields[^\n]*stimulus/i.test(instructions),'104 must not activate stimulus authoring in generator instructions yet');
assert(!/DAMSAN_STIMULUS_V1/.test(instructions),'104 contract must stay inactive in generator prompt');

assert(aiHtml.includes('./vendor/student/dompurify-3.0.6.min.js'),'104 teacher preview must use pinned local DOMPurify');
assert(aiHtml.includes('ai_exam_stimulus_engine_104.js?v=20261105-stimulus-engine-104'),'104 teacher preview overlay missing');
assert(aiHtml.indexOf('dompurify-3.0.6.min.js')<aiHtml.indexOf('ai_exam_stimulus_engine_104.js'),'104 sanitizer must load before preview overlay');
assert(preview.includes('window.DOMPurify.sanitize'),'104 teacher rich-stem sanitizer missing');
assert(preview.includes('ALLOWED_TAGS'),'104 preview sanitizer allowlist missing');
assert(preview.includes('data-damsan-stimulus-root'),'104 preview root marker handling missing');

assert(/safeHTML\(cau\.noi_dung\s*\|\|\s*cau\.NoiDung\)/.test(studentJs),'104 student room must keep canonical sanitized noi_dung path');
assert(studentHtml.includes("img[data-damsan-stimulus-image='1']"),'104 responsive student stimulus image CSS missing');
assert(studentHtml.includes('.damsan-stimulus-title'),'104 student stimulus typography missing');

assert(docx.includes("mime === 'image/svg+xml'"),'104 DOCX exporter must support server-generated SVG images');
assert(docx.includes("tag === 'img'"),'104 DOCX exporter must consume canonical image tags');
assert(probe.includes('results.length === 9'),'104 runtime probe must require all 9 stimulus families');

console.log('AI_GEOGRAPHY_STIMULUS_ENGINE_104_PASS');
