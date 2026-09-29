import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Role, AppointmentStatus, AuditAction, AuditOutcome } from '@shared/enums';
import {
  DrugSafetyWarning,
  DrugSafetyCheckResult,
  MedicalRecordDetailResponse,
  VitalSigns,
  EmrClinicalSnapshot,
  EmrAddendumData,
  EmrHistoryResponse,
} from '@shared/interfaces';

import { MedicalRecordEntity } from '../../database/entities/medical-record.entity';
import { PrescriptionEntity } from '../../database/entities/prescription.entity';
import { PrescriptionItemEntity } from '../../database/entities/prescription-item.entity';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { PersonalHealthProfileEntity } from '../../database/entities/auth.entity';
import { EmrAddendumEntity } from '../../database/entities/emr-addendum.entity';
import { Icd10Service } from './icd10/icd10.service';
import { QueueEventsService } from '../realtime/queue-events.service';
import { AuditContext } from '../audit/audit-context';
import { AuditEvent, AuditService } from '../audit/audit.service';
import {
  ClinicalEncryptedStore,
  MedicalRecordAccessMetadata,
} from './clinical-encrypted.store';
import { environment } from '../../config/environment';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
  CreatePrescriptionItemDto,
  VitalSignsDto,
  PrescriptionSafetyCheckDto,
  CreateEmrAddendumDto,
} from './dto';

const CHRONIC_DISEASE_KEYWORDS = [
  'tiểu đường',
  'tieu duong',
  'đái tháo đường',
  'dai thao duong',
  'tăng huyết áp',
  'tang huyet ap',
  'huyết áp cao',
  'huyet ap cao',
  'tim mạch',
  'tim mach',
  'suy tim',
  'hen suyễn',
  'hen suyen',
  'hen phế quản',
  'hen phe quan',
  'copd',
  'gút',
  'gout',
  'thận mạn',
  'than man',
];

const ALLERGY_GROUP_MAPPINGS: Record<string, string[]> = {
  penicillin: ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin', 'oxacillin', 'cloxacillin'],
  aspirin: ['aspirin', 'acetylsalicylic acid', 'cardiopirin', 'aspilets'],
  sulfonamide: ['sulfonamide', 'sulfamethoxazole', 'bactrim', 'cotrimoxazole'],
  cephalosporin: ['cephalosporin', 'cefuroxime', 'cefalexin', 'ceftriaxone', 'cefixime'],
  nsaid: ['nsaid', 'ibuprofen', 'meloxicam', 'diclofenac', 'celecoxib'],
};

@Injectable()
export class ClinicalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly icd10Service: Icd10Service,
    private readonly queueEvents: QueueEventsService,
    @Optional() private readonly encryptedStore?: ClinicalEncryptedStore,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private async findMedicalRecord(
    id: string,
    manager?: EntityManager,
  ): Promise<MedicalRecordEntity | null> {
    if (!this.encryptedStore) {
      return manager
        ? manager.getRepository(MedicalRecordEntity).findOne({ where: { id } })
        : this.medicalRecordRepo.findOne({ where: { id } });
    }
    const activeManager = manager ?? this.dataSource.manager;
    const exists = await activeManager
      .getRepository(MedicalRecordEntity)
      .findOne({ where: { id } });
    return exists
      ? this.encryptedStore.findMedicalRecord(activeManager, id)
      : null;
  }

  private async findMedicalRecordAccessMetadata(
    id: string,
    manager?: EntityManager,
  ): Promise<MedicalRecordAccessMetadata | null> {
    if (this.encryptedStore) {
      const activeManager = manager ?? this.dataSource.manager;
      return this.encryptedStore.findMedicalRecordAccessMetadata(activeManager, id);
    }
    return manager
      ? manager.getRepository(MedicalRecordEntity).findOne({ where: { id } })
      : this.medicalRecordRepo.findOne({ where: { id } });
  }

  private async findMedicalRecordAccessMetadataByAppointment(
    appointmentId: string,
    manager?: EntityManager,
  ): Promise<MedicalRecordAccessMetadata | null> {
    if (this.encryptedStore) {
      const activeManager = manager ?? this.dataSource.manager;
      return this.encryptedStore.findMedicalRecordAccessMetadataByAppointment(
        activeManager,
        appointmentId,
      );
    }
    return manager
      ? manager
          .getRepository(MedicalRecordEntity)
          .findOne({ where: { appointmentId } })
      : this.medicalRecordRepo.findOne({ where: { appointmentId } });
  }

  private async authorizeMedicalRecordAccess(
    userId: string,
    role: Role,
    record: MedicalRecordAccessMetadata,
    manager?: EntityManager,
  ): Promise<void> {
    if (role === Role.PATIENT && record.patientId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ACCESS',
        message: 'Bạn chỉ có thể xem hồ sơ bệnh án của chính mình.',
      });
    }
    if (role === Role.DOCTOR) {
      const doctor = await this.getDoctorByUserId(userId, manager);
      if (record.doctorId !== doctor.id) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_ACCESS',
          message:
            'Bác sĩ không có quyền xem hồ sơ bệnh án của ca khám do bác sĩ khác phụ trách.',
        });
      }
    }
  }

  private async getAuthorizedMedicalRecord(
    userId: string,
    role: Role,
    metadata: MedicalRecordAccessMetadata,
    manager?: EntityManager,
    auditContext?: AuditContext,
  ): Promise<MedicalRecordDetailResponse> {
    try {
      await this.authorizeMedicalRecordAccess(userId, role, metadata, manager);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        await this.auditDeniedOrFail(auditContext, {
          action: AuditAction.VIEW_EMR,
          resourceType: 'MEDICAL_RECORD',
          resourceId: metadata.id,
        });
      }
      throw error;
    }

    const record = await this.findMedicalRecord(metadata.id, manager);
    if (!record) {
      throw new NotFoundException({
        code: 'MEDICAL_RECORD_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ bệnh án.',
      });
    }

    await this.applyLazyLockIfNeeded(record, manager);
    const prescription = await this.findPrescription(record.id, manager);
    if (manager) {
      await this.auditOrFail(manager, auditContext, {
        action: AuditAction.VIEW_EMR,
        resourceType: 'MEDICAL_RECORD',
        resourceId: record.id,
      });
    }
    return this.mapToDetailResponse(record, prescription);
  }

  private async saveMedicalRecord(
    record: MedicalRecordEntity,
    manager?: EntityManager,
  ): Promise<MedicalRecordEntity> {
    if (!this.encryptedStore) {
      return manager
        ? manager.getRepository(MedicalRecordEntity).save(record)
        : this.medicalRecordRepo.save(record);
    }
    const activeManager = manager ?? this.dataSource.manager;
    return this.encryptedStore.saveMedicalRecord(activeManager, record);
  }

  private async findPrescription(
    medicalRecordId: string,
    manager?: EntityManager,
  ): Promise<PrescriptionEntity | null> {
    if (this.encryptedStore) {
      const activeManager = manager ?? this.dataSource.manager;
      return this.encryptedStore.findPrescription(activeManager, medicalRecordId);
    }
    return manager
      ? manager.getRepository(PrescriptionEntity).findOne({
          where: { medicalRecordId },
          relations: ['items'],
        })
      : this.prescriptionRepo.findOne({
          where: { medicalRecordId },
          relations: ['items'],
        });
  }

  private async auditOrFail(
    manager: EntityManager,
    context: AuditContext | undefined,
    event: AuditEvent,
  ): Promise<void> {
    if (!this.audit || !context) {
      if (environment.NODE_ENV === 'test') return;
      throw new ServiceUnavailableException({
        code: 'AUDIT_UNAVAILABLE',
        message: 'Không thể ghi nhật ký kiểm toán cho thao tác nhạy cảm.',
      });
    }
    await this.audit.record(manager, context, event);
  }

  private async auditDeniedOrFail(
    context: AuditContext | undefined,
    event: AuditEvent,
  ): Promise<void> {
    if (!this.audit || !context) {
      if (environment.NODE_ENV === 'test') return;
      throw new ServiceUnavailableException({
        code: 'AUDIT_UNAVAILABLE',
        message: 'Không thể ghi nhật ký kiểm toán cho thao tác nhạy cảm.',
      });
    }
    await this.dataSource.transaction((manager) =>
      this.audit!.record(manager, context, {
        ...event,
        outcome: AuditOutcome.DENIED,
      }),
    );
  }

  private get medicalRecordRepo(): Repository<MedicalRecordEntity> {
    return this.dataSource.getRepository(MedicalRecordEntity);
  }

  private get prescriptionRepo(): Repository<PrescriptionEntity> {
    return this.dataSource.getRepository(PrescriptionEntity);
  }

  private get appointmentRepo(): Repository<AppointmentEntity> {
    return this.dataSource.getRepository(AppointmentEntity);
  }

  private get doctorRepo(): Repository<DoctorEntity> {
    return this.dataSource.getRepository(DoctorEntity);
  }

  private get phrRepo(): Repository<PersonalHealthProfileEntity> {
    return this.dataSource.getRepository(PersonalHealthProfileEntity);
  }

  private get emrAddendumRepo(): Repository<EmrAddendumEntity> {
    return this.dataSource.getRepository(EmrAddendumEntity);
  }

  /**
   * Automatically calculate BMI = weight(kg) / (height(m))^2.
   * Height is input in centimeters (cm).
   */
  public calculateBmi(weight: number, heightCm: number): number {
    if (!weight || !heightCm || weight <= 0 || heightCm <= 0) {
      throw new BadRequestException('Chiều cao và cân nặng phải lớn hơn 0.');
    }
    const heightM = heightCm / 100;
    const bmi = weight / (heightM * heightM);
    return Number(bmi.toFixed(2));
  }

  /**
   * Helper to parse numeric dosage from text (e.g. "1", "2 viên", "0.5").
   */
  private parseDosageNumber(dosageText?: string | null): number {
    if (!dosageText || !dosageText.trim()) return 0;
    const match = dosageText.trim().match(/^(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    return Number.isFinite(val) ? val : 0;
  }

  /**
   * Find doctor profile for the authenticated user.
   */
  public async getDoctorByUserId(
    userId: string,
    manager?: EntityManager,
  ): Promise<DoctorEntity> {
    const repo = manager
      ? manager.getRepository(DoctorEntity)
      : this.doctorRepo;
    const doctor = await repo.findOne({
      where: { userId },
      relations: ['user'],
    });
    if (!doctor) {
      throw new ForbiddenException({
        code: 'DOCTOR_PROFILE_NOT_FOUND',
        message: 'Tài khoản hiện tại không có hồ sơ bác sĩ.',
      });
    }
    return doctor;
  }

  /**
   * Check if patient has chronic condition from PHR or primary ICD-10 code.
   */
  public isPatientChronic(
    phr: PersonalHealthProfileEntity | null,
    icd10Code?: string,
  ): boolean {
    if (icd10Code && this.icd10Service.isChronicCode(icd10Code)) {
      return true;
    }
    if (phr?.chronicDiseases && phr.chronicDiseases.trim()) {
      const phrChronic = phr.chronicDiseases.toLowerCase();
      const hasMatch = CHRONIC_DISEASE_KEYWORDS.some((kw) =>
        phrChronic.includes(kw),
      );
      if (hasMatch) return true;
    }
    return false;
  }

  /**
   * Safety check endpoint with doctor authorization:
   * Doctor must be assigned to the appointment before reading patient's PHR.
   */
  public async checkPrescriptionSafetyEndpoint(
    userId: string,
    dto: PrescriptionSafetyCheckDto,
  ): Promise<DrugSafetyCheckResult> {
    const doctor = await this.getDoctorByUserId(userId);
    const appointment = await this.appointmentRepo.findOne({
      where: { id: dto.appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'Không tìm thấy ca khám.',
      });
    }

    if (appointment.doctorId !== doctor.id) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED_DOCTOR',
        message: 'Bác sĩ không được phân công phụ trách ca khám này.',
      });
    }

    return this.checkPrescriptionSafety(
      appointment.patientId,
      dto.items,
      dto.icd10PrimaryCode,
    );
  }

  /**
   * Perform drug safety checks:
   * 1. Check medicine names and active ingredients against patient PHR allergies.
   * 2. Enforce 30-day prescription limit for chronic patients.
   */
  public async checkPrescriptionSafety(
    patientId: string,
    items: CreatePrescriptionItemDto[],
    icd10PrimaryCode?: string,
    manager?: EntityManager,
  ): Promise<DrugSafetyCheckResult> {
    const phrRepo = manager
      ? manager.getRepository(PersonalHealthProfileEntity)
      : this.phrRepo;
    const phr = await phrRepo.findOne({ where: { userId: patientId } });

    const warnings: DrugSafetyWarning[] = [];

    // 1. Allergy check
    if (phr?.allergies && phr.allergies.trim()) {
      const allergyTokens = phr.allergies
        .split(/[,;\n]+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 1);

      for (const item of items) {
        const medNameLower = item.medicineName.toLowerCase();
        const activeIngLower = item.activeIngredient
          ? item.activeIngredient.toLowerCase()
          : '';

        for (const allergy of allergyTokens) {
          const matchingTerms = [allergy];
          for (const [groupKey, members] of Object.entries(ALLERGY_GROUP_MAPPINGS)) {
            if (allergy.includes(groupKey) || groupKey.includes(allergy)) {
              for (const member of members) {
                if (!matchingTerms.includes(member)) {
                  matchingTerms.push(member);
                }
              }
            }
          }

          const isMatched = matchingTerms.some(
            (term) =>
              medNameLower.includes(term) ||
              (activeIngLower && activeIngLower.includes(term)) ||
              (term.length >= 4 && term.includes(medNameLower)),
          );

          if (isMatched) {
            warnings.push({
              medicineName: item.medicineName,
              matchedAllergy: allergy,
              warningMessage: `CẢNH BÁO: Bệnh nhân có tiền sử dị ứng với "${allergy}" (trùng khớp với thuốc/hoạt chất "${item.medicineName}")!`,
            });
            break;
          }
        }
      }
    }

    // 2. Chronic disease 30-day limit check
    const isChronic = this.isPatientChronic(phr, icd10PrimaryCode);
    if (isChronic) {
      for (const item of items) {
        let daysSupply: number | null = null;

        // If explicit durationDays is provided in the API contract
        if (typeof item.durationDays === 'number' && item.durationDays > 0) {
          daysSupply = item.durationDays;
        } else {
          // Calculate from numeric dosages if available
          const morning = this.parseDosageNumber(item.dosageMorning);
          const noon = this.parseDosageNumber(item.dosageNoon);
          const afternoon = this.parseDosageNumber(item.dosageAfternoon);
          const night = this.parseDosageNumber(item.dosageNight);

          const dailyDosage = morning + noon + afternoon + night;
          if (dailyDosage > 0 && item.totalQuantity > 0) {
            daysSupply = item.totalQuantity / dailyDosage;
          }
        }

        // If daysSupply cannot be determined for a chronic patient, do NOT silently bypass!
        if (daysSupply === null) {
          throw new BadRequestException({
            code: 'CHRONIC_PRESCRIPTION_DURATION_UNDETERMINED',
            message: `Đối với bệnh nhân mạn tính, liều dùng hàng ngày hoặc số ngày dùng thuốc (durationDays) cho thuốc "${item.medicineName}" phải được xác định rõ ràng để tuân thủ quy định tối đa 30 ngày (Thông tư 52/2017/TT-BYT).`,
          });
        }

        if (daysSupply > 30) {
          throw new BadRequestException({
            code: 'CHRONIC_PRESCRIPTION_EXCEEDED_30_DAYS',
            message: `Đơn thuốc cho bệnh nhân mạn tính không được vượt quá 30 ngày (thuốc "${item.medicineName}" có thời gian sử dụng ước tính ${Math.ceil(daysSupply)} ngày) theo quy định Thông tư 52/2017/TT-BYT.`,
          });
        }
      }
    }

    return {
      hasWarning: warnings.length > 0,
      warnings,
    };
  }

  /**
   * Request-time 24-hour lazy locking check.
   * If completedAt + 24 hours <= now, lazily updates isLocked=true and rejects modifications.
   */
  public async ensureEmrEditable(
    record: MedicalRecordEntity,
    doctorId: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (record.doctorId !== doctorId) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED_DOCTOR',
        message: 'Bạn không có quyền thao tác trên hồ sơ bệnh án này.',
      });
    }

    const now = new Date();

    if (record.isLocked) {
      throw new BadRequestException({
        code: 'EMR_LOCKED',
        message:
          'Bệnh án đã bị khóa sau 24 giờ kể từ khi hoàn tất ca khám, không thể chỉnh sửa trực tiếp. Vui lòng tạo Phụ lục bệnh án (EMR Addendum).',
      });
    }

    if (record.completedAt) {
      const completedTime = new Date(record.completedAt).getTime();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      if (now.getTime() - completedTime >= twentyFourHoursMs) {
        record.isLocked = true;
        record.lockedAt = new Date(completedTime + twentyFourHoursMs);
        const repo = manager
          ? manager.getRepository(MedicalRecordEntity)
          : this.medicalRecordRepo;
        await repo.save(record);

        throw new BadRequestException({
          code: 'EMR_LOCKED',
          message:
            'Bệnh án đã bị khóa sau 24 giờ kể từ khi hoàn tất ca khám, không thể chỉnh sửa trực tiếp. Vui lòng tạo Phụ lục bệnh án (EMR Addendum).',
        });
      }
    }
  }

  /**
   * Lazily check and update record lock status for read operations.
   */
  private async applyLazyLockIfNeeded(
    record: MedicalRecordEntity,
    manager?: EntityManager,
  ): Promise<MedicalRecordEntity> {
    if (!record.isLocked && record.completedAt) {
      const completedTime = new Date(record.completedAt).getTime();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      if (Date.now() - completedTime >= twentyFourHoursMs) {
        record.isLocked = true;
        record.lockedAt = new Date(completedTime + twentyFourHoursMs);
        if (this.encryptedStore) {
          await this.saveMedicalRecord(record, manager);
        } else if (manager) {
          await manager.getRepository(MedicalRecordEntity).save(record);
        } else {
          await this.medicalRecordRepo.save(record);
        }
      }
    }
    return record;
  }

  /**
   * Generate prescription code: RX-YYYYMMDD-XXXX (uppercase hex)
   */
  private generatePrescriptionCode(): string {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = randomBytes(2).toString('hex').toUpperCase();
    return `RX-${today}-${randomHex}`;
  }

  /**
   * Format vital signs entity object with automatically computed BMI.
   */
  private buildVitalSigns(input: VitalSignsDto): VitalSigns {
    const bmi = this.calculateBmi(input.weight, input.height);
    return {
      bloodPressure: input.bloodPressure,
      pulse: input.pulse,
      temperature: input.temperature,
      respiratoryRate: input.respiratoryRate,
      weight: input.weight,
      height: input.height,
      bmi,
    };
  }

  /**
   * Create or Save Draft EMR
   */
  async createMedicalRecord(
    userId: string,
    dto: CreateMedicalRecordDto,
    auditContext?: AuditContext,
  ): Promise<MedicalRecordDetailResponse> {
    return this.dataSource.transaction(async (manager) => {
      const doctor = await this.getDoctorByUserId(userId, manager);

      const appointmentRepo = manager.getRepository(AppointmentEntity);
      const appointment = await appointmentRepo.findOne({
        where: { id: dto.appointmentId },
      });

      if (!appointment) {
        throw new NotFoundException({
          code: 'APPOINTMENT_NOT_FOUND',
          message: 'Không tìm thấy ca khám.',
        });
      }

      if (appointment.doctorId !== doctor.id) {
        throw new ForbiddenException({
          code: 'UNAUTHORIZED_DOCTOR',
          message: 'Bác sĩ không được phân công phụ trách ca khám này.',
        });
      }

      // Precondition per SRS-DOC-03: Ca khám đang ở trạng thái IN_CONSULTATION.
      if (appointment.status !== AppointmentStatus.IN_CONSULTATION) {
        throw new BadRequestException({
          code: 'INVALID_APPOINTMENT_STATUS',
          message:
            'Chỉ có thể ghi nhận hồ sơ bệnh án khi ca khám đang ở trạng thái đang khám (IN_CONSULTATION).',
        });
      }

      const medicalRecordRepo = manager.getRepository(MedicalRecordEntity);
      const existingRecord = await medicalRecordRepo.findOne({
        where: { appointmentId: dto.appointmentId },
      });

      if (existingRecord) {
        throw new ConflictException({
          code: 'MEDICAL_RECORD_ALREADY_EXISTS',
          message:
            'Hồ sơ bệnh án cho ca khám này đã tồn tại. Vui lòng cập nhật thay vì tạo mới.',
        });
      }

      // Drug safety check if prescription items are present
      let safetyResult: DrugSafetyCheckResult = {
        hasWarning: false,
        warnings: [],
      };
      if (dto.prescriptionItems && dto.prescriptionItems.length > 0) {
        safetyResult = await this.checkPrescriptionSafety(
          appointment.patientId,
          dto.prescriptionItems,
          dto.icd10PrimaryCode,
          manager,
        );
      }

      const vitalSigns = this.buildVitalSigns(dto.vitalSigns);

      const recordInput = {
        appointmentId: dto.appointmentId,
        patientId: appointment.patientId,
        doctorId: doctor.id,
        vitalSigns: vitalSigns as unknown as Record<string, number>,
        clinicalNotes: dto.clinicalNotes,
        icd10PrimaryCode: dto.icd10PrimaryCode.trim().toUpperCase(),
        icd10SecondaryCodes: dto.icd10SecondaryCodes
          ? dto.icd10SecondaryCodes.trim()
          : null,
        doctorAdvice: dto.doctorAdvice ? dto.doctorAdvice.trim() : null,
        followUpDate: dto.followUpDate || null,
        isLocked: false,
        lockedAt: null,
        completedAt: null,
      };

      const savedRecord = this.encryptedStore
        ? await this.encryptedStore.insertMedicalRecord(manager, recordInput)
        : await medicalRecordRepo.save(medicalRecordRepo.create(recordInput));

      let savedPrescription: PrescriptionEntity | null = null;
      if (dto.prescriptionItems && dto.prescriptionItems.length > 0) {
        const prescriptionRepo = manager.getRepository(PrescriptionEntity);
        const prescription = prescriptionRepo.create({
          medicalRecordId: savedRecord.id,
          prescriptionCode: this.generatePrescriptionCode(),
        });
        savedPrescription = await prescriptionRepo.save(prescription);

        if (this.encryptedStore) {
          savedPrescription.items = await this.encryptedStore.replacePrescriptionItems(
            manager,
            savedPrescription.id,
            dto.prescriptionItems,
          );
        } else {
          const prescriptionItemRepo = manager.getRepository(PrescriptionItemEntity);
          const items = dto.prescriptionItems.map((itemDto) =>
            prescriptionItemRepo.create({
              prescriptionId: savedPrescription!.id,
              medicineName: itemDto.medicineName.trim(),
              activeIngredient: itemDto.activeIngredient?.trim() || null,
              dosageMorning: itemDto.dosageMorning?.trim() || null,
              dosageNoon: itemDto.dosageNoon?.trim() || null,
              dosageAfternoon: itemDto.dosageAfternoon?.trim() || null,
              dosageNight: itemDto.dosageNight?.trim() || null,
              totalQuantity: itemDto.totalQuantity,
              unit: itemDto.unit.trim(),
              usageInstructions: itemDto.usageInstructions?.trim() || null,
            }),
          );
          savedPrescription.items = await prescriptionItemRepo.save(items);
        }
      }

      await this.auditOrFail(manager, auditContext, {
        action: AuditAction.CREATE_EMR,
        resourceType: 'MEDICAL_RECORD',
        resourceId: savedRecord.id,
        metadata: { hasPrescription: Boolean(savedPrescription) },
      });
      if (savedPrescription) {
        await this.auditOrFail(manager, auditContext, {
          action: AuditAction.UPDATE_RX,
          resourceType: 'PRESCRIPTION',
          resourceId: savedPrescription.id,
          metadata: { operation: 'CREATE' },
        });
      }

      return this.mapToDetailResponse(
        savedRecord,
        savedPrescription,
        safetyResult.warnings,
      );
    });
  }

  /**
   * Update Draft or Within-24h EMR
   */
  async updateMedicalRecord(
    userId: string,
    recordId: string,
    dto: UpdateMedicalRecordDto,
    auditContext?: AuditContext,
  ): Promise<MedicalRecordDetailResponse> {
    return this.dataSource.transaction(async (manager) => {
      const doctor = await this.getDoctorByUserId(userId, manager);
      const medicalRecordRepo = manager.getRepository(MedicalRecordEntity);

      const metadata = await this.findMedicalRecordAccessMetadata(recordId, manager);
      if (!metadata) {
        throw new NotFoundException({
          code: 'MEDICAL_RECORD_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ bệnh án.',
        });
      }
      if (metadata.doctorId !== doctor.id) {
        await this.auditDeniedOrFail(auditContext, {
          action: AuditAction.UPDATE_EMR,
          resourceType: 'MEDICAL_RECORD',
          resourceId: metadata.id,
        });
        throw new ForbiddenException({
          code: 'UNAUTHORIZED_DOCTOR',
          message: 'Bác sĩ không có quyền chỉnh sửa hồ sơ bệnh án này.',
        });
      }
      const record = this.encryptedStore
        ? await this.findMedicalRecord(recordId, manager)
        : await medicalRecordRepo.findOne({ where: { id: recordId } });
      if (!record) {
        throw new NotFoundException({
          code: 'MEDICAL_RECORD_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ bệnh án.',
        });
      }

      await this.ensureEmrEditable(record, doctor.id, manager);

      if (dto.vitalSigns) {
        record.vitalSigns = this.buildVitalSigns(
          dto.vitalSigns,
        ) as unknown as Record<string, number>;
      }
      if (dto.clinicalNotes !== undefined) {
        record.clinicalNotes = dto.clinicalNotes;
      }
      if (dto.icd10PrimaryCode !== undefined) {
        record.icd10PrimaryCode = dto.icd10PrimaryCode.trim().toUpperCase();
      }
      if (dto.icd10SecondaryCodes !== undefined) {
        record.icd10SecondaryCodes = dto.icd10SecondaryCodes
          ? dto.icd10SecondaryCodes.trim()
          : null;
      }
      if (dto.doctorAdvice !== undefined) {
        record.doctorAdvice = dto.doctorAdvice ? dto.doctorAdvice.trim() : null;
      }
      if (dto.followUpDate !== undefined) {
        record.followUpDate = dto.followUpDate || null;
      }

      const savedRecord = this.encryptedStore
        ? await this.saveMedicalRecord(record, manager)
        : await medicalRecordRepo.save(record);

      let safetyResult: DrugSafetyCheckResult = {
        hasWarning: false,
        warnings: [],
      };

      const prescriptionRepo = manager.getRepository(PrescriptionEntity);
      const prescriptionItemRepo =
        manager.getRepository(PrescriptionItemEntity);

      let prescription = await this.findPrescription(record.id, manager);

      if (dto.prescriptionItems !== undefined) {
        if (dto.prescriptionItems.length > 0) {
          safetyResult = await this.checkPrescriptionSafety(
            record.patientId,
            dto.prescriptionItems,
            record.icd10PrimaryCode,
            manager,
          );

          if (!prescription) {
            prescription = prescriptionRepo.create({
              medicalRecordId: record.id,
              prescriptionCode: this.generatePrescriptionCode(),
            });
            prescription = await prescriptionRepo.save(prescription);
          }

          if (this.encryptedStore) {
            prescription.items = await this.encryptedStore.replacePrescriptionItems(
              manager,
              prescription.id,
              dto.prescriptionItems,
            );
          } else {
            await prescriptionItemRepo.delete({ prescriptionId: prescription.id });
            const items = dto.prescriptionItems.map((itemDto) =>
              prescriptionItemRepo.create({
                prescriptionId: prescription!.id,
                medicineName: itemDto.medicineName.trim(),
                activeIngredient: itemDto.activeIngredient?.trim() || null,
                dosageMorning: itemDto.dosageMorning?.trim() || null,
                dosageNoon: itemDto.dosageNoon?.trim() || null,
                dosageAfternoon: itemDto.dosageAfternoon?.trim() || null,
                dosageNight: itemDto.dosageNight?.trim() || null,
                totalQuantity: itemDto.totalQuantity,
                unit: itemDto.unit.trim(),
                usageInstructions: itemDto.usageInstructions?.trim() || null,
              }),
            );
            prescription.items = await prescriptionItemRepo.save(items);
          }
        } else if (prescription) {
          await prescriptionItemRepo.delete({
            prescriptionId: prescription.id,
          });
          prescription.items = [];
        }
      }

      await this.auditOrFail(manager, auditContext, {
        action: AuditAction.UPDATE_EMR,
        resourceType: 'MEDICAL_RECORD',
        resourceId: record.id,
        metadata: { operation: 'UPDATE' },
      });
      if (dto.prescriptionItems !== undefined) {
        await this.auditOrFail(manager, auditContext, {
          action: AuditAction.UPDATE_RX,
          resourceType: 'PRESCRIPTION',
          resourceId: prescription?.id ?? record.id,
          metadata: {
            operation: dto.prescriptionItems.length ? 'REPLACE' : 'CLEAR',
          },
        });
      }

      return this.mapToDetailResponse(
        savedRecord,
        prescription,
        safetyResult.warnings,
      );
    });
  }

  /**
   * Complete consultation: sets status COMPLETED and records completed_at.
   */
  async completeConsultation(
    userId: string,
    recordId: string,
    auditContext?: AuditContext,
  ): Promise<MedicalRecordDetailResponse> {
    const result = await this.dataSource.transaction(async (manager) => {
      const doctor = await this.getDoctorByUserId(userId, manager);
      const medicalRecordRepo = manager.getRepository(MedicalRecordEntity);
      const appointmentRepo = manager.getRepository(AppointmentEntity);

      const metadata = await this.findMedicalRecordAccessMetadata(recordId, manager);
      if (!metadata) {
        throw new NotFoundException({
          code: 'MEDICAL_RECORD_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ bệnh án.',
        });
      }
      if (metadata.doctorId !== doctor.id) {
        await this.auditDeniedOrFail(auditContext, {
          action: AuditAction.UPDATE_EMR,
          resourceType: 'MEDICAL_RECORD',
          resourceId: metadata.id,
        });
        throw new ForbiddenException({
          code: 'UNAUTHORIZED_DOCTOR',
          message: 'Bác sĩ không có quyền hoàn tất hồ sơ bệnh án này.',
        });
      }
      const record = this.encryptedStore
        ? await this.findMedicalRecord(recordId, manager)
        : await medicalRecordRepo.findOne({ where: { id: recordId } });
      if (!record) {
        throw new NotFoundException({
          code: 'MEDICAL_RECORD_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ bệnh án.',
        });
      }

      await this.ensureEmrEditable(record, doctor.id, manager);

      const appointment = await appointmentRepo.findOne({
        where: { id: record.appointmentId },
      });

      if (!appointment) {
        throw new NotFoundException({
          code: 'APPOINTMENT_NOT_FOUND',
          message: 'Không tìm thấy ca khám liên kết.',
        });
      }

      if (appointment.status !== AppointmentStatus.IN_CONSULTATION) {
        throw new BadRequestException({
          code: 'INVALID_APPOINTMENT_STATUS',
          message:
            'Chỉ có thể hoàn tất ca khám khi lịch hẹn đang ở trạng thái đang khám (IN_CONSULTATION).',
        });
      }

      const now = new Date();
      record.completedAt = now;
      appointment.status = AppointmentStatus.COMPLETED;
      appointment.completedAt = now;

      await appointmentRepo.save(appointment);
      const savedRecord = this.encryptedStore
        ? await this.saveMedicalRecord(record, manager)
        : await medicalRecordRepo.save(record);

      const prescription = await this.findPrescription(record.id, manager);

      await this.auditOrFail(manager, auditContext, {
        action: AuditAction.UPDATE_EMR,
        resourceType: 'MEDICAL_RECORD',
        resourceId: record.id,
        metadata: { operation: 'COMPLETE' },
      });

      return this.mapToDetailResponse(savedRecord, prescription);
    });
    await this.queueEvents.statusChanged(
      result.appointmentId,
      AppointmentStatus.IN_CONSULTATION,
      'CLINICAL_COMPLETION',
    );
    return result;
  }

  /**
   * Get medical record by ID with role-based access control and lazy lock evaluation.
   */
  async getMedicalRecord(
    userId: string,
    role: Role,
    recordId: string,
    auditContext?: AuditContext,
  ): Promise<MedicalRecordDetailResponse> {
    if (role === Role.ADMIN) {
      await this.auditDeniedOrFail(auditContext, {
        action: AuditAction.VIEW_EMR,
        resourceType: 'MEDICAL_RECORD',
        resourceId: recordId,
      });
      throw new ForbiddenException({
        code: 'FORBIDDEN_ACCESS',
        message: 'Quản trị viên không có quyền xem nội dung hồ sơ bệnh án.',
      });
    }

    const work = async (manager?: EntityManager) => {
      const metadata = await this.findMedicalRecordAccessMetadata(recordId, manager);
      if (!metadata) {
        throw new NotFoundException({
          code: 'MEDICAL_RECORD_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ bệnh án.',
        });
      }
      return this.getAuthorizedMedicalRecord(
        userId,
        role,
        metadata,
        manager,
        auditContext,
      );
    };

    return auditContext
      ? this.dataSource.transaction((manager) => work(manager))
      : work();
  }

  /**
   * Get medical record by appointment ID.
   */
  async getMedicalRecordByAppointment(
    userId: string,
    role: Role,
    appointmentId: string,
    auditContext?: AuditContext,
  ): Promise<MedicalRecordDetailResponse> {
    if (role === Role.ADMIN) {
      await this.auditDeniedOrFail(auditContext, {
        action: AuditAction.VIEW_EMR,
        resourceType: 'APPOINTMENT',
        resourceId: appointmentId,
      });
      throw new ForbiddenException({
        code: 'FORBIDDEN_ACCESS',
        message: 'Quản trị viên không có quyền xem nội dung hồ sơ bệnh án.',
      });
    }
    const work = async (manager?: EntityManager) => {
      const metadata = await this.findMedicalRecordAccessMetadataByAppointment(
        appointmentId,
        manager,
      );
      if (!metadata) {
        throw new NotFoundException({
          code: 'MEDICAL_RECORD_NOT_FOUND',
          message: 'Không tìm thấy hồ sơ bệnh án cho ca khám này.',
        });
      }
      return this.getAuthorizedMedicalRecord(
        userId,
        role,
        metadata,
        manager,
        auditContext,
      );
    };

    return auditContext
      ? this.dataSource.transaction((manager) => work(manager))
      : work();
  }

  /**
   * Helper to map entities to response DTO format.
   */
  private mapToDetailResponse(
    record: MedicalRecordEntity,
    prescription?: PrescriptionEntity | null,
    warnings?: DrugSafetyWarning[],
  ): MedicalRecordDetailResponse {
    const vitals = record.vitalSigns as unknown as VitalSigns;

    return {
      id: record.id,
      appointmentId: record.appointmentId,
      patientId: record.patientId,
      doctorId: record.doctorId,
      vitalSigns: {
        bloodPressure: vitals?.bloodPressure || '',
        pulse: Number(vitals?.pulse || 0),
        temperature: Number(vitals?.temperature || 0),
        respiratoryRate: Number(vitals?.respiratoryRate || 0),
        weight: Number(vitals?.weight || 0),
        height: Number(vitals?.height || 0),
        bmi: Number(vitals?.bmi || 0),
      },
      clinicalNotes: record.clinicalNotes,
      icd10PrimaryCode: record.icd10PrimaryCode,
      icd10SecondaryCodes: record.icd10SecondaryCodes,
      doctorAdvice: record.doctorAdvice,
      followUpDate: record.followUpDate,
      isLocked: record.isLocked,
      lockedAt: record.lockedAt ? record.lockedAt.toISOString() : null,
      completedAt: record.completedAt ? record.completedAt.toISOString() : null,
      prescription: prescription
        ? {
            id: prescription.id,
            medicalRecordId: prescription.medicalRecordId,
            prescriptionCode: prescription.prescriptionCode,
            createdAt: prescription.createdAt
              ? prescription.createdAt.toISOString()
              : new Date().toISOString(),
            items: (prescription.items || []).map((item) => ({
              id: item.id,
              prescriptionId: item.prescriptionId,
              medicineName: item.medicineName,
              activeIngredient: item.activeIngredient,
              dosageMorning: item.dosageMorning,
              dosageNoon: item.dosageNoon,
              dosageAfternoon: item.dosageAfternoon,
              dosageNight: item.dosageNight,
              totalQuantity: Number(item.totalQuantity),
              unit: item.unit,
              usageInstructions: item.usageInstructions,
            })),
          }
        : null,
      warnings: warnings && warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Helper to extract a full clinical snapshot from a MedicalRecordEntity.
   */
  public extractClinicalSnapshot(
    record: MedicalRecordEntity,
  ): EmrClinicalSnapshot {
    const vitals = record.vitalSigns as unknown as VitalSigns;
    return {
      clinicalNotes: record.clinicalNotes,
      doctorAdvice: record.doctorAdvice,
      icd10PrimaryCode: record.icd10PrimaryCode,
      icd10SecondaryCodes: record.icd10SecondaryCodes,
      followUpDate: record.followUpDate ? String(record.followUpDate) : null,
      vitalSigns: vitals
        ? {
            bloodPressure: vitals.bloodPressure || '',
            pulse: Number(vitals.pulse || 0),
            temperature: Number(vitals.temperature || 0),
            respiratoryRate: Number(vitals.respiratoryRate || 0),
            weight: Number(vitals.weight || 0),
            height: Number(vitals.height || 0),
            bmi: Number(vitals.bmi || 0),
          }
        : null,
    };
  }

  /**
   * Create EMR Addendum after 24-hour lock.
   * Original medical_records row is NEVER mutated.
   * Full snapshot semantics:
   * previous_content = full clinical snapshot immediately before Addendum
   * updated_content = full clinical snapshot after applying Addendum
   */
  async createEmrAddendum(
    userId: string,
    recordId: string,
    dto: CreateEmrAddendumDto,
    auditContext?: AuditContext,
    transactionManager?: EntityManager,
  ): Promise<EmrAddendumData> {
    if (auditContext && !transactionManager) {
      return this.dataSource.transaction((manager) =>
        this.createEmrAddendum(userId, recordId, dto, auditContext, manager),
      );
    }
    const doctor = await this.getDoctorByUserId(userId, transactionManager);

    const metadata = await this.findMedicalRecordAccessMetadata(
      recordId,
      transactionManager,
    );
    if (!metadata) {
      throw new NotFoundException({
        code: 'MEDICAL_RECORD_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ bệnh án.',
      });
    }
    if (metadata.doctorId !== doctor.id) {
      await this.auditDeniedOrFail(auditContext, {
        action: AuditAction.CREATE_EMR_ADDENDUM,
        resourceType: 'MEDICAL_RECORD',
        resourceId: metadata.id,
      });
      throw new ForbiddenException({
        code: 'UNAUTHORIZED_DOCTOR',
        message: 'Bác sĩ không có quyền tạo phụ lục cho hồ sơ bệnh án này.',
      });
    }
    const record = this.encryptedStore
      ? await this.findMedicalRecord(recordId, transactionManager)
      : await this.medicalRecordRepo.findOne({ where: { id: recordId } });
    if (!record) {
      throw new NotFoundException({
        code: 'MEDICAL_RECORD_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ bệnh án.',
      });
    }

    // Lazy lock evaluation: lock if 24 hours have elapsed since completedAt
    await this.applyLazyLockIfNeeded(record, transactionManager);

    if (!record.isLocked) {
      throw new BadRequestException({
        code: 'EMR_NOT_LOCKED',
        message:
          'Hồ sơ bệnh án chưa bị khóa (chưa đủ 24 giờ sau khi hoàn tất ca khám). Vui lòng chỉnh sửa trực tiếp trên bệnh án.',
      });
    }

    // Full snapshot chaining:
    const existingAddendums = this.encryptedStore
      ? await this.encryptedStore.findAddendums(
          transactionManager ?? this.dataSource.manager,
          record.id,
        )
      : await this.emrAddendumRepo.find({
          where: { medicalRecordId: record.id },
          order: { createdAt: 'ASC', id: 'ASC' },
        });

    const previousContent: EmrClinicalSnapshot =
      existingAddendums.length > 0
        ? existingAddendums[existingAddendums.length - 1].updatedContent
        : this.extractClinicalSnapshot(record);

    const updatedContent: EmrClinicalSnapshot = {
      ...previousContent,
      vitalSigns: previousContent.vitalSigns
        ? { ...previousContent.vitalSigns }
        : null,
    };

    if (dto.clinicalNotes !== undefined) {
      updatedContent.clinicalNotes = dto.clinicalNotes;
    }
    if (dto.doctorAdvice !== undefined) {
      updatedContent.doctorAdvice = dto.doctorAdvice
        ? dto.doctorAdvice.trim()
        : null;
    }
    if (dto.icd10SecondaryCodes !== undefined) {
      updatedContent.icd10SecondaryCodes = dto.icd10SecondaryCodes
        ? dto.icd10SecondaryCodes.trim()
        : null;
    }
    if (dto.followUpDate !== undefined) {
      updatedContent.followUpDate = dto.followUpDate
        ? String(dto.followUpDate)
        : null;
    }

    const addendumInput = {
      medicalRecordId: record.id,
      doctorId: doctor.id,
      reason: dto.reason.trim(),
      previousContent,
      updatedContent,
    };
    const savedAddendum = this.encryptedStore
      ? await this.encryptedStore.insertAddendum(
          transactionManager ?? this.dataSource.manager,
          addendumInput,
        )
      : await this.emrAddendumRepo.save(
          this.emrAddendumRepo.create(addendumInput),
        );

    if (transactionManager) {
      await this.auditOrFail(transactionManager, auditContext, {
        action: AuditAction.CREATE_EMR_ADDENDUM,
        resourceType: 'MEDICAL_RECORD',
        resourceId: record.id,
        metadata: { addendumId: savedAddendum.id },
      });
    }

    return {
      id: savedAddendum.id,
      medicalRecordId: savedAddendum.medicalRecordId,
      doctorId: savedAddendum.doctorId,
      doctorName: doctor.user?.fullName,
      doctorLicenseNumber: doctor.licenseNumber || null,
      reason: savedAddendum.reason,
      previousContent: savedAddendum.previousContent,
      updatedContent: savedAddendum.updatedContent,
      createdAt: savedAddendum.createdAt
        ? savedAddendum.createdAt.toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * Get complete EMR History with all Addendums in chronological order.
   * Authorization:
   * - DOCTOR: only responsible doctor (record.doctorId === doctor.id)
   * - PATIENT: only owning patient (record.patientId === userId)
   * - ADMIN: 403 Forbidden
   */
  async getEmrHistory(
    userId: string,
    role: Role,
    recordId: string,
    auditContext?: AuditContext,
    transactionManager?: EntityManager,
  ): Promise<EmrHistoryResponse> {
    if (role === Role.ADMIN) {
      await this.auditDeniedOrFail(auditContext, {
        action: AuditAction.VIEW_EMR,
        resourceType: 'MEDICAL_RECORD',
        resourceId: recordId,
        metadata: { view: 'HISTORY' },
      });
      throw new ForbiddenException({
        code: 'FORBIDDEN_ACCESS',
        message: 'Quản trị viên không có quyền truy cập lịch sử hồ sơ bệnh án.',
      });
    }

    if (auditContext && !transactionManager) {
      return this.dataSource.transaction((manager) =>
        this.getEmrHistory(userId, role, recordId, auditContext, manager),
      );
    }

    const metadata = await this.findMedicalRecordAccessMetadata(
      recordId,
      transactionManager,
    );
    if (!metadata) {
      throw new NotFoundException({
        code: 'MEDICAL_RECORD_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ bệnh án.',
      });
    }
    try {
      await this.authorizeMedicalRecordAccess(
        userId,
        role,
        metadata,
        transactionManager,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        await this.auditDeniedOrFail(auditContext, {
          action: AuditAction.VIEW_EMR,
          resourceType: 'MEDICAL_RECORD',
          resourceId: metadata.id,
          metadata: { view: 'HISTORY' },
        });
      }
      throw error;
    }
    const record = this.encryptedStore
      ? await this.findMedicalRecord(recordId, transactionManager)
      : await this.medicalRecordRepo.findOne({ where: { id: recordId } });
    if (!record) {
      throw new NotFoundException({
        code: 'MEDICAL_RECORD_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ bệnh án.',
      });
    }

    await this.applyLazyLockIfNeeded(record, transactionManager);

    const addendums = this.encryptedStore
      ? await this.encryptedStore.findAddendums(
          transactionManager ?? this.dataSource.manager,
          record.id,
          true,
        )
      : await this.emrAddendumRepo.find({
          where: { medicalRecordId: record.id },
          relations: ['doctor', 'doctor.user'],
          order: { createdAt: 'ASC', id: 'ASC' },
        });

    if (transactionManager) {
      await this.auditOrFail(transactionManager, auditContext, {
        action: AuditAction.VIEW_EMR,
        resourceType: 'MEDICAL_RECORD',
        resourceId: record.id,
        metadata: { view: 'HISTORY' },
      });
    }

    const originalSnapshot = this.extractClinicalSnapshot(record);
    const currentSnapshot =
      addendums.length > 0
        ? addendums[addendums.length - 1].updatedContent
        : originalSnapshot;

    return {
      recordId: record.id,
      appointmentId: record.appointmentId,
      patientId: record.patientId,
      doctorId: record.doctorId,
      isLocked: record.isLocked,
      lockedAt: record.lockedAt ? record.lockedAt.toISOString() : null,
      completedAt: record.completedAt ? record.completedAt.toISOString() : null,
      originalSnapshot,
      currentSnapshot,
      addendums: addendums.map((a) => ({
        id: a.id,
        medicalRecordId: a.medicalRecordId,
        doctorId: a.doctorId,
        doctorName: a.doctor?.user?.fullName || undefined,
        doctorLicenseNumber: a.doctor?.licenseNumber || null,
        reason: a.reason,
        previousContent: a.previousContent,
        updatedContent: a.updatedContent,
        createdAt: a.createdAt
          ? a.createdAt.toISOString()
          : new Date().toISOString(),
      })),
    };
  }
}
