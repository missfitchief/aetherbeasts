// Process an img2img-generated character sheet (1024x1024) into a game-ready
// 64x64 walk-sheet: downscale to 16px frames + key the flat background to
// transparent. Outputs the sheet + a scaled preview.
// Run: node tools/process-charsheet.mjs <in.png> <outName>
import Jimp from 'jimp';

const [, , inPath, outName] = process.argv;
const img = await Jimp.read(inPath);
img.resize(64, 64); // 1024 -> 64 (each 16px AI block -> 1px frame pixel)

// key the background: sample the four corners, drop pixels close to it
const corners = [[1, 1], [62, 1], [1, 62], [62, 62]].map(([x, y]) => Jimp.intToRGBA(img.getPixelColor(x, y)));
const bg = corners[0];
const TOL = 46;
img.scan(0, 0, 64, 64, (x, y, idx) => {
  const r = img.bitmap.data[idx], g = img.bitmap.data[idx + 1], b = img.bitmap.data[idx + 2];
  if (Math.abs(r - bg.r) < TOL && Math.abs(g - bg.g) < TOL && Math.abs(b - bg.b) < TOL) img.bitmap.data[idx + 3] = 0;
});
console.log('bg corner ~', bg);

await img.writeAsync(`client/public/assets/char/char_${outName}_sheet.png`);
const prev = img.clone().resize(64 * 6, 64 * 6, Jimp.RESIZE_NEAREST_NEIGHBOR);
await prev.writeAsync(`_${outName}_prev.png`);
console.log(`wrote char_${outName}_sheet.png + preview`);
