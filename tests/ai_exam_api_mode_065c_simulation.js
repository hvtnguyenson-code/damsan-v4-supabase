const fs=require('fs');
const html=fs.readFileSync('ai_exam.html','utf8');
const api=fs.readFileSync('ai_exam_api_mode_065c.js','utf8');
const router=fs.readFileSync('supabase/functions/exam-ai-router/index.ts','utf8');
const targetClassMigration=fs.readFileSync('supabase/migrations/20260919103000_ai_exam_target_class_066b.sql','utf8');
const providerHtml=fs.readFileSync('ai_provider.html','utf8');
const providerJs=fs.readFileSync('ai_provider.js','utf8');
function must(v,msg){if(!v)throw new Error(msg);}

// 066 keeps the established authoring/validation pipeline but removes provider/model decisions from normal exam authoring.
must(/id="provider"/.test(html)&&/CHATGPT_WEB/.test(html)&&/id="resultBox"/.test(html),'066-01 Web-AI fallback path must remain intact');
must(/TẠO ĐỀ BẰNG AI/.test(api),'066-02 one-click primary action missing');
must(/cloneNode\(true\)/.test(api)&&/original\.replaceWith\(button\)/.test(api),'066-03 one-click overlay must replace historical package-only click listener');
must(/await aieCreatePackage\(\)/.test(api),'066-04 one click must still use canonical Knowledge Pack/prompt construction');
must(/action:\s*'generate_exam_auto'/.test(api),'066-05 one click must call automatic route action');
must(/\/functions\/v1\/exam-ai-router/.test(api),'066-06 automatic router endpoint missing');
must(/aieLoadRequests\(result\.request_id\)/.test(api),'066-07 validated draft must return to existing teacher review UI');
must(/aieCapability\s*=\s*''/.test(api),'066-08 browser handoff capability must be cleared after server validation');

// Provider/model/tuning selection no longer belongs in the normal teacher workflow.
must(!/apiProviderSelect|apiModelSelect|apiReasoning|apiTemperature|apiTopP|apiMaxOutput/.test(api),'066-09 normal authoring UI must not expose provider/model/tuning controls');
must(/Dùng AI Web thủ công/.test(api)&&/Tạo gói cho AI Web/.test(api),'066-10 manual Web-AI fallback must remain available but secondary');
must(/cardByHeading\('2\. Prompt'\)/.test(api)&&/cardByHeading\('3\. Nhận đề'\)/.test(api),'066-11 manual prompt/result cards must be hidden from primary workflow');
must(!/api_key\s*:/.test(api),'066-12 exam UI must never accept provider API keys');
must(!/localStorage\.setItem|sessionStorage\.setItem/.test(api),'066-13 API overlay must not persist credentials or prompt state');

// Router automatically discovers readable provider/model candidates and performs retry/fallback through the existing 065B orchestrator.
must(/async function routeCandidates/.test(router),'066-14 route discovery missing');
must(/owner_scope===\"PERSONAL\"/.test(router)&&/owner_scope===\"SCHOOL\"/.test(router)&&/owner_scope===\"SYSTEM\"/.test(router),'066-15 route visibility scopes missing');
must(/last_test_status===\"OK\"/.test(router),'066-16 verified connections should receive routing preference');
must(/MAX_ROUTE_CANDIDATES\s*=\s*6/.test(router)&&/MAX_ROUTE_ATTEMPTS\s*=\s*10/.test(router),'066-17 bounded fallback limits missing');
must(/for\(const candidate of candidates\)/.test(router)&&/localAttempt<2/.test(router),'066-18 retry/fallback loop missing');
must(/repairPrompt/.test(router)&&/LẦN TẠO TRƯỚC CHƯA VƯỢT KIỂM ĐỊNH SERVER/.test(router),'066-19 automatic repair prompt missing');
must(/\/functions\/v1\/exam-ai-orchestrator/.test(router)&&/action:\"generate_exam\"/.test(router),'066-20 router must reuse the existing audited generation engine');
must(/action===\"route_status\"/.test(router)&&/action===\"generate_exam_auto\"/.test(router),'066-21 router actions missing');
must(!/_ai_provider_vault_read_065a|providerSecret/.test(router),'066-22 router must not read provider secrets directly');

// 066B adds one simple class selector and carries it atomically into canonical room targeting on approval.
must(/id=\"targetClass\"/.test(api)&&/Tất cả các lớp/.test(api),'066B-23 target class selector missing');
must(/rpc_ai_exam_class_list/.test(api),'066B-24 class selector must be server-scoped');
must(/spec\.target_class\s*=/.test(api),'066B-25 selected class must enter immutable request exam_spec');
must(/create or replace function public\.rpc_ai_exam_class_list/i.test(targetClassMigration),'066B-26 class-list RPC missing');
must(/v_target_class:=coalesce\(nullif\(btrim\(v_request\.exam_spec->>'target_class'\)/i.test(targetClassMigration),'066B-27 publish must read target class from request spec');
must(/where hs\.truong_id=v_request\.truong_id and btrim\(hs\.lop\)=v_target_class/i.test(targetClassMigration),'066B-28 publish must validate class belongs to request school');
must(/v_result:=public\.rpc_luu_de_thi_len_phong/i.test(targetClassMigration),'066B-29 canonical room-save path must remain authoritative');
must(/update public\.phong_thi[\s\S]*set doi_tuong=v_target_class/i.test(targetClassMigration),'066B-30 class selection must become room eligibility metadata');
must(/raise exception 'publish_room_target_update_failed'/i.test(targetClassMigration),'066B-31 target update failure must abort transaction');

// Provider setup remains a one-time admin/power-user concern; key stays write-only.
must(/id="quickPreset"/.test(providerHtml)&&/id="btnQuickConnect"/.test(providerHtml),'066-32 guided provider setup missing');
must(/API trung gian \/ OpenAI-compatible/.test(providerHtml),'066-33 intermediary preset missing');
must(/id="advancedProviderSettings"/.test(providerHtml),'066-34 advanced provider settings must remain available');
must(!/localStorage\.setItem\([^\n]*(apiKey|api_key)|sessionStorage\.setItem\([^\n]*(apiKey|api_key)/i.test(providerJs),'066-35 provider key must never be written to browser storage');
must(/type="password"/.test(providerHtml),'066-36 provider key UI must remain write-only');

console.log('PASS ai_exam_one_click_066b_simulation');
