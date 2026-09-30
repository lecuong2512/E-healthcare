import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DateOfBirthPrecision, Gender, Role, UserStatus } from '@shared/enums';
import { UserEntity } from '../../database/entities/user.entity';
import { UserRoleEntity } from '../../database/entities/auth.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { DoctorSpecialtyEntity } from '../../database/entities/doctor-specialty.entity';
import { DoctorRecurringShiftEntity } from '../../database/entities/doctor-recurring-shift.entity';
import { ClinicRoomEntity } from '../../database/entities/clinic-room.entity';
import { StaffShiftAssignmentEntity, ShiftApprovalStatus } from '../../database/entities/staff-shift-assignment.entity';
import { hashPassword } from '../../common/utils/crypto.util';

export interface CreateStaffInput {
  fullName: string; email: string; phoneNumber?: string; password: string; role: Role; gender: Gender;
  dateOfBirth: string; specialtyId?: string; specialtyIds?: string[];
  licenseNumber?: string; roomNumber?: string; academicTitle?: string;
  yearsExperience?: number;
}

export interface UpdateStaffProfileInput {
  fullName?: string; phoneNumber?: string | null; gender?: Gender; dateOfBirth?: string;
  licenseNumber?: string; roomNumber?: string;
  academicTitle?: string | null; yearsExperience?: number; specialtyIds?: string[];
}

@Injectable()
export class StaffAdminService {
  constructor(private readonly dataSource: DataSource) {}

  async list(search = '', status?: UserStatus) {
    const staffRoles = [Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN];
    const assignments = await this.dataSource.getRepository(UserRoleEntity).find({ where: { role: In(staffRoles) } });
    const roleByUserId = new Map(assignments.map(item => [item.userId, item.role]));
    const staffUserIds = [...roleByUserId.keys()];
    if (!staffUserIds.length) return { data: [], summary: { active: 0, pending: 0, blocked: 0 } };

    const query = this.dataSource.getRepository(UserEntity).createQueryBuilder('user')
      .orderBy('user.created_at', 'DESC')
      .andWhere('user.id IN (:...staffUserIds)', { staffUserIds });
    if (search.trim()) query.andWhere('(LOWER(user.full_name) LIKE :search OR LOWER(user.email) LIKE :search)', { search: `%${search.trim().toLowerCase()}%` });
    if (status) query.andWhere('user.status = :status', { status });
    const users = await query.getMany();

    const doctorUserIds = users.filter(user => roleByUserId.get(user.id) === Role.DOCTOR).map(user => user.id);
    const doctors = doctorUserIds.length
      ? await this.dataSource.getRepository(DoctorEntity).find({ where: { userId: In(doctorUserIds) } })
      : [];
    const doctorByUserId = new Map(doctors.map(doctor => [doctor.userId, doctor]));
    const doctorIds = doctors.map(doctor => doctor.id);
    const specialtyAssignments = doctorIds.length
      ? await this.dataSource.getRepository(DoctorSpecialtyEntity).find({ where: { doctorId: In(doctorIds) } })
      : [];
    const specialtyIdsByDoctorId = new Map<string, string[]>();
    for (const assignment of specialtyAssignments) {
      const values = specialtyIdsByDoctorId.get(assignment.doctorId) ?? [];
      values.push(assignment.specialtyId);
      specialtyIdsByDoctorId.set(assignment.doctorId, values);
    }

    const data = users.map(user => {
      const doctor = doctorByUserId.get(user.id);
      return {
        id: user.id, fullName: user.fullName, email: user.email, phoneNumber: user.phoneNumber,
        gender: user.gender, dateOfBirth: user.dateOfBirth, status: user.status,
        role: roleByUserId.get(user.id)!, licenseNumber: doctor?.licenseNumber ?? null,
        academicTitle: doctor?.academicTitle ?? null, yearsExperience: doctor?.yearsExperience ?? null,
        roomNumber: doctor?.roomNumber ?? null,
        specialtyIds: doctor ? (specialtyIdsByDoctorId.get(doctor.id) ?? [doctor.specialtyId]) : [],
      };
    });
    return { data, summary: {
      active: users.filter(user => user.status === UserStatus.ACTIVE).length,
      pending: users.filter(user => user.status === UserStatus.PENDING_VERIFY).length,
      blocked: users.filter(user => user.status === UserStatus.BLOCKED).length,
    } };
  }

  async changeStatus(userId: string, status: UserStatus) {
    const repository = this.dataSource.getRepository(UserEntity);
    const user = await repository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Không tìm thấy nhân sự.');
    user.status = status;
    return repository.save(user);
  }

  async listRooms(): Promise<string[]> {
    const rooms = await this.dataSource.getRepository(ClinicRoomEntity).find({ where: { isActive: true }, order: { roomNumber: 'ASC' } });
    return rooms.map(room => room.roomNumber);
  }

  async listRoomCatalog() { return this.dataSource.getRepository(ClinicRoomEntity).find({ order: { roomNumber: 'ASC' } }); }

  async createRoom(input: { roomNumber: string; roomName?: string; specialtyId?: string; roomType?: string; location?: string; notes?: string }) {
    const roomNumber = input.roomNumber?.trim().toUpperCase();
    if (!roomNumber) throw new BadRequestException('Cần nhập mã phòng/buồng.');
    const repository = this.dataSource.getRepository(ClinicRoomEntity);
    const exists = await repository.findOneBy({ roomNumber });
    if (exists) throw new BadRequestException('Mã phòng/buồng đã tồn tại.');
    return repository.save(repository.create({ roomNumber, roomName: input.roomName?.trim() || null, specialtyId: input.specialtyId || null, roomType: input.roomType?.trim() || null, location: input.location?.trim() || null, notes: input.notes?.trim() || null, isActive: true }));
  }

  async updateRoom(roomId: string, input: { roomName?: string; specialtyId?: string; roomType?: string; location?: string; notes?: string; isActive?: boolean }) {
    const repository = this.dataSource.getRepository(ClinicRoomEntity);
    const room = await repository.findOneBy({ id: roomId });
    if (!room) throw new NotFoundException('Không tìm thấy phòng/buồng khám.');
    if (input.roomName !== undefined) room.roomName = input.roomName.trim() || null;
    if (input.specialtyId !== undefined) room.specialtyId = input.specialtyId || null;
    if (input.roomType !== undefined) room.roomType = input.roomType.trim() || null;
    if (input.location !== undefined) room.location = input.location.trim() || null;
    if (input.notes !== undefined) room.notes = input.notes.trim() || null;
    if (input.isActive !== undefined) room.isActive = input.isActive;
    return repository.save(room);
  }

  async create(input: CreateStaffInput) {
    const specialtyIds = [...new Set(input.specialtyIds?.filter(Boolean) ?? (input.specialtyId ? [input.specialtyId] : []))];
    if (input.role === Role.DOCTOR && (!specialtyIds.length || !input.licenseNumber || !input.roomNumber || input.yearsExperience == null || input.yearsExperience < 0)) throw new BadRequestException('Bác sĩ cần CCHN, chuyên khoa, phòng khám và số năm kinh nghiệm.');
    if (input.role === Role.DOCTOR) await this.validateLicenseNumber(input.licenseNumber!);
    return this.dataSource.transaction(async manager => {
      const user = await manager.save(manager.create(UserEntity, { fullName: input.fullName.trim(), email: input.email.trim().toLowerCase(), phoneNumber: input.phoneNumber?.trim() || null, passwordHash: await hashPassword(input.password), gender: input.gender, dateOfBirth: input.dateOfBirth, status: UserStatus.ACTIVE, dateOfBirthPrecision: DateOfBirthPrecision.FULL_DATE, failedLoginAttempts: 0, loginLockedUntil: null, googleSubject: null }));
      await manager.save(manager.create(UserRoleEntity, { userId: user.id, role: input.role }));
      if (input.role === Role.DOCTOR) {
        const doctor = await manager.save(manager.create(DoctorEntity, { userId: user.id, specialtyId: specialtyIds[0], licenseNumber: input.licenseNumber!, academicTitle: input.academicTitle ?? null, yearsExperience: input.yearsExperience!, consultationFee: 0, bioDescription: null, roomNumber: input.roomNumber!, ratingAverage: 5 }));
        for (const [index, specialtyId] of specialtyIds.entries()) await manager.save(manager.create(DoctorSpecialtyEntity, { doctorId: doctor.id, specialtyId, isPrimary: index === 0 }));
      }
      return user;
    });
  }

  async updateProfile(userId: string, input: UpdateStaffProfileInput) {
    return this.dataSource.transaction(async manager => {
      const userRepository = manager.getRepository(UserEntity);
      const user = await userRepository.findOneBy({ id: userId });
      if (!user) throw new NotFoundException('Không tìm thấy nhân sự.');
      if (input.fullName?.trim()) user.fullName = input.fullName.trim();
      if (input.phoneNumber !== undefined) user.phoneNumber = input.phoneNumber?.trim() || null;
      if (input.gender !== undefined) user.gender = input.gender;
      if (input.dateOfBirth !== undefined) user.dateOfBirth = input.dateOfBirth;
      await userRepository.save(user);
      const doctorRepository = manager.getRepository(DoctorEntity);
      const doctor = await doctorRepository.findOneBy({ userId });
      if (doctor) {
        if (input.licenseNumber?.trim()) { await this.validateLicenseNumber(input.licenseNumber, doctor.id); doctor.licenseNumber = input.licenseNumber.trim().toUpperCase(); }
        if (input.roomNumber?.trim()) doctor.roomNumber = input.roomNumber.trim();
        if (input.academicTitle !== undefined) doctor.academicTitle = input.academicTitle?.trim() || null;
        if (input.yearsExperience !== undefined) {
          if (input.yearsExperience < 0) throw new BadRequestException('Số năm kinh nghiệm không hợp lệ.');
          doctor.yearsExperience = input.yearsExperience;
        }
        if (input.specialtyIds !== undefined) {
          const specialtyIds = [...new Set(input.specialtyIds.filter(Boolean))];
          if (!specialtyIds.length) throw new BadRequestException('Bác sĩ phải thuộc ít nhất một chuyên khoa.');
          doctor.specialtyId = specialtyIds[0];
          const specialtyRepository = manager.getRepository(DoctorSpecialtyEntity);
          await specialtyRepository.delete({ doctorId: doctor.id });
          for (const [index, specialtyId] of specialtyIds.entries()) await specialtyRepository.save(specialtyRepository.create({ doctorId: doctor.id, specialtyId, isPrimary: index === 0 }));
        }
        await doctorRepository.save(doctor);
      }
      return user;
    });
  }

  async listRecurringShifts() {
    return this.dataSource.getRepository(StaffShiftAssignmentEntity).createQueryBuilder('shift')
      .innerJoin(UserEntity, 'user', 'user.id = shift.user_id')
      .innerJoin(ClinicRoomEntity, 'room', 'room.id = shift.room_id')
      .select(['shift.id AS id', `TO_CHAR(shift.shift_date, 'YYYY-MM-DD') AS "shiftDate"`, 'shift.start_time AS "startTime"', 'shift.end_time AS "endTime"', 'room.room_number AS "roomNumber"', 'shift.approval_status AS "approvalStatus"', 'shift.approved_at AS "approvedAt"', 'shift.notes AS notes', 'user.full_name AS "staffName"'])
      .orderBy('shift.shift_date', 'ASC').addOrderBy('shift.start_time', 'ASC').getRawMany();
  }

  async createShiftAssignment(input: { userId: string; roomId: string; shiftDate: string; startTime: string; endTime: string; notes?: string }) {
    if (!input.userId || !input.roomId || !input.shiftDate || !input.startTime || !input.endTime || input.endTime <= input.startTime) throw new BadRequestException('Thông tin phân ca không hợp lệ.');
    const repository = this.dataSource.getRepository(StaffShiftAssignmentEntity);
    return repository.save(repository.create({ ...input, notes: input.notes?.trim() || null, approvalStatus: 'PENDING', approvedBy: null, approvedAt: null }));
  }

  async updateShiftAssignment(shiftId: string, input: Partial<{ shiftDate: string; startTime: string; endTime: string; roomId: string; notes: string; approvalStatus: ShiftApprovalStatus }>) {
    const repository = this.dataSource.getRepository(StaffShiftAssignmentEntity);
    const shift = await repository.findOneBy({ id: shiftId });
    if (!shift) throw new NotFoundException('Không tìm thấy phân ca trực.');
    Object.assign(shift, input);
    if (shift.endTime <= shift.startTime) throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu.');
    return repository.save(shift);
  }

  private async validateLicenseNumber(value: string, currentDoctorId?: string): Promise<void> {
    const licenseNumber = value.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9./-]{4,49}$/.test(licenseNumber)) throw new BadRequestException('Số CCHN chỉ gồm chữ, số, dấu chấm, gạch chéo hoặc gạch ngang (tối thiểu 5 ký tự).');
    const existing = await this.dataSource.getRepository(DoctorEntity).findOneBy({ licenseNumber });
    if (existing && existing.id !== currentDoctorId) throw new BadRequestException('Số CCHN đã được sử dụng cho bác sĩ khác.');
  }

  async approveRecurringShift(shiftId: string, approvedBy: string) {
    const repository = this.dataSource.getRepository(DoctorRecurringShiftEntity);
    const shift = await repository.findOneBy({ id: shiftId });
    if (!shift) throw new NotFoundException('Không tìm thấy cấu hình ca trực.');
    shift.approvalStatus = 'APPROVED'; shift.approvedBy = approvedBy; shift.approvedAt = new Date();
    return repository.save(shift);
  }
}
