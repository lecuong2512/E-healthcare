\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE fixture_input (
  run_id TEXT NOT NULL CHECK (run_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$'),
  contender_count INTEGER NOT NULL CHECK (contender_count BETWEEN 2 AND 10000),
  slot_count INTEGER NOT NULL CHECK (slot_count BETWEEN 1 AND 10000)
) ON COMMIT DROP;

INSERT INTO fixture_input (run_id, contender_count, slot_count)
VALUES (:'run_id', :'contender_count'::INTEGER, :'slot_count'::INTEGER);

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
  input.run_id,
  input.contender_count,
  input.slot_count,
  LEFT(MD5(input.run_id), 20) AS marker,
  pg_temp.fixture_uuid('card-2.6:' || input.run_id || ':specialty') AS specialty_id,
  pg_temp.fixture_uuid('card-2.6:' || input.run_id || ':doctor-user') AS doctor_user_id,
  pg_temp.fixture_uuid('card-2.6:' || input.run_id || ':doctor') AS doctor_id
FROM fixture_input AS input;

CREATE TEMP TABLE fixture_users ON COMMIT DROP AS
SELECT
  identity.doctor_user_id AS id,
  'card26-' || identity.marker || '-doctor@example.invalid' AS email,
  'Card 2.6 Doctor ' || identity.run_id AS full_name,
  'ROLE_DOCTOR'::user_role_enum AS role,
  0 AS ordinal
FROM fixture_identity AS identity
UNION ALL
SELECT
  pg_temp.fixture_uuid(
    'card-2.6:' || identity.run_id || ':patient:' || series.ordinal::TEXT
  ) AS id,
  'card26-' || identity.marker || '-p' ||
    LPAD(series.ordinal::TEXT, 5, '0') || '@example.invalid' AS email,
  'Card 2.6 Patient ' || LPAD(series.ordinal::TEXT, 5, '0') ||
    ' ' || identity.run_id AS full_name,
  'ROLE_PATIENT'::user_role_enum AS role,
  series.ordinal
FROM fixture_identity AS identity
CROSS JOIN LATERAL GENERATE_SERIES(1, identity.contender_count) AS series(ordinal);

CREATE TEMP TABLE fixture_slots ON COMMIT DROP AS
SELECT
  pg_temp.fixture_uuid(
    'card-2.6:' || identity.run_id || ':slot:' || series.ordinal::TEXT
  ) AS id,
  identity.doctor_id,
  CURRENT_DATE + 7 + ((series.ordinal - 1) / 32)::INTEGER AS slot_date,
  (TIME '08:00:00' + (((series.ordinal - 1) % 32) * INTERVAL '15 minutes'))::TIME AS start_time,
  (TIME '08:15:00' + (((series.ordinal - 1) % 32) * INTERVAL '15 minutes'))::TIME AS end_time,
  series.ordinal
FROM fixture_identity AS identity
CROSS JOIN LATERAL GENERATE_SERIES(1, identity.slot_count) AS series(ordinal);

-- A deterministic UUID collision or a row copied from another run must never be
-- silently adopted by the fixture.
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fixture_users AS expected
    JOIN users AS actual ON actual.id = expected.id
    WHERE LOWER(actual.email) IS DISTINCT FROM LOWER(expected.email)
  ) THEN
    RAISE EXCEPTION 'Fixture user UUID is already owned by unrelated data';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fixture_identity AS expected
    JOIN specialties AS actual ON actual.id = expected.specialty_id
    WHERE LOWER(actual.name) IS DISTINCT FROM
      LOWER('Card 2.6 ' || expected.marker)
  ) THEN
    RAISE EXCEPTION 'Fixture specialty UUID is already owned by unrelated data';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fixture_identity AS expected
    JOIN doctors AS actual ON actual.id = expected.doctor_id
    WHERE actual.user_id <> expected.doctor_user_id
       OR actual.specialty_id <> expected.specialty_id
       OR actual.license_number <> 'CARD26-' || expected.marker
  ) THEN
    RAISE EXCEPTION 'Fixture doctor UUID is already owned by unrelated data';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fixture_slots AS expected
    JOIN doctor_schedules AS actual ON actual.id = expected.id
    WHERE actual.doctor_id <> expected.doctor_id
       OR actual.date <> expected.slot_date
       OR actual.start_time <> expected.start_time
       OR actual.end_time <> expected.end_time
  ) THEN
    RAISE EXCEPTION 'Fixture slot UUID is already owned by unrelated data';
  END IF;
END;
$block$;

INSERT INTO users (
  id,
  email,
  password_hash,
  full_name,
  gender,
  date_of_birth,
  status
)
SELECT
  fixture_users.id,
  fixture_users.email,
  NULL,
  fixture_users.full_name,
  'OTHER'::user_gender_enum,
  DATE '1990-01-01',
  'ACTIVE'::user_status_enum
FROM fixture_users
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  status = EXCLUDED.status;

INSERT INTO user_roles (user_id, role)
SELECT id, role
FROM fixture_users
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO specialties (
  id,
  name,
  description,
  icon_url,
  is_active
)
SELECT
  specialty_id,
  'Card 2.6 ' || marker,
  'Synthetic specialty owned by load-test run ' || run_id,
  NULL,
  TRUE
FROM fixture_identity
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  is_active = TRUE;

INSERT INTO doctors (
  id,
  user_id,
  specialty_id,
  license_number,
  academic_title,
  consultation_fee,
  bio_description,
  room_number,
  rating_average
)
SELECT
  doctor_id,
  doctor_user_id,
  specialty_id,
  'CARD26-' || marker,
  'TEST',
  100000.00,
  'Synthetic doctor owned by load-test run ' || run_id,
  'T-' || LEFT(marker, 8),
  5.00
FROM fixture_identity
ON CONFLICT (id) DO UPDATE SET
  academic_title = EXCLUDED.academic_title,
  consultation_fee = EXCLUDED.consultation_fee,
  bio_description = EXCLUDED.bio_description,
  room_number = EXCLUDED.room_number;

INSERT INTO doctor_schedules (
  id,
  doctor_id,
  date,
  start_time,
  end_time,
  status,
  version
)
SELECT
  id,
  doctor_id,
  slot_date,
  start_time,
  end_time,
  'AVAILABLE',
  0
FROM fixture_slots
ON CONFLICT (id) DO NOTHING;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fixture_slots AS expected
    JOIN doctor_schedules AS actual ON actual.id = expected.id
    WHERE actual.status <> 'AVAILABLE'
  ) THEN
    RAISE EXCEPTION
      'Fixture run is dirty: at least one requested slot is not AVAILABLE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM appointments AS appointment
    JOIN fixture_slots AS fixture_slot ON fixture_slot.id = appointment.schedule_id
  ) THEN
    RAISE EXCEPTION
      'Fixture run is dirty: appointments already exist for requested slots';
  END IF;
END;
$block$;

SELECT JSON_BUILD_OBJECT(
  'runId', identity.run_id,
  'marker', identity.marker,
  'doctorId', identity.doctor_id,
  'doctorUserId', identity.doctor_user_id,
  'specialtyId', identity.specialty_id,
  'slotId', (
    SELECT id FROM fixture_slots WHERE ordinal = 1
  ),
  'patientId', (
    SELECT id FROM fixture_users WHERE ordinal = 1
  ),
  'contenderUserIds', (
    SELECT JSON_AGG(id ORDER BY ordinal)
    FROM fixture_users
    WHERE ordinal > 0
  ),
  'slotIds', (
    SELECT JSON_AGG(id ORDER BY ordinal)
    FROM fixture_slots
  ),
  'contenderCount', identity.contender_count,
  'slotCount', identity.slot_count,
  'lockKey', 'lock:doctor:' || identity.doctor_id || ':slot:' ||
    (SELECT id FROM fixture_slots WHERE ordinal = 1)
)::TEXT
FROM fixture_identity AS identity;

COMMIT;
