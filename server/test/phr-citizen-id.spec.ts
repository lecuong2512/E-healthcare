import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Gender } from '@shared/enums';
import { UpdatePhrProfileRequest } from '@shared/interfaces';
import { DataSource, QueryFailedError } from 'typeorm';
import { PersonalHealthProfileEntity } from '../src/database/entities/auth.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { PhrService } from '../src/modules/phr/phr.service';
import { UpdatePhrProfileDto } from '../src/modules/phr/dto/update-phr-profile.dto';
import { WalkInDto } from '../src/modules/reception/dto/walk-in.dto';

describe('PHR citizen ID', () => {
  const request: UpdatePhrProfileRequest = {
    fullName: 'Nguyễn Văn A',
    citizenId: ' 012345678901 ',
    gender: Gender.MALE,
    dateOfBirth: '1989-01-01',
    address: '',
    healthInsurance: '',
    bloodType: '',
    allergies: '',
    chronicDiseases: '',
    surgeryHistory: '',
  };

  it('accepts a blank PHR ID and validates supplied CMND/CCCD formats', () => {
    for (const citizenId of ['', '123456789', '012345678901']) {
      const dto = plainToInstance(UpdatePhrProfileDto, { ...request, citizenId });
      expect(validateSync(dto).find((error) => error.property === 'citizenId')).toBeUndefined();
    }
    const invalid = plainToInstance(UpdatePhrProfileDto, { ...request, citizenId: 'unknown' });
    expect(validateSync(invalid).find((error) => error.property === 'citizenId')).toBeDefined();
  });

  it('accepts optional walk-in ID and rejects malformed supplied values', () => {
    const base = {
      scheduleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      fullName: 'Nguyễn Văn A',
      phone: '0912345678',
      birthYear: 1989,
      gender: Gender.MALE,
      reasonForVisit: 'Đau đầu',
      paymentMethod: 'CASH',
      amountTendered: 300000,
    };
    for (const citizenId of [undefined, '123456789', '012345678901']) {
      const dto = plainToInstance(WalkInDto, { ...base, citizenId });
      expect(validateSync(dto).find((error) => error.property === 'citizenId')).toBeUndefined();
    }
    const invalid = plainToInstance(WalkInDto, { ...base, citizenId: 'unknown' });
    expect(validateSync(invalid).find((error) => error.property === 'citizenId')).toBeDefined();
  });

  it('normalizes an omitted ID to null so multiple patients can leave it blank', async () => {
    const user = { id: 'patient-1', fullName: 'Nguyễn Văn A' } as UserEntity;
    const phr = { userId: user.id, citizenId: '012345678901' } as PersonalHealthProfileEntity;
    const save = jest.fn(async () => undefined);
    const database = {
      getRepository: jest.fn((entity) => ({
        findOne: jest.fn(async () => entity === UserEntity ? user : phr),
      })),
      transaction: jest.fn(async (work) => work({ save })),
    };
    const service = new PhrService(database as unknown as DataSource);
    await service.updateMyPhr(user.id, { ...request, citizenId: '   ' });
    expect(save).toHaveBeenCalledWith(PersonalHealthProfileEntity, expect.objectContaining({
      citizenId: null,
    }));
  });

  it('returns a conflict when another PHR owns the ID', async () => {
    const user = { id: 'patient-1', fullName: 'Nguyễn Văn A' } as UserEntity;
    const phr = { userId: user.id, citizenId: null } as PersonalHealthProfileEntity;
    const duplicate = new QueryFailedError('UPDATE personal_health_profiles', [],
      Object.assign(new Error('duplicate'), { code: '23505', constraint: 'uq_phr_citizen_id' }));
    const database = {
      getRepository: jest.fn((entity) => ({
        findOne: jest.fn(async () => entity === UserEntity ? user : phr),
      })),
      transaction: jest.fn(async () => { throw duplicate; }),
    };
    const service = new PhrService(database as unknown as DataSource);
    await expect(service.updateMyPhr(user.id, request)).rejects.toThrow(ConflictException);
  });
});
