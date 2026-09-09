import { Injectable, signal } from '@angular/core';

/**
 * In-memory Access Token store.
 *
 * SRS-AUTH-02 / NFR-SEC-02:
 * - Access Token (TTL 15 phút) chỉ giữ trong bộ nhớ JS (KHÔNG localStorage/sessionStorage)
 *   để giảm bề mặt tấn công XSS.
 * - Refresh Token (TTL 7 ngày) hoàn toàn không chạm tới từ JS — nó nằm trong
 *   HttpOnly + Secure + SameSite=Strict cookie do backend set, trình duyệt tự
 *   động gửi kèm khi gọi /auth/refresh với { withCredentials: true }.
 *
 * Vì access token chỉ sống trong bộ nhớ, khi F5 lại trang, app phải tự động
 * gọi /auth/refresh 1 lần lúc khởi động (xem AuthService.bootstrapSession()).
 */
@Injectable({ providedIn: 'root' })
export class TokenStoreService {
  private readonly _accessToken = signal<string | null>(null);
  private readonly _userRole = signal<string | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly userRole = this._userRole.asReadonly();

  setSession(accessToken: string, role: string): void {
    this._accessToken.set(accessToken);
    this._userRole.set(role);
  }

  clear(): void {
    this._accessToken.set(null);
    this._userRole.set(null);
  }

  isAuthenticated(): boolean {
    return this._accessToken() !== null;
  }
}
