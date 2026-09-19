import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnvironment } from './config/environment.js';
import { GameModule } from './game/game.module.js';
import { SpecialGamesModule } from './special-games/special-games.module.js';
import { ChessModule } from './chess/chess.module.js';
import { BalootModule } from './baloot/baloot.module.js';
import { LadderModule } from './ladder/ladder.module.js';
import { ScrambledWordsModule } from './scrambled-words/scrambled-words.module.js';
import { EliminationModule } from './elimination/elimination.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    SentryModule.forRoot(),
    GameModule,
    SpecialGamesModule,
    ChessModule,
    BalootModule,
    LadderModule,
    ScrambledWordsModule,
    EliminationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
