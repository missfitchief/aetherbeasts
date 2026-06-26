/**
 * Expeditions — idle / passive PvE income. Send your team into the field for a
 * fixed REAL-TIME duration; when they return you claim GLINT (◈, always on) plus
 * LUMEN (◆, only once the economy ships). The payout scales with your strongest
 * beast, so leveling and collecting feed the passive loop.
 *
 * Server-authoritative: the start time and the claim are validated server-side
 * (a client can't fast-forward the timer), and the LUMEN grant is server-only —
 * exactly like every other faucet. This is the "passive money from playing"
 * loop, balanced by the same pool-capped cash-out as the rest of the economy.
 */
export interface ExpeditionTier {
  id: string;
  label: string;
  emoji: string;
  hours: number; // real-time duration of the run
  glint: number; // base ◈ payout (before the level multiplier)
  lumen: number; // base ◆ payout (before the level multiplier)
  blurb: string;
}

export const EXPEDITIONS: ExpeditionTier[] = [
  { id: 'scout',  label: 'Scout Patrol', emoji: '🔍', hours: 1, glint: 40,  lumen: 2,  blurb: 'A quick sweep of the nearby grass.' },
  { id: 'forage', label: 'Forage Run',   emoji: '🌿', hours: 4, glint: 150, lumen: 8,  blurb: 'Half a day gathering through the wilds.' },
  { id: 'delve',  label: 'Deep Delve',   emoji: '⛰️', hours: 8, glint: 320, lumen: 18, blurb: 'A long haul into the deep rift.' },
];

export const getExpedition = (id: string): ExpeditionTier | undefined =>
  EXPEDITIONS.find((e) => e.id === id);

export const expeditionMs = (tier: ExpeditionTier): number => tier.hours * 3_600_000;

/**
 * Reward scales with the strongest beast you send out: Lv1 = 1.0x, ~Lv26 ≈ 2.0x.
 * GLINT is rounded to a whole number; LUMEN keeps one decimal (it's scarce).
 */
export function expeditionReward(
  tier: ExpeditionTier,
  partyTopLevel: number,
): { glint: number; lumen: number } {
  const mul = 1 + Math.max(0, partyTopLevel - 1) * 0.04;
  return {
    glint: Math.round(tier.glint * mul),
    lumen: Math.round(tier.lumen * mul * 10) / 10,
  };
}
