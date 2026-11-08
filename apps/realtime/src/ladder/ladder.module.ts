import { LadderStore } from './ladder.store.js';
import { Module } from '@nestjs/common';
import { LadderGateway } from './ladder.gateway.js';
import { LadderService } from './ladder.service.js';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  providers: [LadderStore, LadderGateway, LadderService],
  exports: [LadderService],
})
export class LadderModule {}
