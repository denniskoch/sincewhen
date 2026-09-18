import {
  counterIdSchema,
  createCounterSchema,
  updateCounterSchema,
} from '@sincewhen/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import {
  DuplicateCounterNameError,
  createCounter,
  deleteCounter,
  getCounter,
  listCounters,
  resetCounter,
  updateCounter,
} from '../db/counters.js';
import { parseOrReply } from './validation.js';

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: { message: 'Counter not found', code: 'NOT_FOUND' } });
}

export const counterRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  /** Public: the wall display reads this without a session. */
  app.get('/', async () => ({ counters: await listCounters(db) }));

  app.get('/:id', async (request: FastifyRequest, reply) => {
    const params = parseOrReply(counterIdSchema, request.params, reply);
    if (!params.ok) return reply;

    const counter = await getCounter(db, params.data.id);
    if (!counter) return notFound(reply);

    return { counter };
  });

  /**
   * Restarts the clock: "it happened again, just now." Open to API tokens as
   * well as the admin session, so a monitoring check can trip a counter.
   */
  app.post('/:id/reset', { preHandler: app.requireWriter }, async (request, reply) => {
    const params = parseOrReply(counterIdSchema, request.params, reply);
    if (!params.ok) return reply;

    const counter = await resetCounter(db, params.data.id);
    if (!counter) return notFound(reply);

    request.log.info(
      { counter: counter.name, source: request.apiToken?.label ?? 'admin session' },
      'counter reset',
    );

    return { counter };
  });

  // Everything below this line requires an admin session: renaming and
  // deleting are not things a monitoring script should be able to do.
  app.register(async (admin) => {
    admin.addHook('preHandler', admin.requireAuth);

    admin.post('/', async (request, reply) => {
      const body = parseOrReply(createCounterSchema, request.body, reply);
      if (!body.ok) return reply;

      try {
        const counter = await createCounter(db, {
          name: body.data.name,
          description: body.data.description,
          lastIncidentAt: body.data.lastIncidentAt,
        });

        return reply.code(201).send({ counter });
      } catch (error) {
        if (error instanceof DuplicateCounterNameError) {
          return reply.code(409).send({
            error: {
              message: error.message,
              code: 'DUPLICATE_NAME',
              fields: { name: [error.message] },
            },
          });
        }
        throw error;
      }
    });

    admin.patch('/:id', async (request, reply) => {
      const params = parseOrReply(counterIdSchema, request.params, reply);
      if (!params.ok) return reply;

      const body = parseOrReply(updateCounterSchema, request.body, reply);
      if (!body.ok) return reply;

      try {
        const counter = await updateCounter(db, params.data.id, body.data);
        if (!counter) return notFound(reply);

        return { counter };
      } catch (error) {
        if (error instanceof DuplicateCounterNameError) {
          return reply.code(409).send({
            error: {
              message: error.message,
              code: 'DUPLICATE_NAME',
              fields: { name: [error.message] },
            },
          });
        }
        throw error;
      }
    });

    admin.delete('/:id', async (request, reply) => {
      const params = parseOrReply(counterIdSchema, request.params, reply);
      if (!params.ok) return reply;

      const deleted = await deleteCounter(db, params.data.id);
      if (!deleted) return notFound(reply);

      return reply.code(204).send();
    });
  });
};
