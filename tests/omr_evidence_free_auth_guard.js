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
assert(edge.includes('if(mode==="official"&&!OFFICIAL_ENABLED)'),'Official image upload remains disabled');
assert(edge.includes('room.ma_phong!=="OMR_V7_TEST"'),'Trial images restricted to test room');
assert(edge.includes('if((count||0)>=200)'),'Free Storage test cap must remain enabled');
assert(d.includes('revoke all on public.omr_artifacts from public, anon, authenticated'));
console.log('PASS: Free-only private OMR evidence JWT/session/Storage guard');
