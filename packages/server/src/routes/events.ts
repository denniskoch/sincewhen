import { recordEventSchema } from '@sincewhen/shared';
import type { FastifyPluginAsync } from 'fastify';

import {
  DuplicateCounterNameError,
  createCounter,
  getCounterByName,
  recordIncident,
} from '../db/counters.js';
import { validationError } from './validation.js';

/**
 * The machine-facing entry point: "this just happened again".
 *
 * Tools address a counter by `name` rather than by id, because a name is the
 * stable thing a monitoring check or CI job can hard-code.
 */
export const eventRoutes: FastifyPluginAsync = async (app) => {
  const { db } = app;

  app.post(
    '/',
    {
      preHandler: app.requireWriter,
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = recordEventSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send(validationError(parsed.error));
      }

      const { counter: name, occurredAt, description, create } = parsed.data;
      const at = occurredAt ?? new Date().toISOString();
      const source = request.apiToken?.label ?? 'admin session';

      const existing = await getCounterByName(db, name);

      if (!existing) {
        if (!create) {
          return reply.code(404).send({
            error: {
              message: `No counter named "${name}". Send "create": true to add it.`,
              code: 'NOT_FOUND',
            },
          });
        }

        if (!description) {
          return reply.code(400).send({
            error: {
              message: 'A description is required when creating a counter',
              code: 'VALIDATION_ERROR',
              fields: { description: ['A description is required when creating a counter'] },
            },
          });
        }

        try {
          const counter = await createCounter(db, { name, description, lastIncidentAt: at });
          request.log.info({ counter: name, source }, 'counter created from event');

          return reply.code(201).send({ counter, created: true, updated: true });
        } catch (error) {
          // Another caller created the same counter between our lookup and
          // insert; fall through and record against theirs.
          if (!(error instanceof DuplicateCounterNameError)) throw error;
        }
      }

      const target = existing ?? (await getCounterByName(db, name));

      if (!target) {
        return reply
          .code(404)
          .send({ error: { message: `No counter named "${name}"`, code: 'NOT_FOUND' } });
      }

      const result = await recordIncident(db, target.id, at);

      if (!result) {
        return reply
          .code(404)
          .send({ error: { message: `No counter named "${name}"`, code: 'NOT_FOUND' } });
      }

      if (result.updated) {
        request.log.info({ counter: name, source, occurredAt: at }, 'incident recorded');
      } else {
        request.log.info(
          { counter: name, source, occurredAt: at, current: result.counter.lastIncidentAt },
          'incident ignored: older than the one already recorded',
        );
      }

      return { counter: result.counter, created: false, updated: result.updated };
    },
  );
};
