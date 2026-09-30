// Creates a new local test database; never truncates an existing application database.
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
require('dotenv').config({ path: resolve(__dirname, '../../.env'), quiet: true });

(async () => {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Only local PostgreSQL is permitted.');
  url.pathname = '/postgres';
  const admin = new Client({ connectionString: url.toString() });
  const database = `ehealth_payment_test_ux_${Date.now()}`;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    url.pathname = `/${database}`;
    const redis = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    if (!['localhost', '127.0.0.1'].includes(redis.hostname)) throw new Error('Only local Redis is permitted.');
    redis.pathname = '/15';
    console.log(`Payment integration database: ${database}; Redis keys are UUID scoped.`);
    const result = spawnSync(process.execPath, [resolve(__dirname, '../../node_modules/jest/bin/jest.js'),
      '--runInBand', '--config', 'jest.integration.config.cjs', '--runTestsByPath', 'test/payment.integration.ts'], {
      cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'inherit',
      env: { ...process.env, TEST_DATABASE_URL: url.toString(), TEST_REDIS_URL: redis.toString() },
    });
    process.exitCode = result.status ?? 1;
  } finally {
    // The name was generated here and is never supplied by an environment variable.
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
