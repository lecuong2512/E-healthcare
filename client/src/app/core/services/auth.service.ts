import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, of, tap } from 'rxjs';
import { TokenStoreService } from './token-store.service';
import { SocketService } from './socket.service';
import {
  CurrentUser,
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

  readonly userRole = this.tokenStore.userRole;
  readonly currentUser = this.tokenStore.currentUser;

  getCurrentUser(): CurrentUser | null {
    return this.tokenStore.currentUser();
  }

  setCurrentUser(user: CurrentUser | null): void {
    this.tokenStore.setCurrentUser(user);
  }

  login(identifier: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${API_BASE}/auth/login`,
        { identifier, password },
        { withCredentials: true }, // để backend set HttpOnly refresh-token cookie
      )
      .pipe(
        tap((res) => {
          this.tokenStore.setSession(res.accessToken, res.role, res.user);
          if (!res.user) {
            this.fetchProfile().subscribe({ error: () => {} });
          }
        }),
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
    return this.refreshToken().pipe(
      catchError(() => {
        this.tokenStore.clear();
        return of(null);
      }),
    );
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

  forgotPassword(identifier: string): Observable<{ expiresIn: number }> {
    return this.http.post<{ expiresIn: number }>(
      `${API_BASE}/auth/forgot-password`,
      { identifier },
    );
  }

  resetPassword(payload: {
    identifier: string;
    otp: string;
    newPassword: string;
  }): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/reset-password`, payload);
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
        tap((res) => this.tokenStore.setSession(res.accessToken, res.role, res.user)),
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
        tap((res) => {
          this.tokenStore.setSession(res.accessToken, res.role, res.user);
          if (!res.user) {
            this.fetchProfile().subscribe({ error: () => {} });
          }
        }),
      );
  }

  fetchProfile(): Observable<CurrentUser> {
    return this.http.get<CurrentUser>(`${API_BASE}/auth/profile`).pipe(
      tap((user) => {
        if (user) {
          const current = this.tokenStore.currentUser();
          const merged: CurrentUser = {
            id: user.id ?? (user as any).userId ?? current?.id,
            fullName: user.fullName ?? current?.fullName ?? '',
            email: user.email ?? current?.email,
            phoneNumber: user.phoneNumber ?? current?.phoneNumber,
            role: user.role ?? current?.role ?? '',
          };
          this.tokenStore.setCurrentUser(merged);
        }
      }),
    );
  }
}
