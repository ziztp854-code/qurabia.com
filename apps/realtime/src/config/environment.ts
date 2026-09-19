import { z } from 'zod';
import { isValidWebOriginList } from './web-origins.js';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  REALTIME_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z
    .string()
    .refine(
      isValidWebOriginList,
      'WEB_ORIGIN must contain exact HTTP(S) origins.',
    )
    .default('http://localhost:3000'),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  return environmentSchema.parse(config);
}
