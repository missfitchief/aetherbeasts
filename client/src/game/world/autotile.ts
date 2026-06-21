import Phaser from 'phaser';
import { T, Q, type Corner, type Shape } from './tileart.js';
import type { WorldMap } from './maps.js';

/**
 * Quarter-tile autotiling. For each path/water tile we look at the three
 * neighbours touching each of its four corners and stamp the matching 8x8
 * quarter so terrain blends smoothly into grass (convex + concave corners).
 * Everything is baked into a single RenderTexture for cheap rendering.
 */
const AUTOTILE = new Set(['path', 'water']);

function is(world: WorldMap, x: number, y: number, terr: string): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return true; // OOB = same (no edge at map border)
  return world.tiles[y][x].type === terr;
}

// per-corner neighbour offsets: a = vertical edge, b = horizontal edge, d = diagonal
const CORNER_NB: Record<Corner, { a: [number, number]; b: [number, number]; d: [number, number] }> = {
  tl: { a: [0, -1], b: [-1, 0], d: [-1, -1] },
  tr: { a: [0, -1], b: [1, 0], d: [1, -1] },
  bl: { a: [0, 1], b: [-1, 0], d: [-1, 1] },
  br: { a: [0, 1], b: [1, 0], d: [1, 1] },
};

function cornerShape(world: WorldMap, x: number, y: number, terr: string, corner: Corner): Shape {
  const nb = CORNER_NB[corner];
  const a = is(world, x + nb.a[0], y + nb.a[1], terr); // vertical neighbour
  const b = is(world, x + nb.b[0], y + nb.b[1], terr); // horizontal neighbour
  const d = is(world, x + nb.d[0], y + nb.d[1], terr); // diagonal
  if (a && b) return d ? 'fill' : 'inner';
  if (a && !b) return 'edgeV'; // horizontal neighbour is grass -> vertical grass edge
  if (!a && b) return 'edgeH'; // vertical neighbour is grass -> horizontal grass edge
  return 'outer';
}

const grassKey = (x: number, y: number) => `grass${(x * 7 + y * 13) % 3}`;

export function bakeTerrain(scene: Phaser.Scene, world: WorldMap): Phaser.GameObjects.RenderTexture {
  const rt = scene.add.renderTexture(0, 0, world.width * T, world.height * T).setOrigin(0, 0).setDepth(0);
  rt.beginDraw();
  // base layer: interior floor/wall/carpet, else grass under everything
  for (let y = 0; y < world.height; y++)
    for (let x = 0; x < world.width; x++) {
      const t = world.tiles[y][x].type;
      let base: string;
      if (t === 'floor') base = `floor${(x * 3 + y * 5) % 3}`;
      else if (t === 'carpet') base = 'carpet0';
      else if (t === 'wall') base = (y + 1 < world.height && world.tiles[y + 1][x].type !== 'wall') ? 'wall_base' : 'wall0';
      else base = grassKey(x, y);
      rt.batchDraw(base, x * T, y * T);
    }
  rt.endDraw();

  rt.beginDraw();
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const type = world.tiles[y][x].type;
      if (type === 'tallgrass') rt.batchDraw('tallgrass_ov', x * T, y * T);
      else if (type === 'flower') rt.batchDraw('flower_ov', x * T, y * T);
      else if (AUTOTILE.has(type)) {
        for (const corner of ['tl', 'tr', 'bl', 'br'] as Corner[]) {
          const shape = cornerShape(world, x, y, type, corner);
          const qx = x * T + (corner === 'tr' || corner === 'br' ? Q : 0);
          const qy = y * T + (corner === 'bl' || corner === 'br' ? Q : 0);
          rt.batchDraw(`${type}_${corner}_${shape}`, qx, qy);
        }
      }
    }
  }
  rt.endDraw();
  return rt;
}
