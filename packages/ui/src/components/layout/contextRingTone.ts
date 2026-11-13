import { resolveUsageTone } from '@/lib/quota';

/**
 * The context ring's arc tone: neutral until the warning threshold, as the
 * Session card's meter, because green there means finished and a context in
 * use is not. The header button and the composer line paint the same arc.
 */
const RING_TONE = {
  safe: 'var(--muted-foreground)',
  warn: 'var(--status-warning)',
  critical: 'var(--status-error)',
} as const;

export const contextRingTone = (percent: number): string => RING_TONE[resolveUsageTone(Math.round(percent))];
