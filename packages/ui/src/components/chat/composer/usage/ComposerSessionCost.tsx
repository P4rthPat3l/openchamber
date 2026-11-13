import React from 'react';
import { Popover } from '@base-ui/react/popover';
import { formatCost } from '@/components/chat/work-status/subagentCost';
import { useSubagentCostRollup } from '@/components/chat/work-status/useSubagentCostRollup';
import { dropdownMenuPopupClass } from '@/components/ui/dropdown-menu.styles';
import { GlassRedrawGuard } from '@/components/ui/glass-redraw-guard';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { UsageDetailRow } from './UsageDetailRow';

type Props = {
  /** The composer's session: a pinned chat column's own, not the live one. */
  sessionId: string | null;
  /** The line's own type scale, so the figure matches the meters beside it. */
  textClassName: string;
  /** The gauge reads this pill's width to budget the meters beside it. */
  ref?: React.Ref<HTMLSpanElement>;
};

/**
 * The line's session spend, first in its centered cluster: the rollup total,
 * and the session and subagent split behind it. It owns its subscription, so a
 * streamed step
 * that moves the cost re-renders this figure and not the composer around it.
 */
export const ComposerSessionCost: React.FC<Props> = ({ sessionId, textClassName, ref }) => {
  const { t, direction } = useI18n();
  const { totalCost, ownCost, subagentCost, subagentCount } = useSubagentCostRollup(sessionId);

  if (totalCost === null || totalCost <= 0) return null;

  // The split only says something once a subagent has spent: without one the
  // total is the session's own cost and the popover would restate it.
  const split = subagentCount > 0 && subagentCost > 0;
  const cost = formatCost(totalCost);
  const costLabel = t('contextUsage.tooltip.cost', { cost });

  return (
    <span ref={ref} data-usage-pill="" className="oc-surface-floating flex h-full shrink-0 items-center rounded-full px-1">
      <Popover.Root>
        <Popover.Trigger
          render={(
            <button
              type="button"
              aria-label={costLabel}
              aria-haspopup="dialog"
              className={cn(
                'inline-flex h-full items-center rounded-full px-1 tabular-nums text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                textClassName,
              )}
            />
          )}
        >
          {cost}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" align="start" sideOffset={8} collisionPadding={10} className="z-50" dir={direction}>
            <Popover.Popup
              role="dialog"
              aria-label={costLabel}
              className={cn(dropdownMenuPopupClass, 'flex w-[15rem] max-w-[calc(100vw-20px)] flex-col p-1.5')}
            >
              <GlassRedrawGuard />
              <div className="flex items-center justify-between gap-3 px-1.5 pb-1 pt-0.5 typography-micro">
                <span className="font-medium text-foreground">{t('contextUsage.mobile.cost')}</span>
                <span className="tabular-nums text-muted-foreground">{cost}</span>
              </div>
              {split ? (
                <dl className="flex flex-col gap-0.5 px-1.5 pb-0.5">
                  <UsageDetailRow label={t('chat.workStatus.section.session')} value={formatCost(ownCost)} />
                  <UsageDetailRow label={t('chat.workStatus.section.subagents')} value={formatCost(subagentCost)} />
                </dl>
              ) : null}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
};
