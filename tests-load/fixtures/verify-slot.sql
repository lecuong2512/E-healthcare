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
  pg_temp.fixture_uuid('card-2.6:' || run_id || ':doctor') AS doctor_id
FROM fixture_input;

SELECT JSON_BUILD_OBJECT(
  'runId', identity.run_id,
  'doctorId', identity.doctor_id,
  'doctorCount', (
    SELECT COUNT(*)
    FROM doctors
    WHERE id = identity.doctor_id
      AND license_number = 'CARD26-' || identity.marker
  ),
  'patientCount', (
    SELECT COUNT(*)
    FROM users
    WHERE email LIKE 'card26-' || identity.marker || '-p%@example.invalid'
  ),
  'slotCount', (
    SELECT COUNT(*)
    FROM doctor_schedules
    WHERE doctor_id = identity.doctor_id
  ),
  'availableSlotCount', (
    SELECT COUNT(*)
    FROM doctor_schedules
    WHERE doctor_id = identity.doctor_id AND status = 'AVAILABLE'
  ),
  'bookedSlotCount', (
    SELECT COUNT(*)
    FROM doctor_schedules
    WHERE doctor_id = identity.doctor_id AND status = 'BOOKED'
  ),
  'offSlotCount', (
    SELECT COUNT(*)
    FROM doctor_schedules
    WHERE doctor_id = identity.doctor_id AND status = 'OFF'
  ),
  'appointmentCount', (
    SELECT COUNT(*)
    FROM appointments AS appointment
    WHERE appointment.doctor_id = identity.doctor_id
  ),
  'confirmedAppointmentCount', (
    SELECT COUNT(*)
    FROM appointments AS appointment
    WHERE appointment.doctor_id = identity.doctor_id
      AND appointment.status = 'CONFIRMED'
  ),
  'duplicateAppointmentSlotCount', (
    SELECT COUNT(*)
    FROM (
      SELECT appointment.schedule_id
      FROM appointments AS appointment
      WHERE appointment.doctor_id = identity.doctor_id
      GROUP BY appointment.schedule_id
      HAVING COUNT(*) > 1
    ) AS duplicate_slots
  ),
  'slotIds', (
    SELECT COALESCE(JSON_AGG(schedule.id ORDER BY schedule.date, schedule.start_time), '[]'::JSON)
    FROM doctor_schedules AS schedule
    WHERE schedule.doctor_id = identity.doctor_id
  ),
  'contenderUserIds', (
    SELECT COALESCE(JSON_AGG(test_user.id ORDER BY test_user.email), '[]'::JSON)
    FROM users AS test_user
    WHERE test_user.email LIKE 'card26-' || identity.marker || '-p%@example.invalid'
  )
)::TEXT
FROM fixture_identity AS identity;

COMMIT;
