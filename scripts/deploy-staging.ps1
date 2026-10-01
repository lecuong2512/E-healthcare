# ==============================================================================
# E-HEALTHCARE PORTAL - KỊCH BẢN TRIỂN KHAI QA TRÊN POWERSHELL
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "🚀 [QA DEPLOY] Bắt đầu triển khai nhánh develop..." -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Update git
Write-Host "==> [1/7] Đồng bộ mã nguồn develop..." -ForegroundColor Yellow
git fetch origin develop
git checkout develop
git pull origin develop

# 2. Check .env
if (-not (Test-Path ".env")) {
    Write-Host "❌ LỖI: Không tìm thấy file .env tại thư mục gốc!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Đã tìm thấy file .env." -ForegroundColor Green

# 3. Docker infrastructure
Write-Host "==> [2/7] Khởi động PostgreSQL & Redis..." -ForegroundColor Yellow
docker compose up -d postgres redis

# 4. Dependencies
Write-Host "==> [3/7] Cài đặt dependencies..." -ForegroundColor Yellow
npm ci
npm run build:shared

# 5. Migrations & Seed
Write-Host "==> [4/7] Chạy migrations và seed tài khoản QA..." -ForegroundColor Yellow
npm run migration:run --workspace=@ehealth/server
npm run seed:qa --workspace=@ehealth/server

# 6. Build
Write-Host "==> [5/7] Biên dịch monorepo..." -ForegroundColor Yellow
npm run build

# 7. Start
Write-Host "==> [6/7] Khởi động Nginx Gateway..." -ForegroundColor Yellow
docker compose up -d nginx

Write-Host "======================================================================" -ForegroundColor Green
Write-Host "🎉 [HOÀN TẤT] Bạn có thể bắt đầu backend bằng: npm run start --workspace=@ehealth/server" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
