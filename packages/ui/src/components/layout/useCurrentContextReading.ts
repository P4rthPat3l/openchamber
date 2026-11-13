import { computeLastReplyCacheHit, DEFAULT_CONTEXT_LIMIT } from '@/components/chat/work-status/contextUsage';
import { useContextWindowLimits } from '@/hooks/useContextWindowLimits';
import type { Message } from '@/lib/opencode/model';
import { findLatestContextFill } from '@/stores/utils/tokenUtils';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionMessagesSelector } from '@/sync/sync-context';

type ContextFillReading = { state: 'measured'; totalTokens: number } | { state: 'compacted' } | null;

type ContextReading = {
  fill: ContextFillReading;
  /** Share of the last reply's prompt that the provider served from its cache. */
  cacheHit: number | null;
};

const selectContextFill = (messages: Message[]): ContextFillReading => {
  const fill = findLatestContextFill(messages);
  if (!fill) return null;
  return fill.state === 'measured' ? { state: 'measured', totalTokens: fill.totalTokens } : { state: 'compacted' };
};

const isSameContextFill = (a: ContextFillReading, b: ContextFillReading): boolean => {
  if (a === null || b === null) return a === b;
  if (a.state !== b.state) return false;
  return a.state === 'compacted' || (b.state === 'measured' && a.totalTokens === b.totalTokens);
};

const selectContextReading = (messages: Message[]): ContextReading => ({
  fill: selectContextFill(messages),
  cacheHit: computeLastReplyCacheHit(messages),
});

const isSameContextReading = (a: ContextReading, b: ContextReading): boolean => (
  isSameContextFill(a.fill, b.fill) && a.cacheHit === b.cacheHit
);

/**
 * A session's context reading: how full the window is and how much of the
 * last reply came from the provider's cache. A streamed step replaces the
 * message list many times while both figures stay the same, so callers
 * re-render only when one of them moves.
 */
export const useContextReading = (sessionId: string | null, directory: string | undefined) => {
  const reading = useSessionMessagesSelector(sessionId ?? '', directory, selectContextReading, isSameContextReading);
  const { context } = useContextWindowLimits(sessionId, directory);
  const limit = context > 0 ? context : DEFAULT_CONTEXT_LIMIT;
  return { sessionId, fill: reading.fill, cacheHit: reading.cacheHit, limit };
};

/** The live session's reading, for the header and the rail. */
export const useCurrentContextReading = () => {
  const sessionId = useSessionUIStore((state) => state.currentSessionId);
  const directory = useSessionUIStore((state) => state.currentSessionDirectory) ?? undefined;
  return useContextReading(sessionId, directory);
};
