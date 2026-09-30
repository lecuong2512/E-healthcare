#!/usr/bin/env bash
# ==============================================================================
# E-HEALTHCARE PORTAL - KỊCH BẢN TRIỂN KHAI TẠM NHÁNH DEVELOP LÊN MÁY CHỦ QA
# ==============================================================================
set -euo pipefail

echo "======================================================================"
echo "🚀 [QA DEPLOY] Bắt đầu triển khai nhánh develop lên máy chủ QA..."
echo "======================================================================"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# 1. Cập nhật mã nguồn nhánh develop mới nhất từ GitHub
echo "==> [1/7] Đồng bộ mã nguồn develop..."
git fetch origin develop
git checkout develop
git pull origin develop

# 2. Kiểm tra file cấu hình .env
echo "==> [2/7] Kiểm tra file .env..."
if [ ! -f .env ]; then
  echo "❌ LỖI: Không tìm thấy file .env tại thư mục gốc ($PROJECT_DIR/.env)!"
  echo "Vui lòng copy file .env chứa credentials thực tế lên máy chủ trước khi chạy deploy."
  exit 1
fi
echo "✓ Đã tìm thấy file .env hợp lệ."

# 3. Khởi động hạ tầng Docker (PostgreSQL 16 & Redis 7.2)
echo "==> [3/7] Khởi động hạ tầng PostgreSQL & Redis qua Docker Compose..."
docker compose up -d postgres redis

echo "==> Đợi PostgreSQL sẵn sàng nhận kết nối..."
for i in {1..30}; do
  if docker exec ehealth-postgres pg_isready -U postgres -d ehealth_db > /dev/null 2>&1; then
    echo "✓ PostgreSQL đã sẵn sàng."
    break
  fi
  sleep 1
done

# 4. Cài đặt thư viện & build shared module
echo "==> [4/7] Cài đặt dependencies và build @ehealth/shared..."
npm ci
npm run build:shared

# 5. Chạy TypeORM Database Migrations & Seed tài khoản QA
echo "==> [5/7] Thực thi Database Migrations..."
npm run migration:run --workspace=@ehealth/server

echo "==> Nạp dữ liệu tài khoản mẫu QA (Doctor, Patient, Receptionist, Admin)..."
npm run seed:qa --workspace=@ehealth/server || true

# 6. Biên dịch ứng dụng Backend & Frontend
echo "==> [6/7] Build ứng dụng Backend (NestJS) và Frontend (Angular 18)..."
npm run build

# 7. Khởi động Backend & Gateway Nginx
echo "==> [7/7] Khởi chạy dịch vụ..."
if command -v pm2 > /dev/null 2>&1; then
  echo "==> Quản lý process Backend bằng PM2..."
  pm2 delete ehealth-api 2>/dev/null || true
  pm2 start "npm run start:dev --workspace=@ehealth/server" --name "ehealth-api"
  pm2 save
  echo "✓ Backend API đã chạy trên PM2 (port 3000)."
else
  echo "⚠️ PM2 chưa được cài đặt toàn cục. Khởi động backend trong background..."
  nohup npm run start:dev --workspace=@ehealth/server > server.log 2>&1 &
  echo "✓ Backend API đã chạy background (PID: $!)."
fi

# Khởi chạy Nginx Reverse Proxy
docker compose up -d nginx
echo "✓ Nginx Gateway (SSL/Reverse Proxy) đã khởi chạy."

echo "======================================================================"
echo "🎉 [DEPLOY THÀNH CÔNG] Hệ thống E-Healthcare QA đã sẵn sàng!"
echo "👉 Cổng API: http://localhost:3000/api/v1/health"
echo "👉 Truy cập Web: https://<SERVER_IP> hoặc http://<SERVER_IP>"
echo "======================================================================"
