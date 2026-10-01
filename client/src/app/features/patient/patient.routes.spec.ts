import { PATIENT_ROUTES } from './patient.routes';
import { PaymentResultPage } from './pages/payment-result/payment-result.page';
import { PaymentCallbackPage } from './pages/payment-callback/payment-callback.page';

describe('patient payment routing', () => {
  it('loads the backend-authoritative result page for payment-result', async () => {
    expect(await PATIENT_ROUTES.find(route => route.path === 'payment-result')!.loadComponent!()).toBe(PaymentResultPage);
  });
  it('keeps gateway callback handling on its dedicated route', async () => {
    expect(await PATIENT_ROUTES.find(route => route.path === 'booking/payment-callback')!.loadComponent!()).toBe(PaymentCallbackPage);
  });
});
