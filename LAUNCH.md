# Aetherbeasts — Token & Economy Launch Runbook

The game is fully playable **without** the token (GLINT economy, catching, battling, PvP, quests
all work today). The $AETHER token + LUMEN cash-out is an **additive layer** that flips on via
server env vars. Goal: everything below is pre-built and devnet-tested, so launch day is just
"set the vars, flip the switch." Nothing is improvised live.

Two panic buttons exist at all times:
- `EXCHANGE_ENABLED=false` → instantly pauses cash-out (game keeps running).
- `LUMEN_ENABLED=false` → stops LUMEN emission entirely.

---

## A. Pre-launch (do these DAYS before, not on launch day)

- [ ] **Bump Render off the free tier.** Free dynos sleep after ~15 min and cold-start ~50s — fatal
      when people arrive at once. Set the server service to a warm/`starter` plan.
- [ ] **Confirm Postgres (Neon) is connected** — `DATABASE_URL` set; boot logs show
      `[store] postgres mode`. This is what persists accounts, the LUMEN ledger, and the pool.
- [ ] **Get a paid Solana RPC** (Helius / QuickNode / Triton). The public endpoint rate-limits and
      will drop paid summons + payouts under load. This URL is a **secret** (it embeds an API key).
- [ ] **Generate the treasury keypair.** This wallet receives pull payments AND pays out cash-outs,
      and holds your seed bag. Back it up securely (it is real money). The server reads it ONLY from
      a secret env var — it is never pasted into chat or logged.
- [ ] **Set payout ceilings.** `PAYOUT_MAX_PER_TX_AETHER` + `PAYOUT_MAX_PER_DAY_AETHER` to non-zero
      (default `0` = unlimited). This is the only treasury backstop independent of the in-memory pool
      accounting — the audit flagged the unlimited default as the wrong setting for a real-money signer.
- [ ] **`TOKEN_MODE=mainnet` at launch (NOT sim).** Sim mode returns fake payout signatures *and* bypasses
      the 30-day wallet-age sybil gate. Treat the boot "sim mode" warning as a launch **blocker**.
- [ ] **Decide economy params or accept the defaults** (see §D). Defaults are conservative.
- [ ] **Legal / geofence decision.** A no-KYC cash-out is high regulatory exposure. At minimum decide
      whether to geofence (block US persons). This is the real gating call.
- [ ] **Devnet dry-run PASSED** (see §C) — the full pull → earn LUMEN → cash-out loop verified with
      throwaway devnet tokens. Do NOT skip this.

---

## B. Launch day — the flip (≈5 minutes, mechanical)

1. **Launch $AETHER on pump.fun** → copy the **mint address**.
2. **Send your dev bag** (the 10% earmarked for payouts) to the **treasury wallet**.
3. On Render → the server service → **Environment**, set:

   **Secrets (never in chat/logs):**
   - `TREASURY_SECRET_KEY` = the treasury key (base58 or JSON array)
   - `SOLANA_RPC` = your paid RPC URL

   **Config:**
   - `AETHER_MINT` = the pump.fun mint address
   - `TREASURY_ADDRESS` = the treasury wallet's public address
   - `TOKEN_MODE` = `mainnet`
   - `REWARDS_POOL_SEED_AETHER` = how much $AETHER you sent to the treasury for payouts
   - `LUMEN_ENABLED` = `true`
   - `EXCHANGE_ENABLED` = `true`
   - `PAYOUT_MAX_PER_TX_AETHER`, `PAYOUT_MAX_PER_DAY_AETHER` = payout ceilings — **set non-zero**
     (default `0` = unlimited; the only backstop independent of the pool accounting). Suggested: per-tx ≈
     the $AETHER value of one full 50-LUMEN redeem at launch price; per-day ≈ a multiple of expected
     daily redeemers.
   - (optional) `STAKED_PVP_ENABLED` = `true` opens LUMEN PvP wagers; if you enable it, ALSO set
     `WAGER_HOLD_DAYS` > 0 (anti-laundering — see §E).

4. Render redeploys. **Verify the boot logs:**
   - `[config] on-chain summons ENABLED (mint=… treasury=… mode=mainnet)`
   - `[store] postgres mode, hydrated N player(s)`
   - No `payout signer not configured` when a redeem is attempted.
5. **Smoke test:** `/health` returns 200; do one real premium pull (confirms payment verify + 30%
   pool credit); confirm the ◆ LUMEN pill + Aether Exchange menu entry appear in-game.

That's it — players buy pulls; eligible players (≥1 purchase + 30-day wallet) can cash out LUMEN.

---

## C. Devnet dry-run (the real proof, before mainnet)

Run the entire loop against a **disposable devnet token** so a signer/decimals/RPC bug surfaces with
fake-value tokens, not real money:
1. Generate a throwaway devnet keypair; airdrop devnet SOL.
2. Create a devnet SPL token; mint a supply to the treasury.
3. Server: `TOKEN_MODE=devnet`, `SOLANA_RPC=https://api.devnet.solana.com` (or a devnet paid RPC),
   `TREASURY_SECRET_KEY` = the throwaway key, `AETHER_MINT`/`TREASURY_ADDRESS` = the devnet token,
   `LUMEN_ENABLED=true`, `EXCHANGE_ENABLED=true`, `REWARDS_POOL_SEED_AETHER` = the minted amount.
4. Drive a pull → earn LUMEN (or grant it) → redeem at the Exchange → confirm the $AETHER lands in a
   test recipient wallet on a devnet explorer.

---

## D. Economy defaults (override via env if desired)

| Knob | Default | Meaning |
|---|---|---|
| LUMEN peg | $0.01 / LUMEN | reference cash-out value |
| Pool funding | 30% of pull revenue | the ring-fence that bounds cash-out |
| Daily / weekly cap | 50 / 250 LUMEN | per-account cash-out limit |
| Min cash-out | 50 LUMEN / tx | smallest single redeem (== daily cap → no dust, forces real accumulation) |
| Hold | none (instant) | LUMEN is redeemable the moment it's earned — a hold kills retention in a token game |
| Eligibility | ≥1 premium pull + 30-day wallet age | rebate on real spend; gates fresh sybil wallets, not real users |
| Burn-tax | 10%→60% dynamic | throttles outflow under pool stress |

**Invariant:** cumulative cash-out can never exceed 30% of pull revenue + your seed; the pool can
never go negative. The economy cannot be drained below what was put in.

---

## E. Security audit (2026-06-25)

A multi-agent red-team (sybil faucet-farm · PvP self-deal · pool bank-run · accounting/timing races, each
finding independently verified) audited the **instant-withdrawal** economy. Verdict: **safe-with-fixes**.

- **Farming is net-negative:** a sybil must spend ≥1 pull (~$1.50, only 30% of which returns to the *global*
  pool, none to the attacker) and age a wallet 30 days, then can extract at most the faucet ceiling
  (~10–12 LUMEN/day) — far below the caps. Break-even on the single pull takes ~17 days of flawless daily
  play; a pure-farm population recovers ≤30% of the revenue it itself provides.
- **Removing the 7-day hold changed nothing structural** — the hold only delayed *when* value exits, never
  the weekly ceiling on *how much*. Keep all current params; do **not** re-add a hold.
- **Required before mainnet** (all env/config, folded into §A/§B): non-zero payout ceilings · `TOKEN_MODE=mainnet`
  · durable `DATABASE_URL` (pool solvency + used-sig ledger need Postgres) · `TREASURY_SECRET_KEY` as a secret.
- **Nice-to-have (deferred):** persist the burn-tax (tau) 7-day window so it can't reset to floor on a
  restart (low economic impact, all inside the pool envelope).

### Staked PvP wagers (audited 2026-06-25)

A 4-lens red-team audited the LUMEN wager engine. Verdict: **safe-with-fixes**. The engine is
**value-conserving** — winnings come only from the loser's stake, the 10% rake is burned, the pool is
never touched, the rake math is exact (no rounding leak), and double-settlement is blocked. The one real
risk: instant-redeemable winnings make it a **sybil-laundering rail** (funnel many feeder accounts' LUMEN
into one gated cash-out wallet). Bounded by the pool invariant + the per-wallet cost + the rake.

**Before enabling `STAKED_PVP_ENABLED=true`:**
- [ ] **Set `WAGER_HOLD_DAYS` > 0** (e.g. 1–3). Wager winnings then aren't redeemable for that many days
      (still spendable / re-wagerable), killing the instant launder-and-cash-out loop. Default 0 = no hold.
- [ ] `TOKEN_MODE=mainnet` (already required) — the sim/dev bypass voids the 30-day wallet gate, the main
      barrier against aggregation.
- [ ] Non-zero payout ceilings (already required) — cap a single-burst drain even if aggregation succeeds.

The 10% rake + [10/50/100] tiers are confirmed correct; keep them. Staked PvP is the clearest real-money
gambling in the design — enable deliberately, with counsel.

## F. Rollback

- Pause cash-out without downtime: `EXCHANGE_ENABLED=false`, redeploy.
- Stop all LUMEN emission: `LUMEN_ENABLED=false`.
- The game stays fully playable in both cases.
