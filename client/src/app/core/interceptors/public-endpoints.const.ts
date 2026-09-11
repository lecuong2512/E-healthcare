/**
 * Endpoint không cần gắn Access Token, không trigger auto-refresh khi 401,
 * và KHÔNG hiện toast "Phiên đăng nhập hết hạn" khi 401 (xem error.interceptor.ts).
 * Tách riêng thành hằng số dùng chung để 2 interceptor không bị lệch danh sách.
 */
export const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/otp'];
