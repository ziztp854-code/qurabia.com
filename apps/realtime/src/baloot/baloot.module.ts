import { BalootStore } from './baloot.store.js';
import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';
import { BalootGateway } from './baloot.gateway.js';
import { BalootService } from './baloot.service.js';

@Module({
  imports: [InfrastructureModule],
  providers: [BalootStore, BalootGateway, BalootService],
  exports: [BalootService],
})
export class BalootModule {}
