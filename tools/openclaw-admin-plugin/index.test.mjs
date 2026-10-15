import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTools, default as plugin } from './index.mjs';

const token = 'x'.repeat(48);
const config = { origin: 'https://qurabia.com', token };
test('only the dedicated agent receives the three scoped tools', () => {
  assert.deepEqual(createTools({ agentId: 'main' }, config), []);
  assert.deepEqual(createTools({}, config), []);
  assert.deepEqual(createTools({ agentId: 'qurabia-admin' }, config).map(t => t.name),
    ['qurabia_site_status', 'qurabia_question_stats', 'qurabia_propose_question_status']);
});
test('tool sends only fixed-origin request with server credential and no redirects', async () => {
  let request;
  const tools = createTools({ agentId: 'qurabia-admin' }, config, async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true, data: { service: 'qurabia' } }));
  });
  await tools[0].execute('call', {});
  assert.equal(request.url, 'https://qurabia.com/api/integrations/openclaw');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(request.options.body), { tool: 'site_status', args: {} });
});
test('unknown fields, publishing and approval requests fail before network', async () => {
  let calls = 0;
  const tools = createTools({ agentId: 'qurabia-admin' }, config, () => { calls++; });
  await assert.rejects(tools[0].execute('x', { url: 'https://evil.test' }));
  await assert.rejects(tools[2].execute('x', { questionId: 'q1', nextStatus: 'PUBLISHED', reason: 'r' }));
  await assert.rejects(tools[2].execute('x', { questionId: 'q1', nextStatus: 'ARCHIVED', reason: 'r', approved: true }));
  assert.equal(calls, 0);
});
test('proposal never mutates content and returns human approval URL', async () => {
  let body;
  const tools = createTools({ agentId: 'qurabia-admin' }, config, async (_, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true, data: { id: 'ocp_test', result: 'PENDING', requiresApproval: true } }));
  });
  const out = await tools[2].execute('call', { questionId: 'q1', nextStatus: 'ARCHIVED', reason: 'راجع السؤال' });
  assert.equal(body.tool, 'propose_question_status');
  assert.match(body.args.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(body.args.nextStatus, 'ARCHIVED');
  assert.match(out.content[0].text, /https:\/\/qurabia.com\/admin\/openclaw/);
});
test('rejects unsafe origins and short credentials', () => {
  for (const origin of ['http://qurabia.com', 'https://evil.test', 'https://qurabia.com/path', 'https://user@qurabia.com']) {
    assert.throws(() => createTools({ agentId: 'qurabia-admin' }, { origin, token }));
  }
  assert.throws(() => createTools({ agentId: 'qurabia-admin' }, { ...config, token: 'short' }));
});
test('upstream errors and huge output never disclose secrets or upstream payloads', async () => {
  const tools = createTools({ agentId: 'qurabia-admin' }, config, async () => new Response(token, { status: 500 }));
  await assert.rejects(tools[0].execute('call', {}), err => !err.message.includes(token));
  const huge = createTools({ agentId: 'qurabia-admin' }, config, async () => new Response('a'.repeat(70000)));
  await assert.rejects(huge[0].execute('call', {}), /response|استجابة/);
});
test('plugin registers optional factories only and exposes no arbitrary exec tool', () => {
  const registrations = [];
  plugin.register({ pluginConfig: {}, registerTool: (...args) => registrations.push(args) });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0][1].optional, true);
});
