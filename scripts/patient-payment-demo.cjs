const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Client } = require('pg');
const Redis = require('ioredis');
require('dotenv').config({ path: resolve(__dirname, '../.env'), quiet: true });

(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Local QA only.');
  const url = new URL(process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Only local PostgreSQL is permitted.');
  const apply = process.argv.includes('--apply');
  const reset = process.argv.includes('--reset');
  if (reset && !process.argv.includes('--app-stopped')) throw new Error('Stop API/workers and pass --app-stopped before resetting demo data.');
  const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  if (!['localhost', '127.0.0.1'].includes(redisUrl.hostname)) throw new Error('Only local Redis is permitted.');
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  let redis;
  try {
    // Fail visibly on migration drift; never manually ALTER missing columns.
    await db.query('SELECT years_experience FROM doctors LIMIT 0');
    const { rows } = await db.query(`SELECT a.id, a.doctor_id, a.schedule_id, a.reservation_id
      FROM appointments a JOIN users u ON u.id = a.patient_id
      WHERE u.id = '90000000-0000-4000-8000-000000000001' AND u.email = 'runtime.payment.patient@ehealth.local'`);
    console.log(`Dedicated demo patient checkouts: ${rows.length}. ${apply ? 'Applying' : 'Preview only; use --apply'}${reset ? ' scoped reset + seed' : ' seed without reset'}.`);
    if (!apply) return;
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(1347439190)');
    const collisions = await db.query(`SELECT id FROM users WHERE id::text LIKE '90000000-0000-4000-8000-%' AND email NOT LIKE 'runtime.payment.%@ehealth.local'`);
    if (collisions.rowCount) throw new Error('QA UUID namespace collision; refusing to overwrite users.');
    if (reset) await db.query(readFileSync(resolve(__dirname, 'reset-patient-payment-test-data.sql'), 'utf8'));
    await db.query(readFileSync(resolve(__dirname, 'seed-patient-payment-demo.sql'), 'utf8'));
    await db.query('COMMIT');
    if (reset) {
      redis = new Redis(redisUrl.toString(), { maxRetriesPerRequest: 1 });
      for (const row of rows) {
        if (!row.reservation_id) continue;
        await redis.eval(`if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end
          redis.call('DEL', KEYS[2]); return 1`, 2,
          `lock:doctor:${row.doctor_id}:slot:${row.schedule_id}`, `reservation:${row.reservation_id}`, row.reservation_id);
      }
      console.log(`Removed ${rows.length} dedicated QA checkouts; deletion is not recoverable without a DB backup. No FLUSHDB or volume reset performed.`);
    }
    console.log('Seed complete: 1 patient, 3 doctors, 6 future slots. Clear only this demo patient browser checkout keys before starting QA.');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    if (redis) redis.disconnect();
    await db.end();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
