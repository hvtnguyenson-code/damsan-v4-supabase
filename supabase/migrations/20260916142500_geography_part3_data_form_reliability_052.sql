begin;

-- 052 — Geography Part III data-form reliability correction.
-- data_form is descriptive metadata supplied by the Web AI; it must not create
-- a false hard failure when a legitimate calculation uses only two raw values.
-- Rich-data credit is derived from actual input cardinality instead of trusting
-- TABLE_SERIES/MULTI_VALUE labels, so this does not weaken the full-exam mix gate.

do $do$
declare
  v_def text;
  v_old_table text := $old$
      if v_data_form='TABLE_SERIES' and v_input_count<3 then
        return jsonb_build_object('valid',false,'code','quality_part3_table_series_too_small','question_no',v_idx);
      end if;
$old$;
  v_old_rich text := $old$
      if v_input_count>=3 or v_data_form in ('TABLE_SERIES','MULTI_VALUE') then
        v_rich_data_count:=v_rich_data_count+1;
      end if;
$old$;
  v_new_rich text := $new$
      -- Rich-data credit comes from student-visible raw input cardinality.
      -- A two-value calculation can legitimately originate from a table, but it
      -- must not count as a rich-data item merely because AI labeled TABLE_SERIES.
      if v_input_count>=3 then
        v_rich_data_count:=v_rich_data_count+1;
      end if;
$new$;
begin
  select pg_get_functiondef('public._ai_exam_quality_gate_037(uuid,jsonb)'::regprocedure)
  into v_def;

  if position(v_old_table in v_def)=0 then
    raise exception '052 TABLE_SERIES anchor not found in _ai_exam_quality_gate_037';
  end if;
  if position(v_old_rich in v_def)=0 then
    raise exception '052 rich-data anchor not found in _ai_exam_quality_gate_037';
  end if;

  v_def := replace(v_def, v_old_table, '');
  v_def := replace(v_def, v_old_rich, v_new_rich);
  execute v_def;
end;
$do$;

commit;
