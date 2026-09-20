import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway.js';
import { GameService } from './game.service.js';
import { RedisService } from './redis.service.js';
import { DatabaseService } from './database.service.js';
import { GameStartPushService } from './game-start-push.service.js';

@Module({
  providers: [
    GameGateway,
    GameService,
    GameStartPushService,
    RedisService,
    DatabaseService,
  ],
  exports: [RedisService, DatabaseService],
})
export class GameModule {}
