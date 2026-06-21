# Aetherbeasts — Sustainable Token Economy Spec

**Date:** 2026-06-21
**Status:** Design (no code yet)
**Token:** single asset `$AETHER` (no NFTs, per project constraint)

---

## 0. The one idea

> **Rewards are funded by spending, never by new buyers. Sinks ≥ faucets. The token is a utility + scarcity layer, not a salary.**

If you remember nothing else: a game token dies when players *earn* more than the game *burns*. Everyone sells, price falls, earners leave, spiral. The fix is not "passive yield" (that's the spiral with extra steps, and it's securities fraud). The fix is a **closed loop**: every reward paid out came from something a player spent.

---

## 1. Goals & the failure mode

**Goal:** durable demand for `$AETHER` + a legitimate "spend now, earn through play" feel.

**Failure mode (what we engineer against):** the play-to-earn death spiral (Axie Infinity, ~99% token collapse). Cause: faucet throughput > sink throughput → inflation → sell pressure → collapse.

**Two hard rules that prevent it:**
1. **Sink ≥ faucet** (in `$AETHER` terms), monitored continuously, with dynamic levers.
2. **Reward payouts ≤ what was sunk** in the same period. No reward can be funded by new deposits.

---

## 2. Currency layers (why three, plus the token)

Keep the *fun loop* on non-cashable soft currency so the game is fun without crypto and is **not a pure earning machine**. The token sits on top as a scarcity/utility layer.

| Currency | On-chain? | Cashable? | Faucets | Sinks |
|---|---|---|---|---|
| **Coins 🪙** | No | No | Battle prize money, quests | Shop (Potions, Pact Stones), convenience |
| **Shards ✦** | No | No | Battles, catches, dupes, dailies | Standard summons, awakening mats |
| **Crystals 💎** | No (off-chain ledger) | **No (one-way buy-in)** | Bought w/ fiat **or** `$AETHER` | Featured summons, battle pass |
| **`$AETHER`** | **Yes** | Yes (DEX) | **Only** the Season Vault (closed loop) + capped staking share | Crystal purchase, awakening, breeding, ranked entry, cosmetics, marketplace fees |

**Key safety property:** the everyday loop (catch → battle → summon) runs entirely on **non-cashable** Coins/Shards. `$AETHER` is never handed out for routine play. That alone kills most of the death-spiral risk and keeps you clear of money-transmission rules on the soft economy.

`$AETHER` → Crystals is **one-way** (you spend the token to get premium currency; you can't melt Crystals back into token). This insulates the soft economy from token volatility and creates a clean, measurable sink.

---

## 3. Faucets (value in) — and their caps

| Source | Currency | Cap / guard |
|---|---|---|
| Win a wild battle | Coins `15 + lvl×8`, Shards `10 + lvl×3` | diminishing returns past a daily soft cap |
| Catch a beast | Coins `10 + lvl×4`, Shards `25 + lvl×3` | dex-completion weighted |
| Daily quests | Coins / Shards | fixed daily |
| Dupe pulls | Shards | inherent (costs a pull) |
| **Season Vault payout** | **`$AETHER`** | **bounded by vault inflow (see §5)** |
| Staking share | `$AETHER` | a *slice* of the vault, capped |

**There is deliberately no "earn `$AETHER` per battle."** That line item is what kills these games.

---

## 4. Sinks (value out) — the heart of the economy

Every `$AETHER` sink **splits three ways**:

```
$AETHER spent ─┬─ 50%  BURNED        (deflation, permanent)
               ├─ 35%  SEASON VAULT   (recycled into player rewards)
               └─ 15%  TREASURY       (ops / dev / liquidity)
```

Recurring sinks (the more, the healthier — these are *reasons to spend*):

- **Summons** — featured banner (Crystals, bought with `$AETHER`).
- **Awakening / star-up** — dupes + `$AETHER` to raise a beast's star tier & cap. Biggest recurring sink for invested players.
- **Breeding** — combine two beasts → egg (new gameplay), `$AETHER` cost + cooldowns. Recurring sink that also feeds the collection loop.
- **Ranked / wager entry** — rake burned + pooled (see §8).
- **Cosmetics** — beast skins, shrine themes, trainer flair, **name registration**.
- **Convenience** — IV re-roll, move-relearn, fast-travel, box/inventory expansion, instant hatch.

**Design rule:** total `$AETHER` sink throughput must be **≥** faucet throughput. If it dips, raise sink utility / lower faucet (levers in §7).

---

## 5. The Season Vault — the honest "earn passively"

This is the legitimate version of what you asked for.

1. Every `$AETHER` sink sends **35%** to the **Season Vault**.
2. A season runs (e.g., 4 weeks). The vault accrues from *real spending only*.
3. At season end the vault is distributed:
   - **Ranked leaderboard** (skill) — top PvP players.
   - **Participation** (engagement) — everyone who hit activity thresholds.
   - **Staker share** (hold/utility) — pro-rata to stakers, **capped**.
4. **Invariant: `payout ≤ vault inflow`.** You can never pay out more than was spent.

Because every `$AETHER` a player receives traces back to a `$AETHER` another player *spent*, this is a **closed loop, not a Ponzi** — there is no dependence on new buyers, and nothing promises a yield. It can't inflate the supply and it can't spiral.

---

## 6. Stake-for-utility (NOT yield)

Staking `$AETHER` grants **utility**, with a recycled-reward share on top — never a promised APR:

- Ranked access tiers + **entry-fee discounts**.
- **Summon luck** / pity acceleration.
- A **capped slice of the Season Vault** (funded by sinks, §5).
- **Governance** votes (season themes, rate tuning, new sinks).
- Cosmetic flair (badge, name color).

Legal framing matters: market it as *access + governance + recycled rewards*, never "stake for X% returns." The difference between "utility token with recycled rewards" and "unregistered security paying yield" is exactly this framing + the closed-loop math.

---

## 7. Anti-inflation guardrails (the levers)

- **Daily/weekly soft-currency caps** + diminishing returns on grinding.
- **Dynamic sink pricing:** `$AETHER` costs quoted to hold a target *USD* value — if token price drops, costs rise so sink value stays constant.
- **Burn floor:** minimum 50% of every sink burned.
- **Energy/stamina** (or daily reward caps) so earning can't be botted infinitely.
- **Treasury buyback-and-burn** from *fiat* Crystal sales as a backstop (real revenue removing supply).
- **Live dashboard:** faucet/sink ratio, burn rate, token velocity, vault in/out — tune weekly.

---

## 8. PvP wagers (the compliant ladder)

| Tier | Stake | Legal status | When |
|---|---|---|---|
| **1. Friendly / soft wager** | Coins/Shards (no cash value) | None | **Launch with this** |
| **2. Ranked season** | Free entry; rewards from Season Vault | None (it's a reward pool, not a pot you buy) | Phase 1 |
| **3. Token buy-in pots** | `$AETHER`, winner-take-pot minus burned rake | **Regulated gambling** — license + KYC + geofencing + age-gate | Phase 3, *licensed only* |

Real-money winner-take-all is gambling in most jurisdictions. Ship Tiers 1–2 (all the competitive fun, zero legal risk); treat Tier 3 as a deliberate, licensed product — not a casual feature.

---

## 9. Phased rollout

- **Phase 0 (now):** soft economy live (Coins/Shards/Crystals). **Action: balance faucet vs sink**; add the awakening + breeding sinks so invested players have `$AETHER`-shaped spend even before the token.
- **Phase 1:** wallet login, server, **soft-currency PvP + ranked**, Season Vault accounting (off-chain ledger first).
- **Phase 2:** `$AETHER` on Solana (devnet → mainnet). Crystals↔`$AETHER` bridge **with burn**. Stake-for-utility. Season Vault on-chain & auditable.
- **Phase 3 (optional, licensed):** token wager pots.

---

## 10. Illustrative season flow (numbers to tune, not gospel)

Assume a season where players collectively sink **1,000,000 `$AETHER`** (summons + awakening + breeding + cosmetics + ranked rake):

```
1,000,000 sunk
  → 500,000 burned      (supply ↓, deflationary)
  → 350,000 Season Vault → 60% ranked / 30% participation / 10% stakers
  → 150,000 treasury    (liquidity, ops, buyback reserve)
```

Vault pays out **≤ 350,000** — every token earned came from a token spent. Net supply change: **−500,000** (deflation) regardless of how rewards are split. This is the whole game: **deflation by design, rewards bounded by spending.**

---

## 11. Compliance checklist (get a real lawyer — this is a map, not advice)

- **Securities (Howey):** token could be deemed a security. Utility-first, **never promise returns**, decentralize where possible, legal review pre-launch.
- **Gambling:** wager Tier 3 needs licensing, KYC/AML, geofencing, age-gate.
- **Money transmission:** soft currencies **non-cashable** to stay clear; one-way Crystal buy-in.
- **Consumer:** clear disclosures, jurisdiction restrictions, no deceptive "guaranteed income."

---

## 12. Metrics to watch (weekly)

faucet/sink ratio per currency · `$AETHER` burn rate · token velocity · vault inflow/outflow · DAU/MAU · ARPU · sink participation % · retention (D1/D7/D30).

---

## TL;DR

- Fun loop runs on **non-cashable soft currency** → game is fun without crypto, low legal risk.
- `$AETHER` is a **utility + scarcity** token: spent on summons, **awakening, breeding**, ranked, cosmetics; **50% of every spend is burned**.
- "Earn passively" = the **Season Vault**, funded *only* by sinks, paying out *only* what was spent. Closed loop = sustainable = **not a Ponzi**.
- PvP wagering ships as **soft-currency** first; real-money pots are a **licensed** Phase-3 product.
</content>
