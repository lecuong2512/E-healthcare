import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, of, tap } from 'rxjs';
import { TokenStoreService } from './token-store.service';
import { SocketService } from './socket.service';
import {
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterOtpResponse,
  RegisterVerifyResponse,
} from '@shared/interfaces';

const API_BASE = '/api/v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(TokenStoreService);
  private readonly socketService = inject(SocketService);

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
      .pipe(
        finalize(() => {
          this.socketService.disconnect();
          this.tokenStore.clear();
        }),
      );
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

  requestRegisterOtp(
    payload: RegisterRequest,
  ): Observable<RegisterOtpResponse> {
    return this.http.post<RegisterOtpResponse>(
      `${API_BASE}/auth/register/otp`,
      payload,
    );
  }

  verifyRegisterOtp(
    registrationId: string,
    otp: string,
  ): Observable<RegisterVerifyResponse> {
    return this.http.post<RegisterVerifyResponse>(
      `${API_BASE}/auth/register/verify`,
      { registrationId, otp },
    );
  }

  // Chuyển sang Google; backend xác thực danh tính và thiết lập cookie phiên.
  loginWithGoogle(): void {
    window.location.href = `${API_BASE}/auth/google`;
  }

  completeGoogleRegistration(payload: {
    fullName: string;
    gender: RegisterRequest['gender'];
    dateOfBirth: string;
  }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${API_BASE}/auth/google/complete`, payload, {
        withCredentials: true,
      })
      .pipe(
        tap((res) => this.tokenStore.setSession(res.accessToken, res.role)),
      );
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
