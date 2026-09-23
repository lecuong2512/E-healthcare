import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { AppointmentEntity } from '../../../database/entities/appointment.entity';
import { DoctorScheduleEntity } from '../../../database/entities/doctor-schedule.entity';
import { AppointmentStatus, SlotStatus } from '@shared/enums';
import { RedisService } from '../../../common/redis/redis.service';
import { NotificationProducerService } from '../producers/notification-producer.service';

export const NO_SHOW_GRACE_MINUTES = 30;

@Injectable()
export class AppointmentCronService {
  private readonly logger = new Logger(AppointmentCronService.name);
  private appointmentRepo!: Repository<AppointmentEntity>;
  private scheduleRepo!: Repository<DoctorScheduleEntity>;

  constructor(
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly notificationProducerService?: NotificationProducerService,
  ) {
    if (this.dataSource && typeof this.dataSource.getRepository === 'function') {
      this.appointmentRepo = this.dataSource.getRepository(AppointmentEntity);
      this.scheduleRepo = this.dataSource.getRepository(DoctorScheduleEntity);
    }
  }

  /**
   * Cron 1: Quét tự động đánh dấu NO_SHOW các lịch hẹn quá 30 phút mà bệnh nhân không check-in (Section 5.2 & SRS-DOC-02)
   * Chạy định kỳ mỗi 15 phút và cuối ngày.
   */
  @Cron('*/15 * * * *')
  async scanAndMarkNoShow(referenceTime: Date = new Date()): Promise<number> {
    this.logger.log(`Running scanAndMarkNoShow cron at ${referenceTime.toISOString()}`);

    if (!this.appointmentRepo) {
      this.logger.warn('appointmentRepo is not initialized, skipping scanAndMarkNoShow');
      return 0;
    }

    const confirmedAppointments = await this.appointmentRepo.find({
      where: {
        status: AppointmentStatus.CONFIRMED,
      },
      relations: ['schedule'],
    });

    let count = 0;

    for (const appt of confirmedAppointments) {
      if (appt.checkedInAt) {
        continue;
      }

      if (!appt.schedule) {
        continue;
      }

      const scheduleDate = appt.schedule.date;
      const startTime = appt.schedule.startTime;
      const endTime = appt.schedule.endTime || startTime;

      // Construct appointment start & end time
      // date format: 'YYYY-MM-DD', time format: 'HH:mm:ss' or 'HH:mm'
      const apptEndDateTime = new Date(`${scheduleDate}T${endTime}`);
      if (isNaN(apptEndDateTime.getTime())) {
        continue;
      }

      // Quá 30 phút so với giờ hẹn kết thúc hoặc quá 30 phút so với giờ bắt đầu
      const cutoffTime = new Date(apptEndDateTime.getTime() + NO_SHOW_GRACE_MINUTES * 60 * 1000);

      if (referenceTime >= cutoffTime) {
        appt.status = AppointmentStatus.NO_SHOW;
        await this.appointmentRepo.save(appt);
        count++;
        this.logger.warn(
          `Appointment ${appt.appointmentCode} marked as NO_SHOW (Scheduled: ${scheduleDate} ${endTime}, Cutoff: ${cutoffTime.toISOString()})`,
        );
      }
    }

    this.logger.log(`scanAndMarkNoShow finished: ${count} appointments marked as NO_SHOW`);
    return count;
  }

  /**
   * Cron 2: Quét dọn dẹp các slot giữ chỗ mồ côi (Orphaned Holding Slots)
   * Chạy định kỳ mỗi 5 phút.
   * Nếu slot trong DB có status = HOLDING nhưng Redis lock đã hết hạn (TTL <= 0 hoặc mất kết nối),
   * tự động hoàn trả slot về status = AVAILABLE.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupOrphanedHoldingSlots(): Promise<number> {
    this.logger.log('Running cleanupOrphanedHoldingSlots cron');

    if (!this.scheduleRepo || !this.redisService) {
      this.logger.warn('scheduleRepo or redisService is not initialized, skipping cleanupOrphanedHoldingSlots');
      return 0;
    }

    const holdingSlots = await this.scheduleRepo.find({
      where: {
        status: SlotStatus.HOLDING,
      },
    });

    let restoredCount = 0;

    for (const slot of holdingSlots) {
      const lockKey = `lock:doctor:${slot.doctorId}:slot:${slot.id}`;
      const lockHolder = await this.redisService.get(lockKey);
      const remainingTtl = await this.redisService.ttl(lockKey);

      // Nếu không còn key hoặc TTL âm (đã hết hạn)
      if (!lockHolder || remainingTtl <= 0) {
        slot.status = SlotStatus.AVAILABLE;
        await this.scheduleRepo.save(slot);
        restoredCount++;
        this.logger.warn(
          `Orphaned holding slot ${slot.id} of doctor ${slot.doctorId} restored to AVAILABLE (Redis lock expired or absent)`,
        );
      }
    }

    this.logger.log(`cleanupOrphanedHoldingSlots finished: ${restoredCount} slots restored`);
    return restoredCount;
  }

  /**
   * Cron 3: Quét tự động nhắc hẹn trước T-24h (Email) và T-2h (SMS) theo SRS-PAT-05
   * Chạy định kỳ mỗi 30 phút.
   */
  @Cron('*/30 * * * *')
  async scanAndDispatchReminders(referenceTime: Date = new Date()): Promise<{ sent24h: number; sent2h: number }> {
    this.logger.log(`Running scanAndDispatchReminders cron at ${referenceTime.toISOString()}`);

    if (!this.appointmentRepo || !this.redisService || !this.notificationProducerService) {
      this.logger.warn('Required dependencies are not initialized, skipping scanAndDispatchReminders');
      return { sent24h: 0, sent2h: 0 };
    }

    const upcomingAppointments = await this.appointmentRepo.find({
      where: {
        status: AppointmentStatus.CONFIRMED,
      },
      relations: ['patient', 'doctor', 'doctor.user', 'doctor.specialty', 'schedule'],
    });

    let sent24h = 0;
    let sent2h = 0;

    for (const appt of upcomingAppointments) {
      if (!appt.schedule || !appt.patient) {
        continue;
      }

      const scheduleDate = appt.schedule.date;
      const startTime = appt.schedule.startTime;
      const apptStartDateTime = new Date(`${scheduleDate}T${startTime}`);

      if (isNaN(apptStartDateTime.getTime())) {
        continue;
      }

      const diffMs = apptStartDateTime.getTime() - referenceTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // Mốc T-24 giờ: Nhắc trước 23h đến 25h (qua Email)
      if (diffHours >= 23 && diffHours <= 25 && appt.patient.email) {
        const dedupeKey = `lock:reminder:24h:${appt.id}`;
        const alreadySent = await this.redisService.get(dedupeKey);

        if (!alreadySent) {
          await this.notificationProducerService.enqueueAppointmentReminder24h({
            to: appt.patient.email,
            patientName: appt.patient.fullName,
            appointmentCode: appt.appointmentCode,
            doctorName: appt.doctor?.user?.fullName || 'Bác sĩ chuyên khoa',
            date: scheduleDate,
            time: startTime,
            roomNumber: appt.doctor?.roomNumber,
          });

          // Đặt khóa chống gửi lặp trong 48 giờ
          await this.redisService.setNxEx(dedupeKey, 'SENT', 172800);
          sent24h++;
        }
      }

      // Mốc T-2 giờ: Nhắc trước 1.75h đến 2.25h (qua SMS)
      if (diffHours >= 1.75 && diffHours <= 2.25 && appt.patient.phoneNumber) {
        const dedupeKey = `lock:reminder:2h:${appt.id}`;
        const alreadySent = await this.redisService.get(dedupeKey);

        if (!alreadySent) {
          await this.notificationProducerService.enqueueAppointmentReminder2h({
            phoneNumber: appt.patient.phoneNumber,
            patientName: appt.patient.fullName,
            appointmentCode: appt.appointmentCode,
            doctorName: appt.doctor?.user?.fullName || 'Bác sĩ chuyên khoa',
            time: startTime,
            roomNumber: appt.doctor?.roomNumber,
          });

          // Đặt khóa chống gửi lặp trong 12 giờ
          await this.redisService.setNxEx(dedupeKey, 'SENT', 43200);
          sent2h++;
        }
      }
    }

    this.logger.log(`scanAndDispatchReminders finished: sent24h=${sent24h}, sent2h=${sent2h}`);
    return { sent24h, sent2h };
  }
}
