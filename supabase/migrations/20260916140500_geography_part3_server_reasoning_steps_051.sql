begin;

-- 051 — Geography Part III reliability correction.
-- reasoning_steps describes a deterministic property of the declared operation.
-- Do not trust/reject an AI-authored self-rating for this value; derive it server-side.
-- This keeps the 048 mix gates intact while removing a brittle metadata failure mode.

do $do$
declare
  v_def text;
  v_old text := $old$
      if coalesce(v_quant->>'reasoning_steps','') !~ '^[0-9]+$' then
        return jsonb_build_object('valid',false,'code','quality_part3_reasoning_steps_invalid','question_no',v_idx);
      end if;
      v_reasoning_steps:=(v_quant->>'reasoning_steps')::integer;
      if v_reasoning_steps not between 1 and 4 then
        return jsonb_build_object('valid',false,'code','quality_part3_reasoning_steps_invalid','question_no',v_idx);
      end if;
$old$;
  v_new text := $new$
      -- reasoning_steps is derived from operation semantics, not trusted from AI metadata.
      -- 1 step: direct sum/difference/balance.
      -- 2 steps: range/average/ratio/share and direct formula calculations.
      -- 3 steps: two-group aggregate comparison or growth-percent calculation.
      v_reasoning_steps:=case
        when v_op in ('SUM_DIFFERENCE_TWO_GROUPS','AVERAGE_DIFFERENCE_TWO_GROUPS','GROWTH_PERCENT') then 3
        when v_op in (
          'RANGE','AVERAGE','SHARE_PERCENT','RATIO_SCALED','DENSITY','YIELD','PER_CAPITA',
          'COMPONENT_FROM_SHARE','TOTAL_FROM_COMPONENT_SHARE','GROWTH_INDEX'
        ) then 2
        else 1
      end;
$new$;
begin
  select pg_get_functiondef('public._ai_exam_quality_gate_037(uuid,jsonb)'::regprocedure)
  into v_def;

  if position(v_old in v_def)=0 then
    raise exception '051 reasoning_steps anchor not found in _ai_exam_quality_gate_037';
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end;
$do$;

commit;
