import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { Role } from '@shared/enums';
import { OwnDoctorGuard } from '../src/common/guards/own-doctor.guard';

describe('OwnDoctorGuard', () => {
  const existsBy = jest.fn();
  const dataSource = {
    getRepository: jest.fn(() => ({ existsBy })),
  } as unknown as DataSource;
  const reflector = {
    getAllAndOverride: jest.fn(() => 'doctorId'),
  } as unknown as Reflector;

  const context = (userId: string, doctorId: string) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { userId, role: Role.DOCTOR },
          params: { doctorId },
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('maps JWT users.id to the requested doctors.id', async () => {
    existsBy.mockResolvedValue(true);
    const guard = new OwnDoctorGuard(reflector, dataSource);

    await expect(
      guard.canActivate(context('user-id', 'doctor-id')),
    ).resolves.toBe(true);
    expect(existsBy).toHaveBeenCalledWith({
      id: 'doctor-id',
      userId: 'user-id',
    });
  });

  it('rejects access to another doctor profile', async () => {
    existsBy.mockResolvedValue(false);
    const guard = new OwnDoctorGuard(reflector, dataSource);

    await expect(
      guard.canActivate(context('other-user-id', 'doctor-id')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
