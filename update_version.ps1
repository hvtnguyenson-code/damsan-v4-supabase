# Script tự động cập nhật phiên bản PWA và đẩy lên GitHub
$buildId = Get-Date -Format "yyyyMMdd-HHmm"
$files = @("hoc_sinh.js", "sw.js")
$htmlFiles = @("hoc_sinh.html", "giaovien.html")

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $newContent = $content -replace "VERSION\s*=\s*'.*?'", "VERSION = '$buildId'"
        $newContent = $newContent -replace "{{BUILD_ID}}", $buildId
        Set-Content -Path $file -Value $newContent -NoNewline
        Write-Host "✅ Đã cập nhật $file lên phiên bản: $buildId" -ForegroundColor Green
    }
}

foreach ($file in $htmlFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $newContent = $content -replace '(\.js|\.css)\?v=[^"''\s>]*', "`$1?v=$buildId"
        Set-Content -Path $file -Value $newContent -NoNewline
        Write-Host "✅ Đã cập nhật tham số phiên bản trong $($file): $buildId" -ForegroundColor Green
    }
}

Write-Host "`n🚀 Đang đẩy code lên GitHub..." -ForegroundColor Yellow

# Kiểm tra xem đây có phải là repository Git không
if (!(Test-Path ".git")) {
    Write-Host "❌ Lỗi: Thư mục này chưa được khởi tạo Git. Vui lòng chạy 'git init' và thêm remote." -ForegroundColor Red
    Pause
    exit
}

# Thêm tất cả thay đổi
git add .

# Commit thay đổi
$commitMsg = "Auto-update version $buildId and fix violation flags"
git commit -m $commitMsg

# Kiểm tra xem có remote origin chưa
$remote = git remote
if ($null -eq $remote -or $remote -notcontains "origin") {
    Write-Host "⚠️ Cảnh báo: Chưa cấu hình remote 'origin'. Code chỉ được commit local." -ForegroundColor Yellow
    Write-Host "Gợi ý: git remote add origin <URL_CUA_BAN>" -ForegroundColor Gray
} else {
    # Đẩy lên GitHub
    git push origin main
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✨ HOÀN TẤT! Code đã được đưa lên GitHub." -ForegroundColor Cyan
    } else {
        Write-Host "`n❌ Lỗi: Không thể đẩy code lên GitHub. Vui lòng kiểm tra kết nối hoặc quyền truy cập." -ForegroundColor Red
    }
}

Pause

