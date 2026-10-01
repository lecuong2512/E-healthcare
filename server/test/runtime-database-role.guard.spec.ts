import './test-environment';
import { DataSource } from 'typeorm';
import { environment } from '../src/config/environment';
import {
  assertLeastPrivilegeRuntimeRole,
  shouldEnforceRuntimeDatabaseRole,
} from '../src/database/runtime-database-role.guard';

describe('Runtime database role guard', () => {
  const originalNodeEnvironment = environment.NODE_ENV;
  const originalEnforcement = environment.ENFORCE_RUNTIME_DB_ROLE;

  afterEach(() => {
    if (originalNodeEnvironment === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = originalNodeEnvironment;
    if (originalEnforcement === undefined) delete environment.ENFORCE_RUNTIME_DB_ROLE;
    else environment.ENFORCE_RUNTIME_DB_ROLE = originalEnforcement;
  });

  it('enforces least privilege automatically in staging and production', () => {
    environment.ENFORCE_RUNTIME_DB_ROLE = 'false';
    environment.NODE_ENV = 'staging';
    expect(shouldEnforceRuntimeDatabaseRole()).toBe(true);
    environment.NODE_ENV = 'production';
    expect(shouldEnforceRuntimeDatabaseRole()).toBe(true);
  });

  it('accepts a runtime role with SELECT and INSERT-only audit access', async () => {
    environment.ENFORCE_RUNTIME_DB_ROLE = 'true';
    const query = jest.fn().mockResolvedValue([
      {
        database_user: 'ehealth_app_runtime',
        is_superuser: false,
        can_create_database: false,
        can_create_role: false,
        can_replicate: false,
        can_bypass_rls: false,
        owns_audit_logs: false,
        can_create_in_public_schema: false,
        audit_table_exists: true,
        can_select_audit: true,
        can_insert_audit: true,
        can_update_audit: false,
        can_delete_audit: false,
        can_truncate_audit: false,
      },
    ]);

    await expect(
      assertLeastPrivilegeRuntimeRole({ query } as unknown as DataSource),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['superuser', { is_superuser: true }],
    ['database creator', { can_create_database: true }],
    ['role creator', { can_create_role: true }],
    ['replication role', { can_replicate: true }],
    ['RLS bypass role', { can_bypass_rls: true }],
    ['table owner', { owns_audit_logs: true }],
    ['public schema creator', { can_create_in_public_schema: true }],
    ['UPDATE privilege', { can_update_audit: true }],
    ['DELETE privilege', { can_delete_audit: true }],
    ['TRUNCATE privilege', { can_truncate_audit: true }],
  ])('rejects an unsafe %s runtime role', async (_label, override) => {
    environment.ENFORCE_RUNTIME_DB_ROLE = 'true';
    const query = jest.fn().mockResolvedValue([
      {
        database_user: 'unsafe_runtime',
        is_superuser: false,
        can_create_database: false,
        can_create_role: false,
        can_replicate: false,
        can_bypass_rls: false,
        owns_audit_logs: false,
        can_create_in_public_schema: false,
        audit_table_exists: true,
        can_select_audit: true,
        can_insert_audit: true,
        can_update_audit: false,
        can_delete_audit: false,
        can_truncate_audit: false,
        ...override,
      },
    ]);

    await expect(
      assertLeastPrivilegeRuntimeRole({ query } as unknown as DataSource),
    ).rejects.toThrow('Unsafe runtime database role');
  });
});
