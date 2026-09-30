import { DataSource } from 'typeorm';
import { StaffAdminService } from '../src/modules/admin/staff-admin.service';
import { Gender, Role, UserStatus } from '@shared/enums';
import { DoctorRecurringShiftEntity } from '../src/database/entities/doctor-recurring-shift.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { UserRoleEntity } from '../src/database/entities/auth.entity';
import { DoctorEntity } from '../src/database/entities/doctor.entity';
import { DoctorSpecialtyEntity } from '../src/database/entities/doctor-specialty.entity';
import { ClinicRoomEntity } from '../src/database/entities/clinic-room.entity';

describe('StaffAdminService', () => {
  it('lists staff with their persisted login role', async () => {
    const users = [{ id: 'u1', fullName: 'BS An', email: 'an@example.test', status: UserStatus.ACTIVE }];
    const query = {
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(users),
    };
    const userRepository = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const roleRepository = { find: jest.fn().mockResolvedValue([{ userId: 'u1', role: Role.DOCTOR }]) };
    const doctorRepository = { find: jest.fn().mockResolvedValue([]) };
    const service = new StaffAdminService({
      getRepository: jest.fn((entity) => entity === UserEntity ? userRepository : entity === UserRoleEntity ? roleRepository : doctorRepository),
    } as unknown as DataSource);

    await expect(service.list()).resolves.toMatchObject({
      data: [{ id: 'u1', role: Role.DOCTOR }],
    });
  });

  it('changes an employee account state without deleting the account', async () => {
    const user = { id: 'u1', status: UserStatus.ACTIVE };
    const repository = { findOneBy: jest.fn().mockResolvedValue(user), save: jest.fn().mockResolvedValue({ ...user, status: UserStatus.BLOCKED }) };
    const service = new StaffAdminService({ getRepository: jest.fn(() => repository) } as unknown as DataSource);
    await expect(service.changeStatus('u1', UserStatus.BLOCKED)).resolves.toMatchObject({ status: UserStatus.BLOCKED });
    expect(repository.save).toHaveBeenCalledWith({ id: 'u1', status: UserStatus.BLOCKED });
  });

  it('lists unique room options persisted in doctor profiles', async () => {
    const service = new StaffAdminService({
      getRepository: jest.fn(() => ({ find: jest.fn().mockResolvedValue([{ roomNumber: 'P.101' }, { roomNumber: 'P.201' }]) })),
    } as unknown as DataSource);

    await expect(service.listRooms()).resolves.toEqual(['P.101', 'P.201']);
  });

  it('updates the room catalog name and availability without changing its code', async () => {
    const room = { id: 'room-1', roomNumber: 'P001', roomName: 'Phòng cũ', isActive: true };
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(room),
      save: jest.fn().mockImplementation(async value => value),
    };
    const service = new StaffAdminService({
      getRepository: jest.fn((entity) => entity === ClinicRoomEntity ? repository : undefined),
    } as unknown as DataSource);

    await expect((service as any).updateRoom('room-1', { roomName: 'Phòng khám nội', isActive: false, specialtyId: 'sp-1', roomType: 'CONSULTATION', location: 'Tầng 2 - Khu A', notes: 'Ưu tiên người cao tuổi' })).resolves.toMatchObject({
      roomNumber: 'P001', roomName: 'Phòng khám nội', isActive: false, specialtyId: 'sp-1', roomType: 'CONSULTATION', location: 'Tầng 2 - Khu A', notes: 'Ưu tiên người cao tuổi',
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ roomNumber: 'P001', roomName: 'Phòng khám nội', isActive: false, specialtyId: 'sp-1', roomType: 'CONSULTATION', location: 'Tầng 2 - Khu A', notes: 'Ưu tiên người cao tuổi' }));
  });

  it('creates a doctor user with its login role and professional profile', async () => {
    const manager = { getRepository: jest.fn(), create: jest.fn((_: unknown, value: unknown) => value), save: jest.fn(async (value: unknown) => value) };
    const dataSource = { transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager)), getRepository: jest.fn(() => ({ findOneBy: jest.fn().mockResolvedValue(null) })) } as unknown as DataSource;
    const service = new StaffAdminService(dataSource);
    await expect(service.create({ fullName: 'BS Nguyễn An', email: 'an@example.test', password: 'Secret!123', role: Role.DOCTOR, gender: Gender.MALE, dateOfBirth: '1980-01-01', specialtyId: '11111111-1111-4111-8111-111111111111', licenseNumber: 'CCHN-01', roomNumber: 'P.201', yearsExperience: 5 })).resolves.toMatchObject({ fullName: 'BS Nguyễn An' });
    expect(manager.save).toHaveBeenCalled();
  });

  it('stores and returns the shared user profile for every staff role', async () => {
    const savedUser = { id: 'receptionist-1', fullName: 'Lê Mai', email: 'mai@example.test', phoneNumber: '0901234567', gender: Gender.FEMALE, dateOfBirth: '1995-08-20', status: UserStatus.ACTIVE };
    const manager = { getRepository: jest.fn(), create: jest.fn((_: unknown, value: unknown) => value), save: jest.fn(async (value: any) => value.fullName ? savedUser : value) };
    const service = new StaffAdminService({ transaction: jest.fn(async work => work(manager)) } as unknown as DataSource);

    await service.create({ fullName: 'Lê Mai', email: 'mai@example.test', phoneNumber: '0901234567', password: 'Secret!123', role: Role.RECEPTIONIST, gender: Gender.FEMALE, dateOfBirth: '1995-08-20' } as any);

    expect(manager.create).toHaveBeenCalledWith(UserEntity, expect.objectContaining({ phoneNumber: '0901234567' }));
  });

  it('stores each unique specialty when creating a doctor', async () => {
    const manager = { getRepository: jest.fn(), create: jest.fn((_: unknown, value: unknown) => value), save: jest.fn(async (value: any) => value.userId ? { ...value, id: value.id ?? 'doctor-1' } : value) };
    const dataSource = { transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager)), getRepository: jest.fn(() => ({ findOneBy: jest.fn().mockResolvedValue(null) })) } as unknown as DataSource;
    const service = new StaffAdminService(dataSource);
    await service.create({ fullName: 'BS An', email: 'multi@example.test', password: 'Secret!123', role: Role.DOCTOR, gender: Gender.MALE, dateOfBirth: '1980-01-01', specialtyIds: ['sp-1', 'sp-2', 'sp-1'], licenseNumber: 'CCHN-02', roomNumber: 'P.202', yearsExperience: 8 } as any);
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ specialtyId: 'sp-1', isPrimary: true }));
    expect(manager.save).toHaveBeenCalledWith(expect.objectContaining({ specialtyId: 'sp-2', isPrimary: false }));
  });

  it('approves a pending recurring doctor shift with an auditable approver', async () => {
    const shift = { id: 'shift-1', approvalStatus: 'PENDING', approvedBy: null, approvedAt: null };
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(shift),
      save: jest.fn().mockImplementation(async (value: unknown) => value),
    };
    const service = new StaffAdminService({
      getRepository: jest.fn((entity) => entity === DoctorRecurringShiftEntity ? repository : undefined),
    } as unknown as DataSource);

    await expect(service.approveRecurringShift('shift-1', 'admin-1')).resolves.toMatchObject({
      approvalStatus: 'APPROVED', approvedBy: 'admin-1',
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ approvalStatus: 'APPROVED', approvedBy: 'admin-1' }));
  });

  it('creates a dated shift assignment from a staff member and clinic room', async () => {
    const repository = { create: jest.fn(value => value), save: jest.fn(async value => ({ id: 'shift-1', ...value })) };
    const service = new StaffAdminService({ getRepository: jest.fn(() => repository) } as unknown as DataSource);

    await expect((service as any).createShiftAssignment({ userId: 'staff-1', roomId: 'room-1', shiftDate: '2026-10-01', startTime: '08:00', endTime: '12:00', notes: 'Ca sáng' })).resolves.toMatchObject({
      userId: 'staff-1', roomId: 'room-1', shiftDate: '2026-10-01', startTime: '08:00', endTime: '12:00', approvalStatus: 'PENDING',
    });
  });

  it('updates a doctor professional profile without creating a new account', async () => {
    const user = { id: 'u1', fullName: 'BS Cu', status: UserStatus.ACTIVE };
    const doctor = { id: 'd1', userId: 'u1', roomNumber: 'P.101', licenseNumber: 'OLD', yearsExperience: 2 };
    const userRepo = { findOneBy: jest.fn().mockResolvedValue(user), save: jest.fn(async (value) => value) };
    const doctorRepo = { findOneBy: jest.fn().mockResolvedValue(doctor), save: jest.fn(async (value) => value) };
    const manager = { getRepository: jest.fn((entity) => entity === UserEntity ? userRepo : doctorRepo) };
    const service = new StaffAdminService({ transaction: jest.fn(async work => work(manager)), getRepository: jest.fn(() => ({ findOneBy: jest.fn().mockResolvedValue(null) })) } as unknown as DataSource);

    await expect(service.updateProfile('u1', { fullName: 'BS Moi', roomNumber: 'P.202', licenseNumber: 'CCHN-NEW', yearsExperience: 9 })).resolves.toMatchObject({ fullName: 'BS Moi' });
    expect(doctorRepo.save).toHaveBeenCalledWith(expect.objectContaining({ roomNumber: 'P.202', licenseNumber: 'CCHN-NEW', yearsExperience: 9 }));
  });

  it('returns doctor professional details and all assigned specialties', async () => {
    const users = [{ id: 'u1', fullName: 'BS An', email: 'an@example.test', status: UserStatus.ACTIVE }];
    const query = {
      andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(users),
    };
    const repositories = new Map<unknown, unknown>([
      [UserEntity, { createQueryBuilder: jest.fn().mockReturnValue(query) }],
      [UserRoleEntity, { find: jest.fn().mockResolvedValue([{ userId: 'u1', role: Role.DOCTOR }]) }],
      [DoctorEntity, { find: jest.fn().mockResolvedValue([{ id: 'd1', userId: 'u1', licenseNumber: 'CCHN-01', academicTitle: 'ThS.BS', yearsExperience: 7, roomNumber: 'P.201' }]) }],
      [DoctorSpecialtyEntity, { find: jest.fn().mockResolvedValue([{ doctorId: 'd1', specialtyId: 'sp-1' }, { doctorId: 'd1', specialtyId: 'sp-2' }]) }],
    ]);
    const service = new StaffAdminService({ getRepository: jest.fn((entity) => repositories.get(entity)) } as unknown as DataSource);

    await expect(service.list()).resolves.toMatchObject({
      data: [{ id: 'u1', licenseNumber: 'CCHN-01', academicTitle: 'ThS.BS', yearsExperience: 7, roomNumber: 'P.201', specialtyIds: ['sp-1', 'sp-2'] }],
    });
  });

  it('replaces a doctor specialty assignments when updating the profile', async () => {
    const user = { id: 'u1', fullName: 'BS An', status: UserStatus.ACTIVE };
    const doctor = { id: 'd1', userId: 'u1', specialtyId: 'old-sp', roomNumber: 'P.101', licenseNumber: 'OLD', yearsExperience: 2 };
    const userRepo = { findOneBy: jest.fn().mockResolvedValue(user), save: jest.fn(async value => value) };
    const doctorRepo = { findOneBy: jest.fn().mockResolvedValue(doctor), save: jest.fn(async value => value) };
    const specialtyRepo = { delete: jest.fn(), create: jest.fn(value => value), save: jest.fn(async value => value) };
    const manager = { getRepository: jest.fn((entity) => entity === UserEntity ? userRepo : entity === DoctorEntity ? doctorRepo : specialtyRepo) };
    const service = new StaffAdminService({ transaction: jest.fn(async work => work(manager)) } as unknown as DataSource);

    await service.updateProfile('u1', { roomNumber: 'B.305', specialtyIds: ['sp-1', 'sp-2', 'sp-1'] } as any);

    expect(doctorRepo.save).toHaveBeenCalledWith(expect.objectContaining({ specialtyId: 'sp-1', roomNumber: 'B.305' }));
    expect(specialtyRepo.delete).toHaveBeenCalledWith({ doctorId: 'd1' });
    expect(specialtyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ doctorId: 'd1', specialtyId: 'sp-1', isPrimary: true }));
    expect(specialtyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ doctorId: 'd1', specialtyId: 'sp-2', isPrimary: false }));
  });
});
