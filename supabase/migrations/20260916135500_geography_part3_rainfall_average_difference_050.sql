begin;

-- 050 — Geography Part III compatibility correction.
-- RAINFALL_DIFFERENCE legitimately covers either raw-value difference,
-- difference between two group totals, or difference between two group averages.
-- The 048 recompute helper already supports AVERAGE_DIFFERENCE_TWO_GROUPS;
-- this migration aligns the skill/operation compatibility matrix with that contract.

do $do$
declare
  v_def text;
  v_old text := 'or (v_skill=''RAINFALL_DIFFERENCE'' and v_op in (''DIFFERENCE'',''SUM_DIFFERENCE_TWO_GROUPS''))';
  v_new text := 'or (v_skill=''RAINFALL_DIFFERENCE'' and v_op in (''DIFFERENCE'',''SUM_DIFFERENCE_TWO_GROUPS'',''AVERAGE_DIFFERENCE_TWO_GROUPS''))';
begin
  select pg_get_functiondef('public._ai_exam_quality_gate_037(uuid,jsonb)'::regprocedure)
  into v_def;

  if position(v_old in v_def)=0 then
    raise exception '050 compatibility anchor not found in _ai_exam_quality_gate_037';
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end;
$do$;

commit;
