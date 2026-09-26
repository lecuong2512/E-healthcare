import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { NotificationService } from '../services/notification.service';
import { PUBLIC_ENDPOINTS } from './public-endpoints.const';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const notify = inject(NotificationService);

  const isPublic = isPublicEndpoint(req.url);
  const isReception = isReceptionEndpoint(req.url);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      // Public endpoint không được xử lý 401
      // như lỗi "session expired".
      if (error.status === 401 && isPublic) {
        return throwError(() => error);
      }

      // Reception facade maps its typed business errors (candidate selection,
      // slot conflict, expired QR, payment/check-in rules) into page state.
      // Keep 401 centralized, but avoid duplicate or misleading global toasts.
      if (isReception && error.status !== 401) {
        return throwError(() => error);
      }

      switch (error.status) {
        case 401:
          notify.error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');

          router.navigate(['/login']);
          break;

        case 409:
          notify.warning(
            error.error?.message ??
              'Khung giờ này vừa được người khác giữ chỗ. Vui lòng chọn khung giờ khác.',
          );
          break;

        case 0:
          notify.error(
            'Không thể kết nối máy chủ. Kiểm tra lại đường truyền mạng.',
          );
          break;

        default:
          if (error.status >= 500) {
            notify.error('Hệ thống đang gặp sự cố, vui lòng thử lại sau.');
          }
      }

      return throwError(() => error);
    }),
  );
};

function isPublicEndpoint(url: string): boolean {
  return PUBLIC_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

function isReceptionEndpoint(url: string): boolean {
  return url.includes('/reception/');
}
