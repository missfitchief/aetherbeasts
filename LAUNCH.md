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
   - (optional) `PAYOUT_MAX_PER_TX_AETHER`, `PAYOUT_MAX_PER_DAY_AETHER` = payout ceilings

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
| Min-hold | 7 days | newly-earned LUMEN can't be cashed instantly |
| Eligibility | ≥1 premium pull + 30-day wallet | cash-out is a rebate on real spend |
| Burn-tax | 10% floor (governor TODO) | throttles outflow under pool stress |

**Invariant:** cumulative cash-out can never exceed 30% of pull revenue + your seed; the pool can
never go negative. The economy cannot be drained below what was put in.

---

## E. Rollback

- Pause cash-out without downtime: `EXCHANGE_ENABLED=false`, redeploy.
- Stop all LUMEN emission: `LUMEN_ENABLED=false`.
- The game stays fully playable in both cases.
