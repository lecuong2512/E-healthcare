import './test-environment';
import 'reflect-metadata';
import { AuditAction, AuditOutcome, Role } from '@shared/enums';
import { DataSource } from 'typeorm';
import { environment } from '../src/config/environment';
import { createDataSource } from '../src/database/database-options';
import { EncryptMedicalDataAtRest1790848800000 } from '../src/database/migrations/1790848800000-encrypt-medical-data-at-rest';
import { AdminAuditService } from '../src/modules/admin/admin-audit.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { ClinicalEncryptedStore } from '../src/modules/clinical/clinical-encrypted.store';
import { assertLeastPrivilegeRuntimeRole } from '../src/database/runtime-database-role.guard';
import { rotateMedicalEncryption } from '../src/database/rotate-medical-encryption';

const databaseUrl = environment.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.startsWith('/ehealth_card43_test_')) {
  throw new Error(
    'TEST_DATABASE_URL must target an isolated database named ehealth_card43_test_*.',
  );
}

describe('Card 4.3 encryption and append-only audit on PostgreSQL', () => {
  const clinicalNotes = 'Đau ngực khi gắng sức - plaintext canary';
  const medicineName = 'Aspirin Sensitive Canary';
  const addendumReason = 'Bổ sung diễn tiến nhạy cảm';
  let database: DataSource;
  let store: ClinicalEncryptedStore;
  let audit: AuditService;
  let adminAudit: AdminAuditService;
  let patientId: string;
  let doctorUserId: string;
  let doctorId: string;
  let adminId: string;
  let appointmentId: string;
  let recordId: string;
  let runtimeDatabase: DataSource | undefined;
  let runtimeRoleCreated = false;
  const runtimeRole = `ehealth_card43_runtime_${process.pid}`;
  const runtimePassword = 'card43_runtime_test_only';

  beforeAll(async () => {
    const configured = createDataSource(databaseUrl);
    const configuredMigrations = configured.options.migrations;
    if (!Array.isArray(configuredMigrations)) {
      throw new Error('Card 4.3 integration test requires an explicit migration list.');
    }
    const migrations = configuredMigrations.filter(
      (migration) => migration !== EncryptMedicalDataAtRest1790848800000,
    );
    database = new DataSource({ ...configured.options, migrations });
    await database.initialize();
    await database.runMigrations();

    patientId = await seedUser('Bệnh nhân bảo mật', 'patient-card43@test.local');
    doctorUserId = await seedUser('Bác sĩ bảo mật', 'doctor-card43@test.local');
    adminId = await seedUser('Quản trị bảo mật', 'admin-card43@test.local');
    const [specialty] = await database.query(
      `INSERT INTO specialties (name) VALUES ('Tim mạch Card 4.3') RETURNING id`,
    );
    const [doctor] = await database.query(
      `INSERT INTO doctors
         (user_id, specialty_id, license_number, consultation_fee, room_number)
       VALUES ($1, $2, 'CARD43-LICENSE', 300000, 'SEC-01') RETURNING id`,
      [doctorUserId, specialty.id],
    );
    doctorId = doctor.id;
    const [schedule] = await database.query(
      `INSERT INTO doctor_schedules
         (doctor_id, date, start_time, end_time, status)
       VALUES ($1, CURRENT_DATE + 1, '09:00', '09:30', 'BOOKED') RETURNING id`,
      [doctorId],
    );
    const [appointment] = await database.query(
      `INSERT INTO appointments
         (appointment_code, patient_id, doctor_id, schedule_id, status,
          reason_for_visit, payment_status, payment_method, total_amount)
       VALUES ('APT-CARD43-LEGACY', $1, $2, $3, 'IN_CONSULTATION',
               'Kiểm thử mã hóa', 'PAID', 'PAY_AT_CLINIC', 300000)
       RETURNING id`,
      [patientId, doctorId, schedule.id],
    );
    appointmentId = appointment.id;

    const [record] = await database.query(
      `INSERT INTO medical_records
         (appointment_id, patient_id, doctor_id, vital_signs, clinical_notes,
          icd10_primary_code, doctor_advice)
       VALUES ($1, $2, $3, $4::jsonb, $5, 'I20.9', 'Theo dõi tim mạch')
       RETURNING id`,
      [
        appointmentId,
        patientId,
        doctorId,
        JSON.stringify({ bloodPressure: '120/80', pulse: 72 }),
        clinicalNotes,
      ],
    );
    recordId = record.id;
    const [prescription] = await database.query(
      `INSERT INTO prescriptions (medical_record_id, prescription_code)
       VALUES ($1, 'RX-CARD43-LEGACY') RETURNING id`,
      [recordId],
    );
    await database.query(
      `INSERT INTO prescription_items
         (prescription_id, medicine_name, active_ingredient, dosage_morning,
          total_quantity, unit, usage_instructions)
       VALUES ($1, $2, 'Acetylsalicylic acid', '1 viên', 10, 'viên', 'Uống sau ăn')`,
      [prescription.id, medicineName],
    );
    const snapshot = {
      clinicalNotes,
      doctorAdvice: 'Theo dõi tim mạch',
      icd10PrimaryCode: 'I20.9',
      icd10SecondaryCodes: null,
      followUpDate: null,
      vitalSigns: null,
    };
    await database.query(
      `INSERT INTO emr_addendums
         (medical_record_id, doctor_id, reason, previous_content, updated_content)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [recordId, doctorId, addendumReason, JSON.stringify(snapshot), JSON.stringify(snapshot)],
    );

    const queryRunner = database.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await new EncryptMedicalDataAtRest1790848800000().up(queryRunner);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    store = new ClinicalEncryptedStore();
    audit = new AuditService();
    adminAudit = new AdminAuditService(database, audit);
  }, 30_000);

  afterAll(async () => {
    if (runtimeDatabase?.isInitialized) await runtimeDatabase.destroy();
    if (database?.isInitialized && runtimeRoleCreated) {
      await database.query(`DROP OWNED BY ${runtimeRole}`);
      await database.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
    }
    if (database?.isInitialized) await database.destroy();
  });

  it('backfills legacy EMR, prescription and Addendum without plaintext columns', async () => {
    const columns: Array<{ table_name: string; column_name: string }> = await database.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('medical_records', 'prescription_items', 'emr_addendums')`,
    );
    const names = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`));
    expect(names).not.toContain('medical_records.clinical_notes');
    expect(names).not.toContain('medical_records.vital_signs');
    expect(names).not.toContain('prescription_items.medicine_name');
    expect(names).not.toContain('emr_addendums.previous_content');

    const [raw] = await database.query(
      `SELECT encode(clinical_notes_ciphertext, 'hex') AS clinical,
              encode(payload_ciphertext, 'hex') AS prescription,
              encode(content_ciphertext, 'hex') AS addendum
         FROM medical_records m
         JOIN prescriptions p ON p.medical_record_id = m.id
         JOIN prescription_items pi ON pi.prescription_id = p.id
         JOIN emr_addendums ea ON ea.medical_record_id = m.id
        WHERE m.id = $1`,
      [recordId],
    );
    expect(raw.clinical).not.toContain(Buffer.from(clinicalNotes).toString('hex'));
    expect(raw.prescription).not.toContain(Buffer.from(medicineName).toString('hex'));
    expect(raw.addendum).not.toContain(Buffer.from(addendumReason).toString('hex'));

    const hydratedRecord = await store.findMedicalRecord(database.manager, recordId);
    const patientScopedRecord = await store.findMedicalRecordForPatientByAppointment(
      database.manager,
      appointmentId,
      patientId,
    );
    const unauthorizedRecord = await store.findMedicalRecordForPatientByAppointment(
      database.manager,
      appointmentId,
      adminId,
    );
    const hydratedPrescription = await store.findPrescription(database.manager, recordId);
    const hydratedAddendums = await store.findAddendums(database.manager, recordId);
    expect(hydratedRecord.clinicalNotes).toBe(clinicalNotes);
    expect(hydratedRecord.vitalSigns).toMatchObject({ bloodPressure: '120/80', pulse: 72 });
    expect(patientScopedRecord?.clinicalNotes).toBe(clinicalNotes);
    expect(patientScopedRecord?.appointment.patientId).toBe(patientId);
    expect(unauthorizedRecord).toBeNull();
    expect(hydratedPrescription?.items[0].medicineName).toBe(medicineName);
    expect(hydratedAddendums[0].reason).toBe(addendumReason);
  });

  it('fails decryption with the wrong key', async () => {
    await expect(
      database.query(
        `SELECT pgp_sym_decrypt(clinical_notes_ciphertext, $1)
           FROM medical_records WHERE id = $2`,
        ['ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', recordId],
      ),
    ).rejects.toThrow();
  });

  it('stores complete audit context and exposes a filtered read-only Admin view', async () => {
    await database.transaction((manager) =>
      audit.record(
        manager,
        {
          actorId: doctorUserId,
          actorRole: Role.DOCTOR,
          ipAddress: '203.0.113.43',
          userAgent: 'card43-integration',
          requestId: 'req-card43-view-emr',
        },
        {
          action: AuditAction.VIEW_EMR,
          outcome: AuditOutcome.SUCCESS,
          resourceType: 'MEDICAL_RECORD',
          resourceId: recordId,
        },
      ),
    );
    const page = await adminAudit.list(
      {
        from: new Date(Date.now() - 60_000).toISOString(),
        toExclusive: new Date(Date.now() + 60_000).toISOString(),
        action: AuditAction.VIEW_EMR,
        search: '203.0.113.43',
        page: 1,
        pageSize: 25,
      },
      {
        actorId: adminId,
        actorRole: Role.ADMIN,
        ipAddress: '127.0.0.1',
        userAgent: 'card43-admin',
        requestId: 'req-card43-admin-list',
      },
    );
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      actorId: doctorUserId,
      actorRole: Role.DOCTOR,
      action: AuditAction.VIEW_EMR,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: '203.0.113.43',
      resourceId: recordId,
      requestId: 'req-card43-view-emr',
    });
  });

  it.each(['UPDATE audit_logs SET outcome = \'FAILURE\'', 'DELETE FROM audit_logs', 'TRUNCATE audit_logs'])(
    'rejects append-only mutation: %s',
    async (statement) => {
      await expect(database.query(statement)).rejects.toThrow(/append-only/);
    },
  );

  it('enforces append-only privileges through the real API runtime role', async () => {
    const databaseName = new URL(databaseUrl).pathname.slice(1);
    if (!/^[a-z0-9_]+$/i.test(databaseName)) {
      throw new Error('Unsafe integration database name.');
    }
    await database.query(
      `CREATE ROLE ${runtimeRole}
         LOGIN PASSWORD '${runtimePassword}'
         NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    runtimeRoleCreated = true;
    await database.query(`GRANT CONNECT ON DATABASE ${databaseName} TO ${runtimeRole}`);
    await database.query(`GRANT USAGE ON SCHEMA public TO ${runtimeRole}`);
    await database.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${runtimeRole}`,
    );
    await database.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${runtimeRole}`,
    );
    await database.query(
      `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM ${runtimeRole}`,
    );

    const runtimeUrl = new URL(databaseUrl);
    runtimeUrl.username = runtimeRole;
    runtimeUrl.password = runtimePassword;
    runtimeDatabase = createDataSource(runtimeUrl.toString());
    await runtimeDatabase.initialize();
    const previousEnforcement = environment.ENFORCE_RUNTIME_DB_ROLE;
    environment.ENFORCE_RUNTIME_DB_ROLE = 'true';
    try {
      await expect(
        assertLeastPrivilegeRuntimeRole(runtimeDatabase),
      ).resolves.toBeUndefined();
    } finally {
      if (previousEnforcement === undefined) {
        delete environment.ENFORCE_RUNTIME_DB_ROLE;
      } else {
        environment.ENFORCE_RUNTIME_DB_ROLE = previousEnforcement;
      }
    }
    await expect(
      runtimeDatabase.query(`UPDATE audit_logs SET outcome = 'FAILURE'`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      runtimeDatabase.query(`DROP TRIGGER trg_audit_logs_reject_update_delete ON audit_logs`),
    ).rejects.toThrow(/must be owner|permission denied/);
  });

  it('rolls back a sensitive write when its audit insert fails', async () => {
    const [schedule] = await database.query(
      `INSERT INTO doctor_schedules
         (doctor_id, date, start_time, end_time, status)
       VALUES ($1, CURRENT_DATE + 2, '10:00', '10:30', 'BOOKED') RETURNING id`,
      [doctorId],
    );
    const [appointment] = await database.query(
      `INSERT INTO appointments
         (appointment_code, patient_id, doctor_id, schedule_id, status,
          reason_for_visit, payment_status, payment_method, total_amount)
       VALUES ('APT-CARD43-ROLLBACK', $1, $2, $3, 'IN_CONSULTATION',
               'Kiểm thử rollback', 'PAID', 'PAY_AT_CLINIC', 300000)
       RETURNING id`,
      [patientId, doctorId, schedule.id],
    );

    await expect(
      database.transaction(async (manager) => {
        const record = await store.insertMedicalRecord(manager, {
          appointmentId: appointment.id,
          patientId,
          doctorId,
          vitalSigns: { pulse: 70 },
          clinicalNotes: 'Must be rolled back',
          icd10PrimaryCode: 'Z00.0',
          icd10SecondaryCodes: null,
          doctorAdvice: null,
          followUpDate: null,
        });
        await audit.record(
          manager,
          {
            actorId: doctorUserId,
            actorRole: Role.DOCTOR,
            ipAddress: '127.0.0.1',
            userAgent: 'card43-integration',
            requestId: 'req-card43-fail-closed',
          },
          { action: 'UNSUPPORTED_ACTION' as AuditAction, resourceId: record.id },
        );
      }),
    ).rejects.toThrow();
    const [count] = await database.query(
      `SELECT COUNT(*)::int AS total FROM medical_records WHERE appointment_id = $1`,
      [appointment.id],
    );
    expect(count.total).toBe(0);
  });

  it('rotates old encryption versions in resumable batches', async () => {
    const originalKey = environment.MEDICAL_DATA_ENCRYPTION_KEY!;
    const originalVersion = environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION;
    const originalKeyring = environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON;
    const newKey =
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    environment.MEDICAL_DATA_ENCRYPTION_KEY = newKey;
    environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION = '2';
    environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON = JSON.stringify({
      1: originalKey,
    });
    try {
      const result = await rotateMedicalEncryption(database, { batchSize: 1 });
      expect(result.targetVersion).toBe(2);
      expect(result.counts.medical_records).toBeGreaterThan(0);

      const versions = await database.query(`
        SELECT 'medical_records' AS table_name, COUNT(*)::int AS stale
          FROM medical_records WHERE encryption_key_version <> 2
        UNION ALL
        SELECT 'prescription_items', COUNT(*)::int
          FROM prescription_items WHERE encryption_key_version <> 2
        UNION ALL
        SELECT 'emr_addendums', COUNT(*)::int
          FROM emr_addendums WHERE encryption_key_version <> 2
      `);
      expect(versions).toEqual([
        { table_name: 'medical_records', stale: 0 },
        { table_name: 'prescription_items', stale: 0 },
        { table_name: 'emr_addendums', stale: 0 },
      ]);

      const rotatedStore = new ClinicalEncryptedStore();
      await expect(
        rotatedStore.findMedicalRecord(database.manager, recordId),
      ).resolves.toMatchObject({ clinicalNotes });
      const repeat = await rotateMedicalEncryption(database, { batchSize: 1 });
      expect(repeat.counts).toEqual({
        medical_records: 0,
        prescription_items: 0,
        emr_addendums: 0,
      });
    } finally {
      environment.MEDICAL_DATA_ENCRYPTION_KEY = originalKey;
      if (originalVersion === undefined) delete environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION;
      else environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION = originalVersion;
      if (originalKeyring === undefined) delete environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON;
      else environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON = originalKeyring;
    }
  });

  async function seedUser(name: string, email: string): Promise<string> {
    const [row] = await database.query(
      `INSERT INTO users (email, full_name, gender, date_of_birth, status)
       VALUES ($1, $2, 'OTHER', '1990-01-01', 'ACTIVE') RETURNING id`,
      [email, name],
    );
    return row.id;
  }
});
