import http from 'k6/http';

export const RESERVE_PATH = '/api/v1/appointments/reserve-slot';
export const RELEASE_PATH = '/api/v1/appointments/release-slot';
export const CONFIRM_PATH = '/api/v1/appointments/confirm-booking';
export const LOCK_PATH = '/api/v1/appointments/slot-lock';

function params(headers, tags, expectedStatusCodes) {
  return {
    headers,
    tags,
    responseCallback: http.expectedStatuses(...expectedStatusCodes),
  };
}

export function reserveSlot(baseUrl, payload, headers, tags = {}) {
  return http.post(
    `${baseUrl}${RESERVE_PATH}`,
    JSON.stringify(payload),
    params(headers, Object.assign({ operation: 'reserve_slot' }, tags), [201, 409]),
  );
}

export function releaseSlot(baseUrl, payload, headers, tags = {}) {
  return http.post(
    `${baseUrl}${RELEASE_PATH}`,
    JSON.stringify(payload),
    params(headers, Object.assign({ operation: 'release_slot' }, tags), [200]),
  );
}

export function confirmBooking(baseUrl, payload, headers, tags = {}) {
  return http.post(
    `${baseUrl}${CONFIRM_PATH}`,
    JSON.stringify(payload),
    params(headers, Object.assign({ operation: 'confirm_booking' }, tags), [201, 409]),
  );
}

export function confirmBookingRace(baseUrl, payload, headers, tags = {}, count = 2) {
  const requests = [];
  for (let index = 0; index < count; index += 1) {
    requests.push({
      method: 'POST',
      url: `${baseUrl}${CONFIRM_PATH}`,
      body: JSON.stringify(payload),
      params: params(
        headers,
        Object.assign({ operation: 'confirm_booking', contender: String(index + 1) }, tags),
        [201, 409],
      ),
    });
  }
  return http.batch(requests);
}

export function inspectSlotLock(baseUrl, doctorId, slotId, headers, tags = {}) {
  return http.get(
    `${baseUrl}${LOCK_PATH}/${encodeURIComponent(doctorId)}/${encodeURIComponent(slotId)}`,
    params(headers, Object.assign({ operation: 'inspect_slot_lock' }, tags), [200]),
  );
}

export function parseJson(response) {
  try {
    return response.json();
  } catch (_error) {
    return null;
  }
}

export function isNetworkError(response) {
  return !response || response.status === 0 || Boolean(response.error);
}

export function isValidReservation(response, expected, ttlRange = {}) {
  if (!response || response.status !== 201) {
    return false;
  }
  const body = parseJson(response);
  const minimumTtl = ttlRange.minimumTtl === undefined ? 600 : ttlRange.minimumTtl;
  const maximumTtl = ttlRange.maximumTtl === undefined ? 600 : ttlRange.maximumTtl;
  return Boolean(
    body &&
      body.success === true &&
      body.data &&
      body.data.doctorId === expected.doctorId &&
      body.data.slotId === expected.slotId &&
      body.data.userId === expected.userId &&
      Number.isInteger(body.data.ttlSeconds) &&
      body.data.ttlSeconds >= minimumTtl &&
      body.data.ttlSeconds <= maximumTtl &&
      typeof body.data.expiresAt === 'string',
  );
}

export function isValidConflict(response) {
  if (!response || response.status !== 409) {
    return false;
  }
  const body = parseJson(response);
  return Boolean(body && body.statusCode === 409 && typeof body.message === 'string');
}

export function isValidConfirmedAppointment(response, expected) {
  if (!response || response.status !== 201) {
    return false;
  }
  const body = parseJson(response);
  return Boolean(
    body &&
      typeof body.id === 'string' &&
      typeof body.appointmentCode === 'string' &&
      body.patientId === expected.patientId &&
      body.doctorId === expected.doctorId &&
      body.scheduleId === expected.slotId &&
      body.status === 'CONFIRMED' &&
      body.reasonForVisit === expected.reasonForVisit &&
      body.paymentStatus === 'UNPAID' &&
      body.paymentMethod === 'PAY_AT_CLINIC' &&
      typeof body.totalAmount === 'number',
  );
}

export function isValidLockState(response, expected) {
  if (!response || response.status !== 200) {
    return false;
  }
  const body = parseJson(response);
  if (!body || body.isLocked !== expected.isLocked) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'holder') && body.holder !== expected.holder) {
    return false;
  }
  if (expected.minimumTtl !== undefined && body.ttlSeconds < expected.minimumTtl) {
    return false;
  }
  if (expected.maximumTtl !== undefined && body.ttlSeconds > expected.maximumTtl) {
    return false;
  }
  return true;
}

export function isValidRelease(response, expectedSuccess) {
  if (!response || response.status !== 200) {
    return false;
  }
  const body = parseJson(response);
  return Boolean(
    body && body.success === expectedSuccess && typeof body.message === 'string',
  );
}
