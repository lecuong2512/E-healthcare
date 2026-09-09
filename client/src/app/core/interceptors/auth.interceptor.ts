import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { TokenStoreService } from '../services/token-store.service';

// Endpoint không cần gắn Access Token / không nên trigger refresh loop
const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/otp'];

// Cờ + subject dùng để gộp nhiều request 401 đồng thời thành 1 lần gọi refresh duy nhất
let isRefreshing = false;
const refreshedToken$ = new BehaviorSubject<string | null>(null);

/**
 * SRS-AUTH-02 / NFR-SEC-02
 * 1. Gắn `withCredentials: true` cho MỌI request nội bộ để browser tự động
 *    kèm HttpOnly Cookie chứa Refresh Token (JS không đọc được cookie này).
 * 2. Gắn "Authorization: Bearer <accessToken>" (access token in-memory) cho
 *    các request cần xác thực.
 * 3. Khi API trả 401 (access token hết hạn sau 15'), tự động gọi /auth/refresh,
 *    lấy access token mới rồi PHÁT LẠI (retry) chính xác request vừa thất bại.
 * 4. Nếu nhiều request cùng 401 một lúc, chỉ gọi refresh 1 lần (tránh refresh-storm),
 *    các request khác "xếp hàng" chờ token mới rồi tự chạy tiếp.
 * 5. Nếu refresh cũng thất bại -> clear session và NÉM LẠI lỗi để error.interceptor
 *    lo phần điều hướng /login + thông báo cho người dùng (tách trách nhiệm:
 *    auth.interceptor chỉ lo "xác thực", error.interceptor lo "phản hồi UI chung").
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(TokenStoreService);
  const authService = inject(AuthService);

  const isPublic = PUBLIC_ENDPOINTS.some((path) => req.url.includes(path));
  const withCreds = req.clone({ withCredentials: true });
  const authReq = isPublic ? withCreds : attachToken(withCreds, tokenStore.accessToken());

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isPublic) {
        return handle401(authReq, next, authService, tokenStore);
      }
      return throwError(() => error);
    })
  );
};

function attachToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  if (!token) return req;
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  tokenStore: TokenStoreService
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshedToken$.next(null);

    return authService.refreshToken().pipe(
      switchMap(({ accessToken }) => {
        isRefreshing = false;
        refreshedToken$.next(accessToken);
        return next(attachToken(req, accessToken));
      }),
      catchError((refreshError) => {
        isRefreshing = false;
        tokenStore.clear();
        // KHÔNG tự redirect ở đây — ném lỗi lên để error.interceptor xử lý
        // thống nhất (tránh 2 nơi cùng điều hướng, dễ gây race điều hướng kép).
        return throwError(() => refreshError);
      })
    );
  }

  // Một request khác đang refresh rồi -> chờ token mới thay vì gọi refresh lần nữa
  return refreshedToken$.pipe(
    filter((token): token is string => token !== null),
    take(1),
    switchMap((token) => next(attachToken(req, token)))
  );
}