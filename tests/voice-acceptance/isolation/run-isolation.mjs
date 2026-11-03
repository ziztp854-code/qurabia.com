import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const id = `voice-iso-${randomBytes(8).toString('hex')}`;
const names = { trusted: `${id}-trusted`, attacker: `${id}-attacker`, sfu: `${id}-sfu`, gateway: `${id}-gateway` };
const sfuImage = process.env.VOICE_ISOLATION_SFU_IMAGE || '89ca9ce0791e';
const nodeImage = process.env.VOICE_ISOLATION_NODE_IMAGE || 'bc6ab0d6d44f';
const probeImage = process.env.VOICE_ISOLATION_PROBE_IMAGE || 'aa943ce41142';
const tmp = mkdtempSync(path.join(os.tmpdir(), 'voice-isolation-'));
const key = `API${randomBytes(12).toString('hex')}`;
const secret = randomBytes(32).toString('hex');
const envFile = path.join(tmp, 'env');
writeFileSync(envFile, `LIVEKIT_KEYS=${key}: ${secret}\nTEST_API_KEY=${key}\nTEST_API_SECRET=${secret}\n`, { mode: 0o600 });
function docker(...args) {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 40000 });
  if (r.error || r.status !== 0) throw new Error(`docker ${args[0]} failed: ${r.error?.message || r.stderr}`);
  return r.stdout.trim();
}
function cleanup(...args) { spawnSync('docker', args, { encoding: 'utf8', timeout: 15000 }); }
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  docker('network', 'create', names.trusted);
  docker('network', 'create', '--internal', names.attacker);
  docker('run', '-d', '--pull', 'never', '--name', names.sfu, '--network', names.trusted,
    '-p', '127.0.0.1::7890', '--env-file', envFile, sfuImage, '--bind', '0.0.0.0');
  const info = JSON.parse(docker('inspect', names.sfu))[0];
  const ip = info.NetworkSettings.Networks[names.trusted].IPAddress;
  const published = info.NetworkSettings.Ports;
  const noSfuPublished = !published['7880/tcp'];
  const mapping = published['7890/tcp']?.[0];
  if (!mapping) throw new Error('Gateway binding unavailable; SFU state: ' + JSON.stringify(info.State) + ' ports: ' + JSON.stringify(published));
  if (mapping.HostIp !== '127.0.0.1') throw new Error('Gateway host binding is not loopback');
  docker('run', '-d', '--pull', 'never', '--name', names.gateway, '--network', `container:${names.sfu}`,
    '--env-file', envFile, '-v', `${path.join(root, 'scripts/voice-signaling-gateway.mjs')}:/gateway/project-gateway.mjs:ro`,
    '-v', `${path.join(here, 'gateway-actor.mjs')}:/gateway/gateway-actor.mjs:ro`,
    '--entrypoint', 'node', nodeImage, '/gateway/gateway-actor.mjs');
  const port = mapping.HostPort;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) { ready = true; break; } } catch {}
    await pause(250);
  }
  if (!ready) throw new Error('Gateway not ready');
  const probe = (network, expected) => {
    const source = 'import socket,sys\ns=socket.socket();s.settimeout(2)\ntry:\n s.connect((sys.argv[1],7880));ok=True\nexcept OSError: ok=False\ns.close()\nsys.exit(0 if ok == (sys.argv[2] == "yes") else 1)';
    docker('run', '--rm', '--pull', 'never', '--name', id + '-probe-' + expected, '--network', network, '--entrypoint', 'python', probeImage, '-c', source, ip, expected);
    return true;
  };
  const trusted = probe(names.trusted, 'yes');
  const blocked = probe(names.attacker, 'no');
  const adminSource = `import os,time,json,base64,hmac,hashlib,urllib.request,sys
b=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).rstrip(b'=')
t=int(time.time()); h=b({'alg':'HS256','typ':'JWT'}); p=b({'iss':os.environ['TEST_API_KEY'],'sub':'fixture-admin','nbf':t-10,'exp':t+60,'video':{'roomList':True}})
m=h+b'.'+p; sig=base64.urlsafe_b64encode(hmac.new(os.environ['TEST_API_SECRET'].encode(),m,hashlib.sha256).digest()).rstrip(b'='); token=(m+b'.'+sig).decode()
r=urllib.request.Request('http://'+sys.argv[1]+':7880/twirp/livekit.RoomService/ListRooms',data=b'{}',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
with urllib.request.urlopen(r,timeout=5) as response: assert response.status == 200`;
  docker('run', '--rm', '--pull', 'never', '--name', id + '-admin', '--network', names.trusted, '--env-file', envFile, '--entrypoint', 'python', probeImage, '-c', adminSource, ip);
  const admin = true;
  const denied = await fetch(`http://127.0.0.1:${port}/rtc?access_token=fixture-denied`);
  const allowed = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/rtc?access_token=fixture-authorized&protocol=15&auto_subscribe=1`);
    const timer = setTimeout(() => { ws.close(); resolve(false); }, 8000);
    ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(true); };
    ws.onerror = () => { clearTimeout(timer); resolve(false); };
  });
  console.log(JSON.stringify({ noSfuPublished, loopbackGateway: mapping.HostIp === '127.0.0.1', trusted, blocked, admin, denied: denied.status === 403, allowed }));
} finally {
  cleanup('rm', '-f', id + '-probe-yes', id + '-probe-no', id + '-admin', names.gateway, names.sfu);
  cleanup('network', 'rm', names.attacker, names.trusted);
  rmSync(tmp, { recursive: true, force: true });
}
