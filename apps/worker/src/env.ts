import dotenv from 'dotenv';
import { z } from 'zod';

if (process.env.WORKER_DOTENV === '1') {
  dotenv.config();
}

const envSchema = z
  .object({
    DATABASE_URL: z.string().url().optional(),
    BACKUP_VERIFICATION_MODE: z.enum(['postgres', 'supabase', 'stub']).default('postgres'),
    BACKUP_MAX_AGE_HOURS: z.coerce.number().positive().default(25),
    OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
    WORKER_INTERVAL_MS_DEFAULT: z.coerce.number().int().positive().default(30_000),
    WORKER_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production; worker fails closed.',
      });
    }
  });

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid worker environment: ${message}`);
  }

  return parsed.data;
}

export const env = loadEnv();
