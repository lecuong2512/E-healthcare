import "reflect-metadata";
import "./test-environment";
import { DataSource } from "typeorm";
import { createDataSource } from "../src/database/database-options";
import { sign } from "jsonwebtoken";
import { hash } from "bcrypt";
import { Role, Gender, DateOfBirthPrecision, UserStatus, SlotStatus } from "@shared/enums";
import * as fs from "fs";
import * as path from "path";

const testDbUrl = "postgresql://postgres:postgres_password@localhost:5432/ehealth_phr_test_db";

async function main() {
  const dataSource = await createDataSource(testDbUrl).initialize();
  console.log("Connected to test database");

  // Cleanup
  await dataSource.query("TRUNCATE auth_sessions, user_roles, doctor_schedules, doctors, specialties, users CASCADE");

  const specialtyId = "30000000-0000-4000-8000-000000000001";
  const patientUserId = "40000000-0000-4000-8000-000000000001";
  const sessionId = "50000000-0000-4000-8000-000000000001";

  const passwordHash = await hash("Password123!", 10);

  // 1. Specialty
  await dataSource.query(
    "INSERT INTO specialties (id, name, description, is_active) VALUES ($1, 'Tim mạch', 'Mô tả', true)",
    [specialtyId]
  );

  // 2. Patient user & role
  await dataSource.query(
    `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
     VALUES ($1, 'patient.perf@hospital.vn', '+84902000001', $2, 'Bệnh Nhân Perf', $3, '1995-01-01', $4, $5)`,
    [patientUserId, passwordHash, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE]
  );
  await dataSource.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [patientUserId, Role.PATIENT]);

  // 3. Session
  await dataSource.query(
    `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, 'perf_hash', NOW() + INTERVAL '7 days')`,
    [sessionId, patientUserId]
  );

  // 4. Generate token matching SessionService exact format
  const token = sign(
    {
      userId: patientUserId,
      role: Role.PATIENT,
      sid: sessionId,
      type: "access",
    },
    "test-access-secret-not-for-production-123456",
    {
      algorithm: "HS256",
      issuer: "ehealth-api",
      audience: "ehealth-client",
      subject: patientUserId,
      expiresIn: 7200,
      jwtid: "70000000-0000-4000-8000-000000000001",
    }
  );

  // 5. Seed 20 doctors, each with 30 non-overlapping slots = 600 slots
  const slotPairs: { doctorId: string; slotId: string }[] = [];

  for (let d = 1; d <= 20; d++) {
    const doctorUserId = `10000000-0000-4000-8000-${d.toString().padStart(12, "0")}`;
    const doctorId = `20000000-0000-4000-8000-${d.toString().padStart(12, "0")}`;

    await dataSource.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, $2, $3, $4, $5, $6, '1980-01-01', $7, $8)`,
      [
        doctorUserId,
        `doc${d}@hospital.vn`,
        `+8490100${d.toString().padStart(4, "0")}`,
        passwordHash,
        `Bác Sĩ Test ${d}`,
        Gender.MALE,
        DateOfBirthPrecision.FULL_DATE,
        UserStatus.ACTIVE,
      ]
    );
    await dataSource.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, bio_description, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, $4, 'BSCKII', 300000, 'Bác sĩ test', $5, 5.0, 10)`,
      [doctorId, doctorUserId, specialtyId, `LIC-${d}`, `P.${d}`]
    );
    await dataSource.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [doctorUserId, Role.DOCTOR]);

    // 30 non-overlapping slots for this doctor
    for (let s = 0; s < 30; s++) {
      const slotIndex = (d - 1) * 30 + s + 1;
      const slotId = `80000000-0000-4000-8000-${slotIndex.toString().padStart(12, "0")}`;
      slotPairs.push({ doctorId, slotId });

      // Calculate sequential 15-minute times starting at 08:00
      const totalMinutesStart = 8 * 60 + s * 15;
      const totalMinutesEnd = totalMinutesStart + 15;

      const startH = Math.floor(totalMinutesStart / 60).toString().padStart(2, "0");
      const startM = (totalMinutesStart % 60).toString().padStart(2, "0");
      const endH = Math.floor(totalMinutesEnd / 60).toString().padStart(2, "0");
      const endM = (totalMinutesEnd % 60).toString().padStart(2, "0");

      const startTime = `${startH}:${startM}:00`;
      const endTime = `${endH}:${endM}:00`;

      await dataSource.query(
        `INSERT INTO doctor_schedules (id, doctor_id, date, start_time, end_time, status)
         VALUES ($1, $2, '2026-11-01', $3, $4, $5)`,
        [slotId, doctorId, startTime, endTime, SlotStatus.AVAILABLE]
      );
    }
  }

  console.log(`Successfully seeded 20 doctors, 1 patient, and ${slotPairs.length} non-overlapping slots.`);

  // Write data file for k6
  const dataForK6 = {
    token,
    slots: slotPairs,
  };

  const outputPath = path.join(__dirname, "..", "..", "tests-load", "fixtures", "slot-perf-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(dataForK6, null, 2));
  console.log("Wrote k6 test fixture to:", outputPath);

  await dataSource.destroy();
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
