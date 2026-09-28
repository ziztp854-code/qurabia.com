import { Module } from '@nestjs/common';
import { KingdomsGateway } from './kingdoms.gateway.js';
import { KingdomsWorker } from './kingdoms.worker.js';

@Module({ providers: [KingdomsGateway, KingdomsWorker] })
export class KingdomsModule {}
