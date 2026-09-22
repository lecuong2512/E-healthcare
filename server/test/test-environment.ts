import { environment } from "../src/config/environment";

// Chỉ dùng các khóa giả riêng cho kiểm thử, không dùng khóa của hệ thống thật.
environment.JWT_ACCESS_SECRET = "test-access-secret-not-for-production-123456";
environment.JWT_REFRESH_SECRET =
  "test-refresh-secret-not-for-production-654321";
environment.OTP_HMAC_SECRET = "test-otp-secret-not-for-production-123456789";
environment.QR_CHECKIN_SECRET = "test-qr-checkin-secret-not-for-production-987654321";
environment.QUEUE_BOARD_SECRET = "test-queue-board-secret-not-for-production-123456789";
