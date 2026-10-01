import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Trend } from 'k6/metrics';
import {
  loadTargetConfig,
  nonNegativeNumber,
  positiveInteger,
  readJsonFile,
  requestHeaders,
  requireEnv,
  summaryFilePath,
  validateUniqueStrings,
  validateUuid,
} from './lib/config.js';
import {
  isNetworkError,
  isValidRelease,
  isValidReservation,
  releaseSlot,
  reserveSlot,
} from './lib/slot-api.js';
import { buildSummary } from './lib/summary.js';

const fixture = readJsonFile(__ENV.CONTENDER_IDS_FILE, 'CONTENDER_IDS_FILE') || {};
const slotIdsDocument = readJsonFile(__ENV.SLOT_IDS_FILE, 'SLOT_IDS_FILE');
const target = loadTargetConfig();
const runId = requireEnv('RUN_ID', fixture.runId);
const doctorId = validateUuid(requireEnv('DOCTOR_ID', fixture.doctorId), 'DOCTOR_ID');
const requestedProfile = (
  __ENV.LOAD_PROFILE ||
  __ENV.TEST_PROFILE ||
  __ENV.PROFILE ||
  'throughput'
).toLowerCase();
const loadProfile = requestedProfile === 'ccu' ? 'peak' : requestedProfile;
if (!['throughput', 'peak'].includes(loadProfile)) {
  throw new Error('LOAD_PROFILE must be either "throughput" or "peak".');
}

const targetTps = positiveInteger('TARGET_TPS', 100);
const minimumBusinessTps = positiveInteger('MIN_BUSINESS_TPS', 100);
const warmupRate = positiveInteger('WARMUP_RATE', 10);
const warmupSeconds = positiveInteger('WARMUP_SECONDS', 10);
const warmupGapSeconds = positiveInteger('WARMUP_GAP_SECONDS', 2);
const steadySeconds = positiveInteger('STEADY_SECONDS', 60);
const preAllocatedVus = positiveInteger('PRE_ALLOCATED_VUS', 150);
const maxVus = positiveInteger('MAX_VUS', 500, preAllocatedVus);
const peakTargetVus = positiveInteger('PEAK_TARGET_VUS', 500);
const peakRampSeconds = positiveInteger('PEAK_RAMP_SECONDS', 30);
const peakSteadySeconds = positiveInteger('PEAK_STEADY_SECONDS', 60);
const peakThinkTimeSeconds = nonNegativeNumber('PEAK_THINK_TIME_SECONDS', 2);

const rawSlotIds = Array.isArray(slotIdsDocument)
  ? slotIdsDocument
  : (slotIdsDocument && slotIdsDocument.slotIds) ||
    fixture.slotIds ||
    (__ENV.SLOT_IDS || '').split(',').filter(Boolean);
const requiredPoolSize = loadProfile === 'peak' ? peakTargetVus : maxVus;
const slotIds = validateUniqueStrings(rawSlotIds, 'slotIds', requiredPoolSize).map(
  (value, index) => validateUuid(value, `slotIds[${index}]`),
);

const businessTransactions = new Counter('slot_business_transactions');
const businessFailures = new Counter('slot_business_failures');
const unexpectedResults = new Counter('slot_load_unexpected_results');
const networkErrors = new Counter('slot_load_network_errors');
const activeVus = new Trend('slot_active_vus');

const throughputScenarios = {
  throughput_warmup: {
    executor: 'constant-arrival-rate',
    exec: 'runWarmup',
    rate: warmupRate,
    timeUnit: '1s',
    duration: `${warmupSeconds}s`,
    preAllocatedVUs: Math.min(preAllocatedVus, Math.max(warmupRate * 2, 20)),
    maxVUs: preAllocatedVus,
    gracefulStop: '0s',
    tags: { phase: 'warmup' },
  },
  throughput_steady: {
    executor: 'constant-arrival-rate',
    exec: 'runSteady',
    startTime: `${warmupSeconds + warmupGapSeconds}s`,
    rate: targetTps,
    timeUnit: '1s',
    duration: `${steadySeconds}s`,
    preAllocatedVUs: preAllocatedVus,
    maxVUs: maxVus,
    gracefulStop: '0s',
    tags: { phase: 'steady' },
  },
};

const peakScenarios = {
  peak_500_ccu: {
    executor: 'ramping-vus',
    exec: 'runPeak',
    startVUs: 0,
    stages: [
      {
        duration: `${peakRampSeconds}s`,
        target: Math.max(1, Math.floor(peakTargetVus * 0.2)),
      },
      {
        duration: `${peakRampSeconds}s`,
        target: Math.max(1, Math.floor(peakTargetVus * 0.5)),
      },
      { duration: `${peakRampSeconds}s`, target: peakTargetVus },
      { duration: `${peakSteadySeconds}s`, target: peakTargetVus },
      { duration: `${peakRampSeconds}s`, target: 0 },
    ],
    gracefulRampDown: '30s',
    gracefulStop: '30s',
    tags: { phase: 'peak' },
  },
};

const throughputThresholds = {
  // Counter.rate is divided by the complete k6 run (warm-up + gap + steady),
  // not by the tagged steady window. Count therefore expresses the actual
  // acceptance criterion without under-reporting an otherwise valid 60s run.
  'slot_business_transactions{phase:steady}': [
    `count>=${minimumBusinessTps * steadySeconds}`,
  ],
  'slot_business_failures{phase:steady}': ['count==0'],
  'slot_load_unexpected_results{phase:steady}': ['count==0'],
  'slot_load_network_errors{phase:steady}': ['count==0'],
  'dropped_iterations{scenario:throughput_steady}': ['count==0'],
  'checks{phase:steady}': ['rate==1'],
  'http_req_duration{operation:reserve_slot,phase:steady}': ['p(95)<300'],
};

const peakThresholds = {
  'slot_active_vus{phase:peak,window:steady}': [
    `min>=${peakTargetVus}`,
    `max>=${peakTargetVus}`,
  ],
  'slot_business_failures{phase:peak}': ['count==0'],
  'slot_load_unexpected_results{phase:peak}': ['count==0'],
  'slot_load_network_errors{phase:peak}': ['count==0'],
  'checks{phase:peak}': ['rate==1'],
  'http_req_duration{operation:reserve_slot,phase:peak}': ['p(95)<300'],
};

export const options = {
  scenarios: loadProfile === 'throughput' ? throughputScenarios : peakScenarios,
  thresholds: loadProfile === 'throughput' ? throughputThresholds : peakThresholds,
  discardResponseBodies: false,
  userAgent: `ehealth-card-2.6-k6/${runId}`,
};

function executeBusinessTransaction(phase) {
  const metricTags = { phase };
  if (phase === 'peak') {
    const elapsedSeconds = (Date.now() - exec.scenario.startTime) / 1000;
    const steadyStartSeconds = peakRampSeconds * 3;
    const steadyEndSeconds = steadyStartSeconds + peakSteadySeconds;
    metricTags.window =
      elapsedSeconds >= steadyStartSeconds && elapsedSeconds < steadyEndSeconds
        ? 'steady'
        : 'ramp';
  }
  activeVus.add(exec.instance.vusActive, metricTags);
  businessTransactions.add(0, metricTags);
  businessFailures.add(0, metricTags);
  unexpectedResults.add(0, metricTags);
  networkErrors.add(0, metricTags);

  const vuSequence = exec.vu.idInTest;
  const iterationSequence = exec.scenario.iterationInTest + 1;
  const slotId = slotIds[(vuSequence - 1) % slotIds.length];
  const userId = `${runId}-vu-${vuSequence}-iteration-${exec.scenario.iterationInTest}`;
  const payload = { doctorId, slotId, userId };
  // One stable synthetic client IP per transaction avoids exercising the global
  // per-IP gateway limit instead of the booking service. Reserve and release
  // intentionally share that IP within the transaction.
  const headers = requestHeaders(iterationSequence, runId);
  const reserveResponse = reserveSlot(target.baseUrl, payload, headers, {
    phase,
    test_scenario: loadProfile,
  });

  let releaseResponse = null;
  let reserveValid = false;
  let releaseValid = false;
  if (isNetworkError(reserveResponse)) {
    networkErrors.add(1, metricTags);
  } else {
    reserveValid = isValidReservation(reserveResponse, payload);
    if (!reserveValid) {
      unexpectedResults.add(1, metricTags);
    }
  }

  if (reserveValid) {
    releaseResponse = releaseSlot(target.baseUrl, payload, headers, {
      phase,
      test_scenario: loadProfile,
    });
    if (isNetworkError(releaseResponse)) {
      networkErrors.add(1, metricTags);
    } else {
      releaseValid = isValidRelease(releaseResponse, true);
      if (!releaseValid) {
        unexpectedResults.add(1, metricTags);
      }
    }
  }

  const passed = reserveValid && releaseValid;
  if (passed) {
    // Only a complete reserve/release business transaction contributes to TPS.
    businessTransactions.add(1, metricTags);
  } else {
    businessFailures.add(1, metricTags);
  }
  check(
    releaseResponse || reserveResponse,
    { 'reserve/release business transaction succeeds': () => passed },
    metricTags,
  );
}

export function runWarmup() {
  executeBusinessTransaction('warmup');
}

export function runSteady() {
  executeBusinessTransaction('steady');
}

export function runPeak() {
  executeBusinessTransaction('peak');
  sleep(peakThinkTimeSeconds);
}

export default function () {
  throw new Error('This script must run through its named k6 scenario executor.');
}

export function handleSummary(data) {
  const steadyMetric = data.metrics['slot_business_transactions{phase:steady}'];
  const steadyBusinessCount =
    steadyMetric && steadyMetric.values ? steadyMetric.values.count : null;
  const observedSteadyBusinessTps =
    steadyBusinessCount === null ? null : steadyBusinessCount / steadySeconds;
  const peakSteadyMetric = data.metrics['slot_active_vus{phase:peak,window:steady}'];
  const metadata = {
    testName: `Card 2.6 - slot ${loadProfile} profile`,
    runId,
    environment: target.environment,
    target: target.baseUrl,
    doctorId,
    loadProfile,
    slotPoolSize: slotIds.length,
    configuredTargetTps: loadProfile === 'throughput' ? targetTps : null,
    requiredBusinessTps: loadProfile === 'throughput' ? minimumBusinessTps : null,
    steadyWindowSeconds: loadProfile === 'throughput' ? steadySeconds : null,
    steadyBusinessTransactionCount:
      loadProfile === 'throughput' ? steadyBusinessCount : null,
    observedSteadyBusinessTps:
      loadProfile === 'throughput' ? observedSteadyBusinessTps : null,
    peakTargetVus: loadProfile === 'peak' ? peakTargetVus : null,
    observedPeakSteadyMinVus:
      loadProfile === 'peak' && peakSteadyMetric ? peakSteadyMetric.values.min : null,
    observedPeakSteadyMaxVus:
      loadProfile === 'peak' && peakSteadyMetric ? peakSteadyMetric.values.max : null,
  };
  return buildSummary(
    data,
    metadata,
    summaryFilePath(`k6-slot-${loadProfile}-summary.json`),
    summaryFilePath(`k6-slot-${loadProfile}-summary.txt`),
  );
}
