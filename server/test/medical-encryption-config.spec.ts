import './test-environment';
import { environment } from '../src/config/environment';
import { loadMedicalEncryptionConfig } from '../src/config/medical-encryption';

describe('Medical encryption configuration', () => {
  const currentKey =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const previousKey =
    'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const originalCurrentKey = environment.MEDICAL_DATA_ENCRYPTION_KEY;
  const originalCurrentVersion =
    environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION;
  const originalPreviousKeys = environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON;

  beforeEach(() => {
    environment.MEDICAL_DATA_ENCRYPTION_KEY = currentKey;
    environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION = '2';
    delete environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON;
  });

  afterAll(() => {
    if (originalCurrentKey === undefined) {
      delete environment.MEDICAL_DATA_ENCRYPTION_KEY;
    } else {
      environment.MEDICAL_DATA_ENCRYPTION_KEY = originalCurrentKey;
    }
    if (originalCurrentVersion === undefined) {
      delete environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION;
    } else {
      environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION =
        originalCurrentVersion;
    }
    if (originalPreviousKeys === undefined) {
      delete environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON;
    } else {
      environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON = originalPreviousKeys;
    }
  });

  it('loads older key versions without replacing the current key', () => {
    environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON = JSON.stringify({
      1: previousKey,
    });

    const config = loadMedicalEncryptionConfig();

    expect(config.currentVersion).toBe(2);
    expect(config.keys.get(1)).toBe(previousKey);
    expect(config.keys.get(2)).toBe(currentKey);
  });

  it('fails fast when the current encryption key is missing', () => {
    delete environment.MEDICAL_DATA_ENCRYPTION_KEY;

    expect(() => loadMedicalEncryptionConfig()).toThrow(
      'MEDICAL_DATA_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.',
    );
  });

  it('fails fast when the current encryption key is not 64 hexadecimal characters', () => {
    environment.MEDICAL_DATA_ENCRYPTION_KEY = 'not-a-valid-key';

    expect(() => loadMedicalEncryptionConfig()).toThrow(
      'MEDICAL_DATA_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters.',
    );
  });

  it('rejects an invalid encryption key version', () => {
    environment.MEDICAL_DATA_ENCRYPTION_KEY_VERSION = '0';

    expect(() => loadMedicalEncryptionConfig()).toThrow(
      'MEDICAL_DATA_ENCRYPTION_KEY_VERSION must be an integer from 1 to 32767.',
    );
  });

  it('rejects a keyring that redefines the current key version', () => {
    environment.MEDICAL_DATA_ENCRYPTION_KEYS_JSON = JSON.stringify({
      2: previousKey,
    });

    expect(() => loadMedicalEncryptionConfig()).toThrow(
      'must not redefine the current key version',
    );
  });
});
