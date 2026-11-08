import { ScrambledWordsStore } from './scrambled-words.store.js';
import { Module } from '@nestjs/common';
import { ScrambledWordsGateway } from './scrambled-words.gateway.js';
import { ScrambledWordsService } from './scrambled-words.service.js';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  providers: [
    ScrambledWordsStore,
    ScrambledWordsGateway,
    ScrambledWordsService,
  ],
  exports: [ScrambledWordsService],
})
export class ScrambledWordsModule {}
