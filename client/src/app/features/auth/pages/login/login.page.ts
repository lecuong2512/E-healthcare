import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TokenStoreService } from '../../../../core/services/token-store.service';
import { environment } from '../../../../../environments/environment';
import { HttpErrorResponse } from '@angular/common/http';
import { Role } from '@shared/enums/role.enum';

/**
 * Trang login thật (không phải stub) vì đây là nơi tốt nhất để kiểm chứng
 * toàn bộ luồng của task Base Architecture: gọi AuthService -> nhận access
 * token -> TokenStoreService lưu in-memory -> điều hướng theo role -> mọi
 * request sau đó tự có Authorization header nhờ authInterceptor.
 */
@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, ButtonComponent, RouterLink],
  templateUrl: './login.page.html',
})
export class LoginPage {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly tokenStore = inject(TokenStoreService);
  private readonly route = inject(ActivatedRoute);
  protected readonly isProd = environment.production;

  showPassword = signal(false);
  identifier = '';
  password = '';
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  private readonly roleHome: Record<Role, string> = {
    [Role.PATIENT]: '/patient',
    [Role.DOCTOR]: '/doctor',
    [Role.RECEPTIONIST]: '/receptionist',
    [Role.ADMIN]: '/admin',
  };

  constructor() {
    if (this.route.snapshot.queryParamMap.get('google') === 'success') {
      const role = this.tokenStore.userRole() as Role | null;
      if (role && this.roleHome[role])
        void this.router.navigateByUrl(this.roleHome[role]);
      else
        this.errorMessage.set(
          'Không thể phục hồi phiên Google. Vui lòng thử lại trên HTTPS.',
        );
    }
  }

  submit(): void {
    this.errorMessage.set(null);
    this.loading.set(true);

    this.authService.login(this.identifier, this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.router.navigateByUrl(this.roleHome[res.role] ?? '/');
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);

        if (err.status === 429) {
          this.errorMessage.set(
            err.error?.code === 'LOGIN_LOCKED'
              ? `Tài khoản tạm khóa. Vui lòng chờ ${Math.ceil((err.error.retryAfter ?? 1800) / 60)} phút rồi thử lại.`
              : 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ 1 phút rồi thử lại.',
          );
        } else if (err.status === 401) {
          this.errorMessage.set('Tài khoản hoặc mật khẩu không chính xác.');
        } else {
          this.errorMessage.set('Có lỗi xảy ra, vui lòng thử lại sau.');
        }
      },
    });
  }
}
