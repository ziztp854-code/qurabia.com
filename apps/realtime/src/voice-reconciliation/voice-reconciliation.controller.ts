import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { VoiceReconciliationWorker } from './voice-reconciliation.worker.js';

@Controller('health')
export class VoiceReconciliationController {
  constructor(private readonly worker: VoiceReconciliationWorker) {}

  @Get('voice-reconciliation')
  readiness(@Res({ passthrough: true }) response: Response) {
    const result = this.worker.getReadiness();
    response.setHeader('Cache-Control', 'no-store');
    response.status(result.ready ? 200 : 503);
    return result;
  }
}
