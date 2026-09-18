import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/index.js';
import {
  TEST_ADMIN_PASSWORD,
  TEST_SESSION_SECRET,
  createTestContext,
  type TestContext,
} from '../test-support.js';
import { loadConfig } from '../config.js';

const NAGIOS_TOKEN = 'nagios-token-long-enough';
const CI_TOKEN = 'ci-token-also-long-enough';

let context: TestContext;
let app: FastifyInstance;
let db: Db;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const adminCookie = () => context.adminCookie();

before(async () => {
  context = await createTestContext({
    API_TOKENS: `nagios:${NAGIOS_TOKEN},ci:${CI_TOKEN}`,
  });
  app = context.app;
  db = context.db;
});

after(async () => {
  await context.close();
});

beforeEach(async () => {
  await db.deleteFrom('counters').execute();
});

/** Creates a counter directly, bypassing the API, for test setup. */
async function seedCounter(name: string, lastIncidentAt: string): Promise<number> {
  const now = new Date().toISOString();
  const row = await db
    .insertInto('counters')
    .values({
      name,
      description: `Seeded ${name}`,
      last_incident_at: lastIncidentAt,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return row.id;
}

describe('token authentication', () => {
  test('a valid token may record an event', async () => {
    await seedCounter('prod-outage', '2026-01-01T00:00:00.000Z');

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload: { counter: 'prod-outage' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().updated, true);
  });

  test('a missing, wrong or malformed token is rejected', async () => {
    await seedCounter('prod-outage', '2026-01-01T00:00:00.000Z');

    for (const headers of [
      undefined,
      bearer('not-a-real-token-at-all'),
      { authorization: NAGIOS_TOKEN }, // no "Bearer " scheme
      { authorization: `Basic ${NAGIOS_TOKEN}` },
      { authorization: 'Bearer ' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        ...(headers ? { headers } : {}),
        payload: { counter: 'prod-outage' },
      });

      assert.equal(
        response.statusCode,
        401,
        `expected 401 for ${JSON.stringify(headers ?? 'no header')}`,
      );
    }
  });

  test('a token may reset a counter but may not rename or delete one', async () => {
    const id = await seedCounter('prod-outage', '2026-01-01T00:00:00.000Z');

    const reset = await app.inject({
      method: 'POST',
      url: `/api/counters/${id}/reset`,
      headers: bearer(CI_TOKEN),
    });
    assert.equal(reset.statusCode, 200, 'reset is allowed');

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/counters/${id}`,
      headers: bearer(CI_TOKEN),
      payload: { name: 'renamed' },
    });
    assert.equal(renamed.statusCode, 401, 'rename is not allowed');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/counters/${id}`,
      headers: bearer(CI_TOKEN),
    });
    assert.equal(deleted.statusCode, 401, 'delete is not allowed');
  });

  test('an admin session can post events without a token', async () => {
    await seedCounter('prod-outage', '2026-01-01T00:00:00.000Z');

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie: await adminCookie() },
      payload: { counter: 'prod-outage' },
    });

    assert.equal(response.statusCode, 200);
  });
});

describe('recording events', () => {
  test('an event moves the counter forward to the given time', async () => {
    await seedCounter('prod-outage', '2026-01-01T00:00:00.000Z');

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload: { counter: 'prod-outage', occurredAt: '2026-06-01T08:00:00.000Z' },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      { created: response.json().created, updated: response.json().updated },
      { created: false, updated: true },
    );
    assert.equal(response.json().counter.lastIncidentAt, '2026-06-01T08:00:00.000Z');
  });

  test('a replayed or late event does not rewind the clock', async () => {
    await seedCounter('prod-outage', '2026-06-01T00:00:00.000Z');

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload: { counter: 'prod-outage', occurredAt: '2026-01-01T00:00:00.000Z' },
    });

    assert.equal(response.statusCode, 200, 'an old event is accepted, not an error');
    assert.equal(response.json().updated, false, 'but it does not change anything');
    assert.equal(
      response.json().counter.lastIncidentAt,
      '2026-06-01T00:00:00.000Z',
      'the newer incident is still the one on the board',
    );
  });

  test('sending the same event twice is idempotent', async () => {
    await seedCounter('prod-outage', '2026-01-01T00:00:00.000Z');
    const payload = { counter: 'prod-outage', occurredAt: '2026-06-01T08:00:00.000Z' };

    const first = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload,
    });

    assert.equal(first.json().updated, true);
    assert.equal(second.json().updated, false, 'the retry is a no-op');
    assert.equal(second.json().counter.lastIncidentAt, payload.occurredAt);
  });

  test('omitting occurredAt records the event as happening now', async () => {
    await seedCounter('prod-outage', '2026-01-01T00:00:00.000Z');
    const before = Date.now();

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload: { counter: 'prod-outage' },
    });

    assert.ok(Date.parse(response.json().counter.lastIncidentAt) >= before);
  });
});

describe('unknown counters', () => {
  test('an unknown name is a 404 by default, so a typo fails loudly', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload: { counter: 'prod-outgae' },
    });

    assert.equal(response.statusCode, 404);
    assert.match(response.json().error.message, /create/);

    const counters = await app.inject({ method: 'GET', url: '/api/counters' });
    assert.equal(counters.json().counters.length, 0, 'nothing was created');
  });

  test('create:true adds the counter and records the event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload: {
        counter: 'new-thing',
        description: 'A brand new kind of failure',
        create: true,
        occurredAt: '2026-06-01T08:00:00.000Z',
      },
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(
      { created: response.json().created, updated: response.json().updated },
      { created: true, updated: true },
    );
    assert.equal(response.json().counter.description, 'A brand new kind of failure');
    assert.equal(response.json().counter.lastIncidentAt, '2026-06-01T08:00:00.000Z');
  });

  test('create:true without a description is rejected', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload: { counter: 'new-thing', create: true },
    });

    assert.equal(response.statusCode, 400);
    assert.ok(response.json().error.fields.description);
  });
});

describe('configuration', () => {
  test('an instance with no tokens configured rejects every bearer token', async () => {
    const closed = await createTestContext();

    const response = await closed.app.inject({
      method: 'POST',
      url: '/api/events',
      headers: bearer(NAGIOS_TOKEN),
      payload: { counter: 'anything' },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(closed.config.apiTokens.length, 0);

    await closed.close();
  });

  test('tokens shorter than 16 characters are refused at startup', () => {
    assert.throws(
      () =>
        loadConfig({
          ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
          SESSION_SECRET: TEST_SESSION_SECRET,
          API_TOKENS: 'weak:short',
        } as NodeJS.ProcessEnv),
      /API_TOKENS/,
    );
  });

  test('unlabelled tokens are accepted and given a default label', () => {
    const parsed = loadConfig({
      ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
      SESSION_SECRET: TEST_SESSION_SECRET,
      API_TOKENS: `${NAGIOS_TOKEN}, ci:${CI_TOKEN} ,`,
    } as NodeJS.ProcessEnv);

    assert.deepEqual(
      parsed.apiTokens.map((entry) => entry.label),
      ['token-1', 'ci'],
    );
    assert.equal(parsed.apiTokens[1]?.token, CI_TOKEN);
  });
});
