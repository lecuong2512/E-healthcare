import 'reflect-metadata';
import { requiredEnvironment } from '../config/environment';
import { createDataSource } from '../database/database-options';
import { rotateMedicalEncryption } from '../database/rotate-medical-encryption';

function batchSizeFromArguments(): number | undefined {
  const argument = process.argv.find((value) => value.startsWith('--batch-size='));
  if (!argument) return undefined;
  return Number(argument.slice('--batch-size='.length));
}

async function main(): Promise<void> {
  const database = createDataSource(requiredEnvironment('DATABASE_URL'));
  await database.initialize();
  try {
    const result = await rotateMedicalEncryption(database, {
      batchSize: batchSizeFromArguments(),
      dryRun: process.argv.includes('--dry-run'),
    });
    // Counts and key versions are operational metadata; encryption keys are never logged.
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await database.destroy();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown rotation failure.';
  process.stderr.write(`Medical encryption rotation failed: ${message}\n`);
  process.exitCode = 1;
});
