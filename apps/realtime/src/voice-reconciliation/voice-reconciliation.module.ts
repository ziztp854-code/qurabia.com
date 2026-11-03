import { Module } from '@nestjs/common';
import { VoiceReconciliationWorker } from './voice-reconciliation.worker.js';
import { VoiceReconciliationController } from './voice-reconciliation.controller.js';

@Module({
  controllers: [VoiceReconciliationController],
  providers: [VoiceReconciliationWorker],
})
export class VoiceReconciliationModule {}
