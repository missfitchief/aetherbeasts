// Winnability sim: can an on-level 3-mon team beat each boss after the rebalance?
// Run: node --import tsx tools/sim-arc.mjs
import {
  startTrainerBattle, resolveTurn, mustSwitch, applyForcedSwitch,
  getTrainer, getMove, damageForMove, createCreature, seededRng,
} from '../shared/src/index.ts';

const evalRng = seededRng(999);
function bestMoveIndex(state) {
  const me = state.player.creature, foe = state.enemy.creature;
  let best = 0, bestDmg = -1;
  me.moves.forEach((mid, i) => {
    if (me.pp[i] <= 0) return;
    const m = getMove(mid);
    let dmg = 0;
    if (m.category === 'support') dmg = 1; // low priority
    else dmg = damageForMove(me, foe, mid, state.player.buffs, evalRng).damage;
    if (dmg > bestDmg) { bestDmg = dmg; best = i; }
  });
  return best;
}

function simBattle(party, enemyTeam, seed) {
  const state = startTrainerBattle(party.map((c) => ({ ...c, currentHp: c.currentHp, pp: [...c.pp] })), enemyTeam);
  const rng = seededRng(seed);
  let guard = 0;
  while (!state.over && guard++ < 400) {
    if (mustSwitch(state)) {
      const next = state.party.findIndex((c) => c.currentHp > 0);
      if (next === -1) break;
      applyForcedSwitch(state, next);
      continue;
    }
    resolveTurn(state, { kind: 'move', index: bestMoveIndex(state) }, rng);
  }
  return state.outcome === 'win';
}

function team(ids, level) {
  return ids.map((id, i) => createCreature(id, level, { rng: seededRng(level * 10 + i), shinyChance: 0 }));
}

// On-level teams (3 mons) the player can realistically field by each boss.
const SCENARIOS = [
  // Teams reflect realistic coverage: off-type starters catch a fire beast
  // (drachnid, now in both encounter tables) as their plant answer.
  { boss: 'boss_verdant', lvl: 13, teams: {
    drachnid: ['drachnid', 'jestar', 'grodent'],
    draquatic: ['draquatic', 'drachnid', 'grodent'],
    plaugspout: ['plaugspout', 'drachnid', 'grodent'],
  } },
  { boss: 'boss_ember', lvl: 23, teams: {
    drachnid: ['charachne', 'cardemon', 'pidgreat'],
    draquatic: ['leviocean', 'charachne', 'pidgreat'],
    plaugspout: ['flowrath', 'charachne', 'pidgreat'],
  } },
];

const N = 60;
let allOk = true;
for (const sc of SCENARIOS) {
  const boss = getTrainer(sc.boss);
  const enemy = () => boss.team.map((m, i) => createCreature(m.species, m.level, { rng: seededRng(700 + i), shinyChance: 0 }));
  console.log(`\n${boss.name} (ace L${Math.max(...boss.team.map((m) => m.level))}) — on-level player team L${sc.lvl}:`);
  for (const [starter, ids] of Object.entries(sc.teams)) {
    let wins = 0;
    for (let s = 0; s < N; s++) wins += simBattle(team(ids, sc.lvl), enemy(), s + 1) ? 1 : 0;
    const pct = Math.round((wins / N) * 100);
    const ok = pct >= 50;
    if (!ok) allOk = false;
    console.log(`  ${starter.padEnd(11)} ${pct}% win  ${ok ? 'OK' : 'LOW'}`);
  }
}
console.log(allOk ? '\nALL STARTERS >=50% vs both bosses' : '\nSOME STARTER BELOW 50% — needs more tuning');
process.exit(allOk ? 0 : 1);
