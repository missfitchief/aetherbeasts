import Phaser from 'phaser';

/**
 * Hand-authored, shaded multi-tile object sprites (trees, houses, fences, etc.),
 * generated on offscreen canvases and registered as Phaser textures. Each is
 * drawn with a small palette + light/shadow so it reads as crafted pixel art.
 * Sprites are placed with origin bottom-centre and y-sorted in the scene.
 */
function cv(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!; x.imageSmoothingEnabled = false;
  return { c, x };
}
const R = (s: number) => { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const rect = (x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, c: string) => { x.fillStyle = c; x.fillRect(px, py, w, h); };
const dot = (x: CanvasRenderingContext2D, px: number, py: number, c: string) => { x.fillStyle = c; x.fillRect(px, py, 1, 1); };
const disc = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: string) => {
  x.fillStyle = c;
  for (let yy = Math.floor(cy - r); yy <= cy + r; yy++)
    for (let xx = Math.floor(cx - r); xx <= cx + r; xx++)
      if ((xx - cx) ** 2 + (yy - cy) ** 2 <= r * r) x.fillRect(xx, yy, 1, 1);
};
function register(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}
function shadow(x: CanvasRenderingContext2D, cx: number, by: number, w: number) {
  x.fillStyle = 'rgba(20,40,15,0.28)';
  x.beginPath(); x.ellipse(cx, by, w, w * 0.32, 0, 0, Math.PI * 2); x.fill();
}

/** Add a 1px dark outline around the opaque silhouette (skips the soft shadow). */
function outline(x: CanvasRenderingContext2D, w: number, h: number, color: string) {
  const d = x.getImageData(0, 0, w, h).data;
  const solid = (px: number, py: number) =>
    px >= 0 && py >= 0 && px < w && py < h && d[(py * w + px) * 4 + 3] > 140;
  const pts: [number, number][] = [];
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const a = d[(py * w + px) * 4 + 3];
      if (a < 60 && (solid(px - 1, py) || solid(px + 1, py) || solid(px, py - 1) || solid(px, py + 1)))
        pts.push([px, py]);
    }
  x.fillStyle = color;
  for (const [px, py] of pts) x.fillRect(px, py, 1, 1);
}

// ---- TREE: organic lobed canopy, directional light, 3 distinct silhouettes -
type Lobe = [number, number, number]; // dx, dy, radius (relative to canopy anchor)
const TREE_SHAPES: { W: number; H: number; lobes: Lobe[] }[] = [
  // 0 — round oak
  { W: 50, H: 60, lobes: [[0, 4, 13], [-13, 0, 10], [13, 0, 10], [-7, -8, 11], [7, -8, 11], [0, -13, 12], [-12, -9, 7], [12, -10, 7], [-3, -19, 8], [6, -18, 6]] },
  // 1 — tall, narrower crown
  { W: 42, H: 64, lobes: [[0, 6, 10], [-9, 0, 9], [9, 0, 9], [-5, -9, 9], [5, -9, 9], [0, -15, 10], [-6, -18, 7], [4, -20, 6], [0, -25, 5]] },
  // 2 — broad, low canopy
  { W: 54, H: 54, lobes: [[0, 5, 13], [-15, 3, 11], [15, 3, 11], [-8, -5, 12], [8, -5, 12], [0, -10, 13], [-13, -7, 8], [13, -8, 7], [2, -15, 8]] },
];

/** A foliage clump: dark base, mid offset up-left, light core further up-left. */
function lobe(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, dk: string, mid: string, lt: string) {
  disc(x, cx, cy, r, dk);
  const m = Math.round(r * 0.3);
  disc(x, cx - m, cy - m, Math.max(1, r - 2), mid);
  const l = Math.round(r * 0.5);
  disc(x, cx - l, cy - l, Math.max(1, Math.round(r * 0.45)), lt);
}

function tree(seed: number, leaf: [string, string, string, string], variant = 0): HTMLCanvasElement {
  const shp = TREE_SHAPES[variant % TREE_SHAPES.length];
  const { W, H } = shp;
  const { c, x } = cv(W, H);
  const r = R(seed);
  const cx = W / 2;
  const [dk, mid, lt, hi] = leaf;
  shadow(x, cx, H - 3, Math.round(W * 0.34));
  // trunk: tapered (flares at the base), lit left / shaded right, with bark
  const trunkTop = H - 20, trunkBot = H - 2;
  for (let y = trunkTop; y <= trunkBot; y++) {
    const f = (y - trunkTop) / (trunkBot - trunkTop);
    const hw = Math.round(3 + f * 2);
    rect(x, cx - hw, y, hw * 2, 1, '#6b4a2a');
    rect(x, cx - hw, y, 1, 1, '#7d5733');
    rect(x, cx + hw - 1, y, 1, 1, '#4f3620');
  }
  rect(x, cx - 1, trunkTop + 4, 1, 9, '#5a3c20'); // bark seam
  // canopy
  const base = trunkTop - 6;
  for (const [dx, dy, lr] of shp.lobes) lobe(x, cx + dx, base + dy, lr, dk, mid, lt);
  // sun highlights on the upper-left clumps
  for (const [dx, dy, lr] of shp.lobes) {
    if (dx <= 1 && dy < -6) disc(x, cx + dx - Math.round(lr * 0.45), base + dy - Math.round(lr * 0.45), Math.max(1, Math.round(lr * 0.3)), hi);
  }
  // crevice shadows + scattered leaf speckle
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, rad = 3 + r() * (W * 0.3);
    const px = Math.round(cx + Math.cos(a) * rad * 0.8), py = Math.round(base - 7 + Math.sin(a) * rad * 0.55);
    dot(x, px, py, r() < 0.4 ? dk : hi);
  }
  outline(x, W, H, '#22401f');
  return c;
}

// ---- PINE: tiered conifer for tree lines + species variety ----------------
function pine(seed: number, W = 26, H = 48): HTMLCanvasElement {
  const { c, x } = cv(W, H);
  const r = R(seed);
  const cx = W / 2;
  const DK = '#1d5530', MD = '#2a7440', LT = '#3c934e', HI = '#58b064';
  shadow(x, cx, H - 2, 8);
  rect(x, cx - 2, H - 9, 4, 8, '#5e4226'); rect(x, cx + 1, H - 9, 1, 8, '#46301c'); rect(x, cx - 2, H - 9, 1, 8, '#6e5230');
  const tiers: [number, number][] = [[H - 18, 12], [H - 28, 10], [H - 37, 8], [H - 45, 5]]; // base -> tip
  for (const [ty, hw] of tiers) {
    const th = 13;
    for (let yy = 0; yy < th && ty + yy < H - 6; yy++) {
      const w = Math.round((yy / th) * hw);
      for (let px = cx - w; px <= cx + w; px++) rect(x, px, ty + yy, 1, 1, px < cx - 2 ? MD : px > cx + 2 ? DK : LT);
      if (yy === th - 1) for (let px = cx - w; px <= cx + w; px++) rect(x, px, ty + yy, 1, 1, DK); // tier shadow lip
    }
  }
  rect(x, cx, H - 47, 1, 4, HI); // bright tip
  for (let i = 0; i < 10; i++) dot(x, cx - 1 - Math.floor(r() * 6), H - 44 + Math.floor(r() * 30), HI); // left-lit specks
  outline(x, W, H, '#123320');
  return c;
}

// ---- HOUSE: parameterised so each building reads as a distinct design ------
interface HouseOpts {
  W: number; H: number;
  wall: [string, string, string]; // light, mid, dark
  roof: [string, string, string];
  roofType?: 'hip' | 'gable' | 'flat'; // distinct silhouettes
  log?: boolean;       // horizontal log seams (cabin) instead of plaster
  winCols?: number;    // windows across (default 2)
  winRows?: number;    // window rows (default 1)
  awning?: [string, string]; // striped shop awning over the door
  sign?: string;       // hanging plaque colour
  chimney?: boolean;
  rooftop?: 'dome' | 'antenna'; // lab-style flat-roof gizmo
}
function house(o: HouseOpts): HTMLCanvasElement {
  const { W, H } = o;
  const { c, x } = cv(W, H);
  const [wl, wm, wd] = o.wall;
  const [rl, rm, rd] = o.roof;
  shadow(x, W / 2, H - 2, W * 0.42);
  const roofType = o.roofType ?? 'hip';
  const roofH = Math.round(H * (roofType === 'flat' ? 0.16 : roofType === 'gable' ? 0.46 : 0.4));
  const wallTop = roofH, wallH = H - wallTop - 2;
  // walls
  rect(x, 6, wallTop, W - 12, wallH, wm);
  rect(x, 6, wallTop, W - 12, 2, wl);
  rect(x, 6, H - 4, W - 12, 2, wd);
  rect(x, W - 8, wallTop, 2, wallH, wd);
  if (o.log) {
    for (let yy = wallTop + 4; yy < H - 4; yy += 5) { rect(x, 6, yy, W - 12, 1, wd); rect(x, 6, yy + 1, W - 12, 1, wl); }
  } else {
    for (let yy = wallTop + 6; yy < H - 4; yy += 7) rect(x, 7, yy, W - 14, 1, 'rgba(150,110,70,0.30)');
  }
  // door
  const dw = 14, dx = Math.round((W - dw) / 2);
  rect(x, dx, H - 22, dw, 20, '#6b4a2a');
  rect(x, dx + 1, H - 21, dw - 2, 18, '#7d5733');
  rect(x, dx + 2, H - 20, dw - 4, 16, '#5b3d20');
  rect(x, dx + dw - 5, H - 13, 2, 2, '#ffd166'); // knob
  rect(x, dx - 1, H - 23, dw + 2, 2, '#8a6a44'); // lintel
  // optional striped awning over the door
  if (o.awning) {
    const [a1, a2] = o.awning;
    for (let i = 0; i < dw + 6; i++) rect(x, dx - 3 + i, H - 26, 1, 4, i % 4 < 2 ? a1 : a2);
    rect(x, dx - 3, H - 26, dw + 6, 1, '#ffffff55');
  }
  // windows: the original blue-glass pane (4 panes, glint, sill)
  const WW = 14, WH = 13;
  const win = (cxw: number, cyw: number) => {
    const wx = Math.round(cxw - WW / 2), wy = Math.round(cyw - WH / 2);
    rect(x, wx, wy, WW, WH, '#4a3320');                  // wooden frame
    rect(x, wx + 1, wy + 1, WW - 2, WH - 3, '#8fd0ef');  // glass
    rect(x, wx + 1, wy + 1, WW - 2, 4, '#bfe6f7');       // upper sheen
    rect(x, wx + 2, wy + 2, 3, 2, '#ffffff');            // glint
    rect(x, wx + (WW >> 1) - 1, wy + 1, 1, WH - 3, '#4a3320'); // vertical muntin
    rect(x, wx + 1, wy + (WH >> 1) - 1, WW - 2, 1, '#4a3320'); // horizontal muntin
    rect(x, wx - 1, wy + WH - 1, WW + 2, 2, wl);         // light sill ledge
  };
  // central obstacles windows must avoid: the door (bottom) and the sign (top).
  const blocked = (cxw: number, cyw: number) => {
    const nearCentre = Math.abs(cxw - W / 2) < 9 + WW / 2;
    const hitsDoor = Math.abs(cxw - W / 2) < dw / 2 + WW / 2 && cyw + WH / 2 > H - 22;
    const hitsSign = !!o.sign && nearCentre && cyw - WH / 2 < wallTop + 11;
    return hitsDoor || hitsSign;
  };
  const cols = o.winCols ?? 2, rows = o.winRows ?? 1;
  // window-centre x stays inside the wall (margin from the outlined edges)
  const cxMin = 6 + 4 + WW / 2, cxMax = W - 6 - 4 - WW / 2;
  for (let ri = 0; ri < rows; ri++) {
    const cy = wallTop + 5 + WH / 2 + ri * (WH + 6);
    if (cy + WH / 2 > H - 6) break;
    for (let ci = 0; ci < cols; ci++) {
      const cx = cols === 1 ? W / 2 : cxMin + (ci * (cxMax - cxMin)) / (cols - 1);
      if (blocked(cx, cy)) continue;
      win(cx, cy);
    }
  }
  // hanging sign plaque
  if (o.sign) {
    rect(x, W / 2 - 9, wallTop + 2, 18, 8, o.sign);
    rect(x, W / 2 - 9, wallTop + 2, 18, 1, '#ffffff44');
    rect(x, W / 2 - 6, wallTop + 5, 12, 1, '#00000055'); rect(x, W / 2 - 6, wallTop + 7, 8, 1, '#00000055');
  }
  // ---- roof: silhouette varies by type (hip / gable / flat) ----
  const eaveL = 3, eaveR = W - 3, roofBot = wallTop;
  const shingle = (left: number, right: number, yy: number) => {
    if (yy % 3 === 2) rect(x, left, yy, right - left, 1, 'rgba(0,0,0,0.15)');
    else if (yy % 3 === 0) rect(x, left, yy, right - left, 1, 'rgba(255,255,255,0.05)');
  };
  if (o.chimney !== false && roofType !== 'flat') {
    const chx = Math.round(W * 0.64);
    rect(x, chx, 0, 7, 12, '#9a5a4a'); rect(x, chx, 0, 2, 12, '#b87060'); rect(x, chx + 5, 0, 2, 12, '#7c4438');
    rect(x, chx - 1, 0, 9, 2, '#6e3d32');
  }
  if (roofType === 'gable') {
    // triangular front: peak at top-centre, widening to the eaves
    const cxw = Math.round(W / 2), half = (eaveR - eaveL) / 2;
    for (let yy = 0; yy < roofBot; yy++) {
      const f = yy / (roofBot - 1);
      const hw = Math.round(f * half);
      const left = cxw - hw, right = cxw + hw;
      for (let px = left; px < right; px++) rect(x, px, yy, 1, 1, px < cxw ? (f < 0.55 ? rl : rm) : rd); // lit left, shadow right
      shingle(left, right, yy);
    }
    rect(x, cxw, 0, 1, roofBot, 'rgba(255,255,255,0.2)');   // bright ridge line
    rect(x, cxw + 1, 0, 1, roofBot, rd);
    rect(x, eaveL, roofBot - 2, eaveR - eaveL, 2, rd);       // eave board
  } else if (roofType === 'flat') {
    // flat slab + parapet (institutional look), taller walls below
    rect(x, eaveL, 0, eaveR - eaveL, roofBot, rm);
    rect(x, eaveL, 0, eaveR - eaveL, 2, rl);                 // lit top edge (parapet cap)
    rect(x, eaveL, roofBot - 3, eaveR - eaveL, 3, rd);       // shadowed front fascia
    rect(x, eaveL, 0, 2, roofBot, rl); rect(x, eaveR - 2, 0, 2, roofBot, rd);
    for (let vx = eaveL + 6; vx < eaveR - 6; vx += 10) rect(x, vx, 2, 4, 2, '#00000022'); // roof vents
    if (o.rooftop === 'dome') { disc(x, Math.round(W / 2), roofBot - 1, 7, rl); disc(x, Math.round(W / 2) - 1, roofBot - 2, 6, rm); }
    else if (o.rooftop === 'antenna') { rect(x, Math.round(W * 0.74), 1, 1, roofBot - 2, '#8a8f9c'); rect(x, Math.round(W * 0.74) - 2, 2, 5, 1, '#aab'); }
  } else {
    // hip: trapezoid — narrow ridge on top, wide eaves below
    const ridgeInset = Math.round((eaveR - eaveL) * 0.24);
    const ridgeL = eaveL + ridgeInset, ridgeR = eaveR - ridgeInset;
    for (let yy = 0; yy < roofBot; yy++) {
      const f = yy / (roofBot - 1);
      const inset = Math.round((1 - f) * ridgeInset);
      const left = eaveL + inset, right = eaveR - inset;
      rect(x, left, yy, right - left, 1, f < 0.3 ? rl : f < 0.68 ? rm : rd);
      shingle(left, right, yy);
    }
    rect(x, ridgeL - 1, 0, ridgeR - ridgeL + 2, 2, rl);
    rect(x, ridgeL - 1, 0, ridgeR - ridgeL + 2, 1, 'rgba(255,255,255,0.28)');
    rect(x, eaveL, roofBot - 2, eaveR - eaveL, 2, rd);
  }
  rect(x, 7, roofBot, W - 14, 1, 'rgba(0,0,0,0.16)'); // shadow on wall under the eave
  outline(x, W, H, '#3a2a1c');
  return c;
}

// ---- CHURCH: stone chapel with a steeple, cross + stained-glass window -----
function church(): HTMLCanvasElement {
  const W = 60, H = 88;
  const { c, x } = cv(W, H);
  const cx = W / 2;
  const SL = '#c2c6d2', SM = '#9da2b2', SD = '#7c8192'; // stone
  const RM = '#54467a', RD = '#3e3360'; // slate roof
  shadow(x, cx, H - 2, W * 0.42);
  // cross + spire
  rect(x, cx - 1, 0, 2, 9, '#d9b35a'); rect(x, cx - 4, 3, 8, 2, '#d9b35a');
  for (let yy = 9; yy < 22; yy++) { const hw = Math.round((yy - 9) / 13 * 8); rect(x, cx - hw, yy, hw * 2, 1, yy < 15 ? RM : RD); }
  // bell tower (stone)
  const tw = 16, tx = cx - tw / 2;
  rect(x, tx, 22, tw, 24, SM); rect(x, tx, 22, 2, 24, SL); rect(x, tx + tw - 2, 22, 2, 24, SD);
  rect(x, cx - 3, 28, 6, 10, '#2a2438'); rect(x, cx - 2, 30, 4, 7, '#9ad0e8'); // louvre
  // main gable roof
  const bodyY = 46;
  for (let yy = bodyY - 16; yy < bodyY; yy++) {
    const f = (yy - (bodyY - 16)) / 16, hw = Math.round(5 + f * (W / 2 - 5));
    for (let px = cx - hw; px < cx + hw; px++) rect(x, px, yy, 1, 1, px < cx ? (f < 0.5 ? RM : RD) : RD);
  }
  rect(x, cx, bodyY - 16, 1, 16, 'rgba(255,255,255,0.16)'); // ridge highlight
  // stone walls
  const wallH = H - bodyY - 2;
  rect(x, 4, bodyY, W - 8, wallH, SM);
  rect(x, 4, bodyY, W - 8, 2, SL); rect(x, 4, H - 4, W - 8, 2, SD);
  rect(x, 4, bodyY, 2, wallH, SL); rect(x, W - 6, bodyY, 2, wallH, SD);
  for (let yy = bodyY + 7; yy < H - 4; yy += 8) rect(x, 5, yy, W - 10, 1, 'rgba(0,0,0,0.1)');
  // arched stained-glass window
  const gw = 16, gx = cx - gw / 2, gy = bodyY + 6, gh = 15;
  disc(x, cx, gy, gw / 2, '#2a2438');
  rect(x, gx, gy, gw, gh, '#2a2438');
  const cols = ['#e5484d', '#3b82f6', '#ffd166', '#22c55e'];
  for (let yy = 0; yy < gh - 1; yy += 3) for (let px = 0; px < gw - 1; px += 3) rect(x, gx + 1 + px, gy + 1 + yy, 2, 2, cols[(px + yy) % cols.length]);
  rect(x, cx - 1, gy - 4, 2, gh + 4, '#2a2438'); // mullion
  // arched wooden door
  const dw = 12, dx = cx - dw / 2, dy = H - 17;
  disc(x, cx, dy, dw / 2, '#6b4a2a');
  rect(x, dx, dy, dw, 15, '#6b4a2a'); rect(x, dx + 1, dy, dw - 2, 14, '#7d5733');
  rect(x, cx - 1, dy - 4, 2, 19, '#5b3d20'); rect(x, dx + dw - 4, dy + 6, 2, 2, '#ffd166');
  outline(x, W, H, '#2a2433');
  return c;
}

// ---- small props ----------------------------------------------------------
function fence(): HTMLCanvasElement {
  const { c, x } = cv(16, 16);
  rect(x, 1, 5, 14, 2, '#a07a4a'); rect(x, 1, 9, 14, 2, '#8a6638'); // rails
  rect(x, 1, 4, 14, 1, '#bb9560');
  rect(x, 2, 3, 3, 11, '#7d5733'); rect(x, 11, 3, 3, 11, '#7d5733'); // posts
  rect(x, 2, 3, 1, 11, '#9a7548'); rect(x, 11, 3, 1, 11, '#9a7548');
  return c;
}
function sign(): HTMLCanvasElement {
  const { c, x } = cv(16, 20);
  shadow(x, 8, 18, 5);
  rect(x, 7, 9, 2, 9, '#6b4a2a');
  rect(x, 2, 2, 12, 8, '#a9824f'); rect(x, 2, 2, 12, 1, '#c49b66'); rect(x, 2, 9, 12, 1, '#8a6638');
  rect(x, 4, 4, 8, 1, '#6b4a2a'); rect(x, 4, 6, 6, 1, '#6b4a2a');
  return c;
}
function shrine(): HTMLCanvasElement {
  const { c, x } = cv(20, 30);
  shadow(x, 10, 28, 7);
  rect(x, 3, 20, 14, 8, '#8e93a6'); rect(x, 3, 20, 14, 1, '#abb0c2'); rect(x, 3, 27, 14, 1, '#6f7488');
  rect(x, 5, 8, 10, 12, '#a7adc0'); rect(x, 5, 8, 2, 12, '#c2c7d6'); rect(x, 13, 8, 2, 12, '#878da0');
  disc(x, 10, 6, 4, '#7fe3ff'); disc(x, 10, 6, 2, '#d9f7ff');
  rect(x, 9, 1, 2, 2, '#ffffff');
  return c;
}
function lamp(): HTMLCanvasElement {
  const { c, x } = cv(16, 30);
  shadow(x, 8, 28, 4);
  rect(x, 7, 8, 2, 20, '#3b3b46'); rect(x, 7, 8, 1, 20, '#55555f');
  rect(x, 5, 4, 6, 5, '#2c2c33'); rect(x, 6, 5, 4, 3, '#ffe79a'); // glow
  disc(x, 8, 6, 3, 'rgba(255,224,120,0.35)');
  return c;
}
function bush(): HTMLCanvasElement {
  const { c, x } = cv(16, 14);
  shadow(x, 8, 12, 5);
  disc(x, 6, 7, 4, '#357a38'); disc(x, 10, 7, 4, '#357a38'); disc(x, 8, 5, 4, '#4ea64f');
  disc(x, 7, 4, 2, '#65bf63'); dot(x, 6, 4, '#7bd06f');
  outline(x, 16, 14, '#22401f');
  return c;
}
function stump(): HTMLCanvasElement {
  const { c, x } = cv(16, 12);
  shadow(x, 8, 11, 4);
  rect(x, 4, 5, 8, 5, '#6b4a2a'); rect(x, 4, 5, 8, 2, '#8a6238');
  disc(x, 8, 6, 2, '#a3784a'); dot(x, 8, 6, '#6b4a2a');
  return c;
}
// ---- PORTAL: an obsidian archway with a glowing ember core (Emberhollow gate) -
function portal(): HTMLCanvasElement {
  const { c, x } = cv(28, 40);
  shadow(x, 14, 38, 10);
  // obsidian arch: rounded top + two pillars, with lit/shadowed stone edges
  disc(x, 14, 15, 13, '#2b2333');
  rect(x, 1, 15, 26, 23, '#2b2333');
  rect(x, 1, 15, 3, 23, '#3c3346'); rect(x, 24, 15, 3, 23, '#1f1828');
  // carve the inner mouth of the cave
  disc(x, 14, 16, 9, '#140d1b');
  rect(x, 5, 17, 18, 21, '#140d1b');
  // ember glow — concentric hot core (the "heat-haze" that seals it)
  disc(x, 14, 19, 8, '#7a1f5a');
  disc(x, 14, 20, 6, '#b3340a');
  disc(x, 14, 21, 4, '#f59e0b');
  disc(x, 14, 22, 2, '#ffe9a8');
  // rising sparks
  dot(x, 11, 14, '#ffd9a0'); dot(x, 17, 16, '#ffb870'); dot(x, 14, 11, '#fff0c8'); dot(x, 9, 20, '#ff9d5c');
  outline(x, 28, 40, '#0d0712');
  return c;
}

// ---- interior furniture ---------------------------------------------------
function bed(): HTMLCanvasElement {
  const { c, x } = cv(16, 30);
  rect(x, 1, 2, 14, 27, '#7a522e');
  rect(x, 2, 3, 12, 25, '#5b3d20');
  rect(x, 2, 4, 12, 9, '#ece3d2');
  rect(x, 3, 5, 10, 5, '#fbf6ec'); rect(x, 3, 5, 10, 1, '#ffffff'); // pillow
  rect(x, 2, 13, 12, 15, '#5aa0c2'); rect(x, 2, 13, 12, 2, '#7bb8d6'); rect(x, 2, 26, 12, 2, '#3f7fa6'); // blanket
  for (let i = 0; i < 3; i++) rect(x, 4 + i * 4, 15, 1, 11, '#4f8fae');
  outline(x, 16, 30, '#3a2a1c');
  return c;
}
function table(): HTMLCanvasElement {
  const { c, x } = cv(16, 16);
  shadow(x, 8, 14, 6);
  rect(x, 4, 11, 2, 4, '#6b4a2a'); rect(x, 10, 11, 2, 4, '#6b4a2a');
  rect(x, 2, 5, 12, 6, '#9a6838'); rect(x, 2, 5, 12, 2, '#b07a44'); rect(x, 2, 10, 12, 1, '#6f4a26');
  outline(x, 16, 16, '#3a2a1c');
  return c;
}
function chair(): HTMLCanvasElement {
  const { c, x } = cv(16, 16);
  shadow(x, 8, 14, 4);
  rect(x, 5, 3, 6, 8, '#8a5a32'); rect(x, 5, 3, 6, 1, '#a06b3a');
  rect(x, 4, 9, 8, 3, '#9a6838');
  rect(x, 4, 12, 2, 3, '#6b4a2a'); rect(x, 10, 12, 2, 3, '#6b4a2a');
  outline(x, 16, 16, '#3a2a1c');
  return c;
}
function bookshelf(): HTMLCanvasElement {
  const { c, x } = cv(16, 22);
  shadow(x, 8, 20, 6);
  rect(x, 2, 1, 12, 20, '#6b4a2a'); rect(x, 3, 2, 10, 18, '#4f3620');
  const books = ['#d76a5e', '#5aa0c2', '#7bd06f', '#ffd166', '#c792ea'];
  for (let s = 0; s < 3; s++) {
    const yy = 3 + s * 6;
    let bx = 4;
    while (bx < 12) { const w = 1 + ((bx + s) % 2) + 1; rect(x, bx, yy, w, 5, books[(bx + s) % books.length]); bx += w + 1; }
    rect(x, 3, yy + 5, 10, 1, '#3a2716');
  }
  outline(x, 16, 22, '#2a1c10');
  return c;
}
function counter(): HTMLCanvasElement {
  const { c, x } = cv(16, 16);
  rect(x, 0, 5, 16, 10, '#7a4f28');
  rect(x, 0, 4, 16, 3, '#a06b3a'); rect(x, 0, 4, 16, 1, '#bd854a');
  rect(x, 2, 9, 12, 1, '#5b3d20'); rect(x, 2, 12, 12, 1, '#5b3d20');
  return c;
}
function potPlant(): HTMLCanvasElement {
  const { c, x } = cv(16, 20);
  shadow(x, 8, 18, 5);
  rect(x, 5, 13, 6, 5, '#b5643c'); rect(x, 4, 12, 8, 2, '#caa06a'); rect(x, 5, 13, 1, 5, '#c8744a');
  disc(x, 8, 8, 5, '#357a38'); disc(x, 5, 7, 3, '#4ea64f'); disc(x, 10, 6, 3, '#4ea64f'); disc(x, 8, 4, 3, '#65bf63');
  dot(x, 7, 4, '#7bd06f');
  outline(x, 16, 20, '#22401f');
  return c;
}
function rugSprite(): HTMLCanvasElement {
  const { c, x } = cv(18, 14);
  x.fillStyle = '#9a6cff'; x.beginPath(); x.ellipse(9, 7, 8, 6, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c0a0ff'; x.beginPath(); x.ellipse(9, 7, 6, 4, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#7b4fd6'; x.beginPath(); x.ellipse(9, 7, 3, 2, 0, 0, Math.PI * 2); x.fill();
  return c;
}
function fireplace(): HTMLCanvasElement {
  const { c, x } = cv(18, 24);
  rect(x, 1, 3, 16, 20, '#8e93a6'); rect(x, 1, 3, 16, 2, '#abb0c2');
  for (let i = 0; i < 16; i += 4) rect(x, 1 + i, 8, 1, 15, '#73788a');
  rect(x, 4, 12, 10, 11, '#2a2026');
  rect(x, 5, 17, 8, 6, '#e0742a'); rect(x, 6, 19, 6, 4, '#ffb43a'); rect(x, 8, 20, 2, 3, '#ffe79a');
  rect(x, 0, 1, 18, 3, '#7a7f90');
  outline(x, 18, 24, '#3a3540');
  return c;
}
function labmachine(): HTMLCanvasElement {
  const { c, x } = cv(16, 22);
  shadow(x, 8, 20, 6);
  rect(x, 2, 4, 12, 17, '#aeb6c2'); rect(x, 2, 4, 12, 2, '#cdd4de'); rect(x, 2, 19, 12, 2, '#878fa0');
  rect(x, 4, 7, 8, 6, '#0c2030'); rect(x, 5, 8, 6, 4, '#3ad6c8');
  rect(x, 4, 15, 2, 2, '#e5484d'); rect(x, 7, 15, 2, 2, '#ffd166'); rect(x, 10, 15, 2, 2, '#53d769');
  outline(x, 16, 22, '#3a3f48');
  return c;
}
function painting(): HTMLCanvasElement {
  const { c, x } = cv(16, 12);
  rect(x, 1, 1, 14, 10, '#caa05a'); rect(x, 2, 2, 12, 8, '#2c3d66');
  rect(x, 2, 7, 12, 3, '#3a7a3f');
  disc(x, 11, 4, 2, '#ffe79a');
  outline(x, 16, 12, '#5a4326');
  return c;
}

function altar(): HTMLCanvasElement {
  const { c, x } = cv(20, 24);
  shadow(x, 10, 22, 7);
  rect(x, 3, 13, 14, 9, '#8a7a6a'); rect(x, 3, 13, 14, 2, '#a59585'); rect(x, 3, 20, 14, 2, '#6f6050'); // stone base
  rect(x, 2, 9, 16, 6, '#efe7d9'); rect(x, 2, 9, 16, 2, '#ffffff'); // white cloth
  rect(x, 2, 14, 16, 1, '#d9a93a'); rect(x, 2, 13, 16, 1, '#c9bca8'); // gold hem
  rect(x, 9, 0, 2, 9, '#d9b35a'); rect(x, 6, 2, 8, 2, '#d9b35a');     // gold cross
  outline(x, 20, 24, '#3a2a1c');
  return c;
}
function pew(): HTMLCanvasElement {
  const { c, x } = cv(24, 16);
  shadow(x, 12, 14, 9);
  rect(x, 2, 3, 20, 3, '#7d5733'); rect(x, 2, 3, 20, 1, '#9a6e44');   // backrest
  rect(x, 1, 7, 22, 4, '#8a6238'); rect(x, 1, 7, 22, 1, '#a3784a'); rect(x, 1, 10, 22, 1, '#5b3d20'); // seat
  rect(x, 3, 11, 2, 4, '#5b3d20'); rect(x, 19, 11, 2, 4, '#5b3d20');  // legs
  outline(x, 24, 16, '#2a1c10');
  return c;
}
function candle(): HTMLCanvasElement {
  const { c, x } = cv(8, 16);
  shadow(x, 4, 15, 3);
  rect(x, 2, 11, 4, 4, '#caa05a'); rect(x, 3, 10, 2, 1, '#e0bd6a');   // holder
  rect(x, 3, 4, 2, 7, '#f0e6d0');                                     // candle
  disc(x, 4, 2, 2, 'rgba(255,200,80,0.35)'); rect(x, 3, 1, 2, 3, '#ffb43a'); dot(x, 3, 0, '#ffe79a'); // flame
  return c;
}

export function generateObjectArt(scene: Phaser.Scene): void {
  register(scene, 'tree0', tree(11, ['#2c6b35', '#3a8a44', '#54b257', '#7bd06f'], 0));
  register(scene, 'tree1', tree(29, ['#2f7338', '#46974a', '#62b85e', '#8ad673'], 1));
  register(scene, 'tree2', tree(47, ['#356b2c', '#4a9a3f', '#67bf52', '#8fd06f'], 2));
  register(scene, 'pine0', pine(63));
  // Each building a distinct design: different roof shape + proportions + features.
  register(scene, 'cottage', house({ W: 64, H: 62, wall: ['#ecd2a8', '#d9b98a', '#b8946a'], roof: ['#d76a5e', '#bf4f44', '#9a3a30'], roofType: 'gable', winCols: 2 }));            // cosy square, peaked roof
  register(scene, 'townhouse', house({ W: 66, H: 84, wall: ['#e6dcc8', '#cdbfa3', '#a89878'], roof: ['#5aa0c2', '#3f7fa6', '#2f5f80'], roofType: 'gable', winCols: 2 }));         // tall + narrow
  register(scene, 'cabin', house({ W: 66, H: 62, wall: ['#a9824f', '#8a6638', '#6b4a2a'], roof: ['#5a8a4a', '#447a3a', '#356b2c'], roofType: 'gable', log: true, winCols: 2 }));   // rustic log + peaked
  register(scene, 'lab', house({ W: 76, H: 66, wall: ['#e8eef2', '#cdd6dd', '#a9b4bd'], roof: ['#3aa6a0', '#2c8580', '#1f6360'], roofType: 'flat', rooftop: 'antenna', sign: '#9a6cff', winCols: 2 })); // flat institutional
  register(scene, 'shop', house({ W: 80, H: 58, wall: ['#ecd2a8', '#d9b98a', '#b8946a'], roof: ['#e0a347', '#bf8430', '#9a6720'], roofType: 'hip', awning: ['#d64545', '#f7e3b0'], sign: '#7bd06f', winCols: 2 })); // wide storefront + awning
  register(scene, 'manor', house({ W: 84, H: 74, wall: ['#c9c2b4', '#aaa294', '#857d6e'], roof: ['#7a5aa0', '#5f4a80', '#453560'], roofType: 'hip', winCols: 2 }));               // grand hip roof
  register(scene, 'church', church());
  register(scene, 'altar', altar());
  register(scene, 'pew', pew());
  register(scene, 'candle', candle());
  register(scene, 'fence', fence());
  register(scene, 'sign', sign());
  register(scene, 'shrine', shrine());
  register(scene, 'lamp', lamp());
  register(scene, 'bush', bush());
  register(scene, 'stump', stump());
  register(scene, 'portal', portal());
  // interior furniture
  register(scene, 'bed', bed());
  register(scene, 'table', table());
  register(scene, 'chair', chair());
  register(scene, 'bookshelf', bookshelf());
  register(scene, 'counter', counter());
  register(scene, 'pot', potPlant());
  register(scene, 'rug', rugSprite());
  register(scene, 'fireplace', fireplace());
  register(scene, 'labmachine', labmachine());
  register(scene, 'painting', painting());
}
