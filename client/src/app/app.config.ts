import { APP_INITIALIZER, ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AuthService } from './core/services/auth.service';

// Gọi /auth/refresh 1 lần khi app khởi động để phục hồi phiên đăng nhập
// từ HttpOnly cookie (access token chỉ sống trong bộ nhớ nên mất khi F5).
function initializeSession(authService: AuthService) {
  return () => firstValueFrom(authService.bootstrapSession());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    // Thứ tự QUAN TRỌNG: errorInterceptor đứng trước để bọc ngoài cùng,
    // nhận được lỗi 401 "cuối cùng" mà authInterceptor ném lại sau khi
    // refresh thất bại, cũng như bắt mọi lỗi 409/5xx khác.
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeSession,
      deps: [AuthService],
      multi: true,
    },
  ],
};
