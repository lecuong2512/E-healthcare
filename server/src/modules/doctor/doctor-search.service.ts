import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { SlotStatus, UserStatus } from "@shared/enums";
import { DoctorEntity } from "../../database/entities/doctor.entity";
import { DoctorScheduleEntity } from "../../database/entities/doctor-schedule.entity";
import { SpecialtyEntity } from "../../database/entities/specialty.entity";
import { DoctorCacheService } from "./doctor-cache.service";
import { SearchDoctorDto } from "./dto/search-doctor.dto";

interface DoctorView {
  id: string;
  fullName: string;
  academicTitle: string | null;
  specialty: { id: string; name: string };
  consultationFee: number;
  bioDescription: string | null;
  roomNumber: string;
  ratingAverage: number;
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
      page: dto.page,
      limit: dto.limit,
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
          LOWER(user.full_name) LIKE :keyword OR
          LOWER(COALESCE(doctor.academic_title, '')) LIKE :keyword OR
          LOWER(COALESCE(doctor.bio_description, '')) LIKE :keyword OR
          LOWER(doctor.room_number) LIKE :keyword
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
        )`,
        { date: normalized.date, available: SlotStatus.AVAILABLE },
      );
    }

    const total = await query.getCount();
    const doctors = await query
      .orderBy("doctor.rating_average", "DESC")
      .addOrderBy("user.full_name", "ASC")
      .skip((normalized.page - 1) * normalized.limit)
      .take(normalized.limit)
      .getMany();
    const result: SearchDoctorResult = {
      data: doctors.map((doctor) => this.toView(doctor)),
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
    const cacheKey = this.cache.key("detail", doctorId);
    const cached = await this.cache.getJson<unknown>(cacheKey);
    if (cached) return cached;

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

    const schedules = await this.dataSource
      .getRepository(DoctorScheduleEntity)
      .createQueryBuilder("schedule")
      .where("schedule.doctor_id = :doctorId", { doctorId })
      .andWhere("schedule.status = :status", { status: SlotStatus.AVAILABLE })
      .andWhere("schedule.date >= CURRENT_DATE")
      .orderBy("schedule.date", "ASC")
      .addOrderBy("schedule.start_time", "ASC")
      .take(100)
      .getMany();
    const result = { ...this.toView(doctor), availableSchedules: schedules };
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

  private toView(doctor: DoctorEntity): DoctorView {
    return {
      id: doctor.id,
      fullName: doctor.user.fullName,
      academicTitle: doctor.academicTitle,
      specialty: { id: doctor.specialty.id, name: doctor.specialty.name },
      consultationFee: Number(doctor.consultationFee),
      bioDescription: doctor.bioDescription,
      roomNumber: doctor.roomNumber,
      ratingAverage: Number(doctor.ratingAverage),
    };
  }
}
