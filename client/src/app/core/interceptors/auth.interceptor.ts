import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  map,
  shareReplay,
  switchMap,
  throwError,
} from 'rxjs';

import { AuthService } from '../services/auth.service';
import { TokenStoreService } from '../services/token-store.service';
import { PUBLIC_ENDPOINTS } from './public-endpoints.const';

/**
 * [FIX-2026-09]
 *
 * Bản cũ dùng BehaviorSubject<string | null>.
 *
 * Khi refresh thất bại:
 *
 *   refresh()
 *      ↓
 *   catchError()
 *      ↓
 *   throwError()
 *
 * nhưng BehaviorSubject không emit error cho các request
 * đang filter(token !== null), khiến chúng có thể chờ vô hạn.
 *
 * Dùng Observable + shareReplay(1):
 *
 *   refresh success
 *       ↓
 *   tất cả subscriber nhận token mới
 *
 *   refresh failure
 *       ↓
 *   tất cả subscriber nhận error
 *
 * => Không còn request bị treo.
 */
let refreshInFlight$: Observable<string> | null = null;

/**
 * Authentication Interceptor.
 *
 * Responsibilities:
 *
 * 1. withCredentials = true
 *    -> Browser tự gửi HttpOnly Refresh Token Cookie.
 *
 * 2. Gắn Access Token:
 *
 *    Authorization: Bearer <accessToken>
 *
 *    -> Chỉ protected endpoint.
 *
 * 3. Protected request trả 401:
 *    -> Trigger refresh.
 *
 * 4. Concurrent 401:
 *    -> Chỉ một refresh request.
 *
 * 5. Refresh success:
 *    -> Update TokenStore.
 *    -> Retry request ban đầu.
 *
 * 6. Refresh failure:
 *    -> Clear session.
 *    -> Propagate error cho errorInterceptor.
 *
 * [SRS-AUTH-02]
 * [NFR-SEC-02]
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(TokenStoreService);
  const authService = inject(AuthService);

  /**
   * Kiểm tra endpoint có public hay không.
   */
  const isPublic = isPublicEndpoint(req.url);

  /**
   * [SECURITY]
   *
   * Refresh Token nằm trong HttpOnly Cookie.
   *
   * JavaScript không đọc cookie.
   * Browser tự gửi cookie khi withCredentials = true.
   */
  const requestWithCredentials = req.clone({
    withCredentials: true,
  });

  const authReq = isPublic
    ? requestWithCredentials
    : attachToken(requestWithCredentials, tokenStore.accessToken());

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isPublic
      ) {
        return handle401(authReq, next, authService, tokenStore);
      }

      return throwError(() => error);
    }),
  );
};

/**
 * Gắn Access Token vào request.
 */
function attachToken(
  req: HttpRequest<unknown>,
  token: string | null,
): HttpRequest<unknown> {
  if (!token) {
    return req;
  }

  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Xử lý 401 từ protected request.
 */
function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  tokenStore: TokenStoreService,
): Observable<HttpEvent<unknown>> {
  if (!refreshInFlight$) {
    refreshInFlight$ = authService.refreshToken().pipe(
      map((res) => {
        tokenStore.setSession(res.accessToken, res.role);

        return res.accessToken;
      }),

      catchError((refreshError: unknown) => {
        tokenStore.clear();

        return throwError(() => refreshError);
      }),

      finalize(() => {
        refreshInFlight$ = null;
      }),

      /**
       * [FIX-2026-09]
       *
       * Chia sẻ một refresh request cho tất cả subscriber.
       *
       * bufferSize: 1
       * -> giữ lại kết quả mới nhất.
       *
       * refCount: false
       * -> refresh operation không bị hủy ngoài ý muốn
       *    khi subscriber thay đổi.
       */
      shareReplay({
        bufferSize: 1,
        refCount: false,
      }),
    );
  }

  return refreshInFlight$.pipe(
    switchMap((accessToken) => {
      const retryReq = attachToken(req, accessToken);

      return next(retryReq);
    }),
  );
}

function isPublicEndpoint(url: string): boolean {
  return PUBLIC_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}
