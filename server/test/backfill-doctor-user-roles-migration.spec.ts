import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Backfill doctor user roles migration', () => {
  const migrationPath = resolve(
    __dirname,
    '../src/database/migrations/1790730000000-backfill-doctor-user-roles.ts',
  );

  it('backfills ROLE_DOCTOR for existing doctor profiles without duplicating roles', () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) return;

    const source = readFileSync(migrationPath, 'utf8');
    expect(source).toContain('INSERT INTO user_roles');
    expect(source).toContain("'ROLE_DOCTOR'::user_role_enum");
    expect(source).toContain('FROM doctors');
    expect(source).toContain('ON CONFLICT (user_id, role) DO NOTHING');

    const dataSourceOptions = readFileSync(
      resolve(__dirname, '../src/database/database-options.ts'),
      'utf8',
    );
    expect(dataSourceOptions).toContain(
      'BackfillDoctorUserRoles1790730000000,',
    );
  });
});
