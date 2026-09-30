import { environment } from './environment';

export interface MedicalEncryptionConfig {
  readonly currentVersion: number;
  readonly keys: ReadonlyMap<number, string>;
}

function validKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

export function loadMedicalEncryptionConfig(): MedicalEncryptionConfig {
  const currentVersion = Number(
    environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION ?? '1',
  );
  const currentKey = environment.MEDICAL_DATA_ENCRYPTION_KEY;
  if (!Number.isInteger(currentVersion) || currentVersion < 1 || currentVersion > 32767) {
    throw new Error('MEDICAL_DATA_ENCRYPTION_KEY_VERSION must be an integer from 1 to 32767.');
  }
  if (!validKey(currentKey)) {
    throw new Error('MEDICAL_DATA_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.');
  }

  const keys = new Map<number, string>([[currentVersion, currentKey]]);
  const previous = environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON?.trim();
  if (previous) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(previous);
    } catch {
      throw new Error('MEDICAL_DATA_ENCRYPTION_KEYS_JSON must be valid JSON.');
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('MEDICAL_DATA_ENCRYPTION_KEYS_JSON must be an object keyed by version.');
    }
    for (const [versionText, key] of Object.entries(parsed)) {
      const version = Number(versionText);
      if (!Number.isInteger(version) || version < 1 || version > 32767 || !validKey(key)) {
        throw new Error('MEDICAL_DATA_ENCRYPTION_KEYS_JSON contains an invalid version or key.');
      }
      if (version === currentVersion) {
        throw new Error(
          'MEDICAL_DATA_ENCRYPTION_KEYS_JSON must not redefine the current key version.',
        );
      }
      keys.set(version, key);
    }
  }
  return { currentVersion, keys };
}
