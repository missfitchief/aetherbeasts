/**
 * Extracts the sprites + audio we use from the source GameMaker engine
 * (tools/_engine, unzipped from the provided .yyz) into client/public/assets.
 *
 * GameMaker stores each sprite frame as `<sprite>/<guid>.png` with frame order
 * in the `.yy` (`frames:[...]`). Sounds store the raw OGG/WAV as
 * `<sound>/<soundFile>` (no extension). We copy + build a manifest.json.
 *
 * Run: node tools/extract-assets.mjs   (from the repo root)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENGINE = path.join(ROOT, 'tools', '_engine');
const OUT = path.join(ROOT, 'client', 'public', 'assets');

function readYY(file) {
  const raw = fs.readFileSync(file, 'utf8');
  // GameMaker .yy is JSON with trailing commas — strip them.
  return JSON.parse(raw.replace(/,(\s*[}\]])/g, '$1'));
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

// --- Species id -> engine sprite folder (one spelling mismatch) -------------
const SPECIES_IDS = [
  'drachnid', 'charachne', 'plaugspout', 'flowrath', 'draquatic', 'leviocean',
  'grodent', 'ratssive', 'duvan', 'pidgreat', 'jestar', 'cardemon',
  'moldole', 'shroomole', 'spookshroom', 'wraithmanita',
];
const SPRITE_FOLDER = (id) => (id === 'plaugspout' ? 'spr_mon_plaugsprout' : `spr_mon_${id}`);

// --- Extra sprites (ui / fx / world tiles / characters) ---------------------
const EXTRA_SPRITES = [
  ['ui_catchball', 'spr_catchball', 'ui'],
  ['ui_forcefield', 'spr_catchforcefield', 'ui'],
  ['ui_ailments', 'spr_ailmenticons', 'ui'],
  ['ui_messagebox', 'spr_messagebox', 'ui'],
  ['fx_fire', 'spr_fx_fire1', 'fx'],
  ['fx_leaf', 'spr_fx_leaf', 'fx'],
  ['fx_bubble', 'spr_fx_bubble1', 'fx'],
  ['fx_star', 'spr_fx_star', 'fx'],
  ['fx_wind', 'spr_fx_wind1', 'fx'],
  ['fx_sand', 'spr_fx_sand', 'fx'],
  ['fx_ghost', 'spr_fx_ghost1', 'fx'],
  ['fx_spore', 'spr_fx_spore', 'fx'],
  // World tilesets (16px tiles; outdoors = 20x16 grid)
  ['tiles_outdoors', 'spr_tileset_outdoors', 'world'],
  ['tiles_indoors', 'spr_tileset_indoors', 'world'],
  // Character walk sheets (64x64 = 4 dirs x 4 frames)
  ['char_player_sheet', 'spr_player', 'char'],
  ['char_professor_sheet', 'spr_npc_professor', 'char'],
  ['char_hiker_sheet', 'spr_npc_hiker', 'char'],
  ['char_schoolgirl_sheet', 'spr_npc_schoolgirl', 'char'],
  ['char_guy_sheet', 'spr_npc_guy1', 'char'],
  // Standing NPCs (16x36)
  ['npc_shopkeeper', 'spr_shopkeeper', 'char'],
  ['npc_shrinemaiden', 'spr_shrinemaiden', 'char'],
];

// --- Audio (key -> engine sound folder) -------------------------------------
const AUDIO = {
  // music
  bgm_title: ['bgm_titlescreen', 'music'],
  bgm_forest: ['bgm_forest', 'music'],
  bgm_town: ['bgm_city_gold', 'music'],
  bgm_battle: ['bgm_battle', 'music'],
  bgm_shrine: ['bgm_shrine', 'music'],
  // jingles
  jingle_win: ['jingle_battlewin_wild', 'sfx'],
  jingle_levelup: ['jingle_monupgrade', 'sfx'],
  jingle_evolve: ['jingle_evolution', 'sfx'],
  jingle_heal: ['jingle_shrineheal', 'sfx'],
  jingle_battle_intro: ['jingle_battle_intro', 'sfx'],
  // sfx
  sfx_ok: ['snd_menu_ok', 'sfx'],
  sfx_move: ['snd_menu_move', 'sfx'],
  sfx_buzzer: ['snd_menu_buzzer', 'sfx'],
  sfx_tackle: ['snd_tackle', 'sfx'],
  sfx_bite: ['snd_bite', 'sfx'],
  sfx_fireball: ['snd_fireball', 'sfx'],
  sfx_bubble: ['snd_bubble', 'sfx'],
  sfx_leaf: ['snd_leafexplode', 'sfx'],
  sfx_magicstar: ['snd_magicstar', 'sfx'],
  sfx_sand: ['snd_sandblade', 'sfx'],
  sfx_damage: ['snd_damageapply', 'sfx'],
  sfx_catch_start: ['snd_catch_start', 'sfx'],
  sfx_catch_roll: ['snd_catch_roll', 'sfx'],
  sfx_catch_success: ['snd_catch_success', 'sfx'],
  sfx_catch_fail: ['snd_catch_fail', 'sfx'],
  sfx_heal: ['snd_healitem', 'sfx'],
  sfx_purchase: ['snd_shoppurchase', 'sfx'],
};

const manifest = { sprites: {}, audio: {} };

function extractSprite(key, folder, category) {
  const dir = path.join(ENGINE, 'sprites', folder);
  const yyPath = path.join(dir, `${folder}.yy`);
  if (!fs.existsSync(yyPath)) {
    console.warn(`! sprite missing: ${folder}`);
    return;
  }
  const yy = readYY(yyPath);
  const frames = (yy.frames || []).map((f) => f.name);
  const w = yy.width;
  const h = yy.height;
  const fps = yy.sequence?.playbackSpeed ?? 0;

  if (frames.length <= 1) {
    const src = path.join(dir, `${frames[0]}.png`);
    const destRel = `${category}/${key}.png`;
    const dest = path.join(OUT, destRel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    manifest.sprites[key] = { category, w, h, frames: 1, fps, path: destRel };
  } else {
    const destDirRel = `${category}/${key}`;
    ensureDir(path.join(OUT, destDirRel));
    frames.forEach((guid, i) => {
      fs.copyFileSync(path.join(dir, `${guid}.png`), path.join(OUT, destDirRel, `${i}.png`));
    });
    manifest.sprites[key] = { category, w, h, frames: frames.length, fps, path: `${destDirRel}/`, sheet: false };
  }
}

function detectAudioExt(file) {
  const buf = Buffer.alloc(4);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  const sig = buf.toString('ascii');
  if (sig === 'OggS') return 'ogg';
  if (sig === 'RIFF') return 'wav';
  return 'bin';
}

function extractAudio(key, folder, kind) {
  const dir = path.join(ENGINE, 'sounds', folder);
  const yyPath = path.join(dir, `${folder}.yy`);
  if (!fs.existsSync(yyPath)) {
    console.warn(`! sound missing: ${folder}`);
    return;
  }
  const yy = readYY(yyPath);
  const soundFile = yy.soundFile || folder;
  const src = path.join(dir, soundFile);
  if (!fs.existsSync(src)) {
    console.warn(`! sound file missing: ${src}`);
    return;
  }
  const ext = detectAudioExt(src);
  const destRel = `audio/${key}.${ext}`;
  ensureDir(path.join(OUT, 'audio'));
  fs.copyFileSync(src, path.join(OUT, destRel));
  manifest.audio[key] = { kind, path: destRel };
}

// --- Run --------------------------------------------------------------------
console.log('Extracting sprites...');
for (const id of SPECIES_IDS) extractSprite(`mon_${id}`, SPRITE_FOLDER(id), 'mon');
for (const [key, folder, cat] of EXTRA_SPRITES) extractSprite(key, folder, cat);

console.log('Extracting audio...');
for (const [key, [folder, kind]] of Object.entries(AUDIO)) extractAudio(key, folder, kind);

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

const credits = `# Asset Credits

All creature sprites, battle FX, UI sprites, music and sound effects in
\`client/public/assets/\` are extracted from **Yal's Monster Collector Engine
(GMS2)** provided by the project owner. Per that asset's terms, the bundled art
and audio are reusable in a commercial project (no resale of the assets
themselves).

- **Creatures (16):** ${SPECIES_IDS.join(', ')} — original designs from the engine.
- **Audio:** original OGG music/jingles + WAV SFX from the engine.
- **UI/FX:** message box, catch stone + forcefield, ailment icons, elemental FX.
- **Overworld:** the engine's real 16px outdoor tileset (grass/path/water) and
  4x4 character walk sheets (player + NPCs). Trees, buildings, the shrine, and
  tall-grass/flower overlays are drawn procedurally in-engine.

All creature names, the world/region, types, and all game/UI/overworld code are
original to Aetherbeasts. Generic mechanics (turn-based math, capture, type
tiers) are common genre conventions.

_Generated by tools/extract-assets.mjs._
`;
fs.writeFileSync(path.join(OUT, 'ASSETS_CREDITS.md'), credits);

const nSprites = Object.keys(manifest.sprites).length;
const nAudio = Object.keys(manifest.audio).length;
console.log(`Done: ${nSprites} sprites, ${nAudio} audio files -> ${path.relative(ROOT, OUT)}`);
