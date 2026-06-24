// Generate recolored "elite variant" creature sprites from the base art.
// Uses a MULTIPLY tint (+ brightness boost) so the whole creature takes on a
// cohesive themed colour while keeping its shading. Skips transparent pixels.
// Run: node tools/make-variants.mjs   (needs: npm i -D pngjs)
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';

const MON = 'client/public/assets/mon';
const clamp = (n) => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));

/** Multiply each pixel by a tint colour (0..255) with a brightness boost. */
function recolor(base, out, [tr, tg, tb], boost = 1.35) {
  const png = PNG.sync.read(readFileSync(`${MON}/mon_${base}.png`));
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue; // keep transparency
    png.data[i] = clamp(png.data[i] * (tr / 255) * boost);
    png.data[i + 1] = clamp(png.data[i + 1] * (tg / 255) * boost);
    png.data[i + 2] = clamp(png.data[i + 2] * (tb / 255) * boost);
  }
  writeFileSync(`${MON}/mon_${out}.png`, PNG.sync.write(png));
  console.log('wrote mon_' + out + '.png');
}

// Emberhollow elites + Aether League elites — distinct cohesive palettes.
recolor('charachne', 'magmaclaw', [255, 150, 40], 1.5);    // molten gold-orange
recolor('ratssive', 'cindermaw', [150, 140, 165], 1.25);   // ashen steel
recolor('wraithmanita', 'voidmanita', [165, 90, 235], 1.4); // void purple
recolor('leviocean', 'prismleviath', [80, 235, 220], 1.45); // prismatic cyan
