import { Routes } from '@angular/router';

export const DOCTOR_ROUTES: Routes = [
  { path: '', redirectTo: 'queue', pathMatch: 'full' },
  {
    path: 'schedule',
    loadComponent: () =>
      import('./pages/schedule-config/schedule-config.page').then((m) => m.ScheduleConfigPage),
  },
  {
    path: 'queue',
    loadComponent: () => import('./pages/patient-queue/patient-queue.page').then((m) => m.PatientQueuePage),
  },
  {
    path: 'consultation/:appointmentId',
    loadComponent: () => import('./pages/consultation/consultation.page').then((m) => m.ConsultationPage),
  },
];
