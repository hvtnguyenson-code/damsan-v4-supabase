const fs=require('fs');
const html=fs.readFileSync('ai_exam.html','utf8');
const api=fs.readFileSync('ai_exam_api_mode_065c.js','utf8');
const providerHtml=fs.readFileSync('ai_provider.html','utf8');
const providerJs=fs.readFileSync('ai_provider.js','utf8');
function must(v,msg){if(!v)throw new Error(msg);}

// Existing Web-AI path remains present and API stays an explicit opt-in.
must(/id="provider"/.test(html)&&/CHATGPT_WEB/.test(html)&&/id="resultBox"/.test(html),'065D-01 Web-AI input path must remain intact');
must(/<option value="WEB">Dùng AI Web như hiện tại/.test(api)&&/<option value="API">Tạo tự động bằng API/.test(api),'065D-02 simplified execution selector missing');
must(/id="aiExecutionMode"/.test(api),'065D-03 Web/API mode control missing');
must(/ai_exam_api_mode_065c\.js\?v=20260918-api-mode-065c/.test(html),'065D-04 API overlay include missing');
must(html.indexOf('ai_exam_discrimination_quality_062.js')<html.indexOf('ai_exam_api_mode_065c.js'),'065D-05 API mode must consume final 060/062 prompt contract');

// API generation sends the exact prompt already built by the existing authoring contract.
must(/document\.getElementById\('promptBox'\)\?\.value/.test(api),'065D-06 API must use current canonical promptBox');
must(/request_id:\s*aieCurrentRequestId/.test(api),'065D-07 API generation must stay on current exam request');
must(/action:\s*'generate_exam'/.test(api),'065D-08 orchestrator action missing');
must(/\/functions\/v1\/exam-ai-orchestrator/.test(api),'065D-09 orchestrator endpoint missing');
must(/\/functions\/v1\/ai-provider-control/.test(api),'065D-10 provider registry endpoint missing');
must(/aieLoadRequests\(result\.request_id\)/.test(api),'065D-11 validated API draft must return to existing review UI');
must(/aieCapability\s*=\s*''/.test(api),'065D-12 browser handoff capability is cleared after API validation');

// Simple path exposes only connection + model; tuning remains inside collapsed advanced details.
must(/apiProviderSelect/.test(api)&&/apiModelSelect/.test(api),'065D-13 dynamic provider/model selectors missing');
must(/<details[^>]*>/.test(api)&&/Tùy chọn nâng cao — có thể bỏ qua/.test(api),'065D-14 tuning controls must be collapsed');
must(/apiReasoning/.test(api)&&/apiTemperature/.test(api)&&/apiTopP/.test(api)&&/apiMaxOutput/.test(api),'065D-15 advanced model parameters must remain available');
must(/id=\"btnGenerateApi\" class=\"primary\">TẠO ĐỀ</.test(api),'065D-16 simplified primary action missing');
must(!/api_key\s*:/.test(api),'065D-17 exam API overlay must never accept provider API key');
must(!/localStorage\.setItem|sessionStorage\.setItem/.test(api),'065D-18 API overlay must not persist credentials or prompt state');

// Provider setup is guided by presets while retaining advanced custom support.
must(/id="quickPreset"/.test(providerHtml)&&/id="btnQuickConnect"/.test(providerHtml),'065D-19 guided provider setup missing');
must(/API trung gian \/ OpenAI-compatible/.test(providerHtml),'065D-20 intermediary preset missing');
must(/id="advancedProviderSettings"/.test(providerHtml),'065D-21 advanced provider settings must remain available');
must(/id="providerOptions"/.test(providerHtml)&&/id="modelCapabilities"/.test(providerHtml)&&/id="modelParameters"/.test(providerHtml),'065D-22 advanced provider/model mappings missing');
must(/provider_options:parseObjectField\('providerOptions'/.test(providerJs),'065D-23 provider options are persisted through control plane');
must(/capabilities:parseObjectField\('modelCapabilities'/.test(providerJs),'065D-24 model capabilities are persisted');
must(/default_parameters:parseObjectField\('modelParameters'/.test(providerJs),'065D-25 model default parameters are persisted');
must(!/localStorage\.setItem\([^\n]*(apiKey|api_key)|sessionStorage\.setItem\([^\n]*(apiKey|api_key)/i.test(providerJs),'065D-26 provider key must never be written to browser storage');
must(/type="password"/.test(providerHtml),'065D-27 provider key UI must remain write-only');

console.log('PASS ai_exam_api_mode_065d_simulation');