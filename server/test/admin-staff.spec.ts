import { DataSource } from 'typeorm';
import { StaffAdminService } from '../src/modules/admin/staff-admin.service';
import { Gender, Role, UserStatus } from '@shared/enums';
import { DoctorRecurringShiftEntity } from '../src/database/entities/doctor-recurring-shift.entity';
import { UserEntity } from '../src/database/entities/user.entity';

describe('StaffAdminService', () => {
  it('changes an employee account state without deleting the account', async () => {
    const user = { id: 'u1', status: UserStatus.ACTIVE };
    const repository = { findOneBy: jest.fn().mockResolvedValue(user), save: jest.fn().mockResolvedValue({ ...user, status: UserStatus.BLOCKED }) };
    const service = new StaffAdminService({ getRepository: jest.fn(() => repository) } as unknown as DataSource);
    await expect(service.changeStatus('u1', UserStatus.BLOCKED)).resolves.toMatchObject({ status: UserStatus.BLOCKED });
    expect(repository.save).toHaveBeenCalledWith({ id: 'u1', status: UserStatus.BLOCKED });
  });

  it('creates a doctor user with its login role and professional profile', async () => {
    const manager = { getRepository: jest.fn(), create: jest.fn((_: unknown, value: unknown) => value), save: jest.fn(async (value: unknown) => value) };
    const dataSource = { transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager)) } as unknown as DataSource;
    const service = new StaffAdminService(dataSource);
    await expect(service.create({ fullName: 'BS Nguyễn An', email: 'an@example.test', password: 'Secret!123', role: Role.DOCTOR, gender: Gender.MALE, dateOfBirth: '1980-01-01', specialtyId: '11111111-1111-4111-8111-111111111111', licenseNumber: 'CCHN-01', roomNumber: 'P.201', yearsExperience: 5 })).resolves.toMatchObject({ fullName: 'BS Nguyễn An' });
    expect(manager.save).toHaveBeenCalled();
  });

  it('stores each unique specialty when creating a doctor', async () => {
    const manager = { getRepository: jest.fn(), create: jest.fn((_: unknown, value: unknown) => value), save: jest.fn(async (value: any) => value.userId ? { ...value, id: value.id ?? 'doctor-1' } : value) };
    const dataSource = { transaction: jest.fn(async (work: (m: typeof manager) => unknown) => work(manager)) } as unknown as DataSource;
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

  it('updates a doctor professional profile without creating a new account', async () => {
    const user = { id: 'u1', fullName: 'BS Cu', status: UserStatus.ACTIVE };
    const doctor = { id: 'd1', userId: 'u1', roomNumber: 'P.101', licenseNumber: 'OLD', yearsExperience: 2 };
    const userRepo = { findOneBy: jest.fn().mockResolvedValue(user), save: jest.fn(async (value) => value) };
    const doctorRepo = { findOneBy: jest.fn().mockResolvedValue(doctor), save: jest.fn(async (value) => value) };
    const service = new StaffAdminService({ getRepository: jest.fn((entity) => entity === UserEntity ? userRepo : doctorRepo) } as unknown as DataSource);

    await expect(service.updateProfile('u1', { fullName: 'BS Moi', roomNumber: 'P.202', licenseNumber: 'CCHN-NEW', yearsExperience: 9 })).resolves.toMatchObject({ fullName: 'BS Moi' });
    expect(doctorRepo.save).toHaveBeenCalledWith(expect.objectContaining({ roomNumber: 'P.202', licenseNumber: 'CCHN-NEW', yearsExperience: 9 }));
  });
});
