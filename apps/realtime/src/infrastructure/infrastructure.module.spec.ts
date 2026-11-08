import { BalootModule } from '../baloot/baloot.module.js';
import { ChessModule } from '../chess/chess.module.js';
import { EliminationModule } from '../elimination/elimination.module.js';
import { LadderModule } from '../ladder/ladder.module.js';
import { ScrambledWordsModule } from '../scrambled-words/scrambled-words.module.js';
import { SpecialGamesModule } from '../special-games/special-games.module.js';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { FastestButtonModule } from '../fastest-button/fastest-button.module.js';
import { GameGateway } from '../game/game.gateway.js';
import { GameModule } from '../game/game.module.js';
import { DatabaseService } from './database.service.js';
import { InfrastructureModule } from './infrastructure.module.js';
import { RedisService } from './redis.service.js';

describe('InfrastructureModule', () => {
  it('lets a game load without the main game gateway', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        FastestButtonModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue({})
      .overrideProvider(DatabaseService)
      .useValue({})
      .compile();

    expect(() => module.get(GameGateway)).toThrow();
    await module.close();
  });

  it('shares infrastructure providers across game modules', async () => {
    const database = {};
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        FastestButtonModule,
        GameModule,
      ],
    })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();

    expect(module.select(FastestButtonModule).get(RedisService)).toBe(
      module.select(GameModule).get(RedisService),
    );
    expect(
      module
        .select(InfrastructureModule)
        .get(DatabaseService, { strict: true }),
    ).toBe(database);
    await module.close();
  });
  it('resolves the feature stores in all game modules', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        GameModule,
        FastestButtonModule,
        BalootModule,
        ChessModule,
        EliminationModule,
        LadderModule,
        ScrambledWordsModule,
        SpecialGamesModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue({})
      .overrideProvider(DatabaseService)
      .useValue({})
      .compile();
    await module.close();
  });
});
