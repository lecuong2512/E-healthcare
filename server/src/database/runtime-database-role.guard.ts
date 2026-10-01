import { DataSource } from 'typeorm';
import { environment } from '../config/environment';

interface RuntimeRoleRow {
  database_user: string;
  is_superuser: boolean;
  can_create_database: boolean;
  can_create_role: boolean;
  can_replicate: boolean;
  can_bypass_rls: boolean;
  owns_audit_logs: boolean;
  can_create_in_public_schema: boolean;
  audit_table_exists: boolean;
  can_select_audit: boolean;
  can_insert_audit: boolean;
  can_update_audit: boolean;
  can_delete_audit: boolean;
  can_truncate_audit: boolean;
}

export function shouldEnforceRuntimeDatabaseRole(): boolean {
  const nodeEnvironment = environment.NODE_ENV?.trim().toLowerCase() ?? '';
  if (['production', 'staging'].includes(nodeEnvironment)) return true;
  const configured = environment.ENFORCE_RUNTIME_DB_ROLE?.trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  return false;
}

export async function assertLeastPrivilegeRuntimeRole(
  dataSource: DataSource,
): Promise<void> {
  if (!shouldEnforceRuntimeDatabaseRole()) return;

  const rows = (await dataSource.query(`
    SELECT
      current_user AS database_user,
      COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), FALSE) AS is_superuser,
      COALESCE((SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user), FALSE) AS can_create_database,
      COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = current_user), FALSE) AS can_create_role,
      COALESCE((SELECT rolreplication FROM pg_roles WHERE rolname = current_user), FALSE) AS can_replicate,
      COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), FALSE) AS can_bypass_rls,
      COALESCE(pg_get_userbyid(c.relowner) = current_user, FALSE) AS owns_audit_logs,
      has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public_schema,
      to_regclass('public.audit_logs') IS NOT NULL AS audit_table_exists,
      COALESCE(has_table_privilege(current_user, to_regclass('public.audit_logs'), 'SELECT'), FALSE) AS can_select_audit,
      COALESCE(has_table_privilege(current_user, to_regclass('public.audit_logs'), 'INSERT'), FALSE) AS can_insert_audit,
      COALESCE(has_table_privilege(current_user, to_regclass('public.audit_logs'), 'UPDATE'), FALSE) AS can_update_audit,
      COALESCE(has_table_privilege(current_user, to_regclass('public.audit_logs'), 'DELETE'), FALSE) AS can_delete_audit,
      COALESCE(has_table_privilege(current_user, to_regclass('public.audit_logs'), 'TRUNCATE'), FALSE) AS can_truncate_audit
    FROM (SELECT to_regclass('public.audit_logs') AS audit_table) target
    LEFT JOIN pg_class c ON c.oid = target.audit_table
  `)) as RuntimeRoleRow[];
  const role = rows[0];
  const invalid =
    !role ||
    role.is_superuser ||
    role.can_create_database ||
    role.can_create_role ||
    role.can_replicate ||
    role.can_bypass_rls ||
    role.owns_audit_logs ||
    role.can_create_in_public_schema ||
    !role.audit_table_exists ||
    !role.can_select_audit ||
    !role.can_insert_audit ||
    role.can_update_audit ||
    role.can_delete_audit ||
    role.can_truncate_audit;

  if (invalid) {
    throw new Error(
      `Unsafe runtime database role${role?.database_user ? `: ${role.database_user}` : ''}. ` +
        'The API requires a non-owner, non-superuser role with SELECT/INSERT-only access to audit_logs.',
    );
  }
}
