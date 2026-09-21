import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppointmentStatus, PaymentMethod, PaymentStatus, QueueSource } from '@shared/enums';
import { CheckInResponse, ReceptionAppointment } from '@shared/interfaces';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { DoctorScheduleEntity } from '../../database/entities/doctor-schedule.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { vietnamesePhoneVariants } from '../../common/utils/vn-phone.util';
import { vietnamNow } from '../../common/utils/vn-time.util';
import { LookupAppointmentDto } from './dto/lookup-appointment.dto';
import { QueueNumberService } from './queue-number.service';

@Injectable()
export class ReceptionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly queueNumbers: QueueNumberService,
  ) {}

  async lookup(query: LookupAppointmentDto): Promise<ReceptionAppointment[]> {
    if (Number(Boolean(query.code)) + Number(Boolean(query.phone)) !== 1) {
      throw new BadRequestException('Cần truyền đúng một trong code hoặc phone.');
    }

    const today = vietnamNow().date;
    const builder = this.dataSource
      .getRepository(AppointmentEntity)
      .createQueryBuilder('appointment')
      .innerJoinAndSelect('appointment.patient', 'patient')
      .innerJoinAndSelect('appointment.doctor', 'doctor')
      .innerJoinAndSelect('doctor.user', 'doctorUser')
      .innerJoinAndSelect('doctor.specialty', 'specialty')
      .innerJoinAndSelect('appointment.schedule', 'schedule')
      .where('schedule.date = :today', { today })
      .orderBy('schedule.start_time', 'ASC')
      .addOrderBy('appointment.id', 'ASC');

    if (query.code) {
      builder.andWhere('appointment.appointment_code = :code', {
        code: query.code.toUpperCase(),
      });
    } else {
      builder.andWhere('patient.phone_number IN (:...phones)', {
        phones: vietnamesePhoneVariants(query.phone!),
      });
    }

    const appointments = await builder.getMany();
    return appointments.map((appointment) => {
      const requiresPayment =
        appointment.paymentMethod === PaymentMethod.PAY_AT_CLINIC &&
        appointment.paymentStatus === PaymentStatus.UNPAID;
      const canCheckIn =
        appointment.status === AppointmentStatus.CONFIRMED &&
        appointment.paymentStatus === PaymentStatus.PAID;
      const blockedReason = canCheckIn
        ? null
        : appointment.status !== AppointmentStatus.CONFIRMED
          ? 'Lịch hẹn không ở trạng thái xác nhận.'
          : requiresPayment
            ? 'Cần thu viện phí tại quầy trước khi check-in.'
            : 'Lịch hẹn chưa được xác nhận thanh toán.';

      return {
        id: appointment.id,
        appointmentCode: appointment.appointmentCode,
        status: appointment.status,
        patientId: appointment.patientId,
        patientName: appointment.patient.fullName,
        patientPhone: appointment.patient.phoneNumber,
        doctorId: appointment.doctorId,
        doctorName: appointment.doctor.user.fullName,
        specialtyName: appointment.doctor.specialty.name,
        roomNumber: appointment.doctor.roomNumber,
        date: appointment.schedule.date,
        startTime: appointment.schedule.startTime,
        endTime: appointment.schedule.endTime,
        paymentStatus: appointment.paymentStatus,
        paymentMethod: appointment.paymentMethod,
        totalAmount: Number(appointment.totalAmount),
        queueNumber: appointment.queueNumber,
        checkedInAt: appointment.checkedInAt?.toISOString() ?? null,
        requiresPayment,
        canCheckIn,
        blockedReason,
      };
    });
  }

  async checkIn(appointmentId: string): Promise<CheckInResponse> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const appointment = await manager
        .getRepository(AppointmentEntity)
        .createQueryBuilder('appointment')
        .setLock('pessimistic_write')
        .where('appointment.id = :appointmentId', { appointmentId })
        .getOne();
      if (!appointment) throw new NotFoundException('Không tìm thấy lịch hẹn.');
      if (appointment.status !== AppointmentStatus.CONFIRMED) {
        throw new ConflictException('Lịch hẹn không thể check-in ở trạng thái hiện tại.');
      }
      if (appointment.paymentStatus !== PaymentStatus.PAID) {
        throw new ConflictException('Lịch hẹn chưa được thanh toán.');
      }

      const schedule = await manager.getRepository(DoctorScheduleEntity).findOneBy({
        id: appointment.scheduleId,
      });
      if (!schedule) throw new NotFoundException('Không tìm thấy khung khám.');
      if (schedule.doctorId !== appointment.doctorId) {
        throw new ConflictException('Lịch hẹn và khung khám không cùng bác sĩ.');
      }
      const today = vietnamNow().date;
      if (schedule.date !== today) {
        throw new ConflictException('Chỉ được check-in lịch hẹn trong ngày.');
      }

      const queueNumber = await this.queueNumbers.allocate(
        manager,
        appointment.doctorId,
        today,
      );
      const checkedInAt = new Date();
      appointment.status = AppointmentStatus.CHECKED_IN;
      appointment.queueNumber = queueNumber;
      appointment.queueDate = today;
      appointment.queueSource = QueueSource.APPOINTMENT;
      appointment.checkedInAt = checkedInAt;
      await manager.save(AppointmentEntity, appointment);

      const patient = await manager.getRepository(UserEntity).findOneByOrFail({
        id: appointment.patientId,
      });
      const doctor = await manager.getRepository(DoctorEntity).findOne({
        where: { id: appointment.doctorId },
        relations: { user: true },
      });
      if (!doctor) throw new NotFoundException('Không tìm thấy bác sĩ.');
      return {
        appointmentId: appointment.id,
        appointmentCode: appointment.appointmentCode,
        status: AppointmentStatus.CHECKED_IN,
        queueNumber,
        queueDate: today,
        queueSource: QueueSource.APPOINTMENT,
        doctorId: appointment.doctorId,
        doctorName: doctor.user.fullName,
        roomNumber: doctor.roomNumber,
        patientName: patient.fullName,
        checkedInAt: checkedInAt.toISOString(),
      };
    });
  }
}
