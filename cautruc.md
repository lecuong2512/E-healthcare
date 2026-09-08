# TÀI LIỆU CẤU TRÚC THƯ MỤC & NGUYÊN TẮC VẬN HÀNH DỰ ÁN
**Dự án:** Hệ thống Quản lý & Đặt lịch Khám chữa bệnh (E-Healthcare Portal)  
**Căn cứ:** `SRS-EHEALTH-2026-V1`  
**Bộ công nghệ:** Angular 18 (Client) + NestJS 10 (Server) + PostgreSQL 16 + Redis 7.2 + Docker Compose (Monorepo TypeScript)

---

## CẤU TRÚC THƯ MỤC CHUẨN (MONOREPO ARCHITECTURE)

```text
e-healthcare/
├── .github/                                  # Tự động hóa CI/CD
│   └── workflows/
│       ├── lint-test.yml                     # Tự động lint code & unit test khi mở Pull Request
│       └── build-staging.yml                 # Build Docker image & deploy môi trường thử nghiệm
├── docker/                                   # Cấu hình hạ tầng ảo hóa cục bộ & server
│   ├── nginx/
│   │   ├── conf.d/
│   │   │   └── default.conf                  # Cấu hình TLS 1.3, Proxy pass, Rate Limit 60 req/min (NFR-SEC-03)
│   │   └── ssl/                              # Chứng chỉ SSL nội bộ
│   └── postgres/
│       └── init.sql                          # Kích hoạt pgcrypto hỗ trợ hàm mã hóa AES-256 (NFR-SEC-01)
├── docs/                                     # Kho tài liệu pháp lý & đặc tả kỹ thuật
│   ├── SRS-EHEALTH-2026-V1.docx              # Tài liệu đặc tả yêu cầu 
│   ├── ERD_Logical_Physical.png              # Sơ đồ CSDL quan hệ Section 6.1
│   └── RTM_Traceability_Matrix.xlsx          # Ma trận truy vết kiểm thử Section 8
├── tests-load/                               # Kịch bản kiểm thử tải & xung đột tranh chấp slot
│   ├── k6-slot-concurrency.js                # Giả lập 100 CCU đồng thời tranh chấp 1 slot (đo lỗi HTTP 409)
│   └── jmeter-test-plan.jmx                  # Kịch bản tải 500 CCU giờ cao điểm (NFR-PERF-02)
│
├── shared/                                   # DÙNG CHUNG CLIENT (ANGULAR) & SERVER (NESTJS)
│   ├── src/
│   │   ├── enums/
│   │   │   ├── role.enum.ts                  # ROLE_PATIENT, ROLE_DOCTOR, ROLE_RECEPTIONIST, ROLE_ADMIN
│   │   │   ├── appointment-status.enum.ts    # CONFIRMED, CHECKED_IN, IN_CONSULTATION, COMPLETED, NO_SHOW
│   │   │   ├── slot-status.enum.ts           # AVAILABLE, HOLDING, BOOKED, OFF
│   │   │   └── payment-status.enum.ts        # UNPAID, PAID, REFUNDED
│   │   ├── interfaces/                       # Type định nghĩa DTO truyền nhận API
│   │   │   ├── auth.interface.ts             # Cấu trúc payload JWT, dữ liệu đăng ký/đăng nhập
│   │   │   ├── appointment.interface.ts      # DTO đặt slot, thông tin phiếu hẹn
│   │   │   └── clinical.interface.ts         # DTO chẩn đoán ICD-10, chỉ số sinh tồn (vitals), đơn thuốc
│   │   └── index.ts                          # Export toàn bộ dùng chung qua alias @shared/*
│   ├── package.json
│   └── tsconfig.json
│
├── client/                                   # NGUỒN FRONTEND (ANGULAR 18 STANDALONE)
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/                         # Singleton Services, Guards, Interceptors
│   │   │   │   ├── guards/
│   │   │   │   │   ├── auth.guard.ts         # Kiểm tra đăng nhập JWT
│   │   │   │   │   └── role.guard.ts         # Phân quyền 4 vai trò người dùng (SRS-AUTH-02)
│   │   │   │   ├── interceptors/
│   │   │   │   │   ├── auth.interceptor.ts   # Gán withCredentials: true (HttpOnly Cookie JWT)
│   │   │   │   │   └── error.interceptor.ts  # Bắt lỗi toàn cục: 401 Unauthorized, 409 Conflict
│   │   │   │   └── services/
│   │   │   │       ├── auth.service.ts       # Đăng nhập, đăng ký OTP, Google OAuth2
│   │   │   │       └── socket.service.ts     # Quản lý kết nối WebSocket/Socket.io
│   │   │   │
│   │   │   ├── shared/                       # Thành phần UI dùng chung đạt chuẩn WCAG 2.1 AA
│   │   │   │   ├── components/
│   │   │   │   │   ├── countdown-timer/      # Đồng hồ đếm ngược 10:00 giữ slot (Mục 5.1)
│   │   │   │   │   ├── skeleton-loader/      # Skeleton Screen tải ngầm < 300ms (NFR-UX-03)
│   │   │   │   │   ├── qr-scanner/           # Quét mã QR check-in qua camera/máy quét USB HID
│   │   │   │   │   ├── status-badge/         # Phân màu: Xanh (trống), Vàng (giữ chỗ), Xám (đã đặt)
│   │   │   │   │   └── allergy-alert-modal/  # Popup đỏ cảnh báo dị ứng thuốc (SRS-DOC-04)
│   │   │   │   ├── pipes/
│   │   │   │   │   ├── currency-vnd.pipe.ts  # Định dạng tiền tệ VND
│   │   │   │   │   └── icd10-format.pipe.ts  # Định dạng mã bệnh chuẩn ICD-10
│   │   │   │   └── directives/
│   │   │   │
│   │   │   ├── features/                     # 4 Phân hệ nghiệp vụ theo tài liệu SRS
│   │   │   │   ├── auth/                     # Màn hình đăng nhập & đăng ký OTP (SRS-AUTH-01, 02)
│   │   │   │   │   ├── pages/login/
│   │   │   │   │   ├── pages/register/
│   │   │   │   │   └── auth.routes.ts
│   │   │   │   ├── patient/                  # Phân hệ Bệnh nhân (SRS-PAT)
│   │   │   │   │   ├── pages/doctor-search/  # Tìm kiếm toàn văn, bộ lọc chuyên khoa, giá, rating
│   │   │   │   │   ├── pages/booking-stepper/# Luồng đặt khám chuẩn 4 bước (NFR-UX-01)
│   │   │   │   │   ├── pages/medical-history/# 3 Tab: Sắp tới (có QR), Đã khám, Đã hủy
│   │   │   │   │   ├── pages/phr-profile/    # Khai báo nhóm máu, tiền sử dị ứng thuốc (SRS-AUTH-03)
│   │   │   │   │   └── patient.routes.ts
│   │   │   │   ├── doctor/                   # Phân hệ Bác sĩ (SRS-DOC)
│   │   │   │   │   ├── pages/schedule-config/# Đăng ký ca trực, chia slot 15-30m
│   │   │   │   │   ├── pages/patient-queue/  # Hàng đợi khám Realtime
│   │   │   │   │   ├── pages/consultation/   # Buồng khám EMR: Vitals, ICD-10, kê đơn
│   │   │   │   │   └── doctor.routes.ts
│   │   │   │   ├── receptionist/             # Phân hệ Lễ tân (SRS-REC)
│   │   │   │   │   ├── pages/checkin-desk/   # Quét mã QR, tiếp đón, in phiếu thu
│   │   │   │   │   ├── pages/walkin-booking/ # Tạo lịch khám trực tiếp khách vãng lai
│   │   │   │   │   ├── pages/queue-board/    # Màn hình gọi số ngoài sảnh
│   │   │   │   │   └── receptionist.routes.ts
│   │   │   │   └── admin/                    # Phân hệ Quản trị (SRS-ADM)
│   │   │   │       ├── pages/dashboard/      # Thống kê KPI doanh thu, tỷ lệ No-show
│   │   │   │       ├── pages/catalogs/       # CRUD Chuyên khoa, Danh mục Thuốc, Biểu phí
│   │   │   │       ├── pages/staff-mgmt/     # Quản lý chứng chỉ hành nghề (CCHN) bác sĩ
│   │   │   │       ├── pages/audit-logs/     # Xem nhật ký kiểm toán Append-only (SRS-ADM-04)
│   │   │   │       └── admin.routes.ts
│   │   │   ├── app.config.ts                 # Cấu hình Providers, Interceptors, Animations
│   │   │   ├── app.routes.ts                 # Lazy loading các feature routes
│   │   │   └── app.component.ts
│   │   ├── environments/
│   │   ├── index.html
│   │   ├── styles.scss                       # Tích hợp TailwindCSS & Angular Material Clean UI
│   │   └── main.ts
│   ├── angular.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── server/                                   # NGUỒN BACKEND (NESTJS 10 MODULAR MONOLITH)
│   ├── src/
│   │   ├── common/                           # Hạ tầng & Logic dùng chung toàn API
│   │   │   ├── decorators/                   # @Roles(), @CurrentUser(), @Public()
│   │   │   ├── filters/                      # http-exception.filter.ts (chuẩn hóa response lỗi JSON)
│   │   │   ├── guards/                       # jwt-auth.guard.ts, roles.guard.ts
│   │   │   ├── interceptors/                 # transform.interceptor.ts, audit-log.interceptor.ts
│   │   │   └── utils/
│   │   │       ├── crypto.util.ts            # Hàm mã hóa/giải mã AES-256 (NFR-SEC-01)
│   │   │       └── vnpay-hash.util.ts        # Ký số HMAC-SHA512 cho cổng thanh toán VNPAY
│   │   │
│   │   ├── database/                         # Cấu hình TypeORM & PostgreSQL 16
│   │   │   ├── migrations/                   # File migration CSDL & đánh B-Tree Index
│   │   │   ├── entities/                     # 10 Thực thể CSDL cốt lõi (Section 6.2)
│   │   │   │   ├── user.entity.ts            # USERS
│   │   │   │   ├── doctor.entity.ts          # DOCTORS
│   │   │   │   ├── specialty.entity.ts       # SPECIALTIES
│   │   │   │   ├── doctor-schedule.entity.ts # DOCTOR_SCHEDULES (chứa cột version Optimistic Lock)
│   │   │   │   ├── appointment.entity.ts     # APPOINTMENTS
│   │   │   │   ├── medical-record.entity.ts  # MEDICAL_RECORDS (vital_signs, clinical_notes)
│   │   │   │   ├── prescription.entity.ts    # PRESCRIPTIONS
│   │   │   │   ├── prescription-item.entity.ts # PRESCRIPTION_ITEMS
│   │   │   │   ├── payment-trans.entity.ts   # PAYMENT_TRANS
│   │   │   │   └── audit-log.entity.ts       # AUDIT_LOGS (Ràng buộc Append-only)
│   │   │   └── database.module.ts
│   │   │
│   │   ├── modules/                          # CÁC MODULE NGHIỆP VỤ ĐỘC LẬP
│   │   │   ├── auth/                         # Module IAM, JWT, OTP 3m, Google OAuth2 (SRS-AUTH-01, 02)
│   │   │   ├── booking/                      # Khóa phân tán Redis SETNX TTL 600s, lỗi 409 (Mục 5.1 & SRS-PAT-02)
│   │   │   ├── appointment/                  # Máy trạng thái Lịch hẹn, chính sách hoàn tiền 100/70/0% (Mục 5.2, 5.3)
│   │   │   ├── clinical/                     # Buồng khám EMR, khóa sau 24h, cảnh báo dị ứng thuốc (SRS-DOC-03, 04)
│   │   │   ├── reception/                    # API Check-in QR, tiếp đón Walk-in (SRS-REC-01, 02)
│   │   │   ├── payment/                      # Tích hợp cổng VNPAY Sandbox, xác thực IPN Webhook (SRS-PAT-03)
│   │   │   ├── notification/                 # Gửi Email SMTP, Cron Job quét nhắc lịch mốc T-24h và T-2h (SRS-PAT-05)
│   │   │   ├── realtime/                     # Socket.io Gateway cập nhật hàng đợi khám tức thời (Section 3.4)
│   │   │   └── admin/                        # Báo cáo KPI, xuất file Excel SheetJS, quản lý danh mục (SRS-ADM-01..04)
│   │   │
│   │   ├── config/                           # Đọc biến môi trường Type-safe (.env)
│   │   ├── app.module.ts
│   │   └── main.ts                           # Khởi tạo API, cấu hình CORS, Cookie-parser, Swagger
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── package.json
│
├── docker-compose.yml                        # Điều phối chạy Postgres 16, Redis 7.2, Nginx, NestJS
├── .env.example
├── .gitignore
├── package.json                              # Quản lý workspaces cho toàn bộ dự án Monorepo
└── README.md                                 # Hướng dẫn setup và phân công nhóm