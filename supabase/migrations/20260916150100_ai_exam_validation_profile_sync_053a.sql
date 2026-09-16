begin;

-- 053A — keep the stored authority profile semantically aligned with the 053 gate.
-- Replace the old AI-authored metadata hard-gate contract with server-canonical semantics.

update public.assessment_authority_profiles
set profile_version='053',
    profile=jsonb_set(
      jsonb_set(profile,'{version}','"053"'::jsonb,true),
      '{rules,part3}',
      '{
        "geographic_quantitative_reasoning_required":true,
        "numeric_answer_required":true,
        "single_numeric_result":true,
        "source_sufficient_data":true,
        "recompute_before_output":true,
        "validation_mode":"SERVER_CANONICAL_V1",
        "aggregate_diagnostics":true,
        "hard_gate":"OBJECTIVE_CORRECTNESS_ONLY",
        "quantitative_core_required":["operation_code","inputs"],
        "server_derived":["operation_family","reasoning_steps","rich_data"],
        "ai_descriptive_metadata_trusted":false,
        "quality_mix_is_advisory":true,
        "recommended_max_single_step_for_full_tnthpt":2,
        "recommended_min_multistep_for_full_tnthpt":4,
        "recommended_min_rich_data_for_full_tnthpt":3,
        "recommended_min_distinct_operation_families_for_full_tnthpt":4,
        "recommended_max_same_operation_family_for_full_tnthpt":2,
        "forbid_unit_conversion_only":true,
        "forbid_simple_two_percent_sum":true,
        "forbid_arbitrary_fact_arithmetic":true
      }'::jsonb,
      true
    ),
    updated_at=now()
where profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

commit;
