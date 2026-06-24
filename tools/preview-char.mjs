// Offline preview of the procedural character generator: renders several configs'
// full 64x64 walk-sheets scaled up onto one image so the art can be eyeballed.
// Run: node --import tsx tools/preview-char.mjs
import Jimp from 'jimp';
import { drawSheet, SKIN_TONES, HAIR_COLORS, TOP_COLORS, BOTTOM_COLORS } from '../client/src/game/world/characterart.ts';

const C = (skin, hair, hairStyle, top, bottom, hat = 'none', hatColor = TOP_COLORS[1]) => ({
  skin: SKIN_TONES[skin], hair: HAIR_COLORS[hair], hairStyle,
  top: TOP_COLORS[top], bottom: BOTTOM_COLORS[bottom], shoe: [50, 40, 35], hat, hatColor: TOP_COLORS[hatColor],
});

const configs = [
  C(1, 1, 'short', 0, 0),
  C(0, 5, 'long', 4, 5),
  C(3, 0, 'spiky', 1, 2),
  C(2, 3, 'short', 3, 1, 'cap', 0),
  C(4, 7, 'long', 5, 4),
  C(5, 4, 'bald', 7, 3, 'cap', 1),
];

const SCALE = 7, CELL = 64 * SCALE; // 448 px per config
const cols = 3, rows = Math.ceil(configs.length / cols);
const out = await Jimp.create(cols * CELL, rows * CELL, 0x9aa3b2ff);

for (let i = 0; i < configs.length; i++) {
  const rgba = drawSheet(configs[i]);
  const cell = await Jimp.create(64, 64, 0x00000000);
  cell.bitmap.data = Buffer.from(rgba.buffer.slice(0));
  cell.resize(CELL, CELL, Jimp.RESIZE_NEAREST_NEIGHBOR);
  out.composite(cell, (i % cols) * CELL, Math.floor(i / cols) * CELL);
}
await out.writeAsync('_charpreview.png');
console.log('wrote _charpreview.png', out.bitmap.width + 'x' + out.bitmap.height);
