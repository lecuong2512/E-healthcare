import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Role, AppointmentStatus } from '@shared/enums';
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

@Injectable()
export class ClinicalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly icd10Service: Icd10Service,
  ) {}

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
          if (
            medNameLower.includes(allergy) ||
            (activeIngLower && activeIngLower.includes(allergy)) ||
            (allergy.length >= 4 && allergy.includes(medNameLower))
          ) {
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
  ): Promise<MedicalRecordEntity> {
    if (!record.isLocked && record.completedAt) {
      const completedTime = new Date(record.completedAt).getTime();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      if (Date.now() - completedTime >= twentyFourHoursMs) {
        record.isLocked = true;
        record.lockedAt = new Date(completedTime + twentyFourHoursMs);
        await this.medicalRecordRepo.save(record);
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

      const newRecord = medicalRecordRepo.create({
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
      });

      const savedRecord = await medicalRecordRepo.save(newRecord);

      let savedPrescription: PrescriptionEntity | null = null;
      if (dto.prescriptionItems && dto.prescriptionItems.length > 0) {
        const prescriptionRepo = manager.getRepository(PrescriptionEntity);
        const prescriptionItemRepo =
          manager.getRepository(PrescriptionItemEntity);

        const prescription = prescriptionRepo.create({
          medicalRecordId: savedRecord.id,
          prescriptionCode: this.generatePrescriptionCode(),
        });
        savedPrescription = await prescriptionRepo.save(prescription);

        const items = dto.prescriptionItems.map((itemDto) =>
          prescriptionItemRepo.create({
            prescriptionId: savedPrescription!.id,
            medicineName: itemDto.medicineName.trim(),
            activeIngredient: itemDto.activeIngredient
              ? itemDto.activeIngredient.trim()
              : null,
            dosageMorning: itemDto.dosageMorning
              ? itemDto.dosageMorning.trim()
              : null,
            dosageNoon: itemDto.dosageNoon ? itemDto.dosageNoon.trim() : null,
            dosageAfternoon: itemDto.dosageAfternoon
              ? itemDto.dosageAfternoon.trim()
              : null,
            dosageNight: itemDto.dosageNight ? itemDto.dosageNight.trim() : null,
            totalQuantity: itemDto.totalQuantity,
            unit: itemDto.unit.trim(),
            usageInstructions: itemDto.usageInstructions
              ? itemDto.usageInstructions.trim()
              : null,
          }),
        );
        savedPrescription.items = await prescriptionItemRepo.save(items);
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
  ): Promise<MedicalRecordDetailResponse> {
    return this.dataSource.transaction(async (manager) => {
      const doctor = await this.getDoctorByUserId(userId, manager);
      const medicalRecordRepo = manager.getRepository(MedicalRecordEntity);

      const record = await medicalRecordRepo.findOne({
        where: { id: recordId },
      });

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

      const savedRecord = await medicalRecordRepo.save(record);

      let safetyResult: DrugSafetyCheckResult = {
        hasWarning: false,
        warnings: [],
      };

      const prescriptionRepo = manager.getRepository(PrescriptionEntity);
      const prescriptionItemRepo =
        manager.getRepository(PrescriptionItemEntity);

      let prescription = await prescriptionRepo.findOne({
        where: { medicalRecordId: record.id },
        relations: ['items'],
      });

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
          } else {
            await prescriptionItemRepo.delete({
              prescriptionId: prescription.id,
            });
          }

          const items = dto.prescriptionItems.map((itemDto) =>
            prescriptionItemRepo.create({
              prescriptionId: prescription!.id,
              medicineName: itemDto.medicineName.trim(),
              activeIngredient: itemDto.activeIngredient
                ? itemDto.activeIngredient.trim()
                : null,
              dosageMorning: itemDto.dosageMorning
                ? itemDto.dosageMorning.trim()
                : null,
              dosageNoon: itemDto.dosageNoon ? itemDto.dosageNoon.trim() : null,
              dosageAfternoon: itemDto.dosageAfternoon
                ? itemDto.dosageAfternoon.trim()
                : null,
              dosageNight: itemDto.dosageNight
                ? itemDto.dosageNight.trim()
                : null,
              totalQuantity: itemDto.totalQuantity,
              unit: itemDto.unit.trim(),
              usageInstructions: itemDto.usageInstructions
                ? itemDto.usageInstructions.trim()
                : null,
            }),
          );
          prescription.items = await prescriptionItemRepo.save(items);
        } else if (prescription) {
          await prescriptionItemRepo.delete({
            prescriptionId: prescription.id,
          });
          prescription.items = [];
        }
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
  ): Promise<MedicalRecordDetailResponse> {
    return this.dataSource.transaction(async (manager) => {
      const doctor = await this.getDoctorByUserId(userId, manager);
      const medicalRecordRepo = manager.getRepository(MedicalRecordEntity);
      const appointmentRepo = manager.getRepository(AppointmentEntity);

      const record = await medicalRecordRepo.findOne({
        where: { id: recordId },
      });

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
      const savedRecord = await medicalRecordRepo.save(record);

      const prescriptionRepo = manager.getRepository(PrescriptionEntity);
      const prescription = await prescriptionRepo.findOne({
        where: { medicalRecordId: record.id },
        relations: ['items'],
      });

      return this.mapToDetailResponse(savedRecord, prescription);
    });
  }

  /**
   * Get medical record by ID with role-based access control and lazy lock evaluation.
   */
  async getMedicalRecord(
    userId: string,
    role: Role,
    recordId: string,
  ): Promise<MedicalRecordDetailResponse> {
    const record = await this.medicalRecordRepo.findOne({
      where: { id: recordId },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'MEDICAL_RECORD_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ bệnh án.',
      });
    }

    await this.applyLazyLockIfNeeded(record);

    // Check authorization:
    if (role === Role.PATIENT && record.patientId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ACCESS',
        message: 'Bạn chỉ có thể xem hồ sơ bệnh án của chính mình.',
      });
    }

    if (role === Role.DOCTOR) {
      const doctor = await this.getDoctorByUserId(userId);
      if (record.doctorId !== doctor.id) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_ACCESS',
          message:
            'Bác sĩ không có quyền xem hồ sơ bệnh án của ca khám do bác sĩ khác phụ trách.',
        });
      }
    }

    const prescription = await this.prescriptionRepo.findOne({
      where: { medicalRecordId: record.id },
      relations: ['items'],
    });

    return this.mapToDetailResponse(record, prescription);
  }

  /**
   * Get medical record by appointment ID.
   */
  async getMedicalRecordByAppointment(
    userId: string,
    role: Role,
    appointmentId: string,
  ): Promise<MedicalRecordDetailResponse> {
    const record = await this.medicalRecordRepo.findOne({
      where: { appointmentId },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'MEDICAL_RECORD_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ bệnh án cho ca khám này.',
      });
    }

    return this.getMedicalRecord(userId, role, record.id);
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
  ): Promise<EmrAddendumData> {
    const doctor = await this.getDoctorByUserId(userId);

    const record = await this.medicalRecordRepo.findOne({
      where: { id: recordId },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'MEDICAL_RECORD_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ bệnh án.',
      });
    }

    if (record.doctorId !== doctor.id) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED_DOCTOR',
        message: 'Bác sĩ không có quyền tạo phụ lục cho hồ sơ bệnh án này.',
      });
    }

    // Lazy lock evaluation: lock if 24 hours have elapsed since completedAt
    await this.applyLazyLockIfNeeded(record);

    if (!record.isLocked) {
      throw new BadRequestException({
        code: 'EMR_NOT_LOCKED',
        message:
          'Hồ sơ bệnh án chưa bị khóa (chưa đủ 24 giờ sau khi hoàn tất ca khám). Vui lòng chỉnh sửa trực tiếp trên bệnh án.',
      });
    }

    // Full snapshot chaining:
    const existingAddendums = await this.emrAddendumRepo.find({
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

    const addendum = this.emrAddendumRepo.create({
      medicalRecordId: record.id,
      doctorId: doctor.id,
      reason: dto.reason.trim(),
      previousContent,
      updatedContent,
    });

    const savedAddendum = await this.emrAddendumRepo.save(addendum);

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
  ): Promise<EmrHistoryResponse> {
    if (role === Role.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ACCESS',
        message: 'Quản trị viên không có quyền truy cập lịch sử hồ sơ bệnh án.',
      });
    }

    const record = await this.medicalRecordRepo.findOne({
      where: { id: recordId },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'MEDICAL_RECORD_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ bệnh án.',
      });
    }

    if (role === Role.PATIENT && record.patientId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ACCESS',
        message: 'Bạn chỉ có thể xem lịch sử hồ sơ bệnh án của chính mình.',
      });
    }

    if (role === Role.DOCTOR) {
      const doctor = await this.getDoctorByUserId(userId);
      if (record.doctorId !== doctor.id) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_ACCESS',
          message:
            'Bác sĩ không có quyền xem lịch sử hồ sơ bệnh án của ca khám do bác sĩ khác phụ trách.',
        });
      }
    }

    await this.applyLazyLockIfNeeded(record);

    const addendums = await this.emrAddendumRepo.find({
      where: { medicalRecordId: record.id },
      relations: ['doctor', 'doctor.user'],
      order: { createdAt: 'ASC', id: 'ASC' },
    });

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
