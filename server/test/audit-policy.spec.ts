import './test-environment';
import { AuditAction, AuditOutcome, Role } from '@shared/enums';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuditLogEntity } from '../src/database/entities/audit-log.entity';
import { UserEntity } from '../src/database/entities/user.entity';

describe('Global audit metadata policy', () => {
  const audit = new AuditService();
  const saved: AuditLogEntity[] = [];
  const auditRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      saved.push(value);
      return value;
    }),
  };
  const userRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'actor-1', fullName: 'Actor' }),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === UserEntity ? userRepository : auditRepository,
    ),
  } as any;
  const context = {
    actorId: 'actor-1',
    actorRole: Role.DOCTOR,
    ipAddress: '203.0.113.10',
    userAgent: 'audit-policy-test',
    requestId: 'request-1',
  };

  beforeEach(() => {
    saved.length = 0;
    jest.clearAllMocks();
  });

  it('accepts only metadata fields approved for the action', async () => {
    await audit.record(manager, context, {
      action: AuditAction.UPDATE_EMR,
      outcome: AuditOutcome.SUCCESS,
      metadata: { operation: 'UPDATE' },
    });

    expect(saved[0].metadata).toEqual({ operation: 'UPDATE' });
  });

  it.each(['clinicalNotes', 'token', 'requestBody', 'medicineName'])(
    'rejects sensitive metadata field %s',
    async (field) => {
      await expect(
        audit.record(manager, context, {
          action: AuditAction.UPDATE_EMR,
          metadata: { [field]: 'must-not-be-persisted' },
        }),
      ).rejects.toThrow('Audit metadata field is not allowed');
      expect(auditRepository.save).not.toHaveBeenCalled();
    },
  );
});
