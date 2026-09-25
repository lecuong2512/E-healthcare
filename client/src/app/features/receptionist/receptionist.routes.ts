import { Routes } from '@angular/router';

export const RECEPTIONIST_ROUTES: Routes = [
  { path: '', redirectTo: 'checkin', pathMatch: 'full' },
  {
    path: 'checkin',
    loadComponent: () =>
      import('./pages/checkin-desk/checkin-desk.container').then(
        (m) => m.CheckinDeskContainer,
      ),
  },
  {
    path: 'walkin',
    loadComponent: () =>
      import('./pages/walkin-booking/walkin-booking.container').then(
        (m) => m.WalkinBookingContainer,
      ),
  },
  {
    path: 'queue-board',
    loadComponent: () => import('./pages/queue-board/queue-board.page').then((m) => m.QueueBoardPage),
  },
];
