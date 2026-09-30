import { PaymentRedirectService } from './payment-redirect.service';

describe('PaymentRedirectService', () => {
  it('rejects non-HTTPS and untrusted payment hosts', () => {
    const service = new PaymentRedirectService();
    expect(() => service.redirect('http://test-payment.momo.vn/pay')).toThrow();
    expect(() => service.redirect('https://evil.example/pay')).toThrow();
  });
});
