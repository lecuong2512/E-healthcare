import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

export type RegisterRole = 'patient' | 'doctor';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss'
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly step = signal<number>(1);
  readonly role = signal<RegisterRole | ''>('');
  readonly loading = signal<boolean>(false);

  readonly steps = ['Chọn vai trò', 'Thông tin cá nhân', 'Xác minh'];

  readonly profileForm = this.fb.group({
    fullName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  selectRole(selectedRole: RegisterRole): void {
    this.role.set(selectedRole);
    this.step.set(2);
  }

  nextStep(): void {
    if (this.step() === 2 && this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    if (this.step() < 3) {
      this.step.update(s => s + 1);
    }
  }

  prevStep(): void {
    if (this.step() > 1) {
      this.step.update(s => s - 1);
    }
  }

  submitRegistration(): void {
    if (this.profileForm.invalid || this.loading()) return;

    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
      this.navigateTo('login');
    }, 1200);
  }

  navigateTo(path: string): void {
    this.router.navigate([`/${path}`]);
  }
}