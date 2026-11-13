import React from 'react';
import { useUsageProviderGroups } from '@/components/usage/usageGroups';
import { useQuotaAutoRefresh, useQuotaStore } from '@/stores/useQuotaStore';
import { ComposerUsageGauge } from './ComposerUsageGauge';

type Props = {
  providerId: string | null;
  /** The composer's session and directory: a pinned chat column's own, not the live one. */
  sessionId: string | null;
  directory: string | undefined;
};

/**
 * The composer's usage line: the session's spend, the current provider's quota
 * meters with the Usage popover behind them, and the context reading.
 *
 * It owns its subscriptions, so neither typing nor a streamed step re-renders
 * the composer around it. Each pill mounts on its own data, so the row hides
 * through CSS while none has mounted, and the composer's padding follows the
 * same `data-usage-pill` marker instead of a prop it would re-render for.
 */
const ComposerUsageLineView: React.FC<Props> = ({ providerId, sessionId, directory }) => {
  const groups = useUsageProviderGroups('all');
  const displayMode = useQuotaStore((state) => state.displayMode);
  const runtimeKey = useQuotaStore((state) => state.loadedRuntimeKey);

  // Without demand the quota store stops refreshing, so the line would sit
  // empty whenever the Work status panel is off.
  useQuotaAutoRefresh(groups.length > 0 || runtimeKey === null, true);

  return (
    <div data-composer-usage-line="" className="hidden min-h-5 min-w-0 items-center justify-center pt-1 has-[[data-usage-pill]]:flex">
      <ComposerUsageGauge key={runtimeKey} groups={groups} currentProviderId={providerId} sessionId={sessionId} directory={directory} displayMode={displayMode} />
    </div>
  );
};

/** Memoized: the composer re-renders on every keystroke, and nothing here depends on the draft text. */
export const ComposerUsageLine = React.memo(ComposerUsageLineView);
