import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_CLIENT: z.enum(['sqlite', 'postgres']).default('sqlite'),
  SQLITE_PATH: z.string().default('./data/sincewhen.db'),
  DATABASE_URL: z.string().optional(),

  ADMIN_PASSWORD: z.string().min(1, 'ADMIN_PASSWORD must be set'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(24 * 30).default(12),
  COOKIE_SECURE: booleanish.default(false),

  /**
   * Tokens that let external tools record incidents, comma-separated. Each may
   * carry a label for the audit log: "nagios:s3cr3t,ci:0th3r". Everything up to
   * the first colon is the label; a value with no colon is an unlabelled token.
   */
  API_TOKENS: z.string().default(''),

  /**
   * Heading on the wall display and the browser tab title. This is the one
   * piece of copy that changes per deployment — what is being counted.
   */
  PAGE_TITLE: z.string().trim().min(1).max(60).default('Time Passed Since'),

  SEED_DEMO_DATA: booleanish.default(false),
  CORS_ORIGIN: z.string().default(''),

  /** Absolute or relative path to the built frontend. Empty disables static serving. */
  WEB_DIST_PATH: z.string().default(''),
});

const configSchema = baseSchema.superRefine((value, ctx) => {
  if (value.DB_CLIENT === 'postgres' && !value.DATABASE_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL is required when DB_CLIENT=postgres',
    });
  }
});

export interface ApiToken {
  label: string;
  token: string;
}

export type Config = z.infer<typeof baseSchema> & {
  corsOrigins: string[];
  apiTokens: ApiToken[];
  isProduction: boolean;
};

/** Splits "label:token,token2" into labelled entries, ignoring blanks. */
function parseApiTokens(raw: string): ApiToken[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const separator = entry.indexOf(':');

      if (separator === -1) {
        return { label: `token-${index + 1}`, token: entry };
      }

      return {
        label: entry.slice(0, separator).trim() || `token-${index + 1}`,
        token: entry.slice(separator + 1).trim(),
      };
    })
    .filter((entry) => entry.token.length > 0);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const value = parsed.data;

  const apiTokens = parseApiTokens(value.API_TOKENS);

  const tooShort = apiTokens.find((entry) => entry.token.length < 16);
  if (tooShort) {
    throw new Error(
      `Invalid environment configuration:\n  - API_TOKENS: token "${tooShort.label}" is shorter than 16 characters`,
    );
  }

  return {
    ...value,
    apiTokens,
    isProduction: value.NODE_ENV === 'production',
    corsOrigins: value.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
