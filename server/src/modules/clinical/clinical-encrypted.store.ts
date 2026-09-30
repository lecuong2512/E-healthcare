import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EmrClinicalSnapshot, PrescriptionItemInput } from '@shared/interfaces';
import { EntityManager } from 'typeorm';
import { loadMedicalEncryptionConfig } from '../../config/medical-encryption';
import { EmrAddendumEntity } from '../../database/entities/emr-addendum.entity';
import { MedicalRecordEntity } from '../../database/entities/medical-record.entity';
import { PrescriptionItemEntity } from '../../database/entities/prescription-item.entity';
import { PrescriptionEntity } from '../../database/entities/prescription.entity';

export interface NewMedicalRecord {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  vitalSigns: Record<string, number | string>;
  clinicalNotes: string;
  icd10PrimaryCode: string;
  icd10SecondaryCodes: string | null;
  doctorAdvice: string | null;
  followUpDate: string | null;
}

interface EncryptedPrescriptionPayload {
  medicineName: string;
  activeIngredient: string | null;
  dosageMorning: string | null;
  dosageNoon: string | null;
  dosageAfternoon: string | null;
  dosageNight: string | null;
  totalQuantity: number;
  unit: string;
  usageInstructions: string | null;
}

interface EncryptedAddendumPayload {
  reason: string;
  previousContent: EmrClinicalSnapshot;
  updatedContent: EmrClinicalSnapshot;
}

export type MedicalRecordAccessMetadata = Pick<
  MedicalRecordEntity,
  'id' | 'appointmentId' | 'patientId' | 'doctorId'
>;

@Injectable()
export class ClinicalEncryptedStore {
  private readonly config = loadMedicalEncryptionConfig();

  async insertMedicalRecord(
    manager: EntityManager,
    input: NewMedicalRecord,
  ): Promise<MedicalRecordEntity> {
    const key = this.currentKey();
    const rows = await manager.query(
      `INSERT INTO medical_records (
         appointment_id, patient_id, doctor_id,
         vital_signs_ciphertext, clinical_notes_ciphertext,
         encryption_key_version, icd10_primary_code,
         icd10_secondary_codes, doctor_advice, follow_up_date,
         is_locked, locked_at, completed_at
       ) VALUES (
         $1, $2, $3,
         pgp_sym_encrypt($4::text, $5, 'cipher-algo=aes256'),
         pgp_sym_encrypt($6::text, $5, 'cipher-algo=aes256'),
         $7, $8, $9, $10, $11, FALSE, NULL, NULL
       ) RETURNING id`,
      [
        input.appointmentId,
        input.patientId,
        input.doctorId,
        JSON.stringify(input.vitalSigns),
        key,
        input.clinicalNotes,
        this.config.currentVersion,
        input.icd10PrimaryCode,
        input.icd10SecondaryCodes,
        input.doctorAdvice,
        input.followUpDate,
      ],
    );
    return this.findMedicalRecord(manager, rows[0].id);
  }

  async findMedicalRecord(
    manager: EntityManager,
    id: string,
  ): Promise<MedicalRecordEntity> {
    const record = await manager.getRepository(MedicalRecordEntity).findOne({
      where: { id },
    });
    if (!record) throw new ServiceUnavailableException('Encrypted medical record disappeared.');
    return this.hydrateMedicalRecord(manager, record);
  }

  async findMedicalRecordAccessMetadata(
    manager: EntityManager,
    id: string,
  ): Promise<MedicalRecordAccessMetadata | null> {
    return manager.getRepository(MedicalRecordEntity).findOne({
      select: {
        id: true,
        appointmentId: true,
        patientId: true,
        doctorId: true,
      },
      where: { id },
    });
  }

  async findMedicalRecordAccessMetadataByAppointment(
    manager: EntityManager,
    appointmentId: string,
  ): Promise<MedicalRecordAccessMetadata | null> {
    return manager.getRepository(MedicalRecordEntity).findOne({
      select: {
        id: true,
        appointmentId: true,
        patientId: true,
        doctorId: true,
      },
      where: { appointmentId },
    });
  }

  async findMedicalRecordByAppointment(
    manager: EntityManager,
    appointmentId: string,
  ): Promise<MedicalRecordEntity | null> {
    const record = await manager.getRepository(MedicalRecordEntity).findOne({
      where: { appointmentId },
    });
    return record ? this.hydrateMedicalRecord(manager, record) : null;
  }

  /**
   * Patient-scoped read contract for consumers such as prescription PDF export.
   * The ownership predicate is evaluated by PostgreSQL before any PHI is decrypted.
   */
  async findMedicalRecordForPatientByAppointment(
    manager: EntityManager,
    appointmentId: string,
    patientId: string,
  ): Promise<MedicalRecordEntity | null> {
    const record = await manager.getRepository(MedicalRecordEntity).findOne({
      where: [
        { appointmentId, patientId },
        { appointmentId, appointment: { createdBy: patientId } },
      ],
      relations: {
        patient: true,
        doctor: { user: true },
        appointment: true,
      },
    });
    return record ? this.hydrateMedicalRecord(manager, record) : null;
  }

  async saveMedicalRecord(
    manager: EntityManager,
    record: MedicalRecordEntity,
  ): Promise<MedicalRecordEntity> {
    const key = this.currentKey();
    record.encryptionKeyVersion = this.config.currentVersion;
    await manager.getRepository(MedicalRecordEntity).save(record);
    await manager.query(
      `UPDATE medical_records
          SET clinical_notes_ciphertext = pgp_sym_encrypt($1::text, $2, 'cipher-algo=aes256'),
              vital_signs_ciphertext = pgp_sym_encrypt($3::text, $2, 'cipher-algo=aes256'),
              encryption_key_version = $4
        WHERE id = $5`,
      [
        record.clinicalNotes,
        key,
        JSON.stringify(record.vitalSigns),
        this.config.currentVersion,
        record.id,
      ],
    );
    return record;
  }

  async findPrescription(
    manager: EntityManager,
    medicalRecordId: string,
  ): Promise<PrescriptionEntity | null> {
    const prescription = await manager.getRepository(PrescriptionEntity).findOne({
      where: { medicalRecordId },
    });
    if (!prescription) return null;
    const items = await manager.getRepository(PrescriptionItemEntity).find({
      where: { prescriptionId: prescription.id },
      order: { id: 'ASC' },
    });
    prescription.items = [];
    for (const item of items) {
      prescription.items.push(await this.hydratePrescriptionItem(manager, item));
    }
    return prescription;
  }

  async replacePrescriptionItems(
    manager: EntityManager,
    prescriptionId: string,
    items: readonly PrescriptionItemInput[],
  ): Promise<PrescriptionItemEntity[]> {
    await manager.getRepository(PrescriptionItemEntity).delete({ prescriptionId });
    const key = this.currentKey();
    const saved: PrescriptionItemEntity[] = [];
    for (const item of items) {
      const payload: EncryptedPrescriptionPayload = {
        medicineName: item.medicineName.trim(),
        activeIngredient: item.activeIngredient?.trim() || null,
        dosageMorning: item.dosageMorning?.trim() || null,
        dosageNoon: item.dosageNoon?.trim() || null,
        dosageAfternoon: item.dosageAfternoon?.trim() || null,
        dosageNight: item.dosageNight?.trim() || null,
        totalQuantity: Number(item.totalQuantity),
        unit: item.unit.trim(),
        usageInstructions: item.usageInstructions?.trim() || null,
      };
      const rows = await manager.query(
        `INSERT INTO prescription_items (
           prescription_id, payload_ciphertext, encryption_key_version
         ) VALUES (
           $1, pgp_sym_encrypt($2::text, $3, 'cipher-algo=aes256'), $4
         ) RETURNING id`,
        [
          prescriptionId,
          JSON.stringify(payload),
          key,
          this.config.currentVersion,
        ],
      );
      const entity = manager.getRepository(PrescriptionItemEntity).create({
        id: rows[0].id,
        prescriptionId,
        encryptionKeyVersion: this.config.currentVersion,
        ...payload,
      });
      saved.push(entity);
    }
    return saved;
  }

  async findAddendums(
    manager: EntityManager,
    medicalRecordId: string,
    withDoctor = false,
  ): Promise<EmrAddendumEntity[]> {
    const addendums = await manager.getRepository(EmrAddendumEntity).find({
      where: { medicalRecordId },
      relations: withDoctor ? ['doctor', 'doctor.user'] : [],
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    for (const addendum of addendums) {
      await this.hydrateAddendum(manager, addendum);
    }
    return addendums;
  }

  async insertAddendum(
    manager: EntityManager,
    input: {
      medicalRecordId: string;
      doctorId: string;
      reason: string;
      previousContent: EmrClinicalSnapshot;
      updatedContent: EmrClinicalSnapshot;
    },
  ): Promise<EmrAddendumEntity> {
    const payload: EncryptedAddendumPayload = {
      reason: input.reason,
      previousContent: input.previousContent,
      updatedContent: input.updatedContent,
    };
    const rows = await manager.query(
      `INSERT INTO emr_addendums (
         medical_record_id, doctor_id, content_ciphertext, encryption_key_version
       ) VALUES (
         $1, $2, pgp_sym_encrypt($3::text, $4, 'cipher-algo=aes256'), $5
       ) RETURNING id, created_at`,
      [
        input.medicalRecordId,
        input.doctorId,
        JSON.stringify(payload),
        this.currentKey(),
        this.config.currentVersion,
      ],
    );
    return manager.getRepository(EmrAddendumEntity).create({
      id: rows[0].id,
      medicalRecordId: input.medicalRecordId,
      doctorId: input.doctorId,
      createdAt: new Date(rows[0].created_at),
      encryptionKeyVersion: this.config.currentVersion,
      ...payload,
    });
  }

  private async hydrateMedicalRecord(
    manager: EntityManager,
    record: MedicalRecordEntity,
  ): Promise<MedicalRecordEntity> {
    const key = this.keyFor(record.encryptionKeyVersion);
    const rows = await manager.query(
      `SELECT pgp_sym_decrypt(clinical_notes_ciphertext, $1)::text AS clinical_notes,
              pgp_sym_decrypt(vital_signs_ciphertext, $1)::text AS vital_signs
         FROM medical_records WHERE id = $2`,
      [key, record.id],
    );
    if (!rows[0]) throw new ServiceUnavailableException('Encrypted medical record disappeared.');
    record.clinicalNotes = rows[0].clinical_notes;
    record.vitalSigns = this.parseJson<Record<string, number>>(rows[0].vital_signs);
    return record;
  }

  private async hydratePrescriptionItem(
    manager: EntityManager,
    item: PrescriptionItemEntity,
  ): Promise<PrescriptionItemEntity> {
    const rows = await manager.query(
      `SELECT pgp_sym_decrypt(payload_ciphertext, $1)::text AS payload
         FROM prescription_items WHERE id = $2`,
      [this.keyFor(item.encryptionKeyVersion), item.id],
    );
    const payload = this.parseJson<EncryptedPrescriptionPayload>(rows[0]?.payload);
    Object.assign(item, payload, { totalQuantity: Number(payload.totalQuantity) });
    return item;
  }

  private async hydrateAddendum(
    manager: EntityManager,
    addendum: EmrAddendumEntity,
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT pgp_sym_decrypt(content_ciphertext, $1)::text AS payload
         FROM emr_addendums WHERE id = $2`,
      [this.keyFor(addendum.encryptionKeyVersion), addendum.id],
    );
    Object.assign(
      addendum,
      this.parseJson<EncryptedAddendumPayload>(rows[0]?.payload),
    );
  }

  private currentKey(): string {
    return this.keyFor(this.config.currentVersion);
  }

  private keyFor(version: number): string {
    const key = this.config.keys.get(version);
    if (!key) {
      throw new ServiceUnavailableException(
        `Medical encryption key version ${version} is unavailable.`,
      );
    }
    return key;
  }

  private parseJson<T>(value: unknown): T {
    if (typeof value !== 'string') {
      throw new ServiceUnavailableException('Encrypted medical payload is unavailable.');
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new ServiceUnavailableException('Encrypted medical payload is invalid.');
    }
  }
}
