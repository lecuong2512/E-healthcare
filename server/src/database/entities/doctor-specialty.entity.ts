import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
@Entity('doctor_specialties')
export class DoctorSpecialtyEntity { @PrimaryGeneratedColumn('uuid') id!: string; @Column({name:'doctor_id',type:'uuid'}) doctorId!: string; @Column({name:'specialty_id',type:'uuid'}) specialtyId!: string; @Column({name:'is_primary',type:'boolean',default:false}) isPrimary!: boolean; }
