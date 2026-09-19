import { Module } from '@nestjs/common';
import { LadderGateway } from './ladder.gateway.js';
import { LadderService } from './ladder.service.js';
import { GameModule } from '../game/game.module.js';

@Module({
  imports: [GameModule],
  providers: [LadderGateway, LadderService],
  exports: [LadderService],
})
export class LadderModule {}
