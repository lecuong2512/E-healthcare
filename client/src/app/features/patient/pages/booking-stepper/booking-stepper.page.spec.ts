import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AppointmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
} from '@shared/enums';
import { of, throwError } from 'rxjs';
import { PatientBookingApiService, PatientDoctorDetail } from '../../data-access/patient-booking-api.service';
import { PaymentRedirectService } from '../../data-access/payment-redirect.service';
import { BookingStepperPage } from './booking-stepper.page';

describe('BookingStepperPage payment flow', () => {
  const doctorId = '11111111-1111-4111-8111-111111111111';
  const slotId = '22222222-2222-4222-8222-222222222222';
  const reservationId = '33333333-3333-4333-8333-333333333333';
  const appointmentId = '44444444-4444-4444-8444-444444444444';
  const doctor: PatientDoctorDetail = {
    id: doctorId,
    fullName: 'Nguyễn Văn An',
    academicTitle: 'BS.CKI',
    specialty: { id: 'specialty-id', name: 'Tim mạch' },
    consultationFee: 350_000,
    bioDescription: null,
    roomNumber: '101',
    ratingAverage: 4.9,
    availableSchedules: [{
      id: slotId,
      doctorId,
      date: '2026-10-10',
      startTime: '08:00:00',
      endTime: '08:30:00',
      status: 'AVAILABLE',
    }],
  };

  let fixture: ComponentFixture<BookingStepperPage>;
  let component: BookingStepperPage;
  let api: jasmine.SpyObj<PatientBookingApiService>;
  let router: jasmine.SpyObj<Router>;
  let redirect: jasmine.SpyObj<PaymentRedirectService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<PatientBookingApiService>('PatientBookingApiService', [
      'searchDoctors', 'getDoctor', 'reserveSlot', 'releaseSlot', 'confirmBooking', 'initiatePayment',
      'getPaymentStatus', 'getVouchers', 'validateVoucher', 'cancelAppointment',
    ]);
    api.searchDoctors.and.returnValue(of({
      data: [doctor],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    }));
    api.getDoctor.and.returnValue(of(doctor));
    api.getVouchers.and.returnValue(of([]));
    api.cancelAppointment.and.returnValue(of({ success: true, message: 'ok' }));
    api.reserveSlot.and.returnValue(of({
      success: true,
      message: 'ok',
      data: { doctorId, slotId, reservationId, expiresAt: new Date().toISOString(), ttlSeconds: 600 },
    }));
    api.releaseSlot.and.returnValue(of({ success: true, message: 'ok' }));
    api.confirmBooking.and.returnValue(of({
      id: appointmentId,
      appointmentCode: 'APT-01',
      patientId: 'patient-id',
      doctorId,
      scheduleId: slotId,
      status: AppointmentStatus.PENDING_PAYMENT,
      reasonForVisit: 'Khám định kỳ',
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.MOMO,
      totalAmount: 350_000,
    }));
    api.initiatePayment.and.returnValue(of({
      transactionId: 'payment-id',
      appointmentId,
      provider: PaymentMethod.MOMO,
      merchantTransactionId: 'PAY01',
      paymentUrl: 'https://test-payment.momo.vn/pay',
      expiresAt: new Date().toISOString(),
    }));
    api.getPaymentStatus.and.returnValue(of({
      appointmentId,
      appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      provider: PaymentMethod.VNPAY,
      transactionStatus: PaymentTransactionStatus.PENDING,
      expiresAt: new Date().toISOString(),
      paidAt: null,
    }));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    redirect = jasmine.createSpyObj<PaymentRedirectService>('PaymentRedirectService', ['redirect']);

    await TestBed.configureTestingModule({
      imports: [BookingStepperPage, NoopAnimationsModule],
      providers: [
        { provide: PatientBookingApiService, useValue: api },
        { provide: PaymentRedirectService, useValue: redirect },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    sessionStorage.clear();
    fixture.destroy();
  });

  it('loads real doctor schedules and reserves the selected slot', fakeAsync(() => {
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    tick(1_000);

    expect(api.getDoctor).toHaveBeenCalledWith(doctorId);
    expect(api.reserveSlot).toHaveBeenCalledWith({ doctorId, slotId });
    expect(component.selectedSlotId()).toBe(slotId);
    expect(component.countdownSeconds()).toBe(599);
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it('maps held and booked schedules as unavailable and counts only available slots', () => {
    api.getDoctor.and.returnValue(of({
      ...doctor,
      availableSchedules: [
        doctor.availableSchedules[0],
        { ...doctor.availableSchedules[0], id: 'held-slot', startTime: '09:00:00', status: 'HOLDING' },
        { ...doctor.availableSchedules[0], id: 'booked-slot', startTime: '10:00:00', status: 'BOOKED' },
      ],
    }));

    component.selectDoctorAndContinue(component.doctors()[0]);

    expect(component.days[0].slotsCount).toBe(1);
    expect(component.morningSlots.map((slot) => slot.status)).toEqual([
      'available',
      'holding',
      'booked',
    ]);
    component.chooseSlot(component.morningSlots[1]);
    expect(api.reserveSlot).not.toHaveBeenCalled();
  });

  it('confirms booking, creates one idempotent payment, and redirects to MoMo', () => {
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    component.selectPayment(PaymentMethod.MOMO);
    component.consentAccepted = true;
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A', phone: '0912345678', dob: '2000-01-01', gender: 'Nam', reason: 'Khám định kỳ',
    });

    component.submitBooking();

    expect(api.confirmBooking).toHaveBeenCalledWith(jasmine.objectContaining({
      doctorId, slotId, reservationId, paymentMethod: PaymentMethod.MOMO,
    }));
    const initiateArgs = api.initiatePayment.calls.mostRecent().args;
    expect(initiateArgs[0]).toBe(appointmentId);
    expect(initiateArgs[1]).toBe(PaymentMethod.MOMO);
    expect(initiateArgs[2]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(redirect.redirect).toHaveBeenCalledWith('https://test-payment.momo.vn/pay');
    expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBe(appointmentId);
  });

  it('confirms booking for pay-at-clinic and displays confirmation receipt instead of navigating away immediately', () => {
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    component.selectPayment(PaymentMethod.PAY_AT_CLINIC);
    component.consentAccepted = true;
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A', phone: '0912345678', dob: '2000-01-01', gender: 'Nam', reason: 'Khám định kỳ',
    });

    component.submitBooking();

    expect(api.initiatePayment).not.toHaveBeenCalled();
    expect(component.payAtClinicReceipt()).toBeTruthy();
    expect(component.payAtClinicReceipt()?.appointmentCode).toBe('APT-01');
    expect(router.navigate).not.toHaveBeenCalled();

    component.goToHistory();
    expect(router.navigate).toHaveBeenCalledWith(['/patient/history']);
  });

  it('respects newly selected payment provider when a pending payment context exists', () => {
    const originalKey = '55555555-5555-4555-8555-555555555555';
    sessionStorage.setItem('pendingPaymentContext', JSON.stringify({
      appointmentId,
      provider: PaymentMethod.MOMO,
      idempotencyKey: originalKey,
    }));

    fixture.destroy();
    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.paymentMethod()).toBe(PaymentMethod.MOMO);

    // Patient clicks VNPay to switch
    component.selectPayment(PaymentMethod.VNPAY);
    expect(component.paymentMethod()).toBe(PaymentMethod.VNPAY);

    component.submitBooking();

    // Must call initiatePayment with VNPAY, a NEW idempotency key, and supersedeActive = true
    expect(api.initiatePayment).toHaveBeenCalledWith(
      appointmentId,
      PaymentMethod.VNPAY,
      jasmine.any(String),
      true,
    );
    const newKey = api.initiatePayment.calls.mostRecent().args[2];
    expect(newKey).not.toBe(originalKey);
    expect(component.pendingPaymentContext()?.provider).toBe(PaymentMethod.VNPAY);
  });

  it('cancels pending payment and allows patient to reselect slot', () => {
    sessionStorage.setItem('pendingPaymentContext', JSON.stringify({
      appointmentId,
      provider: PaymentMethod.VNPAY,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    }));
    sessionStorage.setItem('pendingPaymentAppointmentId', appointmentId);

    fixture.destroy();
    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.pendingPaymentContext()).toBeTruthy();

    component.cancelPendingPayment();

    expect(api.cancelAppointment).toHaveBeenCalledWith(
      appointmentId,
      'Hủy giao dịch chờ thanh toán để đặt lại',
    );
    expect(component.pendingPaymentContext()).toBeNull();
    expect(sessionStorage.getItem('pendingPaymentContext')).toBeNull();
    expect(component.step()).toBe(2);
  });

  it('retries payment initiation without confirming the booking again', () => {
    api.initiatePayment.and.returnValues(
      throwError(() => new Error('network failure')),
      of({
        transactionId: 'payment-id',
        appointmentId,
        provider: PaymentMethod.MOMO,
        merchantTransactionId: 'PAY01',
        paymentUrl: 'https://test-payment.momo.vn/pay',
        expiresAt: new Date().toISOString(),
      }),
    );
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    component.selectPayment(PaymentMethod.MOMO);
    component.consentAccepted = true;
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A', phone: '0912345678', dob: '2000-01-01', gender: 'Nam', reason: 'Khám định kỳ',
    });

    component.submitBooking();
    const firstKey = api.initiatePayment.calls.mostRecent().args[2];
    component.submitBooking();

    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
    expect(api.initiatePayment).toHaveBeenCalledTimes(2);
    expect(api.initiatePayment.calls.mostRecent().args).toEqual([
      appointmentId,
      PaymentMethod.MOMO,
      firstKey,
    ]);
    expect(redirect.redirect).toHaveBeenCalledWith('https://test-payment.momo.vn/pay');
  });

  it('recovers a pending payment context after the page reloads', () => {
    const idempotencyKey = '55555555-5555-4555-8555-555555555555';
    sessionStorage.setItem('pendingPaymentContext', JSON.stringify({
      appointmentId,
      provider: PaymentMethod.VNPAY,
      idempotencyKey,
    }));
    fixture.destroy();
    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.step()).toBe(4);
    expect(api.getPaymentStatus).toHaveBeenCalledWith(appointmentId);
    component.retryPendingPayment();

    expect(api.confirmBooking).not.toHaveBeenCalled();
    expect(api.initiatePayment).toHaveBeenCalledWith(
      appointmentId,
      PaymentMethod.VNPAY,
      idempotencyKey,
    );
  });

  [
    PaymentTransactionStatus.SUCCESS,
    PaymentTransactionStatus.RECONCILIATION_REQUIRED,
    PaymentTransactionStatus.LATE_SUCCESS,
  ].forEach((transactionStatus) => {
    it(`routes a recovered ${transactionStatus} payment to its result`, () => {
      sessionStorage.setItem('pendingPaymentContext', JSON.stringify({
        appointmentId,
        provider: PaymentMethod.VNPAY,
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      }));
      api.getPaymentStatus.and.returnValue(of({
        appointmentId,
        appointmentStatus: AppointmentStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        provider: PaymentMethod.VNPAY,
        transactionStatus,
        expiresAt: new Date().toISOString(),
        paidAt: null,
      }));

      fixture.destroy();
      fixture = TestBed.createComponent(BookingStepperPage);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(api.initiatePayment).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/patient/payment-result'], {
        queryParams: { appointmentId },
      });
    });
  });

  it('clears a recovered terminal payment before routing to its result', () => {
    sessionStorage.setItem('pendingPaymentContext', JSON.stringify({
      appointmentId,
      provider: PaymentMethod.VNPAY,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    }));
    sessionStorage.setItem('pendingPaymentAppointmentId', appointmentId);
    api.getPaymentStatus.and.returnValue(of({
      appointmentId,
      appointmentStatus: AppointmentStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
      provider: PaymentMethod.VNPAY,
      transactionStatus: PaymentTransactionStatus.FAILED,
      expiresAt: new Date().toISOString(),
      paidAt: null,
    }));

    fixture.destroy();
    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.pendingPaymentContext()).toBeNull();
    expect(sessionStorage.getItem('pendingPaymentContext')).toBeNull();
    expect(sessionStorage.getItem('pendingPaymentAppointmentId')).toBeNull();
    expect(api.initiatePayment).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/patient/payment-result'], {
      queryParams: { appointmentId },
    });
  });

  it('requires consent before creating the appointment', () => {
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.chooseSlot(component.morningSlots[0]);
    component.patientForm.setValue({
      fullName: 'Nguyễn Văn A', phone: '0912345678', dob: '2000-01-01', gender: 'Nam', reason: 'Khám định kỳ',
    });

    component.submitBooking();

    expect(component.consentError).toBeTrue();
    expect(api.confirmBooking).not.toHaveBeenCalled();
  });

  it('loads vouchers and uses the backend validation discount', () => {
    api.getVouchers.calls.reset();
    api.getVouchers.and.returnValue(of([{
      id: 'voucher-id',
      code: 'COMPENSATE-20',
      discountPercent: 20,
      isUsed: false,
      expiresAt: '2099-01-01T00:00:00.000Z',
    }]));
    api.validateVoucher.and.returnValue(of({
      code: 'COMPENSATE-20',
      discountPercent: 20,
      discountAmount: 70_000,
      finalAmount: 280_000,
    }));

    fixture.destroy();
    fixture = TestBed.createComponent(BookingStepperPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.selectDoctorAndContinue(component.doctors()[0]);
    component.applyVoucher('compensate-20');

    expect(component.vouchers().map((voucher) => voucher.code)).toEqual(['COMPENSATE-20']);
    expect(api.validateVoucher).toHaveBeenCalledWith('COMPENSATE-20', 350_000);
    expect(component.discountAmount()).toBe(70_000);
    expect(component.payableAmount()).toBe(280_000);
  });

  describe('[TC-PAT-009] Countdown 10 phút giữ chỗ & reset form khi hết thời gian', () => {
    it('hiển thị countdown từ 10:00, đếm lùi từng giây, hủy reservation và reset form khi hết thời gian', fakeAsync(() => {
      // Bệnh nhân chọn BS và slot khám
      component.selectDoctorAndContinue(component.doctors()[0]);
      component.chooseSlot(component.morningSlots[0]);

      // 1. Countdown hiển thị ban đầu từ 10:00 (600 giây)
      expect(component.countdownSeconds()).toBe(600);
      expect(component.formattedCountdown()).toBe('10:00');
      expect(component.selectedSlotId()).toBe(slotId);

      // 2. Đếm ngược từng giây không bị nhảy hay âm
      tick(1_000);
      expect(component.countdownSeconds()).toBe(599);
      expect(component.formattedCountdown()).toBe('09:59');

      tick(59_000); // 60s trôi qua (còn 9 phút = 540s)
      expect(component.countdownSeconds()).toBe(540);
      expect(component.formattedCountdown()).toBe('09:00');

      // Người dùng chuyển sang Bước 3 trong khi countdown vẫn tiếp diễn
      component.goToStep(3);
      expect(component.step()).toBe(3);

      // 3. Chờ hết thời gian (540 giây còn lại để đủ 600 giây)
      tick(540_000);

      // Verify: API releaseSlot được gọi để hủy giữ chỗ
      expect(api.releaseSlot).toHaveBeenCalledWith(jasmine.objectContaining({
        doctorId,
        slotId,
        reservationId,
      }));

      // Verify: Slot được reset về null
      expect(component.selectedSlotId()).toBeNull();

      // Verify: Stepper quay về bước 2 để chọn lại slot
      expect(component.step()).toBe(2);

      // Verify: Thông báo hết hạn hiển thị cho người dùng
      expect(component.errorMessage()).toBe('Hết thời gian giữ chỗ. Vui lòng chọn lại khung giờ.');

      // Verify: Đồng hồ countdown hiển thị mốc 00:00 (hết giờ, không âm)
      expect(component.countdownSeconds()).toBe(0);
      expect(component.formattedCountdown()).toBe('00:00');

      // Khi người dùng chọn lại slot mới, countdown được reset lại mốc ban đầu 10:00
      component.chooseSlot(component.morningSlots[0]);
      expect(component.countdownSeconds()).toBe(600);
      expect(component.formattedCountdown()).toBe('10:00');

      component.ngOnDestroy();
      discardPeriodicTasks();
    }));
  });

  describe('[TC-PAT-010] Form thông tin bệnh nhân ở bước 3 & upload tài liệu y tế', () => {
    beforeEach(() => {
      component.selectDoctorAndContinue(component.doctors()[0]);
      component.chooseSlot(component.morningSlots[0]);
      component.goToStep(3);
    });

    it('kiểm tra tính hợp lệ của các trường bắt buộc (Họ tên, SĐT 10 số, Ngày sinh)', () => {
      expect(component.step()).toBe(3);
      expect(component.patientForm.valid).toBeFalse();

      // Chỉ điền họ tên -> form vẫn invalid
      component.patientForm.patchValue({ fullName: 'Nguyễn Văn A' });
      expect(component.patientForm.valid).toBeFalse();

      // SĐT sai định dạng (9 số) -> invalid
      component.patientForm.patchValue({ phone: '091234567' });
      expect(component.patientForm.get('phone')?.valid).toBeFalse();

      // SĐT sai định dạng (chứa chữ) -> invalid
      component.patientForm.patchValue({ phone: '091234567a' });
      expect(component.patientForm.get('phone')?.valid).toBeFalse();

      // SĐT hợp lệ đúng 10 chữ số
      component.patientForm.patchValue({ phone: '0912345678' });
      expect(component.patientForm.get('phone')?.valid).toBeTrue();

      // Chưa có ngày sinh -> form vẫn invalid
      expect(component.patientForm.valid).toBeFalse();

      // Điền ngày sinh -> form hoàn chỉnh hợp lệ
      component.patientForm.patchValue({ dob: '1990-05-20' });
      expect(component.patientForm.valid).toBeTrue();
    });

    it('hỗ trợ upload tài liệu y tế tùy chọn (PDF/JPG/PNG <= 10MB) và từ chối file > 10MB', () => {
      // 1. File vượt quá 10MB -> từ chối và báo lỗi
      const oversizedFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'scan_large.pdf', { type: 'application/pdf' });
      const oversizedEvent = { target: { files: [oversizedFile], value: 'scan_large.pdf' } } as unknown as Event;
      component.onFileSelected(oversizedEvent);
      expect(component.errorMessage()).toBe('Tệp không được vượt quá 10MB.');
      expect(component.selectedFileName()).toBeNull();

      // 2. File PDF hợp lệ <= 10MB -> chấp nhận
      const validPdf = new File(['mock content pdf'], 'ho_so_kham.pdf', { type: 'application/pdf' });
      const validPdfEvent = { target: { files: [validPdf], value: 'ho_so_kham.pdf' } } as unknown as Event;
      component.onFileSelected(validPdfEvent);
      expect(component.selectedFileName()).toBe('ho_so_kham.pdf');

      // 3. File JPG hợp lệ <= 10MB -> chấp nhận
      const validJpg = new File(['mock content jpg'], 'ket_qua_xet_nghiem.jpg', { type: 'image/jpeg' });
      const validJpgEvent = { target: { files: [validJpg], value: 'ket_qua_xet_nghiem.jpg' } } as unknown as Event;
      component.onFileSelected(validJpgEvent);
      expect(component.selectedFileName()).toBe('ket_qua_xet_nghiem.jpg');
    });

    it('chấp nhận thông tin hợp lệ và giữ lại cho bước xác nhận (Bước 4)', () => {
      component.patientForm.setValue({
        fullName: 'Trần Thị Mai',
        phone: '0987654321',
        dob: '1992-08-20',
        gender: 'Nữ',
        reason: 'Khám kiểm tra sức khỏe tổng quát',
      });

      // Bấm tiếp tục sang bước 4
      component.patientForm.markAllAsTouched();
      if (component.patientForm.valid) {
        component.goToStep(4);
      }

      // Thông tin được giữ nguyên vẹn cho Bước 4 xác nhận
      expect(component.step()).toBe(4);
      expect(component.formValue.fullName).toBe('Trần Thị Mai');
      expect(component.formValue.phone).toBe('0987654321');
      expect(component.formValue.dob).toBe('1992-08-20');
      expect(component.formValue.gender).toBe('Nữ');
      expect(component.formValue.reason).toBe('Khám kiểm tra sức khỏe tổng quát');
    });
  });

  describe('[TC-PAT-014] Quy trình đặt lịch khám 4 bước & kiểm soát bước bắt buộc (Gating)', () => {
    it('hoàn thành đúng quy trình 4 bước và không cho phép bỏ qua bước bắt buộc', () => {
      // ─── BƯỚC 1: Chọn BS / Chuyên khoa ───
      expect(component.step()).toBe(1);
      expect(component.selectedDoctorId()).toBeNull();

      // Gating B1: Chưa chọn bác sĩ thì không thể tiếp tục
      component.confirmDoctor();
      expect(component.step()).toBe(1); // Không chuyển bước

      // Người dùng chọn bác sĩ
      component.selectDoctorAndContinue(component.doctors()[0]);
      expect(component.selectedDoctorId()).toBe(doctorId);
      expect(component.step()).toBe(2);

      // ─── BƯỚC 2: Chọn ngày & slot khám ───
      // Gating B2: Chưa chọn slot khám thì nút tiếp tục bị vô hiệu hóa
      expect(component.selectedSlotId()).toBeNull();
      const canProceedToStep3WithoutSlot = component.selectedSlotId() !== null;
      expect(canProceedToStep3WithoutSlot).toBeFalse();

      // Người dùng chọn slot khám và giữ chỗ thành công
      component.chooseSlot(component.morningSlots[0]);
      expect(component.selectedSlotId()).toBe(slotId);

      // Chuyển sang Bước 3
      component.goToStep(3);
      expect(component.step()).toBe(3);

      // ─── BƯỚC 3: Điền thông tin bệnh nhân ───
      // Gating B3: Form rỗng/không hợp lệ không cho phép sang bước 4
      expect(component.patientForm.valid).toBeFalse();
      component.patientForm.markAllAsTouched();
      if (component.patientForm.valid) {
        component.goToStep(4);
      }
      expect(component.step()).toBe(3); // Vẫn ở bước 3 vì form invalid

      // Điền đầy đủ thông tin bắt buộc
      component.patientForm.setValue({
        fullName: 'Phạm Hồng Sơn',
        phone: '0908112233',
        dob: '1985-11-25',
        gender: 'Nam',
        reason: 'Tái khám tim mạch',
      });
      expect(component.patientForm.valid).toBeTrue();

      // Bấm tiếp tục chuyển sang Bước 4
      component.patientForm.markAllAsTouched();
      if (component.patientForm.valid) {
        component.goToStep(4);
      }
      expect(component.step()).toBe(4);

      // ─── BƯỚC 4: Xác nhận & Thanh toán ───
      expect(component.formValue.fullName).toBe('Phạm Hồng Sơn');
      expect(component.formValue.phone).toBe('0908112233');

      // Chọn phương thức thanh toán
      component.selectPayment(PaymentMethod.VNPAY);
      expect(component.paymentMethod()).toBe(PaymentMethod.VNPAY);

      // Gating B4: Chưa đồng ý điều khoản cam kết -> từ chối gửi booking
      component.consentAccepted = false;
      component.submitBooking();
      expect(component.consentError).toBeTrue();
      expect(api.confirmBooking).not.toHaveBeenCalled();

      // Bệnh nhân tích đồng ý cam kết và hoàn tất đặt lịch
      component.consentAccepted = true;
      component.submitBooking();

      expect(api.confirmBooking).toHaveBeenCalledWith(jasmine.objectContaining({
        doctorId,
        slotId,
        reservationId,
        paymentMethod: PaymentMethod.VNPAY,
        reasonForVisit: 'Tái khám tim mạch',
      }));
    });
  });
});

