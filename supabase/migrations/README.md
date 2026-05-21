# Supabase migrations

Thu muc nay se chua migration hardening sau khi co ket qua audit tu `supabase/audit/00_security_audit.sql`.

Khong nen viet/chay migration production khi chua biet:

- RLS policy hien co.
- Source RPC `lay_de_thi_an_toan` va `nop_bai_va_cham_diem`.
- Constraint unique cua `ket_qua`, `de_thi`, `hoc_sinh`, `giao_vien`.
- Grant hien tai cho `anon` va `authenticated`.

Sau khi ban chay audit va dan ket qua ve, Codex se tao migration SQL chinh xac theo schema production.
