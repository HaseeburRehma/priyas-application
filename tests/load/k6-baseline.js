/**
 * k6 baseline load test — spec §6.3 (500 concurrent users, p95 < 300 ms).
 *
 * Run against staging:
 *   BASE_URL=https://staging.priyas.app k6 run tests/load/k6-baseline.js
 *
 * To exercise authenticated endpoints, set TEST_USER_TOKEN to a valid
 * Supabase access token (copy from a logged-in session's
 * sb-access-token cookie). Without it we only hit /api/health.
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  // Ramp profile reaches the spec target of 500 VUs and holds long
  // enough that any GC / connection-pool / DB-cache effects surface.
  stages: [
    { duration: "2m", target: 50 },
    { duration: "5m", target: 250 },
    { duration: "5m", target: 500 },
    { duration: "3m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<300"], // spec §6.3
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TOKEN = __ENV.TEST_USER_TOKEN; // optional

export default function () {
  // 1) Liveness — should never fail.
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, {
    "health 200": (r) => r.status === 200,
    "health body ok": (r) => r.json("ok") === true,
  });

  // 2) If we have an auth token, hit a real list endpoint to exercise
  // RLS + Postgres.
  if (TOKEN) {
    const headers = { authorization: `Bearer ${TOKEN}` };
    const clients = http.get(`${BASE_URL}/api/clients?pageSize=10`, {
      headers,
    });
    check(clients, {
      "clients 200": (r) => r.status === 200,
    });
    const properties = http.get(`${BASE_URL}/api/properties?pageSize=10`, {
      headers,
    });
    check(properties, {
      "properties 200": (r) => r.status === 200,
    });
  }

  // Distribute traffic over a 1–3 s think time per VU. Cuts request
  // rate to roughly 0.5 RPS per VU = ~250 RPS at 500 VUs, which is the
  // realistic shape of "500 concurrent users browsing".
  sleep(1 + Math.random() * 2);
}
