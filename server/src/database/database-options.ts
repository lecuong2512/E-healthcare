import { DataSource } from "typeorm";
import { AddSrsAuth03PhrFields1789560000000 } from "./migrations/1789560000000-add-srs-auth03-phr-fields";
import { CreateCatalogAndRbacTables1788834118637 } from "./migrations/1788834118637-create-catalog-and-rbac-tables";
import { CreateDoctorSchedulesTable1788849768948 } from "./migrations/1788849768948-create-doctor-schedules-table";
import { CreateAppointmentsTable1788851428977 } from "./migrations/1788851428977-create-appointments-table";
import { CreateRegistrationAndPhr1789477200000 } from "./migrations/1789477200000-create-registration-and-phr";
import { CreateRegistrationOtpSendLimit1789477800000 } from "./migrations/1789477800000-create-registration-otp-send-limit";
import { CreateAuthSessionsAndGoogle1789478400000 } from "./migrations/1789478400000-create-auth-sessions-and-google";
import { AllowRegistrationWithBothContacts1789479000000 } from "./migrations/1789479000000-allow-registration-with-both-contacts";
import { AddDoctorScheduleAndSearchIndexes1789565400000 } from "./migrations/1789565400000-add-doctor-schedule-and-search-indexes";
import { EnableUnaccentDoctorSearch1789707600000 } from './migrations/1789707600000-enable-unaccent-doctor-search';
import { AddReceptionQueueAndCounterPayment1789923600000 } from "./migrations/1789923600000-add-reception-queue-and-counter-payment";
import { AddWalkInPatientAndIdempotency1789927200000 } from "./migrations/1789927200000-add-walk-in-patient-and-idempotency";
import { AddReceptionAuditLogs1789930800000 } from "./migrations/1789930800000-add-reception-audit-logs";
import { AllowSharedPatientPhone1789934400000 } from "./migrations/1789934400000-allow-shared-patient-phone";
import { UniquePatientCitizenId1789938000000 } from "./migrations/1789938000000-unique-patient-citizen-id";
import {
  AuthSessionEntity,
  GoogleOAuthFlowEntity,
  GoogleRegistrationSessionEntity,
  PersonalHealthProfileEntity,
  RegistrationOtpSendEntity,
  RegistrationSessionEntity,
  UserRoleEntity,
} from "./entities/auth.entity";
import { UserEntity } from "./entities/user.entity";
import { SpecialtyEntity } from "./entities/specialty.entity";
import { DoctorEntity } from "./entities/doctor.entity";
import { DoctorScheduleEntity } from "./entities/doctor-schedule.entity";
import { AppointmentEntity } from "./entities/appointment.entity";
import { VoucherEntity } from './entities/voucher.entity';
import { RefundRequestEntity } from './entities/refund-request.entity';
import { AppointmentNotificationEntity } from './entities/appointment-notification.entity';
import { AddAppointmentLifecycleAndVouchers1789800000000 } from './migrations/1789800000000-add-appointment-lifecycle-and-vouchers';
import { AddClinicCancellationOutbox1789801200000 } from './migrations/1789801200000-add-clinic-cancellation-outbox';
import { AddAppointmentCreatedAt1789801800000 } from './migrations/1789801800000-add-appointment-created-at';
import { DoctorQueueCounterEntity } from "./entities/doctor-queue-counter.entity";
import { CounterPaymentTransactionEntity } from "./entities/counter-payment-transaction.entity";
import { ReceptionAuditLogEntity } from "./entities/reception-audit-log.entity";

import { MedicalRecordEntity } from "./entities/medical-record.entity";
import { PrescriptionEntity } from "./entities/prescription.entity";
import { PrescriptionItemEntity } from "./entities/prescription-item.entity";
import { EmrAddendumEntity } from "./entities/emr-addendum.entity";
import { AddEmrPrescriptionTables1790065218000 } from "./migrations/1790065218000-add-emr-prescription-tables";
import { CreateEmrAddendumsTable1790150000000 } from "./migrations/1790150000000-create-emr-addendums-table";
import { AddAppointmentConsent1790151600000 } from "./migrations/1790151600000-add-appointment-consent";
import { DoctorSpecialtyEntity } from './entities/doctor-specialty.entity';
import { AddDoctorSpecialties1790310000000 } from './migrations/1790310000000-add-doctor-specialties';
import { DoctorRecurringShiftEntity } from './entities/doctor-recurring-shift.entity';
import { AddDoctorRecurringShifts1790313600000 } from './migrations/1790313600000-add-doctor-recurring-shifts';
import { ClinicRoomEntity } from './entities/clinic-room.entity';
import { CreateClinicRooms1790400000000 } from './migrations/1790400000000-create-clinic-rooms';
import { BackfillDoctorUserRoles1790730000000 } from './migrations/1790730000000-backfill-doctor-user-roles';
import { AddClinicRoomDetails1790500000000 } from './migrations/1790500000000-add-clinic-room-details';
import { StaffShiftAssignmentEntity } from './entities/staff-shift-assignment.entity';
import { CreateStaffShiftAssignments1790600000000 } from './migrations/1790600000000-create-staff-shift-assignments';
import { AddAdminCatalogStaffReporting1790240000000 } from './migrations/1790240000000-add-admin-catalog-staff-reporting';
import { AddSpecialtyHeadDoctor1790320000000 } from './migrations/1790320000000-add-specialty-head-doctor';
import { Icd10CatalogEntity, MedicalServiceEntity, MedicineEntity } from './entities/admin-catalog.entity';
import { ReportApprovalEntity } from './entities/report-approval.entity';
import { AddReportApprovals1790300000000 } from './migrations/1790300000000-add-report-approvals';
import { DoctorReviewEntity } from "./entities/doctor-review.entity";
import { CreateDoctorReviews1790586000000 } from "./migrations/1790586000000-create-doctor-reviews";
import { AddAppointmentReminderLifecycle1790152800000 } from "./migrations/1790152800000-add-appointment-reminder-lifecycle";
import { PaymentTransactionEntity } from "./entities/payment-trans.entity";
import { CreatePaymentTransactions1790672400000 } from "./migrations/1790672400000-create-payment-transactions";
import { AddReservationExpiry1790758800000 } from './migrations/1790758800000-add-reservation-expiry';
import { AddPaymentSourceValidation1790762400000 } from './migrations/1790762400000-add-payment-source-validation';
import { AddTransactionRefunds1790766000000 } from './migrations/1790766000000-add-transaction-refunds';
import { AddReconciliationRetry1790769600000 } from './migrations/1790769600000-add-reconciliation-retry';
import { AddCanonicalPayment1790773200000 } from './migrations/1790773200000-add-canonical-payment';
import { AddRefundResolutionAudit1790776800000 } from './migrations/1790776800000-add-refund-resolution-audit';
import { PaymentReconciliationAuditEntity } from './entities/payment-reconciliation-audit.entity';
import { CreatePaymentReconciliationAudits1790780400000 } from './migrations/1790780400000-create-payment-reconciliation-audits';
import { AuditLogEntity } from './entities/audit-log.entity';
import { CreateAppendOnlyAuditLogs1790845200000 } from './migrations/1790845200000-create-append-only-audit-logs';
import { EncryptMedicalDataAtRest1790848800000 } from './migrations/1790848800000-encrypt-medical-data-at-rest';
import { SafeTypeOrmLogger } from './safe-typeorm.logger';

export function createDataSource(url: string): DataSource {
  return new DataSource({
    type: "postgres",
    url,
    synchronize: false,
    logging: false,
    logger: new SafeTypeOrmLogger(false),
    entities: [
      UserEntity,
      UserRoleEntity,
      PersonalHealthProfileEntity,
      RegistrationSessionEntity,
      RegistrationOtpSendEntity,
      AuthSessionEntity,
      GoogleOAuthFlowEntity,
      GoogleRegistrationSessionEntity,
      SpecialtyEntity,
      DoctorEntity,
      DoctorSpecialtyEntity,
      DoctorRecurringShiftEntity,
      ClinicRoomEntity,
      StaffShiftAssignmentEntity,
      DoctorScheduleEntity,
      AppointmentEntity,
      VoucherEntity,
      RefundRequestEntity,
      AppointmentNotificationEntity,
      MedicalRecordEntity,
      PrescriptionEntity,
      PrescriptionItemEntity,
      DoctorQueueCounterEntity,
      CounterPaymentTransactionEntity,
      ReceptionAuditLogEntity,
      MedicineEntity,
      MedicalServiceEntity,
      Icd10CatalogEntity,
      EmrAddendumEntity,
      ReportApprovalEntity,
      DoctorReviewEntity,
      PaymentTransactionEntity,
      PaymentReconciliationAuditEntity,
      AuditLogEntity,
    ],
    migrationsTransactionMode: "each",
    migrations: [
      CreateCatalogAndRbacTables1788834118637,
      CreateDoctorSchedulesTable1788849768948,
      CreateAppointmentsTable1788851428977,
      CreateRegistrationAndPhr1789477200000,
      CreateRegistrationOtpSendLimit1789477800000,
      CreateAuthSessionsAndGoogle1789478400000,
      AllowRegistrationWithBothContacts1789479000000,
      AddSrsAuth03PhrFields1789560000000,
      AddDoctorScheduleAndSearchIndexes1789565400000,
      EnableUnaccentDoctorSearch1789707600000,
      AddAppointmentLifecycleAndVouchers1789800000000,
      AddClinicCancellationOutbox1789801200000,
      AddAppointmentCreatedAt1789801800000,
      AddEmrPrescriptionTables1790065218000,
      AddReceptionQueueAndCounterPayment1789923600000,
      AddWalkInPatientAndIdempotency1789927200000,
      AddReceptionAuditLogs1789930800000,
      AllowSharedPatientPhone1789934400000,
      UniquePatientCitizenId1789938000000,
      CreateEmrAddendumsTable1790150000000,
      AddAppointmentConsent1790151600000,
      AddAppointmentReminderLifecycle1790152800000,
      AddAdminCatalogStaffReporting1790240000000,
      AddReportApprovals1790300000000,
      AddDoctorSpecialties1790310000000,
      AddDoctorRecurringShifts1790313600000,
      AddSpecialtyHeadDoctor1790320000000,
      CreateClinicRooms1790400000000,
      AddClinicRoomDetails1790500000000,
      CreateDoctorReviews1790586000000,
      CreateStaffShiftAssignments1790600000000,
      CreatePaymentTransactions1790672400000,
      BackfillDoctorUserRoles1790730000000,
      AddReservationExpiry1790758800000,
      AddPaymentSourceValidation1790762400000,
      AddTransactionRefunds1790766000000,
      AddReconciliationRetry1790769600000,
      AddCanonicalPayment1790773200000,
      AddRefundResolutionAudit1790776800000,
      CreatePaymentReconciliationAudits1790780400000,
      CreateAppendOnlyAuditLogs1790845200000,
      EncryptMedicalDataAtRest1790848800000,
    ],
  });
}
