\set ON_ERROR_STOP on

-- Run as the database/schema owner with values supplied through psql -v.
-- Example values are intentionally absent; passwords must come from a secret store.
\if :{?app_role}
\else
  \echo 'Missing -v app_role=...'
  \quit 2
\endif
\if :{?app_password}
\else
  \echo 'Missing -v app_password=...'
  \quit 2
\endif
\if :{?backup_role}
\else
  \echo 'Missing -v backup_role=...'
  \quit 2
\endif

SELECT format(
  'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_role', :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role')
\gexec

SELECT format(
  'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L',
  :'app_role', :'app_password'
)
\gexec

SELECT format(
  'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  :'backup_role'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'backup_role')
\gexec

GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_role";
GRANT USAGE ON SCHEMA public TO :"app_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";

-- Global audit is append-only for the application even if a future grant is broad.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM :"app_role";
GRANT SELECT, INSERT ON TABLE audit_logs TO :"app_role";

-- pgBackRest executes as the PostgreSQL OS account in the reference deployment.
-- This role is a capability marker for production IAM; do not grant it to the API.
COMMENT ON ROLE :"backup_role" IS
  'E-Healthcare backup operator role; membership and login are managed by DevOps';
