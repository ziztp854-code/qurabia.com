import { z } from 'zod';
export const defaultConstructionConfig = {
  maxPending: 5,
  historyLimit: 100,
  queuedRefund: 1,
  activeRefund: 0.5,
};
export const constructionConfigSchema = z
  .object({
    maxPending: z.number().int().min(1).max(20),
    historyLimit: z.number().int().min(0).max(100),
    queuedRefund: z.number().min(0).max(1),
    activeRefund: z.number().min(0).max(1),
  })
  .strict();
