import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import { TokenStoreService } from './token-store.service';
import { LoginResponse, RefreshResponse } from '@shared/interfaces';

const API_BASE = '/api/v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(TokenStoreService);

  login(identifier: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${API_BASE}/auth/login`,
        { identifier, password },
        { withCredentials: true }, // để backend set HttpOnly refresh-token cookie
      )
      .pipe(
        tap((res) => this.tokenStore.setSession(res.accessToken, res.role)),
      );
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${API_BASE}/auth/logout`, {}, { withCredentials: true })
      .pipe(tap(() => this.tokenStore.clear()));
  }

  /**
   * Gọi khi app khởi động (APP_INITIALIZER) để "phục hồi" phiên đăng nhập
   * từ Refresh Token cookie, vì Access Token không được lưu bền (persist).
   * Nếu không còn cookie hợp lệ / hết hạn 7 ngày -> coi như chưa đăng nhập,
   * không văng lỗi ra UI.
   */
  bootstrapSession(): Observable<RefreshResponse | null> {
    return this.refreshToken().pipe(catchError(() => of(null)));
  }

  // TODO (SRS-AUTH-01, task riêng): đăng ký kèm xác thực OTP qua SMS.
  requestRegisterOtp(_phone: string): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/register/otp`, {
      phone: _phone,
    });
  }

  verifyRegisterOtp(
    _phone: string,
    _otp: string,
    _payload: unknown,
  ): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${API_BASE}/auth/register/verify`,
        { phone: _phone, otp: _otp, ...(_payload as Record<string, unknown>) },
        { withCredentials: true },
      )
      .pipe(
        tap((res) => this.tokenStore.setSession(res.accessToken, res.role)),
      );
  }

  // TODO (SRS-AUTH-02, task riêng): redirect sang Google OAuth2 consent screen,
  // backend xử lý callback rồi set cookie như luồng login thường.
  loginWithGoogle(): void {
    window.location.href = `${API_BASE}/auth/google`;
  }

  refreshToken(): Observable<RefreshResponse> {
    return this.http
      .post<RefreshResponse>(
        `${API_BASE}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .pipe(
        tap((res) => this.tokenStore.setSession(res.accessToken, res.role)),
      );
  }
}
