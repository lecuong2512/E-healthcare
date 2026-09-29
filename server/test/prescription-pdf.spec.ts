import './test-environment';
import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { environment } from '../src/config/environment';
import {
  canonicalPrescriptionPayload,
  createPrescriptionHash,
  PrescriptionPdfService,
} from '../src/modules/clinical/prescription-pdf.service';
import { PdfGeneratorService, PRESCRIPTION_PDF_VERIFICATION_FOOTER } from '../src/modules/notification/services/pdf-generator.service';
import { MedicalRecordEntity } from '../src/database/entities/medical-record.entity';
import { PrescriptionEntity } from '../src/database/entities/prescription.entity';
import { ClinicalController } from '../src/modules/clinical/clinical.controller';
import { REQUIRED_ROLES, PUBLIC_ROUTE } from '../src/common/decorators/auth.decorators';
import { Role } from '@shared/enums';

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
    doctor: { licenseNumber: 'CCHN-1', user: { fullName: 'Bác sĩ Bình' } },
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
    items: [{
      medicineName: 'Thuốc A',
      activeIngredient: 'Hoạt chất A',
      totalQuantity: '10',
      unit: 'viên',
      dosageMorning: '1 viên',
      dosageNoon: null,
      dosageAfternoon: null,
      dosageNight: '1 viên',
      usageInstructions: 'Uống sau ăn.',
    }],
  };
}

describe('Prescription PDF export and verification', () => {
  let service: PrescriptionPdfService;
  let record: ReturnType<typeof makeRecord> | null;
  let prescription: ReturnType<typeof makePrescription> | null;
  let generator: jest.Mocked<Pick<PdfGeneratorService, 'generatePrescriptionPdf'>>;
  let recordRepository: { findOne: jest.Mock };
  let prescriptionRepository: { findOne: jest.Mock };
  const previousVerificationUrl = environment.PRESCRIPTION_VERIFICATION_BASE_URL;

  beforeEach(() => {
    record = makeRecord();
    prescription = makePrescription();
    environment.PRESCRIPTION_VERIFICATION_BASE_URL = 'https://portal.example.test';
    generator = { generatePrescriptionPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')) };
    recordRepository = { findOne: jest.fn().mockImplementation(async () => record) };
    prescriptionRepository = {
      findOne: jest.fn().mockImplementation(async ({ where }: { where: { medicalRecordId?: string; prescriptionCode?: string } }) => {
        if (where.prescriptionCode) {
          return prescription?.prescriptionCode === where.prescriptionCode
            ? { ...prescription, medicalRecord: makeRecord() }
            : null;
        }
        return prescription?.medicalRecordId === where.medicalRecordId ? prescription : null;
      }),
    };
    const dataSource = {
      getRepository: jest.fn((entity: unknown) =>
        entity === MedicalRecordEntity ? recordRepository : prescriptionRepository,
      ),
    } as unknown as DataSource;
    service = new PrescriptionPdfService(dataSource, generator as unknown as PdfGeneratorService);
  });

  afterAll(() => {
    if (previousVerificationUrl === undefined) delete environment.PRESCRIPTION_VERIFICATION_BASE_URL;
    else environment.PRESCRIPTION_VERIFICATION_BASE_URL = previousVerificationUrl;
  });

  it('creates a deterministic SHA-256 from the canonical prescription, doctor and UTC timestamp', () => {
    expect(canonicalPrescriptionPayload('RX-1', 'doctor-1', createdAt))
      .toBe('RX-1|doctor-1|2026-09-25T08:30:00.000Z');
    const expected = createHash('sha256')
      .update('RX-1|doctor-1|2026-09-25T08:30:00.000Z', 'utf8')
      .digest('hex');
    expect(createPrescriptionHash('RX-1', 'doctor-1', createdAt)).toBe(expected);
    expect(createPrescriptionHash('RX-1', 'doctor-1', createdAt)).toBe(expected);
  });

  it('uses the exact SRS verification footer text', () => {
    expect(PRESCRIPTION_PDF_VERIFICATION_FOOTER)
      .toBe('Quét mã để đối chiếu đơn thuốc gốc tại hệ thống E-Healthcare Portal');
  });

  it('builds the prescription PDF only from the authenticated patient record', async () => {
    const result = await service.generateForPatient('appointment-1', 'patient-1');
    const payload = generator.generatePrescriptionPdf.mock.calls[0][0];
    expect(recordRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { appointmentId: 'appointment-1', patientId: 'patient-1' },
    }));
    expect(payload.verificationUrl).toBe(
      `https://portal.example.test/api/v1/clinical/prescriptions/RX-1/verify?hash=${payload.verificationHash}`,
    );
    expect(payload.medicines[0]).toMatchObject({
      medicineName: 'Thuốc A',
      quantity: 10,
      dosageMorning: '1 viên',
      usageInstruction: 'Uống sau ăn.',
    });
    expect(result).toEqual({ prescriptionCode: 'RX-1', buffer: Buffer.from('%PDF-test') });
  });

  it('rejects an appointment not owned by the authenticated patient', async () => {
    record = null;
    await expect(service.generateForPatient('appointment-1', 'patient-2'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(generator.generatePrescriptionPdf).not.toHaveBeenCalled();
  });

  it('rejects a missing prescription', async () => {
    prescription = null;
    await expect(service.generateForPatient('appointment-1', 'patient-1'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('restricts PDF export to patients and keeps verification public without returning medical data', () => {
    expect(Reflect.getMetadata(REQUIRED_ROLES, ClinicalController.prototype.downloadPrescriptionPdf))
      .toEqual([Role.PATIENT]);
    expect(Reflect.getMetadata(PUBLIC_ROUTE, ClinicalController.prototype.verifyPrescription))
      .toBe(true);
  });

  it('verifies a valid hash without disclosing prescription data', async () => {
    const hash = createPrescriptionHash('RX-1', 'doctor-1', createdAt);
    await expect(service.verify('RX-1', hash)).resolves.toEqual({ valid: true });
    await expect(service.verify('RX-1', '0'.repeat(64))).resolves.toEqual({ valid: false });
    await expect(service.verify('RX-1', 'not-a-hash')).resolves.toEqual({ valid: false });
    await expect(service.verify('RX-NOT-FOUND', hash)).resolves.toEqual({ valid: false });
  });

  it('generates a valid PDF buffer with the configured Vietnamese font', async () => {
    const fontPath = environment.PDF_FONT_PATH ||
      (process.platform === 'win32' ? 'C:\\Windows\\Fonts\\arial.ttf' : undefined);
    if (!fontPath) throw new Error('Set PDF_FONT_PATH to a Vietnamese-capable TTF font to run this test.');
    environment.PDF_FONT_PATH = fontPath;
    const pdf = new PdfGeneratorService();
    const buffer = await pdf.generatePrescriptionPdf({
      prescriptionCode: 'RX-1',
      appointmentCode: 'APT-1',
      patientName: 'Nguyễn An',
      doctorName: 'Bác sĩ Bình',
      diagnosis: 'Viêm họng cấp',
      icd10Code: 'J02.9',
      secondaryIcd10Codes: 'R50.9',
      medicines: [{ medicineName: 'Thuốc A', quantity: 10, unit: 'viên', usageInstruction: 'Uống sau ăn.' }],
      doctorAdvice: 'Uống đủ nước.',
      followUpDate: '2026-10-02',
      createdAt: createdAt.toISOString(),
      verificationHash: 'a'.repeat(64),
      verificationUrl: 'https://portal.example.test/api/v1/clinical/prescriptions/RX-1/verify?hash=' + 'a'.repeat(64),
    });
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1500);
  }, 15000);
});
