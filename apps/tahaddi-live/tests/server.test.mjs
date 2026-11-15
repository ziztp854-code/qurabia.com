import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/index.mjs";

test("a guest creates an Arabic voice room", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const session = await fetch(app.url + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "سارة" }),
  });
  const cookie = session.headers.get("set-cookie").split(";")[0];
  const response = await fetch(app.url + "/api/rooms", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "أصدقاء المساء",
      mode: "voice",
      category: "دردشة",
    }),
  });
  assert.equal(response.status, 201);
  const { room } = await response.json();
  assert.equal(room.title, "أصدقاء المساء");
  assert.equal(room.count, 0);
  assert.equal(room.host.name, "سارة");
});
import { WebSocket } from "ws";
async function guest(app, name) {
  const r = await fetch(app.url + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return {
    cookie: r.headers.get("set-cookie").split(";")[0],
    user: (await r.json()).user,
  };
}
async function connect(app, cookie) {
  const ws = new WebSocket(app.url.replace("http", "ws") + "/ws", {
    headers: { Cookie: cookie },
  });
  const queue = [],
    pending = [];
  ws.on("message", (buffer) => {
    const event = JSON.parse(buffer);
    const index = pending.findIndex((p) => p.type === event.type);
    if (index >= 0) {
      const [p] = pending.splice(index, 1);
      clearTimeout(p.timer);
      p.resolve(event);
    } else queue.push(event);
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return {
    ws,
    send: (value) => ws.send(JSON.stringify(value)),
    next: (type) => {
      const index = queue.findIndex((e) => e.type === type);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const p = {
          type,
          resolve,
          timer: setTimeout(
            () => reject(new Error("Timeout waiting for " + type)),
            1500,
          ),
        };
        pending.push(p);
      });
    },
  };
}
test("two guests join the same room with truthful presence", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const a = await guest(app, "سارة"),
    b = await guest(app, "عمر"),
    one = await connect(app, a.cookie),
    two = await connect(app, b.cookie);
  one.send({ type: "join", roomId: "demo-1" });
  assert.equal((await one.next("joined")).users.length, 1);
  two.send({ type: "join", roomId: "demo-1" });
  const joined = await two.next("joined");
  assert.equal(joined.users.length, 2);
  assert.equal(joined.room.count, 2);
  assert.equal((await one.next("peer-joined")).user.id, b.user.id);
});
test("chat reaches another real guest in the room", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const a = await guest(app, "سارة"),
    b = await guest(app, "عمر"),
    one = await connect(app, a.cookie),
    two = await connect(app, b.cookie);
  for (const peer of [one, two]) {
    peer.send({ type: "join", roomId: "demo-1" });
    await peer.next("joined");
  }
  one.send({ type: "chat", text: "مرحبًا يا عمر" });
  const { message } = await two.next("chat");
  assert.equal(message.text, "مرحبًا يا عمر");
  assert.equal(message.userId, a.user.id);
  assert.equal(message.name, "سارة");
});
test("leaving and disconnecting remove participants and notify peers", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const a = await guest(app, "سارة"),
    b = await guest(app, "عمر"),
    one = await connect(app, a.cookie),
    two = await connect(app, b.cookie);
  for (const peer of [one, two]) {
    peer.send({ type: "join", roomId: "demo-1" });
    await peer.next("joined");
  }
  two.send({ type: "leave" });
  await two.next("left");
  assert.equal((await one.next("peer-left")).userId, b.user.id);
  let rooms = (await (await fetch(app.url + "/api/rooms")).json()).rooms;
  assert.equal(rooms[0].count, 1);
  two.send({ type: "join", roomId: "demo-1" });
  await two.next("joined");
  two.ws.close();
  assert.equal((await one.next("peer-left")).userId, b.user.id);
  rooms = (await (await fetch(app.url + "/api/rooms")).json()).rooms;
  assert.equal(rooms[0].count, 1);
});
test("invalid and oversized room creation requests are rejected", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const a = await guest(app, "سارة");
  for (const [payload, status] of [
    [{ title: "", mode: "voice" }, 400],
    [{ title: "x".repeat(10000), mode: "voice" }, 413],
  ]) {
    const r = await fetch(app.url + "/api/rooms", {
      method: "POST",
      headers: { Cookie: a.cookie, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(r.status, status);
  }
});
test("full rooms reject fifth guest without inventing participants", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  for (let i = 0; i < 5; i++) {
    const g = await guest(app, "ضيف " + i),
      peer = await connect(app, g.cookie);
    peer.send({ type: "join", roomId: "demo-1" });
    if (i < 4) assert.equal((await peer.next("joined")).users.length, i + 1);
    else assert.match((await peer.next("error")).message, /مكتملة/);
  }
  assert.equal(
    (await (await fetch(app.url + "/api/rooms")).json()).rooms[0].count,
    4,
  );
});

test("room creation rejects unauthenticated, null and cross-origin requests", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const { cookie } = await guest(app, "سارة");
  const cases = [
    [{}, { title: "خاص", mode: "voice" }, 401],
    [{ Cookie: cookie }, null, 400],
    [
      { Cookie: cookie, Origin: "https://untrusted.example" },
      { title: "خاص", mode: "voice" },
      403,
    ],
  ];
  for (const [headers, payload, status] of cases) {
    const response = await fetch(app.url + "/api/rooms", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, status);
  }
});

test("chat cannot be sent before joining and malformed join messages stay contained", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const { cookie } = await guest(app, "سارة");
  const peer = await connect(app, cookie);
  peer.send({ type: "chat", text: "بدون غرفة" });
  assert.match((await peer.next("error")).message, /انضم/);
  peer.send({ type: "join", roomId: "missing" });
  assert.match((await peer.next("error")).message, /غير موجودة/);
  peer.ws.send("not json");
  assert.match((await peer.next("error")).message, /غير صالحة/);
  peer.send(null);
  assert.match((await peer.next("error")).message, /غير صالحة/);
  peer.send({ type: "join", roomId: "demo-1" });
  assert.equal((await peer.next("joined")).room.count, 1);
  peer.send({ type: "chat", text: "   " });
  assert.match((await peer.next("error")).message, /فارغة/);
});

async function createdRoom(app, cookie) {
  const response = await fetch(app.url + "/api/rooms", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "غرفة الاختبار",
      mode: "video",
      theme: "blue",
    }),
  });
  return (await response.json()).room;
}
async function joined(peer, roomId) {
  peer.send({ type: "join", roomId });
  return peer.next("joined");
}

test("media and signaling use server identity and cannot cross rooms or reach departed peers", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const a = await guest(app, "سارة"),
    b = await guest(app, "عمر"),
    c = await guest(app, "هدى");
  const one = await connect(app, a.cookie),
    two = await connect(app, b.cookie),
    three = await connect(app, c.cookie);
  await joined(one, "demo-1");
  await joined(two, "demo-1");
  await joined(three, "demo-2");
  one.send({ type: "media", audio: true, video: true, userId: b.user.id });
  let state;
  do {
    state = await two.next("room-update");
  } while (!state.users.find((person) => person.id === a.user.id)?.media.audio);
  assert.deepEqual(
    state.users.find((person) => person.id === a.user.id).media,
    { audio: true, video: true },
  );
  const data = { description: { type: "offer", sdp: "v=0\r\n" } };
  one.send({ type: "signal", to: b.user.id, from: c.user.id, data });
  assert.deepEqual(await two.next("signal"), {
    type: "signal",
    from: a.user.id,
    data,
  });
  one.send({ type: "signal", to: c.user.id, data });
  assert.match((await one.next("error")).message, /المستقبل/);
  one.send({ type: "signal", to: b.user.id, data: [] });
  assert.match((await one.next("error")).message, /إشارة/);
  two.send({ type: "leave" });
  await two.next("left");
  one.send({ type: "signal", to: b.user.id, data });
  assert.match((await one.next("error")).message, /المستقبل/);
});

test("gifts debit exact demo credits, PK scores recipients, and departure cancels PK", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const a = await guest(app, "سارة"),
    b = await guest(app, "عمر");
  const room = await createdRoom(app, a.cookie);
  const one = await connect(app, a.cookie),
    two = await connect(app, b.cookie);
  await joined(one, room.id);
  one.send({ type: "pk-start" });
  assert.match((await one.next("error")).message, /يحتاج/);
  await joined(two, room.id);
  two.send({ type: "pk-start" });
  assert.match((await two.next("error")).message, /مضيف/);
  one.send({ type: "pk-start" });
  const started = (await one.next("pk")).pk;
  assert.equal(started.sides.length, 2);
  assert.ok(started.endsAt > Date.now() + 59000);
  one.send({ type: "pk-start" });
  assert.match((await one.next("error")).message, /جار/);
  for (const gift of ["__proto__", "toString", "nope"]) {
    one.send({ type: "gift", gift, to: b.user.id });
    assert.match((await one.next("error")).message, /هدية/);
  }
  one.send({ type: "gift", gift: "rose", to: a.user.id });
  assert.match((await one.next("error")).message, /مشارك/);
  one.send({ type: "gift", gift: "rose", to: b.user.id });
  assert.equal((await one.next("balance")).balance, 490);
  assert.equal((await one.next("gift")).toName, "عمر");
  assert.equal(
    (await one.next("pk")).pk.sides.find((side) => side.id === b.user.id).score,
    10,
  );
  for (let i = 0; i < 4; i++) {
    one.send({ type: "gift", gift: "crown", to: b.user.id });
    assert.equal((await one.next("balance")).balance, 390 - i * 100);
  }
  one.send({ type: "gift", gift: "crown", to: b.user.id });
  assert.match((await one.next("error")).message, /غير كاف/);
  const state = await (
    await fetch(app.url + "/api/session", { headers: { Cookie: a.cookie } })
  ).json();
  assert.equal(state.user.balance, 90);
  two.send({ type: "leave" });
  await two.next("left");
  let pk;
  do {
    pk = await one.next("pk");
  } while (pk.pk !== null);
  assert.equal(pk.pk, null);
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
test("video clips upload as playable media and persist across server restart", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "wasl-clips-"));
  let app = await createApp({ dataDir });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const { cookie } = await guest(app, "سارة");
  const video = await readFile(
    new URL("../server/fixtures/tiny.mp4", import.meta.url),
  );
  const upload = () =>
    fetch(app.url + "/api/clips", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "video/mp4",
        "X-Clip-Title": encodeURIComponent("لحظة جميلة"),
      },
      body: video,
    });
  const response = await upload();
  assert.equal(response.status, 201);
  const { clip } = await response.json();
  assert.equal(clip.title, "لحظة جميلة");
  assert.equal(clip.name, "سارة");
  const media = await fetch(app.url + clip.url);
  assert.equal(media.headers.get("content-type"), "video/mp4");
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), video);
  await app.close();
  app = await createApp({ dataDir });
  const list = await (await fetch(app.url + "/api/clips")).json();
  assert.equal(list.clips[0].id, clip.id);
  assert.equal((await fetch(app.url + clip.url)).status, 200);
});

test("clip upload rejects unauthenticated, invalid media, bad title and oversized bodies", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "wasl-boundaries-"));
  const app = await createApp({ dataDir });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const { cookie } = await guest(app, "سارة");
  for (const [headers, body, status] of [
    [{}, Buffer.from("data"), 401],
    [{ Cookie: cookie, "Content-Type": "text/html" }, Buffer.from("data"), 415],
    [{ Cookie: cookie, "Content-Type": "video/mp4" }, Buffer.alloc(0), 400],
    [
      { Cookie: cookie, "Content-Type": "video/mp4" },
      Buffer.from("<html>fake</html>"),
      415,
    ],
    [
      { Cookie: cookie, "Content-Type": "video/mp4", "X-Clip-Title": "%" },
      await readFile(new URL("../server/fixtures/tiny.mp4", import.meta.url)),
      400,
    ],
    [
      { Cookie: cookie, "Content-Type": "video/mp4" },
      Buffer.alloc(20 * 1024 * 1024 + 1),
      413,
    ],
  ]) {
    const response = await fetch(app.url + "/api/clips", {
      method: "POST",
      headers,
      body,
    });
    assert.equal(response.status, status);
  }
  assert.equal(
    (await (await fetch(app.url + "/api/clips")).json()).clips.length,
    0,
  );
});

test("HTTP sessions rename live participants and protect signed identity", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const a = await guest(app, "سارة"),
    one = await connect(app, a.cookie);
  await joined(one, "demo-1");
  const renamed = await fetch(app.url + "/api/session", {
    method: "POST",
    headers: { Cookie: a.cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "ليان", id: "spoof", balance: 999999 }),
  });
  assert.equal((await renamed.json()).user.balance, 500);
  let state;
  do {
    state = await one.next("room-update");
  } while (state.users[0].name !== "ليان");
  assert.equal(state.users[0].id, a.user.id);
  for (const cookie of [
    "wasl=abc." + "é".repeat(64),
    "wasl=abc." + "0".repeat(64),
  ]) {
    const r = await fetch(app.url + "/api/rooms", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: '{"title":"X","mode":"voice"}',
    });
    assert.equal(r.status, 401);
  }
  const fresh = await fetch(app.url + "/api/session");
  assert.match(fresh.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  for (const body of ["{", "null"])
    assert.equal(
      (await fetch(app.url + "/api/session", { method: "POST", body })).status,
      400,
    );
});

test("static assets serve locally with CSP and reject traversal", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const page = await fetch(app.url + "/");
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(await page.text(), /<!doctype html/i);
  for (const route of [
    "/media/invalid",
    "/media/00000000-0000-0000-0000-000000000000.mp4",
    "/missing",
    "/%zz",
  ])
    assert.ok((await fetch(app.url + route)).status >= 400);
  assert.equal(
    (await fetch(app.url + "/%2e%2e%5cserver%5cindex.mjs")).status,
    403,
  );
  assert.equal(
    (await fetch(app.url + "/missing", { method: "POST" })).status,
    404,
  );
});

test("websocket handshakes reject missing identity and hostile origin", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const a = await guest(app, "سارة");
  for (const headers of [
    {},
    { Cookie: a.cookie, Origin: "https://untrusted.example" },
  ]) {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(app.url.replace("http", "ws") + "/ws", {
        headers,
      });
      ws.on("open", () => reject(new Error("unauthorized connection opened")));
      ws.on("error", (error) => {
        assert.match(error.message, /403/);
        resolve();
      });
    });
  }
});

test("oversized websocket frames close only the offending connection", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  const a = await guest(app, "سارة"),
    peer = await connect(app, a.cookie);
  await joined(peer, "demo-1");
  const closed = new Promise((resolve) => peer.ws.once("close", resolve));
  peer.ws.on("error", () => {});
  peer.ws.send("x".repeat(70000));
  assert.equal(await closed, 1009);
  assert.equal((await fetch(app.url + "/api/rooms")).status, 200);
});

test("concurrent successful uploads all survive a server restart", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "wasl-concurrent-"));
  let app = await createApp({ dataDir });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const { cookie } = await guest(app, "سارة");
  const video = await readFile(
    new URL("../server/fixtures/tiny.mp4", import.meta.url),
  );
  const ids = [];
  for (let round = 0; round < 3; round++) {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        fetch(app.url + "/api/clips", {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "video/mp4",
            "X-Clip-Title": encodeURIComponent("فيديو " + round + "-" + i),
          },
          body: video,
        }),
      ),
    );
    for (const response of responses) {
      assert.equal(response.status, 201);
      ids.push((await response.json()).clip.id);
    }
  }
  await app.close();
  app = await createApp({ dataDir });
  const { clips } = await (await fetch(app.url + "/api/clips")).json();
  assert.deepEqual(clips.map((clip) => clip.id).sort(), ids.sort());
});

test("failed metadata persistence does not publish a clip and subsequent upload recovers", async (t) => {
  const dataDir = await mkdtemp(
    path.join(os.tmpdir(), "wasl-storage-failure-"),
  );
  const app = await createApp({ dataDir });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const { cookie } = await guest(app, "سارة");
  const video = await readFile(
    new URL("../server/fixtures/tiny.mp4", import.meta.url),
  );
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.join(dataDir, "clips.json"));
  const upload = () =>
    fetch(app.url + "/api/clips", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "video/mp4" },
      body: video,
    });
  assert.equal((await upload()).status, 500);
  assert.equal(
    (await (await fetch(app.url + "/api/clips")).json()).clips.length,
    0,
  );
  await rm(path.join(dataDir, "clips.json"), { recursive: true });
  assert.equal((await upload()).status, 201);
  assert.equal(
    (await (await fetch(app.url + "/api/clips")).json()).clips.length,
    1,
  );
});
