import { ConfigService } from '@nestjs/config';
import { ChessStore } from '../chess/chess.store.js';
import { BalootStore } from '../baloot/baloot.store.js';
import { EliminationStore } from '../elimination/elimination.store.js';
import { ScrambledWordsStore } from '../scrambled-words/scrambled-words.store.js';
import { SpecialGamesStore } from '../special-games/special-games.store.js';
import { RedisService } from './redis.service.js';

const url = process.env.FEATURE_STORES_TEST_REDIS_URL;
const integration = url ? describe : describe.skip;

integration('feature stores with Redis', () => {
  const redis = new RedisService(new ConfigService({ REDIS_URL: url }));
  const code = 'store-test-' + process.pid;
  const room = { name: 'test room' };
  const special = new SpecialGamesStore(redis);
  const scrambled = new ScrambledWordsStore(redis);
  const elimination = new EliminationStore(redis);
  const baloot = new BalootStore(redis);
  const chess = new ChessStore(redis);

  beforeAll(() => redis.onModuleInit());
  afterAll(async () => {
    await Promise.all([
      special.deleteSpecialRoom(code),
      scrambled.deleteScrambledRoom(code),
      elimination.deleteEliminationRoom(code),
      baloot.deleteBalootRoom(code),
      chess.deleteChessRoom(code),
    ]);
    await redis.onModuleDestroy();
  });

  it.each([
    [
      'special',
      () => special.saveSpecialRoom(code, room),
      () => special.loadSpecialRoom(code),
      () => special.acquireSpecialRoomLock(code, 'owner'),
      () => special.releaseSpecialRoomLock(code, 'other'),
      () => special.releaseSpecialRoomLock(code, 'owner'),
    ],
    [
      'scrambled',
      () => scrambled.saveScrambledRoom(code, room),
      () => scrambled.loadScrambledRoom(code),
      () => scrambled.acquireScrambledRoomLock(code, 'owner'),
      () => scrambled.releaseScrambledRoomLock(code, 'other'),
      () => scrambled.releaseScrambledRoomLock(code, 'owner'),
    ],
    [
      'elimination',
      () => elimination.saveEliminationRoom(code, room),
      () => elimination.loadEliminationRoom(code),
      () => elimination.acquireEliminationRoomLock(code, 'owner'),
      () => elimination.releaseEliminationRoomLock(code, 'other'),
      () => elimination.releaseEliminationRoomLock(code, 'owner'),
    ],
    [
      'chess',
      () => chess.saveChessRoom(code, room),
      () => chess.loadChessRoom(code),
      () => chess.acquireChessRoomLock(code, 'owner'),
      () => chess.releaseChessRoomLock(code, 'other'),
      () => chess.releaseChessRoomLock(code, 'owner'),
    ],
    [
      'baloot',
      () => baloot.saveBalootRoom(code, room),
      () => baloot.loadBalootRoom(code),
      () => baloot.acquireBalootRoomLock(code, 'owner'),
      () => baloot.releaseBalootRoomLock(code, 'other'),
      () => baloot.releaseBalootRoomLock(code, 'owner'),
    ],
  ])(
    '%s saves rooms and protects locks by owner',
    async (_name, save, load, acquire, releaseOther, releaseOwner) => {
      await save();
      expect(await load()).toEqual(room);
      expect(await acquire()).toBe(true);
      await releaseOther();
      expect(await acquire()).toBe(false);
      await releaseOwner();
      expect(await acquire()).toBe(true);
      await releaseOwner();
    },
  );
});
