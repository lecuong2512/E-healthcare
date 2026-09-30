import './test-environment';
import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@shared/enums';
import { DataSource, EntityManager } from 'typeorm';
import {
  PUBLIC_ROUTE,
  REQUIRED_ROLES,
} from '../src/common/decorators/auth.decorators';
import { environment } from '../src/config/environment';
import { PrescriptionEntity } from '../src/database/entities/prescription.entity';
import { AuditService } from '../src/modules/audit/audit.service';
import { ClinicalController } from '../src/modules/clinical/clinical.controller';
import { ClinicalEncryptedStore } from '../src/modules/clinical/clinical-encrypted.store';
import {
  canonicalPrescriptionPayload,
  createPrescriptionHash,
  PrescriptionPdfService,
} from '../src/modules/clinical/prescription-pdf.service';
import {
  PdfGeneratorService,
  PRESCRIPTION_PDF_VERIFICATION_FOOTER,
} from '../src/modules/notification/services/pdf-generator.service';

const createdAt = new Date('2026-09-25T08:30:00.000Z');

function makeRecord(patientId = 'patient-1') {
  return {
    id: 'record-1',
    appointmentId: 'appointment-1',
    patientId,
    doctorId: 'doctor-1',
    clinicalNotes: 'Viêm họng cấp',
    icd10PrimaryCode: 'J02.9',
    icd10SecondaryCodes: 'R50.9',
    doctorAdvice: 'Uống đủ nước.',
    followUpDate: '2026-10-02',
    patient: { fullName: 'Nguyễn An' },
    doctor: {
      licenseNumber: 'CCHN-1',
      user: { fullName: 'Bác sĩ Bình' },
    },
    appointment: {
      id: 'appointment-1',
      patientId,
      doctorId: 'doctor-1',
      appointmentCode: 'APT-1',
    },
  };
}

function makePrescription() {
  return {
    id: 'prescription-1',
    medicalRecordId: 'record-1',
    prescriptionCode: 'RX-1',
    createdAt,
    items: [
      {
        medicineName: 'Thuốc A',
        activeIngredient: 'Hoạt chất A',
        totalQuantity: 10,
        unit: 'viên',
        dosageMorning: '1 viên',
        dosageNoon: null,
        dosageAfternoon: null,
        dosageNight: '1 viên',
        usageInstructions: 'Uống sau ăn.',
      },
    ],
  };
}

describe('Prescription PDF encrypted reads and verification', () => {
  let service: PrescriptionPdfService;
  let record: ReturnType<typeof makeRecord> | null;
  let prescription: ReturnType<typeof makePrescription> | null;
  let generator: jest.Mocked<
    Pick<PdfGeneratorService, 'generatePrescriptionPdf'>
  >;
  let encryptedStore: jest.Mocked<
    Pick<
      ClinicalEncryptedStore,
      'findMedicalRecordForPatientByAppointment' | 'findPrescription'
    >
  >;
  let prescriptionRepository: { findOne: jest.Mock };
  let auditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let dataSource: DataSource;
  const previousVerificationUrl =
    environment.PRESCRIPTION_VERIFICATION_BASE_URL;

  beforeEach(() => {
    record = makeRecord();
    prescription = makePrescription();
    environment.PRESCRIPTION_VERIFICATION_BASE_URL =
      'https://portal.example.test';
    generator = {
      generatePrescriptionPdf: jest
        .fn()
        .mockResolvedValue(Buffer.from('%PDF-test')),
    };
    encryptedStore = {
      findMedicalRecordForPatientByAppointment: jest
        .fn()
        .mockImplementation(async () => record as never),
      findPrescription: jest
        .fn()
        .mockImplementation(async () => prescription as never),
    };
    prescriptionRepository = {
      findOne: jest.fn().mockImplementation(
        async ({ where }: { where: { prescriptionCode: string } }) =>
          prescription?.prescriptionCode === where.prescriptionCode
            ? { ...prescription, medicalRecord: makeRecord() }
            : null,
      ),
    };
    auditService = {
      record: jest.fn().mockResolvedValue({}),
    };
    const manager = {} as EntityManager;
    dataSource = {
      manager,
      transaction: jest.fn(async (work: (value: EntityManager) => unknown) =>
        work(manager),
      ),
      getRepository: jest.fn((entity: unknown) => {
        if (entity !== PrescriptionEntity) {
          throw new Error('Verification requested an unexpected repository.');
        }
        return prescriptionRepository;
      }),
    } as unknown as DataSource;
    service = new PrescriptionPdfService(
      dataSource,
      generator as unknown as PdfGeneratorService,
      encryptedStore as unknown as ClinicalEncryptedStore,
      auditService as unknown as AuditService,
    );
  });

  afterAll(() => {
    if (previousVerificationUrl === undefined) {
      delete environment.PRESCRIPTION_VERIFICATION_BASE_URL;
    } else {
      environment.PRESCRIPTION_VERIFICATION_BASE_URL =
        previousVerificationUrl;
    }
  });

  it('creates a deterministic SHA-256 from canonical identifiers', () => {
    expect(canonicalPrescriptionPayload('RX-1', 'doctor-1', createdAt)).toBe(
      'RX-1|doctor-1|2026-09-25T08:30:00.000Z',
    );
    const expected = createHash('sha256')
      .update('RX-1|doctor-1|2026-09-25T08:30:00.000Z', 'utf8')
      .digest('hex');
    expect(createPrescriptionHash('RX-1', 'doctor-1', createdAt)).toBe(
      expected,
    );
  });

  it('uses the exact SRS verification footer text', () => {
    expect(PRESCRIPTION_PDF_VERIFICATION_FOOTER).toBe(
      'Quét mã để đối chiếu đơn thuốc gốc tại hệ thống E-Healthcare Portal',
    );
  });

  it('loads the owned record and prescription only through the encrypted store', async () => {
    const result = await service.generateForPatient(
      'appointment-1',
      'patient-1',
      {
        actorId: 'patient-1',
        actorRole: Role.PATIENT,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        requestId: 'request-1',
      },
    );

    expect(
      encryptedStore.findMedicalRecordForPatientByAppointment,
    ).toHaveBeenCalledWith(
      dataSource.manager,
      'appointment-1',
      'patient-1',
    );
    expect(encryptedStore.findPrescription).toHaveBeenCalledWith(
      dataSource.manager,
      'record-1',
    );
    expect(dataSource.getRepository).not.toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      dataSource.manager,
      expect.objectContaining({ actorId: 'patient-1' }),
      {
        action: 'EXPORT_RX',
        resourceType: 'PRESCRIPTION',
        resourceId: 'prescription-1',
      },
    );
    expect(generator.generatePrescriptionPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        diagnosis: 'Viêm họng cấp',
        verificationUrl: expect.stringMatching(
          /^https:\/\/portal\.example\.test\/api\/v1\/clinical\/prescriptions\/RX-1\/verify\?hash=/,
        ),
        medicines: [
          expect.objectContaining({
            medicineName: 'Thuốc A',
            dosageMorning: '1 viên',
          }),
        ],
      }),
    );
    expect(result).toEqual({
      prescriptionCode: 'RX-1',
      buffer: Buffer.from('%PDF-test'),
    });
  });

  it('allows the creator of the appointment to export the prescription PDF for their dependent', async () => {
    record = makeRecord('dependent-1');
    (record.appointment as any).createdBy = 'booker-1';

    const result = await service.generateForPatient(
      'appointment-1',
      'booker-1',
      {
        actorId: 'booker-1',
        actorRole: Role.PATIENT,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        requestId: 'request-dependent',
      },
    );

    expect(result).toEqual({
      prescriptionCode: 'RX-1',
      buffer: Buffer.from('%PDF-test'),
    });
  });

  it('does not decrypt a record outside the authenticated patient scope', async () => {
    record = null;

    await expect(
      service.generateForPatient('appointment-1', 'patient-2', {
        actorId: 'patient-2',
        actorRole: Role.PATIENT,
        ipAddress: null,
        userAgent: null,
        requestId: 'request-2',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(encryptedStore.findPrescription).not.toHaveBeenCalled();
    expect(generator.generatePrescriptionPdf).not.toHaveBeenCalled();
  });

  it('rejects a missing prescription', async () => {
    prescription = null;

    await expect(
      service.generateForPatient('appointment-1', 'patient-1', {
        actorId: 'patient-1',
        actorRole: Role.PATIENT,
        ipAddress: null,
        userAgent: null,
        requestId: 'request-3',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(generator.generatePrescriptionPdf).not.toHaveBeenCalled();
  });

  it('fails closed when the prescription export audit cannot be appended', async () => {
    auditService.record.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(
      service.generateForPatient('appointment-1', 'patient-1', {
        actorId: 'patient-1',
        actorRole: Role.PATIENT,
        ipAddress: null,
        userAgent: null,
        requestId: 'request-4',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(generator.generatePrescriptionPdf).toHaveBeenCalledTimes(1);
  });

  it('keeps export patient-only and verification public', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_ROLES,
        ClinicalController.prototype.downloadPrescriptionPdf,
      ),
    ).toEqual([Role.PATIENT]);
    expect(
      Reflect.getMetadata(
        PUBLIC_ROUTE,
        ClinicalController.prototype.verifyPrescription,
      ),
    ).toBe(true);
  });

  it('verifies hashes without loading encrypted medical payloads', async () => {
    const hash = createPrescriptionHash('RX-1', 'doctor-1', createdAt);

    await expect(service.verify('RX-1', hash)).resolves.toEqual({ valid: true });
    await expect(service.verify('RX-1', '0'.repeat(64))).resolves.toEqual({
      valid: false,
    });
    await expect(service.verify('RX-1', 'not-a-hash')).resolves.toEqual({
      valid: false,
    });
    await expect(service.verify('RX-NOT-FOUND', hash)).resolves.toEqual({
      valid: false,
    });
    expect(
      encryptedStore.findMedicalRecordForPatientByAppointment,
    ).not.toHaveBeenCalled();
    expect(encryptedStore.findPrescription).not.toHaveBeenCalled();
  });

  it('generates a valid PDF buffer with the bundled Vietnamese font', async () => {
    const pdf = new PdfGeneratorService();
    const buffer = await pdf.generatePrescriptionPdf({
      prescriptionCode: 'RX-1',
      appointmentCode: 'APT-1',
      patientName: 'Nguyễn An',
      doctorName: 'Bác sĩ Bình',
      diagnosis: 'Viêm họng cấp',
      icd10Code: 'J02.9',
      secondaryIcd10Codes: 'R50.9',
      medicines: [
        {
          medicineName: 'Thuốc A',
          quantity: 10,
          unit: 'viên',
          usageInstruction: 'Uống sau ăn.',
        },
      ],
      doctorAdvice: 'Uống đủ nước.',
      followUpDate: '2026-10-02',
      createdAt: createdAt.toISOString(),
      verificationHash: 'a'.repeat(64),
      verificationUrl:
        'https://portal.example.test/api/v1/clinical/prescriptions/RX-1/verify?hash=' +
        'a'.repeat(64),
    });
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1500);
  }, 15000);
});
