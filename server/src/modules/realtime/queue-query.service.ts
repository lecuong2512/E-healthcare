import { Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@shared/enums';
import { PublicQueueSnapshot, QueueSnapshot, QueueTicket } from '@shared/interfaces';
import { DataSource } from 'typeorm';
import { vietnamNow } from '../../common/utils/vn-time.util';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { toPublicQueueTicket } from './public-queue.mapper';

@Injectable()
export class QueueQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async snapshot(scope: 'RECEPTION' | 'DOCTOR', doctorId?: string): Promise<QueueSnapshot> {
    const date = vietnamNow().date;
    const query = this.ticketQuery()
      .where('appointment.queue_date = :date', { date })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_CONSULTATION],
      })
      .andWhere('appointment.queue_number IS NOT NULL')
      .andWhere('appointment.queue_source IS NOT NULL')
      .andWhere('appointment.checked_in_at IS NOT NULL')
      .orderBy('appointment.doctor_id', 'ASC')
      .addOrderBy('appointment.queue_number', 'ASC');
    if (scope === 'DOCTOR') {
      if (!doctorId) throw new Error('Doctor queue requires doctorId');
      query.andWhere('appointment.doctor_id = :doctorId', { doctorId });
    }
    const items = (await query.getMany()).map((appointment) => this.toTicket(appointment));
    return { scope, ...(doctorId ? { doctorId } : {}), date, items };
  }

  async ticket(appointmentId: string): Promise<QueueTicket | null> {
    const appointment = await this.ticketQuery()
      .where('appointment.id = :appointmentId', { appointmentId })
      .getOne();
    return appointment?.queueNumber != null && appointment.queueDate &&
      appointment.queueSource && appointment.checkedInAt
      ? this.toTicket(appointment)
      : null;
  }

  async publicSnapshot(): Promise<PublicQueueSnapshot> {
    const snapshot = await this.snapshot('RECEPTION');
    return {
      scope: 'PUBLIC',
      date: snapshot.date,
      items: snapshot.items.map(toPublicQueueTicket),
    };
  }

  private ticketQuery() {
    return this.dataSource.getRepository(AppointmentEntity)
      .createQueryBuilder('appointment')
      .innerJoinAndSelect('appointment.patient', 'patient')
      .innerJoinAndSelect('appointment.doctor', 'doctor')
      .innerJoinAndSelect('doctor.user', 'doctorUser');
  }

  private toTicket(appointment: AppointmentEntity): QueueTicket {
    return {
      appointmentId: appointment.id,
      appointmentCode: appointment.appointmentCode,
      patientName: appointment.patient.fullName,
      doctorId: appointment.doctorId,
      doctorName: appointment.doctor.user.fullName,
      roomNumber: appointment.doctor.roomNumber,
      status: appointment.status,
      queueNumber: appointment.queueNumber!,
      queueDate: appointment.queueDate!,
      queueSource: appointment.queueSource!,
      checkedInAt: appointment.checkedInAt!.toISOString(),
    };
  }
}
