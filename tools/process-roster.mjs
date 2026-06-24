// Process the new AI roster art (3 starter lines + Grodent line) into game sprites:
// key flat-white bg to transparent, autocrop, nearest-neighbor downscale to match
// the existing sprite scale, then OVERWRITE the existing mon_<id>.png.
// Run: node tools/process-roster.mjs   (needs jimp@0.22)
import Jimp from 'jimp';

const MON = 'client/public/assets/mon';
const TARGET = 128; // established sprite scale (max dimension)

async function proc(url, outId) {
  const img = await Jimp.read(url);
  const W = img.bitmap.width, H = img.bitmap.height;
  img.scan(0, 0, W, H, (x, y, idx) => {
    const r = img.bitmap.data[idx], g = img.bitmap.data[idx + 1], b = img.bitmap.data[idx + 2];
    if (r > 235 && g > 235 && b > 235) img.bitmap.data[idx + 3] = 0; // key near-white
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
  [`${BASE}/hf_20260624_151117_b4736f65-5088-4971-a3f6-369805b6fa84.png`, 'drachnid'],
  [`${BASE}/hf_20260624_152326_0bc539e8-2afc-42a1-af05-7adbb2286574.png`, 'plaugspout'],
  [`${BASE}/hf_20260624_152054_b1f7d916-3e54-45e1-88cc-ce8f8e9f3c75.png`, 'draquatic'],
  [`${BASE}/hf_20260624_152057_952bb1a4-6a72-4e01-b1dd-f3d5d5bd94ed.jpeg`, 'grodent'],
  [`${BASE}/hf_20260624_152244_bb1efb29-5fb9-4542-a570-54643c2193b1.jpeg`, 'charachne'],
  [`${BASE}/hf_20260624_152431_ababdefc-7697-44ac-9989-5362d99f8eab.png`, 'flowrath'],
  [`${BASE}/hf_20260624_152251_50237ed2-7454-46eb-babd-fb4a23812c8c.png`, 'leviocean'],
  [`${BASE}/hf_20260624_152253_00c8a873-b904-405b-86e7-0f0161c1265d.png`, 'ratssive'],
];
for (const [u, id] of JOBS) await proc(u, id);
