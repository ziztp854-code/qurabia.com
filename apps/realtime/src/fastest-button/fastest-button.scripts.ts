/** Shared atomic persistence envelope; the Redis primary is the ordering authority. */
export const FASTEST_CAS_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if ARGV[1] == '-1' then
  if raw then return 0 end
else
  if not raw or cjson.decode(raw).revision ~= tonumber(ARGV[1]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
if tonumber(ARGV[4]) > 0 then redis.call('ZADD', KEYS[2], ARGV[4], ARGV[5]) else redis.call('ZREM', KEYS[2], ARGV[5]) end
return 1
`;
export const FASTEST_PRESS_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'ROOM_NOT_FOUND' end
local room = cjson.decode(raw)
local round = room.round
if not round or round == cjson.null or round.id ~= ARGV[1] then return 'STALE_ROUND' end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
if now < round.startAt then return 'TOO_EARLY' end
if now >= round.endAt then return 'TOO_LATE' end
if room.phase ~= 'active' and room.phase ~= 'countdown' then return 'ROUND_CLOSED' end
local player = nil
for _, candidate in ipairs(room.players) do if candidate.id == ARGV[2] then player = candidate end end
if not player or player.removed or player.eliminated then return 'NOT_ELIGIBLE' end
if not player.connections[ARGV[3]] or player.connections[ARGV[3]] <= now then return 'SESSION_EXPIRED' end
local eligible = false
for _, id in ipairs(round.eligibleIds) do if id == ARGV[2] then eligible = true end end
if not eligible then return 'NOT_ELIGIBLE' end
for _, press in ipairs(round.presses) do if press.playerId == ARGV[2] then return 'ALREADY_PRESSED' end end
local sequence = #round.presses + 1
round.presses[sequence] = { playerId = ARGV[2], sequence = sequence, receivedAt = now }
room.phase = 'active'
local close = room.settings.mode == 'classic' or round.isTiebreak or sequence == #round.eligibleIds
if close then
  room.phase = 'results'
  round.winnerId = round.presses[1].playerId
  round.closedAt = now
end
room.revision = room.revision + 1
room.updatedAt = now
redis.call('SET', KEYS[1], cjson.encode(room), 'EX', ARGV[4])
if close then redis.call('ZADD', KEYS[2], now, room.code) else redis.call('ZADD', KEYS[2], round.endAt, room.code) end
return 'OK'
`;
