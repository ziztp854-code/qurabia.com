import { Module } from '@nestjs/common';
import { GameModule } from '../game/game.module.js';
import { SpecialGamesGateway } from './special-games.gateway.js';
import { SpecialGamesService } from './special-games.service.js';

@Module({
  imports: [GameModule],
  providers: [SpecialGamesGateway, SpecialGamesService],
})
export class SpecialGamesModule {}
