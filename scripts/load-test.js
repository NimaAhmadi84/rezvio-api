// ═══════════════════════════════════════════════════════════════
// Rezvio API — Load Test (P3) — v2 (after throttler skip + device-limit fix)
// ═══════════════════════════════════════════════════════════════
// Prerequisites:
//   DISABLE_THROTTLER=true in .env (dev only), server restarted
//
// Run:
//   TEST_EMAIL='...' TEST_PASSWORD='...' BUSINESS_SLUG='...' \
//     k6 run scripts/load-test.js
// ═══════════════════════════════════════════════════════════════

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Treat 4xx/5xx as failures EXCEPT 409 (device-limit & booking overlap are valid responses)
http.setResponseCallback(http.expectedStatuses(200, 201, 204, 409));

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'mrnima2921@gmail.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || '';
const BUSINESS_SLUG = __ENV.BUSINESS_SLUG || 'nimabaebershop';

const bookingCreated = new Rate('booking_created_rate');
const slotsCount = new Trend('slots_available_count', true);

export const options = {
  scenarios: {
    slug_read: {
      executor: 'ramping-vus',
      exec: 'slugReadScenario',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 30 },
        { duration: '40s', target: 50 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    slots_read: {
      executor: 'ramping-vus',
      exec: 'slotsReadScenario',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 15 },
        { duration: '40s', target: 30 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    booking_create: {
      executor: 'ramping-vus',
      exec: 'bookingCreateScenario',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 3 },
        { duration: '40s', target: 5 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    login_auth: {
      executor: 'ramping-vus',
      exec: 'loginAuthScenario',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 1 },
        { duration: '40s', target: 1 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },

  thresholds: {
    'http_req_duration': ['p(95)<1500', 'p(99)<3000'],
    'http_req_failed': ['rate<0.05'],
    'http_req_failed{scenario:slug_read}':  ['rate<0.02'],
    'http_req_failed{scenario:slots_read}': ['rate<0.05'],
    'http_req_failed{scenario:login_auth}': ['rate<0.02'],
    // Booking: only needs to PROVE the write path works under load
    'booking_created_rate': ['rate>0.03'],
  },
};

export function setup() {
  // 1. Login
  const loginRes = http.post(
    `${BASE_URL}/auth/login-password`,
    JSON.stringify({ identifier: TEST_EMAIL, password: TEST_PASSWORD, rememberMe: false }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (loginRes.status !== 200) {
    throw new Error(`Setup login failed (${loginRes.status}): ${loginRes.body}`);
  }
  const { accessToken, sessionId } = loginRes.json();

  // 2. Revoke all OTHER sessions (keep current) to avoid device-limit during test
  http.del(`${BASE_URL}/auth/sessions`, null, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Current-Session-Id': sessionId,
    },
  });

  // 3. Resolve business + service + staff
  const biz = http.get(`${BASE_URL}/businesses/slug/${BUSINESS_SLUG}`).json();
  const businessId = biz.id;
  const serviceId = biz.services[0].id;
  const staffId = biz.staff[0].id;

  // 4. Collect up to 100 free slots across next 14 days
  const freeSlots = [];
  for (let i = 1; i <= 14 && freeSlots.length < 100; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const slotsRes = http.get(
      `${BASE_URL}/businesses/${BUSINESS_SLUG}/slots?serviceId=${serviceId}&staffId=${staffId}&date=${dateStr}`,
    );
    if (slotsRes.status !== 200) continue;
    const slots = slotsRes.json('slots') || [];
    for (const s of slots) {
      if (freeSlots.length >= 100) break;
      freeSlots.push({ date: dateStr, startTime: s.startTime });
    }
  }

  if (freeSlots.length < 10) {
    throw new Error(`Setup found only ${freeSlots.length} free slots (need ≥10).`);
  }

  console.log(`[SETUP] ${freeSlots.length} free slots collected`);
  return { accessToken, sessionId, businessId, serviceId, staffId, freeSlots };
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function slugReadScenario() {
  const res = http.get(`${BASE_URL}/businesses/slug/${BUSINESS_SLUG}`);
  check(res, { 'slug_read: 200': (r) => r.status === 200 });
  sleep(0.5 + Math.random() * 1.5);
}

export function slotsReadScenario(data) {
  const d = new Date();
  d.setDate(d.getDate() + 1 + Math.floor(Math.random() * 13));
  const dateStr = d.toISOString().split('T')[0];
  const res = http.get(
    `${BASE_URL}/businesses/${BUSINESS_SLUG}/slots?serviceId=${data.serviceId}&staffId=${data.staffId}&date=${dateStr}`,
  );
  check(res, { 'slots_read: 200': (r) => r.status === 200 });
  if (res.status === 200) slotsCount.add((res.json('slots') || []).length);
  sleep(0.8 + Math.random() * 1.5);
}

export function bookingCreateScenario(data) {
  const slot = data.freeSlots[Math.floor(Math.random() * data.freeSlots.length)];
  const idempotencyKey = uuidv4();

  const res = http.post(
    `${BASE_URL}/bookings`,
    JSON.stringify({
      businessId: data.businessId,
      serviceId: data.serviceId,
      staffId: data.staffId,
      startTime: `${slot.date}T${slot.startTime}:00`,
      paymentMethod: 'IN_PERSON',
      idempotencyKey,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.accessToken}`,
        'Idempotency-Key': idempotencyKey,
      },
    },
  );

  bookingCreated.add(res.status === 201);
  check(res, { 'booking_create: 201 or 409': (r) => r.status === 201 || r.status === 409 });
  sleep(1 + Math.random() * 2);
}

export function loginAuthScenario() {
  const res = http.post(
    `${BASE_URL}/auth/login-password`,
    JSON.stringify({ identifier: TEST_EMAIL, password: TEST_PASSWORD, rememberMe: false }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  // Free the slot immediately so next iteration doesn't hit device limit
  if (res.status === 200) {
    const body = res.json();
    http.post(`${BASE_URL}/auth/logout`, null, {
      headers: {
        Authorization: `Bearer ${body.accessToken}`,
        'X-Current-Session-Id': body.sessionId,
      },
    });
  }

  check(res, { 'login_auth: 200 or 409': (r) => r.status === 200 || r.status === 409 });
  sleep(2 + Math.random() * 2);
}
