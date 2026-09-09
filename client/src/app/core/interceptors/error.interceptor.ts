import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';

/**
 * Bắt lỗi toàn cục, đặt SAU authInterceptor trong mảng interceptor (xem
 * app.config.ts) để nhận được lỗi 401 "thật sự" (đã thử refresh nhưng vẫn fail)
 * thay vì bắt nhầm lỗi 401 tạm thời đang được authInterceptor tự retry.
 *
 * - 401: refresh token cũng đã hết hạn/thu hồi -> điều hướng /login.
 * - 409: xung đột giữ chỗ khám (Redis lock slot:{id} đã bị người khác chiếm —
 *   Mục 5.1) hoặc version mismatch (optimistic locking DOCTOR_SCHEDULES.version)
 *   -> báo người dùng chọn slot khác, KHÔNG tự retry im lặng vì dễ đặt nhầm giờ.
 * - 5xx: lỗi hệ thống -> thông báo chung, không lộ chi tiết kỹ thuật cho UI.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        switch (error.status) {
          case 401:
            notify.error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
            router.navigate(['/login']);
            break;
          case 409:
            notify.warning(
              error.error?.message ?? 'Khung giờ này vừa được người khác giữ chỗ. Vui lòng chọn khung giờ khác.'
            );
            break;
          case 0:
            notify.error('Không thể kết nối máy chủ. Kiểm tra lại đường truyền mạng.');
            break;
          default:
            if (error.status >= 500) {
              notify.error('Hệ thống đang gặp sự cố, vui lòng thử lại sau.');
            }
        }
      }
      return throwError(() => error);
    })
  );
};
