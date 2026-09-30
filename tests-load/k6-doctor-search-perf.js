import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * TC-PAT-006: Doctor Search Performance Benchmark
 * NFR-PERF-01: Doctor search/filter p95 < 1.0 second
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    doctor_search_load: {
      executor: 'constant-vus',
      vus: 20,
      duration: '30s',
    },
  },
  thresholds: {
    'http_req_duration{test_scenario:doctor_search}': ['p(95)<1000'],
    'http_req_failed{test_scenario:doctor_search}': ['rate<0.01'],
  },
  discardResponseBodies: false,
};

const QUERIES = [
  '?q=van',
  '?q=nguyen',
  '?q=binh',
  '?q=BSCKII',
  '?q=GS',
  '?specialtyId=c1111111-1111-4111-8111-111111111111',
  '?specialtyId=7c4f5211-9177-4006-b0e6-47da714d8782',
  '?date=2026-10-15&minPrice=200000&maxPrice=500000',
  '?minRating=4',
  '?q=an&minRating=4&minPrice=200000&maxPrice=600000',
];

export default function () {
  const query = QUERIES[(__ITER + __VU) % QUERIES.length];
  const url = `${BASE_URL}/api/v1/doctors/search${query}`;

  // Mô phỏng địa chỉ IP thực tế cho mỗi client qua trusted proxy
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `10.${__VU}.${__ITER % 250}.${Math.floor(Math.random() * 250) + 1}`,
    },
    tags: {
      test_scenario: 'doctor_search',
    },
  };

  const response = http.get(url, params);

  check(response, {
    'status is 200': (r) => r.status === 200,
    'has data array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
