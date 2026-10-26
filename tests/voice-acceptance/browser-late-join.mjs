/** Real AudioSession browser acceptance against an explicitly local SFU. No user media. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const requireVite = createRequire(requireWeb.resolve('vitest/package.json'));
const { createServer } = await import(pathToFileURL(requireVite.resolve('vite')).href);
const { default: react } = await import(
  pathToFileURL(requireWeb.resolve('@vitejs/plugin-react')).href
);
const { chromium, expect } = requireWeb('@playwright/test');
const { AccessToken, RoomServiceClient, TrackSource } = requireWeb('livekit-server-sdk');

export async function checkBrowserLateJoin(runtime, artifactDirectory, options = {}) {
  const endpoint = new URL(runtime.url);
  assert.equal(endpoint.hostname, '127.0.0.1', 'Only an isolated loopback SFU is allowed');
  assert.ok(['ws:', 'wss:'].includes(endpoint.protocol));
  assert.ok(runtime.key && runtime.secret, 'Explicit disposable local SFU credentials required');
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const roomName = options.roomName || `browser-late-join-${randomUUID()}`;
  const roomId = options.roomId || roomName;
  const service = new RoomServiceClient(
    runtime.url.replace(/^ws/, 'http'),
    runtime.key,
    runtime.secret,
  );
  const identities = [
    'receiver-a',
    'receiver-b',
    'late-publisher',
    ...(options.subsequentPublisher ? ['late-publisher-2'] : []),
  ];
  const tokenCounts = new Map(identities.map((identity) => [identity, 0]));
  const contexts = [];
  let browser;
  let fixture;
  let roomCreated = false;
  let report;
  let primaryFailure;
  let passiveObserve;
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-browser-vite-'));
  try {
    await service.createRoom({
      name: roomName,
      emptyTimeout: 180,
      maxParticipants: options.subsequentPublisher ? 4 : 3,
    });
    roomCreated = true;
    fixture = await createServer({
      configFile: false,
      cacheDir: cacheDirectory,
      root: path.join(root, 'apps/web'),
      envDir: path.join(root, 'tests/voice-acceptance'),
      plugins: [
        react(),
        {
          name: 'local-late-join-fixture',
          configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
              const url = new URL(request.url, 'http://127.0.0.1');
              const identity = request.headers['x-fixture-identity'];
              if (!identities.includes(identity)) {
                response.writeHead(403).end();
                return;
              }
              if (url.pathname === '/fixture/publisher-connected') {
                if (!identity.startsWith('late-publisher')) {
                  response.writeHead(403).end();
                  return;
                }
                try {
                  if (identity === 'late-publisher') await options.afterPublisherConnect?.();
                  response.writeHead(200).end('{}');
                } catch {
                  response.writeHead(500).end('{}');
                }
                return;
              }
              if (/^\/api\/voice\/rooms\/[^/]+\/token\/$/.test(url.pathname)) {
                tokenCounts.set(identity, tokenCounts.get(identity) + 1);
                response.setHeader('Content-Type', 'application/json');
                response.setHeader('Cache-Control', 'no-store');
                if (options.issueToken) {
                  try {
                    response.end(JSON.stringify(await options.issueToken(identity)));
                  } catch {
                    response
                      .writeHead(500)
                      .end(JSON.stringify({ error: 'Local control-plane issuance failed' }));
                  }
                  return;
                }
                const publisher =
                  identity.startsWith('late-publisher') || identity === 'receiver-a';
                const token = new AccessToken(runtime.key, runtime.secret, { identity, ttl: 120 });
                token.addGrant({
                  room: roomName,
                  roomJoin: true,
                  canSubscribe: true,
                  canPublish: publisher,
                  canPublishData: false,
                  canPublishSources: publisher ? [TrackSource.MICROPHONE] : [],
                });
                response.setHeader('Content-Type', 'application/json');
                response.setHeader('Cache-Control', 'no-store');
                response.end(
                  JSON.stringify({
                    token: await token.toJwt(),
                    url: runtime.url,
                    canPublish: publisher,
                  }),
                );
                return;
              }
              if (url.pathname === '/') {
                const config = {
                  identity: options.identityByPersona?.[identity] || identity,
                  persona: identity,
                  roomId,
                  url: runtime.url,
                  autoJoin: Boolean(options.autoJoin),
                };
                response.setHeader('Content-Type', 'text/html');
                response.end(
                  await server.transformIndexHtml(
                    '/',
                    `<html><head><title>Local late audio join</title></head><body><div id="root"></div><script>window.fixture=${JSON.stringify(config)}</script><script type="module" src="/@fs/${root.replaceAll('\\', '/')}/tests/voice-acceptance/browser-late-join-harness.tsx"></script></body></html>`,
                  ),
                );
                return;
              }
              next();
            });
          },
        },
      ],
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: {
          '@': path.join(root, 'apps/web/src'),
          react: path.dirname(requireWeb.resolve('react/package.json')),
          'react-dom': path.dirname(requireWeb.resolve('react-dom/package.json')),
          'livekit-client': path.join(
            path.dirname(requireWeb.resolve('livekit-client')),
            'livekit-client.esm.mjs',
          ),
        },
      },
      optimizeDeps: {
        entries: [path.join(root, 'tests/voice-acceptance/browser-late-join-harness.tsx')],
        include: ['react', 'react-dom/client', 'react/jsx-runtime', 'lucide-react'],
        exclude: ['livekit-client'],
      },
      define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
      server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, fs: { allow: [root] } },
      logLevel: 'error',
    });
    await fixture.listen();
    const address = fixture.httpServer.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({
      headless: options.headless ?? true,
      executablePath: process.env.VOICE_CHROMIUM_PATH || undefined,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        ...(options.strictAutoplay ? ['--autoplay-policy=document-user-activation-required'] : []),
      ],
    });
    const browserSession = await browser.newBrowserCDPSession();
    const browserArguments = await browserSession
      .send('Browser.getBrowserCommandLine')
      .catch(() => null);
    const autoplayFlags =
      browserArguments?.arguments.filter((argument) =>
        /autoplay|media-engagement/i.test(argument),
      ) ?? null;
    await browserSession.detach();
    const pages = [];
    const inspectors = [];
    // Playwright's evaluate/waitForFunction marks Runtime calls as userGesture:true.
    // Passive CDP observation must not unlock autoplay in receiver documents.
    const observe = async (index, fn) => {
      const result = await inspectors[index].send('Runtime.evaluate', {
        expression: `(${fn.toString()})()`,
        awaitPromise: true,
        returnByValue: true,
        userGesture: false,
      });
      if (result.exceptionDetails) throw new Error('Passive receiver observation failed');
      return result.result.value;
    };
    passiveObserve = observe;
    const waitForObservation = (index, fn, timeout = 20000) =>
      expect.poll(() => observe(index, fn), { timeout }).toBeTruthy();
    for (const identity of identities) {
      const context = await browser.newContext({
        extraHTTPHeaders: { 'x-fixture-identity': identity },
      });
      contexts.push(context);
      // Network snapshots would retain disposable SFU JWTs. Keep action/screenshot
      // traces, with separate sanitized RTC evidence below instead.
      await context.tracing.start({ screenshots: true, snapshots: false, sources: true });
      await context.addInitScript(() => {
        window.fixturePeerConnections = [];
        const NativePeerConnection = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends NativePeerConnection {
          constructor(...args) {
            super(...args);
            window.fixturePeerConnections.push(this);
          }
        };
      });
      await context.route('**/*', (route) => {
        const target = new URL(route.request().url());
        return target.hostname === '127.0.0.1' ? route.continue() : route.abort();
      });
      pages.push(await context.newPage());
      inspectors.push(await context.newCDPSession(pages.at(-1)));
    }
    for (let index = 0; index < 2; index++) {
      await pages[index].goto(baseUrl);
      if (!options.autoJoin)
        await pages[index].getByRole('button', { name: 'Join listener', exact: true }).click();
      await waitForObservation(
        index,
        () =>
          document.querySelector('[data-testid="connection-state"]')?.textContent === 'connected',
      );
      assert.equal(
        await observe(index, () => document.querySelectorAll('audio[data-voice-audio]').length),
        0,
        'Listener must be established before the publisher exists',
      );
    }
    await options.beforePublisherConnect?.();
    const started = performance.now();
    await pages[2].goto(baseUrl);
    await pages[2].getByRole('button', { name: 'Publish tone', exact: true }).click();
    await expect(pages[2].getByTestId('publisher-state')).toHaveText('published', {
      timeout: 20000,
    });
    const receivers = [];
    for (let index = 0; index < 2; index++) {
      await waitForObservation(index, () => {
        const audio = document.querySelector('audio[data-voice-audio]');
        return (
          (audio && !audio.paused && audio.currentTime > 0) ||
          [...document.querySelectorAll('button')].some(
            (button) => button.textContent === 'تفعيل الاستماع',
          )
        );
      });
      const playbackButton = pages[index].getByRole('button', {
        name: 'تفعيل الاستماع',
        exact: true,
      });
      const isPlaybackButtonPresent = () =>
        [...document.querySelectorAll('button')].some(
          (button) => button.textContent === 'تفعيل الاستماع',
        );
      const blockedBeforeUserGesture = await observe(index, isPlaybackButtonPresent);
      if (options.requireInitialPlaybackBlock)
        assert.equal(
          blockedBeforeUserGesture,
          true,
          'Strict passive fixture must actually reproduce initial playback block',
        );
      let deafenProbe;
      if (options.deafenProbe) {
        const before = await observe(index, () => window.capturePlaybackSnapshot('before-deafen'));
        await pages[index].getByRole('button', { name: 'Deafen', exact: true }).click();
        await waitForObservation(
          index,
          () => document.querySelector('audio[data-voice-audio]')?.muted === true,
        );
        const mutedAutoplayStarted = await waitForObservation(
          index,
          () => {
            const element = document.querySelector('audio[data-voice-audio]');
            return element && element.muted && !element.paused && element.currentTime > 0;
          },
          2000,
        ).then(
          () => true,
          () => false,
        );
        const deafened = await observe(index, () =>
          window.capturePlaybackSnapshot('while-deafened'),
        );
        await pages[index].getByRole('button', { name: 'Undeafen', exact: true }).click();
        await waitForObservation(
          index,
          () => document.querySelector('audio[data-voice-audio]')?.muted === false,
        );
        const undeafened = await observe(index, () =>
          window.capturePlaybackSnapshot('after-undeafen'),
        );
        const recovered = await waitForObservation(
          index,
          () => {
            const element = document.querySelector('audio[data-voice-audio]');
            return element && !element.paused && element.currentTime > 0;
          },
          2000,
        ).then(
          () => true,
          () => false,
        );
        deafenProbe = { before, mutedAutoplayStarted, deafened, undeafened, recovered };
      }
      const recoveryClick = await observe(index, isPlaybackButtonPresent);
      if (recoveryClick) await playbackButton.click();
      await waitForObservation(index, () => {
        const audio = document.querySelector('audio[data-voice-audio]');
        return audio && !audio.paused && audio.currentTime > 0 && !audio.muted && audio.volume > 0;
      });
      const firstPlaybackLatencyMs = Math.round(performance.now() - started);
      await observe(index, () => {
        window.fixturePcmResult = null;
        window.collectPcmEvidence().then(
          (value) => {
            window.fixturePcmResult = { value };
          },
          () => {
            window.fixturePcmResult = { failed: true };
          },
        );
      });
      await waitForObservation(index, () => window.fixturePcmResult !== null);
      const measured = await observe(index, () => window.fixturePcmResult);
      assert.ok(measured.value, 'Browser PCM observation must complete successfully');
      const evidence = measured.value;
      assert.ok(
        evidence.frames >= 15 &&
          evidence.rms > 0.005 &&
          evidence.toneRatio >= 0.8 &&
          Math.abs(evidence.frequencyHz - 660) < 25 &&
          evidence.playing &&
          evidence.trackLive &&
          !evidence.muted &&
          evidence.volume > 0,
        'Actual decoded PCM must match the generated late-publisher tone',
      );
      receivers.push({
        identity: identities[index],
        ...evidence,
        blockedBeforeUserGesture,
        playbackRecoveryClicks: recoveryClick ? 1 : 0,
        deafenProbe,
        playbackSnapshots: await observe(index, () => window.playbackSnapshots),
        firstPlaybackLatencyMs,
        latencyMs: Math.round(performance.now() - started),
        tokenRequests: tokenCounts.get(identities[index]),
      });
      assert.equal(
        tokenCounts.get(identities[index]),
        1,
        'No reconnect or refresh may rescue late audio',
      );
      await waitForObservation(
        index,
        () =>
          document.querySelector('[data-testid="connection-state"]')?.textContent === 'connected',
      );
      assert.equal(
        await observe(index, () => document.querySelectorAll('audio[data-voice-audio]').length),
        1,
      );
    }
    const subsequentReceivers = [];
    if (options.subsequentPublisher) {
      assert.ok(
        !options.issueToken,
        'Subsequent guest is the isolated synthetic-token fixture only',
      );
      await pages[3].goto(baseUrl);
      await pages[3].getByRole('button', { name: 'Publish tone', exact: true }).click();
      await expect(pages[3].getByTestId('publisher-state')).toHaveText('published', {
        timeout: 20000,
      });
      for (let index = 0; index < 2; index++) {
        await observe(index, () => {
          window.fixtureTargetIdentity = 'late-publisher-2';
          return true;
        });
        await waitForObservation(index, () => {
          const element = document.querySelector('audio[data-voice-audio="late-publisher-2"]');
          return (
            element &&
            !element.paused &&
            element.currentTime > 0 &&
            !element.muted &&
            element.volume > 0
          );
        });
        assert.equal(
          await observe(index, () =>
            [...document.querySelectorAll('button')].some(
              (button) => button.textContent === 'تفعيل الاستماع',
            ),
          ),
          false,
          'Later guest must not need another listening gesture',
        );
        await observe(index, () => {
          window.fixturePcmResult = null;
          window.collectPcmEvidence().then(
            (value) => {
              window.fixturePcmResult = { value };
            },
            () => {
              window.fixturePcmResult = { failed: true };
            },
          );
        });
        await waitForObservation(index, () => window.fixturePcmResult !== null);
        const measured = await observe(index, () => window.fixturePcmResult);
        assert.ok(
          measured.value?.rms > 0.005 &&
            measured.value.toneRatio >= 0.8 &&
            measured.value.playing &&
            !measured.value.muted,
          'Second actual guest must deliver decoded PCM without receiver recovery',
        );
        assert.equal(
          tokenCounts.get(identities[index]),
          1,
          'Second guest must not reconnect receiver',
        );
        subsequentReceivers.push({
          identity: identities[index],
          ...measured.value,
          tokenRequests: tokenCounts.get(identities[index]),
          playbackSnapshots: await observe(index, () => window.playbackSnapshots),
        });
      }
    }
    report = {
      ok: true,
      receivers,
      subsequentReceivers,
      assertion:
        'Decoded synthetic PCM in two real AudioSession browsers after a late publisher joined; no reconnect.',
      controlPlane: Boolean(options.issueToken),
      joinMode: options.autoJoin ? 'initial-auto-join-without-gesture' : 'join-button-user-gesture',
      browserMode: options.headless === false ? 'headed' : 'headless',
      browserVersion: browser.version(),
      autoplayFlags,
      strictAutoplay: Boolean(options.strictAutoplay),
      receiverProbe:
        'MediaRecorder + OfflineAudioContext only after native HTML audio playback; no receiver AudioContext.resume',
    };
    return report;
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    for (let index = 0; index < contexts.length; index++) {
      if (!report?.ok) {
        const page = contexts[index].pages()[0];
        if (page) {
          await page
            .screenshot({ path: path.join(artifactDirectory, `failure-${index}.png`) })
            .catch(() => {});
          const evidence = await passiveObserve(index, async () => {
            const peers = [];
            for (const peer of window.fixturePeerConnections || []) {
              const stats = await peer.getStats();
              const addressClass = (value) =>
                value === '127.0.0.1' || value === '::1'
                  ? 'loopback'
                  : value
                    ? 'non-loopback'
                    : 'not-reported';
              peers.push({
                connectionState: peer.connectionState,
                iceState: peer.iceConnectionState,
                candidates: [...stats.values()]
                  .filter((row) => /candidate$/.test(row.type))
                  .map((row) => ({
                    type: row.type,
                    candidateType: row.candidateType,
                    protocol: row.protocol,
                    addressClass: addressClass(row.address || row.ip),
                    port: row.port,
                  })),
                pairs: [...stats.values()]
                  .filter((row) => row.type === 'candidate-pair')
                  .map((row) => ({
                    state: row.state,
                    nominated: row.nominated,
                    bytesReceived: row.bytesReceived,
                  })),
              });
            }
            return {
              audio: window.audioEvidence || null,
              playbackSnapshots: window.playbackSnapshots || [],
              peers,
            };
          }).catch(() => ({ unavailable: true }));
          fs.writeFileSync(
            path.join(artifactDirectory, `rtc-${index}.json`),
            JSON.stringify(evidence, null, 2),
          );
        }
        await contexts[index].tracing
          .stop({ path: path.join(artifactDirectory, `failure-${index}.zip`) })
          .catch(() => {});
      } else await contexts[index].tracing.stop();
      await contexts[index].close().catch((error) => cleanupErrors.push(error));
    }
    await browser?.close().catch((error) => cleanupErrors.push(error));
    await fixture?.close().catch((error) => cleanupErrors.push(error));
    if (roomCreated)
      await service.deleteRoom(roomName).catch((error) => {
        if (error.status !== 404 && error.name !== 'Not Found') cleanupErrors.push(error);
      });
    assert.equal(path.dirname(cacheDirectory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(cacheDirectory).startsWith('voice-browser-vite-'));
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
    if (!primaryFailure && cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Local fixture cleanup failed');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(
    process.env.VOICE_BROWSER_LOCAL_ACCEPTANCE,
    '1',
    'Explicit local acceptance opt-in required',
  );
  const runtime = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const directory = path.resolve(process.argv[3] || 'output/browser-late-join');
  const caseName = process.argv[4] || 'baseline';
  assert.ok(['baseline', 'initial-block-one-recovery', 'initial-block-deafen'].includes(caseName));
  const options =
    caseName === 'baseline'
      ? {}
      : {
          autoJoin: true,
          strictAutoplay: true,
          requireInitialPlaybackBlock: true,
          subsequentPublisher: true,
          deafenProbe: caseName === 'initial-block-deafen',
        };
  try {
    const report = await checkBrowserLateJoin(runtime, directory, options);
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    fs.writeFileSync(
      path.join(directory, 'failure.json'),
      JSON.stringify(
        {
          ok: false,
          name: error.name,
          message: String(error.message).replace(/eyJ[A-Za-z0-9_.-]+/g, '<REDACTED_TOKEN>'),
        },
        null,
        2,
      ),
    );
    throw new Error('Local browser late-join acceptance failed; inspect isolated artifacts');
  }
}
