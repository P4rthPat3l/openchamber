import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { UsageProviderGroup } from '@/components/usage/usageGroups';

const browser = new Window({ url: 'http://localhost' });
const descriptors = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: browser,
  document: browser.document,
  Event: browser.Event,
  CustomEvent: browser.CustomEvent,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLButtonElement: browser.HTMLButtonElement,
  MouseEvent: browser.MouseEvent,
  KeyboardEvent: browser.KeyboardEvent,
  FocusEvent: browser.FocusEvent,
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true });
}

// The pills own their data; here they stand in as marked spans that record
// which session they were given.
const pillSessions: Record<string, unknown[]> = {};
mock.module('./ComposerSessionCost', () => ({
  ComposerSessionCost: ({ sessionId }: { sessionId: string | null }) => {
    pillSessions.spend = [sessionId];
    return <span data-usage-pill="">spend</span>;
  },
}));
mock.module('./ComposerContextUsage', () => ({
  ComposerContextUsage: ({ sessionId, directory }: { sessionId: string | null; directory: string | undefined }) => {
    pillSessions.context = [sessionId, directory];
    return <span data-usage-pill="">context</span>;
  },
}));

const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { ComposerUsageGauge } = await import('./ComposerUsageGauge');

let root: Root;

const render = async (groups: UsageProviderGroup[]): Promise<HTMLElement> => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <I18nProvider>
        <ComposerUsageGauge groups={groups} currentProviderId={null} sessionId="ses_column" directory="/column" displayMode="usage" />
      </I18nProvider>,
    );
  });
  return host;
};

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

afterAll(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('AC-050: without a quota provider the line keeps spend and context and drops only the meters', async () => {
  const host = await render([]);
  expect(host.querySelector('[aria-label="Composer usage"]')).toBeNull();
  expect([...host.querySelectorAll('[data-usage-pill]')].map((node) => node.textContent)).toEqual(['spend', 'context']);
});

test('AC-051: a quota provider adds the meters pill between spend and context', async () => {
  const host = await render([{ providerId: 'codex', providerName: 'Codex', status: null, rows: [] }]);
  expect(host.querySelector('[aria-label="Composer usage"]')).not.toBeNull();
  expect(host.querySelectorAll('[data-usage-pill]')).toHaveLength(3);
});

test('AC-052: spend and context read the composer session the line is given', async () => {
  await render([]);
  expect(pillSessions.spend).toEqual(['ses_column']);
  expect(pillSessions.context).toEqual(['ses_column', '/column']);
});
