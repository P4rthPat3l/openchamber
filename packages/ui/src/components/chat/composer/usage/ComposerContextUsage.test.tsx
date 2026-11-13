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

type Reading = {
  sessionId: string | null;
  fill: { state: 'measured'; totalTokens: number } | { state: 'compacted' } | null;
  cacheHit: number | null;
  limit: number;
};
let reading: Reading = { sessionId: null, fill: null, cacheHit: null, limit: 1_000_000 };
let readArgs: [string | null, string | undefined] | null = null;

mock.module('@/components/layout/useCurrentContextReading', () => ({
  useContextReading: (sessionId: string | null, directory: string | undefined) => {
    readArgs = [sessionId, directory];
    return reading;
  },
  // The ring comes from the rail, which imports the live hook.
  useCurrentContextReading: () => reading,
}));

const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { ComposerContextUsage } = await import('./ComposerContextUsage');

let root: Root;

const render = async (): Promise<HTMLElement> => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<I18nProvider><ComposerContextUsage sessionId="ses_column" directory="/column" textClassName="text-[0.6875rem]" /></I18nProvider>);
  });
  return host;
};

const openPopover = async (): Promise<Element | null> => {
  await act(async () => document.querySelector('button')?.click());
  return document.body.querySelector('[role="dialog"]');
};

beforeEach(() => {
  reading = { sessionId: null, fill: null, cacheHit: null, limit: 1_000_000 };
  readArgs = null;
});

afterEach(async () => {
  // The popover portals outside the host, so the document is cleared too.
  await act(async () => root.unmount());
  document.body.innerHTML = '';
});

afterAll(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('AC-030: a draft with no session renders no context segment', async () => {
  const host = await render();
  expect(host.querySelector('button')).toBeNull();
  expect(host.textContent).toBe('');
});

test('AC-034: the segment reads the composer session it is given, not the live one', async () => {
  await render();
  expect(readArgs).toEqual(['ses_column', '/column']);
});

test('AC-031: a measured fill shows the figure and opens its popover with the session readings', async () => {
  reading = { sessionId: 'ses_1', fill: { state: 'measured', totalTokens: 75_000 }, cacheHit: null, limit: 1_000_000 };
  const host = await render();
  const button = host.querySelector('button');
  expect(button?.getAttribute('aria-label')).toBe('Context usage');
  expect(button?.getAttribute('aria-haspopup')).toBe('dialog');
  expect(button?.textContent).toBe('7.5%');
  // The segment renders its trigger alone.
  expect(host.firstElementChild?.children).toHaveLength(1);

  const dialog = await openPopover();
  expect(dialog?.textContent).toContain('Context Usage');
  expect(dialog?.textContent).toContain('7.5%');
  expect(dialog?.textContent).toContain('Used tokens');
  expect(dialog?.textContent).toContain('75.0K');
  expect(dialog?.textContent).toContain('Context limit');
  expect(dialog?.textContent).toContain('1.0M');
  // Spend lives on the line's own control, not in this popover.
  expect(dialog?.textContent).not.toContain('Cost');
});

test('AC-032: a compacted session keeps the dash and says when the figure returns', async () => {
  reading = { sessionId: 'ses_2', fill: { state: 'compacted' }, cacheHit: null, limit: 1_000_000 };
  const host = await render();
  expect(host.querySelector('button')?.textContent).toBe('—');

  const dialog = await openPopover();
  expect(dialog?.textContent).toContain('Context compacted. Usage updates after the next response.');
  expect(dialog?.textContent).not.toContain('Used tokens');
});

test('AC-033: the cache hit of the last reply is one row, and absent when the reply reported none', async () => {
  reading = { sessionId: 'ses_1', fill: { state: 'measured', totalTokens: 75_000 }, cacheHit: 72.4, limit: 1_000_000 };
  await render();
  const withCache = await openPopover();
  expect(withCache?.textContent).toContain('Cache hit');
  expect(withCache?.textContent).toContain('72.4%');

  await act(async () => root.unmount());
  document.body.innerHTML = '';
  reading = { sessionId: 'ses_1', fill: { state: 'measured', totalTokens: 75_000 }, cacheHit: null, limit: 1_000_000 };
  await render();
  const withoutCache = await openPopover();
  expect(withoutCache?.textContent).toContain('Context limit');
  expect(withoutCache?.textContent).not.toContain('Cache hit');
});
