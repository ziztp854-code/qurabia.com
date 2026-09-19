import { Module } from '@nestjs/common';
import { ChessGateway } from './chess.gateway.js';
import { ChessService } from './chess.service.js';
import { GameModule } from '../game/game.module.js';

@Module({
  imports: [GameModule],
  providers: [ChessGateway, ChessService],
  exports: [ChessService],
})
export class ChessModule {}
