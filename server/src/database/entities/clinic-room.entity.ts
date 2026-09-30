import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('clinic_rooms')
export class ClinicRoomEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'room_number', type: 'varchar', length: 20, unique: true }) roomNumber!: string;
  @Column({ name: 'room_name', type: 'varchar', length: 100, nullable: true }) roomName!: string | null;
  @Column({ name: 'specialty_id', type: 'uuid', nullable: true }) specialtyId!: string | null;
  @Column({ name: 'room_type', type: 'varchar', length: 30, nullable: true }) roomType!: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) location!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
