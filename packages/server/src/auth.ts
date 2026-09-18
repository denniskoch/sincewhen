import { createHash, timingSafeEqual } from 'node:crypto';

import type { ApiToken, Config } from './config.js';

export const SESSION_COOKIE = 'sincewhen_session';

/**
 * Compares two secrets without leaking their length or content through timing.
 * Hashing first gives both buffers a fixed size so `timingSafeEqual` never
 * throws on a length mismatch.
 */
export function secretsMatch(a: string, b: string): boolean {
  const hashedA = createHash('sha256').update(a, 'utf8').digest();
  const hashedB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(hashedA, hashedB);
}

/**
 * Session payload is `issuedAtMs.expiresAtMs`. The cookie itself is signed by
 * @fastify/cookie, so the payload only has to carry the expiry we enforce.
 */
export function createSessionValue(config: Config, now: Date = new Date()): string {
  const issuedAt = now.getTime();
  const expiresAt = issuedAt + config.SESSION_TTL_HOURS * 3_600_000;
  return `${issuedAt}.${expiresAt}`;
}

export function isSessionValueValid(value: string, now: Date = new Date()): boolean {
  const [issuedAtRaw, expiresAtRaw] = value.split('.');
  const issuedAt = Number(issuedAtRaw);
  const expiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return false;
  }

  return now.getTime() < expiresAt;
}

/**
 * Resolves a bearer token to the label it was configured under, or null.
 *
 * Every configured token is compared even after a match so the work done is
 * the same whichever token was presented, and an unparseable header costs a
 * comparison too rather than returning early.
 */
export function findApiToken(config: Config, authorization: string | undefined): ApiToken | null {
  const presented = parseBearer(authorization);
  let matched: ApiToken | null = null;

  for (const candidate of config.apiTokens) {
    if (secretsMatch(presented, candidate.token) && presented.length > 0) {
      matched = candidate;
    }
  }

  return matched;
}

function parseBearer(authorization: string | undefined): string {
  if (!authorization) return '';

  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') return '';

  return rest.join(' ');
}

export function sessionCookieOptions(config: Config): {
  path: string;
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  signed: true;
  maxAge: number;
} {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    signed: true,
    maxAge: Math.floor(config.SESSION_TTL_HOURS * 3_600),
  };
}
