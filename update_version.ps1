# Script tự động cập nhật phiên bản PWA cục bộ
# Cách dùng: Chuột phải vào file này -> Run with PowerShell

$buildId = Get-Date -Format "yyyyMMdd-HHmm"
$files = @("hoc_sinh.js", "sw.js")

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        # Tìm và thay thế {{BUILD_ID}} hoặc bất kỳ giá trị VERSION nào hiện có
        $newContent = $content -replace "VERSION\s*=\s*'.*?'", "VERSION = '$buildId'"
        # Dự phòng cho placeholder
        $newContent = $newContent -replace "{{BUILD_ID}}", $buildId
        
        Set-Content -Path $file -Value $newContent -NoNewline
        Write-Host "✅ Đã cập nhật $file lên phiên bản: $buildId" -ForegroundColor Green
    } else {
        Write-Host "❌ Không tìm thấy file $file" -ForegroundColor Red
    }
}

Write-Host "`nHoàn tất! Bây giờ bạn có thể upload code lên host." -ForegroundColor Cyan
Pause
