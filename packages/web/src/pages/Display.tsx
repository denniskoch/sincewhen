import type { Counter } from '@sincewhen/shared';
import { elapsedSince } from '@sincewhen/shared/time';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';
import { useConfig } from '@/lib/useConfig';

/** How often to re-fetch counters from the server. */
const REFRESH_MS = 30_000;
/** How often to recompute elapsed time locally, so minutes tick over smoothly. */
const TICK_MS = 1_000;
/**
 * Scroll speed in pixels per second. Duration is derived from this and the
 * distance actually travelled, so the reading pace stays the same whether the
 * board holds three counters or thirty.
 */
const SCROLL_PX_PER_SECOND = 25;
/** Floor on a cycle, so a nearly empty board doesn't flick past. */
const MIN_SCROLL_SECONDS = 30;

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function CounterLine({ counter, now }: { counter: Counter; now: Date }) {
  const elapsed = elapsedSince(counter.lastIncidentAt, now);

  return (
    <div className="mb-12">
      <div className="mb-1 text-[clamp(1.25rem,2.4vw,2.2rem)] tracking-wide">
        {counter.description}
      </div>
      <div className="text-[clamp(1.9rem,4vw,3.4rem)] leading-tight">
        <b className="font-normal text-[crimson]">{pad(elapsed.days, 3)}</b> Days{' '}
        <b className="font-normal text-[crimson]">{pad(elapsed.hours, 2)}</b> Hours{' '}
        <b className="font-normal text-[crimson]">{pad(elapsed.minutes, 2)}</b> Minutes
      </div>
    </div>
  );
}

export function Display() {
  const { pageTitle } = useConfig();
  const [now, setNow] = useState(() => new Date());
  const creditsRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ contentHeight: 0, viewportHeight: 0 });

  const { data: counters = [], isLoading, isError } = useQuery({
    queryKey: ['counters'],
    queryFn: api.listCounters,
    refetchInterval: REFRESH_MS,
    // A wall display is never "stale" in a way a refetch-on-focus would fix.
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Measure the rendered list and the viewport, so the scroll travels exactly
  // far enough to clear the screen and no further. The original board animated
  // to a fixed -200%, which left the screen blank for the remainder of every
  // cycle once the content was shorter than that.
  useLayoutEffect(() => {
    const element = creditsRef.current;
    if (!element) return;

    const measure = () => {
      const contentHeight = element.offsetHeight;
      const viewportHeight = window.innerHeight;

      setMetrics((current) =>
        current.contentHeight === contentHeight && current.viewportHeight === viewportHeight
          ? current
          : { contentHeight, viewportHeight },
      );
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [counters.length, pageTitle]);

  // The most recent incident, called out in the footer.
  const latest = counters[0];
  const latestElapsed = latest ? elapsedSince(latest.lastIncidentAt, now) : null;

  // Distance is one full viewport (entering from below) plus the content's own
  // height (exiting past the top).
  const travel = metrics.viewportHeight + metrics.contentHeight;
  const duration = Math.max(MIN_SCROLL_SECONDS, travel / SCROLL_PX_PER_SECOND);

  return (
    <div className="display-root relative">
      <div
        ref={creditsRef}
        className="display-credits"
        style={
          {
            '--credits-duration': `${duration.toFixed(2)}s`,
            '--credits-height':
              metrics.contentHeight > 0 ? `${metrics.contentHeight}px` : '200%',
          } as React.CSSProperties
        }
      >
        <h1 className="mb-12 text-[clamp(2.5rem,6vw,4.7rem)] leading-none font-light">
          {pageTitle}
        </h1>

        {isLoading && <div className="text-3xl opacity-70">Loading…</div>}

        {isError && (
          <div className="text-3xl text-[crimson]">Cannot reach the incident board</div>
        )}

        {!isLoading && !isError && counters.length === 0 && (
          <div className="text-3xl opacity-70">No counters yet — add one in the admin</div>
        )}

        {counters.map((counter) => (
          <CounterLine key={counter.id} counter={counter} now={now} />
        ))}
      </div>

      <div className="absolute bottom-0 block w-full bg-black p-5">
        <div className="text-right text-[clamp(1.1rem,2vw,1.9rem)] font-light">
          {latest && latestElapsed ? (
            <>
              <b className="font-normal text-[crimson]">Latest</b> — {latest.description} —{' '}
              <b className="font-normal text-[crimson]">{pad(latestElapsed.days, 3)}</b> Days{' '}
              <b className="font-normal text-[crimson]">{pad(latestElapsed.hours, 2)}</b> Hours{' '}
              <b className="font-normal text-[crimson]">{pad(latestElapsed.minutes, 2)}</b> Minutes
              Ago
            </>
          ) : (
            <span className="opacity-60">Incident Board</span>
          )}
        </div>
        <div className="text-right text-sm font-light text-[#cc9900]">
          Powered By Espresso Walnut Brownies 2.0
        </div>
      </div>
    </div>
  );
}
