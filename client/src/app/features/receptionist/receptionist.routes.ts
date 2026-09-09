import { Routes } from '@angular/router';

export const RECEPTIONIST_ROUTES: Routes = [
  { path: '', redirectTo: 'checkin', pathMatch: 'full' },
  {
    path: 'checkin',
    loadComponent: () => import('./pages/checkin-desk/checkin-desk.page').then((m) => m.CheckinDeskPage),
  },
  {
    path: 'walkin',
    loadComponent: () =>
      import('./pages/walkin-booking/walkin-booking.page').then((m) => m.WalkinBookingPage),
  },
  {
    path: 'queue-board',
    loadComponent: () => import('./pages/queue-board/queue-board.page').then((m) => m.QueueBoardPage),
  },
];
