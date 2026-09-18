// import { Component, inject, signal } from '@angular/core';
// import { FormsModule } from '@angular/forms';
// import { ActivatedRoute, Router, RouterLink } from '@angular/router';
// import { AuthService } from '../../../../core/services/auth.service';
// import { ButtonComponent } from '../../../../shared/components/button/button.component';
// import { TokenStoreService } from '../../../../core/services/token-store.service';
// import { environment } from '../../../../../environments/environment';
// import { HttpErrorResponse } from '@angular/common/http';
// import { Role } from '@shared/enums/role.enum';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

export type UserRole = 'patient' | 'doctor' | 'receptionist' | 'admin';


@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss'
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly showPass = signal(false);
  readonly loading = signal(false);

  readonly loginForm = this.fb.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });


  toggleShowPass(): void {
    this.showPass.update(v => !v);
  }

  onSubmit(): void {
    if (this.loginForm.invalid || this.loading()) return;

    this.loading.set(true);
    const { email, password } = this.loginForm.value;

    // // Giả lập authenticate & redirect phân hệ bệnh nhân
    // setTimeout(() => {
    //   this.loading.set(false);
    //   this.navigateTo('patient');
    // }, 1000);
  }

  navigateTo(role: UserRole | 'register' | 'forgot-password'): void {
    this.router.navigate([`/${role}`]);
  }
}