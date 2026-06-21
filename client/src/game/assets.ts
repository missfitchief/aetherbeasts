export interface SpriteEntry {
  category: string;
  w: number;
  h: number;
  frames: number;
  fps: number;
  path: string; // relative to /assets/ (ends in "/" for multi-frame)
}
export interface AudioEntry {
  kind: 'music' | 'sfx';
  path: string;
}
export interface Manifest {
  sprites: Record<string, SpriteEntry>;
  audio: Record<string, AudioEntry>;
}

// Relative (no leading slash) so the built site works from any host or subpath.
export const ASSET_BASE = 'assets/';
export const assetUrl = (relPath: string) => ASSET_BASE + relPath;

/** Battle/portrait sprite URL for a species (single-frame `mon/<key>.png`). */
export const monSpriteUrl = (speciesId: string) => `${ASSET_BASE}mon/mon_${speciesId}.png`;

let cached: Manifest | null = null;
export async function loadManifest(): Promise<Manifest> {
  if (cached) return cached;
  const res = await fetch(assetUrl('manifest.json'));
  cached = (await res.json()) as Manifest;
  return cached;
}

export function getManifest(): Manifest {
  if (!cached) throw new Error('Manifest not loaded yet');
  return cached;
}
