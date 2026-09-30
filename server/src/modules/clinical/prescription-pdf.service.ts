import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditAction } from '@shared/enums';
import { PrescriptionPdfPayload } from '@shared/interfaces';
import { DataSource } from 'typeorm';
import { environment } from '../../config/environment';
import { PrescriptionEntity } from '../../database/entities/prescription.entity';
import { AuditContext } from '../audit/audit-context';
import { AuditService } from '../audit/audit.service';
import { PdfGeneratorService } from '../notification/services/pdf-generator.service';
import { ClinicalEncryptedStore } from './clinical-encrypted.store';

export function canonicalPrescriptionPayload(
  prescriptionCode: string,
  doctorId: string,
  createdAt: Date | string,
): string {
  const timestamp = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error('Prescription creation timestamp is invalid.');
  }
  return `${prescriptionCode}|${doctorId}|${timestamp.toISOString()}`;
}

export function createPrescriptionHash(
  prescriptionCode: string,
  doctorId: string,
  createdAt: Date | string,
): string {
  return createHash('sha256')
    .update(
      canonicalPrescriptionPayload(prescriptionCode, doctorId, createdAt),
      'utf8',
    )
    .digest('hex');
}

@Injectable()
export class PrescriptionPdfService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly encryptedStore: ClinicalEncryptedStore,
    private readonly auditService: AuditService,
  ) {}

  async generateForPatient(
    appointmentId: string,
    patientId: string,
    auditContext: AuditContext,
  ): Promise<{ prescriptionCode: string; buffer: Buffer }> {
    const manager = this.dataSource.manager;
    const record =
      await this.encryptedStore.findMedicalRecordForPatientByAppointment(
        manager,
        appointmentId,
        patientId,
      );
    if (
      !record ||
      record.appointment?.patientId !== patientId ||
      record.appointment.doctorId !== record.doctorId
    ) {
      throw new NotFoundException(
        'Không tìm thấy đơn thuốc cho lịch hẹn này.',
      );
    }

    const prescription = await this.encryptedStore.findPrescription(
      manager,
      record.id,
    );
    if (!prescription) {
      throw new NotFoundException(
        'Không tìm thấy đơn thuốc cho lịch hẹn này.',
      );
    }

    const hash = createPrescriptionHash(
      prescription.prescriptionCode,
      record.doctorId,
      prescription.createdAt,
    );
    const payload: PrescriptionPdfPayload = {
      prescriptionCode: prescription.prescriptionCode,
      appointmentCode: record.appointment.appointmentCode,
      patientName: record.patient.fullName,
      doctorName: record.doctor.user.fullName,
      doctorLicense: record.doctor.licenseNumber,
      diagnosis: record.clinicalNotes,
      icd10Code: record.icd10PrimaryCode,
      secondaryIcd10Codes: record.icd10SecondaryCodes,
      medicines: prescription.items.map((item) => ({
        medicineName: item.medicineName,
        activeIngredient: item.activeIngredient ?? undefined,
        unit: item.unit,
        quantity: Number(item.totalQuantity),
        dosageMorning: item.dosageMorning ?? undefined,
        dosageNoon: item.dosageNoon ?? undefined,
        dosageAfternoon: item.dosageAfternoon ?? undefined,
        dosageNight: item.dosageNight ?? undefined,
        usageInstruction:
          item.usageInstructions ?? 'Chưa có hướng dẫn sử dụng.',
      })),
      doctorAdvice: record.doctorAdvice ?? undefined,
      followUpDate: record.followUpDate,
      createdAt: prescription.createdAt.toISOString(),
      verificationHash: hash,
      verificationUrl: this.verificationUrl(
        prescription.prescriptionCode,
        hash,
      ),
    };

    const result = {
      prescriptionCode: prescription.prescriptionCode,
      buffer: await this.pdfGenerator.generatePrescriptionPdf(payload),
    };

    // Fail closed: a sensitive export is not returned unless its audit event
    // is durably appended. No decrypted clinical payload is stored in metadata.
    await this.dataSource.transaction((manager) =>
      this.auditService.record(manager, auditContext, {
        action: AuditAction.EXPORT_RX,
        resourceType: 'PRESCRIPTION',
        resourceId: prescription.id,
      }),
    );
    return result;
  }

  async verify(
    prescriptionCode: string,
    suppliedHash?: string,
  ): Promise<{ valid: boolean }> {
    if (!suppliedHash || !/^[a-f0-9]{64}$/i.test(suppliedHash)) {
      return { valid: false };
    }

    // Verification reads identifiers only. It intentionally does not decrypt
    // clinical notes, vital signs or prescription items.
    const prescription = await this.dataSource
      .getRepository(PrescriptionEntity)
      .findOne({
        where: { prescriptionCode },
        relations: { medicalRecord: { appointment: true } },
      });
    const record = prescription?.medicalRecord;
    if (
      !prescription ||
      !record ||
      record.appointment?.id !== record.appointmentId ||
      record.appointment.patientId !== record.patientId ||
      record.appointment.doctorId !== record.doctorId
    ) {
      return { valid: false };
    }

    const expectedHash = createPrescriptionHash(
      prescription.prescriptionCode,
      record.doctorId,
      prescription.createdAt,
    );
    return {
      valid: timingSafeEqual(
        Buffer.from(expectedHash, 'hex'),
        Buffer.from(suppliedHash, 'hex'),
      ),
    };
  }

  private verificationUrl(prescriptionCode: string, hash: string): string {
    const configuredBaseUrl =
      environment.PRESCRIPTION_VERIFICATION_BASE_URL?.trim();
    if (!configuredBaseUrl) {
      throw new ServiceUnavailableException(
        'Prescription verification URL is not configured.',
      );
    }

    let baseUrl: URL;
    try {
      baseUrl = new URL(configuredBaseUrl);
    } catch {
      throw new ServiceUnavailableException(
        'Prescription verification URL is not configured correctly.',
      );
    }
    if (
      baseUrl.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(baseUrl.hostname)
    ) {
      throw new ServiceUnavailableException(
        'Prescription verification URL must use HTTPS.',
      );
    }

    baseUrl.pathname = `/api/v1/clinical/prescriptions/${encodeURIComponent(prescriptionCode)}/verify`;
    baseUrl.searchParams.set('hash', hash);
    return baseUrl.toString();
  }
}
