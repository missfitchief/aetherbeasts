// Turn generated 1024px creature art into game-ready sprites:
// key the flat-white background to transparent, autocrop, then nearest-neighbor
// downscale to match the existing hand-pixel sprites. Run: node tools/process-mon.mjs
import Jimp from 'jimp';

const MON = 'client/public/assets/mon';

// Match the scale of the existing sprites (use Drachnid as the yardstick).
const ref = await Jimp.read(`${MON}/mon_drachnid.png`);
const TARGET = Math.max(ref.bitmap.width, ref.bitmap.height);
console.log('reference max-dim =', TARGET);

async function proc(url, outId) {
  const img = await Jimp.read(url);
  const W = img.bitmap.width, H = img.bitmap.height;
  // key near-white background pixels to transparent
  img.scan(0, 0, W, H, (x, y, idx) => {
    const r = img.bitmap.data[idx], g = img.bitmap.data[idx + 1], b = img.bitmap.data[idx + 2];
    if (r > 235 && g > 235 && b > 235) img.bitmap.data[idx + 3] = 0;
  });
  img.autocrop({ tolerance: 0.004, cropOnlyFrames: false }); // trim transparent margins
  const w = img.bitmap.width, h = img.bitmap.height;
  const s = TARGET / Math.max(w, h);
  img.resize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), Jimp.RESIZE_NEAREST_NEIGHBOR);
  await img.writeAsync(`${MON}/mon_${outId}.png`);
  console.log(`wrote mon_${outId}.png  ${img.bitmap.width}x${img.bitmap.height}`);
}

const BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3FUKiGHbpHsjcoLy1Ditn2jVKHx';
const JOBS = [
  [`${BASE}/hf_20260624_143857_390333f0-7234-4f39-8243-3f3be9c4705c.jpeg`, 'magmaclaw'],
  [`${BASE}/hf_20260624_145003_7d443bd5-c910-4115-8030-96c5e5cf19e8.png`, 'cindermaw'],
  [`${BASE}/hf_20260624_145006_a87b4994-32d5-4fe8-85a3-ec6ed5abac53.png`, 'voidmanita'],
  [`${BASE}/hf_20260624_145008_beefa3af-f99d-438a-82bb-10485deb0188.png`, 'prismleviath'],
];
for (const [u, id] of JOBS) await proc(u, id);
