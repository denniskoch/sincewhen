import { loginSchema } from '@sincewhen/shared';
import type { FastifyPluginAsync } from 'fastify';

import {
  SESSION_COOKIE,
  createSessionValue,
  secretsMatch,
  sessionCookieOptions,
} from '../auth.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { config } = app;

  app.post(
    '/login',
    {
      config: {
        // Brute-forcing a single shared password is the obvious attack, so the
        // login route gets a much tighter budget than the rest of the API.
        rateLimit: { max: 10, timeWindow: '5 minutes' },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({ error: { message: 'Password is required' } });
      }

      if (!secretsMatch(parsed.data.password, config.ADMIN_PASSWORD)) {
        request.log.warn({ ip: request.ip }, 'failed admin login attempt');
        return reply.code(401).send({ error: { message: 'Incorrect password' } });
      }

      reply.setCookie(SESSION_COOKIE, createSessionValue(config), sessionCookieOptions(config));

      return { authenticated: true };
    },
  );

  app.post('/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { authenticated: false };
  });

  app.get('/me', async (request) => ({ authenticated: request.isAuthenticated() }));
};
