import http from 'k6/http';
import { check, sleep } from 'k6';

const configuredBaseUrl = __ENV.REALTIME_URL || __ENV.BASE_URL;
if (!configuredBaseUrl) {
  throw new Error('BASE_URL is required; choose local, preview, or production explicitly.');
}

const baseUrl = configuredBaseUrl.replace(/\/$/, '');

export const options = {
  scenarios: {
    polling_handshake: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 1),
      iterations: Number(__ENV.ITERATIONS || 5),
      maxDuration: __ENV.MAX_DURATION || '30s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const timestamp = `${Date.now()}-${__VU}-${__ITER}`;
  const response = http.get(`${baseUrl}/socket.io/?EIO=4&transport=polling&t=${timestamp}`, {
    headers: { Origin: __ENV.ORIGIN || baseUrl },
    tags: { route: 'socketio-polling-handshake' },
  });

  check(response, {
    'handshake returns 200': (item) => item.status === 200,
    'handshake opens an Engine.IO session': (item) => item.body.startsWith('0{'),
    'handshake includes connection settings': (item) =>
      item.body.includes('"sid"') &&
      item.body.includes('"pingInterval"') &&
      item.body.includes('"pingTimeout"'),
  });

  if (response.status === 200 && response.body.startsWith('0{')) {
    const session = JSON.parse(response.body.slice(1));
    const closeResponse = http.post(
      `${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${session.sid}`,
      '1',
      {
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          Origin: __ENV.ORIGIN || baseUrl,
        },
        tags: { route: 'socketio-polling-close' },
      },
    );

    check(closeResponse, {
      'polling session closes cleanly': (item) => item.status === 200,
    });
  }

  sleep(0.2);
}
