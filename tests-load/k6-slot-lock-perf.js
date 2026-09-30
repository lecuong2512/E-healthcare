import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * TC-PAT-SLOT-LOCK: Slot Lock Performance Benchmark
 * NFR-PERF-01: Slot lock/check p95 < 300ms
 */

const fixture = JSON.parse(open('./fixtures/slot-perf-data.json'));
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    slot_lock_load: {
      executor: 'constant-vus',
      vus: 20,
      duration: '20s',
    },
  },
  thresholds: {
    'http_req_duration{test_scenario:slot_lock}': ['p(95)<300'],
    'http_req_failed{test_scenario:slot_lock}': ['rate<0.01'],
  },
  discardResponseBodies: false,
};

export default function () {
  const index = (__VU * 25 + __ITER) % fixture.slots.length;
  const targetSlot = fixture.slots[index];

  const url = `${BASE_URL}/api/v1/booking/reserve-slot`;
  const payload = JSON.stringify({
    doctorId: targetSlot.doctorId,
    slotId: targetSlot.slotId,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${fixture.token}`,
      'X-Forwarded-For': `10.${__VU}.${__ITER % 250}.${Math.floor(Math.random() * 250) + 1}`,
    },
    tags: {
      test_scenario: 'slot_lock',
    },
    responseCallback: http.expectedStatuses(201, 409),
  };

  const response = http.post(url, payload, params);

  check(response, {
    'status is 201 (reserved) or 409 (contention/held)': (r) => r.status === 201 || r.status === 409,
    'latency below 300ms': (r) => r.timings.duration < 300,
  });

  sleep(0.5);
}
