import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { createTestContext, type TestContext } from '../test-support.js';

let context: TestContext;
let app: FastifyInstance;

const adminCookie = () => context.adminCookie();

before(async () => {
  context = await createTestContext();
  app = context.app;
});

after(async () => {
  await context.close();
});

describe('public routes', () => {
  test('the counter list is readable without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/counters' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { counters: [] });
  });

  test('health reports the active database backend', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().database, context.config.DB_CLIENT);
  });
});

describe('authentication', () => {
  test('writes are rejected without a session', async () => {
    for (const request of [
      { method: 'POST' as const, url: '/api/counters', payload: { name: 'x', description: 'y' } },
      { method: 'PATCH' as const, url: '/api/counters/1', payload: { name: 'x' } },
      { method: 'POST' as const, url: '/api/counters/1/reset' },
      { method: 'DELETE' as const, url: '/api/counters/1' },
    ]) {
      const response = await app.inject(request);
      assert.equal(response.statusCode, 401, `${request.method} ${request.url} should be 401`);
    }
  });

  test('the wrong password does not create a session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'not-the-password' },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['set-cookie'], undefined);
  });

  test('a forged session cookie is rejected', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/counters',
      headers: { cookie: `sincewhen_session=${Date.now()}.${Date.now() + 100_000}` },
      payload: { name: 'forged', description: 'should not work' },
    });

    assert.equal(response.statusCode, 401, 'an unsigned cookie must not authenticate');
  });
});

describe('counter lifecycle', () => {
  test('create, read, update, reset and delete', async () => {
    const cookie = await adminCookie();

    const created = await app.inject({
      method: 'POST',
      url: '/api/counters',
      headers: { cookie },
      payload: {
        name: 'prod-outage',
        description: 'Someone took production down',
        lastIncidentAt: '2026-01-01T12:00:00.000Z',
      },
    });

    assert.equal(created.statusCode, 201);
    const counter = created.json().counter;
    assert.equal(counter.name, 'prod-outage');
    assert.equal(counter.lastIncidentAt, '2026-01-01T12:00:00.000Z');

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/counters/${counter.id}`,
      headers: { cookie },
      payload: { description: 'Someone took production down again' },
    });

    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().counter.description, 'Someone took production down again');
    assert.equal(updated.json().counter.name, 'prod-outage', 'untouched fields are preserved');

    const before = Date.now();
    const reset = await app.inject({
      method: 'POST',
      url: `/api/counters/${counter.id}/reset`,
      headers: { cookie },
    });

    assert.equal(reset.statusCode, 200);
    const resetAt = Date.parse(reset.json().counter.lastIncidentAt);
    assert.ok(resetAt >= before, 'reset moves the incident time to now');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/counters/${counter.id}`,
      headers: { cookie },
    });

    assert.equal(deleted.statusCode, 204);

    const missing = await app.inject({ method: 'GET', url: `/api/counters/${counter.id}` });
    assert.equal(missing.statusCode, 404);
  });

  test('duplicate names are rejected with a field error', async () => {
    const cookie = await adminCookie();
    const payload = { name: 'reply-all', description: 'Someone replied all' };

    const first = await app.inject({
      method: 'POST',
      url: '/api/counters',
      headers: { cookie },
      payload,
    });
    assert.equal(first.statusCode, 201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/counters',
      headers: { cookie },
      payload,
    });

    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error.code, 'DUPLICATE_NAME');
    assert.ok(second.json().error.fields.name);
  });

  test('invalid input is rejected with per-field messages', async () => {
    const cookie = await adminCookie();

    const response = await app.inject({
      method: 'POST',
      url: '/api/counters',
      headers: { cookie },
      payload: { name: '', description: '', lastIncidentAt: 'not-a-date' },
    });

    assert.equal(response.statusCode, 400);
    const { fields } = response.json().error;
    assert.ok(fields.name, 'name error');
    assert.ok(fields.description, 'description error');
    assert.ok(fields.lastIncidentAt, 'lastIncidentAt error');
  });

  test('counters are listed most recent incident first', async () => {
    const cookie = await adminCookie();

    await app.inject({
      method: 'POST',
      url: '/api/counters',
      headers: { cookie },
      payload: {
        name: 'old-thing',
        description: 'Ages ago',
        lastIncidentAt: '2020-01-01T00:00:00.000Z',
      },
    });

    await app.inject({
      method: 'POST',
      url: '/api/counters',
      headers: { cookie },
      payload: {
        name: 'recent-thing',
        description: 'Just now',
        lastIncidentAt: '2026-06-01T00:00:00.000Z',
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/counters' });
    const names = response.json().counters.map((c: { name: string }) => c.name);

    assert.ok(
      names.indexOf('recent-thing') < names.indexOf('old-thing'),
      'newer incidents sort first',
    );
  });
});
