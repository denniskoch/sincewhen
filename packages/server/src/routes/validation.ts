import type { FastifyReply } from 'fastify';
import type { ZodError, ZodType } from 'zod';

/** Turns a Zod error into the `{ error: { message, fields } }` shape the UI expects. */
export function validationError(error: ZodError): {
  error: { message: string; code: string; fields: Record<string, string[]> };
} {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (fields[key] ??= []).push(issue.message);
  }

  return {
    error: {
      message: error.issues[0]?.message ?? 'Invalid request',
      code: 'VALIDATION_ERROR',
      fields,
    },
  };
}

export function parseOrReply<T>(
  schema: ZodType<T>,
  value: unknown,
  reply: FastifyReply,
): { ok: true; data: T } | { ok: false } {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    reply.code(400).send(validationError(parsed.error));
    return { ok: false };
  }

  return { ok: true, data: parsed.data };
}
