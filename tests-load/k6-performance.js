import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * E-Healthcare Portal
 * Card 1.5 - QA/QC: Performance Test Baseline
 *
 * NFR coverage:
 * - NFR-PERF-01: Doctor search/filter p95 < 1s
 * - NFR-PERF-01: Slot lock/check p95 < 300ms
 * - NFR-PERF-02: Booking/write throughput >= 100 TPS
 * - NFR-PERF-02: Peak load >= 500 concurrent users
 *
 * IMPORTANT:
 * Endpoint paths are provided through environment variables.
 * Do not hard-code endpoints that are not confirmed by the backend implementation.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_SCENARIO = __ENV.TEST_SCENARIO || 'search';

const ENDPOINTS = {
  search: __ENV.DOCTOR_SEARCH_PATH || '',
  slot: __ENV.SLOT_CHECK_PATH || '',
  booking: __ENV.BOOKING_PATH || '',
  peak: __ENV.PEAK_PATH || '',
};

const METHODS = {
  search: (__ENV.DOCTOR_SEARCH_METHOD || 'GET').toUpperCase(),
  slot: (__ENV.SLOT_CHECK_METHOD || 'GET').toUpperCase(),
  booking: (__ENV.BOOKING_METHOD || 'POST').toUpperCase(),
  peak: (__ENV.PEAK_METHOD || 'GET').toUpperCase(),
};

/**
 * Load test scenarios
 */
const SCENARIOS = {
  /**
   * NFR-PERF-01
   * Doctor search/filter response time.
   */
  search: {
    executor: 'constant-vus',
    vus: 20,
    duration: '1m',
  },

  /**
   * NFR-PERF-01
   * Slot lock/check response time.
   */
  slot: {
    executor: 'constant-vus',
    vus: 20,
    duration: '1m',
  },

  /**
   * NFR-PERF-02
   * Booking/write throughput.
   *
   * Target: 100 iterations/second.
   * Each iteration sends one booking request.
   */
  booking: {
    executor: 'constant-arrival-rate',
    rate: 100,
    timeUnit: '1s',
    duration: '1m',
    preAllocatedVUs: 100,
    maxVUs: 500,
  },

  /**
   * NFR-PERF-02
   * Peak concurrent-user load.
   *
   * Target: reach and sustain 500 VUs.
   */
  peak: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 100 },
      { duration: '1m', target: 250 },
      { duration: '1m', target: 500 },
      { duration: '1m', target: 500 },
      { duration: '1m', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
};

/**
 * Validate scenario before exporting k6 options.
 */
if (!SCENARIOS[TEST_SCENARIO]) {
  throw new Error(
    `Invalid TEST_SCENARIO: "${TEST_SCENARIO}". ` +
      `Allowed values: search, slot, booking, peak`,
  );
}

/**
 * Thresholds are scenario-specific.
 *
 * This is important because the peak-load requirement
 * (500 VUs) must not be applied to search/slot tests.
 */
const THRESHOLDS = {
  search: {
    // NFR-PERF-01:
    // Doctor search/filter p95 must be below 1 second.
    'http_req_duration{test_scenario:search}': ['p(95)<1000'],
  },

  slot: {
    // NFR-PERF-01:
    // Slot lock/check p95 must be below 300ms.
    'http_req_duration{test_scenario:slot}': ['p(95)<300'],
  },

  booking: {
    // NFR-PERF-02:
    // Booking/write throughput must reach at least 100 requests/second.
    'http_reqs{test_scenario:booking}': ['rate>=100'],
  },

  peak: {
    // NFR-PERF-02:
    // Peak-load test must reach at least 500 concurrent VUs.
    vus: ['max>=500'],
  },
};

/**
 * k6 options
 */
export const options = {
  scenarios: {
    [TEST_SCENARIO]: SCENARIOS[TEST_SCENARIO],
  },

  thresholds: THRESHOLDS[TEST_SCENARIO],

  // Response bodies are not required for this performance baseline.
  // Discarding them reduces memory usage during load tests.
  discardResponseBodies: true,
};

/**
 * Get endpoint path for the selected scenario.
 */
function getPath(scenario) {
  const path = ENDPOINTS[scenario];

  if (!path) {
    throw new Error(
      `${scenario.toUpperCase()} endpoint is not configured. ` +
        `Please provide the corresponding environment variable.`,
    );
  }

  return path;
}

/**
 * Build common HTTP headers.
 *
 * AUTH_TOKEN is optional because some performance endpoints
 * may be public or may use a test authentication token.
 */
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (__ENV.AUTH_TOKEN) {
    headers.Authorization = `Bearer ${__ENV.AUTH_TOKEN}`;
  }

  return headers;
}

/**
 * Build request body.
 *
 * Currently only the booking scenario requires a body.
 */
function buildRequestBody(scenario) {
  if (scenario !== 'booking') {
    return null;
  }

  const body = __ENV.BOOKING_BODY;

  if (!body) {
    throw new Error(
      'BOOKING_BODY is required for the booking throughput scenario.',
    );
  }

  return body;
}

/**
 * Execute one HTTP request for the selected scenario.
 */
function executeRequest(scenario) {
  const path = getPath(scenario);
  const method = METHODS[scenario];
  const body = buildRequestBody(scenario);

  const response = http.request(
    method,
    `${BASE_URL}${path}`,
    body,
    {
      headers: getHeaders(),

      tags: {
        test_scenario: scenario,
      },
    },
  );

  check(response, {
    'response status is successful': (res) =>
      res.status >= 200 && res.status < 400,
  });

  return response;
}

/**
 * Main k6 test function.
 */
export default function () {
  executeRequest(TEST_SCENARIO);

  /**
   * constant-arrival-rate controls the iteration rate itself,
   * so sleeping here would unnecessarily interfere with the
   * booking throughput scenario.
   *
   * For VU-based scenarios, sleep prevents each VU from sending
   * requests as fast as possible and creates a more stable baseline.
   */
  if (TEST_SCENARIO !== 'booking') {
    sleep(1);
  }
}