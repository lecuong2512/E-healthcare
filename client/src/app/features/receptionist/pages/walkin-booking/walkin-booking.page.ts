import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Gender } from '@shared/enums';
import { CurrencyVndPipe } from '../../../../shared/pipes/currency-vnd.pipe';
import {
  WalkInBookingIntent,
  WalkInDoctorSearchIntent,
  WalkInDoctorViewModel,
  WalkInPatientCandidateViewModel,
  WalkInSuccessViewModel,
} from '../../models/reception-presentation.models';

@Component({
  selector: 'app-walkin-booking-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CurrencyVndPipe],
  templateUrl: './walkin-booking.page.html',
  styleUrl: './walkin-booking.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalkinBookingPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly doctorsState = signal<readonly WalkInDoctorViewModel[]>([]);

  @Input()
  set doctors(value: readonly WalkInDoctorViewModel[]) {
    this.doctorsState.set(value);
  }

  get doctors(): readonly WalkInDoctorViewModel[] {
    return this.doctorsState();
  }

  @Input() candidates: readonly WalkInPatientCandidateViewModel[] = [];
  @Input() success: WalkInSuccessViewModel | null = null;
  @Input() loadingDoctors = false;
  @Input() submitting = false;
  @Input() errorMessage: string | null = null;

  @Output() doctorSearchRequested =
    new EventEmitter<WalkInDoctorSearchIntent>();
  @Output() bookingRequested = new EventEmitter<WalkInBookingIntent>();
  @Output() resetRequested = new EventEmitter<void>();

  readonly searchForm = this.formBuilder.group({
    specialtyName: '',
    doctorName: '',
  });

  readonly bookingForm = this.formBuilder.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    phone: [
      '',
      [Validators.required, Validators.pattern(/^(0|\+84)\d{9}$/)],
    ],
    citizenId: ['', [Validators.maxLength(20)]],
    birthYear: [
      new Date().getFullYear(),
      [Validators.required, Validators.min(1900)],
    ],
    gender: Gender.OTHER,
    reasonForVisit: [
      '',
      [Validators.required, Validators.maxLength(500)],
    ],
    doctorId: ['', Validators.required],
    scheduleId: ['', Validators.required],
    amountTendered: [0, [Validators.required, Validators.min(0)]],
  });

  readonly selectedDoctorId = signal('');
  readonly selectedScheduleId = signal('');
  readonly selectedPatientId = signal<string | null>(null);
  readonly currentYear = new Date().getFullYear();
  private readonly lastFingerprint = signal<string | null>(null);
  private readonly currentIdempotencyKey = signal<string | null>(null);
  private readonly lastIntent = signal<WalkInBookingIntent | null>(null);

  readonly selectedDoctor = computed(
    () =>
      this.doctorsState().find(
        (doctor) => doctor.doctorId === this.selectedDoctorId(),
      ) ?? null,
  );

  readonly selectedSlot = computed(
    () =>
      this.selectedDoctor()?.slots.find(
        (slot) => slot.scheduleId === this.selectedScheduleId(),
      ) ?? null,
  );

  readonly changeAmount = computed(() =>
    Math.max(
      0,
      this.bookingForm.controls.amountTendered.value -
        (this.selectedDoctor()?.consultationFee ?? 0),
    ),
  );

  protected readonly Gender = Gender;

  get specialtyOptions(): readonly string[] {
    return [
      ...new Set(this.doctors.map((doctor) => doctor.specialtyName)),
    ].sort((left, right) => left.localeCompare(right, 'vi'));
  }

  searchDoctors(): void {
    const filter = this.searchForm.getRawValue();
    this.doctorSearchRequested.emit({
      specialtyName: filter.specialtyName.trim(),
      doctorName: filter.doctorName.trim(),
    });
  }

  chooseDoctor(doctorId: string): void {
    this.selectedDoctorId.set(doctorId);
    this.selectedScheduleId.set('');
    this.bookingForm.patchValue({ doctorId, scheduleId: '' });
  }

  chooseSlot(scheduleId: string): void {
    this.selectedScheduleId.set(scheduleId);
    this.bookingForm.patchValue({ scheduleId });
  }

  submitBooking(): void {
    this.bookingForm.markAllAsTouched();
    const value = this.bookingForm.getRawValue();
    const fee = this.selectedDoctor()?.consultationFee ?? 0;

    if (
      this.bookingForm.invalid ||
      value.birthYear > this.currentYear ||
      value.amountTendered < fee ||
      this.submitting
    ) {
      return;
    }

    const intentWithoutKey = {
      scheduleId: value.scheduleId,
      fullName: value.fullName.trim(),
      phone: value.phone.replace(/\s/g, ''),
      citizenId: value.citizenId.trim(),
      birthYear: value.birthYear,
      gender: value.gender,
      reasonForVisit: value.reasonForVisit.trim(),
      amountTendered: value.amountTendered,
      ...(this.selectedPatientId()
        ? { patientId: this.selectedPatientId()! }
        : {}),
    };
    const fingerprint = JSON.stringify(intentWithoutKey);

    if (fingerprint !== this.lastFingerprint()) {
      this.lastFingerprint.set(fingerprint);
      this.currentIdempotencyKey.set(crypto.randomUUID());
    }

    const intent: WalkInBookingIntent = {
      idempotencyKey:
        this.currentIdempotencyKey() ?? crypto.randomUUID(),
      ...intentWithoutKey,
    };

    this.lastIntent.set(intent);
    this.bookingRequested.emit(intent);
  }

  selectCandidate(patientId: string): void {
    this.selectedPatientId.set(patientId);
    // Adding patientId changes the payload. Generate a new key to avoid
    // reusing one idempotency key with two different request bodies.
    this.lastFingerprint.set(null);
    this.submitBooking();
  }

  retryLastIntent(): void {
    const intent = this.lastIntent();
    if (intent && !this.submitting) {
      this.bookingRequested.emit(intent);
    }
  }

  updateAmountTendered(event: Event): void {
    const amount = Number((event.target as HTMLInputElement).value);
    this.bookingForm.controls.amountTendered.setValue(
      Number.isFinite(amount) ? Math.max(0, amount) : 0,
    );
  }

  startAnotherBooking(): void {
    this.bookingForm.reset({
      fullName: '',
      phone: '',
      citizenId: '',
      birthYear: this.currentYear,
      gender: Gender.OTHER,
      reasonForVisit: '',
      doctorId: '',
      scheduleId: '',
      amountTendered: 0,
    });
    this.selectedDoctorId.set('');
    this.selectedScheduleId.set('');
    this.selectedPatientId.set(null);
    this.lastFingerprint.set(null);
    this.currentIdempotencyKey.set(null);
    this.lastIntent.set(null);
    this.resetRequested.emit();
  }
}
