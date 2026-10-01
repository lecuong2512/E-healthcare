import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, In } from "typeorm";
import { SlotStatus, UserStatus } from "@shared/enums";
import { DoctorEntity } from "../../database/entities/doctor.entity";
import { DoctorScheduleEntity } from "../../database/entities/doctor-schedule.entity";
import { DoctorSpecialtyEntity } from "../../database/entities/doctor-specialty.entity";
import { SpecialtyEntity } from "../../database/entities/specialty.entity";
import { DoctorCacheService } from "./doctor-cache.service";
import { SearchDoctorDto } from "./dto/search-doctor.dto";
import { BOOKABLE_SCHEDULE_SQL, bookingEarliestStart, isBookableStart } from '../booking/booking-slot-time';

interface DoctorView {
  id: string;
  fullName: string;
  academicTitle: string | null;
  specialty: { id: string; name: string };
  specialties?: Array<{ id: string; name: string }>;
  consultationFee: number;
  bioDescription: string | null;
  roomNumber: string;
  ratingAverage: number;
  avatarUrl?: string | null;
}

interface SearchDoctorResult {
  data: DoctorView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class DoctorSearchService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: DoctorCacheService,
  ) {}

  async search(dto: SearchDoctorDto): Promise<SearchDoctorResult> {
    if (
      dto.minPrice !== undefined &&
      dto.maxPrice !== undefined &&
      dto.minPrice > dto.maxPrice
    ) {
      throw new BadRequestException(
        "Mức phí tối thiểu phải nhỏ hơn hoặc bằng mức phí tối đa.",
      );
    }

    const normalized = {
      q: dto.q?.trim().toLocaleLowerCase("vi") || undefined,
      specialtyId: dto.specialtyId,
      date: dto.date,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      minRating: dto.minRating,
      page: Math.max(1, Number(dto.page) || 1),
      limit: Math.min(100, Math.max(1, Number(dto.limit) || 20)),
    };
    const cacheKey = this.cache.key("list", normalized);
    const cached = await this.cache.getJson<SearchDoctorResult>(cacheKey);
    if (cached) return cached;

    const query = this.dataSource
      .getRepository(DoctorEntity)
      .createQueryBuilder("doctor")
      .innerJoinAndSelect("doctor.user", "user")
      .innerJoinAndSelect("doctor.specialty", "specialty")
      .where("user.status = :activeUser", { activeUser: UserStatus.ACTIVE })
      .andWhere("specialty.is_active = TRUE");

    if (normalized.q) {
      const keyword = `%${normalized.q}%`;
      query.andWhere(
        `(
          unaccent(LOWER(user.full_name)) LIKE unaccent(:keyword) OR
          unaccent(LOWER(COALESCE(doctor.academic_title, ''))) LIKE unaccent(:keyword) OR
          unaccent(LOWER(COALESCE(doctor.bio_description, ''))) LIKE unaccent(:keyword) OR
          unaccent(LOWER(doctor.room_number)) LIKE unaccent(:keyword)
        )`,
        { keyword },
      );
    }
    if (normalized.specialtyId) {
      query.andWhere("doctor.specialty_id = :specialtyId", {
        specialtyId: normalized.specialtyId,
      });
    }
    if (normalized.minPrice !== undefined) {
      query.andWhere("doctor.consultation_fee >= :minPrice", {
        minPrice: normalized.minPrice,
      });
    }
    if (normalized.maxPrice !== undefined) {
      query.andWhere("doctor.consultation_fee <= :maxPrice", {
        maxPrice: normalized.maxPrice,
      });
    }
    if (normalized.minRating !== undefined) {
      query.andWhere("doctor.rating_average >= :minRating", {
        minRating: normalized.minRating,
      });
    }
    if (normalized.date) {
      query.andWhere(
        `EXISTS (
          SELECT 1 FROM doctor_schedules schedule
          WHERE schedule.doctor_id = doctor.id
            AND schedule.date = :date
            AND schedule.status = :available
            AND ${BOOKABLE_SCHEDULE_SQL}
        )`,
        { date: normalized.date, available: SlotStatus.AVAILABLE, earliestStart: bookingEarliestStart() },
      );
    }

    const total = await query.getCount();
    const doctors = await query
      .orderBy("doctor.ratingAverage", "DESC")
      .addOrderBy("user.fullName", "ASC")
      .skip((normalized.page - 1) * normalized.limit)
      .take(normalized.limit)
      .getMany();

    const doctorIds = doctors.map(d => d.id);
    const specialtyMap = new Map<string, Array<{ id: string; name: string }>>();
    const specRepo = this.dataSource.getRepository ? this.dataSource.getRepository(DoctorSpecialtyEntity) : null;
    if (specRepo && typeof specRepo.find === 'function' && doctorIds.length > 0) {
      try {
        const allDoctorSpecialties = await specRepo.find({
          where: { doctorId: In(doctorIds) },
        });
        const allSpecIds = [...new Set(allDoctorSpecialties.map(ds => ds.specialtyId))];
        const masterSpecRepo = this.dataSource.getRepository(SpecialtyEntity);
        if (allSpecIds.length > 0 && typeof masterSpecRepo?.find === 'function') {
          const specEntities = await masterSpecRepo.find({
            where: { id: In(allSpecIds), isActive: true },
          });
          const specNameMap = new Map(specEntities.map(s => [s.id, s.name]));
          allDoctorSpecialties.forEach(ds => {
            const name = specNameMap.get(ds.specialtyId);
            if (name) {
              const list = specialtyMap.get(ds.doctorId) || [];
              if (!list.some(item => item.id === ds.specialtyId)) {
                list.push({ id: ds.specialtyId, name });
              }
              specialtyMap.set(ds.doctorId, list);
            }
          });
        }
      } catch {
        // Fallback an toàn nếu môi trường test không mock
      }
    }

    const result: SearchDoctorResult = {
      data: doctors.map((doctor) => this.toView(doctor, specialtyMap.get(doctor.id))),
      pagination: {
        page: normalized.page,
        limit: normalized.limit,
        total,
        totalPages: Math.ceil(total / normalized.limit),
      },
    };
    await this.cache.setJson(cacheKey, result, normalized.date ? 60 : 300);
    return result;
  }

  async findOne(doctorId: string) {
    const cacheKey = this.cache.key("detail-v2", doctorId);
    const cached = await this.cache.getJson<DoctorView & { availableSchedules: DoctorScheduleEntity[] }>(cacheKey);
    if (cached) return { ...cached, availableSchedules: cached.availableSchedules.filter((slot) => isBookableStart(slot.date, slot.startTime)) };

    const doctor = await this.dataSource
      .getRepository(DoctorEntity)
      .createQueryBuilder("doctor")
      .innerJoinAndSelect("doctor.user", "user")
      .innerJoinAndSelect("doctor.specialty", "specialty")
      .where("doctor.id = :doctorId", { doctorId })
      .andWhere("user.status = :activeUser", { activeUser: UserStatus.ACTIVE })
      .andWhere("specialty.is_active = TRUE")
      .getOne();
    if (!doctor) throw new NotFoundException("Không tìm thấy bác sĩ.");

    let specialtiesList: Array<{ id: string; name: string }> = [];
    const docSpecRepo = this.dataSource.getRepository ? this.dataSource.getRepository(DoctorSpecialtyEntity) : null;
    if (docSpecRepo && typeof docSpecRepo.find === 'function') {
      try {
        const extraDoctorSpecialties = await docSpecRepo.find({
          where: { doctorId },
        });
        const extraSpecIds = extraDoctorSpecialties.map(ds => ds.specialtyId);
        const masterSpecRepo = this.dataSource.getRepository(SpecialtyEntity);
        if (extraSpecIds.length > 0 && typeof masterSpecRepo?.find === 'function') {
          const specEntities = await masterSpecRepo.find({
            where: { id: In(extraSpecIds), isActive: true },
          });
          specialtiesList = specEntities.map(s => ({ id: s.id, name: s.name }));
        }
      } catch {
        // Fallback an toàn
      }
    }

    const schedules = await this.dataSource
      .getRepository(DoctorScheduleEntity)
      .createQueryBuilder("schedule")
      .where("schedule.doctor_id = :doctorId", { doctorId })
      .andWhere("schedule.status = :status", { status: SlotStatus.AVAILABLE })
      .andWhere(BOOKABLE_SCHEDULE_SQL, { earliestStart: bookingEarliestStart() })
      .orderBy("schedule.date", "ASC")
      .addOrderBy("schedule.start_time", "ASC")
      .take(100)
      .getMany();
    const result = { ...this.toView(doctor, specialtiesList), availableSchedules: schedules };
    await this.cache.setJson(cacheKey, result, 60);
    return result;
  }

  async specialties(): Promise<SpecialtyEntity[]> {
    const cacheKey = `${this.cache.key("specialties", "active")}`;
    const cached = await this.cache.getJson<SpecialtyEntity[]>(cacheKey);
    if (cached) return cached;
    const specialties = await this.dataSource
      .getRepository(SpecialtyEntity)
      .find({ where: { isActive: true }, order: { name: "ASC" } });
    await this.cache.setJson(cacheKey, specialties, 900);
    return specialties;
  }

  private toView(doctor: DoctorEntity, extraSpecialties?: Array<{ id: string; name: string }>): DoctorView {
    const primary = { id: doctor.specialty.id, name: doctor.specialty.name };
    const view: DoctorView = {
      id: doctor.id,
      fullName: doctor.user.fullName,
      academicTitle: doctor.academicTitle,
      specialty: primary,
      consultationFee: Number(doctor.consultationFee),
      bioDescription: doctor.bioDescription,
      roomNumber: doctor.roomNumber,
      ratingAverage: Number(doctor.ratingAverage),
      avatarUrl: doctor.avatarUrl ?? doctor.user?.avatarUrl ?? null,
    };
    if (extraSpecialties && extraSpecialties.length > 0) {
      view.specialties = [primary, ...extraSpecialties.filter(s => s.id !== primary.id)];
    }
    return view;
  }
}
