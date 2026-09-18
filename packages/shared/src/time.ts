/**
 * Pure time helpers, deliberately free of any zod import so the wall display
 * can use them without pulling the validation schemas into its bundle.
 */

/** Elapsed time since an incident, already broken into display units. */
export interface Elapsed {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export function elapsedSince(iso: string, now: Date = new Date()): Elapsed {
  const totalMs = Math.max(0, now.getTime() - new Date(iso).getTime());
  const totalSeconds = Math.floor(totalMs / 1000);

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    totalMs,
  };
}

export function formatElapsed(elapsed: Elapsed): string {
  const days = String(elapsed.days).padStart(3, '0');
  const hours = String(elapsed.hours).padStart(2, '0');
  const minutes = String(elapsed.minutes).padStart(2, '0');
  return `${days} Days ${hours} Hours ${minutes} Minutes`;
}
