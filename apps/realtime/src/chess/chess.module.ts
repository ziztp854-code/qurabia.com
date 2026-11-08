import { ChessStore } from './chess.store.js';
import { Module } from '@nestjs/common';
import { ChessGateway } from './chess.gateway.js';
import { ChessService } from './chess.service.js';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  providers: [ChessStore, ChessGateway, ChessService],
  exports: [ChessService],
})
export class ChessModule {}
