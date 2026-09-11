import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.page').then((m) => m.AdminDashboardPage),
  },
  {
    path: 'catalogs',
    loadComponent: () => import('./pages/catalogs/catalogs.page').then((m) => m.CatalogsPage),
  },
  {
    path: 'staff',
    loadComponent: () => import('./pages/staff-mgmt/staff-mgmt.page').then((m) => m.StaffMgmtPage),
  },
  {
    path: 'audit-logs',
    loadComponent: () => import('./pages/audit-logs/audit-logs.page').then((m) => m.AuditLogsPage),
  },
];
