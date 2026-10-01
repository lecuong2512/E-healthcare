import { Routes } from '@angular/router';

export const PATIENT_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'doctor-search',
    pathMatch: 'full',
  },
  {
    path: 'doctor-search',
    loadComponent: () => import('./pages/doctor-search/doctor-search.page').then((m) => m.DoctorSearchPage),
  },
  {
    path: 'booking',
    loadComponent: () =>
      import('./pages/booking-stepper/booking-stepper.page').then((m) => m.BookingStepperPage),
  },
  {
    path: 'history',
    loadComponent: () =>
      import('./pages/medical-history/medical-history.page').then((m) => m.MedicalHistoryPage),
  },
  {
    path: 'payment-result',
    loadComponent: () =>
      import('./pages/payment-result/payment-result.page').then((m) => m.PaymentResultPage),
  },
  {
    path: 'booking/payment-callback',
    loadComponent: () =>
      import('./pages/payment-callback/payment-callback.page').then((m) => m.PaymentCallbackPage),
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/phr-profile/phr-profile.page').then((m) => m.PhrProfilePage),
  },
];
