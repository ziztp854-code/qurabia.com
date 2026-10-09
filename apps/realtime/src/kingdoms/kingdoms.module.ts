import { Module } from '@nestjs/common';
import { KingdomsGateway } from './kingdoms.gateway.js';
import { KingdomsWorker } from './kingdoms.worker.js';
import { KingdomsController } from './kingdoms.controller.js';

@Module({
  controllers: [KingdomsController],
  providers: [KingdomsGateway, KingdomsWorker],
})
export class KingdomsModule {}
