import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { createTestContext, type TestContext } from './test-support.js';

/**
 * Regression cover for a bug that only appeared off localhost.
 *
 * Helmet enables `upgrade-insecure-requests` by default. On a "potentially
 * trustworthy" origin (localhost, 127.0.0.1) browsers skip the upgrade, so
 * local testing looked fine — but on a LAN address the browser rewrote every
 * same-origin asset request to https://, nothing answered on TLS, and the
 * board rendered as a blank page.
 */

let plain: TestContext;
let https: TestContext;

const csp = (context: TestContext, headers: Record<string, unknown>) =>
  String(headers['content-security-policy'] ?? '');

before(async () => {
  plain = await createTestContext({ NODE_ENV: 'production', COOKIE_SECURE: 'false' });
  https = await createTestContext({ NODE_ENV: 'production', COOKIE_SECURE: 'true' });
});

after(async () => {
  await plain.close();
  await https.close();
});

describe('security headers', () => {
  test('the production CSP does not upgrade insecure requests', async () => {
    const response = await plain.app.inject({ method: 'GET', url: '/api/health' });
    const policy = csp(plain, response.headers);

    assert.ok(policy.length > 0, 'CSP should be set in production');
    assert.doesNotMatch(
      policy,
      /upgrade-insecure-requests/,
      'would break every plain-HTTP deployment that is not on localhost',
    );
  });

  test('the rest of the policy is still enforced', async () => {
    const policy = csp(
      plain,
      (await plain.app.inject({ method: 'GET', url: '/api/health' })).headers,
    );

    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "script-src 'self'",
    ]) {
      assert.match(policy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  test('HSTS is not sent when the deployment is plain HTTP', async () => {
    const response = await plain.app.inject({ method: 'GET', url: '/api/health' });

    assert.equal(
      response.headers['strict-transport-security'],
      undefined,
      'browsers ignore HSTS over http, and sending it risks pinning the host',
    );
  });

  test('HSTS is sent once the deployment declares HTTPS', async () => {
    const response = await https.app.inject({ method: 'GET', url: '/api/health' });

    assert.match(String(response.headers['strict-transport-security']), /max-age=31536000/);
  });
});
