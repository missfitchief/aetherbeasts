// Procedural character walk-sheets — 16x16 frames, 4 rows (right/up/left/down) x
// 4 walk frames = a 64x64 RGBA sheet, matching the existing char_*_sheet.png format.
// PURE pixel code (no Phaser import) so it can also run offline for previews.
// A config (skin/hair/top/bottom/style) drives the look — this powers both the
// first-login character creator and unlimited NPC variety.

export type RGB = [number, number, number];
export type HairStyle = 'short' | 'long' | 'spiky' | 'bald';
export type Hat = 'none' | 'cap';

export interface CharacterConfig {
  skin: RGB;
  hair: RGB;
  hairStyle: HairStyle;
  top: RGB;
  bottom: RGB;
  shoe: RGB;
  hat: Hat;
  hatColor: RGB;
}

export const FRAME = 16;
export const COLS = 4;
export const ROWS = 4;
export const SHEET_W = FRAME * COLS; // 64
export const SHEET_H = FRAME * ROWS; // 64

// Row order must match DIR_ROW in OverworldScene: right=0, up=1, left=2, down=3.
const ROW_RIGHT = 0, ROW_UP = 1, ROW_LEFT = 2, ROW_DOWN = 3;

// --- creator palettes -------------------------------------------------------
export const SKIN_TONES: RGB[] = [
  [255, 220, 178], [245, 199, 150], [222, 167, 121], [188, 130, 92], [141, 91, 67], [99, 63, 47],
];
export const HAIR_COLORS: RGB[] = [
  [40, 32, 28], [92, 58, 38], [150, 95, 55], [222, 178, 92], [196, 70, 56], [120, 80, 170], [70, 130, 190], [225, 225, 230],
];
export const TOP_COLORS: RGB[] = [
  [206, 67, 67], [70, 120, 200], [80, 170, 110], [225, 180, 70], [150, 95, 175], [60, 175, 185], [235, 235, 240], [70, 78, 95],
];
export const BOTTOM_COLORS: RGB[] = [
  [60, 70, 95], [80, 64, 50], [45, 50, 58], [110, 90, 70], [70, 110, 90], [120, 60, 70],
];
export const HAIR_STYLES: HairStyle[] = ['short', 'long', 'spiky', 'bald'];

export const DEFAULT_CONFIG: CharacterConfig = {
  skin: SKIN_TONES[1], hair: HAIR_COLORS[1], hairStyle: 'short',
  top: TOP_COLORS[0], bottom: BOTTOM_COLORS[0], shoe: [50, 40, 35], hat: 'none', hatColor: TOP_COLORS[1],
};

// --- drawing helpers --------------------------------------------------------
const shade = (c: RGB, f = 0.72): RGB => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
const OUTLINE: RGB = [26, 22, 30];

class Frame {
  buf: Uint8ClampedArray;
  constructor(buf: Uint8ClampedArray, public ox: number, public oy: number) { this.buf = buf; }
  px(x: number, y: number, c: RGB, a = 255) {
    if (x < 0 || x > 15 || y < 0 || y > 15) return;
    const i = ((this.oy + y) * SHEET_W + (this.ox + x)) * 4;
    this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2]; this.buf[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) this.px(x + k, y + j, c);
  }
  alpha(x: number, y: number): number {
    if (x < 0 || x > 15 || y < 0 || y > 15) return 0;
    return this.buf[((this.oy + y) * SHEET_W + (this.ox + x)) * 4 + 3];
  }
}

// legs: returns per-frame foot vertical offsets (a simple 4-step walk cycle).
function legSwing(frame: number): [number, number] {
  switch (frame) {
    case 1: return [-1, 0];  // left foot lifts
    case 3: return [0, -1];  // right foot lifts
    default: return [0, 0];  // contact / passing
  }
}

function drawHair(f: Frame, cfg: CharacterConfig, dir: number, bob: number) {
  const h = cfg.hair, hs = shade(h);
  if (cfg.hairStyle === 'bald') return;
  const y = 1 + bob;
  // crown common to all directions
  f.rect(5, y + 1, 6, 1, h);
  f.rect(6, y, 4, 1, h);
  if (dir === ROW_DOWN) {
    f.px(5, y + 2, h); f.px(10, y + 2, h);                 // side bangs
    if (cfg.hairStyle === 'long') { f.px(5, y + 3, hs); f.px(10, y + 3, hs); }
    if (cfg.hairStyle === 'spiky') { f.px(5, y, h); f.px(7, y - 1, h); f.px(9, y - 1, h); f.px(10, y, h); }
  } else if (dir === ROW_UP) {
    f.rect(5, y + 2, 6, 3, h);                              // back of head all hair
    f.rect(5, y + 4, 6, 1, hs);
    if (cfg.hairStyle === 'long') f.rect(5, y + 5, 6, 1, hs);
    if (cfg.hairStyle === 'spiky') { f.px(7, y - 1, h); f.px(9, y - 1, h); }
  } else { // side
    f.rect(5, y + 2, 5, 1, h); f.px(5, y + 3, h);          // hair wraps back of head
    if (cfg.hairStyle === 'long') f.px(5, y + 4, hs);
    if (cfg.hairStyle === 'spiky') { f.px(5, y, h); f.px(4, y + 1, h); }
  }
}

function drawHat(f: Frame, cfg: CharacterConfig, dir: number, bob: number) {
  if (cfg.hat !== 'cap') return;
  const c = cfg.hatColor, cs = shade(c);
  const y = 1 + bob;
  f.rect(5, y, 6, 2, c);
  f.rect(5, y + 1, 6, 1, cs);
  if (dir === ROW_DOWN) f.rect(6, y + 2, 5, 1, c);          // brim toward viewer
  if (dir === ROW_RIGHT) f.rect(9, y + 1, 3, 1, c);         // brim forward
}

function drawCharacter(f: Frame, cfg: CharacterConfig, dir: number, frame: number) {
  const { skin, top, bottom, shoe } = cfg;
  const skinS = shade(skin), topS = shade(top), botS = shade(bottom);
  const bob = (frame === 1 || frame === 3) ? -1 : 0; // gentle head/torso bob mid-stride
  const [lf, rf] = legSwing(frame);

  // ---- head (skin) ----
  const hy = 2 + bob;
  f.rect(6, hy, 4, 5, skin);
  f.px(5, hy + 1, skin); f.px(10, hy + 1, skin);
  f.px(5, hy + 2, skin); f.px(10, hy + 2, skin);
  f.rect(6, hy + 4, 4, 1, skinS); // chin shadow
  // face
  if (dir === ROW_DOWN) {
    f.px(6, hy + 2, OUTLINE); f.px(9, hy + 2, OUTLINE);    // two eyes
    f.px(7, hy + 4, skinS); f.px(8, hy + 4, skinS);        // mouth area
  } else if (dir === ROW_RIGHT) {
    f.px(9, hy + 2, OUTLINE);                              // one eye, facing right
  } else if (dir === ROW_LEFT) {
    f.px(6, hy + 2, OUTLINE);
  }

  // ---- torso (shirt) ----
  const ty = 8 + bob;
  f.rect(5, ty, 6, 4, top);
  f.rect(5, ty + 3, 6, 1, topS);                           // shirt hem shadow
  // arms (skin hands, shirt sleeves) — swing opposite to legs on the sides
  const armUp = dir === ROW_RIGHT || dir === ROW_LEFT;
  const lArmY = armUp ? ty + (frame === 1 ? -1 : 0) : ty;
  const rArmY = armUp ? ty + (frame === 3 ? -1 : 0) : ty;
  f.px(4, lArmY, top); f.px(4, lArmY + 1, top); f.px(4, lArmY + 2, skin);
  f.px(11, rArmY, top); f.px(11, rArmY + 1, top); f.px(11, rArmY + 2, skin);

  // ---- legs (pants) + feet (shoes) ----
  const ly = 12 + bob;
  // left leg (x5-6), right leg (x9-10) for front/back; for side they stack
  if (dir === ROW_DOWN || dir === ROW_UP) {
    f.rect(5, ly + lf, 2, 2, bottom); f.px(5, ly + 1 + lf, botS);
    f.rect(9, ly + rf, 2, 2, bottom); f.px(9, ly + 1 + rf, botS);
    f.rect(5, ly + 2 + lf, 2, 1, shoe);
    f.rect(9, ly + 2 + rf, 2, 1, shoe);
    // center fill so torso connects to legs
    f.rect(7, ly, 2, 1, bottom);
  } else {
    // side view: one leg forward, one back
    const fwd = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    f.rect(7 + fwd, ly, 2, 2, bottom); f.rect(7 + fwd, ly + 2, 2, 1, shoe);
    f.rect(7 - fwd, ly, 2, 2, botS); f.rect(7 - fwd, ly + 2, 2, 1, shade(shoe));
  }

  drawHair(f, cfg, dir, bob);
  drawHat(f, cfg, dir, bob);
}

// outline pass: darken silhouette-edge pixels so the tiny sprite reads clearly.
function outlinePass(f: Frame) {
  const snapshot: number[] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) snapshot.push(f.alpha(x, y));
  const at = (x: number, y: number) => (x < 0 || x > 15 || y < 0 || y > 15) ? 0 : snapshot[y * 16 + x];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (at(x, y) !== 0) continue;
    if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) f.px(x, y, OUTLINE);
  }
}

const look = (
  skin: number, hair: number, hairStyle: HairStyle, top: number, bottom: number,
  hat: Hat = 'none', hatColor = 1,
): CharacterConfig => ({
  skin: SKIN_TONES[skin], hair: HAIR_COLORS[hair], hairStyle,
  top: TOP_COLORS[top], bottom: BOTTOM_COLORS[bottom], shoe: [50, 40, 35], hat, hatColor: TOP_COLORS[hatColor],
});

/** Preset looks registered under the existing sheet keys (so all NPCs get fresh
 *  procedural art) plus extra villager looks for variety. `sheet_player` is the
 *  fallback/remote default. */
export const NPC_LOOKS: Record<string, CharacterConfig> = {
  sheet_player: look(1, 1, 'short', 0, 0),               // default red, brown hair
  sheet_professor: look(1, 7, 'short', 6, 2),            // white lab coat, grey hair
  sheet_guy: look(2, 1, 'short', 1, 1),                  // casual, blue top
  sheet_schoolgirl: look(0, 4, 'long', 4, 5),            // long red hair, purple top
  sheet_hiker: look(3, 1, 'short', 2, 1, 'cap', 2),      // green outfit + cap
  sheet_villager_a: look(1, 3, 'spiky', 5, 0),           // spiky blond, teal top
  sheet_villager_b: look(4, 0, 'short', 6, 2, 'cap', 0), // dark skin, white top, red cap
  sheet_villager_c: look(2, 6, 'long', 3, 4),            // long blue hair, gold top
};

/** Build the full 64x64 RGBA sheet for a character config. */
export function drawSheet(cfg: CharacterConfig): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(SHEET_W * SHEET_H * 4); // transparent
  const rows = [ROW_RIGHT, ROW_UP, ROW_LEFT, ROW_DOWN];
  for (const dir of rows) {
    for (let frame = 0; frame < COLS; frame++) {
      const f = new Frame(buf, frame * FRAME, dir * FRAME);
      drawCharacter(f, cfg, dir, frame);
      outlinePass(f);
    }
  }
  return buf;
}
