// Recolor the engine's character walk-sheets: hue-rotate the OUTFIT (saturated,
// non-skin/hair pixels) while preserving skin tones + hair, so one good base
// sprite yields many clean variants in the same style. Pure (no Phaser) so it
// runs in both the React creator preview and the Phaser scene.

/** The five engine body types the player can choose from. */
export const CHAR_BASES: { key: string; name: string }[] = [
  { key: 'sheet_player', name: 'Adventurer' },
  { key: 'sheet_guy', name: 'Rookie' },
  { key: 'sheet_hiker', name: 'Ranger' },
  { key: 'sheet_schoolgirl', name: 'Scholar' },
  { key: 'sheet_professor', name: 'Elder' },
];

/** Outfit colours offered in the creator (hue rotations; 0 keeps the original). */
export const OUTFIT_HUES: number[] = [0, 35, 90, 140, 190, 235, 285, 320];

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2; const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const t = (u: number) => { if (u < 0) u += 1; if (u > 1) u -= 1; if (u < 1 / 6) return p + (q - p) * 6 * u; if (u < 1 / 2) return q; if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6; return p; };
  return [Math.round(t(h + 1 / 3) * 255), Math.round(t(h) * 255), Math.round(t(h - 1 / 3) * 255)];
}

/** In-place hue-rotate the outfit pixels of an RGBA buffer (skin/hair preserved). */
export function recolorOutfit(data: Uint8ClampedArray | Uint8Array, hueDeg: number): void {
  if (!hueDeg) return; // 0 = original, nothing to do
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [h, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
    const hd = h * 360;
    const skinOrHair = hd >= 12 && hd <= 48; // tan / orange / brown — keep natural
    if (s > 0.25 && !skinOrHair) {
      let nh = (h + hueDeg / 360) % 1; if (nh < 0) nh += 1;
      const [r, g, b] = hsl2rgb(nh, s, l);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
}
