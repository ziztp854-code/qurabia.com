import { GameStore } from './game.store.js';
import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';
import { GameGateway } from './game.gateway.js';
import { GameService } from './game.service.js';

@Module({
  imports: [InfrastructureModule],
  providers: [GameStore, GameGateway, GameService],
})
export class GameModule {}
