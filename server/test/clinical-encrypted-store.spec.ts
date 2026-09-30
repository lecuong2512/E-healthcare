import './test-environment';
import { EntityManager } from 'typeorm';
import { MedicalRecordEntity } from '../src/database/entities/medical-record.entity';
import { ClinicalEncryptedStore } from '../src/modules/clinical/clinical-encrypted.store';

describe('ClinicalEncryptedStore patient-scoped reads', () => {
  const appointmentId = 'appointment-1';
  const patientId = 'patient-1';

  function createSubject(record: MedicalRecordEntity | null) {
    const recordRepository = {
      findOne: jest.fn().mockResolvedValue(record),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity !== MedicalRecordEntity) {
          throw new Error('Unexpected repository requested.');
        }
        return recordRepository;
      }),
      query: jest.fn().mockResolvedValue([
        {
          clinical_notes: 'Viêm họng cấp',
          vital_signs: JSON.stringify({ pulse: 72 }),
        },
      ]),
    } as unknown as EntityManager;

    return {
      manager,
      query: manager.query as jest.Mock,
      recordRepository,
      store: new ClinicalEncryptedStore(),
    };
  }

  it('filters by appointment and patient before decrypting the medical record', async () => {
    const record = {
      id: 'record-1',
      appointmentId,
      patientId,
      doctorId: 'doctor-1',
      encryptionKeyVersion: 1,
    } as MedicalRecordEntity;
    const { manager, query, recordRepository, store } = createSubject(record);

    const result = await store.findMedicalRecordForPatientByAppointment(
      manager,
      appointmentId,
      patientId,
    );

    expect(recordRepository.findOne).toHaveBeenCalledWith({
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
    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      clinicalNotes: 'Viêm họng cấp',
      vitalSigns: { pulse: 72 },
    });
  });

  it('does not decrypt when the patient-scoped lookup finds no record', async () => {
    const { manager, query, store } = createSubject(null);

    await expect(
      store.findMedicalRecordForPatientByAppointment(
        manager,
        appointmentId,
        'another-patient',
      ),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
