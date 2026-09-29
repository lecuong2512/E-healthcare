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
    await expect(service.create({ fullName: 'BS Nguyễn An', email: 'an@example.test', password: 'Secret!123', role: Role.DOCTOR, gender: Gender.MALE, dateOfBirth: '1980-01-01', specialtyId: '11111111-1111-4111-8111-111111111111', licenseNumber: 'CCHN-01', roomNumber: 'P.201' })).resolves.toMatchObject({ fullName: 'BS Nguyễn An' });
    expect(manager.save).toHaveBeenCalled();
  });
});
