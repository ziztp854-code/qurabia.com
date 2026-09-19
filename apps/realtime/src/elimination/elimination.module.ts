import { Module } from '@nestjs/common';
import { EliminationGateway } from './elimination.gateway.js';
import { EliminationService } from './elimination.service.js';
import { GameModule } from '../game/game.module.js';

@Module({
  imports: [GameModule],
  providers: [EliminationGateway, EliminationService],
  exports: [EliminationService],
})
export class EliminationModule {}
