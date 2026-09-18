const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','20260918163000_ai_api_generation_engine_065b.sql'),'utf8');
const edge=fs.readFileSync(path.join(root,'supabase','functions','exam-ai-orchestrator','index.ts'),'utf8');
function must(v,msg){if(!v)throw new Error(msg);}

must(/create table if not exists public\.ai_generation_runs/i.test(migration),'065B-01 generation run audit table missing');
must(/create table if not exists public\.ai_generation_attempts/i.test(migration),'065B-02 attempt audit table missing');
must(/revoke all on table public\.ai_generation_runs from public, anon, authenticated/i.test(migration),'065B-03 run table must not be browser-readable');
must(/prompt_sha256/i.test(migration)&&!/prompt\s+text/i.test(migration),'065B-04 audit stores prompt hash, not full prompt');
must(/provider_name_snapshot/i.test(migration)&&/model_id_snapshot/i.test(migration),'065B-05 provider/model snapshots required');

must(/from\("staff_sessions"\)/.test(edge),'065B-06 orchestrator authenticates staff session');
must(/requested_by!==actor\.id/.test(edge),'065B-07 request generation is owner-bound');
must(/_ai_provider_vault_read_065a/.test(edge),'065B-08 provider secret is read server-side from Vault');
must(!/localStorage|sessionStorage/.test(edge),'065B-09 server orchestrator must not use browser storage');
must(/redirect:"manual"/.test(edge),'065B-10 provider redirects are blocked');
must(/provider_url_private_forbidden/.test(edge),'065B-11 direct private targets are blocked');
must(/MAX_PROMPT_CHARS = 7_500_000/.test(edge),'065B-12 prompt input is bounded');
must(/MAX_PROVIDER_RESPONSE_CHARS = 3_000_000/.test(edge),'065B-13 provider response is bounded');

for(const adapter of ['OPENAI_RESPONSES','OPENAI_CHAT','OPENAI_COMPAT','ANTHROPIC_MESSAGES','GEMINI_GENERATE_CONTENT','CUSTOM_JSON_HTTP']){
  must(edge.includes(adapter),`065B adapter missing: ${adapter}`);
}
must(/chat\/completions/.test(edge),'065B-14 OpenAI-compatible Chat Completions route missing');
must(/models\/\$\{encodeURIComponent\(cleanModel\)\}:generateContent/.test(edge),'065B-15 Gemini generateContent route missing');
must(/response_text_path/.test(edge)&&/request_template/.test(edge),'065B-16 custom JSON adapter mapping missing');
must(/response_format=\{type:"json_object"\}|response_format:\{type:"json_object"\}/.test(edge)||/body\.response_format=\{type:"json_object"\}/.test(edge),'065B-17 JSON mode capability path missing');

must(/rpc_ai_exam_issue_handoff_service/.test(edge),'065B-18 API execution gets a request-scoped handoff');
must(/functions\/v1\/exam-ai-bridge/.test(edge),'065B-19 API output must return through canonical bridge');
must(/action:"submit_exam_draft"/.test(edge),'065B-20 canonical draft submission action missing');
must(/status:"VALIDATED"/.test(edge),'065B-21 successful generation ends in validated audit state');
must(/action==="list_runs"/.test(edge),'065B-22 generation audit read action missing');

console.log('PASS ai_api_generation_engine_065b_simulation');
