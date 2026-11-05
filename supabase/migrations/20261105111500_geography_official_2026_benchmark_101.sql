begin;

-- 101 — Bind the 2026 official Geography exam benchmark to a verified Government-portal reproduction.
update public.assessment_authority_profiles p
set profile_version='101',
    profile=jsonb_set(
      jsonb_set(coalesce(p.profile,'{}'::jsonb),'{version}','"101"'::jsonb,true),
      '{declared_sources}',
      (
        select coalesce(jsonb_agg(
          case when s.item->>'authority_code'='BGDDT_OFFICIAL_EXAM_2026_GEOGRAPHY' then
            s.item || jsonb_build_object(
              'label','Đề thi chính thức môn Địa lí — Kỳ thi tốt nghiệp THPT 2026 (mã 0921)',
              'locator_status','GOVERNMENT_PORTAL_EXAM_REPRODUCTION_VERIFIED',
              'exam_code','0921',
              'source_url','https://xaydungchinhsach.chinhphu.vn/thi-tot-nghiep-thpt-2026-de-thi-mon-dia-li-va-goi-y-dap-an-119260612141919076.htm',
              'artifact_images',jsonb_build_array(
                'https://xdcs.cdnchinhphu.vn/446259493575335936/2026/6/12/de-dia-1-1781248339286-17812483397321884321791.jpg',
                'https://xdcs.cdnchinhphu.vn/446259493575335936/2026/6/12/de-dia-2-1781248340247-17812483404201435324098.jpg',
                'https://xdcs.cdnchinhphu.vn/446259493575335936/2026/6/12/de-dia-3-1781248340837-17812483409771230335140.jpg',
                'https://xdcs.cdnchinhphu.vn/446259493575335936/2026/6/12/de-dia-4-1781248341409-17812483415571702270283.jpg'
              ),
              'answer_policy','OFFICIAL_ANSWER_PROVENANCE_ONLY_NOT_GENERATION_SOURCE'
            )
          else s.item end
          order by s.ord
        ),'[]'::jsonb)
        from jsonb_array_elements(coalesce(p.profile->'declared_sources','[]'::jsonb))
          with ordinality as s(item,ord)
      ),
      true
    ),
    updated_at=now()
where p.profile_id='DIA_LI_TNTHPT_2025_PLUS_V1';

commit;
