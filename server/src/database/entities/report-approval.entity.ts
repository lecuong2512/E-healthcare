import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
@Entity('report_approvals')
export class ReportApprovalEntity { @PrimaryGeneratedColumn('uuid') id!: string; @Column({name:'approved_by',type:'uuid'}) approvedBy!: string; @Column({type:'int'}) days!: number; @CreateDateColumn({name:'approved_at',type:'timestamptz'}) approvedAt!: Date; }
