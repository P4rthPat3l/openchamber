import { afterAll, expect, mock, test } from 'bun:test';
import type { DesktopSettings } from '@/lib/desktop';
import { useUIStore } from '@/stores/useUIStore';

interface PendingWrite {
  changes: Partial<DesktopSettings>;
  finish: (ok: boolean) => void;
}
const writes: PendingWrite[] = [];
// Keep the module's other exports: another test in this folder imports
// `loadDesktopSettings` from the same module through the quota store.
const persistence = await import('@/lib/persistence');
mock.module('@/lib/persistence', () => ({
  ...persistence,
  updateDesktopSettings: (changes: Partial<DesktopSettings>) => new Promise<{ ok: boolean }>((resolve) => {
    writes.push({ changes, finish: (ok) => {
      if (ok && changes.composerUsagePinnedProviders) useUIStore.getState().setComposerUsagePinnedProviders(changes.composerUsagePinnedProviders);
      resolve({ ok });
    } });
  }),
}));
const { useComposerUsagePinsStore } = await import('./composerUsagePins');
afterAll(() => mock.restore());

test('AC-015: every gauge shares pending protection and subsequent toggles use confirmed pins', async () => {
  const original = useUIStore.getState().composerUsagePinnedProviders;
  try {
    useUIStore.getState().setComposerUsagePinnedProviders([]);
    const first = useComposerUsagePinsStore.getState().toggle('claude');
    expect(useComposerUsagePinsStore.getState().saving).toBe(true);
    expect(useUIStore.getState().composerUsagePinnedProviders).toEqual([]);
    expect(await useComposerUsagePinsStore.getState().toggle('codex')).toBe('busy');
    expect(writes).toHaveLength(1);
    writes[0]!.finish(true);
    expect(await first).toBe('saved');
    expect(useComposerUsagePinsStore.getState().saving).toBe(false);
    const second = useComposerUsagePinsStore.getState().toggle('codex');
    expect(writes[1]!.changes).toEqual({ composerUsagePinnedProviders: ['claude', 'codex'] });
    writes[1]!.finish(true);
    expect(await second).toBe('saved');
    const failed = useComposerUsagePinsStore.getState().toggle('claude');
    writes[2]!.finish(false);
    expect(await failed).toBe('failed');
    expect(useUIStore.getState().composerUsagePinnedProviders).toEqual(['claude', 'codex']);
    expect(useComposerUsagePinsStore.getState().saving).toBe(false);
  } finally {
    useUIStore.getState().setComposerUsagePinnedProviders(original);
  }
});
