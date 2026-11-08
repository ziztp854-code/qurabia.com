import { SpecialGamesStore } from './special-games.store.js';
import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';
import { SpecialGamesGateway } from './special-games.gateway.js';
import { SpecialGamesService } from './special-games.service.js';

@Module({
  imports: [InfrastructureModule],
  providers: [SpecialGamesStore, SpecialGamesGateway, SpecialGamesService],
})
export class SpecialGamesModule {}
