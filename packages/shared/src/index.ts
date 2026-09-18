import { z } from 'zod';


/**
 * A counter tracks how long it has been since some incident last happened.
 * `lastIncidentAt` is always an ISO-8601 UTC string, regardless of which
 * database backend produced it.
 */
export const counterSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string(),
  lastIncidentAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Counter = z.infer<typeof counterSchema>;

const name = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(80, 'Name must be 80 characters or fewer');

const description = z
  .string()
  .trim()
  .min(1, 'Description is required')
  .max(200, 'Description must be 200 characters or fewer');

/**
 * Accepts either a full ISO-8601 timestamp or the `YYYY-MM-DDTHH:mm` value
 * produced by a `datetime-local` input, and normalises to ISO-8601 UTC.
 */
const lastIncidentAt = z
  .string()
  .trim()
  .min(1, 'Date and time are required')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a valid date and time')
  .transform((value) => new Date(value).toISOString());

export const createCounterSchema = z.object({
  name,
  description,
  lastIncidentAt: lastIncidentAt.optional(),
});

export type CreateCounterInput = z.input<typeof createCounterSchema>;

export const updateCounterSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    lastIncidentAt: lastIncidentAt.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No fields to update');

export type UpdateCounterInput = z.input<typeof updateCounterSchema>;

export const counterIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Payload for `POST /api/events` — how an external tool reports that something
 * happened. `counter` is the counter's `name`, which is the stable key a
 * monitoring script can hard-code.
 */
export const recordEventSchema = z.object({
  counter: name,
  occurredAt: lastIncidentAt.optional(),
  /** Used only when the counter has to be created. */
  description: description.optional(),
  /** Create the counter if it does not exist yet. Off by default so a typo in
   *  `counter` fails loudly instead of littering the board. */
  create: z.boolean().default(false),
});

export type RecordEventInput = z.input<typeof recordEventSchema>;

export const recordEventResultSchema = z.object({
  counter: counterSchema,
  created: z.boolean(),
  /** False when the event was older than the incident already recorded. */
  updated: z.boolean(),
});

export type RecordEventResult = z.infer<typeof recordEventResultSchema>;

/** Settings the frontend needs that are decided by the operator at runtime. */
export const publicConfigSchema = z.object({
  pageTitle: z.string(),
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;

export const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const sessionSchema = z.object({
  authenticated: z.boolean(),
});

export type Session = z.infer<typeof sessionSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export * from './time.js';
