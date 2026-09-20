import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import {
  loadTargetConfig,
  positiveInteger,
  readJsonFile,
  requestHeaders,
  requireEnv,
  summaryFilePath,
  validateUuid,
} from './lib/config.js';
import {
  confirmBooking,
  confirmBookingRace,
  inspectSlotLock,
  isNetworkError,
  isValidConfirmedAppointment,
  isValidConflict,
  isValidLockState,
  isValidRelease,
  isValidReservation,
  parseJson,
  releaseSlot,
  reserveSlot,
} from './lib/slot-api.js';
import { buildSummary } from './lib/summary.js';

const fixture = readJsonFile(__ENV.CONTENDER_IDS_FILE, 'CONTENDER_IDS_FILE') || {};
const target = loadTargetConfig();
const runId = requireEnv('RUN_ID', fixture.runId);
const doctorId = validateUuid(requireEnv('DOCTOR_ID', fixture.doctorId), 'DOCTOR_ID');
const slotId = validateUuid(requireEnv('SLOT_ID', fixture.slotId), 'SLOT_ID');
const lifecycleScenario = (
  __ENV.LIFECYCLE_SCENARIO ||
  __ENV.TEST_PROFILE ||
  __ENV.PROFILE ||
  'release'
).toLowerCase();
if (!['idempotency', 'release', 'ttl', 'confirm'].includes(lifecycleScenario)) {
  throw new Error('LIFECYCLE_SCENARIO must be idempotency, release, ttl, or confirm.');
}

const ownerId = requireEnv(
  'PATIENT_ID',
  fixture.patientId || (fixture.contenderUserIds && fixture.contenderUserIds[0]),
);
const otherUserId = requireEnv(
  'NON_OWNER_ID',
  (fixture.contenderUserIds && fixture.contenderUserIds.find((id) => id !== ownerId)) ||
    `${runId}-non-owner`,
);
if (ownerId === otherUserId) {
  throw new Error('PATIENT_ID and NON_OWNER_ID must be different.');
}
if (lifecycleScenario === 'confirm') {
  validateUuid(ownerId, 'PATIENT_ID');
  validateUuid(otherUserId, 'NON_OWNER_ID');
}

const expectedTtlSeconds = 600;
const ttlWaitSeconds = positiveInteger('TTL_WAIT_SECONDS', 602, expectedTtlSeconds);
const maxDurationSeconds = lifecycleScenario === 'ttl' ? ttlWaitSeconds + 60 : 60;

const lifecyclePasses = new Counter('slot_lifecycle_passes');
const unexpectedResults = new Counter('slot_lifecycle_unexpected_results');
const networkErrors = new Counter('slot_lifecycle_network_errors');

export const options = {
  scenarios: {
    [`slot_${lifecycleScenario}`]: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: `${maxDurationSeconds}s`,
      gracefulStop: '0s',
    },
  },
  thresholds: {
    slot_lifecycle_passes: ['count==1'],
    slot_lifecycle_unexpected_results: ['count==0'],
    slot_lifecycle_network_errors: ['count==0'],
    checks: ['rate==1'],
    'http_req_failed{phase:lifecycle}': ['rate==0'],
    'http_req_duration{operation:reserve_slot,phase:lifecycle}': ['p(95)<300'],
  },
  discardResponseBodies: false,
  userAgent: `ehealth-card-2.6-k6/${runId}`,
};

function trackNetworkErrors(responses) {
  const count = responses.filter((response) => isNetworkError(response)).length;
  networkErrors.add(count);
  return count;
}

function assertUnlockedPreflight() {
  const response = inspectSlotLock(
    target.baseUrl,
    doctorId,
    slotId,
    requestHeaders(1, runId),
    { phase: 'preflight' },
  );
  if (
    isNetworkError(response) ||
    !isValidLockState(response, {
      isLocked: false,
      holder: null,
      minimumTtl: 0,
      maximumTtl: 0,
    })
  ) {
    throw new Error(
      `Preflight failed: slot must be unlocked; HTTP ${response.status}; body=${JSON.stringify(parseJson(response))}.`,
    );
  }
}

export function setup() {
  assertUnlockedPreflight();
  return {};
}

function runReleaseOwnershipScenario(headers) {
  const ownerPayload = { doctorId, slotId, userId: ownerId };
  const otherPayload = { doctorId, slotId, userId: otherUserId };
  const reserveOwner = reserveSlot(target.baseUrl, ownerPayload, headers, {
    phase: 'lifecycle',
    step: 'reserve_owner',
  });
  const inspectOwner = inspectSlotLock(target.baseUrl, doctorId, slotId, headers, {
    phase: 'lifecycle',
    step: 'inspect_owner',
  });
  const releaseNonOwner = releaseSlot(target.baseUrl, otherPayload, headers, {
    phase: 'lifecycle',
    step: 'release_non_owner',
  });
  const inspectAfterNonOwner = inspectSlotLock(target.baseUrl, doctorId, slotId, headers, {
    phase: 'lifecycle',
    step: 'inspect_after_non_owner',
  });
  const releaseOwner = releaseSlot(target.baseUrl, ownerPayload, headers, {
    phase: 'lifecycle',
    step: 'release_owner',
  });
  const inspectAfterOwner = inspectSlotLock(target.baseUrl, doctorId, slotId, headers, {
    phase: 'lifecycle',
    step: 'inspect_after_owner',
  });
  const reserveOther = reserveSlot(target.baseUrl, otherPayload, headers, {
    phase: 'lifecycle',
    step: 'reacquire_other',
  });

  const responses = [
    reserveOwner,
    inspectOwner,
    releaseNonOwner,
    inspectAfterNonOwner,
    releaseOwner,
    inspectAfterOwner,
    reserveOther,
  ];
  const networkErrorCount = trackNetworkErrors(responses);
  const passed =
    networkErrorCount === 0 &&
    isValidReservation(reserveOwner, ownerPayload) &&
    isValidLockState(inspectOwner, {
      isLocked: true,
      holder: ownerId,
      minimumTtl: 599,
      maximumTtl: 600,
    }) &&
    isValidRelease(releaseNonOwner, false) &&
    isValidLockState(inspectAfterNonOwner, {
      isLocked: true,
      holder: ownerId,
      minimumTtl: 599,
      maximumTtl: 600,
    }) &&
    isValidRelease(releaseOwner, true) &&
    isValidLockState(inspectAfterOwner, {
      isLocked: false,
      holder: null,
      minimumTtl: 0,
      maximumTtl: 0,
    }) &&
    isValidReservation(reserveOther, otherPayload);

  return { passed, response: reserveOther };
}

function runIdempotencyScenario(headers) {
  const ownerPayload = { doctorId, slotId, userId: ownerId };
  const firstReservation = reserveSlot(target.baseUrl, ownerPayload, headers, {
    phase: 'lifecycle',
    step: 'idempotency_first_reserve',
  });
  const repeatedReservation = reserveSlot(target.baseUrl, ownerPayload, headers, {
    phase: 'lifecycle',
    step: 'idempotency_repeated_reserve',
  });
  const inspectOwner = inspectSlotLock(target.baseUrl, doctorId, slotId, headers, {
    phase: 'lifecycle',
    step: 'idempotency_inspect_owner',
  });
  const responses = [firstReservation, repeatedReservation, inspectOwner];
  const networkErrorCount = trackNetworkErrors(responses);
  const passed =
    networkErrorCount === 0 &&
    isValidReservation(firstReservation, ownerPayload) &&
    isValidReservation(repeatedReservation, ownerPayload, {
      minimumTtl: 1,
      maximumTtl: 600,
    }) &&
    isValidLockState(inspectOwner, {
      isLocked: true,
      holder: ownerId,
      minimumTtl: 599,
      maximumTtl: 600,
    });
  return { passed, response: repeatedReservation };
}

function runTtlScenario(headers) {
  const ownerPayload = { doctorId, slotId, userId: ownerId };
  const otherPayload = { doctorId, slotId, userId: otherUserId };
  const reserveOwner = reserveSlot(target.baseUrl, ownerPayload, headers, {
    phase: 'lifecycle',
    step: 'reserve_before_expiry',
  });
  const inspectImmediate = inspectSlotLock(target.baseUrl, doctorId, slotId, headers, {
    phase: 'lifecycle',
    step: 'inspect_immediate_ttl',
  });

  sleep(ttlWaitSeconds);

  const inspectExpired = inspectSlotLock(target.baseUrl, doctorId, slotId, headers, {
    phase: 'lifecycle',
    step: 'inspect_after_expiry',
  });
  const reserveOther = reserveSlot(target.baseUrl, otherPayload, headers, {
    phase: 'lifecycle',
    step: 'reacquire_after_expiry',
  });

  const responses = [reserveOwner, inspectImmediate, inspectExpired, reserveOther];
  const networkErrorCount = trackNetworkErrors(responses);
  const passed =
    networkErrorCount === 0 &&
    isValidReservation(reserveOwner, ownerPayload) &&
    isValidLockState(inspectImmediate, {
      isLocked: true,
      holder: ownerId,
      minimumTtl: 599,
      maximumTtl: 600,
    }) &&
    isValidLockState(inspectExpired, {
      isLocked: false,
      holder: null,
      minimumTtl: 0,
      maximumTtl: 0,
    }) &&
    isValidReservation(reserveOther, otherPayload);

  return { passed, response: reserveOther };
}

function runConfirmScenario(headers) {
  const reservation = { doctorId, slotId, userId: ownerId };
  const baseConfirmation = {
    doctorId,
    slotId,
    reasonForVisit: `Card 2.6 concurrency validation - ${runId}`,
    paymentMethod: 'PAY_AT_CLINIC',
  };
  const nonOwnerConfirmation = Object.assign({}, baseConfirmation, {
    patientId: otherUserId,
  });
  const ownerConfirmation = Object.assign({}, baseConfirmation, {
    patientId: ownerId,
  });

  const reserveOwner = reserveSlot(target.baseUrl, reservation, headers, {
    phase: 'lifecycle',
    step: 'reserve_before_confirm',
  });
  const confirmNonOwner = confirmBooking(
    target.baseUrl,
    nonOwnerConfirmation,
    headers,
    { phase: 'lifecycle', step: 'confirm_non_owner' },
  );
  const inspectAfterNonOwner = inspectSlotLock(
    target.baseUrl,
    doctorId,
    slotId,
    headers,
    { phase: 'lifecycle', step: 'inspect_after_non_owner_confirm' },
  );
  const ownerRace = confirmBookingRace(
    target.baseUrl,
    ownerConfirmation,
    headers,
    { phase: 'lifecycle', step: 'confirm_owner_race' },
    2,
  );
  const confirmedResponses = ownerRace.filter((response) =>
    isValidConfirmedAppointment(response, ownerConfirmation),
  );
  const duplicateConflicts = ownerRace.filter((response) => isValidConflict(response));
  const confirmOwner = confirmedResponses[0] || ownerRace[0];
  const inspectAfterOwner = inspectSlotLock(
    target.baseUrl,
    doctorId,
    slotId,
    headers,
    { phase: 'lifecycle', step: 'inspect_after_owner_confirm' },
  );

  const responses = [
    reserveOwner,
    confirmNonOwner,
    inspectAfterNonOwner,
    ...ownerRace,
    inspectAfterOwner,
  ];
  const networkErrorCount = trackNetworkErrors(responses);
  const passed =
    networkErrorCount === 0 &&
    isValidReservation(reserveOwner, reservation) &&
    isValidConflict(confirmNonOwner) &&
    isValidLockState(inspectAfterNonOwner, {
      isLocked: true,
      holder: ownerId,
      minimumTtl: 599,
      maximumTtl: 600,
    }) &&
    confirmedResponses.length === 1 &&
    duplicateConflicts.length === 1 &&
    isValidLockState(inspectAfterOwner, {
      isLocked: false,
      holder: null,
      minimumTtl: 0,
      maximumTtl: 0,
    });

  return { passed, response: confirmOwner };
}

export default function () {
  lifecyclePasses.add(0);
  unexpectedResults.add(0);
  networkErrors.add(0);

  const headers = requestHeaders(1, runId);
  let result;
  if (lifecycleScenario === 'ttl') {
    result = runTtlScenario(headers);
  } else if (lifecycleScenario === 'confirm') {
    result = runConfirmScenario(headers);
  } else if (lifecycleScenario === 'idempotency') {
    result = runIdempotencyScenario(headers);
  } else {
    result = runReleaseOwnershipScenario(headers);
  }
  if (result.passed) {
    lifecyclePasses.add(1);
  } else if (!isNetworkError(result.response)) {
    unexpectedResults.add(1);
  }
  check(
    result.response,
    { [`${lifecycleScenario} lifecycle satisfies all invariants`]: () => result.passed },
    { phase: 'lifecycle' },
  );
}

export function teardown() {
  // Keep the reacquired TTL lock long enough for the host orchestrator to read
  // its holder and remaining TTL directly from Redis. The orchestrator then
  // removes it with an ownership-checked Lua compare-and-delete; a standalone
  // run is still bounded by the native 600-second expiry.
  if (lifecycleScenario === 'ttl') {
    return;
  }
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
    testName: `Card 2.6 - slot ${lifecycleScenario} lifecycle`,
    runId,
    environment: target.environment,
    target: target.baseUrl,
    doctorId,
    slotId,
    scenario: lifecycleScenario,
    ttlWaitSeconds: lifecycleScenario === 'ttl' ? ttlWaitSeconds : null,
  };
  return buildSummary(
    data,
    metadata,
    summaryFilePath(`k6-slot-${lifecycleScenario}-summary.json`),
    summaryFilePath(`k6-slot-${lifecycleScenario}-summary.txt`),
  );
}
