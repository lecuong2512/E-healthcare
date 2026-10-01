import { check, sleep } from 'k6';
import http from 'k6/http';
import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';
import {
  loadTargetConfig,
  positiveInteger,
  readJsonFile,
  requestHeaders,
  requireEnv,
  summaryFilePath,
  validateUniqueStrings,
  validateUuid,
} from './lib/config.js';
import {
  inspectSlotLock,
  isNetworkError,
  isValidConflict,
  isValidLockState,
  isValidReservation,
  parseJson,
  releaseSlot,
  reserveSlot,
  RESERVE_PATH,
} from './lib/slot-api.js';
import { buildSummary } from './lib/summary.js';

const fixture = readJsonFile(__ENV.CONTENDER_IDS_FILE, 'CONTENDER_IDS_FILE') || {};
const target = loadTargetConfig();
const runId = requireEnv('RUN_ID', fixture.runId);
const doctorId = validateUuid(requireEnv('DOCTOR_ID', fixture.doctorId), 'DOCTOR_ID');
const slotId = validateUuid(requireEnv('SLOT_ID', fixture.slotId), 'SLOT_ID');
const testProfile = (__ENV.TEST_PROFILE || __ENV.PROFILE || 'contention').toLowerCase();
if (!['smoke', 'contention', 'microburst'].includes(testProfile)) {
  throw new Error('TEST_PROFILE must be "smoke", "contention", or "microburst".');
}
const concurrentUsers =
  testProfile === 'smoke'
    ? positiveInteger('SMOKE_USERS', 2, 2)
    : positiveInteger('CONCURRENT_USERS', 100, 2);
const availableContenders = validateUniqueStrings(
  fixture.contenderUserIds || [],
  'fixture.contenderUserIds',
  concurrentUsers,
);
const contenders = availableContenders.slice(0, concurrentUsers);

const syncLeadTimeMs = positiveInteger('SYNC_LEAD_TIME_MS', 3000, 500);
const maxSyncWaitMs = positiveInteger('MAX_SYNC_WAIT_MS', 30000, syncLeadTimeMs);

const winners = new Counter('slot_winners');
const conflicts = new Counter('slot_conflicts');
const unexpectedResults = new Counter('slot_unexpected_results');
const networkErrors = new Counter('slot_network_errors');
const arrivalSkew = new Trend('slot_arrival_skew_ms', true);

export const options = {
  scenarios: {
    same_slot_contention: {
      executor: testProfile === 'microburst' ? 'shared-iterations' : 'per-vu-iterations',
      vus: testProfile === 'microburst' ? 1 : concurrentUsers,
      iterations: 1,
      maxDuration: '45s',
      gracefulStop: '0s',
    },
  },
  thresholds: {
    slot_winners: ['count==1'],
    slot_conflicts: [`count==${concurrentUsers - 1}`],
    slot_unexpected_results: ['count==0'],
    slot_network_errors: ['count==0'],
    iterations: [`count==${testProfile === 'microburst' ? 1 : concurrentUsers}`],
    checks: ['rate==1'],
    'http_req_failed{operation:reserve_slot}': ['rate==0'],
    'http_req_duration{operation:reserve_slot}': ['p(95)<300'],
  },
  discardResponseBodies: false,
  noConnectionReuse: false,
  batch: concurrentUsers,
  batchPerHost: concurrentUsers,
  userAgent: `ehealth-card-2.6-k6/${runId}`,
};

function assertSlotIsClean(response) {
  if (isNetworkError(response)) {
    throw new Error(`Preflight failed: cannot reach ${target.baseUrl}.`);
  }
  if (
    !isValidLockState(response, {
      isLocked: false,
      holder: null,
      minimumTtl: 0,
      maximumTtl: 0,
    })
  ) {
    const body = parseJson(response);
    throw new Error(
      `Preflight failed: target slot must be unlocked. HTTP ${response.status}; body=${JSON.stringify(body)}.`,
    );
  }
}

export function setup() {
  const response = inspectSlotLock(
    target.baseUrl,
    doctorId,
    slotId,
    requestHeaders(1, runId),
    { phase: 'preflight' },
  );
  assertSlotIsClean(response);

  const configuredEpoch = __ENV.START_AT_EPOCH_MS
    ? Number(__ENV.START_AT_EPOCH_MS)
    : Date.now() + syncLeadTimeMs;
  if (!Number.isFinite(configuredEpoch) || configuredEpoch <= Date.now()) {
    throw new Error('START_AT_EPOCH_MS must be a future Unix epoch in milliseconds.');
  }
  if (configuredEpoch - Date.now() > maxSyncWaitMs) {
    throw new Error(`START_AT_EPOCH_MS exceeds MAX_SYNC_WAIT_MS (${maxSyncWaitMs} ms).`);
  }
  return { startAtEpochMs: configuredEpoch };
}

function waitForStart(epochMs) {
  while (Date.now() < epochMs) {
    const remainingMs = epochMs - Date.now();
    sleep(Math.min(remainingMs, 50) / 1000);
  }
}

export default function (data) {
  // Zero samples keep zero-valued counters visible to thresholds and summaries.
  winners.add(0);
  conflicts.add(0);
  unexpectedResults.add(0);
  networkErrors.add(0);

  if (testProfile === 'microburst') {
    const batchRequests = contenders.map((userId, index) => ({
      method: 'POST',
      url: `${target.baseUrl}${RESERVE_PATH}`,
      body: JSON.stringify({ doctorId, slotId, userId }),
      params: {
        headers: requestHeaders(index + 1, runId),
        tags: {
          operation: 'reserve_slot',
          phase: 'contention',
          test_scenario: 'same_slot_microburst',
        },
        responseCallback: http.expectedStatuses(201, 409),
      },
    }));
    waitForStart(data.startAtEpochMs);
    arrivalSkew.add(Date.now() - data.startAtEpochMs);
    const responses = http.batch(batchRequests);
    let classifiedCount = 0;
    responses.forEach((response, index) => {
      const expected = { doctorId, slotId, userId: contenders[index] };
      if (isNetworkError(response)) {
        networkErrors.add(1);
      } else if (response.status === 201 && isValidReservation(response, expected)) {
        winners.add(1);
        classifiedCount++;
      } else if (response.status === 409 && isValidConflict(response)) {
        conflicts.add(1);
        classifiedCount++;
      } else {
        unexpectedResults.add(1);
      }
    });
    check(
      responses,
      { 'all microburst responses match the 201/409 contract': () => classifiedCount === concurrentUsers },
      { phase: 'contention' },
    );
    return;
  }

  const contenderIndex = exec.vu.idInTest - 1;
  const userId = contenders[contenderIndex];
  if (!userId) {
    exec.test.abort(`No contender identity for VU ${exec.vu.idInTest}.`);
  }

  waitForStart(data.startAtEpochMs);
  const dispatchedAt = Date.now();
  arrivalSkew.add(dispatchedAt - data.startAtEpochMs);

  const expected = { doctorId, slotId, userId };
  const response = reserveSlot(
    target.baseUrl,
    expected,
    requestHeaders(exec.vu.idInTest, runId),
    { phase: 'contention', test_scenario: 'same_slot_contention' },
  );

  let classified = false;
  if (isNetworkError(response)) {
    networkErrors.add(1);
  } else if (response.status === 201 && isValidReservation(response, expected)) {
    winners.add(1);
    classified = true;
  } else if (response.status === 409 && isValidConflict(response)) {
    conflicts.add(1);
    classified = true;
  } else {
    unexpectedResults.add(1);
  }

  check(
    response,
    { 'reserve result matches the 201/409 contract': () => classified },
    { phase: 'contention' },
  );
}

export function teardown() {
  const headers = requestHeaders(1, runId);
  const response = inspectSlotLock(target.baseUrl, doctorId, slotId, headers, {
    phase: 'cleanup',
  });
  const body = parseJson(response);
  if (response.status === 200 && body && body.isLocked && body.holder) {
    releaseSlot(
      target.baseUrl,
      { doctorId, slotId, userId: body.holder },
      headers,
      { phase: 'cleanup' },
    );
  }
}

export function handleSummary(data) {
  const metadata = {
    testName: `Card 2.6 - same-slot ${testProfile}`,
    runId,
    environment: target.environment,
    target: target.baseUrl,
    doctorId,
    slotId,
    concurrentUsers,
    testProfile,
    expectedWinners: 1,
    expectedConflicts: concurrentUsers - 1,
  };
  return buildSummary(
    data,
    metadata,
    summaryFilePath('k6-slot-concurrency-summary.json'),
    summaryFilePath('k6-slot-concurrency-summary.txt'),
  );
}
