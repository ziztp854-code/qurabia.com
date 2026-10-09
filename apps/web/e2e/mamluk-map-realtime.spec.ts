import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type {} from './fixtures/globe-map-probe';

test.skip(
  process.env.RUN_MAMLUK_REALTIME_E2E !== '1',
  'Requires the opt-in real Socket.IO fixture.',
);

interface Stats {
  viewport: number;
  overview: number;
  commands: number;
  centralTicks: number;
  watchedWorldIds: string[];
}
const stats = async (request: APIRequestContext): Promise<Stats> =>
  (await request.get('/__globe_test/stats')).json();
const control = async (request: APIRequestContext, realtime: Record<string, unknown>) => {
  expect((await request.post('/__globe_test/control', { data: { realtime } })).ok()).toBe(true);
};
const difference = (before: Stats, after: Stats) => ({
  viewport: after.viewport - before.viewport,
  overview: after.overview - before.overview,
  commands: after.commands - before.commands,
  centralTicks: after.centralTicks - before.centralTicks,
});

// All sample endpoints use the browser's monotonic clock. Render means the actual MapLibre
// circle is queryable in a frame, not merely a successful HTTP response or source.setData call.
async function commandSample(page: Page, id: string, acceptedEvent: boolean) {
  return page.evaluate(
    async ({ id, acceptedEvent }) => {
      const started = performance.now();
      const rendered = new Promise<number>((resolve, reject) => {
        const deadline = started + 20000;
        const frame = () => {
          const map = window.__globeFixtureMap;
          if (
            map?.getLayer('mamluk-armies') &&
            map
              .queryRenderedFeatures(undefined, { layers: ['mamluk-armies'] })
              .some((feature) => feature.id === id)
          )
            resolve(performance.now());
          else if (performance.now() >= deadline) reject(new Error('Army was not rendered: ' + id));
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const response = await fetch('/__globe_test/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = (await response.json()) as { success: boolean; id: string; revision: number };
      const acceptedResponse = performance.now();
      if (!response.ok || !body.success || body.id !== id)
        throw new Error('Fixture command was not accepted');
      if (acceptedEvent)
        window.dispatchEvent(
          new CustomEvent('mamluk:command-accepted', {
            detail: { worldId: 'world', revision: body.revision },
          }),
        );
      const firstRendered = await rendered;
      return {
        id,
        commandStartToRenderMs: firstRendered - started,
        acceptedResponseToRenderMs: firstRendered - acceptedResponse,
        renderedBeforeHttpResponse: firstRendered < acceptedResponse,
      };
    },
    { id, acceptedEvent },
  );
}

test('real revision transport keeps idle requests bounded and recovers missed notifications, disconnect and reconnect', async ({
  page,
  request,
}, testInfo) => {
  await request.post('/__globe_test/reset');
  const errors: string[] = [];
  const frames: string[] = [];
  let connections = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/socket.io/')) return;
    connections += 1;
    socket.on('framereceived', ({ payload }) => frames.push(String(payload)));
  });
  await page.goto('/globe');
  await expect(page.locator('canvas.maplibregl-canvas[data-map-ready="true"]')).toBeVisible();
  await expect
    .poll(() =>
      frames.some((frame) => frame.includes('revision-push-v1') && frame.includes('"live":true')),
    )
    .toBe(true);
  await expect.poll(async () => (await stats(request)).watchedWorldIds).toContain('world');
  await page.evaluate(() =>
    window.__globeFixtureMap!.jumpTo({ center: [31.2357, 30.0444], zoom: 9.5 }),
  );
  // Request a fresh authorization snapshot before the idle window, whose length stays below TTL.
  const fresh = page.waitForResponse(
    (response) => response.url().includes('/world-map/viewport?') && response.status() === 200,
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('mamluk:command-accepted', { detail: { worldId: 'world' } }),
    ),
  );
  await fresh;
  await page.waitForTimeout(500);
  const idleBefore = await stats(request);
  await page.waitForTimeout(6000);
  const idle = difference(idleBefore, await stats(request));
  expect(idle.viewport).toBe(0);
  expect(idle.centralTicks).toBeGreaterThan(0);
  await control(request, { responseDelayMs: 100 });
  const healthyBefore = await stats(request);
  const samples = [];
  for (let i = 1; i <= 8; i += 1)
    samples.push(await commandSample(page, `benchmark-army-${i}`, true));
  const healthyCommands = difference(healthyBefore, await stats(request));
  expect(healthyCommands.commands).toBe(8);
  // A rejection must neither emit acceptance nor create a marker.
  const rejected = await request.post('/__globe_test/command', { data: { reject: true } });
  expect(rejected.status()).toBe(400);
  const features = () =>
    page.evaluate(() =>
      window
        .__globeFixtureMap!.queryRenderedFeatures(undefined, { layers: ['mamluk-armies'] })
        .map((feature) => feature.id),
    );
  expect(await features()).not.toContain('benchmark-army-9');
  // Lose the command publisher's notification and the caller's acceptance event. The actual
  // gateway learns the new revision at the next central ledger repair, rather than per-client polling.
  await control(request, { notify: false, responseDelayMs: 0 });
  const repairBefore = await stats(request);
  const missedNotification = await commandSample(page, 'benchmark-army-9', false);
  const centralRepair = difference(repairBefore, await stats(request));
  expect(centralRepair.centralTicks).toBeGreaterThan(0);
  // Close the actual Engine.IO transport. HTTP API stays reachable; fallback must recover data.
  await control(request, { mode: 'offline' });
  await expect.poll(async () => (await stats(request)).watchedWorldIds.length).toBe(0);
  const fallbackBefore = await stats(request);
  const fallbackSample = await commandSample(page, 'benchmark-army-10', false);
  await page.waitForTimeout(11000);
  const fallback = difference(fallbackBefore, await stats(request));
  expect(fallback.viewport).toBeGreaterThan(0);
  expect(fallback.viewport).toBeLessThanOrEqual(3);
  const reconnectStart = Date.now();
  const viewportBeforeReconnect = (await stats(request)).viewport;
  const previousLiveAcks = frames.filter(
    (frame) => frame.includes('revision-push-v1') && frame.includes('"live":true'),
  ).length;
  await control(request, { mode: 'live', notify: true });
  await expect
    .poll(
      () =>
        frames.filter(
          (frame) => frame.includes('revision-push-v1') && frame.includes('"live":true'),
        ).length,
      { timeout: 45000 },
    )
    .toBeGreaterThan(previousLiveAcks);
  await expect
    .poll(async () => (await stats(request)).viewport, { timeout: 15000 })
    .toBeGreaterThan(viewportBeforeReconnect);
  const reconnectToAuthorizedSnapshotMs = Date.now() - reconnectStart;
  const reconnectedSample = await commandSample(page, 'benchmark-army-11', true);
  const freshReconnect = page.waitForResponse(
    (response) => response.url().includes('/world-map/viewport?') && response.status() === 200,
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('mamluk:command-accepted', { detail: { worldId: 'world' } }),
    ),
  );
  await freshReconnect;
  await page.waitForTimeout(500);
  const reconnectBefore = await stats(request);
  await page.waitForTimeout(6000);
  const reconnectedIdle = difference(reconnectBefore, await stats(request));
  expect(reconnectedIdle.viewport).toBe(0);
  expect(connections).toBeGreaterThan(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('realtime-map.png'), fullPage: true });
  const report = {
    project: testInfo.project.name,
    sourceBaseSha: 'c18148c3604aa16aae4f743bb724573192261270',
    provenance:
      'Local actual browser/MapLibre + Socket.IO websocket + compiled KingdomsGateway. Synthetic ledger, command acceptance and viewport DTO; not production, real auth, engine or database.',
    measuredEndpoints:
      'Browser performance.now command invocation -> first MapLibre rendered armyId; HTTP acceptance response -> same render (may be negative). Reconnect duration is wall clock.',
    authorizationTtlMs: 15000,
    healthyIdleWindowMs: 6000,
    counts: { idle, healthyCommands, centralRepair, fallback, reconnectedIdle },
    samples,
    missedNotification,
    fallbackSample,
    reconnectedSample,
    reconnectToAuthorizedSnapshotMs,
    socketConnections: connections,
    receivedRevisionFrames: frames.filter((frame) => frame.includes('kingdoms:revision')).length,
    panelApiRequests: 0,
    panelScope: 'useKingdoms/panels are not mounted by this fixture',
    comparisonBaseline: 'Not measured against the base SHA; raw local samples only.',
  };
  await writeFile(testInfo.outputPath('realtime-metrics.json'), JSON.stringify(report, null, 2));
  await testInfo.attach('local realtime metrics', {
    path: testInfo.outputPath('realtime-metrics.json'),
    contentType: 'application/json',
  });
});
