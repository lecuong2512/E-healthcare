import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { Role } from '@shared/enums';

// Lazy-load từng phân hệ theo mã SRS (4.1 - 4.5) để giảm bundle ban đầu.
// FIX (review 2026-09): Role enum từ @shared/enums để không lệch với giá trị thật
// server trả về (và có auto-complete/type-check khi gõ sai).
export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // Phân hệ Bệnh nhân (SRS-PAT-01..05)
  {
    path: 'patient',
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.PATIENT] },
    loadChildren: () => import('./features/patient/patient.routes').then((m) => m.PATIENT_ROUTES),
  },

  // Phân hệ Bác sĩ (SRS-DOC-01..04)
  {
    path: 'doctor',
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.DOCTOR] },
    loadChildren: () => import('./features/doctor/doctor.routes').then((m) => m.DOCTOR_ROUTES),
  },

  // Phân hệ Lễ tân (SRS-REC-01..02)
  {
    path: 'receptionist',
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.RECEPTIONIST] },
    loadChildren: () =>
      import('./features/receptionist/receptionist.routes').then((m) => m.RECEPTIONIST_ROUTES),
  },

  // Phân hệ Admin (SRS-ADM-01..04)
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { roles: [Role.ADMIN] },
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },

  {
    path: '403',
    loadComponent: () => import('./shared/pages/forbidden.page').then((m) => m.ForbiddenPage),
  },
  {
    path: '**',
    loadComponent: () => import('./shared/pages/not-found.page').then((m) => m.NotFoundPage),
  },
];
