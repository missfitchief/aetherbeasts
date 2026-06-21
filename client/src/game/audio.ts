import { assetUrl, loadManifest, type Manifest } from './assets.js';
import { useGame } from '../state/store.js';

/**
 * Tiny HTMLAudio-based manager shared by React (title/menus) and Phaser (scenes).
 * One looping music bed + fire-and-forget SFX. Respects the store's mute flag.
 */
class AudioManager {
  private manifest: Manifest | null = null;
  private music: HTMLAudioElement | null = null;
  private currentKey: string | null = null;
  private sfxCache = new Map<string, HTMLAudioElement>();
  private unlocked = false;

  async init() {
    this.manifest = await loadManifest();
    // Resume audio on first user gesture (browser autoplay policy).
    const unlock = () => {
      this.unlocked = true;
      if (this.music && !useGame.getState().muted) this.music.play().catch(() => {});
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  get muted() {
    return useGame.getState().muted;
  }

  playMusic(key: string, volume = 0.4) {
    if (!this.manifest || this.currentKey === key) return;
    const entry = this.manifest.audio[key];
    if (!entry) return;
    this.stopMusic();
    const el = new Audio(assetUrl(entry.path));
    el.loop = true;
    el.volume = volume;
    this.music = el;
    this.currentKey = key;
    if (this.unlocked && !this.muted) el.play().catch(() => {});
  }

  stopMusic() {
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
      this.music = null;
    }
    this.currentKey = null;
  }

  /** Pause/resume the bed without forgetting which track is loaded. */
  applyMute() {
    if (!this.music) return;
    if (this.muted) this.music.pause();
    else if (this.unlocked) this.music.play().catch(() => {});
  }

  sfx(key: string, volume = 0.6) {
    if (!this.manifest || this.muted) return;
    const entry = this.manifest.audio[key];
    if (!entry) return;
    let base = this.sfxCache.get(key);
    if (!base) {
      base = new Audio(assetUrl(entry.path));
      this.sfxCache.set(key, base);
    }
    const node = base.cloneNode(true) as HTMLAudioElement;
    node.volume = volume;
    node.play().catch(() => {});
  }
}

export const audio = new AudioManager();

// Keep music in sync with the mute toggle.
useGame.subscribe((s, prev) => {
  if (s.muted !== prev.muted) audio.applyMute();
});
