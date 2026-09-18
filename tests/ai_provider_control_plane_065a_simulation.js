const fs=require('fs');
const assert=require('assert');

const migration=fs.readFileSync('supabase/migrations/20260918152000_ai_provider_control_plane_065a.sql','utf8');
const edge=fs.readFileSync('supabase/functions/ai-provider-control/index.ts','utf8');
const html=fs.readFileSync('ai_provider.html','utf8');
const js=fs.readFileSync('ai_provider.js','utf8');

assert(/create table if not exists public\.ai_provider_connections/i.test(migration),'065A provider table missing');
assert(/create table if not exists public\.ai_model_profiles/i.test(migration),'065A model table missing');
assert(/owner_scope.*PERSONAL.*SCHOOL.*SYSTEM/is.test(migration),'065A scope contract missing');
assert(/OPENAI_RESPONSES.*OPENAI_CHAT.*OPENAI_COMPAT.*ANTHROPIC_MESSAGES.*GEMINI_GENERATE_CONTENT.*CUSTOM_JSON_HTTP/is.test(migration),'065A adapter registry incomplete');
assert(/vault\.create_secret/i.test(migration),'065A must write credentials to Supabase Vault');
assert(/vault\.update_secret/i.test(migration),'065A must rotate Vault credentials');
assert(/vault\.decrypted_secrets/i.test(migration),'065A server-only secret read missing');
assert(/revoke all on function public\._ai_provider_vault_read_065a\(uuid\) from public, anon, authenticated/i.test(migration),'065A secret reader must not be browser callable');
assert(/grant execute on function public\._ai_provider_vault_read_065a\(uuid\) to service_role/i.test(migration),'065A secret reader must be service-role only');
assert(/enable row level security/i.test(migration),'065A provider tables must have RLS enabled');

assert(edge.includes('SUPABASE_SERVICE_ROLE_KEY'),'065A edge function must use server-side service role');
assert(edge.includes('requireStaff'),'065A edge function must bind every action to staff session');
assert(edge.includes('provider_secret_missing'),'065A edge function must fail closed when a required secret is absent');
assert(edge.includes('provider_url_private_forbidden'),'065A SSRF private-host rejection missing');
assert(edge.includes('redirect:"manual"'),'065A provider test must not follow redirects');
assert(edge.includes('https:'),'065A must require HTTPS provider URLs');
assert(edge.includes('OPENAI_COMPAT')&&edge.includes('ANTHROPIC_MESSAGES')&&edge.includes('GEMINI_GENERATE_CONTENT'),'065A provider adapters missing');
assert(edge.includes('discovery_mode')&&edge.includes('MANUAL'),'065A manual model mode missing');
assert(edge.includes('save_model')&&edge.includes('test_provider'),'065A model/test actions missing');
assert(!edge.includes('localStorage.setItem'),'Edge function must never persist secrets client-side');

assert(html.includes('Kết nối AI API'),'065A provider UI missing');
assert(html.includes('OpenAI-compatible'),'065A OpenAI-compatible option missing');
assert(html.includes('Custom JSON HTTP'),'065A custom provider option missing');
assert(html.includes('PERSONAL')&&html.includes('SCHOOL'),'065A ownership UI missing');
assert(html.includes('type="password"'),'065A API key field must be password type');
assert(/ai_provider\.js\?v=20260918-provider-control-065[ac]/.test(html),'065A/065C provider cache marker missing');
assert(js.includes('/functions/v1/ai-provider-control'),'065A UI must call provider control edge function');
assert(js.includes("sessionStorage.getItem('damSan_StaffToken')"),'065A must reuse staff session boundary');
assert(!/localStorage\.setItem\([^,]+,\s*[^)]*api/i.test(js),'065A must never store API key in localStorage');
assert(!/sessionStorage\.setItem\([^,]+,\s*[^)]*api/i.test(js),'065A must never store API key in sessionStorage');
assert(js.includes("document.getElementById('apiKey').value=''"),'065A UI must clear plaintext key after save');

console.log('PASS ai_provider_control_plane_065a_simulation');
