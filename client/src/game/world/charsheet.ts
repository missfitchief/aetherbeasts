// Phaser glue: turn a CharacterAppearance into a usable 64x64 walk-spritesheet
// texture (16x16 frames) + directional walk anims, matching the format the
// existing char_*_sheet.png assets use. Keeps characterart.ts Phaser-free.
import Phaser from 'phaser';
import type { CharacterAppearance, Direction } from '@aether/shared';
import { drawSheet, SHEET_W, SHEET_H, FRAME, COLS, ROWS } from './characterart.js';

const DIRS: Direction[] = ['right', 'up', 'left', 'down']; // row order = DIR_ROW

/** Build (or rebuild) a spritesheet texture `key` + `key_<dir>` walk anims from a config. */
export function registerCharSheet(scene: Phaser.Scene, key: string, cfg: CharacterAppearance): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, SHEET_W, SHEET_H);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(SHEET_W, SHEET_H);
  img.data.set(drawSheet(cfg));
  ctx.putImageData(img, 0, 0);
  // slice into numeric 16x16 frames so generateFrameNumbers / frame indices work
  let i = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) tex.add(i++, 0, col * FRAME, row * FRAME, FRAME, FRAME);
  }
  tex.refresh();
  DIRS.forEach((dir, row) => {
    const akey = `${key}_${dir}`;
    if (scene.anims.exists(akey)) scene.anims.remove(akey);
    scene.anims.create({
      key: akey,
      frames: scene.anims.generateFrameNumbers(key, { start: row * COLS, end: row * COLS + COLS - 1 }),
      frameRate: 8,
      repeat: -1,
    });
  });
}
