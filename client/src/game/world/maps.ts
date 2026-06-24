/** Procedural world: a town up top, a wild route with tall grass below.
 *  Terrain (grass/path/water/tallgrass/flower) is a grid rendered with
 *  autotiling; trees, houses, fences etc. are placed objects (objectart.ts)
 *  with their own collision footprints. */
export const TILE = 16;

import type { Direction } from '@aether/shared';

export type TerrainType = 'grass' | 'tallgrass' | 'path' | 'water' | 'flower' | 'floor' | 'wall' | 'carpet';
export interface Tile {
  type: TerrainType;
  zone?: string;
}

export type ObjKind =
  | 'tree' | 'tree2' | 'tree3' | 'pine'
  | 'cottage' | 'townhouse' | 'lab' | 'shop' | 'cabin' | 'manor'
  | 'fence' | 'sign' | 'shrine' | 'church' | 'lamp' | 'bush' | 'stump' | 'portal'
  | 'bed' | 'table' | 'chair' | 'bookshelf' | 'counter' | 'pot' | 'rug' | 'fireplace' | 'labmachine' | 'painting'
  | 'altar' | 'pew' | 'candle'
  | 'crystal' | 'stalagmite' | 'pillar' | 'brazier';

/** An object anchored at the bottom-centre tile (x,y); footprint extends up. */
export interface WorldObject {
  kind: ObjKind;
  x: number;
  y: number;
}

export type NpcKind = 'professor' | 'shopkeeper' | 'villager' | 'trainer';
export interface Npc {
  id: string;
  kind: NpcKind;
  x: number;
  y: number;
  facing: Direction;
  sheet: string;
  /** Optional custom dialogue (overrides the kind's default lines). */
  lines?: string[];
  /** If set, talking to this NPC (while not yet defeated) starts a trainer/boss
   *  battle with the matching Trainer from @aether/shared data/trainers. */
  trainerId?: string;
}

export type InteractKind = 'shrine' | 'sign' | 'restbed' | 'shopcounter' | 'summon' | 'evolve' | 'dailyboss';
export interface Interactable {
  kind: InteractKind;
  x: number;
  y: number;
  text?: string[];
}

/** A tile that teleports the player to another map when stepped on. */
export interface Warp {
  x: number;
  y: number;
  toMap: string;
  toX: number;
  toY: number;
  facing?: Direction;
  /** If set, the warp is blocked until the player holds this badge. */
  requiresBadge?: string;
  /** Dialogue shown when the warp is blocked for lack of the badge. */
  lockedText?: string[];
}

export interface WorldMap {
  id: string;
  kind: 'overworld' | 'interior';
  width: number;
  height: number;
  tiles: Tile[][];
  solid: boolean[][];
  objects: WorldObject[];
  npcs: Npc[];
  interactables: Interactable[];
  warps: Warp[];
  spawn: { x: number; y: number };
  /** Camera tuning for interiors (small rooms zoom in over a dark surround). */
  zoom?: number;
  bg?: number;
}

/** sprite key + footprint (fw odd, anchored bottom-centre) + solidity. */
export const OBJ_DEF: Record<ObjKind, { sprite: string; fw: number; fh: number; solid: boolean }> = {
  tree: { sprite: 'tree0', fw: 1, fh: 1, solid: true },
  tree2: { sprite: 'tree1', fw: 1, fh: 1, solid: true },
  tree3: { sprite: 'tree2', fw: 1, fh: 1, solid: true },
  pine: { sprite: 'pine0', fw: 1, fh: 1, solid: true },
  cottage: { sprite: 'cottage', fw: 3, fh: 2, solid: true },
  townhouse: { sprite: 'townhouse', fw: 3, fh: 2, solid: true },
  lab: { sprite: 'lab', fw: 5, fh: 3, solid: true },
  shop: { sprite: 'shop', fw: 5, fh: 3, solid: true },
  cabin: { sprite: 'cabin', fw: 3, fh: 2, solid: true },
  manor: { sprite: 'manor', fw: 5, fh: 3, solid: true },
  fence: { sprite: 'fence', fw: 1, fh: 1, solid: true },
  sign: { sprite: 'sign', fw: 1, fh: 1, solid: true },
  shrine: { sprite: 'shrine', fw: 1, fh: 1, solid: true },
  church: { sprite: 'church', fw: 3, fh: 2, solid: true },
  lamp: { sprite: 'lamp', fw: 1, fh: 1, solid: true },
  bush: { sprite: 'bush', fw: 1, fh: 1, solid: false },
  stump: { sprite: 'stump', fw: 1, fh: 1, solid: false },
  portal: { sprite: 'portal', fw: 1, fh: 2, solid: false }, // walk-through: you step onto it to warp

  // interior furniture
  bed: { sprite: 'bed', fw: 1, fh: 2, solid: true },
  table: { sprite: 'table', fw: 1, fh: 1, solid: true },
  chair: { sprite: 'chair', fw: 1, fh: 1, solid: true },
  bookshelf: { sprite: 'bookshelf', fw: 1, fh: 1, solid: true },
  counter: { sprite: 'counter', fw: 1, fh: 1, solid: true },
  pot: { sprite: 'pot', fw: 1, fh: 1, solid: true },
  rug: { sprite: 'rug', fw: 1, fh: 1, solid: false },
  fireplace: { sprite: 'fireplace', fw: 1, fh: 1, solid: true },
  labmachine: { sprite: 'labmachine', fw: 1, fh: 1, solid: true },
  painting: { sprite: 'painting', fw: 1, fh: 1, solid: false },
  altar: { sprite: 'altar', fw: 1, fh: 1, solid: true },
  pew: { sprite: 'pew', fw: 1, fh: 1, solid: true },
  candle: { sprite: 'candle', fw: 1, fh: 1, solid: true },
  crystal: { sprite: 'crystal', fw: 1, fh: 1, solid: true },
  stalagmite: { sprite: 'stalagmite', fw: 1, fh: 1, solid: true },
  pillar: { sprite: 'pillar', fw: 1, fh: 2, solid: true },
  brazier: { sprite: 'brazier', fw: 1, fh: 1, solid: true },
};

export const ROUTE_START_Y = 24;

export function buildWorld(): WorldMap {
  const W = 46;
  const H = 58;
  const tiles: Tile[][] = [];
  const solid: boolean[][] = [];
  for (let y = 0; y < H; y++) {
    tiles.push(Array.from({ length: W }, () => ({ type: 'grass' as TerrainType })));
    solid.push(Array.from({ length: W }, () => false));
  }
  const objects: WorldObject[] = [];

  const set = (x: number, y: number, type: TerrainType, zone?: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) tiles[y][x] = { type, zone };
  };
  const rect = (x0: number, y0: number, w: number, h: number, type: TerrainType, zone?: string) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, type, zone);
  };
  let rs = 1234;
  const rnd = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const obj = (kind: ObjKind, x: number, y: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    objects.push({ kind, x, y });
    const d = OBJ_DEF[kind];
    if (d.solid) {
      const half = (d.fw - 1) / 2;
      for (let yy = y - d.fh + 1; yy <= y; yy++)
        for (let xx = x - half; xx <= x + half; xx++)
          if (xx >= 0 && xx < W && yy >= 0 && yy < H) solid[yy][xx] = true;
    }
  };
  // Tree CANOPIES are ~3 tiles wide, so trees within 2 tiles of each other pile up
  // into an overlapping blob. We track every tree tile and (a) never stack two on
  // one tile, and (b) keep DECORATIVE trees ~3 tiles apart so each reads distinctly.
  const treeSet = new Set<string>();
  const tkey = (x: number, y: number) => x + ',' + y;
  const nearTree = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (treeSet.has(tkey(x + dx, y + dy))) return true;
    return false;
  };
  const treeAt = (x: number, y: number) => {
    if (treeSet.has(tkey(x, y))) return; // never two trees on the same tile
    treeSet.add(tkey(x, y));
    obj(rnd() < 0.34 ? 'pine' : (['tree', 'tree2', 'tree3'] as ObjKind[])[Math.floor(rnd() * 3)], x, y);
  };
  /** A decorative tree, placed only if no other tree's canopy would touch it. */
  const decoTreeAt = (x: number, y: number): boolean => {
    if (nearTree(x, y, 2)) return false;
    treeAt(x, y);
    return true;
  };
  const pineAt = (x: number, y: number) => obj('pine', x, y);
  const treeBorder = () => {
    // a dense, slightly ragged forest wall around the map edge (2 deep)
    for (let x = 0; x < W; x++) { treeAt(x, 1); if (rnd() < 0.7) treeAt(x, 0); treeAt(x, H - 1); if (rnd() < 0.7) treeAt(x, H - 2); }
    for (let y = 2; y < H - 1; y++) { treeAt(0, y); if (rnd() < 0.65) treeAt(1, y); treeAt(W - 1, y); if (rnd() < 0.65) treeAt(W - 2, y); }
  };
  const fenceRow = (x0: number, x1: number, y: number) => { for (let x = x0; x <= x1; x++) obj('fence', x, y); };
  const fenceCol = (x: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) obj('fence', x, y); };
  // A natural forest EDGE: stagger the trunk row by ±1 so canopies sit at varied
  // heights (not one flat wall), let some trees sit a row deeper, and dot a little
  // undergrowth at the base. Reads like the lip of a forest, not a fence of trees.
  const treeEdge = (x0: number, x1: number, yBase: number) => {
    const water = (xx: number, yy: number) => tiles[yy]?.[xx]?.type === 'water';
    for (let x = x0; x <= x1; x++) {
      const row = yBase - (rnd() < 0.45 ? 1 : 0); // stagger height so the treeline isn't flat
      if (!water(x, row)) decoTreeAt(x, row);      // spaced — distinct trees, not an overlapping wall
      if (!water(x, yBase) && rnd() < 0.22) obj('bush', x, yBase); // low undergrowth fills the gaps
    }
  };
  const treeCluster = (cx: number, cy: number, n: number, spread: number) => {
    // scatter with GLOBAL spacing so canopies never merge — within the clump or
    // with a neighbouring cluster/edge.
    for (let tries = 0, placed = 0; placed < n && tries < n * 18; tries++) {
      const px = Math.round(cx + (rnd() - 0.5) * spread * 2);
      const py = Math.round(cy + (rnd() - 0.5) * spread * 2);
      if (decoTreeAt(px, py)) placed++;
    }
  };
  const pond = (cx: number, cy: number, rx: number, ry: number) => {
    for (let yy = cy - ry; yy <= cy + ry; yy++)
      for (let xx = cx - rx; xx <= cx + rx; xx++) {
        const ex = (xx - cx) / rx, ey = (yy - cy) / ry;
        if (ex * ex + ey * ey <= 1.05) set(xx, yy, 'water');
      }
  };
  const garden = (x0: number, y0: number, w: number, h: number) => {
    for (let x = x0; x < x0 + w; x++) { obj('fence', x, y0); obj('fence', x, y0 + h - 1); }
    for (let y = y0 + 1; y < y0 + h - 1; y++) { obj('fence', x0, y); obj('fence', x0 + w - 1, y); }
    set(x0 + 1, y0 + 1, 'flower'); set(x0 + 2, y0 + 2, 'flower');
    obj('bush', x0 + w - 2, y0 + h - 2);
  };

  // ===== ROADS — a clear crossroads (3-wide for presence) =====
  rect(21, 1, 3, H - 1, 'path');        // main vertical avenue (top → route)
  rect(3, 11, 39, 3, 'path');           // horizontal main street

  // ===== TOWN BUILDINGS — every door faces the main street =====
  const warps: Warp[] = [];
  for (const b of BUILDINGS) {
    obj(b.sprite, b.x, b.y);
    solid[b.y][b.x] = false;            // carve the door tile walkable
    set(b.x, 10, 'path');               // a paved doorstep onto the street
    warps.push({ x: b.x, y: b.y, toMap: b.interiorId, toX: IDOOR, toY: ISPAWN_Y, facing: 'up' });
  }

  // fenced back gardens behind the houses (two blocks, gap for the avenue)
  fenceRow(3, 19, 3); fenceCol(3, 4, 7); fenceCol(19, 4, 7);
  fenceRow(25, 41, 3); fenceCol(25, 4, 7); fenceCol(41, 4, 7);
  for (const [gx, gy] of [[9, 7], [15, 6], [27, 6], [34, 7]]) set(gx, gy, 'flower');
  obj('bush', 10, 7); obj('bush', 33, 7); obj('stump', 27, 7);

  // south commons: a fenced veg garden (SW) + an ornamental pond (SE)
  garden(5, 16, 5, 4);
  pond(35, 19, 4, 3);

  // street lamps along the street + the avenue, and a town sign at the south exit
  for (const lx of [6, 12, 18, 27, 33, 39]) obj('lamp', lx, 14);
  obj('lamp', 20, 6); obj('lamp', 20, 21);
  obj('sign', 20, 22);
  obj('shrine', 25, 16); // the Daily Champion's altar, just off the spawn
  // The Aether League gate at the head of the avenue, unlocked by the Ember Badge.
  obj('portal', 22, 2);
  warps.push({
    x: 22, y: 2, toMap: 'aetherleague', toX: 12, toY: 18, facing: 'down',
    requiresBadge: 'ember',
    lockedText: ['The Aether League gate hums with sealed power.', 'Earn the Ember Badge in Emberhollow to enter.'],
  });
  // a ragged forest edge frames the south of town, funnelling you down the avenue
  treeEdge(2, 18, 23); treeEdge(25, 43, 23);
  pineAt(19, 6); pineAt(25, 6);   // specimen conifers flanking the avenue head

  // ===== WHISPERWOOD ROUTE (rows 24..56) =====
  rect(2, 24, W - 4, 6, 'tallgrass', 'whisperwood');   // entry band (crosses the road)
  rect(22, 30, 2, H - 31, 'path');                     // clear central path from here
  rect(4, 31, 15, 6, 'tallgrass', 'whisperwood');
  rect(27, 31, 14, 6, 'tallgrass', 'whisperwood');
  rect(5, 42, 15, 7, 'tallgrass', 'whisperwood_deep');
  rect(26, 42, 15, 7, 'tallgrass', 'whisperwood_deep');
  rect(2, 50, W - 4, 4, 'tallgrass', 'whisperwood_deep');
  rect(22, 50, 2, 4, 'path');
  // The badge-gated Emberhollow gate — a portal at the very SOUTH END of the
  // avenue, in a cleared, paved pocket so the road visibly terminates at it.
  // Hold the forest back from this pocket (mark the tiles as "treed" so neither
  // the border nor the clusters drop a canopy here).
  for (let yy = 53; yy <= H - 1; yy++) for (let xx = 19; xx <= 26; xx++) treeSet.add(tkey(xx, yy));
  rect(20, 54, 6, 3, 'path'); // a small stone plaza at the road's end
  const emberLock = ['A shimmering heat-haze seals the cave mouth.', 'Best the Warden of Whisperwood for the Verdant Badge to pass.'];
  for (const wx of [22, 23]) {
    warps.push({ x: wx, y: 56, toMap: 'emberhollow', toX: 14, toY: 3, facing: 'down', requiresBadge: 'verdant', lockedText: emberLock });
  }
  obj('portal', 22, 56); // the visible gate at the map's south end
  // one large scenic pond (replaces the scattered small ponds), left of the path
  pond(12, 44, 8, 5);
  // tree clusters framing the route (kept clear of the pond + central path)
  treeCluster(15, 31, 5, 6); treeCluster(40, 32, 5, 6);
  treeCluster(33, 39, 6, 7); treeCluster(30, 53, 5, 6); treeCluster(9, 55, 4, 5);
  obj('stump', 24, 38); obj('bush', 27, 47); obj('bush', 20, 38); obj('stump', 38, 52);
  for (const [fx, fy] of [[20, 55], [25, 55], [9, 39], [31, 33]]) set(fx, fy, 'flower');

  treeBorder();

  // ===== collision from terrain (water) =====
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tiles[y][x].type === 'water') solid[y][x] = true;

  const npcs: Npc[] = [
    { id: 'prof', kind: 'professor', x: 34, y: 12, facing: 'down', sheet: 'sheet_professor' },   // by the Lab
    { id: 'shop', kind: 'shopkeeper', x: 28, y: 12, facing: 'down', sheet: 'sheet_guy' },         // by the Shop
    { id: 'kid', kind: 'villager', x: 15, y: 15, facing: 'down', sheet: 'sheet_schoolgirl' },
    { id: 'wanderer', kind: 'villager', x: 24, y: 34, facing: 'left', sheet: 'sheet_hiker' },
    // Whisperwood trainers (on the open grass beside the central path) + the Warden boss.
    { id: 'tr_w1', kind: 'trainer', x: 25, y: 33, facing: 'down', sheet: 'sheet_hiker', trainerId: 't_whisper_1' },
    { id: 'tr_w2', kind: 'trainer', x: 20, y: 38, facing: 'down', sheet: 'sheet_schoolgirl', trainerId: 't_whisper_2' },
    { id: 'tr_w3', kind: 'trainer', x: 25, y: 45, facing: 'down', sheet: 'sheet_guy', trainerId: 't_whisper_3' },
    { id: 'tr_boss_v', kind: 'trainer', x: 21, y: 51, facing: 'right', sheet: 'sheet_professor', trainerId: 'boss_verdant' },
  ];

  const interactables: Interactable[] = [
    { kind: 'sign', x: 20, y: 22, text: ['AETHER TOWN', 'South down the road lies Whisperwood Route — wild Aetherbeasts lurk in its tall grass.'] },
    { kind: 'dailyboss', x: 25, y: 16 },
  ];

  return { id: 'world', kind: 'overworld', width: W, height: H, tiles, solid, objects, npcs, interactables, warps, spawn: { x: 23, y: 16 } };
}

// ===========================================================================
// Building interiors — each door warps into a small furnished room.
// ===========================================================================
interface BuildingDef {
  interiorId: string;
  sprite: ObjKind;
  x: number;          // overworld door (anchor) tile
  y: number;
  theme: 'home' | 'shop' | 'lab' | 'house' | 'church';
  name: string;
}

const IW = 13, IH = 10, IDOOR = 6, ISPAWN_Y = 8; // interior dims, door column, entry row

// Three purposeful buildings (home, the Chapel for healing, the Lab for
// summons + evolving, the Provisioner shop) plus one neighbour cottage.
const BUILDINGS: BuildingDef[] = [
  { interiorId: 'home', sprite: 'manor', x: 6, y: 10, theme: 'home', name: 'Home' },
  { interiorId: 'church', sprite: 'church', x: 12, y: 10, theme: 'church', name: 'Chapel' },
  { interiorId: 'cottage', sprite: 'cottage', x: 17, y: 10, theme: 'house', name: 'Cottage' },
  { interiorId: 'shop', sprite: 'shop', x: 30, y: 10, theme: 'shop', name: 'Provisioner' },
  { interiorId: 'lab', sprite: 'lab', x: 37, y: 10, theme: 'lab', name: "Wren's Lab" },
];

function buildInterior(b: BuildingDef): WorldMap {
  const W = IW, H = IH;
  const tiles: Tile[][] = [];
  const solid: boolean[][] = [];
  for (let y = 0; y < H; y++) {
    tiles.push(Array.from({ length: W }, () => ({ type: 'floor' as TerrainType })));
    solid.push(Array.from({ length: W }, () => false));
  }
  const set = (x: number, y: number, t: TerrainType) => { if (x >= 0 && x < W && y >= 0 && y < H) tiles[y][x] = { type: t }; };
  // wall ring (top two rows read as the back wall) + a door gap in the bottom wall
  for (let x = 0; x < W; x++) { set(x, 0, 'wall'); set(x, 1, 'wall'); set(x, H - 1, 'wall'); solid[0][x] = solid[1][x] = solid[H - 1][x] = true; }
  for (let y = 0; y < H; y++) { set(0, y, 'wall'); set(W - 1, y, 'wall'); solid[y][0] = solid[y][W - 1] = true; }
  set(IDOOR, H - 1, 'floor'); solid[H - 1][IDOOR] = false;

  const objects: WorldObject[] = [];
  const npcs: Npc[] = [];
  const interactables: Interactable[] = [];
  const obj = (kind: ObjKind, x: number, y: number) => {
    objects.push({ kind, x, y });
    const d = OBJ_DEF[kind];
    if (d.solid) {
      const half = (d.fw - 1) / 2;
      for (let yy = y - d.fh + 1; yy <= y; yy++)
        for (let xx = x - half; xx <= x + half; xx++)
          if (xx >= 0 && xx < W && yy >= 0 && yy < H) solid[yy][xx] = true;
    }
  };
  const warps: Warp[] = [{ x: IDOOR, y: H - 1, toMap: 'world', toX: b.x, toY: b.y + 1, facing: 'down' }];
  obj('rug', IDOOR, H - 2); // welcome mat

  if (b.theme === 'home') {
    obj('bed', 2, 3); obj('bookshelf', 4, 2); obj('fireplace', 11, 2); obj('painting', 8, 1);
    obj('table', 9, 4); obj('chair', 9, 5); obj('pot', 11, 7); obj('rug', 6, 6);
    npcs.push({ id: 'mom', kind: 'villager', x: 5, y: 4, facing: 'down', sheet: 'sheet_schoolgirl', lines: ['Welcome home, dear!', 'Sleep in your bed any time to fully heal your team and save your journey.'] });
    interactables.push({ kind: 'restbed', x: 2, y: 3, text: ['You rest in your warm bed...'] });
  } else if (b.theme === 'shop') {
    obj('counter', 4, 3); obj('counter', 5, 3); obj('counter', 6, 3);
    obj('bookshelf', 1, 2); obj('bookshelf', 2, 2); obj('bookshelf', 10, 2); obj('bookshelf', 11, 2);
    obj('pot', 11, 7); obj('rug', 6, 6);
    npcs.push({ id: 'shopkeep_in', kind: 'shopkeeper', x: 5, y: 2, facing: 'down', sheet: 'sheet_guy' });
    // talk across the counter to open the shop
    interactables.push({ kind: 'shopcounter', x: 4, y: 3 }, { kind: 'shopcounter', x: 5, y: 3 }, { kind: 'shopcounter', x: 6, y: 3 });
  } else if (b.theme === 'lab') {
    // Aether Rift (summon) on the left, Evolution Chamber on the right
    obj('labmachine', 3, 3); obj('labmachine', 10, 3);
    obj('bookshelf', 1, 2); obj('bookshelf', 11, 2); obj('pot', 11, 7); obj('rug', 6, 6);
    npcs.push({ id: 'prof_in', kind: 'professor', x: 6, y: 3, facing: 'down', sheet: 'sheet_professor', lines: ['Welcome to my lab!', 'The Aether Rift on the left summons new beasts. The Evolution Chamber on the right awakens those ready to evolve.'] });
    interactables.push({ kind: 'summon', x: 3, y: 3, text: ['The Aether Rift swirls before you...'] });
    interactables.push({ kind: 'evolve', x: 10, y: 3, text: ['The Evolution Chamber hums...'] });
  } else if (b.theme === 'church') {
    // red carpet aisle from the door up to the altar
    for (let yy = 2; yy <= H - 2; yy++) set(IDOOR, yy, 'carpet');
    obj('altar', IDOOR, 3);
    obj('candle', 4, 3); obj('candle', 8, 3);
    obj('pot', 1, 2); obj('pot', 11, 2);
    obj('pew', 3, 5); obj('pew', 3, 7); obj('pew', 9, 5); obj('pew', 9, 7);
    npcs.push({ id: 'priest', kind: 'villager', x: IDOOR, y: 2, facing: 'down', sheet: 'sheet_professor', lines: ['Welcome to the Chapel.', 'Kneel at the altar to mend your beasts and save your journey.'] });
    interactables.push({ kind: 'restbed', x: IDOOR, y: 3, text: ['You kneel at the altar; a warm light restores your team...'] });
  } else {
    obj('bed', 2, 3); obj('bookshelf', 4, 2); obj('painting', 8, 1);
    obj('table', 8, 5); obj('chair', 9, 5); obj('pot', 11, 7); obj('rug', 6, 6);
    npcs.push({ id: 'resident', kind: 'villager', x: 5, y: 4, facing: 'down', sheet: 'sheet_hiker', lines: ['Oh, a visitor! Make yourself at home.', 'They say the Aether Rift in the Lab summons beasts you can’t find in the grass.'] });
  }

  return {
    id: b.interiorId, kind: 'interior', width: W, height: H, tiles, solid,
    objects, npcs, interactables, warps, spawn: { x: IDOOR, y: ISPAWN_Y }, zoom: 2.25, bg: 0x140f1e,
  };
}

// ===========================================================================
// Emberhollow Cave — the second zone, unlocked by the Verdant Badge. A walled
// cavern of glowing mushroom beds (tallgrass encounters), trainers, and the
// Ember Sovereign boss in the depths. Self-authored so every tile is controlled.
// ===========================================================================
function buildEmberhollow(): WorldMap {
  const W = 28, H = 22;
  const tiles: Tile[][] = [];
  const solid: boolean[][] = [];
  for (let y = 0; y < H; y++) {
    tiles.push(Array.from({ length: W }, () => ({ type: 'floor' as TerrainType })));
    solid.push(Array.from({ length: W }, () => false));
  }
  const set = (x: number, y: number, type: TerrainType, zone?: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) tiles[y][x] = { type, zone };
  };
  const rect = (x0: number, y0: number, w: number, h: number, type: TerrainType, zone?: string) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, type, zone);
  };
  // cave walls around the rim (interior is fully open so NPCs can be walked around)
  for (let x = 0; x < W; x++) { set(x, 0, 'wall'); set(x, H - 1, 'wall'); solid[0][x] = solid[H - 1][x] = true; }
  for (let y = 0; y < H; y++) { set(0, y, 'wall'); set(W - 1, y, 'wall'); solid[y][0] = solid[y][W - 1] = true; }

  // glowing mushroom beds = the Emberhollow encounter zone
  rect(3, 5, 8, 5, 'tallgrass', 'emberhollow');
  rect(17, 5, 8, 5, 'tallgrass', 'emberhollow');
  rect(6, 12, 16, 5, 'tallgrass', 'emberhollow');

  const objects: WorldObject[] = [];
  const obj = (kind: ObjKind, x: number, y: number) => {
    objects.push({ kind, x, y });
    const d = OBJ_DEF[kind];
    if (d.solid) {
      const half = (d.fw - 1) / 2;
      for (let yy = y - d.fh + 1; yy <= y; yy++)
        for (let xx = x - half; xx <= x + half; xx++)
          if (xx >= 0 && xx < W && yy >= 0 && yy < H) solid[yy][xx] = true;
    }
  };
  // atmosphere (kept OFF the central descent column 14 so the boss stays reachable)
  obj('lamp', 4, 4); obj('lamp', 23, 4); obj('stump', 5, 18); obj('stump', 22, 18);
  obj('crystal', 2, 3); obj('crystal', 25, 3); obj('crystal', 2, 16); obj('crystal', 25, 16);
  obj('crystal', 2, 19); obj('crystal', 25, 19); obj('crystal', 12, 19); obj('crystal', 16, 19);
  obj('stalagmite', 2, 10); obj('stalagmite', 25, 10); obj('stalagmite', 6, 18); obj('stalagmite', 21, 18);
  obj('candle', 3, 4); obj('candle', 24, 4); obj('candle', 11, 11); obj('candle', 16, 11);
  obj('sign', 11, 3);
  obj('shrine', 17, 3); // heal/save point near the entrance so a cave whiteout doesn't bounce to town
  obj('portal', 14, 1); // the gate back up to Whisperwood

  const npcs: Npc[] = [
    { id: 'tr_e1', kind: 'trainer', x: 8, y: 7, facing: 'down', sheet: 'sheet_guy', trainerId: 't_ember_1' },
    { id: 'tr_e2', kind: 'trainer', x: 20, y: 7, facing: 'down', sheet: 'sheet_hiker', trainerId: 't_ember_2' },
    { id: 'tr_e3', kind: 'trainer', x: 14, y: 14, facing: 'down', sheet: 'sheet_schoolgirl', trainerId: 't_ember_3' },
    { id: 'tr_boss_e', kind: 'trainer', x: 14, y: 19, facing: 'up', sheet: 'sheet_professor', trainerId: 'boss_ember' },
  ];
  const interactables: Interactable[] = [
    { kind: 'sign', x: 11, y: 3, text: ['EMBERHOLLOW CAVE', 'Wild beasts roam the glowing mushroom beds. The Ember Sovereign waits in the depths.'] },
    { kind: 'shrine', x: 17, y: 3 },
  ];
  const warps: Warp[] = [
    { x: 14, y: 1, toMap: 'world', toX: 22, toY: 52, facing: 'up' }, // back up to Whisperwood
  ];

  return {
    id: 'emberhollow', kind: 'overworld', width: W, height: H, tiles, solid,
    objects, npcs, interactables, warps, spawn: { x: 14, y: 3 }, bg: 0x1a0f12,
  };
}

// ===========================================================================
// The Aether League — a grand hall (the post-game gauntlet), unlocked by the
// Ember Badge. Three Elites flank a carpet aisle; the Champion holds the throne.
// ===========================================================================
function buildAetherLeague(): WorldMap {
  const W = 24, H = 22;
  const tiles: Tile[][] = [];
  const solid: boolean[][] = [];
  for (let y = 0; y < H; y++) {
    tiles.push(Array.from({ length: W }, () => ({ type: 'floor' as TerrainType })));
    solid.push(Array.from({ length: W }, () => false));
  }
  const set = (x: number, y: number, t: TerrainType) => { if (x >= 0 && x < W && y >= 0 && y < H) tiles[y][x] = { type: t }; };
  for (let x = 0; x < W; x++) { set(x, 0, 'wall'); set(x, H - 1, 'wall'); solid[0][x] = solid[H - 1][x] = true; }
  for (let y = 0; y < H; y++) { set(0, y, 'wall'); set(W - 1, y, 'wall'); solid[y][0] = solid[y][W - 1] = true; }
  for (let y = 2; y <= H - 2; y++) set(12, y, 'carpet'); // grand aisle to the throne

  const objects: WorldObject[] = [];
  const obj = (kind: ObjKind, x: number, y: number) => {
    objects.push({ kind, x, y });
    const d = OBJ_DEF[kind];
    if (d.solid) {
      const half = (d.fw - 1) / 2;
      for (let yy = y - d.fh + 1; yy <= y; yy++)
        for (let xx = x - half; xx <= x + half; xx++)
          if (xx >= 0 && xx < W && yy >= 0 && yy < H) solid[yy][xx] = true;
    }
  };
  obj('candle', 9, 4); obj('candle', 15, 4);
  obj('pew', 5, 9); obj('pew', 19, 9); obj('pew', 5, 13); obj('pew', 19, 13);
  obj('pillar', 3, 7); obj('pillar', 21, 7); obj('pillar', 3, 16); obj('pillar', 21, 16);
  obj('brazier', 8, 3); obj('brazier', 16, 3); obj('brazier', 6, 18); obj('brazier', 18, 18);
  obj('candle', 6, 6); obj('candle', 18, 6); obj('candle', 10, 19); obj('candle', 14, 19);
  obj('shrine', 9, 18); // heal between bouts

  const npcs: Npc[] = [
    { id: 'np_e1', kind: 'trainer', x: 8, y: 12, facing: 'right', sheet: 'sheet_guy', trainerId: 'e_league_1' },
    { id: 'np_e2', kind: 'trainer', x: 16, y: 12, facing: 'left', sheet: 'sheet_hiker', trainerId: 'e_league_2' },
    { id: 'np_e3', kind: 'trainer', x: 8, y: 7, facing: 'right', sheet: 'sheet_schoolgirl', trainerId: 'e_league_3' },
    { id: 'np_champ', kind: 'trainer', x: 12, y: 4, facing: 'down', sheet: 'sheet_professor', trainerId: 'boss_champion' },
  ];
  const interactables: Interactable[] = [{ kind: 'shrine', x: 9, y: 18 }];
  const warps: Warp[] = [{ x: 12, y: 20, toMap: 'world', toX: 22, toY: 3, facing: 'down' }];

  return {
    id: 'aetherleague', kind: 'overworld', width: W, height: H, tiles, solid,
    objects, npcs, interactables, warps, spawn: { x: 12, y: 18 }, bg: 0x140e22,
  };
}

let overworldCache: WorldMap | null = null;
let emberhollowCache: WorldMap | null = null;
let aetherLeagueCache: WorldMap | null = null;
/** Resolve a map by id ('world', 'emberhollow', 'aetherleague', else a building interior). */
export function getMap(id: string): WorldMap {
  if (id === 'world') return (overworldCache ??= buildWorld());
  if (id === 'emberhollow') return (emberhollowCache ??= buildEmberhollow());
  if (id === 'aetherleague') return (aetherLeagueCache ??= buildAetherLeague());
  const b = BUILDINGS.find((x) => x.interiorId === id);
  if (!b) throw new Error(`Unknown map: ${id}`);
  return buildInterior(b);
}
