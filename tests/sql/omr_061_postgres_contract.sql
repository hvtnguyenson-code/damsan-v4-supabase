-- OMR-061: Run inside an ephemeral PostgreSQL 17 CI service.
-- This test uses the REAL checked-in rpc_staff_submit_omr SQL, but a STUB
-- authentication lookup and a STUB canonical grader. No Supabase network.
\set ON_ERROR_STOP on
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $roles$;

CREATE TABLE public.giao_vien(
 id uuid PRIMARY KEY,
 truong_id uuid NOT NULL,
 quyen text NOT NULL,
 mon_id uuid
);
CREATE TABLE public.phong_thi(
 id uuid PRIMARY KEY,
 truong_id uuid NOT NULL,
 mon_id uuid,
 doi_tuong text
);
CREATE TABLE public.hoc_sinh(
 id uuid PRIMARY KEY,
 truong_id uuid NOT NULL,
 ma_hs text NOT NULL,
 lop text NOT NULL
);
CREATE TABLE public.de_thi(
 phong_id uuid NOT NULL,
 ma_de text NOT NULL,
 cau_so jsonb NOT NULL,
 PRIMARY KEY(phong_id,ma_de)
);
CREATE TABLE public.exam_submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 attempt_id uuid,
 truong_id uuid NOT NULL,
 phong_id uuid NOT NULL,
 hs_id uuid NOT NULL,
 ma_de text NOT NULL,
 raw_answers jsonb NOT NULL,
 status text,
 client_submitted_at timestamptz,
 score numeric,
 graded_at timestamptz
);
CREATE UNIQUE INDEX omr061_unique_receipt ON public.exam_submissions(phong_id,hs_id);
CREATE TABLE public.ket_qua(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 phong_id uuid NOT NULL,
 hs_id uuid NOT NULL,
 diem numeric NOT NULL
);
CREATE UNIQUE INDEX omr061_unique_result ON public.ket_qua(phong_id,hs_id);

-- A deliberately synthetic staff-session fixture. This DOES NOT test Auth/RLS.
CREATE OR REPLACE FUNCTION public._staff_session_gv_id(p_token text)
RETURNS uuid LANGUAGE sql STABLE AS $function$
 SELECT CASE WHEN p_token='synthetic-valid-061'
 THEN '00000000-0000-4000-8000-000000000061'::uuid ELSE NULL::uuid END
$function$;

-- Local grader fixture: this is NOT production rpc_grade_submission.
-- It tests transaction behavior, result linkage and conflict checks only.
CREATE OR REPLACE FUNCTION public.rpc_grade_submission(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE s public.exam_submissions%rowtype;
BEGIN
 UPDATE public.exam_submissions
 SET status='graded',score=8.25,graded_at=now()
 WHERE id=p_submission_id RETURNING * INTO s;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','failed'); END IF;
 INSERT INTO public.ket_qua(phong_id,hs_id,diem)
 VALUES(s.phong_id,s.hs_id,8.25);
 RETURN jsonb_build_object('status','graded','score',8.25,'graded_at',s.graded_at);
END
$function$;

-- Apply the ACTUAL checked-in OMR SQL function, not a hand-written copy.
\ir ../../supabase/migrations/20261105143000_omr_staff_submission_004.sql

INSERT INTO public.giao_vien(id,truong_id,quyen,mon_id) VALUES
 ('00000000-0000-4000-8000-000000000061',
  '00000000-0000-4000-8000-000000000071','Giáo viên',
  '00000000-0000-4000-8000-000000000081');
INSERT INTO public.phong_thi(id,truong_id,mon_id,doi_tuong) VALUES
 ('00000000-0000-4000-8000-000000000091',
  '00000000-0000-4000-8000-000000000071',
  '00000000-0000-4000-8000-000000000081','10A4');
INSERT INTO public.hoc_sinh(id,truong_id,ma_hs,lop) VALUES
 ('00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000071','120601','10A4');
INSERT INTO public.de_thi(phong_id,ma_de,cau_so) VALUES
 ('00000000-0000-4000-8000-000000000091','103',
 (SELECT jsonb_agg(jsonb_build_object('phan','1','dap_an_dung','A') ORDER BY g)
  FROM generate_series(1,28) AS g));

-- Real SQL invocation against a real PostgreSQL transaction. Only data is synthetic.
DO $verify$
DECLARE
 roomid uuid:='00000000-0000-4000-8000-000000000091';
 studentid uuid:='00000000-0000-4000-8000-000000000101';
 schoolid uuid:='00000000-0000-4000-8000-000000000071';
 teacherid uuid:='00000000-0000-4000-8000-000000000061';
 courseid uuid:='00000000-0000-4000-8000-000000000081';
 answers jsonb;
 out_json jsonb;
 saved uuid;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('chon','A') ORDER BY g)
 INTO answers FROM generate_series(1,28) AS g;

 SELECT public.rpc_staff_submit_omr('invalid-token',roomid,studentid,'103',answers,'{}')
 INTO out_json;
 IF out_json->>'code' IS DISTINCT FROM 'staff_session_invalid'
 THEN RAISE EXCEPTION 'Invalid staff token incorrectly accepted: %',out_json; END IF;

 UPDATE public.giao_vien
 SET mon_id='00000000-0000-4000-8000-000000000082' WHERE id=teacherid;
 SELECT public.rpc_staff_submit_omr('synthetic-valid-061',roomid,studentid,'103',answers,'{}')
 INTO out_json;
 IF out_json->>'code' IS DISTINCT FROM 'subject_forbidden'
 THEN RAISE EXCEPTION 'Wrong subject accepted: %',out_json; END IF;
 UPDATE public.giao_vien SET mon_id=courseid WHERE id=teacherid;

 UPDATE public.phong_thi
 SET truong_id='00000000-0000-4000-8000-000000000072' WHERE id=roomid;
 SELECT public.rpc_staff_submit_omr('synthetic-valid-061',roomid,studentid,'103',answers,'{}')
 INTO out_json;
 IF out_json->>'code' IS DISTINCT FROM 'room_forbidden'
 THEN RAISE EXCEPTION 'Wrong school accepted: %',out_json; END IF;
 UPDATE public.phong_thi SET truong_id=schoolid WHERE id=roomid;

 SELECT public.rpc_staff_submit_omr('synthetic-valid-061',roomid,studentid,'999',answers,'{}')
 INTO out_json;
 IF out_json->>'code' IS DISTINCT FROM 'exam_code_not_found'
 THEN RAISE EXCEPTION 'Unknown exam code accepted: %',out_json; END IF;

 SELECT public.rpc_staff_submit_omr('synthetic-valid-061',roomid,studentid,'103',
  (SELECT jsonb_agg(jsonb_build_object('chon','A')) FROM generate_series(1,27)),'{}')
 INTO out_json;
 IF out_json->>'code' IS DISTINCT FROM 'answer_count_mismatch'
 THEN RAISE EXCEPTION 'Wrong answer count accepted: %',out_json; END IF;

 SELECT public.rpc_staff_submit_omr('synthetic-valid-061',roomid,studentid,'103',answers,'[]')
 INTO out_json;
 IF out_json->>'code' IS DISTINCT FROM 'invalid_metadata'
 THEN RAISE EXCEPTION 'Invalid metadata accepted: %',out_json; END IF;

 IF (SELECT count(*) FROM public.exam_submissions)<>0 OR
    (SELECT count(*) FROM public.ket_qua)<>0
 THEN RAISE EXCEPTION 'Invalid calls caused DB writes'; END IF;

 -- Stored canonical exam code is '103', input with 0 padding is '0103'.
 SELECT public.rpc_staff_submit_omr('synthetic-valid-061',roomid,studentid,'0103',
    answers,'{"template_id":"MOET_TLTN_2025_18_4_6_V1","recognition_engine":"V7"}')
 INTO out_json;
 IF out_json->>'status' IS DISTINCT FROM 'success' OR out_json->>'ma_de' IS DISTINCT FROM '103'
 THEN RAISE EXCEPTION 'Valid score write failed: %',out_json; END IF;
 saved:=(out_json->>'submission_id')::uuid;
 IF saved IS NULL OR (out_json->>'score')::numeric<>8.25
 THEN RAISE EXCEPTION 'Receipt missing score/id'; END IF;

 IF NOT EXISTS(
   SELECT 1 FROM public.exam_submissions
   WHERE id=saved AND source='OMR' AND status='graded' AND
    submitted_by_staff_id=teacherid AND ma_de='103' AND
    (source_metadata->>'recognition_engine')='V7' AND score=8.25
 ) THEN RAISE EXCEPTION 'Submission receipt mismatch'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.ket_qua WHERE phong_id=roomid AND hs_id=studentid AND diem=8.25
 ) THEN RAISE EXCEPTION 'Canonical score result missing'; END IF;

 SELECT public.rpc_staff_submit_omr('synthetic-valid-061',roomid,studentid,'103',answers,'{}')
 INTO out_json;
 IF out_json->>'status' IS DISTINCT FROM 'conflict' OR out_json->>'code' IS DISTINCT FROM 'existing_result'
 THEN RAISE EXCEPTION 'Duplicate submission not blocked: %',out_json; END IF;

 IF (SELECT count(*) FROM public.exam_submissions)<>1 OR
    (SELECT count(*) FROM public.ket_qua)<>1
 THEN RAISE EXCEPTION 'Duplicate created another receipt/result'; END IF;
 IF NOT has_function_privilege('anon',
    'public.rpc_staff_submit_omr(text,uuid,uuid,text,jsonb,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Expected anonymous RPC role privilege missing'; END IF;
 RAISE NOTICE 'PASS OMR 061 real PostgreSQL 17 SQL function, auth/subject/school/code/count veto, graded receipt, score, duplicate';
END
$verify$;

-- All synthetic tables, grants, roles and receipts vanish.
ROLLBACK;
