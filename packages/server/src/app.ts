import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, {
  LogController,
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { SESSION_COOKIE, findApiToken, isSessionValueValid } from './auth.js';
import type { ApiToken, Config } from './config.js';
import type { Db } from './db/index.js';
import { authRoutes } from './routes/auth.js';
import { counterRoutes } from './routes/counters.js';
import { eventRoutes } from './routes/events.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    /** Browser session only: full control, including rename and delete. */
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Browser session or API token: may record incidents, nothing else. */
    requireWriter: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    isAuthenticated: () => boolean;
    /** The API token this request presented, if any. */
    apiToken: ApiToken | null;
  }
}

/**
 * The wall display polls the counter list every 30 seconds, forever, and
 * health checks land just as often. Logging every one of those buries anything
 * worth reading, so they are skipped and all other requests log normally.
 */
function createLogController(): LogController {
  return new LogController({
    disableRequestLogging: (request) =>
      request.method === 'GET' &&
      (request.url.startsWith('/api/counters') || request.url.startsWith('/api/health')),
  });
}

export interface BuildAppOptions {
  config: Config;
  db: Db;
}

export async function buildApp({ config, db }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.isProduction
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
    trustProxy: true,
    logController: createLogController(),
  });

  app.decorate('config', config);
  app.decorate('db', db);

  await app.register(helmet, {
    // The display page pulls a Google font and uses a background image; keep
    // CSP on but allow those. Disabled entirely in dev so Vite HMR works.
    contentSecurityPolicy: config.isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:'],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
  });

  if (config.corsOrigins.length > 0) {
    await app.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
    });
  }

  await app.register(cookie, {
    secret: config.SESSION_SECRET,
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // The wall display polls these constantly from one IP; don't lock it out.
    allowList: (request) =>
      request.method === 'GET' &&
      ['/api/counters', '/api/config', '/api/health'].some((path) =>
        request.url.startsWith(path),
      ),
  });

  app.decorateRequest('isAuthenticated', function (this: FastifyRequest) {
    const raw = this.cookies[SESSION_COOKIE];
    if (!raw) return false;

    const unsigned = this.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return false;

    return isSessionValueValid(unsigned.value);
  });

  app.decorateRequest('apiToken', null);

  // Resolve the bearer token once per request so routes and the audit log can
  // both see which tool is calling.
  app.addHook('onRequest', async (request) => {
    request.apiToken = findApiToken(config, request.headers.authorization);
  });

  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.isAuthenticated()) {
      return reply
        .code(401)
        .send({ error: { message: 'Authentication required', code: 'UNAUTHENTICATED' } });
    }
  });

  app.decorate('requireWriter', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.isAuthenticated() || request.apiToken) {
      return;
    }

    return reply.code(401).send({
      error: {
        message: 'Sign in, or send an API token as "Authorization: Bearer <token>"',
        code: 'UNAUTHENTICATED',
      },
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;

    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.code(status).send({
        error: { message: 'Something went wrong', code: 'INTERNAL_ERROR' },
      });
    }

    return reply.code(status).send({
      error: { message: error.message, code: error.code ?? 'REQUEST_ERROR' },
    });
  });

  /**
   * Runtime settings for the frontend. It lives in the API rather than being
   * baked in at build time, so one published image can be deployed by anyone
   * and say whatever they are counting.
   */
  app.get('/api/config', async () => ({ pageTitle: config.PAGE_TITLE }));

  app.get('/api/health', async () => ({
    status: 'ok',
    database: config.DB_CLIENT,
    time: new Date().toISOString(),
  }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(counterRoutes, { prefix: '/api/counters' });
  await app.register(eventRoutes, { prefix: '/api/events' });

  await registerStaticFrontend(app, config);

  return app;
}

/**
 * In production the same process serves the built React app. Unknown non-API
 * paths fall through to index.html so client-side routing works on refresh.
 */
async function registerStaticFrontend(app: FastifyInstance, config: Config): Promise<void> {
  const distPath = config.WEB_DIST_PATH
    ? resolve(config.WEB_DIST_PATH)
    : resolve(process.cwd(), '../web/dist');

  if (!existsSync(distPath)) {
    app.log.info({ distPath }, 'no frontend build found; serving API only');
    return;
  }

  await app.register(fastifyStatic, { root: distPath, wildcard: false });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: { message: 'Not found', code: 'NOT_FOUND' } });
    }

    return reply.sendFile('index.html');
  });

  app.log.info({ distPath }, 'serving frontend');
}
