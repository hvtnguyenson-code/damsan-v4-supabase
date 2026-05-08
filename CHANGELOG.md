# CHANGELOG — Đam San V4

Nhật ký thay đổi, lỗi đã xử lý và quyết định kỹ thuật.

---

## [20260508-Fix1A1B1C2A] — 2026-05-08 (phiên chiều)

### Fix 1A: Màn hình đáp án hiển thị thiếu A/B/C/D (gate lỗi)
- **Triệu chứng:** Một số học sinh xem đáp án thấy thiếu text phương án, chỉ hiện "Bạn chọn: X | Đáp án đúng: Y".
- **Nguyên nhân gốc:** Điều kiện `!chiTiet[0].A` trong `checkTeacherCommand` chỉ kiểm tra câu đầu tiên. Nếu câu đầu có `.A` (bất kỳ nguồn nào), toàn bộ enrichment bị skip dù các câu còn lại chưa có A/B/C/D.
- **Fix:** Bỏ gate `!chiTiet[0].A` — luôn enrich từ `de_thi` khi `trang_thai = XEM_DAP_AN` và có `ma_de`. Thêm `|| ct.X` để bảo toàn giá trị đang có trong `chi_tiet` phòng trường hợp `de_thi` không có trường tương ứng.
- **File:** `hoc_sinh.js` — `checkTeacherCommand()`, line ~1583–1599

### Fix 1C: Màn hình đáp án trống nội dung câu hỏi khi học sinh re-login/F5
- **Triệu chứng:** Học sinh F5 hoặc đóng/mở lại app sau khi đã nộp bài — xem đáp án thấy câu hỏi không có nội dung (vì `state.cau_hoi` trống).
- **Nguyên nhân gốc:** Đường re-login (line 963–968) early-return trước khi `state.cau_hoi` được populate ở line 981. `renderReview` dùng `state.cau_hoi[index]` làm fallback nhưng array trống → `qData = {}`.
- **Fix:** Sau khi enrichment từ `de_thi` thành công, nếu `state.cau_hoi.length === 0` thì populate từ `cauHois` (data đã có sẵn trong cùng query). Lớp bảo vệ thứ 2 cho Fix 1A.
- **File:** `hoc_sinh.js` — `checkTeacherCommand()`, line ~1598–1602

### Fix 1B: Học sinh phải bấm thủ công mới thấy đáp án sau khi nộp bài
- **Triệu chứng:** Sau khi nộp bài thành công, khi giáo viên bấm "Công bố đáp án", học sinh KHÔNG tự động thấy — phải bấm "Tải lại thủ công".
- **Nguyên nhân gốc:** Fix 3 (tối 20260507) đóng Realtime channel ngay sau nộp bài để tránh tích lũy connection. Khi giáo viên publish sau đó, event Realtime không còn ai nhận.
- **Fix:** Thêm hàm `kichHoatLienKetRealtimeKetQua()` — subscribe channel riêng `result-watch-{phong_id}` ngay sau khi nộp bài thành công. Handler chỉ xử lý `CONG_BO_DIEM`/`XEM_DAP_AN`, **không có nhánh THU_BAI→gradeAndSubmit** để tránh submit lần 2. Tự dọn sau 30 phút (timeout) và khi đóng tab (`beforeunload`). Hàm `dongRealtimeKetQua()` cleanup cả timer lẫn event listener.
- **File:** `hoc_sinh.js` — `kichHoatLienKetRealtimeKetQua()`, `dongRealtimeKetQua()`, `gradeAndSubmit()` success path

### Fix 2A: Retry storm — học sinh thất bại retry đồng thời gây burst thứ hai
- **Triệu chứng:** 6/35 học sinh lớp 3 vẫn "Lỗi nặng" dù đã có jitter ban đầu + 5 lần retry.
- **Nguyên nhân gốc:** Công thức retry cũ `1500 × 2^(attempt-1) + random(500ms)` có jitter quá nhỏ (+0–500ms). Khi N học sinh cùng fail lần 1, họ retry gần đồng thời tại ~1500ms, tạo burst thứ 2 trước khi pool Supabase kịp phục hồi.
- **Fix:** Đổi sang flat random `2000 + random(0–5000ms)` — mỗi lần retry chờ 2–7 giây ngẫu nhiên, không phụ thuộc số lần thất bại. Học sinh thất bại cùng lúc retry ở các thời điểm khác nhau trong window 2–7s. Thêm progress text vào nút: "⏳ Đang thử lại... (2/5)" để học sinh biết hệ thống vẫn đang xử lý.
- **Tổng thời gian retry:** ~10–35s (so với ~20.5s cũ, nhưng phân tán đều hơn).
- **File:** `hoc_sinh.js` — `gradeAndSubmit()`, line ~1550–1557

---

## [20260508-0015] — 2026-05-08

### Fix: Giao diện tiếng Việt bị lỗi hoàn toàn (garbled)
- **Triệu chứng:** Toàn bộ text tiếng Việt hiển thị dạng `Ã¡Â»â€¡` thay vì chữ đúng.
- **Nguyên nhân gốc:** File `hoc_sinh.js` bị double-encoded UTF-8. Script `update_version.ps1` dùng `Get-Content` (đọc UTF-8 file như Windows-1252) rồi viết lại bằng `Set-Content` (mặc định ANSI) qua nhiều lần chạy. Sau đó `WriteAllText` với explicit UTF-8 encoding đã re-encode lần 2, tạo ra double-encoded file.
- **Fix:** Reverse-decode 2 bước: `ReadAllText(UTF-8)` → `GetBytes(Windows-1252)` → `GetString(UTF-8)` × 2 lần, khôi phục lại nội dung gốc.
- **File:** `hoc_sinh.js`
- **Commit:** `9efeab2`

### Fix: Button "Đăng nhập" không phản hồi (SyntaxError)
- **Triệu chứng:** Click nút đăng nhập — không có gì xảy ra, không có alert, không có loading state.
- **Nguyên nhân gốc:** Property name `cau_hỏi` trong object `state` (dòng 6) là JavaScript identifier dùng ký tự Unicode `ỏ`. Sau khi bị double-encode, `ỏ` → `Ã¡Â»` + control char U+008F. U+008F là ký tự không hợp lệ trong JS identifier → `SyntaxError: Invalid or unexpected token` ngay dòng 6 → toàn bộ script không load → `login()` không tồn tại → button click = silent fail.
- **Fix:** Đổi `cau_hỏi` → `cau_hoi` (ASCII thuần) ở tất cả 14 chỗ dùng.
- **File:** `hoc_sinh.js`
- **Commit:** `4533196`

### Fix: `so_lan_vi_pham` không được lưu dù học sinh vi phạm
- **Triệu chứng:** Cột vi phạm trên dashboard giáo viên luôn trống.
- **Nguyên nhân gốc:** Supabase JS v2 dùng **lazy query builder** — `supabase.from(...).update(...).eq(...)` trả về `PromiseLike`, chỉ thực sự gửi HTTP request khi có `.then()` hoặc `await`. Fix trước đã xóa `await` để fire-and-forget nhưng không thêm `.then()`, khiến request **không bao giờ được gửi**.
- **Fix:** Thêm `.then(() => {})` để trigger thực thi mà không block.
- **File:** `hoc_sinh.js`, dòng 1508
- **Commit:** `877c890`

---

## [20260507-2359] — 2026-05-07 (phiên làm việc trước)

### Fix: 10–13 học sinh lớp 2 và 3 mất bài ("Lỗi không xác định")
- **Triệu chứng:** Lớp 1 nộp bài 100%. Lớp 2–3 có 10–13 học sinh không nộp được, server trả về lỗi không xác định (`error=null, data=null`).
- **Nguyên nhân gốc:** 34 học sinh `setInterval(1000ms)` cùng đếm ngược, khi `diff <= 0` tất cả đồng loạt gọi RPC `nop_bai_va_cham_diem`. Supabase free tier có ~15–20 connection pool slot (Supavisor transaction mode). 34 RPC đồng thời → pool cạn kiệt → timeout → `data=null, error=null`. Lớp 1 không bị vì connection pool còn lạnh; lớp 2–3 bị vì kết nối Realtime của lớp 1 chưa đóng, pool đã có sẵn tải nền.
- **Fix (Jitter — thay đổi chính):** Thêm random delay 0–15 giây trước khi gọi `gradeAndSubmit()` khi timer hết giờ và khi nhận lệnh THU_BAI qua Realtime. Trải đều 34 request thành ~2–3 RPC/giây, nằm trong giới hạn free tier.
- **Fix (Retry):** Vòng lặp retry tối đa 5 lần với exponential backoff (~1.5s, ~3s, ~6s, ~10s) cộng jitter 500ms.
- **Fix A:** Reset `isSubmitting = false` trong success path (trước đó chỉ reset trong `catch`).
- **Fix B → `.then()`:** Đồng bộ `so_lan_vi_pham` sau khi nộp bài thành công — dùng fire-and-forget (xem thêm fix 20260508-0015).
- **Fix 3:** Đóng Realtime channel sau khi nộp bài thành công để tránh tích lũy kết nối giữa các lớp.
- **Debug log:** Thêm `console.log('[DEBUG nopbai]...')` tại mỗi retry để trace khi kiểm tra thực tế.
- **File:** `hoc_sinh.js`
- **Commits:** `eabe30c`, `08c3512`

### Redesign: Màn hình xem lại đáp án
- **Vấn đề:** Review chỉ hiển thị "Bạn chọn: X" — không có nội dung đáp án A/B/C/D.
- **Nguyên nhân:** `ket_qua.chi_tiet` không lưu text đáp án, chỉ lưu key (A/B/C/D). Code cũ dùng `if (!optText) return` nên skip hết.
- **Fix:** Dùng `state.cau_hoi[index]` làm fallback source để lấy text A/B/C/D khi render. Redesign layout:
  - Tô xanh đáp án đúng
  - Tô đỏ đáp án học sinh chọn sai
  - Badge "Bạn chọn · Đúng" / "Bạn chọn"
  - Cảnh báo `⚠️ Bỏ trống — không được điểm` cho câu bỏ trống
- **File:** `hoc_sinh.js` — hàm `renderReview()`
- **Commit:** `08c3512`

### Fix nhỏ: Typo
- `"LỖI NẠNG"` → `"LỖI NẶNG"` trong alert nộp bài thất bại.

---

## Lưu ý kỹ thuật quan trọng

### Encoding — CẢNH BÁO
**Không dùng PowerShell `Get-Content` / `Set-Content` để sửa `hoc_sinh.js` hoặc `sw.js`.**  
File là UTF-8 (không BOM). PowerShell 5.1 `Get-Content` mặc định đọc theo ANSI/Windows-1252. Nếu đọc sai encoding rồi write lại bằng UTF-8 → double-encode → text tiếng Việt bị garbled + có thể tạo JS identifier bất hợp lệ.

**Cách an toàn để version bump:**
```powershell
# Đọc và ghi đúng encoding
$content = [System.IO.File]::ReadAllText('hoc_sinh.js', [System.Text.Encoding]::UTF8)
$content = $content -replace "VERSION\s*=\s*'.*?'", "VERSION = '$buildId'"
[System.IO.File]::WriteAllText($fullPath, $content, [System.Text.UTF8Encoding]::new($false))
```
Hoặc dùng Edit tool của Claude Code trực tiếp.

### Supabase JS v2 — Lazy Query Builder
`supabase.from('table').update({...}).eq(...)` **không tự động gửi request**.  
Phải có `.then()` hoặc `await` để trigger. Fire-and-forget đúng cách:
```javascript
supabase.from('table').update({...}).eq(...).then(() => {});
```

### Giới hạn Supabase Free Tier
- Connection pool: ~15–20 slot (Supavisor transaction mode)
- 34 RPC đồng thời = vượt giới hạn → timeout
- Luôn dùng jitter (random delay) khi có nhiều client có thể trigger cùng lúc
