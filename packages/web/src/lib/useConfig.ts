import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api';

/** Used until the server answers, and if it never does. */
const FALLBACK_TITLE = 'Time Passed Since';

/**
 * Runtime settings, fetched rather than baked in at build time so a single
 * published image can be deployed by anyone and say what they are counting.
 *
 * Re-checked every few minutes so a title change reaches a wall display that
 * nobody is going to walk over and reload.
 */
export function useConfig(): { pageTitle: string } {
  const { data } = useQuery({
    queryKey: ['config'],
    queryFn: api.config,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const pageTitle = data?.pageTitle ?? FALLBACK_TITLE;

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  return { pageTitle };
}
