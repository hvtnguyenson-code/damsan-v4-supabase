const fs=require('fs');
const html=fs.readFileSync('ai_exam.html','utf8');
const api=fs.readFileSync('ai_exam_api_mode_065c.js','utf8');
const providerHtml=fs.readFileSync('ai_provider.html','utf8');
const providerJs=fs.readFileSync('ai_provider.js','utf8');
function must(v,msg){if(!v)throw new Error(msg);}

// Existing Web-AI path remains present and the API path is an explicit opt-in.
must(/id="provider"/.test(html)&&/CHATGPT_WEB/.test(html)&&/id="resultBox"/.test(html),'065C-01 Web-AI input path must remain intact');
must(/<option value="WEB">AI Web/.test(api)&&/<option value="API">API/.test(api),'065C-02 execution mode selector missing');
must(/id="aiExecutionMode"/.test(api),'065C-03 Web/API mode control missing');
must(/ai_exam_api_mode_065c\.js\?v=20260918-api-mode-065c/.test(html),'065C-04 API overlay cache marker missing');
must(html.indexOf('ai_exam_discrimination_quality_062.js')<html.indexOf('ai_exam_api_mode_065c.js'),'065C-05 API mode must consume the final 060/062 prompt contract');

// API generation sends the exact prompt already built by the Web-AI contract and same request id.
must(/document\.getElementById\('promptBox'\)\?\.value/.test(api),'065C-06 API must use current canonical promptBox');
must(/request_id:\s*aieCurrentRequestId/.test(api),'065C-07 API generation must stay on current exam request');
must(/action:\s*'generate_exam'/.test(api),'065C-08 orchestrator action missing');
must(/\/functions\/v1\/exam-ai-orchestrator/.test(api),'065C-09 orchestrator endpoint missing');
must(/\/functions\/v1\/ai-provider-control/.test(api),'065C-10 provider registry endpoint missing');
must(/aieLoadRequests\(result\.request_id\)/.test(api),'065C-11 validated API draft must return to existing review UI');
must(/aieCapability\s*=\s*''/.test(api),'065C-12 browser handoff capability is cleared after API validation');

// Provider/model selection remains dynamic; no provider secret is embedded in the exam UI.
must(/apiProviderSelect/.test(api)&&/apiModelSelect/.test(api),'065C-13 dynamic provider/model selectors missing');
must(/apiReasoning/.test(api)&&/apiTemperature/.test(api)&&/apiTopP/.test(api)&&/apiMaxOutput/.test(api),'065C-14 model parameter controls missing');
must(!/api_key\s*:/.test(api),'065C-15 exam API overlay must never accept a provider API key');
must(!/localStorage\.setItem|sessionStorage\.setItem/.test(api),'065C-16 API overlay must not persist credentials or prompt state');

// Advanced provider configuration supports intermediaries and non-standard JSON APIs without source changes.
must(/id="providerOptions"/.test(providerHtml)&&/generation_path/.test(providerHtml)&&/response_text_path/.test(providerHtml),'065C-17 custom provider mapping UI missing');
must(/id="modelCapabilities"/.test(providerHtml)&&/id="modelParameters"/.test(providerHtml),'065C-18 model capability/default parameter UI missing');
must(/provider_options:parseObjectField\('providerOptions'/.test(providerJs),'065C-19 provider options are persisted through control plane');
must(/capabilities:parseObjectField\('modelCapabilities'/.test(providerJs),'065C-20 model capabilities are persisted');
must(/default_parameters:parseObjectField\('modelParameters'/.test(providerJs),'065C-21 model default parameters are persisted');
must(!/localStorage\.setItem\([^\n]*(apiKey|api_key)|sessionStorage\.setItem\([^\n]*(apiKey|api_key)/i.test(providerJs),'065C-22 provider key must never be written to browser storage');
must(/type="password"/.test(providerHtml)&&/Supabase Vault/.test(providerHtml),'065C-23 provider key UI must remain write-only/Vault-backed');

console.log('PASS ai_exam_api_mode_065c_simulation');
