import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { PaymentCallbackPage } from './payment-callback.page';

describe('PaymentCallbackPage', () => {
  let fixture!: ComponentFixture<PaymentCallbackPage>;
  let router: jasmine.SpyObj<Router>;

  async function createPage(params: Record<string, string>): Promise<void> {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    await TestBed.configureTestingModule({
      imports: [PaymentCallbackPage],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(params)) } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PaymentCallbackPage);
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  it('fails closed for a VNPAY success code when verification API is unavailable', async () => {
    await createPage({ vnp_ResponseCode: '00', vnp_TxnRef: 'txn-1', vnp_SecureHash: 'signature' });

    expect(fixture.componentInstance.provider()).toBe('VNPAY');
    expect(fixture.componentInstance.state()).toBe('verification-unavailable');
    expect(fixture.nativeElement.textContent).toContain('chưa có API Backend');
    expect(fixture.nativeElement.textContent).not.toContain('Thanh toán & Đặt khám thành công!');
  });

  it('fails closed for a MoMo success code when verification API is unavailable', async () => {
    await createPage({ resultCode: '0', orderId: 'order-1' });

    expect(fixture.componentInstance.provider()).toBe('MOMO');
    expect(fixture.componentInstance.state()).toBe('verification-unavailable');
    expect(fixture.nativeElement.textContent).toContain('chưa có API Backend');
  });

  it('shows an invalid callback state when required provider parameters are missing', async () => {
    await createPage({ vnp_ResponseCode: '00', vnp_TxnRef: 'txn-1' });

    expect(fixture.componentInstance.state()).toBe('invalid');
    expect(fixture.nativeElement.textContent).toContain('Callback thiếu tham số bắt buộc');
  });

  it('provides patient history and home navigation', async () => {
    await createPage({});

    fixture.componentInstance.goToHistory();
    fixture.componentInstance.goHome();

    expect(router.navigate).toHaveBeenCalledWith(['/patient/history']);
    expect(router.navigate).toHaveBeenCalledWith(['/patient/doctor-search']);
  });
});