import http from "node:http";
import {
  randomUUID,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clean = (v, max = 80) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const send = (ws, value) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
};
function failure(status, message) {
  return Object.assign(new Error(message), { status });
}
async function body(req, limit = 8192) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw failure(413, "حجم الطلب أكبر من المسموح");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function createApp({
  port = 0,
  host = "127.0.0.1",
  dataDir = path.join(root, "data"),
} = {}) {
  const secret = randomBytes(32),
    sessions = new Map(),
    rooms = new Map(),
    clients = new Map(),
    rates = new Map();
  const titles = [
    "سوالف آخر الليل",
    "مقهى الموسيقى",
    "مساحة الألعاب",
    "حكايات السفر",
  ];
  titles.forEach((title, i) =>
    rooms.set("demo-" + (i + 1), {
      id: "demo-" + (i + 1),
      title,
      category: ["دردشة", "موسيقى", "ألعاب", "سفر"][i],
      mode: i === 0 ? "voice" : "video",
      host: { id: "demo-host-" + i, name: "فريق تحدي" },
      participants: [],
      capacity: 4,
      theme: ["violet", "rose", "blue", "amber"][i],
      description: "غرفة تجريبية — انضم وابدأ الحديث",
      messages: [],
      pk: null,
    }),
  );
  await mkdir(dataDir, { recursive: true });
  let clips = [];
  try {
    clips = JSON.parse(
      await readFile(path.join(dataDir, "clips.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // One commit owns both the metadata snapshot and its atomic replacement.
  // A rejected upload is handled by its request without poisoning later uploads.
  let clipCommit = Promise.resolve();
  const commitClip = (clip, ext, buffer) => {
    const task = clipCommit.then(async () => {
      const mediaPath = path.join(dataDir, `${clip.id}.${ext}`);
      const temporaryPath = path.join(dataDir, `.clips-${randomUUID()}.tmp`);
      try {
        await writeFile(mediaPath, buffer, { flag: "wx" });
        const nextClips = [clip, ...clips];
        await writeFile(temporaryPath, JSON.stringify(nextClips), {
          flag: "wx",
        });
        await rename(temporaryPath, path.join(dataDir, "clips.json"));
        clips = nextClips;
      } catch (error) {
        await Promise.allSettled([unlink(temporaryPath), unlink(mediaPath)]);
        throw error;
      }
    });
    clipCommit = task.catch(() => {});
    return task;
  };
  const sign = (id) => createHmac("sha256", secret).update(id).digest("hex");
  const sessionOf = (req) => {
    const token = String(req.headers.cookie || "").match(
      /(?:^|;\s*)wasl=([^;]+)/,
    )?.[1];
    if (!token) return null;
    const [id, sig] = token.split("."),
      expected = sign(id);
    if (
      !sig ||
      !/^[a-f0-9]{64}$/.test(sig) ||
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return null;
    return sessions.get(id) || null;
  };
  const users = (room) =>
    [...clients.values()]
      .filter((c) => c.roomId === room.id)
      .map((c) => ({ id: c.user.id, name: c.user.name, media: c.media }));
  const roomView = (room) => {
    const people = users(room);
    return {
      id: room.id,
      title: room.title,
      category: room.category,
      mode: room.mode,
      host: room.host,
      participants: people,
      count: people.length,
      capacity: 4,
      theme: room.theme,
      description: room.description,
    };
  };
  const broadcast = (roomId, event, except) => {
    for (const [ws, c] of clients)
      if (c.roomId === roomId && ws !== except) send(ws, event);
  };
  const update = (room) =>
    broadcast(room.id, {
      type: "room-update",
      room: roomView(room),
      users: users(room),
    });
  const leave = (ws) => {
    const c = clients.get(ws);
    if (!c?.roomId) return;
    const room = rooms.get(c.roomId);
    c.roomId = null;
    c.media = { audio: false, video: false };
    if (room.pk?.sides.some((side) => side.id === c.user.id)) {
      room.pk = null;
      broadcast(room.id, { type: "pk", pk: null });
    }
    broadcast(room.id, { type: "peer-left", userId: c.user.id });
    update(room);
  };
  const validOrigin = (req) =>
    !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
  const allowed = (key, max = 120) => {
    const now = Date.now(),
      entry = rates.get(key);
    if (!entry || now - entry.at > 60000) {
      rates.set(key, { at: now, n: 1 });
      if (rates.size > 10000) rates.clear();
      return true;
    }
    return ++entry.n <= max;
  };
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      if (!allowed(req.socket.remoteAddress))
        throw failure(429, "طلبات كثيرة، حاول لاحقًا");
      if (req.method !== "GET" && !validOrigin(req))
        throw failure(403, "مصدر الطلب غير مسموح");
      let user = sessionOf(req);
      if (
        url.pathname === "/api/session" &&
        ["GET", "POST"].includes(req.method)
      ) {
        let input = {};
        if (req.method === "POST") {
          try {
            input = JSON.parse((await body(req)).toString() || "{}");
          } catch (e) {
            if (e.status) throw e;
            throw failure(400, "طلب غير صالح");
          }
        }
        if (!input || typeof input !== "object" || Array.isArray(input))
          throw failure(400, "طلب غير صالح");
        if (!user) {
          const id = randomUUID();
          user = {
            id,
            name:
              clean(input.name, 30) ||
              "ضيف " + Math.floor(Math.random() * 900 + 100),
            balance: 500,
          };
          sessions.set(id, user);
          res.setHeader(
            "Set-Cookie",
            `wasl=${id}.${sign(id)}; HttpOnly; SameSite=Strict; Path=/`,
          );
        } else if (clean(input.name, 30)) {
          user.name = clean(input.name, 30);
          for (const c of clients.values())
            if (c.user.id === user.id && c.roomId) update(rooms.get(c.roomId));
        }
        return json(200, { user });
      }
      if (url.pathname === "/api/config") return json(200, { transport: "websocket", iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      if (url.pathname === "/api/rooms" && req.method === "GET")
        return json(200, { rooms: [...rooms.values()].map(roomView) });
      if (url.pathname === "/api/rooms" && req.method === "POST") {
        if (!user) throw failure(401, "أنشئ جلسة أولًا");
        let input;
        try {
          input = JSON.parse((await body(req)).toString());
        } catch (e) {
          if (e.status) throw e;
          throw failure(400, "طلب غير صالح");
        }
        if (!input || typeof input !== "object" || Array.isArray(input))
          throw failure(400, "طلب غير صالح");
        const title = clean(input.title);
        if (!title || !["voice", "video"].includes(input.mode))
          throw failure(400, "أدخل اسم الغرفة ونوعها");
        if (rooms.size > 200) throw failure(429, "وصلنا للحد الأقصى للغرف");
        const room = {
          id: randomUUID(),
          title,
          mode: input.mode,
          category: clean(input.category, 30) || "دردشة",
          theme: ["violet", "rose", "blue", "amber"].includes(input.theme)
            ? input.theme
            : "violet",
          host: { id: user.id, name: user.name },
          description: "مساحة جديدة للقاء والأحاديث",
          messages: [],
          pk: null,
        };
        rooms.set(room.id, room);
        return json(201, { room: roomView(room) });
      }
      if (url.pathname === "/api/clips" && req.method === "GET")
        return json(200, { clips });
      if (url.pathname === "/api/clips" && req.method === "POST") {
        if (!user) throw failure(401, "أنشئ جلسة أولًا");
        const mime = req.headers["content-type"]?.split(";")[0];
        if (!["video/webm", "video/mp4"].includes(mime))
          throw failure(415, "صيغة الفيديو غير مدعومة");
        const buffer = await body(req, 20 * 1024 * 1024);
        if (!buffer.length) throw failure(400, "ملف الفيديو فارغ");
        const validHeader =
          mime === "video/mp4"
            ? buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp"
            : buffer.length >= 4 &&
              buffer
                .subarray(0, 4)
                .equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
        if (!validHeader) throw failure(415, "محتوى الفيديو لا يطابق الصيغة");
        const id = randomUUID(),
          ext = mime === "video/mp4" ? "mp4" : "webm";
        let title;
        try {
          title = decodeURIComponent(req.headers["x-clip-title"] || "");
        } catch {
          throw failure(400, "العنوان غير صالح");
        }
        const clip = {
          id,
          title: clean(title, 100) || "لحظة من تحدي",
          name: user.name,
          userId: user.id,
          url: `/media/${id}.${ext}`,
          createdAt: Date.now(),
        };
        await commitClip(clip, ext, buffer);
        return json(201, { clip });
      }
      if (req.method !== "GET") throw failure(404, "المسار غير موجود");
      let filename;
      if (url.pathname.startsWith("/media/")) {
        const name = url.pathname.slice(7);
        if (!/^[a-f0-9-]+\.(mp4|webm)$/.test(name))
          throw failure(404, "غير موجود");
        filename = path.join(dataDir, name);
      } else {
        let decoded;
        try {
          decoded = decodeURIComponent(url.pathname);
        } catch {
          throw failure(400, "مسار غير صالح");
        }
        if (decoded.includes("\\")) throw failure(403, "غير مسموح");
        const base = path.join(root, "public");
        filename = path.resolve(
          base,
          "." + (decoded === "/" ? "/index.html" : decoded),
        );
        if (!filename.startsWith(base + path.sep))
          throw failure(403, "غير مسموح");
      }
      let content;
      try {
        content = await readFile(filename);
      } catch {
        throw failure(404, "الملف غير موجود");
      }
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".woff2": "font/woff2",
          ".woff": "font/woff",
          ".webm": "video/webm",
          ".mp4": "video/mp4",
        }[path.extname(filename)] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": content.length,
      });
      res.end(content);
    } catch (error) {
      json(error.status || 500, {
        error: error.status ? error.message : "حدث خطأ في الخادم",
      });
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  server.on("upgrade", (req, socket, head) => {
    const user = sessionOf(req);
    if (req.url !== "/ws" || !user || !validOrigin(req)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req, user),
    );
  });
  // WebSocket behavior is installed below.
  wss.on("connection", (ws, req, user) => {
    clients.set(ws, {
      user,
      roomId: null,
      media: { audio: false, video: false },
    });
    ws.on("error", () => {
      leave(ws);
    });
    ws.on("close", () => {
      leave(ws);
      clients.delete(ws);
    });
    ws.on("message", (raw) => {
      try {
        if (!allowed("ws:" + user.id, 180))
          throw failure(429, "رسائل كثيرة، انتظر قليلًا");
        let event;
        try {
          event = JSON.parse(raw.toString());
        } catch {
          throw failure(400, "رسالة غير صالحة");
        }
        if (!event || typeof event !== "object")
          throw failure(400, "رسالة غير صالحة");
        const c = clients.get(ws);
        if (event.type === "join") {
          const room = rooms.get(event.roomId);
          if (!room) throw failure(404, "الغرفة غير موجودة");
          if (c.roomId === room.id) return;
          if (users(room).length >= 4) throw failure(409, "الغرفة مكتملة");
          if (users(room).some((person) => person.id === user.id))
            throw failure(409, "أنت متصل بالغرفة بالفعل");
          leave(ws);
          c.roomId = room.id;
          send(ws, {
            type: "joined",
            room: roomView(room),
            users: users(room),
            selfId: user.id,
            messages: room.messages,
            pk: room.pk,
          });
          broadcast(
            room.id,
            {
              type: "peer-joined",
              user: { id: user.id, name: user.name, media: c.media },
            },
            ws,
          );
          update(room);
          return;
        }
        if (event.type === "leave") {
          leave(ws);
          send(ws, { type: "left" });
          return;
        }
        const room = rooms.get(c.roomId);
        if (!room) throw failure(400, "انضم لغرفة أولًا");
        if (event.type === "chat") {
          const text = clean(event.text, 500);
          if (!text) throw failure(400, "الرسالة فارغة");
          const message = {
            id: randomUUID(),
            userId: user.id,
            name: user.name,
            text,
            at: Date.now(),
          };
          room.messages = [...room.messages.slice(-99), message];
          broadcast(room.id, { type: "chat", message });
          return;
        }
        if (event.type === "signal") {
          const target = [...clients.entries()].find(
            ([, peer]) => peer.user.id === event.to && peer.roomId === room.id,
          );
          if (!target || target[0] === ws)
            throw failure(400, "المستقبل غير متاح");
          if (
            !event.data ||
            typeof event.data !== "object" ||
            Array.isArray(event.data) ||
            !(
              (event.data.description &&
                ["offer", "answer"].includes(event.data.description.type) &&
                typeof event.data.description.sdp === "string") ||
              (event.data.candidate &&
                typeof event.data.candidate.candidate === "string")
            )
          )
            throw failure(400, "إشارة غير صالحة");
          send(target[0], { type: "signal", from: user.id, data: event.data });
          return;
        }
        if (event.type === "media") {
          c.media = {
            audio: event.audio === true,
            video: event.video === true,
          };
          update(room);
          return;
        }
        if (event.type === "gift") {
          const costs = { rose: 10, star: 50, crown: 100 };
          const cost = Object.hasOwn(costs, event.gift)
            ? costs[event.gift]
            : null;
          if (!cost) throw failure(400, "هدية غير صالحة");
          const recipient = users(room).find(
            (person) => person.id === event.to,
          );
          if (!recipient || recipient.id === user.id)
            throw failure(400, "اختر مشاركًا آخر");
          if (user.balance < cost)
            throw failure(400, "رصيدك التجريبي غير كافٍ");
          user.balance -= cost;
          broadcast(room.id, {
            type: "gift",
            fromName: user.name,
            toName: recipient.name,
            gift: event.gift,
          });
          for (const [socket, peer] of clients)
            if (peer.user.id === user.id)
              send(socket, { type: "balance", balance: user.balance });
          if (room.pk && room.pk.endsAt > Date.now()) {
            room.pk = {
              ...room.pk,
              sides: room.pk.sides.map((side) =>
                side.id === recipient.id
                  ? { ...side, score: side.score + cost }
                  : side,
              ),
            };
            broadcast(room.id, { type: "pk", pk: room.pk });
          }
          return;
        }
        if (event.type === "pk-start") {
          if (room.host.id !== user.id)
            throw failure(403, "التحدي متاح لمضيف الغرفة");
          const participants = users(room).sort(
            (a, b) =>
              Number(b.id === room.host.id) - Number(a.id === room.host.id),
          );
          if (participants.length < 2)
            throw failure(400, "التحدي يحتاج مشاركين");
          if (room.pk && room.pk.endsAt > Date.now())
            throw failure(409, "هناك تحدٍ جارٍ");
          room.pk = {
            endsAt: Date.now() + 60000,
            sides: participants.slice(0, 2).map((person) => ({
              id: person.id,
              name: person.name,
              score: 0,
            })),
          };
          broadcast(room.id, { type: "pk", pk: room.pk });
          return;
        }
        throw failure(400, "نوع الرسالة غير معروف");
      } catch (error) {
        send(ws, {
          type: "error",
          message: error.status ? error.message : "تعذر تنفيذ الطلب",
        });
      }
    });
  });
  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  return {
    server,
    url: `http://${host}:${address.port}`,
    close: async () => {
      for (const ws of clients.keys()) ws.terminate();
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await createApp({
    port: Number(process.env.PORT) || 4178,
    host: process.env.HOST || "127.0.0.1",
  });
  console.log(`وصل مباشر: ${app.url}`);
}
