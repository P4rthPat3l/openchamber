import type { UsageLimitRow, UsageProviderGroup } from '@/components/usage/usageGroups';
import { resolveQuotaProviderId } from '@/components/chat/work-status/usageHeadline';
import type { UsageWindow } from '@/types';

export type UsagePace =
  | { state: 'unknown' }
  | { state: 'out'; usedPercent: number }
  | { state: 'calm'; usedPercent: number; projectedPercent?: number }
  | { state: 'tight'; usedPercent: number; projectedPercent: number }
  | { state: 'over'; usedPercent: number; projectedPercent: number; emptyAt: number };

/**
 * The forecast needs at least 20% of the window elapsed and 3% used: from less,
 * a straight-line projection swings too far to act on.
 */
export const usagePace = (window: UsageWindow, now: number): UsagePace => {
  const used = window.usedPercent;
  if (used === null || !Number.isFinite(used)) return { state: 'unknown' };
  const usedPercent = Math.min(100, Math.max(0, used));
  if (usedPercent >= 100) return { state: 'out', usedPercent };
  const duration = window.windowSeconds;
  const reset = window.resetAt;
  if (duration === null || !Number.isFinite(duration) || duration <= 0
    || reset === null || !Number.isFinite(reset) || reset <= now) return { state: 'calm', usedPercent };
  const elapsed = Math.max(0, 1 - (reset - now) / (duration * 1000));
  if (elapsed < 0.2 || usedPercent < 3) return { state: 'calm', usedPercent };
  const projectedPercent = usedPercent / elapsed;
  if (projectedPercent > 100) {
    return {
      state: 'over', usedPercent, projectedPercent,
      emptyAt: now + (100 - usedPercent) * elapsed * duration * 1000 / usedPercent,
    };
  }
  return projectedPercent > 85
    ? { state: 'tight', usedPercent, projectedPercent }
    : { state: 'calm', usedPercent, projectedPercent };
};

type GaugeProviders = { shown: UsageProviderGroup[]; others: UsageProviderGroup[] };

export const selectGaugeProviders = (
  groups: readonly UsageProviderGroup[],
  currentProviderId: string | null,
  pinned: readonly string[],
): GaugeProviders => {
  const ids = new Set([resolveQuotaProviderId(currentProviderId), ...pinned]);
  const shown: UsageProviderGroup[] = [];
  for (const id of ids) {
    const group = groups.find((entry) => entry.providerId === id);
    if (group) shown.push(group);
  }
  return { shown, others: groups.filter((group) => !ids.has(group.providerId)) };
};

/** Primary provider windows, or the two fullest selected model windows. */
export const primaryGaugeRows = (group: UsageProviderGroup): UsageLimitRow[] => {
  const providerRows = group.rows.filter((row) => !row.subtitle);
  if (providerRows.length > 0) {
    return providerRows.sort((a, b) => (a.window.windowSeconds ?? Infinity) - (b.window.windowSeconds ?? Infinity));
  }
  return [...group.rows].sort((a, b) => (b.window.usedPercent ?? -1) - (a.window.usedPercent ?? -1)).slice(0, 2);
};

const attention = { unknown: 0, calm: 1, tight: 2, over: 3, out: 4 } satisfies Record<UsagePace['state'], number>;

export const tightestGaugeRows = (group: UsageProviderGroup, now: number): UsageLimitRow[] => {
  const providerRows = group.rows.filter((row) => !row.subtitle);
  const rows = providerRows.length > 0 ? providerRows : [...group.rows];
  return rows.sort((a, b) => (
    attention[usagePace(b.window, now).state] - attention[usagePace(a.window, now).state]
    || (b.window.usedPercent ?? -1) - (a.window.usedPercent ?? -1)
  )).slice(0, 1);
};

export type UsageGaugeDetail = 'full' | 'tight' | 'current' | 'icon';

/**
 * The room the meters get in the centered cluster: the row's width less the
 * spend and context pills, and the gaps between the segments that render. A
 * missing pill contributes no width and no gap, because React leaves no node
 * for it.
 */
export const resolveGaugeAvailableWidth = (
  rowWidth: number,
  spendWidth: number | null,
  contextWidth: number | null,
  gap: number,
): number => {
  const segments = 1 + Number(spendWidth !== null) + Number(contextWidth !== null);
  const used = (spendWidth ?? 0) + (contextWidth ?? 0) + Math.max(0, segments - 1) * gap;
  return Math.max(0, rowWidth - used);
};

// Measure actual text, including translations and user font sizes. The extra
// pixel prevents subpixel rounding from needlessly hiding a fitting item.
export const resolveUsageGaugeDetail = (
  available: number,
  widths: Record<Exclude<UsageGaugeDetail, 'icon'>, number>,
): UsageGaugeDetail => {
  if (available + 1 >= widths.full) return 'full';
  if (available + 1 >= widths.tight) return 'tight';
  if (available + 1 >= widths.current) return 'current';
  return 'icon';
};
