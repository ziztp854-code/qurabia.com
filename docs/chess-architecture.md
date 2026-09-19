# CHESS ARCHITECTURE — تحدّي

> الحالة: مسودة معمارية — تنتظر الموافقة قبل التنفيذ
> الإصدار: 0.1
> آخر تحديث: 2026-08-08
> الأمان: مقفل — الشروط أدناه إلزامية ولا تتغير أثناء التنفيذ

---

## LOCK ARCHITECTURE

The following 10 conditions are immutable for Chess V1:

1. `chess.js` runs server-side as the authoritative rules engine.
2. Client never determines move legality.
3. `expectedVersion` is mandatory on every move.
4. Every move mutation runs under the Redis chess-room lock.
5. Room code is invite/discovery only.
6. Guest credential owns the player seat.
7. Guest credentials never appear in:
   - URL
   - room snapshots
   - logs
   - spectator payloads
8. Guest credentials should be short-lived/rotatable where architecture allows.
9. Spectators are permanently read-only.
10. Redis is V1 persistence; no Prisma migration.

Do not change the architecture beyond these clarifications.

---

## CHESS ARCHITECTURE

### Placement في المنصة

Chess هو `SpecialGameMode` منفصل داخل نظام الألعاب الجماعية (`kind: 'room'`). لا يُضاف كـ `upcoming` أو `experimental` أو ميزة جانبية. يُدرج مباشرة في:

- `INJECTED_GAME_CATALOG` في `packages/domain/src/game-catalog.ts`
- `SPECIAL_GAME_META` و `SPECIAL_GAME_ORDER` في `packages/domain/src/special-games.ts`
- `SpecialGameMode` union type
- مسار `/games/chess` عبر `/games/[mode]/page.tsx`
- فلاتر الكتالوج والبحث والاقتراحات تكتشفه تلقائيًا

### Layering

```
Frontend (Next.js)
  └── apps/web/src/components/special-games/chess-room.tsx
  └── apps/web/src/components/games/shared/chess-guide.ts (new)

Realtime (NestJS + Socket.IO)
  └── apps/realtime/src/chess/
      ├── chess.module.ts
      ├── chess.gateway.ts
      ├── chess.service.ts
      ├── chess.types.ts
      ├── chess.logic.ts (rule engine wrapper)
      └── __tests__/

Domain (shared types)
  └── packages/domain/src/special-games.ts  (add chess types)
  └── packages/domain/src/game-catalog.ts   (add chess entry)

Redis (state + locks)
  └── chess:{pin}:room     → ChessRoom snapshot
  └── chess:{pin}:lock     → distributed lock token
  └── chess:pins:active    → active pin set

Rule Engine (dependency)
  └── chess.js (npm) — server-side only, authoritative
```

### Stack Decisions

| Layer | Choice | Reason |
|---|---|---|
| Rule Engine | `chess.js` (latest stable) | Industry-standard, FEN/SAN/PGN, full rules, actively maintained |
| Locking | Existing `executeWithRoomLock` pattern via Redis `SET NX PX` | Already proven in `SpecialGamesService` |
| State Store | Redis JSON (same TTL as special games: 3h) | No Prisma migration needed for V1 |
| Socket Namespace | `/special-games` (existing) | Reuse existing gateway + adapter |
| Frontend Board | Custom CSS grid + click-to-move | No external board library dependency |
| Clock | Server-authoritative, client display-only | Consistent with platform architecture |

### No New Infrastructure

- No new database tables (V1 uses Redis only)
- No new Socket.IO namespace
- No new authentication system
- No new Redis keyspace pattern

---

## CHESS RULE ENGINE

### Library

**Package**: `chess.js` (latest stable from npm)

**Installation**: `apps/realtime/package.json` only — server-side dependency. NOT bundled to frontend.

**Why chess.js**:
- Full FIDE rule support: legal moves, castling, en passant, promotion, check, checkmate, stalemate
- Threefold repetition detection
- Fifty-move rule detection
- Insufficient material detection
- SAN move notation output
- FEN import/export
- PGN export
- ~10K stars, battle-tested in production chess apps

**Server Authority**:
- chess.js is instantiated fresh on every server action (from FEN)
- No shared mutable chess.js instance across requests
- Server validates every move via chess.js before applying
- Client never receives or stores the engine state — only FEN + move history

### Engine Wrapper (`chess.logic.ts`)

```ts
// Thin wrapper, NOT a full engine rebuild
export function createChessEngine(fen: string) {
  return new Chess(fen);
}

export function validateChessMove(
  engine: Chess,
  from: string,
  to: string,
  promotion?: string,
): { ok: true; san: string } | { ok: false; code: string; message: string } {
  const move = engine.move({ from, to, promotion });
  if (!move) {
    const isKingInCheck = engine.isCheck();
    const isCheckmate = engine.isCheckmate();
    const isStalemate = engine.isStalemate();
    const isDraw = engine.isDraw();
    if (isCheckmate) return { ok: false, code: 'CHECKMATE', message: 'كش مات' };
    if (isStalemate) return { ok: false, code: 'STALEMATE', message: 'تعادل - بات' };
    if (isDraw) return { ok: false, code: 'DRAW', message: 'تعادل' };
    if (isKingInCheck) return { ok: false, code: 'ILLEGAL_IN_CHECK', message: 'نقلة غير قانونية والملك في كش' };
    return { ok: false, code: 'ILLEGAL_MOVE', message: 'نقلة غير قانونية' };
  }
  return { ok: true, san: move.san };
}
```

---

## CHESS ROOM MODEL

### ChessRoom (Redis Stored)

```ts
export type ChessRoomPhase =
  | 'waiting'      // Room created, no players yet
  | 'ready'        // Both seats filled, waiting for start
  | 'countdown'    // 3-second countdown before play
  | 'playing'      // Active game
  | 'finished';    // Game ended

export type ChessColor = 'white' | 'black';

export type ChessRole = ChessColor | 'spectator';

export type ChessResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'draw_repetition'
  | 'draw_fifty_move'
  | 'draw_insufficient_material'
  | 'draw_agreement'
  | 'resignation'
  | 'timeout'
  | 'aborted';

export type ChessPlayerSeat = {
  guestId: string;
  name: string;
  color: ChessColor;
  connected: boolean;
  disconnectAt?: number;
};

export type ChessRoom = {
  pin: string;
  hostGuestId: string;
  phase: ChessRoomPhase;
  fen: string;
  turn: ChessColor;
  stateVersion: number;
  moveHistory: Array<{
    san: string;
    from: string;
    to: string;
    promotion?: string;
    fen: string;
    timestamp: number;
    by: ChessColor;
  }>;
  timeControl: {
    initialSeconds: number;
    incrementSeconds: number;
  };
  whiteClock: {
    remainingMs: number;
    startedAt?: number;
  };
  blackClock: {
    remainingMs: number;
    startedAt?: number;
  };
  seats: {
    white: ChessPlayerSeat | null;
    black: ChessPlayerSeat | null;
  };
  spectators: Array<{
    guestId: string;
    name: string;
    joinedAt: number;
  }>;
  spectatorCount: number;
  lastMove: {
    from: string;
    to: string;
    san: string;
  } | null;
  result: {
    reason: ChessResultReason;
    winner: ChessColor | 'draw' | null;
    endedAt: number;
  } | null;
  drawOffer: {
    by: ChessColor;
    at: number;
  } | null;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
};
```

### Room Snapshot (Broadcast to Clients)

```ts
export type ChessRoomSnapshot = {
  pin: string;
  phase: ChessRoomPhase;
  fen: string;
  turn: ChessColor;
  stateVersion: number;
  moveHistory: ChessRoom['moveHistory'];
  timeControl: ChessRoom['timeControl'];
  whiteClock: ChessRoom['whiteClock'];
  blackClock: ChessRoom['blackClock'];
  seats: {
    white: { name: string; connected: boolean } | null;
    black: { name: string; connected: boolean } | null;
  };
  spectatorCount: number;
  lastMove: ChessRoom['lastMove'];
  result: ChessRoom['result'];
  drawOffer: ChessRoom['drawOffer'] | null;
  isHost: boolean;
  yourColor: ChessColor | null;  // null for spectators
  yourRole: ChessRole;
};
```

**Critical**: Guest secrets (`guestId`, guest tokens) are NEVER included in snapshots.

---

## CHESS GUEST AUTH

### Problem

Chess has no login, but needs:
1. Seat ownership (who is WHITE, who is BLACK)
2. Authorization (only seat owners can move)
3. Reconnect (return to same seat after refresh)

### Solution: Server-Issued Guest Credentials

On join, the server issues a **guest identity pair**:

```ts
export type ChessGuestIdentity = {
  guestId: string;           // e.g. "guest_a1b2c3d4"
  guestToken: string;        // e.g. opaque random 32-byte hex
  expiresAt: number;         // 24h TTL
};
```

**Storage**:
- Redis: `chess:guest:{guestId}` → `{ guestToken, pin, color, name, createdAt }`
- NOT stored in localStorage by the client as a security credential
- Client stores `guestId` in sessionStorage (lost on tab close — acceptable for guest)
- `guestToken` is sent in the Socket.IO auth handshake or as a header on connect

**Why not room code as auth**:
- Room code is shared (invite link, QR code)
- Multiple people have it (spectators)
- Cannot prove seat ownership

**Flow**:
1. Client connects to Socket.IO with `{ guestId, guestToken }` in auth
2. Server validates guestId + guestToken against Redis
3. If valid → retrieves `pin` + `color` → auto-joins room socket room
4. If invalid/missing → treated as new spectator or join request

**Reconnect**:
- On page load, client reads `guestId` from sessionStorage
- Looks up `guestToken` from Redis (server-side lookup by guestId)
- Reconnects socket with credentials
- Server restores seat and sends current snapshot

**Token Rotation**:
- On successful move, server can rotate token (optional, adds security)
- Old token invalidated after rotation

---

## CHESS SPECTATOR MODEL

### Spectator Join

```ts
// Client emits
socket.emit('chess:spectate', { pin: string });

// Server validates:
// 1. Room exists
// 2. Pin is active
// 3. Assigns spectator role
```

### Spectator Permissions

| Action | Allowed |
|---|---|
| View board | ✅ |
| View clocks | ✅ |
| View move history | ✅ |
| View player names | ✅ |
| Make moves | ❌ |
| Resign | ❌ |
| Offer/accept draw | ❌ |
| Control clock | ❌ |
| Occupy seat | ❌ |

### Server Enforcement

```ts
// In chess.service.ts
async submitMove(guestId: string, pin: string, move: MovePayload) {
  const room = await this.loadRoom(pin);
  const seat = this.findSeat(room, guestId);
  if (!seat) {
    return { ok: false, code: 'NOT_A_PLAYER', message: 'لست لاعبًا في هذه الغرفة.' };
  }
  if (seat.color !== room.turn) {
    return { ok: false, code: 'NOT_YOUR_TURN', message: 'ليس دورك.' };
  }
  // ... validate move
}
```

### Spectator Security Test

```ts
// Explicit test: spectator sending chess:move must be rejected
it('rejects move from spectator', async () => {
  const spectator = await createSpectatorConnection(pin);
  spectator.emit('chess:move', { from: 'e2', to: 'e4', expectedVersion: 1 });
  const error = await waitForError(spectator);
  expect(error.code).toBe('NOT_A_PLAYER');
});
```

---

## CHESS STATE MACHINE

### Phases

```
WAITING
  │  (first player joins as WHITE)
  ▼
READY
  │  (second player joins as BLACK)
  ▼
COUNTDOWN  (3 seconds)
  │
  ▼
PLAYING
  │
  ├── CHECKMATE ──────────────┐
  ├── STALEMATE ──────────────┤
  ├── DRAW_REPETITION ────────┤
  ├── DRAW_FIFTY_MOVE ────────┤
  ├── DRAW_INSUFFICIENT_MATERIAL ─┤
  ├── DRAW_AGREEMENT ─────────┤
  ├── RESIGNATION ────────────┤
  ├── TIMEOUT ────────────────┤
  └── ABORTED ────────────────┘
           │
           ▼
       FINISHED
```

### Transition Rules

| From | To | Trigger | Condition |
|---|---|---|---|
| WAITING | READY | join | Second seat filled |
| READY | COUNTDOWN | startGame | Host confirms both ready |
| COUNTDOWN | PLAYING | tick | 3 seconds elapsed |
| PLAYING | FINISHED | move | Checkmate / stalemate / draw / resign / timeout |
| PLAYING | FINISHED | abort | Both players disconnect within grace period |
| FINISHED | READY | rematch | Both players accept rematch |
| ANY | WAITING | host leaves | Host disconnects, room resets |

### No Boolean Soup

Each phase is a single string enum. No `isStarted && !isFinished && !isPaused` patterns.

---

## CHESS SOCKET EVENTS

### Namespace: `/special-games` (existing)

### Client → Server

```ts
'chess:room:create'        (payload: { playerName: string; colorChoice: 'random' | 'white' | 'black'; timeControl: TimeControl })
'chess:room:join'          (payload: { pin: string; playerName: string })
'chess:spectate'           (payload: { pin: string; spectatorName?: string })
'chess:move'               (payload: { from: string; to: string; promotion?: string; expectedVersion: number })
'chess:resign'             (payload: { pin: string })
'chess:draw:offer'         (payload: { pin: string })
'chess:draw:respond'       (payload: { pin: string; accept: boolean })
'chess:rematch:offer'      (payload: { pin: string })
'chess:rematch:respond'    (payload: { pin: string; accept: boolean })
'chess:flip-board'         (payload: { pin: string })
'chess:leave'              (payload: { pin: string })
```

### Server → Client

```ts
'chess:room:state'         (payload: ChessRoomSnapshot)
'chess:error'              (payload: { code: string; message: string })
'chess:move:ack'           (payload: { san: string; from: string; to: string; promotion?: string; newFen: string; newStateVersion: number; isCheck: boolean; isCheckmate: boolean; isStalemate: boolean; isDraw: boolean; legalSquares?: string[] })
'chess:move:rejected'      (payload: { code: string; message: string; currentStateVersion: number; latestFen: string })
'chess:opponent:disconnect' (payload: { gracePeriodSeconds: number })
'chess:opponent:reconnect'
'chess:game:end'           (payload: { reason: ChessResultReason; winner: ChessColor | 'draw'; durationMs: number; moveCount: number })
'chess:draw:offered'       (payload: { by: ChessColor; at: number })
'chess:draw:result'        (payload: { accepted: boolean })
'chess:rematch:offered'    (payload: { by: ChessColor })
'chess:rematch:result'     (payload: { accepted: boolean; swappedColors: boolean })
'chess:countdown'          (payload: { remaining: number })
```

### Rate Limiting

Reuse `SocketEventRateLimiter` pattern from special-games gateway.

---

## CHESS RECONNECT

### Player Reconnect Flow

1. Page loads → client checks `sessionStorage` for `chessGuestId`
2. If found → queries Redis for guest identity
3. If valid and not expired → reconnects socket with `{ guestId, guestToken }`
4. Server validates → looks up room by `pin` stored in guest identity
5. Server verifies seat is still assigned to this guestId
6. Server sends full `chess:room:state` snapshot

### Disconnect Handling

```
Player disconnects
  │
  ▼
Record disconnectAt timestamp
  │
  ▼
Emit 'chess:opponent:disconnect' to other player
  │
  ▼
Start grace period timer (60 seconds)
  │
  ├── Player reconnects within grace period → Resume
  │   └── Clear disconnectAt, resume clock from pause point
  │
  └── Grace period expires → Other player can claim timeout
      └── Server ends game with reason: 'timeout'
```

### Clock Pause on Disconnect

```ts
// When player disconnects mid-game
onPlayerDisconnect(room, disconnectedColor) {
  const now = Date.now();
  room[disconnectedColor].clock.remainingMs -= (now - (room[disconnectedColor].clock.startedAt ?? now));
  room[disconnectedColor].clock.startedAt = undefined;
  room[disconnectedColor].connected = false;
  room[disconnectedColor].disconnectAt = now;
}
```

### Grace Period Policy

- 60 seconds default
- Configurable via env var `CHESS_GRACE_SECONDS`
- Timer only runs while room is in `playing` phase
- If game ends naturally before grace period → timer cancelled

---

## CHESS CLOCK MODEL

### Time Controls

```ts
export type TimeControlPreset =
  | 'none'       // No clock
  | '3+2'        // 3 minutes + 2 second increment
  | '5+0'        // 5 minutes, no increment
  | '10+0'       // 10 minutes, no increment
  | '15+10';     // 15 minutes + 10 second increment

export const CHESS_TIME_CONTROLS: Record<TimeControlPreset, { initial: number; increment: number }> = {
  'none':  { initial: 0, increment: 0 },
  '3+2':   { initial: 180, increment: 2 },
  '5+0':   { initial: 300, increment: 0 },
  '10+0':  { initial: 600, increment: 0 },
  '15+10': { initial: 900, increment: 10 },
};
```

### Server-Authoritative Clock

```ts
// Server tracks absolute remaining time in milliseconds
// Client receives server clock and displays countdown

export type ChessClock = {
  remainingMs: number;
  startedAt?: number;  // server timestamp when clock was last started
};

// On server tick (every 100ms via setInterval in gateway):
tickClocks(room: ChessRoom) {
  if (room.phase !== 'playing') return;
  if (room.result) return;
  
  const activeColor = room.turn;
  const clock = room[activeColor === 'white' ? 'whiteClock' : 'blackClock'];
  
  if (clock.startedAt && !room.seats[activeColor].disconnectAt) {
    const elapsed = Date.now() - clock.startedAt;
    clock.remainingMs = Math.max(0, clock.remainingMs - elapsed);
    clock.startedAt = Date.now();
    
    if (clock.remainingMs <= 0) {
      this.endGame(room, 'timeout', activeColor === 'white' ? 'black' : 'white');
    }
  }
}
```

### Clock on Move

```ts
// After legal move is applied:
applyMove(room: ChessRoom, move: MovePayload) {
  // 1. Deduct elapsed time from mover's clock
  const moverColor = room.turn;
  const moverClock = room[moverColor === 'white' ? 'whiteClock' : 'blackClock'];
  if (moverClock.startedAt) {
    const elapsed = Date.now() - moverClock.startedAt;
    moverClock.remainingMs = Math.max(0, moverClock.remainingMs - elapsed);
  }
  
  // 2. Apply increment
  const control = CHESS_TIME_CONTROLS[room.timeControl];
  if (control.increment > 0) {
    moverClock.remainingMs += control.increment * 1000;
  }
  
  // 3. Start opponent's clock
  const opponentColor = moverColor === 'white' ? 'black' : 'white';
  room[opponentColor === 'white' ? 'whiteClock' : 'blackClock'].startedAt = Date.now();
  moverClock.startedAt = undefined;
}
```

### Client Display

- Client receives `whiteClock.remainingMs` and `blackClock.remainingMs`
- Client runs local `setInterval` for smooth visual countdown
- Client does NOT make timing decisions
- Server broadcasts clock updates every 100ms during active play

---

## CHESS SECURITY

### Threat Model

| Threat | Mitigation |
|---|---|
| Spectator sending moves | Server checks seat ownership before any move |
| Modified client state (fake FEN) | Server is source of truth; client FEN is display-only |
| Stale move (old expectedVersion) | Server rejects if `expectedVersion < currentVersion` |
| Duplicate move | Same `expectedVersion` → server returns current snapshot, not apply |
| Concurrent conflicting moves | Redis room lock (10s TTL, max 80 retries at 25ms) |
| Replay attack | `expectedVersion` must match; old versions rejected |
| Guest token theft | Opaque random token, 24h TTL, rotates on sensitive actions |
| Pin enumeration | 6-digit numeric pins, rate-limited creation (3/min per socket, 30/min per IP) |
| Room squatting | Max 2 players + unlimited spectators; spectators cannot claim seats |
| Disconnect exploit | Grace period prevents instant timeout; server decides timeout |

### Move Validation Order

```ts
// Every move goes through this exact sequence:
async submitMove(guestId: string, pin: string, payload: MovePayload) {
  // 1. Validate guest identity
  const guest = await this.validateGuest(guestId);
  if (!guest) return error('INVALID_GUEST');
  
  // 2. Check seat ownership
  const seat = this.findSeat(room, guestId);
  if (!seat) return error('NOT_A_PLAYER');
  
  // 3. Check turn
  if (room.turn !== seat.color) return error('NOT_YOUR_TURN');
  
  // 4. Check phase
  if (room.phase !== 'playing') return error('GAME_NOT_ACTIVE');
  
  // 5. Check version (stale move protection)
  if (payload.expectedVersion !== room.stateVersion) {
    return error('STALE_POSITION', { currentFen: room.fen, currentVersion: room.stateVersion });
  }
  
  // 6. Acquire room lock (atomicity)
  const locked = await this.executeWithRoomLock(pin, async () => {
    const engine = createChessEngine(room.fen);
    const result = validateChessMove(engine, payload.from, payload.to, payload.promotion);
    if (!result.ok) return result;
    
    // 7. Apply move
    room.fen = engine.fen();
    room.turn = engine.turn() === 'w' ? 'white' : 'black';
    room.stateVersion += 1;
    room.moveHistory.push({
      san: result.san,
      from: payload.from,
      to: payload.to,
      promotion: payload.promotion,
      fen: room.fen,
      timestamp: Date.now(),
      by: seat.color,
    });
    room.lastMove = { from: payload.from, to: payload.to, san: result.san };
    
    // 8. Check game end conditions
    if (engine.isCheckmate()) {
      room.result = { reason: 'checkmate', winner: seat.color, endedAt: Date.now() };
      room.phase = 'finished';
    } else if (engine.isStalemate()) {
      room.result = { reason: 'stalemate', winner: null, endedAt: Date.now() };
      room.phase = 'finished';
    } else if (engine.isDraw()) {
      // Check specific draw reason
      const reason = this.getDrawReason(engine);
      room.result = { reason, winner: null, endedAt: Date.now() };
      room.phase = 'finished';
    }
    
    await this.saveRoom(room);
    return { ok: true };
  });
  
  if (!locked.acquired) {
    return error('ROOM_BUSY');
  }
  
  return locked.value;
}
```

---

## CHESS UI

### Entry Screen

```
╔══════════════════════════════════╗
║  ♟ تحدي الشطرنج                   ║
║                                  ║
║  تحدى صديقك مباشرة أو شاهد        ║
║  المباراة برمز الغرفة — بدون تسجيل ║
║                                  ║
║  [أنشئ غرفة]  [انضم برمز]         ║
║                                  ║
║  الهدف: كش مات لملك الخصم         ║
║  كيف تلعب: 1. أنشئ غرفة...        ║
╚══════════════════════════════════╝
```

### Create Room Form

```
الاسم: [عبدالعزيز              ]

وقت المباراة:
  ○ بدون وقت
  ○ 3 + 2
  ○ 5 + 0
  ○ 10 + 0
  ○ 15 + 10

اختيار اللون:
  ○ عشوائي
  ○ أبيض
  ○ أسود

[ إنشاء التحدي ]
```

### Room Lobby (Host View)

```
╔══════════════════════════════════╗
║  غرفة الانتظار     غرفة 583214   ║
╠══════════════════════════════════╣
║                                  ║
║        ╔═══════════════╗         ║
║        ║   QR Code     ║         ║
║        ║               ║         ║
║        ╚═══════════════╝         ║
║                                  ║
║  رمز الدخول                      ║
║  ████ 583214 ████                ║
║                                  ║
║  [انسخ الرابط]                   ║
║                                  ║
╠══════════════════════════════════╣
║  اللاعبون:                       ║
║  ♙ عبدالعزيز (أبيض)             ║
║  ♟  محمد (أسود)                 ║
║                                  ║
║  [بدء المباراة]                   ║
╚══════════════════════════════════╝
```

### Board Layout

```
         a  b  c  d  e  f  g  h
      8  ♜  ♞  ♝  ♛  ♚  ♝  ♞  ♜  8
      7  ♟  ♟  ♟  ♟  ♟  ♟  ♟  ♟  7
      6  ·  ·  ·  ·  ·  ·  ·  ·  6
      5  ·  ·  ·  ·  ·  ·  ·  ·  5
      4  ·  ·  ·  ·  ·  ·  ·  ·  4
      3  ·  ·  ·  ·  ·  ·  ·  ·  3
      2  ♙  ♙  ♙  ♙  ♙  ♙  ♙  ♙  2
      1  ♖  ♘  ♗  ♕  ♔  ♗  ♘  ♖  1
         a  b  c  d  e  f  g  h

  ♙ عبدالعزيز        ♟ محمد
     09:42               08:57
     [دورك]          [بانتظار الخصم]
```

### Board UX Requirements

1. **Click-to-move** (mandatory): Click piece → legal squares highlighted → click destination
2. **Drag-and-drop** (optional): Add only if click-to-move is stable
3. **Legal squares**: Dot for empty, ring for capture
4. **Last move**: Highlight from + to squares
5. **Check**: Clear highlight on king square
6. **Promotion**: Dialog with Queen/Rook/Bishop/Knight — no auto-queen
7. **Board orientation**: White bottom for White player, Black bottom for Black player, White bottom default for spectator, with flip button

### Player Display

```
♙ عبدالعزيز              ♟ محمد
   09:42                     08:57
   [دورك]               [بانتظار الخصم]
```

- Name + piece icon + clock
- Status: "دورك" / "بانتظار الخصم" / "كش!" / "كش مات!"

### Spectator Badge

```
👁 وضع المشاهدة     👁 14 مشاهدًا
```

### Result Screen

```
╔══════════════════════════════════╗
║     🏆 كش مات                    ║
║                                  ║
║     عبدالعزيز يفوز               ║
║                                  ║
║     السبب: كش مات                ║
║     المدة: 18:42                  ║
║     النقلات: 37                   ║
║                                  ║
║     [إعادة التحدي]  [غرفة جديدة] ║
╚══════════════════════════════════╝
```

### Move History (SAN)

Desktop: Side panel
Mobile: Collapsible section
Spectator: Visible

```
1. e4  e5
2. Nf3 Nc6
3. Bb5 a6
4. Ba4 Nf6
5. O-O  Be7
...
```

### RTL Considerations

- Board coordinates (a-h, 1-8) stay LTR
- SAN notation stays LTR
- FEN stays LTR
- PGN stays LTR
- Arabic UI text is RTL

### Responsive Breakpoints

| Breakpoint | Board Size | Layout |
|---|---|---|
| 320px | Full width, compact controls | Stacked |
| 375px | Full width | Stacked |
| 390px | Full width | Stacked |
| 414px | Full width | Stacked |
| 768px | Max 500px | Side-by-side with panel |
| Desktop | Max 600px | Full layout |

---

## CHESS TEST PLAN

### Unit Tests (Backend)

```
chess.logic.test.ts
  ├── create engine from starting FEN
  ├── validate legal moves
  ├── validate illegal moves
  ├── detect check
  ├── detect checkmate
  ├── detect stalemate
  ├── detect threefold repetition
  ├── detect fifty-move rule
  ├── detect insufficient material
  ├── castling (kingside, queenside)
  ├── en passant
  ├── promotion (queen, rook, bishop, knight)
  └── SAN generation

chess.service.test.ts
  ├── create room
  ├── join as white
  ├── join as black
  ├── join as spectator
  ├── join full room (spectator only)
  ├── duplicate name rejection
  ├── start game (countdown → playing)
  ├── submit legal move
  ├── submit illegal move
  ├── submit wrong turn
  ├── submit stale version → STALE_POSITION + latest snapshot
  ├── submit duplicate move (same version)
  ├── spectator move rejection
  ├── resign
  ├── offer draw
  ├── accept draw
  ├── reject draw
  ├── timeout (clock reaches zero)
  ├── disconnect → grace period
  ├── reconnect → seat restored
  ├── rematch
  ├── game end (checkmate)
  ├── game end (stalemate)
  ├── game end (timeout)
  ├── room lock prevents double move
  └── host leaves → room resets
```

### Integration Tests

```
chess.e2e-spec.ts
  ├── Full game: white wins by checkmate in < 20 moves
  ├── Full game: draw by stalemate
  ├── Full game: timeout
  ├── Player A disconnects, reconnects within grace period
  ├── Player A disconnects, grace period expires, B claims timeout
  ├── Spectator watches full game without move permission
  ├── Rematch with color swap
  ├── Concurrent move attempt (race condition)
  └── Stale state recovery
```

### Playwright (3 Browser Contexts)

```ts
// chess.spec.ts
test('full chess game flow', async ({ browser }) => {
  const contextA = await browser.newContext();  // عبدالعزيز (White)
  const contextB = await browser.newContext();  // محمد (Black)
  const contextC = await browser.newContext();  // Spectator

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageC = await contextC.newPage();

  // A creates room
  await pageA.goto('/games/chess');
  await pageA.fill('[name="playerName"]', 'عبدالعزيز');
  await pageA.click('text=أنشئ التحدي');
  const pin = await pageA.textContent('.room-pin');

  // B joins
  await pageB.goto(`/games/chess?join=${pin}`);
  await pageB.fill('[name="playerName"]', 'محمد');
  await pageB.click('text=تحدَّ الآن');

  // C spectates
  await pageC.goto(`/games/chess?join=${pin}`);
  await pageC.click('text=شاهد المباراة');

  // A moves e2→e4
  await pageA.click('[data-square="e2"]');
  await pageA.click('[data-square="e4"]');

  // Verify all three updated
  await expect(pageA.locator('.board')).toContainText('e4');
  await expect(pageB.locator('.board')).toContainText('e4');
  await expect(pageC.locator('.board')).toContainText('e4');

  // C tries to move — must be rejected
  await pageC.click('[data-square="e7"]');
  await expect(pageC.locator('.error')).toContainText('لست لاعبًا');

  // B moves e7→e5
  await pageB.click('[data-square="e7"]');
  await pageB.click('[data-square="e5"]');

  // Refresh A, verify position restored
  await pageA.reload();
  await expect(pageA.locator('.board')).toContainText('e5');

  // ... continue to checkmate or controlled end
});
```

### Testing Matrix Summary

| Category | Tests | Status |
|---|---|---|
| Room creation | 3 | Pending |
| Join flow | 5 | Pending |
| Spectator | 4 | Pending |
| Legal moves | 20+ | Pending |
| Illegal moves | 10+ | Pending |
| Special moves (castle, EP, promotion) | 8 | Pending |
| Draw conditions | 6 | Pending |
| Resign/Timeout | 4 | Pending |
| Clock | 6 | Pending |
| Reconnect | 4 | Pending |
| Concurrency | 3 | Pending |
| Playwright E2E | 1 (3-context) | Pending |

---

## CHESS GAME GUIDE

```ts
// packages/domain/src/game-guides.ts (add to GAME_GUIDES)
{
  id: 'chess',
  goal: 'كش مات لملك الخصم.',
  steps: [
    'أنشئ غرفة وشارك الرمز مع صديقك.',
    'يدخل صديقك بالرمز وينضم كلاعب.',
    'يحرك الأبيض أولًا بالنقر على القطعة ثم المربع الهدف.',
    'تطبق قوانين الشطرنج القياسية: كش، كش مات، تعادل.',
    'تنتهي المباراة بفوز أو تعادل.',
  ],
  example: 'مثال: افتح e4، يرد e5، ثم Nf3 لتطوير الحصان ومهاجمة الملك.',
  tip: 'تحكم في مركز الرقعة وطور قطعك قبل الهجوم.',
}
```

---

## CHESS SPRINT PLAN

### SPRINT 6 — CHESS CORE

- [ ] Add `chess` to `SpecialGameMode` union
- [ ] Add chess entry to `SPECIAL_GAME_META` and `INJECTED_GAME_CATALOG`
- [ ] Add chess room model and Redis storage
- [ ] Add guest identity system
- [ ] Add two-seat logic (WHITE/BLACK)
- [ ] Integrate `chess.js` rule engine
- [ ] Basic board UI (click-to-move)
- [ ] Move contract (`from`, `to`, `promotion?`, `expectedVersion`)
- [ ] Server-authoritative move validation
- [ ] Redis room lock for atomicity

### SPRINT 7 — CHESS ADVANCED REALTIME

- [ ] Chess clocks (all time controls)
- [ ] Spectator mode
- [ ] Reconnect with guest identity
- [ ] Draw offer/accept/reject
- [ ] Resign with confirmation
- [ ] Rematch with color swap
- [ ] Stale position handling (send latest snapshot)
- [ ] Disconnect grace period (60s)
- [ ] Promotion dialog
- [ ] Move history panel (SAN)
- [ ] Board flip for spectators
- [ ] Result screen with reasons

### SPRINT 8 — IMPROVE INSTANT GAMES
(No chess work)

### SPRINT 9 — QUIZ/LIVE IMPROVEMENTS
(No chess work)

### SPRINT 10 — CATALOG + UX POLISH

- [ ] Chess appears in all filter categories
- [ ] Chess search suggestions
- [ ] Chess game guide
- [ ] Chess card in catalog
- [ ] RTL polish for chess UI
- [ ] Mobile responsive testing (320–768px)

### SPRINT 11 — FULL SECURITY/PERFORMANCE/REGRESSION AUDIT

- [ ] Spectator cannot move (explicit test)
- [ ] Double move prevented
- [ ] Stale version rejected
- [ ] Concurrent moves handled
- [ ] Clock accuracy under load
- [ ] Reconnect under network stress
- [ ] Full Playwright 3-context test passing

---

## CHESS DATABASE POLICY (V1)

### Redis Only

```
chess:{pin}:room       → ChessRoom JSON (TTL: 3h)
chess:{pin}:lock       → Lock token (TTL: 10s, auto-expire)
chess:guest:{guestId}  → Guest identity JSON (TTL: 24h)
chess:pins:active      → Set of active pins (TTL: 3h)
```

### No Prisma Migration (V1)

- No `ChessGame` table
- No `ChessMove` table
- No Elo/rating system
- No permanent match history

### PHASE 2 PROPOSALS (Not Implemented Now)

If ranked chess is desired later:

1. **Prisma Migration**: `ChessGame` model with `id`, `whiteGuestId`, `blackGuestId`, `result`, `fen`, `pgn`, `rated`, `whiteRatingChange`, `blackRatingChange`
2. **Elo System**: Glicko-2 or standard Elo, stored in `ChessPlayerRating` table
3. **Match History**: Persistent game records with PGN export
4. **Player Profiles**: Chess-specific stats (wins, losses, draws, rating)
5. **Leaderboards**: Regional and global rankings

These remain proposals until the core game is production-stable.

---

## CHESS ROUTES

### New Routes

| Route | Purpose |
|---|---|
| `/games/chess` | Chess game page (create/join) |
| `/games/chess?join=583214` | Join specific room |
| `/games/chess?spectate=583214` | Spectate specific room |

### Existing Routes That Auto-Include Chess

| Route | How Chess Appears |
|---|---|
| `/games` | Game catalog (auto from `INJECTED_GAME_CATALOG`) |
| `/games?category=استراتيجية` | Filter by category |
| `/games?kind=room` | Filter by kind |
| `/games?query=شطرنج` | Search |

### No Route Changes Needed

The existing catalog system auto-discovers games from `INJECTED_GAME_CATALOG`. Adding chess there is sufficient.

---

## CHESS MOBILE

### Breakpoints

```css
/* Mobile first */
.chess-board {
  width: 100%;
  aspect-ratio: 1;
  max-width: 100vw;
}

/* Tablet */
@media (min-width: 768px) {
  .chess-board {
    max-width: 500px;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .chess-board {
    max-width: 600px;
  }
}
```

### Controls

- Compact buttons on mobile
- Bottom action bar on mobile (`resign`, `draw`, `flip`)
- Collapsible move history
- Touch-friendly 44px minimum tap targets

---

## CHESS AUDIO

### Reuse Existing Audio System

```ts
// In chess-room.tsx
const { play } = useGameSound();

useEffect(() => {
  if (moveAck) play(moveAck.isCapture ? 'capture' : 'move');
}, [moveAck, play]);

useEffect(() => {
  if (gameEnd?.result === 'checkmate') play('checkmate');
  if (gameEnd?.result === 'draw') play('draw');
}, [gameEnd, play]);
```

### Sounds

| Event | Sound |
|---|---|
| Move | `move.mp3` |
| Capture | `capture.mp3` |
| Check | `check.mp3` |
| Checkmate | `checkmate.mp3` |
| Draw offer | `draw-offer.mp3` |
| Game start | `game-start.mp3` |

### Mute

- Respect existing `useGameSound` mute state
- No new audio engine

---

## CHESS ACCESSIBILITY

### Requirements

1. **Click-to-move mandatory** — no keyboard-only mode in V1, but board must be keyboard-focusable
2. **Accessible square labels** — aria-labels like `"حصان أبيض في g1"`, `"نقل إلى f3"`
3. **aria-live region** for announcements:
   - "دور الأبيض"
   - "دور الأسود"
   - "كش!"
   - "كش مات، عبدالعزيز يفوز"
   - "انتهت المباراة"
4. **Respect `prefers-reduced-motion`**
5. **WCAG AA contrast** on all board elements

---

## OPEN QUESTIONS (For Approval Discussion)

1. **chess.js version**: Use latest stable (`^1.0.0` or latest)? Need to verify API stability.
2. **Promotion auto-queen**: User says no auto-queen, but should we add a "always promote to queen" toggle?
3. **Clock pause on disconnect**: 60 seconds grace — is this final or subject to UX testing?
4. **Rematch behavior**: Always swap colors, or let players choose?
5. **Spectator limit**: Unlimited in V1, or cap at e.g. 50?
6. **Room TTL**: 3 hours same as special games, or different?
7. **Draw offer spam**: Limit to 1 offer per player per game? Or timed cooldown?

---

## APPROVAL CHECKLIST

Before implementation begins, confirm:

- [ ] Chess is `kind: 'room'`, not `upcoming` or `experimental`
- [ ] `chess.js` is the chosen rule engine
- [ ] Move contract: `{ from, to, promotion?, expectedVersion }`
- [ ] Guest identity: `guestId` + opaque `guestToken` (not in URL)
- [ ] Room code is NOT auth secret
- [ ] Spectators cannot move (explicit enforcement + test)
- [ ] No Prisma migration in V1
- [ ] No Elo/match history in V1
- [ ] Sprint plan approved
- [ ] Open questions resolved
