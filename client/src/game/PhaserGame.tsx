import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { OverworldScene } from './scenes/OverworldScene.js';
import { BattleScene } from './scenes/BattleScene.js';

const WIDTH = 640;
const HEIGHT = 360;

/** Mounts the Phaser game once and tears it down on unmount. */
export function PhaserGame() {
  const ref = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (gameRef.current || !ref.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: WIDTH,
      height: HEIGHT,
      parent: ref.current,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#0b1020',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [OverworldScene, BattleScene],
    });
    gameRef.current = game;
    if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
    return () => {
      // Defer to avoid destroying a still-booting game (throws on HMR/StrictMode).
      const g = game;
      gameRef.current = null;
      setTimeout(() => {
        try {
          g.destroy(true);
        } catch {
          /* game was mid-boot; ignore */
        }
      }, 0);
    };
  }, []);

  return <div ref={ref} className="phaser-host" />;
}
