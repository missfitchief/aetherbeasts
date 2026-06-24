// Process the final 4 roster lines (duvan/pidgreat, jestar/cardemon, moldole/shroomole,
// spookshroom/wraithmanita) into game sprites: key flat-white bg to transparent,
// autocrop, nearest-neighbor downscale to match scale, OVERWRITE mon_<id>.png.
// Run: node tools/process-roster2.mjs   (needs jimp@0.22)
import Jimp from 'jimp';

const MON = 'client/public/assets/mon';
const TARGET = 128;

async function proc(url, outId) {
  const img = await Jimp.read(url);
  const W = img.bitmap.width, H = img.bitmap.height;
  img.scan(0, 0, W, H, (x, y, idx) => {
    const r = img.bitmap.data[idx], g = img.bitmap.data[idx + 1], b = img.bitmap.data[idx + 2];
    if (r > 235 && g > 235 && b > 235) img.bitmap.data[idx + 3] = 0;
  });
  img.autocrop({ tolerance: 0.004, cropOnlyFrames: false });
  const w = img.bitmap.width, h = img.bitmap.height;
  const s = TARGET / Math.max(w, h);
  img.resize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), Jimp.RESIZE_NEAREST_NEIGHBOR);
  await img.writeAsync(`${MON}/mon_${outId}.png`);
  console.log(`wrote mon_${outId}.png  ${img.bitmap.width}x${img.bitmap.height}`);
}

const BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3FUKiGHbpHsjcoLy1Ditn2jVKHx';
const JOBS = [
  [`${BASE}/hf_20260624_153354_6c3ac76e-43ba-4147-ae69-937003e9cd72.png`, 'duvan'],
  [`${BASE}/hf_20260624_153532_c9e34c72-244b-46d4-b76f-473f81ffa264.png`, 'pidgreat'],
  [`${BASE}/hf_20260624_153357_d2eba398-8f29-46f6-a2b5-07833e2acc62.png`, 'jestar'],
  [`${BASE}/hf_20260624_153727_c7bbc36a-bd4e-46bc-a0e2-a0402ee06634.png`, 'cardemon'],
  [`${BASE}/hf_20260624_153400_0c00d581-3caf-495d-9aab-f89f35ca6b25.png`, 'moldole'],
  [`${BASE}/hf_20260624_153535_e45b7547-0261-411b-9318-61e5c4fd5305.png`, 'shroomole'],
  [`${BASE}/hf_20260624_153402_28f35cfd-bffb-43fc-8b7d-ed7a015eb6fd.png`, 'spookshroom'],
  [`${BASE}/hf_20260624_153539_4a69c8ce-ae3e-4b36-8118-519b375a4367.png`, 'wraithmanita'],
];
for (const [u, id] of JOBS) await proc(u, id);
