import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { BookingStepperPage } from './booking-stepper.page';

describe('BookingStepperPage', () => {
  let fixture: ComponentFixture<BookingStepperPage>;
  let component: BookingStepperPage;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [BookingStepperPage],
      providers: [
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not start the reservation timer before a slot is selected', () => {
    expect(component.countdownSeconds()).toBe(600);
    expect(component.step()).toBe(1);
  });

  it('selects a doctor and moves directly to the schedule step', () => {
    component.selectDoctorAndContinue(component.doctors[0]);

    expect(component.selectedDoctorId()).toBe(component.doctors[0].id);
    expect(component.step()).toBe(2);
  });

  it('starts the local timer after selecting an available slot', fakeAsync(() => {
    component.selectedDoctorId.set(component.doctors[0].id);
    component.chooseSlot({ id: 'slot-1', time: '08:00', status: 'available' });

    tick(1000);
    expect(component.selectedSlotId()).toBe('slot-1');
    expect(component.countdownSeconds()).toBe(599);
    fixture.destroy();
  }));

  it('redirects to the payment QR page based on selected method', () => {
    component.selectedDoctorId.set(component.doctors[0].id);
    component.selectedSlotId.set('m1');
    component.selectPayment('momo');
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A',
      phone: '0912345678',
      dob: '2000-01-01',
      gender: 'Nam',
      reason: 'Khám định kỳ',
    });

    component.submitBooking();

    expect(router.navigate).toHaveBeenCalledWith(['/patient/payment-qr', 'momo']);
  });

  it('applies a voucher and recalculates the payable amount', () => {
    component.selectedDoctorId.set(component.doctors[0].id);

    component.selectVoucher('WELCOME50');

    expect(component.appliedVoucher()?.code).toBe('WELCOME50');
    expect(component.discountAmount()).toBe(50000);
    expect(component.payableAmount()).toBe(300000);
  });

  it('rejects an unknown voucher', () => {
    component.selectVoucher('UNKNOWN');

    expect(component.appliedVoucher()).toBeNull();
    expect(component.voucherMessage()).toContain('không hợp lệ');
  });

  it('rejects oversized upload files', () => {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [{ name: 'large.pdf', size: 11 * 1024 * 1024 }],
    });

    component.onFileSelected({ target: input } as unknown as Event);

    expect(component.selectedFileName()).toBeNull();
    expect(component.errorMessage()).toContain('10MB');
  });
});
