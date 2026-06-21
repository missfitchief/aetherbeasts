import { describe, it, expect } from 'vitest';
import { startPvpBattle, resolveTurnPvP, type BattleEvent, type PlayerAction } from './battle.js';
import { createCreature } from './factory.js';
import { seededRng } from './rng.js';
import { getMove } from '../data/moves.js';

/** Index of the creature's first damaging move (falls back to 0). */
function atk(moves: string[]): number {
  const i = moves.findIndex((m) => getMove(m).category !== 'support' || getMove(m).fixedDamage);
  return i === -1 ? 0 : i;
}

// Deterministic teams (each creature seeded so two builds are byte-identical).
function teamA() {
  return [
    createCreature('drachnid', 25, { rng: seededRng(1), shinyChance: 0 }),
    createCreature('duvan', 22, { rng: seededRng(2), shinyChance: 0 }),
  ];
}
function teamB() {
  return [
    createCreature('draquatic', 25, { rng: seededRng(3), shinyChance: 0 }),
    createCreature('plaugspout', 22, { rng: seededRng(4), shinyChance: 0 }),
  ];
}

const move = (index: number): PlayerAction => ({ kind: 'move', index });

describe('pvp battle engine', () => {
  it('is fully deterministic for identical teams + seed + actions (server-authoritative replay)', () => {
    const run = () => {
      const s = startPvpBattle(teamA(), teamB());
      const rng = seededRng(999);
      const all: BattleEvent[] = [];
      for (let i = 0; i < 60 && !s.over; i++) {
        all.push(...resolveTurnPvP(s, move(atk(s.player.creature.moves)), move(atk(s.enemy.creature.moves)), rng));
      }
      return { events: all, outcome: s.outcome };
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('reaches a decisive result when both sides attack', () => {
    const s = startPvpBattle(teamA(), teamB());
    const rng = seededRng(7);
    for (let i = 0; i < 200 && !s.over; i++) {
      resolveTurnPvP(s, move(atk(s.player.creature.moves)), move(atk(s.enemy.creature.moves)), rng);
    }
    expect(s.over).toBe(true);
    expect(['win', 'lose', 'draw']).toContain(s.outcome);
  });

  it('auto-promotes the next team member when an active faints (match not over)', () => {
    const a = teamA();
    const b = teamB();
    b[0].currentHp = 1; // glass active — faints to any hit, bench remains
    const s = startPvpBattle(a, b);
    const hits = { next: () => 0 }; // 0 => always hits, deterministic
    const evs = resolveTurnPvP(s, move(atk(s.player.creature.moves)), move(atk(s.enemy.creature.moves)), hits);
    expect(s.over).toBe(false);
    expect(evs.some((e) => e.type === 'faint' && e.side === 'enemy')).toBe(true);
    expect(evs.some((e) => e.type === 'switch' && e.side === 'enemy')).toBe(true);
    expect(s.enemyActiveIndex).toBe(1);
  });

  it('ends the match when a side loses its whole team', () => {
    const a = teamA();
    const b = teamB();
    b[0].currentHp = 1;
    b[1].currentHp = 0; // bench already down — KO ends it
    const s = startPvpBattle(a, b);
    const evs = resolveTurnPvP(s, move(atk(s.player.creature.moves)), move(atk(s.enemy.creature.moves)), { next: () => 0 });
    expect(s.over).toBe(true);
    expect(s.outcome).toBe('win');
    expect(evs.some((e) => e.type === 'end' && e.outcome === 'win')).toBe(true);
  });

  it('forfeit (run) ends the match immediately from the forfeiter perspective', () => {
    const s = startPvpBattle(teamA(), teamB());
    const evs = resolveTurnPvP(s, { kind: 'run' }, move(0), seededRng(1));
    expect(s.over).toBe(true);
    expect(s.outcome).toBe('lose');
    expect(evs.some((e) => e.type === 'end' && e.outcome === 'lose')).toBe(true);
  });

  it('a switch forgoes the attack and brings in the chosen creature', () => {
    const s = startPvpBattle(teamA(), teamB());
    const evs = resolveTurnPvP(s, { kind: 'switch', partyIndex: 1 }, move(atk(s.enemy.creature.moves)), seededRng(3));
    expect(s.activeIndex).toBe(1);
    expect(evs.some((e) => e.type === 'switch' && e.side === 'player' && e.partyIndex === 1)).toBe(true);
  });
});
