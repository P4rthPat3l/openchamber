import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { installHookTestDom } from '@/components/session/sidebar/test-utils/testDom';
import { I18nProvider } from '@/lib/i18n';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { useUsageProviderGroups } from './usageGroups';

test('AC-019: the footer retains every model window without changing compact consumers', async () => {
  const dom = installHookTestDom();
  const original = useQuotaStore.getState();
  const root = createRoot(dom.container);
  const seen: Record<string, string[]> = {};
  const window = { usedPercent: 40, remainingPercent: 60, windowSeconds: 18000, resetAfterSeconds: 9000, resetAt: 1_800_000_000_000, resetAtFormatted: null, resetAfterFormatted: null };
  const Probe = ({ scope }: { scope?: 'all' }) => {
    const groups = useUsageProviderGroups(scope);
    seen[scope ?? 'visible'] = groups.flatMap((group) => group.rows.map((row) => row.key));
    return null;
  };
  try {
    useQuotaStore.setState({ dropdownProviderIds: ['antigravity'], selectedModels: { antigravity: ['one'] }, refreshErrors: {}, extensionProviders: [], results: [{
      providerId: 'antigravity', providerName: 'Antigravity', configured: true, ok: true, fetchedAt: 1,
      usage: { windows: {}, models: { one: { windows: { '5h': window, '7d': window } }, two: { windows: { '5h': window, '7d': window } } } },
    }] });
    await act(async () => { root.render(<I18nProvider><Probe /><Probe scope="all" /></I18nProvider>); });
    expect(seen.visible).toEqual(['model-one-5h']);
    expect(seen.all).toEqual(['model-one-5h', 'model-one-7d', 'model-two-5h', 'model-two-7d']);
  } finally {
    await act(async () => root.unmount());
    useQuotaStore.setState(original, true);
    dom.restore();
  }
});
