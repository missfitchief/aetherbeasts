import Phaser from 'phaser';

/**
 * Hand-authored high-quality pixel-art terrain, generated on offscreen canvases
 * and registered as Phaser textures. Terrain (path, water) is rendered with
 * quarter-tile autotiling (see autotile.ts) so edges blend smoothly into grass.
 *
 * Each terrain provides 8x8 "quarter" pieces in five shapes, one set per corner
 * orientation. The pieces are transparent where the underlying grass shows.
 */
export const Q = 8; // quarter-tile size
export const T = 16; // full tile size

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type Shape = 'fill' | 'edgeH' | 'edgeV' | 'outer' | 'inner';

// ---- palettes (light -> dark) ---------------------------------------------
const GRASS = ['#7bc56a', '#69b558', '#57a049', '#48893d'];
const GRASS_BLADE = '#3f7a34';
const GRASS_DARK = '#3c6f32';
const DIRT = ['#d8b681', '#c9a26a', '#b48a55', '#9a7245'];
const DIRT_RIM = '#7c5a36';
const WATER = ['#4fa9e8', '#3d93da', '#2f7ec4'];
const WATER_HI = '#86c8f2';
const WATER_RIM = '#bfe3c0'; // light foamy/sandy shoreline

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cv(w: number, h: number): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  return { c, x };
}

const set = (x: CanvasRenderingContext2D, px: number, py: number, color: string) => {
  x.fillStyle = color; x.fillRect(px, py, 1, 1);
};

function register(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}

// ---------------------------------------------------------------------------
// Grass: textured, top-lit, with a few blades. A few variants for variation.
// ---------------------------------------------------------------------------
function grassTile(seed: number): HTMLCanvasElement {
  const { c, x } = cv(T, T);
  const r = mulberry(seed);
  // soft 2x2 colour patches (no per-row banding) over a single base green
  for (let py = 0; py < T; py += 2)
    for (let px = 0; px < T; px += 2) {
      const n = r();
      const idx = n < 0.12 ? 0 : n < 0.22 ? 2 : 1;
      rect(x, px, py, 2, 2, GRASS[idx]);
    }
  // a few short blade tufts for life
  for (let i = 0; i < 4; i++) {
    const bx = 1 + Math.floor(r() * (T - 2));
    const by = 4 + Math.floor(r() * (T - 7));
    set(x, bx, by, GRASS_BLADE);
    set(x, bx, by + 1, GRASS_DARK);
    if (r() < 0.5) set(x, bx + 1, by + 1, GRASS_BLADE);
  }
  return c;
}

function tallGrassOverlay(seed: number): HTMLCanvasElement {
  const { c, x } = cv(T, T);
  const r = mulberry(seed);
  // clumps of upright blades, transparent base (drawn over grass)
  for (let bx = 1; bx < T; bx += 2) {
    const h = 5 + Math.floor(r() * 4);
    const top = T - h - 1;
    for (let yy = top; yy < T - 1; yy++) {
      set(x, bx, yy, yy < top + 2 ? '#5aa14a' : '#3f7a34');
    }
    if (r() < 0.5) set(x, bx + 1, T - 3, '#356b2c');
  }
  // a darker shadow band at the base
  for (let px = 0; px < T; px++) { set(x, px, T - 1, 'rgba(40,70,30,0.35)'); }
  return c;
}

function flowerOverlay(seed: number): HTMLCanvasElement {
  const { c, x } = cv(T, T);
  const r = mulberry(seed);
  const cols = [['#ff6b6b', '#c0392b'], ['#ffd166', '#e0a32e'], ['#c792ea', '#9b59b6'], ['#ffffff', '#cfd8dc']];
  for (let i = 0; i < 3; i++) {
    const fx = 2 + Math.floor(r() * (T - 5));
    const fy = 3 + Math.floor(r() * (T - 6));
    const [pet, ctr] = cols[Math.floor(r() * cols.length)];
    set(x, fx, fy, pet); set(x, fx + 1, fy, pet); set(x, fx, fy + 1, pet); set(x, fx + 1, fy + 1, pet);
    set(x, fx, fy, ctr);
    set(x, fx, fy + 2, '#3f7a34');
  }
  return c;
}

// ---------------------------------------------------------------------------
// Terrain quarter pieces (8x8). Drawn for the TL corner, then flipped.
//   conventions for TL: the tile's outer boundary is the TOP and LEFT edges.
// ---------------------------------------------------------------------------
type DrawQ = (x: CanvasRenderingContext2D, r: () => number) => void;

function dirtFillPixel(x: CanvasRenderingContext2D, px: number, py: number, r: () => number) {
  let idx = 1 + (r() < 0.22 ? 1 : 0) - (r() < 0.12 ? 1 : 0);
  idx = Math.max(0, Math.min(DIRT.length - 1, idx));
  set(x, px, py, DIRT[idx]);
}
function waterFillPixel(x: CanvasRenderingContext2D, px: number, py: number, r: () => number) {
  let idx = 1 + (r() < 0.25 ? 1 : 0);
  idx = Math.min(WATER.length - 1, idx);
  set(x, px, py, WATER[idx]);
  if (r() < 0.06) set(x, px, py, WATER_HI);
}

/** Build the five TL-corner quarter shapes for a terrain. */
function terrainQuarters(
  fillPixel: (x: CanvasRenderingContext2D, px: number, py: number, r: () => number) => void,
  rim: string,
  seed: number,
): Record<Shape, HTMLCanvasElement> {
  const mk = (draw: DrawQ): HTMLCanvasElement => {
    const { c, x } = cv(Q, Q);
    draw(x, mulberry(seed + Math.floor(Math.random() * 1)));
    return c;
  };
  // Note: use a fixed seed per shape so they look consistent.
  const fillBody = (x: CanvasRenderingContext2D, r: () => number, inside: (px: number, py: number) => boolean, rimEdge: (px: number, py: number) => boolean) => {
    for (let py = 0; py < Q; py++) for (let px = 0; px < Q; px++) {
      if (rimEdge(px, py)) set(x, px, py, rim);
      else if (inside(px, py)) fillPixel(x, px, py, r);
    }
  };

  const fill = mk((x, r) => fillBody(x, r, () => true, () => false));

  // top is grass: rows 0..1 grass (transparent), row 2 rim, rest fill
  const edgeH = mk((x, r) => fillBody(x, r, (_p, py) => py >= 2, (_p, py) => py === 2));

  // left is grass: cols 0..1 grass, col 2 rim, rest fill
  const edgeV = mk((x, r) => fillBody(x, r, (px) => px >= 2, (px) => px === 2));

  // outer (top+left grass): rounded fill in the BR
  const dist = (px: number, py: number) => Math.hypot(px - 1.5, py - 1.5);
  const outer = mk((x, r) => fillBody(x, r, (px, py) => dist(px, py) >= 5.2, (px, py) => {
    const d = dist(px, py); return d >= 4.4 && d < 5.2;
  }));

  // inner (concave, grass nub at TL): fill except a small rounded nub at TL
  const inner = mk((x, r) => fillBody(x, r, (px, py) => dist(px, py) >= 2.6, (px, py) => {
    const d = dist(px, py); return d >= 2.6 && d < 3.4;
  }));

  return { fill, edgeH, edgeV, outer, inner };
}

/** Flip a canvas. */
function flip(src: HTMLCanvasElement, h: boolean, v: boolean): HTMLCanvasElement {
  const { c, x } = cv(src.width, src.height);
  x.save();
  x.translate(h ? src.width : 0, v ? src.height : 0);
  x.scale(h ? -1 : 1, v ? -1 : 1);
  x.drawImage(src, 0, 0);
  x.restore();
  return c;
}

/** Register all quarter pieces for a terrain under keys `<terr>_<corner>_<shape>`. */
function registerTerrain(scene: Phaser.Scene, terr: string, base: Record<Shape, HTMLCanvasElement>) {
  const shapes: Shape[] = ['fill', 'edgeH', 'edgeV', 'outer', 'inner'];
  const corners: Corner[] = ['tl', 'tr', 'bl', 'br'];
  for (const shape of shapes) {
    const tl = base[shape];
    for (const corner of corners) {
      const h = corner === 'tr' || corner === 'br';
      const v = corner === 'bl' || corner === 'br';
      // edgeH (top boundary) becomes a bottom boundary when flipped vertically, etc.
      const c = h || v ? flip(tl, h, v) : tl;
      register(scene, `${terr}_${corner}_${shape}`, c);
    }
  }
}

// ---- interior tiles: warm wood floor, plaster wall, carpet runner --------
const WOOD = ['#c0945f', '#b1864f', '#a07647', '#8f693e'];
const PLASTER = ['#e6dac4', '#dacdb4', '#cbbd9f'];
function floorTile(seed: number): HTMLCanvasElement {
  const { c, x } = cv(T, T);
  const r = mulberry(seed);
  const off = (seed % 3) * 2; // stagger plank phase between variants
  for (let py = 0; py < T; py++) {
    const plank = Math.floor((py + off) / 5) % 2;
    for (let px = 0; px < T; px++) {
      let idx = plank + (r() < 0.18 ? 1 : 0) + (r() < 0.06 ? 1 : 0);
      set(x, px, py, WOOD[Math.min(WOOD.length - 1, idx)]);
    }
  }
  for (let py = (4 - off + 5) % 5; py < T; py += 5) { // soft plank seams
    for (let px = 0; px < T; px++) set(x, px, py, 'rgba(90,62,32,0.5)');
    if (py + 1 < T) for (let px = 0; px < T; px++) if (r() < 0.5) set(x, px, py + 1, 'rgba(255,236,200,0.12)');
  }
  for (let i = 0; i < 4; i++) set(x, Math.floor(r() * T), Math.floor(r() * T), 'rgba(95,66,34,0.35)'); // grain
  return c;
}
function wallTile(seed: number, base: boolean): HTMLCanvasElement {
  const { c, x } = cv(T, T);
  const r = mulberry(seed);
  for (let py = 0; py < T; py++)
    for (let px = 0; px < T; px++) {
      let idx = 1 + (r() < 0.1 ? 1 : 0) - (r() < 0.08 ? 1 : 0);
      set(x, px, py, PLASTER[Math.max(0, Math.min(PLASTER.length - 1, idx))]);
    }
  for (let px = 1; px < T; px += 8) for (let py = 0; py < T; py++) set(x, px, py, 'rgba(0,0,0,0.05)'); // faint panel seams
  rect(x, 0, 0, T, 1, 'rgba(255,255,255,0.14)'); // top sheen
  if (base) {
    // wooden baseboard where the wall meets the floor
    rect(x, 0, T - 4, T, 4, '#7a5236');
    rect(x, 0, T - 4, T, 1, '#9a6e44');
    rect(x, 0, T - 5, T, 1, 'rgba(0,0,0,0.18)');
  } else {
    rect(x, 0, T - 1, T, 1, 'rgba(0,0,0,0.1)');
  }
  return c;
}
function carpetTile(seed: number): HTMLCanvasElement {
  const { c, x } = cv(T, T);
  const r = mulberry(seed);
  const RED = ['#b23a3a', '#9c2f2f', '#882828'];
  for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) set(x, px, py, RED[(py + (r() < 0.2 ? 1 : 0)) % 2 ? 1 : 0]);
  rect(x, 0, 0, 2, T, '#6e1f1f'); rect(x, T - 2, 0, 2, T, '#6e1f1f');   // dark side edges
  rect(x, 2, 0, 1, T, '#d9a93a'); rect(x, T - 3, 0, 1, T, '#d9a93a');   // gold trim
  for (let i = 0; i < 5; i++) set(x, 3 + Math.floor(r() * (T - 6)), Math.floor(r() * T), 'rgba(255,210,150,0.12)'); // weave
  return c;
}

function rect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, c: string) {
  x.fillStyle = c; x.fillRect(px, py, w, h);
}

// soft drifting ripple bands over water — calm, no harsh white sparkles
function shimmerFrame(phase: number): HTMLCanvasElement {
  const { c, x } = cv(T, T);
  const y1 = 4 + phase * 2;
  for (let px = 2; px < 14; px++) if ((px + phase) % 6 < 2) set(x, px, y1, 'rgba(198,230,248,0.26)');
  const y2 = 11 - phase;
  for (let px = 3; px < 13; px++) if ((px + phase * 2) % 7 < 2) set(x, px, y2, 'rgba(165,212,240,0.20)');
  return c;
}

// A void rift: a soft purple glow + star sparkles, drawn OVER the floor so the encounter
// patch reads as a magical rift on the League hall's wood — not a random green lawn.
function riftOverlay(seed: number): HTMLCanvasElement {
  const { c, x } = cv(T, T);
  const r = mulberry(seed);
  const g = x.createRadialGradient(T / 2, T / 2, 1, T / 2, T / 2, T / 2 + 1);
  g.addColorStop(0, 'rgba(157,99,255,0.60)');
  g.addColorStop(0.55, 'rgba(95,45,165,0.38)');
  g.addColorStop(1, 'rgba(30,16,60,0)');
  x.fillStyle = g; x.fillRect(0, 0, T, T);
  for (let i = 0; i < 6; i++) set(x, Math.floor(r() * T), Math.floor(r() * T), i % 2 ? '#ecdcff' : '#c6a3ff');
  return c;
}

// ---------------------------------------------------------------------------
export function generateTileArt(scene: Phaser.Scene): void {
  for (let i = 0; i < 3; i++) register(scene, `grass${i}`, grassTile(101 + i * 7));
  register(scene, 'tallgrass_ov', tallGrassOverlay(55));
  register(scene, 'flower_ov', flowerOverlay(71));
  register(scene, 'rift_ov', riftOverlay(563));
  registerTerrain(scene, 'path', terrainQuarters(dirtFillPixel, DIRT_RIM, 201));
  registerTerrain(scene, 'water', terrainQuarters(waterFillPixel, WATER_RIM, 311));
  for (let i = 0; i < 3; i++) register(scene, `shimmer${i}`, shimmerFrame(i));
  for (let i = 0; i < 3; i++) register(scene, `floor${i}`, floorTile(404 + i * 7));
  register(scene, 'wall0', wallTile(717, false));
  register(scene, 'wall_base', wallTile(717, true));
  register(scene, 'carpet0', carpetTile(929));
}
