import { DataSource } from 'typeorm';
import { StaffAdminService } from '../src/modules/admin/staff-admin.service';
import { Gender, Role, UserStatus } from '@shared/enums';

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
});
