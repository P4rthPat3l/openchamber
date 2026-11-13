import React from 'react';
import { Popover } from '@base-ui/react/popover';
import { ContextRing } from '@/components/layout/ContextRailUsage';
import { contextRingTone } from '@/components/layout/contextRingTone';
import { useContextReading } from '@/components/layout/useCurrentContextReading';
import { dropdownMenuPopupClass } from '@/components/ui/dropdown-menu.styles';
import { GlassRedrawGuard } from '@/components/ui/glass-redraw-guard';
import { useI18n } from '@/lib/i18n';
import { formatTokens } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import { UsageDetailRow } from './UsageDetailRow';

type ContextFill = { state: 'measured'; totalTokens: number } | { state: 'compacted' };

type Props = {
  /** The composer's session: a pinned chat column's own, not the live one. */
  sessionId: string | null;
  directory: string | undefined;
  /** The line's own type scale, so the reading matches the meters beside it. */
  textClassName: string;
  /** The gauge reads this pill's width to budget the meters beside it. */
  ref?: React.Ref<HTMLSpanElement>;
};

const percentOf = (fill: ContextFill, limit: number): number | null => (
  fill.state === 'measured' ? (fill.totalTokens / limit) * 100 : null
);

const percentLabel = (percent: number | null): string => (
  percent === null ? '—' : `${Math.min(percent, 999).toFixed(1)}%`
);

/** The popover body: the fill and the readings that belong to it. */
const ContextUsageBody: React.FC<{ fill: ContextFill; limit: number; cacheHit: number | null }> = ({ fill, limit, cacheHit }) => {
  const { t } = useI18n();
  const percent = percentOf(fill, limit);
  const measured = fill.state === 'measured';
  const rows = [
    measured ? { label: t('contextUsage.mobile.usedTokens'), value: formatTokens(fill.totalTokens) } : null,
    { label: t('contextUsage.mobile.contextLimit'), value: formatTokens(limit) },
    cacheHit === null ? null : { label: t('contextSidebar.tokens.cacheHit'), value: `${cacheHit.toFixed(1)}%` },
  ].filter((row) => row !== null);

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1.5 pb-1 pt-0.5 typography-micro">
        <span className="font-medium text-foreground">{t('contextUsage.mobile.title')}</span>
        <span className="tabular-nums text-muted-foreground">{percentLabel(percent)}</span>
      </div>
      <span
        role="meter"
        aria-label={t('contextUsage.aria.label')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
        className="mx-1.5 mb-1.5 block h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--muted-foreground)_30%,transparent)]"
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${percent === null ? 0 : Math.max(0, Math.min(100, percent))}%`,
            backgroundColor: percent === null ? undefined : contextRingTone(percent),
          }}
        />
      </span>
      <dl className="flex flex-col gap-0.5 px-1.5 pb-0.5">
        {rows.map((row) => <UsageDetailRow key={row.label} label={row.label} value={row.value} />)}
      </dl>
      {measured ? null : <p className="px-1.5 pt-1 typography-micro text-muted-foreground">{t('contextUsage.compacted.description')}</p>}
    </>
  );
};

/**
 * The line's context reading, last in its centered cluster: the header's ring
 * and figure, opening a popover with the session's fill instead of the full
 * context panel.
 */
export const ComposerContextUsage: React.FC<Props> = ({ sessionId: composerSessionId, directory, textClassName, ref }) => {
  const { t, direction } = useI18n();
  const { sessionId, fill, cacheHit, limit } = useContextReading(composerSessionId, directory);
  const [open, setOpen] = React.useState(false);

  if (!sessionId || !fill) return null;

  const percent = percentOf(fill, limit);

  return (
    <span ref={ref} data-usage-pill="" className="oc-surface-floating flex h-full shrink-0 items-center rounded-full px-1">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={(
            <button
              type="button"
              aria-label={t('contextUsage.aria.label')}
              aria-haspopup="dialog"
              className={cn(
                'inline-flex h-full items-center gap-1 rounded-full px-1 pe-1.5 font-normal tabular-nums text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:text-foreground',
                textClassName,
              )}
            />
          )}
        >
          <ContextRing
            percent={percent ?? 0}
            arcColor={percent === null ? undefined : contextRingTone(percent)}
            className="size-3 [@media(max-width:1024px)]:size-3.5"
          />
          <span dir="ltr">{percentLabel(percent)}</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" align="end" sideOffset={8} collisionPadding={10} className="z-50" dir={direction}>
            <Popover.Popup
              role="dialog"
              aria-label={t('contextUsage.aria.label')}
              className={cn(dropdownMenuPopupClass, 'flex w-[15rem] max-w-[calc(100vw-20px)] flex-col p-1.5')}
            >
              <GlassRedrawGuard />
              {open ? <ContextUsageBody fill={fill} limit={limit} cacheHit={cacheHit} /> : null}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
};
