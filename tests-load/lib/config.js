const SAFE_ENVIRONMENTS = [
  'local',
  'test',
  'testing',
  'qa',
  'staging',
  'performance',
];

const DEFAULT_ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireEnv(name, fallback) {
  const value = __ENV[name] || fallback;
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return String(value).trim();
}

export function readJsonFile(path, label) {
  if (!path) {
    return null;
  }

  let raw;
  try {
    raw = open(path);
  } catch (error) {
    throw new Error(`Cannot read ${label || 'JSON file'} at "${path}": ${error.message}`);
  }

  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${label || 'JSON file'} is not valid JSON: ${error.message}`);
  }
}

export function positiveInteger(name, fallback, minimum = 1) {
  const raw = __ENV[name] || fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

export function nonNegativeNumber(name, fallback) {
  const raw = __ENV[name] || fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return value;
}

export function booleanEnv(name, fallback = false) {
  const value = __ENV[name];
  if (value === undefined || value === '') {
    return fallback;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  throw new Error(`${name} must be true/false or 1/0.`);
}

export function validateUuid(value, label) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a valid UUID.`);
  }
  return value;
}

export function validateUniqueStrings(values, label, minimumLength = 1) {
  if (!Array.isArray(values) || values.length < minimumLength) {
    throw new Error(`${label} must contain at least ${minimumLength} values.`);
  }

  const normalized = values.map((value, index) => {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }
    return value.trim();
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must not contain duplicate values.`);
  }
  return normalized;
}

function extractHostname(baseUrl) {
  const match = /^https?:\/\/(?:\[([^\]]+)\]|([^/:]+))(?::\d+)?(?:\/|$)/i.exec(baseUrl);
  if (!match) {
    throw new Error('BASE_URL must be an absolute HTTP(S) URL.');
  }
  return (match[1] || match[2]).toLowerCase();
}

export function loadTargetConfig() {
  const environment = requireEnv('ENVIRONMENT').toLowerCase();
  if (!SAFE_ENVIRONMENTS.includes(environment)) {
    throw new Error(
      `ENVIRONMENT "${environment}" is forbidden. Load tests are allowed only in: ${SAFE_ENVIRONMENTS.join(', ')}.`,
    );
  }

  const baseUrl = requireEnv('BASE_URL').replace(/\/+$/, '');
  const hostname = extractHostname(baseUrl);
  const explicitlyAllowed = (__ENV.ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allowedHosts = DEFAULT_ALLOWED_HOSTS.concat(explicitlyAllowed);

  if (!allowedHosts.includes(hostname)) {
    throw new Error(
      `Refusing to load test host "${hostname}". Add the exact non-production host to ALLOWED_HOSTS.`,
    );
  }

  return { baseUrl, environment, hostname };
}

export function clientIpForSequence(sequence) {
  const normalized = Math.max(1, Number(sequence) || 1) - 1;
  const thirdOctet = Math.floor(normalized / 254) % 254;
  const fourthOctet = (normalized % 254) + 1;
  return `198.18.${thirdOctet}.${fourthOctet}`;
}

export function requestHeaders(sequence, runId) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Load-Test-Run-Id': runId,
  };

  if (booleanEnv('ENABLE_CLIENT_IP_HEADER', true)) {
    headers['X-Forwarded-For'] = clientIpForSequence(sequence);
  }
  if (__ENV.AUTH_TOKEN) {
    headers.Authorization = `Bearer ${__ENV.AUTH_TOKEN}`;
  }
  return headers;
}

export function summaryFilePath(fileName) {
  const directory = (__ENV.EVIDENCE_DIR || '.').replace(/[\\/]$/, '');
  return `${directory}/${fileName}`;
}
