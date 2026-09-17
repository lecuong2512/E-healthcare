import { DataSource } from "typeorm";
import { CreateCatalogAndRbacTables1788834118637 } from "./migrations/1788834118637-create-catalog-and-rbac-tables";
import { CreateDoctorSchedulesTable1788849768948 } from "./migrations/1788849768948-create-doctor-schedules-table";
import { CreateAppointmentsTable1788851428977 } from "./migrations/1788851428977-create-appointments-table";
import { CreateRegistrationAndPhr1789477200000 } from "./migrations/1789477200000-create-registration-and-phr";
import { CreateRegistrationOtpSendLimit1789477800000 } from "./migrations/1789477800000-create-registration-otp-send-limit";
import { CreateAuthSessionsAndGoogle1789478400000 } from "./migrations/1789478400000-create-auth-sessions-and-google";
import { AllowRegistrationWithBothContacts1789479000000 } from "./migrations/1789479000000-allow-registration-with-both-contacts";
import { AddDoctorScheduleAndSearchIndexes1789565400000 } from "./migrations/1789565400000-add-doctor-schedule-and-search-indexes";
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
import { DoctorEntity } from "./entities/doctor.entity";
import { DoctorScheduleEntity } from "./entities/doctor-schedule.entity";
import { SpecialtyEntity } from "./entities/specialty.entity";

export function createDataSource(url: string): DataSource {
  return new DataSource({
    type: "postgres",
    url,
    synchronize: false,
    logging: false,
    entities: [
      UserEntity,
      DoctorEntity,
      DoctorScheduleEntity,
      SpecialtyEntity,
      UserRoleEntity,
      PersonalHealthProfileEntity,
      RegistrationSessionEntity,
      RegistrationOtpSendEntity,
      AuthSessionEntity,
      GoogleOAuthFlowEntity,
      GoogleRegistrationSessionEntity,
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
      AddDoctorScheduleAndSearchIndexes1789565400000,
    ],
  });
}
