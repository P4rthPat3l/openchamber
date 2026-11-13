import React from 'react';
import { Popover } from '@base-ui/react/popover';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { GlassRedrawGuard } from '@/components/ui/glass-redraw-guard';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { dropdownMenuPopupClass } from '@/components/ui/dropdown-menu.styles';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDurationTickerNow, useMinuteTickerNow } from '@/hooks/useDurationTicker';
import { useHeightMorphRef } from '@/lib/motion/useSizeMorph';
import { getCurrentIntlLocale, useI18n } from '@/lib/i18n';
import { compactQuotaValueLabel, formatQuotaResetLabel, formatQuotaResetShort, formatQuotaWindowValueLabel, resolveUsageTone } from '@/lib/quota';
import { formatPercent } from '@/lib/quota/utils';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { cn } from '@/lib/utils';
import { useQuotaAutoRefresh, useQuotaStore } from '@/stores/useQuotaStore';
import { useUIStore, type TimeFormatPreference } from '@/stores/useUIStore';
import type { UsageLimitRow, UsageProviderGroup } from '@/components/usage/usageGroups';
import { ComposerContextUsage } from './ComposerContextUsage';
import { ComposerSessionCost } from './ComposerSessionCost';
import { primaryGaugeRows, resolveGaugeAvailableWidth, resolveUsageGaugeDetail, selectGaugeProviders, tightestGaugeRows, usagePace, type UsageGaugeDetail, type UsagePace } from './usageGauge';
import { useComposerUsagePinsStore } from './composerUsagePins';

interface Props {
  groups: UsageProviderGroup[];
  currentProviderId: string | null;
  sessionId: string | null;
  directory: string | undefined;
  displayMode: 'usage' | 'remaining';
}

type UsageTone = 'safe' | 'warn' | 'critical';

// The meter takes Settings Usage's ramp, so one percentage reads the same
// colour everywhere: green below half, amber from half, red from eighty. A
// forecast may raise the tone, because a window that drains before it resets
// needs attention while its figure is still low, but it never lowers it.
const toneOf = (pace: UsagePace): UsageTone | null => {
  if (pace.state === 'unknown') return null;
  if (pace.state === 'out' || pace.state === 'over') return 'critical';
  const figure = resolveUsageTone(pace.usedPercent);
  if (pace.state === 'tight') return figure === 'critical' ? 'critical' : 'warn';
  return figure;
};

const toneFill = {
  safe: 'var(--status-success)',
  warn: 'var(--status-warning)',
  critical: 'var(--status-error)',
} satisfies Record<UsageTone, string>;

// The figure stays neutral while the window is on pace, as Settings Usage
// keeps it: the bar carries the tone, and only a forecast or an empty window
// turns the number itself amber or red.
const valueColor = (pace: UsagePace, metric: string): string => {
  if (metric === '-') return 'var(--muted-foreground)';
  if (pace.state === 'over' || pace.state === 'out') return 'var(--status-error-text)';
  if (pace.state === 'tight') return 'var(--status-warning-text)';
  return 'var(--foreground)';
};

/** The forecast percentage when the pace has one, whatever its state. */
const forecastOf = (pace: UsagePace): number | null => {
  if (pace.state === 'calm') return pace.projectedPercent ?? null;
  if (pace.state === 'tight' || pace.state === 'over') return pace.projectedPercent;
  return null;
};

type TooltipLine = { text: string; strong?: true };

/**
 * Hover detail for a reading. It uses the app's tooltip, not the browser's
 * title box, so the composer's meters read like every other control.
 */
const UsageTooltip: React.FC<{ lines: TooltipLine[]; children: React.ReactElement }> = ({ lines, children }) => {
  if (lines.length === 0) return children;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="max-w-[min(320px,calc(100vw-24px))] whitespace-normal break-words text-start">
        {lines.map((line, index) => <p key={index} className={line.strong ? 'font-medium' : undefined}>{line.text}</p>)}
      </TooltipContent>
    </Tooltip>
  );
};

const windowLabel = (row: UsageLimitRow): string => {
  const seconds = row.window.windowSeconds;
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return row.subtitle ? `${row.label} ${row.subtitle}` : row.label;
  const unit = seconds < 3600 ? 'minute' : seconds < 172800 ? 'hour' : 'day';
  const divisor = unit === 'minute' ? 60 : unit === 'hour' ? 3600 : 86400;
  const label = new Intl.NumberFormat(getCurrentIntlLocale(), { style: 'unit', unit, unitDisplay: 'narrow', maximumFractionDigits: 0 }).format(seconds / divisor);
  return row.subtitle ? `${label} ${row.subtitle}` : label;
};

/** The track is the context ring's (muted text at 30%), so the two meters read as one family. */
const QuotaBar: React.FC<{ pace: UsagePace; percent: number | null; label: string; remaining: boolean; className: string }> = ({ pace, percent, label, remaining, className }) => {
  if (percent === null) return <span />;
  // The striped part runs from where the window is now to where the forecast
  // puts it when it resets.
  const projection = pace.state === 'over' || pace.state === 'tight'
    ? { projected: Math.min(100, pace.projectedPercent), used: pace.usedPercent }
    : null;
  const tone = toneOf(pace);
  return (
    <span role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      className={cn('relative block min-w-0 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--muted-foreground)_30%,transparent)]', className)}
      style={{ color: tone === null ? 'var(--muted-foreground)' : toneFill[tone] }}>
      <span className="absolute inset-y-0 inset-s-0 rounded-full bg-current" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      {projection !== null ? (
        <span className="absolute inset-y-0" style={{
          insetInlineStart: `${remaining ? 100 - projection.projected : projection.used}%`,
          width: `${Math.max(0, projection.projected - projection.used)}%`,
          backgroundImage: 'repeating-linear-gradient(90deg,transparent 0 2px,color-mix(in srgb,currentColor 60%,transparent) 2px 3px)',
        }} />
      ) : null}
    </span>
  );
};

/**
 * One window as the gauge and the folded provider rows show it: the label, a
 * short bar and the figure, at the text size of the row it sits in.
 */
const MiniWindow: React.FC<{
  group: UsageProviderGroup;
  row: UsageLimitRow;
  now: number;
  displayMode: Props['displayMode'];
  timeFormatPreference: TimeFormatPreference;
}> = ({ group, row, now, displayMode, timeFormatPreference }) => {
  const { t } = useI18n();
  const percent = displayMode === 'remaining' ? row.window.remainingPercent : row.window.usedPercent;
  const pace = usagePace(row.window, now);
  const metric = compactQuotaValueLabel(formatQuotaWindowValueLabel(row.window, percent, t));
  const lines: TooltipLine[] = [
    { text: group.providerName, strong: true },
    { text: row.subtitle ? `${row.label} · ${row.subtitle}` : row.label },
    { text: `${t('header.services.used')}: ${formatPercent(row.window.usedPercent)}` },
    { text: `${t('header.services.remaining')}: ${formatPercent(row.window.remainingPercent)}` },
  ];
  if (row.window.resetAt !== null) lines.push({ text: formatQuotaResetLabel(row.window.resetAt, null, timeFormatPreference) });
  const forecast = forecastOf(pace);
  if (forecast !== null) {
    lines.push({ text: t('settings.usage.pace.predictionTooltip', { prediction: `${Math.round(forecast)}%` }) });
  }
  if (group.status) lines.push({ text: group.status });
  return (
    <UsageTooltip lines={lines}>
      <span className="inline-grid min-w-0 shrink-0 grid-cols-[auto_1.5rem_auto] items-center gap-1 tabular-nums">
        <span className="max-w-24 truncate text-muted-foreground">{windowLabel(row)}</span>
        <QuotaBar pace={pace} percent={percent} remaining={displayMode === 'remaining'} label={`${group.providerName} ${row.subtitle ?? row.label}`} className="h-1" />
        <span dir="auto" className="text-end" style={{ color: valueColor(pace, metric) }}>{metric}</span>
      </span>
    </UsageTooltip>
  );
};

// The trigger is the composer's densest reading: 11px on desktop, 13px where
// the app raises type for touch widths, matching the compact status pills.
const meterTextClass = 'text-[0.6875rem] leading-[1.1] [@media(max-width:1024px)]:text-[0.8125rem]';

const MiniMeters: React.FC<{
  groups: readonly UsageProviderGroup[];
  tight: boolean;
  now: number;
  displayMode: Props['displayMode'];
  timeFormatPreference: TimeFormatPreference;
}> = ({ groups, tight, now, displayMode, timeFormatPreference }) => {
  // Providers are set apart by the usage line's own middle dot.
  return <span className={cn('inline-flex items-center gap-2', meterTextClass)}>{groups.map((group, index) => (
    <React.Fragment key={group.providerId}>
      {index > 0 ? <span aria-hidden className="shrink-0">·</span> : null}
      <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
        <span className="text-foreground">{group.providerName}</span>
        {(tight ? tightestGaugeRows(group, now) : primaryGaugeRows(group)).map((row) => (
          <MiniWindow key={row.key} group={group} row={row} now={now} displayMode={displayMode} timeFormatPreference={timeFormatPreference} />
        ))}
        {group.rows.length === 0 ? (
          <UsageTooltip lines={group.status ? [{ text: group.status }] : []}>
            <span className="inline-flex"><Icon name="error-warning" className="size-3.5 text-status-warning" /></span>
          </UsageTooltip>
        ) : null}
      </span>
    </React.Fragment>
  ))}</span>;
};

/**
 * One window row of the popover. The provider's body is one grid, so labels,
 * bars, figures and reset times line up across rows.
 */
const GaugeWindow: React.FC<{
  row: UsageLimitRow;
  displayMode: Props['displayMode'];
  now: number;
  timeFormatPreference: TimeFormatPreference;
}> = ({ row, displayMode, now, timeFormatPreference }) => {
  const { t } = useI18n();
  const pace = usagePace(row.window, now);
  const percent = displayMode === 'remaining' ? row.window.remainingPercent : row.window.usedPercent;
  const metric = formatQuotaWindowValueLabel(row.window, percent, t);
  const reset = formatQuotaResetLabel(row.window.resetAt, row.window.resetAfterFormatted ?? row.window.resetAtFormatted, timeFormatPreference);
  const untilReset = row.window.resetAt === null ? null : (row.window.resetAt - now) / 1000;
  const unit = untilReset !== null && untilReset >= 86400 ? 'day' : untilReset !== null && untilReset >= 3600 ? 'hour' : 'minute';
  const relativeReset = untilReset !== null && untilReset > 0
    ? new Intl.RelativeTimeFormat(getCurrentIntlLocale(), { style: 'narrow', numeric: 'always' }).format(Math.max(1, Math.round(untilReset / (unit === 'day' ? 86400 : unit === 'hour' ? 3600 : 60))), unit)
    : reset;
  const emptyTime = pace.state === 'over' && new Date(pace.emptyAt).toDateString() !== new Date(now).toDateString()
    ? new Date(pace.emptyAt).toLocaleDateString(getCurrentIntlLocale(), { weekday: 'short' })
    : pace.state === 'over' ? formatQuotaResetShort(pace.emptyAt, null, timeFormatPreference, new Date(now)) : '';
  const time = pace.state === 'over'
    ? t('chat.composerUsage.emptyAt', { time: emptyTime })
    : relativeReset;
  // The cell names the forecast when one exists, so its detail is the empty
  // time, not the reset the window still has.
  const timeDetail = pace.state === 'over'
    ? formatQuotaResetLabel(pace.emptyAt, null, timeFormatPreference)
    : reset;
  const forecast = forecastOf(pace);
  const title = forecast === null
    ? reset
    : t('settings.usage.pace.predictionTooltip', { prediction: `${Math.round(forecast)}%` });
  const label = windowLabel(row);
  return (
    <>
      <UsageTooltip lines={[{ text: label }]}>
        <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      </UsageTooltip>
      <QuotaBar pace={pace} percent={percent} remaining={displayMode === 'remaining'} label={row.subtitle ?? row.label} className="h-1" />
      <UsageTooltip lines={[{ text: title }]}>
        <span dir="auto" className="whitespace-nowrap text-end font-medium" style={{ color: valueColor(pace, metric) }}>{metric}</span>
      </UsageTooltip>
      <UsageTooltip lines={timeDetail ? [{ text: timeDetail }] : []}>
        <span className={cn('min-w-0 truncate text-end text-muted-foreground', pace.state === 'over' && 'text-[var(--status-error-text)]')}>{time}</span>
      </UsageTooltip>
    </>
  );
};

const UsagePopoverBody: React.FC<{
  shown: UsageProviderGroup[];
  others: UsageProviderGroup[];
  displayMode: Props['displayMode'];
  manualAt: number | null;
  onRefresh: () => void;
  onSettings: () => void;
  pinError: boolean;
  onTogglePin: (providerId: string) => void;
}> = ({ shown, others, displayMode, manualAt, onRefresh, onSettings, pinError, onTogglePin }) => {
  const { t } = useI18n();
  const pinned = useUIStore((state) => state.composerUsagePinnedProviders);
  const pinPending = useComposerUsagePinsStore((state) => state.saving);
  const timeFormatPreference = useUIStore((state) => state.timeFormatPreference);
  const refreshing = useQuotaStore((state) => state.isLoading);
  const minuteNow = useMinuteTickerNow(true);
  const cooldownNow = useDurationTickerNow(manualAt !== null && Date.now() - manualAt < 30_000);
  const cooling = manualAt !== null && cooldownNow - manualAt < 30_000;
  useQuotaAutoRefresh(true, true);

  // A provider's header row: the fold, then its pin. The row takes the hover
  // fill as one piece, and an unpinned pin waits for the row's hover or focus,
  // or stays shown where nothing can hover.
  // The name keeps its width and the preview takes what is left: meters that
  // do not fit wrap onto a clipped second line, so only whole meters show.
  const section = (group: UsageProviderGroup, expanded: boolean) => {
    const isPinned = pinned.includes(group.providerId);
    const pinLabel = t(isPinned ? 'chat.composerUsage.unpin' : 'chat.composerUsage.pin', { provider: group.providerName });
    return (
      <Collapsible key={group.providerId} defaultOpen={expanded}>
        <div className="group/row flex min-w-0 items-center rounded-lg pe-1 hover:bg-interactive-hover has-[:focus-visible]:bg-interactive-hover">
          <CollapsibleTrigger className="group min-h-7 min-w-0 flex-1 gap-3 py-0 pe-1 ps-2 hover:bg-transparent [@media(pointer:coarse)]:min-h-9">
            <span className="flex max-w-full shrink-0 items-center gap-1.5 typography-micro font-medium">
              <Icon name="arrow-right-s" className="size-3 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-90 rtl:group-aria-expanded:-rotate-90" />
              <UsageTooltip lines={[{ text: group.providerName }]}>
                <span className="min-w-0 truncate">{group.providerName}</span>
              </UsageTooltip>
              {group.planLabel ? <span className="oc-tile-inset shrink-0 rounded px-1.5 typography-micro text-muted-foreground">{group.planLabel}</span> : null}
              {/* Open, the header names the account; folded, that room goes to the preview. */}
              {group.accountLabel ? (
                <UsageTooltip lines={[{ text: group.accountLabel }]}>
                  <span dir="auto" className="hidden min-w-0 shrink-[4] truncate typography-micro text-muted-foreground group-aria-expanded:block">{group.accountLabel}</span>
                </UsageTooltip>
              ) : null}
            </span>
            {/* A model-only provider has no single reading to fold into the
                header: two windows of different models would need their names,
                which do not fit beside the provider. */}
            {group.rows.some((row) => !row.subtitle) ? (
              <span className="flex h-[1lh] min-w-0 flex-wrap items-center justify-end gap-x-2.5 overflow-hidden typography-micro group-aria-expanded:hidden max-[479px]:hidden">
                {primaryGaugeRows(group).filter((row) => !row.subtitle).slice(0, 2).map((row) => (
                  <MiniWindow key={row.key} group={group} row={row} now={minuteNow} displayMode={displayMode} timeFormatPreference={timeFormatPreference} />
                ))}
              </span>
            ) : group.rows.length === 0 && group.status ? (
              <UsageTooltip lines={[{ text: group.status }]}>
                <span dir="auto" className="min-w-0 truncate typography-micro text-muted-foreground group-aria-expanded:hidden max-[479px]:hidden">{group.status}</span>
              </UsageTooltip>
            ) : null}
          </CollapsibleTrigger>
          <span className={cn('inline-flex shrink-0 transition-opacity group-hover/row:opacity-100 has-[:focus-visible]:opacity-100 [@media(hover:none)]:opacity-100', isPinned ? 'opacity-100' : 'opacity-0')}>
            <UsageTooltip lines={[{ text: pinLabel }]}>
              <Button variant="ghost" size="xs" disabled={pinPending} aria-pressed={isPinned}
                className="w-6 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground has-[>svg]:px-0 [@media(pointer:coarse)]:min-h-9 [@media(pointer:coarse)]:min-w-9"
                aria-label={pinLabel}
                onClick={() => { onTogglePin(group.providerId); }}>
                <Icon name={isPinned ? 'pushpin-2-fill' : 'pushpin-2'} className="size-3.5" />
              </Button>
            </UsageTooltip>
          </span>
        </div>
        <CollapsibleContent>
          <div className="grid grid-cols-[fit-content(7rem)_minmax(3rem,1fr)_auto_auto] items-center gap-x-2.5 gap-y-1 pb-1.5 pe-2 ps-[1.625rem] pt-0 typography-micro tabular-nums max-[640px]:grid-cols-[fit-content(5.5rem)_minmax(2.5rem,1fr)_auto_auto] max-[640px]:gap-x-2">
            {group.rows.map((row) => <GaugeWindow key={row.key} row={row} displayMode={displayMode} now={minuteNow} timeFormatPreference={timeFormatPreference} />)}
            {group.status ? <p dir="auto" className="col-span-full text-muted-foreground">{group.status}</p> : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const iconButtonClass = 'w-6 px-0 text-muted-foreground has-[>svg]:px-0 [@media(pointer:coarse)]:min-h-9 [@media(pointer:coarse)]:min-w-9';
  // The header's end padding adds the 6px gutter the list's scroller keeps, so
  // its buttons line up with the pins below.
  return <>
    <div className="flex min-h-7 items-center gap-2 pe-2.5 ps-2">
      <span className="shrink-0 typography-meta font-semibold text-foreground">{t('settings.page.usage.title')}</span>
      {/* The pin save's status line, kept in the header so it reserves no row of its own. */}
      <span role="status" className="min-w-0 flex-1 truncate typography-micro text-[var(--status-error-text)]">
        {pinError ? t('chat.composerUsage.pinFailed') : null}
      </span>
      <UsageTooltip lines={[{ text: t('settings.usage.sidebar.actions.refreshAria') }]}>
        <Button variant="ghost" size="xs" disabled={refreshing || cooling} aria-label={t('settings.usage.sidebar.actions.refreshAria')}
          className={iconButtonClass} onClick={onRefresh}>
          <Icon name={cooling && !refreshing ? 'check' : 'refresh'} className={cn('size-3.5', refreshing && 'animate-spin')} />
        </Button>
      </UsageTooltip>
      <UsageTooltip lines={[{ text: t('chat.composerUsage.settings') }]}>
        <Button variant="ghost" size="xs" aria-label={t('chat.composerUsage.settings')} className={cn(iconButtonClass, '-ms-1.5')} onClick={onSettings}>
          <Icon name="settings-3" className="size-3.5" />
        </Button>
      </UsageTooltip>
    </div>
    <ScrollableOverlay fillContainer={false} disableHorizontal outerClassName="min-h-0" className="max-h-[min(30rem,60dvh)]">
      <div className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--foreground)_14%,transparent)]">
        {shown.map((group) => section(group, true))}
        {shown.length === 0 ? others.map((group) => section(group, false)) : others.length > 0 ? (
          <Collapsible className="mt-1 flex flex-col gap-0.5">
            <CollapsibleTrigger className="group min-h-7 justify-start gap-1.5 py-0 ps-2 typography-micro font-medium text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-9">
              <Icon name="arrow-right-s" className="size-3 shrink-0 transition-transform group-aria-expanded:rotate-90 rtl:group-aria-expanded:-rotate-90" />
              {t('chat.composerUsage.otherProviders', { count: others.length })}
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col divide-y divide-[color-mix(in_srgb,var(--foreground)_14%,transparent)]">{others.map((group) => section(group, false))}</CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </ScrollableOverlay>
  </>;
};

export const ComposerUsageGauge: React.FC<Props> = ({ groups, currentProviderId, sessionId, directory, displayMode }) => {
  const { t, direction } = useI18n();
  const pinned = useUIStore((state) => state.composerUsagePinnedProviders);
  const timeFormatPreference = useUIStore((state) => state.timeFormatPreference);
  // Without a quota provider the line still carries spend and context, so the
  // meters and their measuring copies are the only parts that drop out.
  const hasQuota = groups.length > 0;
  const { shown, others } = selectGaugeProviders(groups, currentProviderId, pinned);
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<UsageGaugeDetail>('full');
  const [manualAt, setManualAt] = React.useState<number | null>(null);
  const [pinError, setPinError] = React.useState(false);
  const host = React.useRef<HTMLSpanElement>(null);
  // The cluster is centered, so the meters' room is the row less the two end
  // pills and the gaps between the rendered segments. The middle cell cannot
  // report it: the meters size that cell.
  const spend = React.useRef<HTMLSpanElement>(null);
  const context = React.useRef<HTMLSpanElement>(null);
  // A pill mounts only once it has data, after the first measure. Its presence
  // is part of the budget (a missing pill also removes a gap), so the ref
  // callbacks re-run the measurement when a pill appears or leaves.
  const [spendMounted, setSpendMounted] = React.useState(false);
  const [contextMounted, setContextMounted] = React.useState(false);
  const spendRef = React.useCallback((node: HTMLSpanElement | null) => {
    spend.current = node;
    setSpendMounted(node !== null);
  }, []);
  const contextRef = React.useCallback((node: HTMLSpanElement | null) => {
    context.current = node;
    setContextMounted(node !== null);
  }, []);
  const full = React.useRef<HTMLSpanElement>(null);
  const tight = React.useRef<HTMLSpanElement>(null);
  const current = React.useRef<HTMLSpanElement>(null);
  const popup = useHeightMorphRef();
  const now = useMinuteTickerNow(true);

  const togglePin = async (providerId: string): Promise<void> => {
    const runtimeKey = getRuntimeKey();
    setPinError(false);
    const result = await useComposerUsagePinsStore.getState().toggle(providerId);
    if (runtimeKey !== getRuntimeKey()) return;
    setPinError(result === 'failed');
  };

  React.useLayoutEffect(() => {
    const measure = (): void => {
      if (!host.current || !full.current || !tight.current || !current.current) return;
      const gap = Number.parseFloat(getComputedStyle(host.current).columnGap) || 0;
      const available = resolveGaugeAvailableWidth(
        host.current.getBoundingClientRect().width,
        spend.current?.getBoundingClientRect().width ?? null,
        context.current?.getBoundingClientRect().width ?? null,
        gap,
      );
      setDetail(resolveUsageGaugeDetail(available, {
        full: full.current.getBoundingClientRect().width,
        tight: tight.current.getBoundingClientRect().width,
        current: current.current.getBoundingClientRect().width,
      }));
    };
    measure();
    if (!('ResizeObserver' in globalThis)) return;
    const observer = new ResizeObserver(measure);
    for (const node of [host.current, spend.current, context.current, full.current, tight.current, current.current]) {
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [spendMounted, contextMounted, hasQuota]);

  const meters = (level: Exclude<UsageGaugeDetail, 'icon'>) => (
    <MiniMeters groups={level === 'current' ? shown.slice(0, 1) : shown} tight={level !== 'full'} now={now} displayMode={displayMode} timeFormatPreference={timeFormatPreference} />
  );
  // The meters carry their own text size: the xs button's would win over one set here.
  // Only the live trigger is capped: the hidden copies are measured inside a
  // zero-width box, where a max-width of 100% would clamp them to their padding.
  const meterButtonClass = 'inline-flex w-max items-center rounded-full px-2 font-normal text-muted-foreground';
  const triggerClass = cn('h-full max-w-full oc-surface-floating', meterButtonClass);
  // The hidden copies sit in a zero-height box, so they carry their own height
  // and only their width is read.
  const measureClass = cn('h-5', meterButtonClass);
  return (
    <span ref={host} className="relative flex h-5 w-full min-w-9 items-center justify-center gap-2 [@media(pointer:coarse)]:min-h-9" data-usage-gauge-detail={detail}>
      {/* One centered cluster of three separate surfaces: spend, then the
          quota meters, then the context reading. Each owns its background, so
          none of them reads as part of its neighbour. */}
      <ComposerSessionCost ref={spendRef} sessionId={sessionId} textClassName={meterTextClass} />
      {hasQuota ? <span data-usage-pill="" className="flex h-full min-w-0 items-center">
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger render={<Button variant="ghost" size="xs" className={cn(triggerClass, 'data-[popup-open]:bg-interactive-hover')} aria-label={t('chat.composerUsage.aria')} aria-haspopup="dialog" />}>
            {shown.length === 0 || detail === 'icon' ? <Icon name="speed-up" className="size-3.5" /> : meters(detail)}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side="top" align="center" sideOffset={8} collisionPadding={10} className="z-50" dir={direction}>
              <Popover.Popup ref={popup} role="dialog" aria-label={t('settings.page.usage.title')} className={cn(dropdownMenuPopupClass, 'flex w-[22.5rem] max-w-[calc(100vw-20px)] flex-col overflow-hidden p-1.5 max-[1024px]:w-[26rem]')}>
                <GlassRedrawGuard />
                {open ? <UsagePopoverBody shown={shown} others={others} displayMode={displayMode} manualAt={manualAt}
                  pinError={pinError} onTogglePin={(providerId) => { void togglePin(providerId); }}
                  onRefresh={() => { setManualAt(Date.now()); void useQuotaStore.getState().fetchAllQuotas(); }}
                  onSettings={() => { setOpen(false); useUIStore.getState().openSettingsAt('usage'); }} /> : null}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </span> : null}
      <ComposerContextUsage ref={contextRef} sessionId={sessionId} directory={directory} textClassName={meterTextClass} />
      {hasQuota ? <span aria-hidden="true" className="pointer-events-none invisible absolute inset-s-0 top-0 size-0 overflow-hidden">
        <span ref={full} className={measureClass}>{meters('full')}</span>
        <span ref={tight} className={measureClass}>{meters('tight')}</span>
        <span ref={current} className={measureClass}>{meters('current')}</span>
      </span> : null}
    </span>
  );
};
