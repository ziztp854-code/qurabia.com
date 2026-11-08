import { EliminationStore } from './elimination.store.js';
import { Module } from '@nestjs/common';
import { EliminationGateway } from './elimination.gateway.js';
import { EliminationService } from './elimination.service.js';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  providers: [EliminationStore, EliminationGateway, EliminationService],
  exports: [EliminationService],
})
export class EliminationModule {}
