import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

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
  // Base UI's popover transition waits on animation frames.
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true });
}

type Rollup = { totalCost: number | null; ownCost: number; subagentCost: number; subagentCount: number };
let rollup: Rollup = { totalCost: null, ownCost: 0, subagentCost: 0, subagentCount: 0 };
let rollupSessionId: string | null = null;

mock.module('@/components/chat/work-status/useSubagentCostRollup', () => ({
  useSubagentCostRollup: (sessionId: string | null) => {
    rollupSessionId = sessionId;
    return rollup;
  },
}));

const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { ComposerSessionCost } = await import('./ComposerSessionCost');

let root: Root;

const render = async (): Promise<HTMLElement> => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<I18nProvider><ComposerSessionCost sessionId="ses_column" textClassName="text-[0.6875rem]" /></I18nProvider>);
  });
  return host;
};

const openPopover = async (): Promise<Element | null> => {
  await act(async () => document.querySelector('button')?.click());
  return document.body.querySelector('[role="dialog"]');
};

beforeEach(() => {
  rollup = { totalCost: null, ownCost: 0, subagentCost: 0, subagentCount: 0 };
  rollupSessionId = null;
});

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

test('AC-040: the line carries the total spend and opens the session and subagent split', async () => {
  rollup = { totalCost: 8.89, ownCost: 6.2308, subagentCost: 2.6582, subagentCount: 2 };
  const host = await render();
  expect(host.textContent).toBe('$8.89');
  // The spend renders its trigger alone.
  expect(host.firstElementChild?.children).toHaveLength(1);

  const dialog = await openPopover();
  // The header carries the total, then the split sits in label/figure rows.
  expect(dialog?.textContent).toContain('Cost');
  expect(dialog?.textContent).toContain('$8.89');
  expect([...(dialog?.querySelectorAll('dt') ?? [])].map((node) => node.textContent)).toEqual(['Session', 'Subagents']);
  expect([...(dialog?.querySelectorAll('dd') ?? [])].map((node) => node.textContent)).toEqual(['$6.2308', '$2.6582']);
});

test('AC-041: without subagent spend the split is absent, because it would restate the total', async () => {
  rollup = { totalCost: 1.25, ownCost: 1.25, subagentCost: 0, subagentCount: 0 };
  const host = await render();
  expect(host.textContent).toBe('$1.25');

  const dialog = await openPopover();
  expect(dialog?.textContent).toContain('Cost');
  expect(dialog?.textContent).toContain('$1.25');
  expect(dialog?.querySelectorAll('dt')).toHaveLength(0);
});

test('AC-042: a free session, or one with no reported spend, adds nothing to the line', async () => {
  const none = await render();
  expect(none.textContent).toBe('');
  expect(none.firstElementChild).toBeNull();

  await act(async () => root.unmount());
  document.body.innerHTML = '';
  rollup = { totalCost: 0, ownCost: 0, subagentCost: 0, subagentCount: 0 };
  const zero = await render();
  expect(zero.textContent).toBe('');
});

test('AC-043: the spend rolls up the composer session it is given, not the live one', async () => {
  rollup = { totalCost: 1.25, ownCost: 1.25, subagentCost: 0, subagentCount: 0 };
  await render();
  expect(rollupSessionId).toBe('ses_column');
});
