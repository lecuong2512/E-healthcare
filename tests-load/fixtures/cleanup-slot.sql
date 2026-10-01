\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE fixture_input (
  run_id TEXT NOT NULL CHECK (run_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$')
) ON COMMIT DROP;

INSERT INTO fixture_input (run_id) VALUES (:'run_id');

CREATE OR REPLACE FUNCTION pg_temp.fixture_uuid(value TEXT)
RETURNS UUID
LANGUAGE SQL
IMMUTABLE
STRICT
AS $function$
  SELECT (
    SUBSTRING(MD5(value), 1, 8) || '-' ||
    SUBSTRING(MD5(value), 9, 4) || '-' ||
    '4' || SUBSTRING(MD5(value), 14, 3) || '-' ||
    '8' || SUBSTRING(MD5(value), 18, 3) || '-' ||
    SUBSTRING(MD5(value), 21, 12)
  )::UUID;
$function$;

CREATE TEMP TABLE fixture_identity ON COMMIT DROP AS
SELECT
  run_id,
  LEFT(MD5(run_id), 20) AS marker,
  pg_temp.fixture_uuid('card-2.6:' || run_id || ':specialty') AS specialty_id,
  pg_temp.fixture_uuid('card-2.6:' || run_id || ':doctor-user') AS doctor_user_id,
  pg_temp.fixture_uuid('card-2.6:' || run_id || ':doctor') AS doctor_id
FROM fixture_input;

-- Refuse cleanup if deterministic identifiers resolve to rows without this
-- run's ownership markers. This prevents a caller-supplied runId from deleting
-- unrelated data, even in the practically unlikely event of a UUID collision.
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fixture_identity AS expected
    JOIN doctors AS actual ON actual.id = expected.doctor_id
    WHERE actual.user_id <> expected.doctor_user_id
       OR actual.specialty_id <> expected.specialty_id
       OR actual.license_number <> 'CARD26-' || expected.marker
  ) THEN
    RAISE EXCEPTION 'Cleanup refused: doctor ownership marker does not match';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fixture_identity AS expected
    JOIN users AS actual ON actual.id = expected.doctor_user_id
    WHERE LOWER(actual.email) <> LOWER(
      'card26-' || expected.marker || '-doctor@example.invalid'
    )
  ) THEN
    RAISE EXCEPTION 'Cleanup refused: doctor user ownership marker does not match';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fixture_identity AS expected
    JOIN specialties AS actual ON actual.id = expected.specialty_id
    WHERE LOWER(actual.name) <> LOWER('Card 2.6 ' || expected.marker)
  ) THEN
    RAISE EXCEPTION 'Cleanup refused: specialty ownership marker does not match';
  END IF;
END;
$block$;

CREATE TEMP TABLE cleanup_counts (
  appointments INTEGER NOT NULL DEFAULT 0,
  slots INTEGER NOT NULL DEFAULT 0,
  doctors INTEGER NOT NULL DEFAULT 0,
  specialties INTEGER NOT NULL DEFAULT 0,
  users INTEGER NOT NULL DEFAULT 0
) ON COMMIT DROP;

INSERT INTO cleanup_counts DEFAULT VALUES;

WITH deleted AS (
  DELETE FROM appointments AS appointment
  USING fixture_identity AS identity
  WHERE appointment.doctor_id = identity.doctor_id
    AND EXISTS (
      SELECT 1
      FROM doctor_schedules AS schedule
      WHERE schedule.id = appointment.schedule_id
        AND schedule.doctor_id = identity.doctor_id
    )
  RETURNING 1
)
UPDATE cleanup_counts SET appointments = (SELECT COUNT(*) FROM deleted);

WITH deleted AS (
  DELETE FROM doctor_schedules AS schedule
  USING fixture_identity AS identity
  WHERE schedule.doctor_id = identity.doctor_id
  RETURNING 1
)
UPDATE cleanup_counts SET slots = (SELECT COUNT(*) FROM deleted);

WITH deleted AS (
  DELETE FROM doctors AS doctor
  USING fixture_identity AS identity
  WHERE doctor.id = identity.doctor_id
    AND doctor.license_number = 'CARD26-' || identity.marker
  RETURNING 1
)
UPDATE cleanup_counts SET doctors = (SELECT COUNT(*) FROM deleted);

WITH owned_users AS (
  SELECT test_user.id
  FROM users AS test_user
  CROSS JOIN fixture_identity AS identity
  WHERE test_user.email = 'card26-' || identity.marker || '-doctor@example.invalid'
     OR test_user.email LIKE 'card26-' || identity.marker || '-p%@example.invalid'
)
DELETE FROM user_roles AS role
USING owned_users
WHERE role.user_id = owned_users.id;

WITH owned_users AS (
  SELECT test_user.id
  FROM users AS test_user
  CROSS JOIN fixture_identity AS identity
  WHERE test_user.email = 'card26-' || identity.marker || '-doctor@example.invalid'
     OR test_user.email LIKE 'card26-' || identity.marker || '-p%@example.invalid'
),
deleted AS (
  DELETE FROM users AS test_user
  USING owned_users
  WHERE test_user.id = owned_users.id
  RETURNING 1
)
UPDATE cleanup_counts SET users = (SELECT COUNT(*) FROM deleted);

WITH deleted AS (
  DELETE FROM specialties AS specialty
  USING fixture_identity AS identity
  WHERE specialty.id = identity.specialty_id
    AND LOWER(specialty.name) = LOWER('Card 2.6 ' || identity.marker)
  RETURNING 1
)
UPDATE cleanup_counts SET specialties = (SELECT COUNT(*) FROM deleted);

SELECT JSON_BUILD_OBJECT(
  'runId', identity.run_id,
  'deletedAppointments', counts.appointments,
  'deletedSlots', counts.slots,
  'deletedDoctors', counts.doctors,
  'deletedSpecialties', counts.specialties,
  'deletedUsers', counts.users
)::TEXT
FROM fixture_identity AS identity
CROSS JOIN cleanup_counts AS counts;

COMMIT;
