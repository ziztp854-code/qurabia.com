import { Module } from '@nestjs/common';
import { ScrambledWordsGateway } from './scrambled-words.gateway.js';
import { ScrambledWordsService } from './scrambled-words.service.js';
import { GameModule } from '../game/game.module.js';

@Module({
  imports: [GameModule],
  providers: [ScrambledWordsGateway, ScrambledWordsService],
  exports: [ScrambledWordsService],
})
export class ScrambledWordsModule {}
