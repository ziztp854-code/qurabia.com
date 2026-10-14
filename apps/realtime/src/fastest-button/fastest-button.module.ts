import { Module } from '@nestjs/common';
import { GameModule } from '../game/game.module.js';
import { FastestButtonGateway } from './fastest-button.gateway.js';
import { FastestButtonService } from './fastest-button.service.js';
@Module({
  imports: [GameModule],
  providers: [FastestButtonGateway, FastestButtonService],
})
export class FastestButtonModule {}
