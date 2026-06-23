/**
 * PvP ranked tiers + monthly seasons. Tiers are derived from the player's rating
 * (server-authoritative, starts at 1000); seasons are monthly UTC windows. Pure +
 * clock-driven so both client and server agree without extra state.
 */
export interface Rank { name: string; color: string; min: number; }

export const RANKS: Rank[] = [
  { name: 'Bronze', color: '#cd7f32', min: 0 },
  { name: 'Silver', color: '#c0c0c0', min: 1000 },
  { name: 'Gold', color: '#ffd166', min: 1150 },
  { name: 'Platinum', color: '#7fe3ff', min: 1300 },
  { name: 'Diamond', color: '#9a8cff', min: 1450 },
  { name: 'Master', color: '#ff6ec7', min: 1600 },
];

/** The rank tier for a rating. */
export function rankOf(rating: number): Rank {
  let r = RANKS[0];
  for (const t of RANKS) if (rating >= t.min) r = t;
  return r;
}

/** The current monthly season (UTC): id `YYYY-MM`, ending at the next month boundary. */
export function currentSeason(now: number): { id: string; endsAt: number } {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return {
    id: `${y}-${String(m + 1).padStart(2, '0')}`,
    endsAt: Date.UTC(y, m + 1, 1),
  };
}
