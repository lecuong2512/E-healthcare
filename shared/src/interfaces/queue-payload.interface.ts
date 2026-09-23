export interface EmailBookingConfirmationPayload {
  to: string;
  patientName: string;
  appointmentCode: string;
  doctorName: string;
  specialtyName?: string;
  date: string;
  time: string;
  roomNumber?: string;
  totalAmount?: number;
  reasonForVisit?: string;
}

export interface EmailAccountActivationPayload {
  to: string;
  fullName: string;
  activationToken?: string;
  activationLink?: string;
  otp?: string;
}

export interface EmailAppointmentReminder24hPayload {
  to: string;
  patientName: string;
  appointmentCode: string;
  doctorName: string;
  date: string;
  time: string;
  roomNumber?: string;
  notes?: string;
}

export interface EmailAppointmentCancellationPayload {
  to: string;
  patientName: string;
  appointmentCode: string;
  voucherCode: string;
  refundPercent: number;
  refundAmount: number;
}

export type EmailJobData =
  | { type: 'BOOKING_CONFIRMATION'; data: EmailBookingConfirmationPayload }
  | { type: 'ACCOUNT_ACTIVATION'; data: EmailAccountActivationPayload }
  | { type: 'REMINDER_24H'; data: EmailAppointmentReminder24hPayload }
  | { type: 'APPOINTMENT_CANCELLATION'; data: EmailAppointmentCancellationPayload };

export interface SmsOtpPayload {
  phoneNumber: string;
  otp: string;
}

export interface SmsAppointmentReminder2hPayload {
  phoneNumber: string;
  patientName: string;
  appointmentCode: string;
  doctorName: string;
  time: string;
  roomNumber?: string;
}

export interface SmsAppointmentCancellationPayload {
  phoneNumber: string;
  patientName: string;
  appointmentCode: string;
  voucherCode: string;
  refundPercent: number;
  refundAmount: number;
}

export type SmsJobData =
  | { type: 'OTP'; data: SmsOtpPayload }
  | { type: 'REMINDER_2H'; data: SmsAppointmentReminder2hPayload }
  | { type: 'APPOINTMENT_CANCELLATION'; data: SmsAppointmentCancellationPayload };

export interface PrescriptionMedicineItem {
  medicineName: string;
  activeIngredient?: string;
  unit?: string;
  quantity: number;
  dosageMorning?: number;
  dosageNoon?: number;
  dosageAfternoon?: number;
  dosageNight?: number;
  usageInstruction: string;
}

export interface PrescriptionPdfPayload {
  prescriptionCode: string;
  appointmentCode: string;
  patientName: string;
  patientGender?: string;
  patientDob?: string;
  patientPhone?: string;
  doctorName: string;
  doctorLicense?: string;
  diagnosis: string;
  icd10Code: string;
  medicines: PrescriptionMedicineItem[];
  doctorAdvice?: string;
  createdAt: string;
  verificationHash?: string;
}

export interface MedicalRecordPdfPayload {
  recordCode: string;
  appointmentCode: string;
  patientName: string;
  patientGender?: string;
  patientDob?: string;
  doctorName: string;
  diagnosis: string;
  icd10Code: string;
  symptoms?: string;
  clinicalNotes?: string;
  vitalSigns?: {
    heightCm?: number;
    weightKg?: number;
    bmi?: number;
    bloodPressure?: string;
    heartRateBpm?: number;
    temperatureC?: number;
    spo2Percent?: number;
  };
  createdAt: string;
}

export type PdfJobData =
  | { type: 'PRESCRIPTION'; data: PrescriptionPdfPayload }
  | { type: 'MEDICAL_RECORD'; data: MedicalRecordPdfPayload };
