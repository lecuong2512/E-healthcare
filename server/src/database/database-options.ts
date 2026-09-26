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
import { AddEmrPrescriptionTables1790065218000 } from "./migrations/1790065218000-add-emr-prescription-tables";
import { AddAppointmentConsent1790151600000 } from "./migrations/1790151600000-add-appointment-consent";
export function createDataSource(url: string): DataSource {
  return new DataSource({
    type: "postgres",
    url,
    synchronize: false,
    logging: false,
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
      AddReceptionQueueAndCounterPayment1789923600000,
      AddWalkInPatientAndIdempotency1789927200000,
      AddReceptionAuditLogs1789930800000,
      AllowSharedPatientPhone1789934400000,
      UniquePatientCitizenId1789938000000,
      AddEmrPrescriptionTables1790065218000,
      AddAppointmentConsent1790151600000,
    ],
  });
}
