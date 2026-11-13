import { create } from 'zustand';
import { updateDesktopSettings } from '@/lib/persistence';
import { useUIStore } from '@/stores/useUIStore';

interface ComposerUsagePinsState {
  saving: boolean;
  toggle: (providerId: string) => Promise<'saved' | 'failed' | 'busy'>;
}

// One write owner for every composer column, including while popovers close.
// The existing settings writer captures the runtime and publishes confirmation.
export const useComposerUsagePinsStore = create<ComposerUsagePinsState>((set, get) => ({
  saving: false,
  toggle: async (providerId) => {
    if (get().saving) return 'busy';
    set({ saving: true });
    try {
      const saved = useUIStore.getState().composerUsagePinnedProviders;
      const next = saved.includes(providerId) ? saved.filter((id) => id !== providerId) : [...saved, providerId];
      const result = await updateDesktopSettings({ composerUsagePinnedProviders: next });
      return result.ok ? 'saved' : 'failed';
    } catch {
      return 'failed';
    } finally {
      set({ saving: false });
    }
  },
}));
