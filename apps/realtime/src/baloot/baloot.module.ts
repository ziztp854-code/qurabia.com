import { Module } from '@nestjs/common';
import { GameModule } from '../game/game.module.js';
import { BalootGateway } from './baloot.gateway.js';
import { BalootService } from './baloot.service.js';

@Module({
  imports: [GameModule],
  providers: [BalootGateway, BalootService],
  exports: [BalootService],
})
export class BalootModule {}
