import { createHmac } from 'node:crypto';
import { createVoiceGateway } from '/gateway/project-gateway.mjs';

const b64 = (data) => Buffer.from(JSON.stringify(data)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: process.env.TEST_API_KEY, sub: 'fixture-user', nbf: now - 10, exp: now + 120, video: { roomJoin: true, room: 'fixture-room' } })}`;
const token = `${body}.${createHmac('sha256', process.env.TEST_API_SECRET).update(body).digest('base64url')}`;
const gateway = createVoiceGateway({
  upstream: 'ws://127.0.0.1:7880', appOrigin: 'http://127.0.0.1:3000', host: '0.0.0.0', port: 7890,
  admit: async (input) => {
    if (input !== 'fixture-authorized') throw Object.assign(new Error('denied'), { status: 403 });
    return token;
  },
});
await gateway.listen();
