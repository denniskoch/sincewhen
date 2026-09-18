import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSessionValue, isSessionValueValid, secretsMatch } from './auth.js';
import type { Config } from './config.js';

const config = { SESSION_TTL_HOURS: 12 } as Config;

test('secretsMatch accepts identical secrets', () => {
  assert.equal(secretsMatch('hunter2', 'hunter2'), true);
});

test('secretsMatch rejects different secrets, including differing lengths', () => {
  assert.equal(secretsMatch('hunter2', 'hunter3'), false);
  assert.equal(secretsMatch('hunter2', 'hunter2-but-longer'), false);
  assert.equal(secretsMatch('', 'hunter2'), false);
});

test('a fresh session is valid and an expired one is not', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const value = createSessionValue(config, now);

  assert.equal(isSessionValueValid(value, now), true);
  assert.equal(
    isSessionValueValid(value, new Date(now.getTime() + 11 * 3_600_000)),
    true,
    'still valid one hour before expiry',
  );
  assert.equal(
    isSessionValueValid(value, new Date(now.getTime() + 13 * 3_600_000)),
    false,
    'expired one hour after expiry',
  );
});

test('malformed session values are rejected', () => {
  assert.equal(isSessionValueValid('not-a-session'), false);
  assert.equal(isSessionValueValid(''), false);
  assert.equal(isSessionValueValid('abc.def'), false);
});
