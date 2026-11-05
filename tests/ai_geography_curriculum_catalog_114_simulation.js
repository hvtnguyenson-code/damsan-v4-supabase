const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const source=fs.readFileSync('ai_exam_geography_curriculum_catalog_114.js','utf8');
assert(!/inferTopic\s*\(|title\.toLowerCase\(\).*return/i.test(source),'114 must not infer curriculum rows from title regex');

const sandbox={window:{}};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const catalog=sandbox.window.aieGeoCurriculumCatalog114;
assert(catalog,'114 catalog export missing');
const integrity=catalog.integrity();
assert.strictEqual(integrity.schema_version,'DAMSAN_GEO_CURRICULUM_CATALOG_V1');
assert.strictEqual(integrity.catalog_version,'114');
assert.strictEqual(integrity.grades[10],40,'grade 10 catalog must cover 40 normalized lessons');
assert.strictEqual(integrity.grades[11],0,'grade 11 lesson mapping must remain blocked');
assert.strictEqual(integrity.grades[12],35,'grade 12 catalog must cover 35 normalized lessons');
assert.strictEqual(integrity.grade12_revision,'TT17_2025_CURRENT');
assert.strictEqual(integrity.grade11_mapping_state,'BLOCKED_NO_NORMALIZED_TEXTBOOK');

for(const grade of [10,12]){
  const max=grade===10?40:35;
  for(let i=1;i<=max;i++){
    const code='BAI_'+String(i).padStart(2,'0');
    const title='Bài kiểm tra '+code;
    const rows=catalog.candidatesForLesson(grade,{lesson_code:code,lesson_title:title,scope_key:'doc::'+code});
    assert.strictEqual(rows.length,1,grade+' '+code+' must resolve exactly one catalog row');
    const r=rows[0];
    assert.strictEqual(r.requirement_id,'G'+grade+'_'+code+'_R01');
    assert.strictEqual(r.indicator_id,r.requirement_id+'_I01');
    assert(r.requirement_text.length>20,'requirement text missing '+grade+' '+code);
    assert(r.indicator_text.length>20,'indicator text missing '+grade+' '+code);
    assert(['CURRENT_AUTHORITY_EXACT','CURRICULUM_ALIGNED_CATALOG'].includes(r.requirement_basis),'invalid basis '+grade+' '+code);
    assert.strictEqual(r.authority_code,'BGDDT_GEOGRAPHY_CURRICULUM_2018');
    assert.strictEqual(r.mapping_source,'ACTIVE_NORMALIZED_TEXTBOOK');
    assert(Number(r.mapping_confidence)>=0.9);
    assert(Array.isArray(r.allowed_cognitive_levels)&&r.allowed_cognitive_levels.length>0);
    assert(Array.isArray(r.preferred_stimuli)&&r.preferred_stimuli.length>0);
  }
}

assert.strictEqual(catalog.candidatesForLesson(11,{lesson_code:'BAI_01',lesson_title:'x'}).length,0,'grade 11 mapping must not be invented');
assert.strictEqual(catalog.candidatesForLesson(10,{lesson_code:'BAI_41',lesson_title:'x'}).length,0,'unknown grade 10 lesson must fail closed');
assert.strictEqual(catalog.candidatesForLesson(12,{lesson_code:'BAI_36',lesson_title:'x'}).length,0,'unknown grade 12 lesson must fail closed');

const g12b1=catalog.candidatesForLesson(12,{lesson_code:'BAI_01',lesson_title:'Vị trí địa lí và phạm vi lãnh thổ'})[0];
assert.strictEqual(g12b1.requirement_basis,'CURRENT_AUTHORITY_EXACT');
assert(/tỉnh, thành phố trên bản đồ/.test(g12b1.requirement_text),'grade12 BAI_01 must retain P0 current authority requirement');

const g12b35=catalog.candidatesForLesson(12,{lesson_code:'BAI_35',lesson_title:'Địa lí địa phương'})[0];
assert.strictEqual(g12b35.requirement_basis,'CURRENT_AUTHORITY_EXACT');
assert(/đơn vị hành chính cấp tỉnh/.test(g12b35.requirement_text),'grade12 local geography current authority requirement missing');

console.log('AI_GEOGRAPHY_CURRICULUM_CATALOG_114_PASS');
