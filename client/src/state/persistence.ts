import type { SaveData } from '@aether/shared';

/**
 * Persistence behind a small interface so Phase 1 can drop in a server-backed
 * adapter (keyed to a wallet pubkey) without touching game code.
 */
export interface SaveAdapter {
  load(): SaveData | null;
  save(data: SaveData): void;
  clear(): void;
}

const KEY = 'aetherbeasts:save:v1';
const PID_KEY = 'aetherbeasts:playerId';

export const localSaveAdapter: SaveAdapter = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  },
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* quota / private mode — game still playable in-memory */
    }
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};

/** A stable local player id (stands in for a wallet pubkey until linked). */
export function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PID_KEY);
  if (!id) {
    id = 'local_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(PID_KEY, id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Swappable active adapter. The game writes through `saveAdapter`; by default
// that is the local (localStorage) adapter, so single-player works with zero
// server. Once a server session authenticates, `setSaveAdapter` swaps in a
// server-backed adapter (which still mirrors to localStorage). Nothing in the
// game code changes — it always calls `saveAdapter`.
// ---------------------------------------------------------------------------
let active: SaveAdapter = localSaveAdapter;

export function setSaveAdapter(a: SaveAdapter): void {
  active = a;
}
export function resetSaveAdapter(): void {
  active = localSaveAdapter;
}

export const saveAdapter: SaveAdapter = {
  load: () => active.load(),
  save: (d) => active.save(d),
  clear: () => active.clear(),
};
