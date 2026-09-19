import http from 'k6/http';
import { check } from 'k6';

if (!__ENV.BASE_URL) {
  throw new Error('BASE_URL is required; choose local, preview, or production explicitly.');
}

const baseUrl = __ENV.BASE_URL.replace(/\/$/, '');
const vus = Number(__ENV.VUS || 2);
const duration = __ENV.DURATION || '20s';

export const options = {
  scenarios: {
    public_pages: {
      executor: 'constant-vus',
      vus,
      duration,
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1200'],
  },
};

export default function () {
  const responses = http.batch([
    ['GET', `${baseUrl}/`, null, { tags: { route: 'home' } }],
    ['GET', `${baseUrl}/games/`, null, { tags: { route: 'games' } }],
    ['GET', `${baseUrl}/realtime/health`, null, { tags: { route: 'realtime-health' } }],
  ]);

  check(responses, {
    'all public routes respond successfully': (items) =>
      items.every((response) => response.status >= 200 && response.status < 400),
  });
}
