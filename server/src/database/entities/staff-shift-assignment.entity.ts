import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ShiftApprovalStatus = 'PENDING' | 'APPROVED' | 'LOCKED';

@Entity('staff_shift_assignments')
export class StaffShiftAssignmentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'room_id', type: 'uuid' }) roomId!: string;
  @Column({ name: 'shift_date', type: 'date' }) shiftDate!: string;
  @Column({ name: 'start_time', type: 'time' }) startTime!: string;
  @Column({ name: 'end_time', type: 'time' }) endTime!: string;
  @Column({ name: 'approval_status', type: 'varchar', length: 20, default: 'PENDING' }) approvalStatus!: ShiftApprovalStatus;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'approved_by', type: 'uuid', nullable: true }) approvedBy!: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
