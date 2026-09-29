import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { DateOfBirthPrecision, Gender, Role, UserStatus } from '@shared/enums';
import { UserRoleEntity } from '../../database/entities/auth.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { hashPassword } from '../../common/utils/crypto.util';
import { DoctorSpecialtyEntity } from '../../database/entities/doctor-specialty.entity';

export interface CreateStaffInput { fullName: string; email: string; password: string; role: Role; gender: Gender; dateOfBirth: string; specialtyId?: string; specialtyIds?: string[]; licenseNumber?: string; roomNumber?: string; academicTitle?: string; yearsExperience?: number; }

@Injectable()
export class StaffAdminService {
  constructor(private readonly dataSource: DataSource) {}
  async list(search = '', status?: UserStatus) {
    const query = this.dataSource.getRepository(UserEntity).createQueryBuilder('user').leftJoinAndSelect('user_roles', 'role', 'role.user_id = user.id').orderBy('user.created_at', 'DESC');
    if (search.trim()) query.andWhere('(LOWER(user.full_name) LIKE :search OR LOWER(user.email) LIKE :search)', { search: `%${search.trim().toLowerCase()}%` });
    if (status) query.andWhere('user.status = :status', { status });
    const users = await query.getMany();
    return { data: users, summary: { active: users.filter(user => user.status === UserStatus.ACTIVE).length, pending: users.filter(user => user.status === UserStatus.PENDING_VERIFY).length, blocked: users.filter(user => user.status === UserStatus.BLOCKED).length } };
  }
  async changeStatus(userId: string, status: UserStatus) {
    const repository = this.dataSource.getRepository(UserEntity); const user = await repository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Không tìm thấy nhân sự.'); user.status = status; return repository.save(user);
  }
  async create(input: CreateStaffInput) {
    const specialtyIds = [...new Set(input.specialtyIds?.filter(Boolean) ?? (input.specialtyId ? [input.specialtyId] : []))];
    if (input.role === Role.DOCTOR && (!specialtyIds.length || !input.licenseNumber || !input.roomNumber || input.yearsExperience == null || input.yearsExperience < 0)) throw new BadRequestException('Bác sĩ cần CCHN, chuyên khoa, phòng khám và số năm kinh nghiệm.');
    return this.dataSource.transaction(async manager => {
      const user = await manager.save(manager.create(UserEntity, { fullName: input.fullName.trim(), email: input.email.trim().toLowerCase(), phoneNumber: null, passwordHash: await hashPassword(input.password), gender: input.gender, dateOfBirth: input.dateOfBirth, status: UserStatus.ACTIVE, dateOfBirthPrecision: DateOfBirthPrecision.FULL_DATE, failedLoginAttempts: 0, loginLockedUntil: null, googleSubject: null }));
      await manager.save(manager.create(UserRoleEntity, { userId: user.id, role: input.role }));
      if (input.role === Role.DOCTOR) { const doctor = await manager.save(manager.create(DoctorEntity, { userId: user.id, specialtyId: specialtyIds[0], licenseNumber: input.licenseNumber!, academicTitle: input.academicTitle ?? null, yearsExperience: input.yearsExperience!, consultationFee: 0, bioDescription: null, roomNumber: input.roomNumber!, ratingAverage: 5 })); for (const [index, specialtyId] of specialtyIds.entries()) await manager.save(manager.create(DoctorSpecialtyEntity, { doctorId: doctor.id, specialtyId, isPrimary: index === 0 })); }
      return user;
    });
  }
}
