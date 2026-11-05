begin;

-- 100 — Current-effective Geography curriculum authority bundle.
-- Keeps the stable authority code while declaring the 2018 base program together with
-- the current 2025 amendment and official MOET competency-alignment evidence.

update public.assessment_authority_profiles p
set profile_version='100',
    profile=jsonb_set(
      jsonb_set(
        coalesce(p.profile,'{}'::jsonb),
        '{version}',
        '"100"'::jsonb,
        true
      ),
      '{declared_sources}',
      (
        select coalesce(jsonb_agg(
          case
            when s.item->>'authority_code'='BGDDT_GEOGRAPHY_CURRICULUM_2018' then
              s.item || jsonb_build_object(
                'label','Chương trình môn Địa lí hiện hành — GDPT 2018 sau sửa đổi TT17/2025',
                'locator_status','CURRENT_AUTHORITY_BUNDLE_LOCATED',
                'source_bundle',jsonb_build_array(
                  jsonb_build_object(
                    'role','BASE_PROGRAM',
                    'publisher','Bộ Giáo dục và Đào tạo',
                    'source_url','https://moet.gov.vn/content/vanban/Lists/VBPQ/Attachments/1483/vbhn-chuong-trinh-tong-the.pdf',
                    'note','Văn bản hợp nhất Chương trình GDPT — căn cứ nền'
                  ),
                  jsonb_build_object(
                    'role','GEOGRAPHY_COMPETENCY_ALIGNMENT',
                    'publisher','Bộ Giáo dục và Đào tạo',
                    'source_url','https://moet.gov.vn/content/vanban/Lists/VBPQ/Attachments/1468/chuong-trinh-gdtx-thptsigned.pdf',
                    'note','Nguồn Bộ công bố mô tả cùng hệ thành phần năng lực đặc thù môn Địa lí'
                  ),
                  jsonb_build_object(
                    'role','CURRENT_AMENDMENT',
                    'publisher','Bộ Giáo dục và Đào tạo / Cổng TTĐT Chính phủ',
                    'source_url','https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/9/17-bgddt.pdf',
                    'effective_from','2025-09-12',
                    'note','TT17/2025 — Phụ lục IV sửa đổi chương trình Địa lí THPT, áp dụng hiện hành'
                  )
                )
              )
            else s.item
          end
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
