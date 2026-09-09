import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TokenStoreService } from '../../../../core/services/token-store.service';
import { environment } from '../../../../../environments/environment';

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
  protected readonly isProd = environment.production;

  identifier = '';
  password = '';
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  private readonly roleHome: Record<string, string> = {
    ROLE_PATIENT: '/patient',
    ROLE_DOCTOR: '/doctor',
    ROLE_RECEPTIONIST: '/receptionist',
    ROLE_ADMIN: '/admin',
  };

  submit(): void {
    this.errorMessage.set(null);
    this.loading.set(true);

    this.authService.login(this.identifier, this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.router.navigateByUrl(this.roleHome[res.role] ?? '/');
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Sai thông tin đăng nhập. Vui lòng thử lại.');
      },
    });
  }

}
