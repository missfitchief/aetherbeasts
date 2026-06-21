import Phaser from 'phaser';
import { TILE } from './maps.js';

/**
 * Generates the overworld OBJECT + overlay textures procedurally. Ground tiles
 * and characters now use the real engine art (outdoor tileset + 4x4 walk
 * sheets); these procedural textures cover trees, buildings, shrine, fences,
 * the grass-rustle, and the tall-grass / flower overlays drawn on real grass.
 */
function gfx(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.make.graphics({ x: 0, y: 0 }, false);
}
function px(g: Phaser.GameObjects.Graphics, x: number, y: number, c: number, w = 1, h = 1, a = 1) {
  g.fillStyle(c, a);
  g.fillRect(x, y, w, h);
}

// Deterministic speckle helper (no per-frame randomness).
function speckle(g: Phaser.GameObjects.Graphics, seed: number, color: number, n: number) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) px(g, Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), color);
}

export function buildTextures(scene: Phaser.Scene): void {
  buildTiles(scene);
  buildObjects(scene);
  buildOverlays(scene);
}

/** Transparent overlays drawn on top of the real grass tile. */
function buildOverlays(scene: Phaser.Scene): void {
  // tall-grass blades
  let g = gfx(scene);
  for (let x = 1; x < TILE; x += 3) {
    px(g, x, 4, 0x2f6d2c, 1, 11);
    px(g, x + 1, 7, 0x3a8a36, 1, 8);
  }
  px(g, 0, 13, 0x2f6d2c, TILE, 3);
  g.generateTexture('t_blades', TILE, TILE); g.destroy();

  // flower petals
  g = gfx(scene);
  px(g, 4, 5, 0xff6b6b, 2, 2); px(g, 9, 8, 0xffd166, 2, 2);
  px(g, 7, 11, 0x9b5de5, 2, 2); px(g, 11, 4, 0xffffff, 1, 1);
  px(g, 3, 10, 0xff8fb0, 1, 1);
  g.generateTexture('t_petals', TILE, TILE); g.destroy();
}

function buildTiles(scene: Phaser.Scene): void {
  // grass
  let g = gfx(scene);
  px(g, 0, 0, 0x5aa356, TILE, TILE);
  speckle(g, 7, 0x4f9a4c, 10);
  speckle(g, 23, 0x66b35f, 8);
  g.generateTexture('t_grass', TILE, TILE); g.destroy();

  // path
  g = gfx(scene);
  px(g, 0, 0, 0xc7b083, TILE, TILE);
  speckle(g, 11, 0xbaa276, 8);
  speckle(g, 31, 0xd4c197, 6);
  g.generateTexture('t_path', TILE, TILE); g.destroy();

  // water
  g = gfx(scene);
  px(g, 0, 0, 0x3f86d6, TILE, TILE);
  px(g, 2, 4, 0x65a3e8, 6, 1);
  px(g, 8, 9, 0x65a3e8, 5, 1);
  px(g, 4, 12, 0x2f6cb5, 7, 1);
  g.generateTexture('t_water', TILE, TILE); g.destroy();

  // tallgrass
  g = gfx(scene);
  px(g, 0, 0, 0x4f9a4c, TILE, TILE);
  for (let x = 1; x < TILE; x += 3) {
    px(g, x, 6, 0x3c7d3a, 1, 9);
    px(g, x + 1, 9, 0x46913f, 1, 6);
  }
  px(g, 0, 14, 0x3c7d3a, TILE, 2);
  g.generateTexture('t_tallgrass', TILE, TILE); g.destroy();

  // flower (grass + petals)
  g = gfx(scene);
  px(g, 0, 0, 0x5aa356, TILE, TILE);
  px(g, 6, 6, 0xffd166, 2, 2);
  px(g, 5, 5, 0xff6b6b, 1, 1); px(g, 8, 5, 0xff6b6b, 1, 1);
  px(g, 5, 8, 0xff6b6b, 1, 1); px(g, 8, 8, 0xff6b6b, 1, 1);
  px(g, 11, 10, 0x9b5de5, 2, 2);
  g.generateTexture('t_flower', TILE, TILE); g.destroy();

  // house wall
  g = gfx(scene);
  px(g, 0, 0, 0xd8c8a0, TILE, TILE);
  px(g, 0, 0, 0xb9a47c, TILE, 2);
  px(g, 3, 6, 0x6fc3e0, 4, 4); // window
  px(g, 3, 6, 0x3a8aa8, 4, 1);
  g.generateTexture('t_wall', TILE, TILE); g.destroy();

  // door
  g = gfx(scene);
  px(g, 0, 0, 0xd8c8a0, TILE, TILE);
  px(g, 4, 3, 0x6b4a2a, 8, 13);
  px(g, 10, 9, 0xffd166, 1, 2); // knob
  g.generateTexture('t_door', TILE, TILE); g.destroy();

  // roof
  g = gfx(scene);
  px(g, 0, 0, 0xcf5b56, TILE, TILE);
  for (let y = 2; y < TILE; y += 4) px(g, 0, y, 0xb44944, TILE, 1);
  px(g, 0, 0, 0xe07b76, TILE, 2);
  g.generateTexture('t_roof', TILE, TILE); g.destroy();

  // fence
  g = gfx(scene);
  px(g, 0, 0, 0x5aa356, TILE, TILE);
  px(g, 2, 4, 0x8a6a44, 2, 10);
  px(g, 11, 4, 0x8a6a44, 2, 10);
  px(g, 0, 7, 0xa07c52, TILE, 2);
  g.generateTexture('t_fence', TILE, TILE); g.destroy();
}

function buildObjects(scene: Phaser.Scene): void {
  // Tree: taller than a tile (origin bottom)
  let g = gfx(scene);
  const TH = 24;
  px(g, 6, 14, 0x6b4a2a, 4, TH - 14); // trunk
  px(g, 2, 1, 0x2f7d3a, 12, 12);
  px(g, 1, 4, 0x2f7d3a, 14, 7);
  px(g, 3, 0, 0x3a9a48, 10, 4);
  px(g, 4, 3, 0x46b356, 5, 3); // highlight
  g.generateTexture('o_tree', TILE, TH); g.destroy();

  // Shrine: stone base + glowing orb (origin bottom, slightly tall)
  g = gfx(scene);
  const SH = 22;
  px(g, 2, 12, 0x9a9aa8, 12, SH - 12); // base
  px(g, 4, 6, 0xb8b8c8, 8, 8); // pillar
  px(g, 6, 2, 0x8be0ff, 4, 4); // orb
  px(g, 7, 1, 0xffffff, 2, 2);
  g.generateTexture('o_shrine', TILE, SH); g.destroy();

  // Sign
  g = gfx(scene);
  px(g, 7, 8, 0x6b4a2a, 2, 8);
  px(g, 2, 2, 0xa9824f, 12, 7);
  px(g, 3, 4, 0x6b4a2a, 10, 1);
  px(g, 3, 6, 0x6b4a2a, 8, 1);
  g.generateTexture('o_sign', TILE, TILE); g.destroy();

  // Tall-grass rustle overlay (used when an encounter triggers)
  g = gfx(scene);
  px(g, 1, 8, 0x2f5d2c, 14, 8);
  for (let x = 1; x < TILE; x += 2) px(g, x, 4, 0x3c7d3a, 1, 11);
  g.generateTexture('o_rustle', TILE, TILE); g.destroy();
}
