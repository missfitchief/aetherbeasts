// One-off layout sanity check for the overworld + Emberhollow maps.
// Run: node --import tsx tools/check-maps.mjs
import { getMap } from '../client/src/game/world/maps.ts';

function check(id) {
  const m = getMap(id);
  const errs = [];
  const inB = (x, y) => x >= 0 && y >= 0 && x < m.width && y < m.height;
  const isWarp = (x, y) => m.warps.some((w) => w.x === x && w.y === y);
  const walkable = (x, y) =>
    inB(x, y) && !m.solid[y][x] && !m.npcs.some((o) => o.x === x && o.y === y);

  if (!inB(m.spawn.x, m.spawn.y)) errs.push('spawn OOB');
  else {
    if (m.solid[m.spawn.y][m.spawn.x]) errs.push('spawn on solid tile');
    if (isWarp(m.spawn.x, m.spawn.y)) errs.push('spawn sits on a warp (would loop)');
  }

  for (const n of m.npcs) {
    if (!inB(n.x, n.y)) { errs.push(`npc ${n.id} OOB`); continue; }
    const t = m.tiles[n.y][n.x].type;
    if (t === 'water' || t === 'wall') errs.push(`npc ${n.id} on ${t}`);
    if (isWarp(n.x, n.y)) errs.push(`npc ${n.id} on a warp tile`);
    const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (!nbrs.some(([dx, dy]) => walkable(n.x + dx, n.y + dy)))
      errs.push(`npc ${n.id} unreachable (no walkable neighbour)`);
  }

  for (const w of m.warps) {
    if (!inB(w.x, w.y)) errs.push(`warp@(${w.x},${w.y}) OOB`);
    const dst = getMap(w.toMap);
    if (w.toX < 0 || w.toY < 0 || w.toX >= dst.width || w.toY >= dst.height)
      errs.push(`warp -> ${w.toMap}(${w.toX},${w.toY}) dest OOB`);
    else if (dst.solid[w.toY][w.toX]) errs.push(`warp -> ${w.toMap}(${w.toX},${w.toY}) lands on solid`);
  }
  return errs;
}

let bad = 0;
for (const id of ['world', 'emberhollow']) {
  const e = check(id);
  if (e.length) { bad++; console.log(`${id}: FAIL\n  - ${e.join('\n  - ')}`); }
  else console.log(`${id}: OK`);
}

// Portal placement + tree-clearing around the Emberhollow gate (south end of world).
{
  const w = getMap('world');
  const treeKinds = new Set(['tree', 'tree2', 'tree3', 'pine']);
  const portal = w.objects.find((o) => o.kind === 'portal');
  const treesInPocket = w.objects.filter(
    (o) => treeKinds.has(o.kind) && o.x >= 19 && o.x <= 26 && o.y >= 53 && o.y <= 57,
  );
  console.log(`portal: ${portal ? `${portal.x},${portal.y}` : 'MISSING'}  (map bottom row = ${w.height - 1})`);
  console.log(`trees in gate pocket (x19-26,y53-57): ${treesInPocket.length}`);
  if (!portal) bad++;
  if (treesInPocket.length) bad++;
}
process.exit(bad ? 1 : 0);
