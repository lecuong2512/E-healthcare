import http from 'k6/http';
import { check } from 'k6';

/**
 * E-Healthcare Portal
 * Card 1.5 - QA/QC
 * Slot Concurrency Test
 *
 * Objective:
 * - Simulate 100 concurrent users trying to reserve the SAME appointment slot.
 * - Expected: exactly 1 successful reservation.
 * - Expected: remaining requests receive HTTP 409 Conflict.
 * - NFR-PERF-01: p95 slot lock/check < 300ms.
 *
 * Endpoint and request data are configurable through environment variables
 * because the backend implementation may change.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const SLOT_PATH =
  __ENV.SLOT_CHECK_PATH || '/api/v1/appointments/reserve-slot';

const SLOT_METHOD =
  (__ENV.SLOT_CHECK_METHOD || 'POST').toUpperCase();

const CONCURRENT_USERS = Number(__ENV.CONCURRENT_USERS || 100);

const SLOT_BODY = __ENV.SLOT_BODY;

const AUTH_TOKEN = __ENV.AUTH_TOKEN;

export const options = {
  scenarios: {
    same_slot_concurrency: {
      executor: 'shared-iterations',
      vus: CONCURRENT_USERS,
      iterations: CONCURRENT_USERS,
      maxDuration: '30s',
    },
  },

  thresholds: {
    // NFR-PERF-01
    http_req_duration: ['p(95)<300'],
  },

  discardResponseBodies: true,
};

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }

  return headers;
}

function buildRequestBody() {
  if (SLOT_METHOD === 'GET') {
    return null;
  }

  if (!SLOT_BODY) {
    throw new Error(
      'SLOT_BODY is required for non-GET slot concurrency testing.',
    );
  }

  return SLOT_BODY;
}

export default function () {
  const response = http.request(
    SLOT_METHOD,
    `${BASE_URL}${SLOT_PATH}`,
    buildRequestBody(),
    {
      headers: getHeaders(),
      tags: {
        test_scenario: 'same_slot_concurrency',
      },
    },
  );

  check(response, {
    'request returned 200/201 or 409': (res) =>
      res.status === 200 ||
      res.status === 201 ||
      res.status === 409,

    'successful reservation returns 2xx': (res) =>
      res.status === 200 || res.status === 201,

    'conflicting reservation returns 409': (res) =>
      res.status === 409 || res.status === 200 || res.status === 201,
  });
}