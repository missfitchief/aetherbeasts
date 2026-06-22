# Aetherbeasts — Solana GTM + $AETHER Token Strategy

**Date:** 2026-06-22
**Status:** Draft for review
**Scope:** Go-to-market positioning + a phased path to an on-chain $AETHER token this year, built on what's already shipped. Strategy/architecture doc — not a feature implementation plan (that follows per phase).

---

## 1. Decisions (locked with the user)

- **Wallet:** **mandatory Phantom login stays** (no guest play). It doubles as the sybil-resistant identity that makes a retroactive token distribution credible.
- **Token:** **target a TGE this year** — an on-chain SPL `$AETHER`. Gated on the guardrails in §4 (counsel + proven retention before the mainnet mint).
- **Lead GTM:** an **off-chain "Season 0" points campaign** on the wallet-native model, on a **PENGU-style "fun game first, $AETHER is the in-game currency"** positioning spine. The PvP prediction/esports layer is deferred (highest gambling-line risk).

## 2. Why this is the right shape (the 2026 meta)

- Memecoin launchpads are a drawdown casino; a bonding-curve stealth-mint now signals *rug* to sophisticated degens. Use a launchpad only as a clean issuance rail.
- ~90% of web3 games died because **emissions papered over thin gameplay**. The only living model is **game-first, token-LAST, sinks-not-emissions**. Aetherbeasts already sits on the right side: real game shipped, `$AETHER` off-chain/sim, Battle Credits closed-loop.
- **Blueprint = PENGU/Pudgy World**: token-as-currency around a real brand + real game, fun-first.
- The mandatory wallet + closed-loop credits + the disciplined refusals already made (no on-chain pot, no Ponzi, capped carried credits) keep us inside both the securities and gambling safe harbors. **The GTM must not undo that.**

## 3. Phased plan

### Phase A — Off-chain, ship now (no token, low risk)
1. **Season 0 points ledger + public leaderboard.** Skill-gated points from existing server data: PvP wins / Elo, ranked-ladder climb, Aether-Dex completion, evolution milestones. Points are **non-transferable, non-cashable, no attached dollar value**. A read-side aggregation over the existing Elo/Battle-Credits/match ledger — no new game systems.
2. **Publish gacha odds + pity** (5★ 3% / 4★ 12% / 3★ 85%; 4★@10, 5★@80) in-game and in a public doc — proactive loot-box transparency + trust signal.
3. **Reframe all `$AETHER` copy** from "earn $AETHER" to "a fun Solana monster game where $AETHER is the in-game currency." Closes the securities-marketing risk; costs nothing.
4. **Pin a plain-English commitment:** no rug / no cash-out / no NFT / token-later, with the rug-checklist intent (revoke mint+freeze, lock liquidity, no insider concentration). Honest today because nothing is sold.

### Phase B — Token groundwork (design + devnet, no mainnet yet)
1. **Tokenomics design doc:** fixed supply, no inflation; **sinks not emissions** (gacha, cosmetics, season passes funded by play/spend); a **capped retroactive allocation to Season-0 players by time-weighted points** — never depositors, never pre-sold.
2. **`TOKEN_MODE` already exists** (`sim → devnet → mainnet`). Mint `$AETHER` on **devnet** first; wire the read-only balance to the real devnet mint (the server's `aetherBalance` already supports this).
3. **Buyback-from-revenue burn dashboard** (spec only) framed as supply stabilization, never yield (Echelon Prime pattern).
4. **Snapshot tooling:** deterministic, auditable Season-0 points → allocation table.

### Phase C — TGE (gated; only after §4 is satisfied)
1. Crypto-securities + gambling **counsel sign-off** (non-negotiable).
2. Retention bar met (see §6 open data question).
3. Mainnet mint via a reputable launchpad as a **clean issuance rail**: revoke mint+freeze authority, lock liquidity, zero insider concentration.
4. **Retroactive airdrop** to Season-0 players. No public sale framed as investment.

## 4. Hard lines (do not cross — these keep both safe harbors)

- `$AETHER` is **only** ever an in-game utility currency. **Never** marketed with price / ROI / "returns" / yield language.
- **Battle Credits stay non-cashable and strictly separate** from `$AETHER`. They never cash out or convert to a cashable token (that would make PvP wagering unlicensed gambling + money transmission).
- **No NFTs / no tradable beasts** (unchanged).
- The gacha currency stays **non-cashable** and is **not** the cashable `$AETHER` (loot-box exposure: FTC HoYoverse, EU Digital Fairness Act).
- **Counsel before** any mainnet TGE and before any prediction/esports layer goes live.

## 5. Architecture — leverage what's built

| Need | Already shipped |
|---|---|
| Sybil-resistant identity | Mandatory Phantom login (server refuses anonymous guests, caps carried credits, domain-bound message) |
| Points source-of-truth | Server-authoritative Elo + Battle-Credits + match ledger |
| Token balance read | `aetherBalance` w/ `TOKEN_MODE` sim→devnet→mainnet + per-cluster mint config |
| Closed-loop economy | Battle Credits (non-cashable wager), off-chain `$AETHER` currency |
| Gacha w/ pity | `shared/engine/gacha.ts` (+ tests) |

New build is mostly **read-side** (points aggregation, leaderboard page, public odds/commitment docs) + **token groundwork** (devnet mint, snapshot tooling) — not new core game systems.

## 6. Risks & open data

- **Retention is the load-bearing unknown.** The "token-later / TGE-this-year" thesis only holds if real players show up. Need DAU/WAU + D1/D7/D30 + session length. If thin, the answer is more game + marketing before any mint.
- **TGE-this-year is the riskiest choice on the board** — it's the move that killed most web3 games. Mitigated by: Season-0 retention proof first, sinks-not-emissions, clean retroactive distribution, counsel sign-off.
- Mandatory wallet shrinks top-of-funnel (accepted trade for sybil-clean airdrop).

## 7. First concrete deliverable

**Season 0 points leaderboard** (Phase A.1) — a read-only server aggregation + a leaderboard view, plus publishing gacha odds and the no-rug commitment. Lowest risk, immediate engagement, zero token exposure, and it's the data foundation the eventual retroactive airdrop is computed from.

## 7a. ADDENDUM (2026-06-22) — pump.fun launch + $AETHER as gacha currency (supersedes the Phase A→C delay)

User decision: **launch `$AETHER` on pump.fun now**, then implement it in-game as the **spend currency for gacha + shop**, then go live. This pulls the token forward (vs the "token-later" phasing above). Build architecture:

- **Pay-per-summon, verified on-chain (NO custody).** To buy a premium pull, the client builds an SPL transfer of `$AETHER` to the game **treasury** and the player signs it (Phantom `signAndSendTransaction`). The server **verifies the transfer on-chain** (mint == `$AETHER`, amount ≥ price, recipient == treasury, confirmed, and the tx signature not already used — replay-proof), then runs the gacha with **server-owned RNG + the published pity** and writes the resulting beasts to the player's save. No custodial in-game token balance ⇒ lighter money-transmission profile than a deposit/withdraw wallet.
- **One-way only.** Beasts are non-tradable (no NFTs); there is **no withdrawal / cash-out** of anything into `$AETHER`. The free/earned **◈** path (battle rewards, dupes) remains for non-payers and standard pulls.
- **Battle Credits stay separate + non-cashable** — the cashable `$AETHER` is never wagered in PvP.
- **Devnet first, flip-ready.** Built + tested against a devnet `$AETHER` mint; going live = set `AETHER_MINT` + `TREASURY` + `TOKEN_MODE=mainnet` to the pump.fun values.
- **Go-live checklist:** (1) `$AETHER` live on pump.fun; (2) treasury wallet set; (3) **counsel sign-off on the custodial/loot-box/MSB questions** (user's compliance step); (4) publish odds; (5) flip config; (6) deploy server (Render) + client (`VITE_SERVER_URL`).
- Hard lines from §4 still bind: never market `$AETHER` as an investment; no cashable wagering; no cash-out.

## 8. Out of scope (for now)

On-chain wagering / pot-to-winner · cashable `$AETHER` · the PvP prediction/esports layer (Phase 2 of a later cycle, counsel-gated) · NFTs · any public token sale framed as investment.
