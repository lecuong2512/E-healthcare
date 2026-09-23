export enum JobName {
  // Email Queue Jobs
  EMAIL_SEND_BOOKING_CONFIRMATION = 'send-booking-confirmation',
  EMAIL_SEND_ACCOUNT_ACTIVATION = 'send-account-activation',
  EMAIL_SEND_REMINDER_24H = 'send-appointment-reminder-24h',

  // SMS Queue Jobs
  SMS_SEND_OTP = 'send-otp',
  SMS_SEND_REMINDER_2H = 'send-appointment-reminder-2h',

  // PDF Queue Jobs
  PDF_GENERATE_PRESCRIPTION = 'generate-prescription-pdf',
  PDF_GENERATE_EMR = 'generate-emr-pdf',
}
