import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Gender } from '@shared/enums';
import { WalkInDoctorViewModel } from '../../models/reception-presentation.models';
import { WalkinBookingPage } from './walkin-booking.page';

const doctor: WalkInDoctorViewModel = {
  doctorId: 'doctor-1',
  doctorName: 'Trần Minh Bình',
  specialtyName: 'Tim mạch',
  roomNumber: 'P.201',
  consultationFee: 350_000,
  slots: [
    {
      scheduleId: 'schedule-1',
      startTime: '09:00',
      endTime: '09:30',
    },
  ],
};

describe('WalkinBookingPage', () => {
  let fixture: ComponentFixture<WalkinBookingPage>;
  let component: WalkinBookingPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalkinBookingPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(WalkinBookingPage);
    component = fixture.componentInstance;
    component.doctors = [doctor];
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  function fillValidForm(): void {
    component.chooseDoctor('doctor-1');
    component.chooseSlot('schedule-1');
    component.bookingForm.patchValue({
      fullName: 'Nguyễn Văn An',
      phone: '0912345678',
      citizenId: '',
      birthYear: 1990,
      gender: Gender.MALE,
      reasonForVisit: 'Đau ngực',
      amountTendered: 400_000,
    });
  }

  it('requires valid patient, doctor, slot and payment data', () => {
    const bookingSpy = jasmine.createSpy('booking');
    component.bookingRequested.subscribe(bookingSpy);

    component.submitBooking();

    expect(component.bookingForm.invalid).toBeTrue();
    expect(bookingSpy).not.toHaveBeenCalled();
  });

  it('emits the same idempotency key when retrying the same intent', () => {
    const intents: Array<{ idempotencyKey: string }> = [];
    component.bookingRequested.subscribe((intent) => intents.push(intent));
    fillValidForm();

    component.submitBooking();
    component.submitBooking();

    expect(intents.length).toBe(2);
    expect(intents[0].idempotencyKey).toBe(intents[1].idempotencyKey);
  });

  it('generates a new idempotency key when the payload changes', () => {
    const intents: Array<{ idempotencyKey: string }> = [];
    component.bookingRequested.subscribe((intent) => intents.push(intent));
    fillValidForm();

    component.submitBooking();
    component.bookingForm.patchValue({ reasonForVisit: 'Khó thở' });
    component.submitBooking();

    expect(intents[0].idempotencyKey).not.toBe(intents[1].idempotencyKey);
  });

  it('creates a new key when selecting a duplicate patient candidate', () => {
    const intents: Array<{
      idempotencyKey: string;
      patientId?: string;
    }> = [];
    component.bookingRequested.subscribe((intent) => intents.push(intent));
    fillValidForm();

    component.submitBooking();
    component.selectCandidate('patient-2');

    expect(intents[1].patientId).toBe('patient-2');
    expect(intents[1].idempotencyKey).not.toBe(intents[0].idempotencyKey);
  });

  it('calculates cash change from the selected doctor fee', () => {
    fillValidForm();

    expect(component.changeAmount()).toBe(50_000);
  });

  it('renders success result without displaying sensitive identity fields', () => {
    fixture.componentRef.setInput('success', {
      appointmentCode: 'APT-260922-0100',
      queueNumber: 25,
      patientName: 'Nguyễn Văn An',
      doctorName: 'Trần Minh Bình',
      roomNumber: 'P.201',
      receiptCode: 'RCT-0100',
    });
    fixture.detectChanges();

    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('Tiếp đón thành công');
    expect(content).toContain('25');
    expect(content).toContain('RCT-0100');
    expect(content).not.toContain('0912345678');
  });
});
