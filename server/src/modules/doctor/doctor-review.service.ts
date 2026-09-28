import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from '@shared/enums';
import { DoctorReviewResponse } from '@shared/interfaces';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DoctorReviewEntity } from '../../database/entities/doctor-review.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { CreateDoctorReviewDto } from './dto/create-doctor-review.dto';
import { DoctorCacheService } from './doctor-cache.service';

@Injectable()
export class DoctorReviewService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: DoctorCacheService,
  ) {}

  async create(
    doctorId: string,
    patientId: string,
    dto: CreateDoctorReviewDto,
  ): Promise<DoctorReviewResponse> {
    let result: DoctorReviewResponse;
    try {
      result = await this.dataSource.transaction((manager) =>
        this.createWithinTransaction(manager, doctorId, patientId, dto),
      );
    } catch (error) {
      if (this.isDuplicateAppointmentReview(error)) {
        throw new ConflictException('Ca khám này đã được đánh giá.');
      }
      throw error;
    }

    await this.cache.invalidateDoctorData(doctorId);
    return result;
  }

  private async createWithinTransaction(
    manager: EntityManager,
    doctorId: string,
    patientId: string,
    dto: CreateDoctorReviewDto,
  ): Promise<DoctorReviewResponse> {
    const doctor = await manager
      .getRepository(DoctorEntity)
      .createQueryBuilder('doctor')
      .setLock('pessimistic_write')
      .where('doctor.id = :doctorId', { doctorId })
      .getOne();
    if (!doctor) throw new NotFoundException('Không tìm thấy bác sĩ.');

    const appointment = await manager.getRepository(AppointmentEntity).findOne({
      where: { id: dto.appointmentId, patientId },
    });
    if (!appointment) {
      throw new NotFoundException('Không tìm thấy ca khám của bệnh nhân.');
    }
    if (appointment.doctorId !== doctorId) {
      throw new ConflictException('Ca khám không thuộc bác sĩ được đánh giá.');
    }
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Chỉ có thể đánh giá ca khám đã hoàn thành.');
    }

    const reviewRepository = manager.getRepository(DoctorReviewEntity);
    if (await reviewRepository.existsBy({ appointmentId: appointment.id })) {
      throw new ConflictException('Ca khám này đã được đánh giá.');
    }

    const review = await reviewRepository.save(
      reviewRepository.create({
        appointmentId: appointment.id,
        doctorId,
        patientId,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
      }),
    );

    const aggregate = await reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'average')
      .where('review.doctor_id = :doctorId', { doctorId })
      .getRawOne<{ average: string | null }>();
    const ratingAverage = Number(aggregate?.average ?? dto.rating);
    doctor.ratingAverage = Math.round(ratingAverage * 100) / 100;
    await manager.getRepository(DoctorEntity).save(doctor);

    return {
      id: review.id,
      appointmentId: review.appointmentId,
      doctorId: review.doctorId,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      ratingAverage: doctor.ratingAverage,
    };
  }

  private isDuplicateAppointmentReview(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };
    return (
      driverError.code === '23505' &&
      driverError.constraint === 'uq_doctor_reviews_appointment'
    );
  }
}
