import { DataSource, QueryRunner } from 'typeorm';
import { loadMedicalEncryptionConfig } from '../config/medical-encryption';

export interface MedicalEncryptionRotationOptions {
  readonly batchSize?: number;
  readonly dryRun?: boolean;
}

export interface MedicalEncryptionRotationResult {
  readonly targetVersion: number;
  readonly dryRun: boolean;
  readonly counts: Readonly<Record<string, number>>;
}

interface RotationTarget {
  readonly table: string;
  readonly updateSql: string;
}

const ROTATION_LOCK = 'ehealth:medical-encryption-rotation';
const TARGETS: readonly RotationTarget[] = [
  {
    table: 'medical_records',
    updateSql: `
      WITH batch AS (
        SELECT id
          FROM medical_records
         WHERE encryption_key_version = $1
         ORDER BY id
         LIMIT $4
         FOR UPDATE SKIP LOCKED
      )
      UPDATE medical_records target
         SET clinical_notes_ciphertext = pgp_sym_encrypt(
               pgp_sym_decrypt(target.clinical_notes_ciphertext, $2)::text,
               $3,
               'cipher-algo=aes256'
             ),
             vital_signs_ciphertext = pgp_sym_encrypt(
               pgp_sym_decrypt(target.vital_signs_ciphertext, $2)::text,
               $3,
               'cipher-algo=aes256'
             ),
             encryption_key_version = $5
        FROM batch
       WHERE target.id = batch.id
      RETURNING target.id
    `,
  },
  {
    table: 'prescription_items',
    updateSql: `
      WITH batch AS (
        SELECT id
          FROM prescription_items
         WHERE encryption_key_version = $1
         ORDER BY id
         LIMIT $4
         FOR UPDATE SKIP LOCKED
      )
      UPDATE prescription_items target
         SET payload_ciphertext = pgp_sym_encrypt(
               pgp_sym_decrypt(target.payload_ciphertext, $2)::text,
               $3,
               'cipher-algo=aes256'
             ),
             encryption_key_version = $5
        FROM batch
       WHERE target.id = batch.id
      RETURNING target.id
    `,
  },
  {
    table: 'emr_addendums',
    updateSql: `
      WITH batch AS (
        SELECT id
          FROM emr_addendums
         WHERE encryption_key_version = $1
         ORDER BY id
         LIMIT $4
         FOR UPDATE SKIP LOCKED
      )
      UPDATE emr_addendums target
         SET content_ciphertext = pgp_sym_encrypt(
               pgp_sym_decrypt(target.content_ciphertext, $2)::text,
               $3,
               'cipher-algo=aes256'
             ),
             encryption_key_version = $5
        FROM batch
       WHERE target.id = batch.id
      RETURNING target.id
    `,
  },
];

export async function rotateMedicalEncryption(
  dataSource: DataSource,
  options: MedicalEncryptionRotationOptions = {},
): Promise<MedicalEncryptionRotationResult> {
  const batchSize = options.batchSize ?? 250;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5_000) {
    throw new Error('Medical encryption rotation batch size must be from 1 to 5000.');
  }

  const config = loadMedicalEncryptionConfig();
  const currentKey = config.keys.get(config.currentVersion)!;
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  const lockRows = await runner.query(
    `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
    [ROTATION_LOCK],
  );
  if (!lockRows[0]?.acquired) {
    await runner.release();
    throw new Error('Another medical encryption rotation is already running.');
  }

  const counts: Record<string, number> = {};
  try {
    for (const target of TARGETS) {
      const versionRows: Array<{ encryption_key_version: number; total: string }> =
        await runner.query(
          `SELECT encryption_key_version, COUNT(*)::text AS total
             FROM ${target.table}
            WHERE encryption_key_version <> $1
            GROUP BY encryption_key_version
            ORDER BY encryption_key_version`,
          [config.currentVersion],
        );
      counts[target.table] = versionRows.reduce(
        (sum, row) => sum + Number(row.total),
        0,
      );
      if (options.dryRun) continue;

      for (const versionRow of versionRows) {
        const previousVersion = Number(versionRow.encryption_key_version);
        const previousKey = config.keys.get(previousVersion);
        if (!previousKey) {
          throw new Error(
            `Medical encryption key version ${previousVersion} is unavailable for rotation.`,
          );
        }
        while (true) {
          const result = await runner.query(
            target.updateSql,
            [
              previousVersion,
              previousKey,
              currentKey,
              batchSize,
              config.currentVersion,
            ],
          );
          const updated: Array<{ id: string }> =
            Array.isArray(result) && Array.isArray(result[0])
              ? result[0]
              : result;
          if (updated.length === 0) break;
        }
      }

      const remaining = await runner.query(
        `SELECT COUNT(*)::int AS total
           FROM ${target.table}
          WHERE encryption_key_version <> $1`,
        [config.currentVersion],
      );
      if (Number(remaining[0]?.total ?? 0) !== 0) {
        throw new Error(`Medical encryption rotation verification failed for ${target.table}.`);
      }
    }
    return {
      targetVersion: config.currentVersion,
      dryRun: options.dryRun ?? false,
      counts,
    };
  } finally {
    await releaseRotationLock(runner);
    await runner.release();
  }
}

async function releaseRotationLock(runner: QueryRunner): Promise<void> {
  try {
    await runner.query(`SELECT pg_advisory_unlock(hashtext($1))`, [ROTATION_LOCK]);
  } catch {
    // Releasing the dedicated connection also releases a session advisory lock.
  }
}
