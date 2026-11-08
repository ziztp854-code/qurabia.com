import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';
import { FastestButtonGateway } from './fastest-button.gateway.js';
import { FastestButtonService } from './fastest-button.service.js';
import { FastestButtonStore } from './fastest-button.store.js';
@Module({
  imports: [InfrastructureModule],
  providers: [FastestButtonGateway, FastestButtonService, FastestButtonStore],
})
export class FastestButtonModule {}
