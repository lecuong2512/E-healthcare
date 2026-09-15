import { DataSource } from "typeorm";
import { CreateCatalogAndRbacTables1788834118637 } from "./migrations/1788834118637-create-catalog-and-rbac-tables";
import { CreateDoctorSchedulesTable1788849768948 } from "./migrations/1788849768948-create-doctor-schedules-table";
import { CreateAppointmentsTable1788851428977 } from "./migrations/1788851428977-create-appointments-table";
import { CreateRegistrationAndPhr1789477200000 } from "./migrations/1789477200000-create-registration-and-phr";
import { CreateRegistrationOtpSendLimit1789477800000 } from "./migrations/1789477800000-create-registration-otp-send-limit";
import { CreateAuthSessionsAndGoogle1789478400000 } from "./migrations/1789478400000-create-auth-sessions-and-google";

export function createDataSource(url: string): DataSource {
  return new DataSource({
    type: "postgres",
    url,
    synchronize: false,
    logging: false,
    migrationsTransactionMode: "each",
    migrations: [
      CreateCatalogAndRbacTables1788834118637,
      CreateDoctorSchedulesTable1788849768948,
      CreateAppointmentsTable1788851428977,
      CreateRegistrationAndPhr1789477200000,
      CreateRegistrationOtpSendLimit1789477800000,
      CreateAuthSessionsAndGoogle1789478400000,
    ],
  });
}
