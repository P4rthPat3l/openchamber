import { expect, test } from 'bun:test';
import type { UsageProviderGroup } from '@/components/usage/usageGroups';
import type { UsageWindow } from '@/types';
import { primaryGaugeRows, resolveGaugeAvailableWidth, resolveUsageGaugeDetail, selectGaugeProviders, tightestGaugeRows, usagePace } from './usageGauge';

const now = 1_800_000_000_000;
const window = (usedPercent: number | null, seconds = 18_000, remaining = seconds / 2): UsageWindow => ({
  usedPercent, remainingPercent: usedPercent === null ? null : 100 - usedPercent,
  windowSeconds: seconds, resetAfterSeconds: remaining, resetAt: now + remaining * 1000,
  resetAtFormatted: null, resetAfterFormatted: null,
});
const claude: UsageProviderGroup = {
  providerId: 'claude', providerName: 'Claude', status: null,
  rows: [
    { key: 'weekly', label: '7d', window: window(59, 604_800, 604_800 * 0.6) },
    { key: 'session', label: '5h', window: window(71, 18_000, 2_400) },
  ],
};
const codex: UsageProviderGroup = { providerId: 'codex', providerName: 'Codex', status: null, rows: [] };
const google: UsageProviderGroup = { providerId: 'google', providerName: 'Google', status: null, rows: [] };

test('AC-016: current provider precedes pins, duplicates appear once, others stay accessible', () => {
  const result = selectGaugeProviders([codex, google, claude], 'anthropic', ['codex', 'claude', 'missing']);
  expect(result.shown.map((group) => group.providerId)).toEqual(['claude', 'codex']);
  expect(result.others).toEqual([google]);
});

test('AC-011: a draft can use pins without a current provider', () => {
  expect(selectGaugeProviders([claude, codex], null, ['codex']).shown).toEqual([codex]);
  expect(selectGaugeProviders([claude], null, []).others).toEqual([claude]);
});

test('AC-017: full shows primary windows and tight keeps the most urgent one', () => {
  expect(primaryGaugeRows(claude).map((row) => row.key)).toEqual(['session', 'weekly']);
  expect(tightestGaugeRows(claude, now).map((row) => row.key)).toEqual(['weekly']);
  expect(claude.rows.map((row) => row.key)).toEqual(['weekly', 'session']);
});

test('AC-021: forecast requires elapsed time and meaningful usage', () => {
  expect(usagePace(window(null), now)).toEqual({ state: 'unknown' });
  expect(usagePace(window(2), now)).toEqual({ state: 'calm', usedPercent: 2 });
  expect(usagePace(window(70, 18_000, 17_000), now)).toEqual({ state: 'calm', usedPercent: 70 });
  expect(usagePace({ ...window(70), resetAt: null }, now)).toEqual({ state: 'calm', usedPercent: 70 });
  expect(usagePace({ ...window(70), resetAt: now - 1 }, now)).toEqual({ state: 'calm', usedPercent: 70 });
});

test('AC-021: forecast applies its thresholds and exhaustion time', () => {
  expect(usagePace(window(40), now)).toEqual({ state: 'calm', usedPercent: 40, projectedPercent: 80 });
  expect(usagePace(window(45), now)).toEqual({ state: 'tight', usedPercent: 45, projectedPercent: 90 });
  expect(usagePace(window(60), now)).toEqual({ state: 'over', usedPercent: 60, projectedPercent: 120, emptyAt: now + 6_000_000 });
  expect(usagePace(window(100), now)).toEqual({ state: 'out', usedPercent: 100 });
});

test('AC-017: a model-only provider keeps its two fullest windows', () => {
  const group = { ...claude, rows: [
    { key: 'a', label: 'daily', subtitle: 'Model A', window: window(10) },
    { key: 'b', label: 'daily', subtitle: 'Model B', window: window(30) },
    { key: 'c', label: 'daily', subtitle: 'Model C', window: window(20) },
  ] };
  expect(primaryGaugeRows(group).map((row) => row.key)).toEqual(['b', 'c']);
});

test('AC-017: tight mode considers urgent model windows outside the full summary', () => {
  const group: UsageProviderGroup = { ...claude, rows: [
    { key: 'a5h', label: '5h', subtitle: 'A', window: window(85, 18000, 1800) },
    { key: 'a7d', label: '7d', subtitle: 'A', window: window(80, 604800, 30240) },
    { key: 'b5h', label: '5h', subtitle: 'B', window: window(70, 18000, 900) },
    { key: 'b7d', label: '7d', subtitle: 'B', window: window(55, 604800, 362880) },
  ] };
  expect(primaryGaugeRows(group).map((row) => row.key)).toEqual(['a5h', 'a7d']);
  expect(tightestGaugeRows(group, now).map((row) => row.key)).toEqual(['b7d']);
});

test('AC-017: the centered cluster budgets the meters from the row less its end pills', () => {
  // Three segments: two gaps. Without the spend pill or the context pill there
  // is one gap fewer, because React renders no node for them.
  expect(resolveGaugeAvailableWidth(1000, 60, 50, 8)).toBe(874);
  expect(resolveGaugeAvailableWidth(1000, null, 50, 8)).toBe(942);
  expect(resolveGaugeAvailableWidth(1000, 60, null, 8)).toBe(932);
  expect(resolveGaugeAvailableWidth(1000, null, null, 8)).toBe(1000);
  expect(resolveGaugeAvailableWidth(40, 30, 30, 8)).toBe(0);
});

test('AC-017: the gauge uses measured text widths through all four details', () => {
  const widths = { full: 650, tight: 430, current: 190 };
  expect(resolveUsageGaugeDetail(700, widths)).toBe('full');
  expect(resolveUsageGaugeDetail(500, widths)).toBe('tight');
  expect(resolveUsageGaugeDetail(300, widths)).toBe('current');
  expect(resolveUsageGaugeDetail(100, widths)).toBe('icon');
});

test('AC-017: translations change which layout fits at the same column width', () => {
  expect(resolveUsageGaugeDetail(500, { full: 450, tight: 300, current: 140 })).toBe('full');
  expect(resolveUsageGaugeDetail(500, { full: 620, tight: 420, current: 210 })).toBe('tight');
});
