// 114 — Versioned Geography curriculum-aligned catalog for matrix 111.
// This file intentionally distinguishes curriculum authority from textbook mapping.
// Entries are explicit by grade + lesson_code; no title-regex inference is allowed.
(function(){
  'use strict';

  const CATALOG_VERSION='114';
  const AUTHORITY_CODE='BGDDT_GEOGRAPHY_CURRICULUM_2018';

  const G10={
    BAI_01:['Định hướng nghề nghiệp','GEO_VD_REALITY','REAL_WORLD_INTERPRETATION',['UNDERSTAND','APPLY'],['TEXT','MULTI_SOURCE']],
    BAI_02:['Phương pháp bản đồ','GEO_TH_TOOL','READ_MAP',['KNOW','UNDERSTAND','APPLY'],['MAP','SCHEMATIC_MAP','TEXT']],
    BAI_03:['Bản đồ, GPS và bản đồ số','GEO_TH_TOOL','SPATIAL_DATA_ANALYSIS',['UNDERSTAND','APPLY'],['MAP','SCHEMATIC_MAP','TEXT']],
    BAI_04:['Trái Đất và vỏ Trái Đất','GEO_NK_CAUSAL','PROCESS_EXPLANATION',['KNOW','UNDERSTAND'],['NONE','TEXT','DIAGRAM']],
    BAI_05:['Chuyển động của Trái Đất','GEO_NK_CAUSAL','CAUSE_EFFECT',['KNOW','UNDERSTAND','APPLY'],['TEXT','DIAGRAM','MAP']],
    BAI_06:['Thạch quyển và kiến tạo mảng','GEO_NK_SPATIAL','SPATIAL_RELATION',['KNOW','UNDERSTAND'],['MAP','DIAGRAM','TEXT']],
    BAI_07:['Nội lực và ngoại lực','GEO_NK_CAUSAL','PROCESS_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','IMAGE','DIAGRAM']],
    BAI_08:['Phân bố động đất, núi lửa','GEO_TH_TOOL','READ_MAP',['UNDERSTAND','APPLY'],['MAP','SCHEMATIC_MAP']],
    BAI_09:['Khí quyển và khí hậu','GEO_NK_CAUSAL','MULTI_FACTOR_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE','CHART','MAP']],
    BAI_10:['Đới và kiểu khí hậu','GEO_TH_TOOL','INTERPRET_CHART',['UNDERSTAND','APPLY'],['MAP','CLIMOGRAPH','CHART']],
    BAI_11:['Thuỷ quyển và nước lục địa','GEO_NK_CAUSAL','CAUSE_EFFECT',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE','DIAGRAM']],
    BAI_12:['Nước biển và đại dương','GEO_NK_CAUSAL','PROCESS_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','MAP','DIAGRAM']],
    BAI_13:['Chế độ nước sông','GEO_TH_TOOL','TREND_ANALYSIS',['UNDERSTAND','APPLY'],['TABLE','CHART']],
    BAI_14:['Đất trên Trái Đất','GEO_NK_SPATIAL','SPATIAL_DISTRIBUTION',['KNOW','UNDERSTAND'],['MAP','TEXT','IMAGE']],
    BAI_15:['Sinh quyển','GEO_NK_CAUSAL','NATURAL_SOCIOECONOMIC_RELATION',['KNOW','UNDERSTAND'],['TEXT','MAP','IMAGE']],
    BAI_16:['Phân bố đất và sinh vật','GEO_TH_TOOL','READ_MAP',['UNDERSTAND','APPLY'],['MAP','IMAGE','TABLE']],
    BAI_17:['Vỏ địa lí và quy luật thống nhất','GEO_NK_CAUSAL','NATURAL_SOCIOECONOMIC_RELATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','DIAGRAM','MULTI_SOURCE']],
    BAI_18:['Địa đới và phi địa đới','GEO_NK_SPATIAL','REGIONAL_DIFFERENTIATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TEXT','DIAGRAM']],
    BAI_19:['Dân số thế giới','GEO_TH_TOOL','STRUCTURE_ANALYSIS',['KNOW','UNDERSTAND','APPLY'],['TABLE','CHART','TEXT']],
    BAI_20:['Phân bố dân cư và đô thị hoá','GEO_NK_SPATIAL','SPATIAL_DISTRIBUTION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_21:['Nguồn lực phát triển kinh tế','GEO_NK_CAUSAL','MULTI_FACTOR_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE']],
    BAI_22:['Cơ cấu kinh tế, GDP và GNI','GEO_TH_TOOL','STRUCTURE_ANALYSIS',['KNOW','UNDERSTAND','APPLY'],['TABLE','CHART','TEXT']],
    BAI_23:['Nhân tố nông, lâm, thuỷ sản','GEO_NK_CAUSAL','MULTI_FACTOR_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE','MAP']],
    BAI_24:['Địa lí nông nghiệp','GEO_NK_SPATIAL','SPATIAL_DISTRIBUTION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_25:['Lâm nghiệp và thuỷ sản','GEO_NK_SPATIAL','SPATIAL_DISTRIBUTION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_26:['Tổ chức lãnh thổ nông nghiệp','GEO_VD_PROBLEM','TRADEOFF_EVALUATION',['UNDERSTAND','APPLY'],['TEXT','MAP','MULTI_SOURCE']],
    BAI_27:['Biểu đồ sản lượng lương thực','GEO_TH_TOOL','INTERPRET_CHART',['UNDERSTAND','APPLY'],['TABLE','CHART']],
    BAI_28:['Công nghiệp: vai trò, cơ cấu, nhân tố','GEO_NK_CAUSAL','MULTI_FACTOR_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE','CHART']],
    BAI_29:['Một số ngành công nghiệp','GEO_NK_SPATIAL','SPATIAL_DISTRIBUTION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_30:['Tổ chức lãnh thổ công nghiệp','GEO_NK_SPATIAL','SPATIAL_RELATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TEXT','TABLE']],
    BAI_31:['Công nghiệp, môi trường và năng lượng','GEO_VD_PROBLEM','IMPACT_ASSESSMENT',['UNDERSTAND','APPLY'],['TEXT','TABLE','MULTI_SOURCE']],
    BAI_32:['Báo cáo về công nghiệp','GEO_TH_INFO','REAL_WORLD_INTERPRETATION',['UNDERSTAND','APPLY'],['TEXT','TABLE','MULTI_SOURCE']],
    BAI_33:['Dịch vụ: vai trò, đặc điểm, nhân tố','GEO_NK_CAUSAL','MULTI_FACTOR_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE']],
    BAI_34:['Giao thông vận tải','GEO_NK_SPATIAL','SPATIAL_RELATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_35:['Bưu chính viễn thông','GEO_NK_CAUSAL','CAUSE_EFFECT',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE','CHART']],
    BAI_36:['Du lịch','GEO_VD_REALITY','REAL_WORLD_INTERPRETATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','TEXT']],
    BAI_37:['Thương mại và tài chính ngân hàng','GEO_TH_TOOL','TREND_ANALYSIS',['KNOW','UNDERSTAND','APPLY'],['TABLE','CHART','TEXT']],
    BAI_38:['Báo cáo về dịch vụ','GEO_TH_INFO','REAL_WORLD_INTERPRETATION',['UNDERSTAND','APPLY'],['TEXT','TABLE','MULTI_SOURCE']],
    BAI_39:['Môi trường và tài nguyên','GEO_VD_PROBLEM','IMPACT_ASSESSMENT',['KNOW','UNDERSTAND','APPLY'],['TEXT','MAP','MULTI_SOURCE']],
    BAI_40:['Phát triển bền vững và tăng trưởng xanh','GEO_VD_PROBLEM','SOLUTION_SELECTION',['UNDERSTAND','APPLY'],['TEXT','TABLE','MULTI_SOURCE']]
  };

  const G12={
    BAI_01:['Vị trí địa lí và phạm vi lãnh thổ','GEO_NK_SPATIAL','SPATIAL_RELATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TEXT']],
    BAI_02:['Thiên nhiên nhiệt đới ẩm gió mùa','GEO_NK_CAUSAL','MULTI_FACTOR_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE','MAP']],
    BAI_03:['Phân hoá thiên nhiên','GEO_NK_SPATIAL','REGIONAL_DIFFERENTIATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','TEXT']],
    BAI_04:['Báo cáo phân hoá tự nhiên','GEO_TH_INFO','REAL_WORLD_INTERPRETATION',['UNDERSTAND','APPLY'],['MAP','TEXT','MULTI_SOURCE']],
    BAI_05:['Tài nguyên và môi trường','GEO_VD_PROBLEM','IMPACT_ASSESSMENT',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE','MULTI_SOURCE']],
    BAI_06:['Tài nguyên, môi trường địa phương','GEO_VD_REALITY','SOLUTION_SELECTION',['UNDERSTAND','APPLY'],['TEXT','MAP','MULTI_SOURCE']],
    BAI_07:['Dân số Việt Nam','GEO_TH_TOOL','STRUCTURE_ANALYSIS',['KNOW','UNDERSTAND','APPLY'],['TABLE','CHART','MAP']],
    BAI_08:['Lao động và việc làm','GEO_TH_TOOL','TREND_ANALYSIS',['KNOW','UNDERSTAND','APPLY'],['TABLE','CHART','TEXT']],
    BAI_09:['Đô thị hoá','GEO_NK_SPATIAL','SPATIAL_DISTRIBUTION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_10:['Báo cáo chủ đề dân cư','GEO_TH_INFO','REAL_WORLD_INTERPRETATION',['UNDERSTAND','APPLY'],['TABLE','CHART','MULTI_SOURCE']],
    BAI_11:['Chuyển dịch cơ cấu kinh tế','GEO_TH_TOOL','STRUCTURE_ANALYSIS',['KNOW','UNDERSTAND','APPLY'],['TABLE','CHART','TEXT']],
    BAI_12:['Nông nghiệp','GEO_NK_CAUSAL','MULTI_FACTOR_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_13:['Lâm nghiệp và thuỷ sản','GEO_NK_CAUSAL','MULTI_FACTOR_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_14:['Tổ chức lãnh thổ nông nghiệp','GEO_NK_SPATIAL','SPATIAL_RELATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','TEXT']],
    BAI_15:['Thực hành nông, lâm, thuỷ sản','GEO_TH_TOOL','SPATIAL_DATA_ANALYSIS',['UNDERSTAND','APPLY'],['TABLE','CHART','MULTI_SOURCE']],
    BAI_16:['Chuyển dịch cơ cấu công nghiệp','GEO_TH_TOOL','STRUCTURE_ANALYSIS',['KNOW','UNDERSTAND','APPLY'],['TABLE','CHART','TEXT']],
    BAI_17:['Một số ngành công nghiệp','GEO_NK_SPATIAL','SPATIAL_DISTRIBUTION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_18:['Tổ chức lãnh thổ công nghiệp','GEO_NK_SPATIAL','SPATIAL_RELATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','TEXT']],
    BAI_19:['Biểu đồ công nghiệp','GEO_TH_TOOL','INTERPRET_CHART',['UNDERSTAND','APPLY'],['TABLE','CHART']],
    BAI_20:['Dịch vụ: vai trò và nhân tố','GEO_NK_CAUSAL','MULTI_FACTOR_EXPLANATION',['KNOW','UNDERSTAND','APPLY'],['TEXT','TABLE']],
    BAI_21:['Giao thông và bưu chính viễn thông','GEO_NK_SPATIAL','SPATIAL_RELATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','CHART']],
    BAI_22:['Thương mại và du lịch','GEO_TH_TOOL','TREND_ANALYSIS',['KNOW','UNDERSTAND','APPLY'],['TABLE','CHART','MAP']],
    BAI_23:['Thực hành dịch vụ','GEO_TH_INFO','REAL_WORLD_INTERPRETATION',['UNDERSTAND','APPLY'],['TABLE','CHART','MULTI_SOURCE']],
    BAI_24:['Trung du và miền núi phía Bắc','GEO_NK_SPATIAL','REGIONAL_DIFFERENTIATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','MULTI_SOURCE']],
    BAI_25:['Đồng bằng sông Hồng','GEO_NK_SPATIAL','REGIONAL_DIFFERENTIATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','MULTI_SOURCE']],
    BAI_26:['Kinh tế biển Đồng bằng sông Hồng','GEO_VD_PROBLEM','REAL_WORLD_INTERPRETATION',['UNDERSTAND','APPLY'],['MAP','TABLE','MULTI_SOURCE']],
    BAI_27:['Bắc Trung Bộ','GEO_NK_SPATIAL','REGIONAL_DIFFERENTIATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','MULTI_SOURCE']],
    BAI_28:['Nam Trung Bộ','GEO_NK_SPATIAL','REGIONAL_DIFFERENTIATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','MULTI_SOURCE']],
    BAI_29:['Nam Trung Bộ và quốc phòng, an ninh','GEO_VD_PROBLEM','IMPACT_ASSESSMENT',['UNDERSTAND','APPLY'],['MAP','TEXT','MULTI_SOURCE']],
    BAI_30:['Đông Nam Bộ','GEO_NK_SPATIAL','REGIONAL_DIFFERENTIATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','MULTI_SOURCE']],
    BAI_31:['Đồng bằng sông Cửu Long','GEO_VD_PROBLEM','TRADEOFF_EVALUATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TABLE','MULTI_SOURCE']],
    BAI_32:['Biến đổi khí hậu ở Đồng bằng sông Cửu Long','GEO_VD_PROBLEM','IMPACT_ASSESSMENT',['UNDERSTAND','APPLY'],['MAP','TABLE','MULTI_SOURCE']],
    BAI_33:['Biển Đông, đảo và quần đảo','GEO_VD_PROBLEM','SPATIAL_RELATION',['KNOW','UNDERSTAND','APPLY'],['MAP','TEXT','MULTI_SOURCE']],
    BAI_34:['Bảo vệ chủ quyền biển, đảo','GEO_VD_REALITY','REAL_WORLD_INTERPRETATION',['UNDERSTAND','APPLY'],['MAP','TEXT','MULTI_SOURCE']],
    BAI_35:['Địa lí địa phương','GEO_VD_REALITY','REAL_WORLD_INTERPRETATION',['UNDERSTAND','APPLY'],['MAP','TABLE','MULTI_SOURCE']]
  };

  const exact12={
    BAI_01:'Xác định đặc điểm vị trí địa lí, phạm vi lãnh thổ Việt Nam và các tỉnh, thành phố trên bản đồ.',
    BAI_35:'Thực hành tìm hiểu Địa lí địa phương theo đơn vị hành chính cấp tỉnh; trình bày vị trí và phạm vi lãnh thổ dựa trên bản đồ địa phương, Việt Nam và kiến thức đã có.'
  };

  function profileFor(grade,lessonCode){
    const table=Number(grade)===10?G10:Number(grade)===12?G12:null;
    return table?.[String(lessonCode||'').toUpperCase()]||null;
  }

  function requirementText(grade,lessonCode,lessonTitle,profile){
    if(Number(grade)===12&&exact12[lessonCode]) return exact12[lessonCode];
    const [topic,competency,operation]=profile;
    if(competency==='GEO_TH_TOOL') return `Sử dụng công cụ địa lí, bản đồ, bảng số liệu hoặc biểu đồ để khai thác, phân tích và trình bày nội dung “${lessonTitle}”.`;
    if(competency==='GEO_TH_INFO') return `Thu thập, chọn lọc, xử lí và trình bày thông tin địa lí phù hợp với nội dung “${lessonTitle}”.`;
    if(competency.startsWith('GEO_VD')) return `Vận dụng kiến thức, kĩ năng địa lí về “${lessonTitle}” để giải thích, đánh giá hoặc giải quyết vấn đề trong bối cảnh cụ thể.`;
    if(competency==='GEO_NK_SPATIAL') return `Xác định, trình bày và phân tích đặc điểm không gian, phân bố hoặc sự phân hoá thuộc nội dung “${lessonTitle}”.`;
    return `Trình bày, phân tích và giải thích đặc điểm, quá trình hoặc mối quan hệ địa lí thuộc nội dung “${lessonTitle}”.`;
  }

  function indicatorText(lessonTitle,operation){
    const labels={
      READ_MAP:'đọc và khai thác bản đồ',
      SPATIAL_DATA_ANALYSIS:'phân tích dữ liệu không gian',
      INTERPRET_CHART:'đọc, nhận xét và giải thích biểu đồ',
      TREND_ANALYSIS:'phân tích xu hướng từ số liệu',
      STRUCTURE_ANALYSIS:'phân tích cơ cấu và sự chuyển dịch',
      SPATIAL_DISTRIBUTION:'phân tích sự phân bố',
      SPATIAL_RELATION:'phân tích mối quan hệ không gian',
      REGIONAL_DIFFERENTIATION:'so sánh và giải thích sự phân hoá lãnh thổ',
      MULTI_FACTOR_EXPLANATION:'giải thích bằng nhiều nhân tố',
      CAUSE_EFFECT:'phân tích quan hệ nguyên nhân – hệ quả',
      PROCESS_EXPLANATION:'giải thích quá trình địa lí',
      NATURAL_SOCIOECONOMIC_RELATION:'phân tích quan hệ tự nhiên – kinh tế xã hội',
      REAL_WORLD_INTERPRETATION:'liên hệ và giải thích tình huống thực tiễn',
      IMPACT_ASSESSMENT:'đánh giá tác động địa lí',
      SOLUTION_SELECTION:'lựa chọn và giải thích giải pháp',
      TRADEOFF_EVALUATION:'đánh giá phương án và sự đánh đổi'
    };
    return `Thực hiện được nhiệm vụ ${labels[operation]||'phân tích địa lí'} đối với dữ kiện phù hợp với “${lessonTitle}”.`;
  }

  function candidatesForLesson(grade,lesson){
    const lessonCode=String(lesson?.lesson_code||'').toUpperCase();
    const lessonTitle=String(lesson?.lesson_title||lesson?.scope_key||'').trim();
    const profile=profileFor(grade,lessonCode);
    if(!profile) return [];
    const [topic,competency,operation,levels,stimuli]=profile;
    const authorityRevision=Number(grade)===12?'TT17_2025_CURRENT':'GDPT_2018_BASE';
    const exact=Number(grade)===12&&Boolean(exact12[lessonCode]);
    const requirementId=`G${grade}_${lessonCode}_R01`;
    const indicatorId=`${requirementId}_I01`;
    return [{
      curriculum_topic:topic,
      requirement_id:requirementId,
      requirement_text:requirementText(grade,lessonCode,lessonTitle,profile),
      indicator_id:indicatorId,
      indicator_text:indicatorText(lessonTitle,operation),
      requirement_basis:exact?'CURRENT_AUTHORITY_EXACT':'CURRICULUM_ALIGNED_CATALOG',
      authority_code:AUTHORITY_CODE,
      authority_revision:authorityRevision,
      mapping_source:'ACTIVE_NORMALIZED_TEXTBOOK',
      mapping_confidence:exact?1:0.9,
      competency_code:competency,
      operation_code:operation,
      allowed_cognitive_levels:[...levels],
      preferred_stimuli:[...stimuli]
    }];
  }

  function integrity(){
    return {
      schema_version:'DAMSAN_GEO_CURRICULUM_CATALOG_V1',
      catalog_version:CATALOG_VERSION,
      grades:{10:Object.keys(G10).length,11:0,12:Object.keys(G12).length},
      authority_code:AUTHORITY_CODE,
      grade12_revision:'TT17_2025_CURRENT',
      grade11_mapping_state:'BLOCKED_NO_NORMALIZED_TEXTBOOK'
    };
  }

  window.aieGeoCurriculumCatalog114={
    version:CATALOG_VERSION,
    profileFor,
    candidatesForLesson,
    integrity
  };
})();