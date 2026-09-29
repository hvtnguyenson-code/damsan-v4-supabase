const fs=require('fs');
const html=fs.readFileSync('ai_exam.html','utf8');
const web=fs.readFileSync('ai_exam_api_mode_065c.js','utf8');
const targetClassMigration=fs.readFileSync('supabase/migrations/20260919103000_ai_exam_target_class_066b.sql','utf8');
const providerHtml=fs.readFileSync('ai_provider.html','utf8');
const providerJs=fs.readFileSync('ai_provider.js','utf8');
function must(v,msg){if(!v)throw new Error(msg);}

// 070 makes Web AI the primary authoring path. Normal exam creation must never call a paid provider API.
must(/Tạo gói &amp; mở ChatGPT/.test(html),'070-01 ChatGPT Web primary action missing');
must(/Tạo gói &amp; mở Gemini/.test(html),'070-02 Gemini Web action missing');
must(/Tạo gói &amp; mở Claude/.test(html),'070-03 Claude Web action missing');
must(/Tạo gói &amp; mở AI web khác/.test(html),'070-04 generic Web AI action missing');
must(/value="CLAUDE_WEB"/.test(html),'070-05 Claude Web provenance option missing');
must(/API nâng cao/.test(html),'070-06 paid API must be visually separated from primary flow');
must(/20260929-web-first-070/.test(html),'070-07 Web-first cache bust marker missing');

must(/await aieCreatePackage\(\)/.test(web),'070-08 Web launch must still use canonical Knowledge Pack/prompt construction');
must(/navigator\.clipboard\.writeText\(prompt\)/.test(web),'070-09 prompt should be copied before handoff');
must(/https:\/\/chatgpt\.com\//.test(web),'070-10 ChatGPT target missing');
must(/https:\/\/gemini\.google\.com\/app/.test(web),'070-11 Gemini target missing');
must(/https:\/\/claude\.ai\//.test(web),'070-12 Claude target missing');
must(/window\.prompt\('Địa chỉ AI web muốn mở:'/.test(web),'070-13 generic Web AI URL prompt missing');
must(/OTHER_URL_KEY\s*=\s*'damsan_ai_exam_other_web_url'/.test(web),'070-14 only generic Web URL may be remembered');
must(/bindProviderMetadata\(target\.provider\)/.test(web),'070-15 selected Web source must be recorded for validation provenance');
must(/Mặc định: AI Web/.test(web)&&/không gọi Vertex\/API/.test(web),'070-16 visible no-paid-API status missing');

// Critical cost-safety boundary: no router, fragment worker or provider execution may be reachable from this browser overlay.
must(!/exam-ai-router|exam-ai-fragment|exam-ai-orchestrator/.test(web),'070-17 normal Web flow must not reference provider execution endpoints');
must(!/route_plan|generate_fragment|generate_exam_auto|generate_exam/.test(web),'070-18 normal Web flow must not invoke API generation actions');
must(!/provider_id|model_profile_id/.test(web),'070-19 normal Web flow must not select server API providers/models');
must(!/api_key\s*:|apiKey|secret_id/.test(web),'070-20 exam UI must never accept or transmit provider credentials');
must(!/fetch\s*\(/.test(web),'070-21 Web-first overlay must not perform hidden network generation calls');

// Prompt/result workflow and canonical validator remain visible and authoritative.
must(/id="promptBox"/.test(html)&&/id="resultBox"/.test(html)&&/id="btnValidate"/.test(html),'070-22 prompt/result/server-validation workflow missing');
must(/Gửi kiểm định đề/.test(html),'070-23 canonical validation action missing');
must(/id="provider"/.test(html)&&/CHATGPT_WEB/.test(html)&&/GEMINI_WEB/.test(html)&&/CLAUDE_WEB/.test(html)&&/OTHER_WEB_AI/.test(html),'070-24 Web provenance selector incomplete');

// 066B class targeting remains intact.
must(/id=\"targetClass\"/.test(web)&&/Tất cả các lớp/.test(web),'070-25 target class selector missing');
must(/rpc_ai_exam_class_list/.test(web),'070-26 class selector must stay server-scoped');
must(/spec\.target_class\s*=/.test(web),'070-27 selected class must enter immutable request exam_spec');
must(/create or replace function public\.rpc_ai_exam_class_list/i.test(targetClassMigration),'070-28 class-list RPC missing');
must(/v_target_class:=coalesce\(nullif\(btrim\(v_request\.exam_spec->>'target_class'\)/i.test(targetClassMigration),'070-29 publish must read target class from request spec');
must(/where hs\.truong_id=v_request\.truong_id and btrim\(hs\.lop\)=v_target_class/i.test(targetClassMigration),'070-30 publish must validate class belongs to request school');
must(/v_result:=public\.rpc_luu_de_thi_len_phong/i.test(targetClassMigration),'070-31 canonical room-save path must remain authoritative');

// API control plane may remain available as an explicit advanced feature, but credentials stay write-only.
must(/id="quickPreset"/.test(providerHtml)&&/id="btnQuickConnect"/.test(providerHtml),'070-32 advanced provider setup missing');
must(!/localStorage\.setItem\([^\n]*(apiKey|api_key)|sessionStorage\.setItem\([^\n]*(apiKey|api_key)/i.test(providerJs),'070-33 provider key must never be written to browser storage');
must(/type="password"/.test(providerHtml),'070-34 provider key UI must remain write-only');

console.log('PASS ai_exam_web_first_070_simulation');
