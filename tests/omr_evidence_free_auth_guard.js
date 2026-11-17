const fs=require('fs'),assert=require('assert');
const config=fs.readFileSync('supabase/config.toml','utf8');
const edge=fs.readFileSync('supabase/functions/omr-evidence/index.ts','utf8');
const d=fs.readFileSync('docs/omr-evidence-ddl-proposal.sql','utf8');
assert(/\[functions\.omr-evidence\]\s*verify_jwt\s*=\s*false\b/.test(config),'Opaque session Edge endpoint needs its own JWT gateway configuration');
assert(!/\[functions\.[^\]]+\]/.test(config.replace('[functions.omr-evidence]','')),
 'No other Supabase function JWT setting may be modified');
assert(edge.includes('await actorFrom(body.staff_token)'),'Every action must validate revocable staff session');
assert(edge.includes('switch(body.action)'),'Action dispatch must come after staff validation');
assert(edge.indexOf('await actorFrom(body.staff_token)')<edge.indexOf('switch(body.action)'),'Incorrect auth order');
assert(edge.includes('room.truong_id!==actor.school'),'Room must stay scoped to the school');
assert(edge.includes('const OFFICIAL_ENABLED = true;'),'Official mode must be enabled for authenticated staff');
assert(edge.includes('if(mode==="official"&&!OFFICIAL_ENABLED)'),'Official mode retains explicit safety gate');
assert(edge.includes('room.ma_phong!=="OMR_V7_TEST"'),'Trial images restricted to test room');
assert(!edge.includes('test_evidence_quota_reached'),'No arbitrary 200-record test cap');
assert(edge.includes('const MAX_IMAGE = 1_500_000;'),'Retain per-image Free Storage safety');
assert(edge.includes('official_answers_mismatch'),'Official evidence must match graded answers');
assert(d.includes('revoke all on public.omr_artifacts from public, anon, authenticated'));
console.log('PASS: Free-only private OMR evidence JWT/session/Storage guard');
