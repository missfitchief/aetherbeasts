# 🐉 Aetherbeasts

An original **2D top-down monster-collector RPG** for the browser — explore a tile
world, find and battle wild Aetherbeasts, capture them, build a team, level up and
evolve, and fill your Aether-Dex. On top of the single-player core it adds
**real-time PvP**, a **Phantom wallet** login, and an optional **on-chain $AETHER**
gacha — built so the game is fun *without* spending a cent.

> **No NFTs.** The only digital asset is the **$AETHER** token, and it is a utility
> currency for premium summons — never sold or marketed as an investment. See
> [the currency model](#currencies--the-money-boundary) below.

```
aetherbeasts/
├─ shared/   @aether/shared — pure-TS game CORE + wire protocol (unit-tested):
│            data (species, moves, types, items, encounters) + all rules
│            (damage, capture, exp, stats, battle, evolution, gacha).
├─ server/   @aether/server — authoritative Socket.IO server: matchmaking,
│            server-resolved PvP, Battle-Credit wagers, wallet sign-in,
│            and on-chain $AETHER payment verification.
├─ client/   React + Vite + Phaser 3 — the game (Overworld + Battle scenes)
│            plus React overlays (HUD, panels, PvP arena, wallet/net layer).
└─ tools/    extract-assets.mjs — pulls sprites + audio from the source engine.
```

## Quick start

```bash
npm install
npm run assets     # one-time: extract creature sprites + audio (needs tools/_engine)
npm run dev        # starts BOTH the server (:3001) and the client (:5181)
# open http://localhost:5181 — connect Phantom to play
```

| Script | What it does |
|---|---|
| `npm run dev` | server + client together (hot-reload) |
| `npm run dev:client-only` | just the client |
| `npm test` | engine unit tests (Vitest) |
| `npm run test:server` / `test:auth` | two-client PvP + wallet-auth end-to-end |
| `npm run test:payments` / `test:store` | on-chain money-math + save/replay guards |
| `npm run typecheck` / `npm run build` | full typecheck / production build |

## Features

- **Single-player core** — overworld exploration, a juicy turn-based battle system,
  the classic 3-wobble capture, Party / Box / Aether-Dex, level-ups, evolution, and
  enterable building interiors. Fun and complete on its own.
- **Real-time PvP** — quick-match into a server-authoritative battle and stake
  **Battle Credits** (a closed-loop, non-cashable soft currency). The server owns
  the battle state + RNG, so wagers can't be forged; each client sees a
  perspective-correct view.
- **Phantom wallet login** — a free, off-chain `signMessage` over a single-use
  nonce (ed25519). Your wallet is your account; login is mandatory (it's the
  Sybil gate for any future rewards).
- **On-chain $AETHER gacha** *(dormant until a token is configured)* — premium
  summons priced in **USD** and paid in $AETHER at the live token price, verified
  on-chain and resolved server-side. Spending is **one-way** (you buy pulls; you
  never cash out), keeping it a published-odds loot box, not gambling.

## Currencies & the money boundary

| Currency | Where | Used for | Cashable? |
|---|---|---|---|
| `$AETHER` in-game (◈) | client save | free gacha / shop / PvE rewards | no |
| **Battle Credits** | server-authoritative | **PvP wagers only** | no |
| on-chain `$AETHER` | your wallet | premium summons (one-way) | no — never paid out |

Battle Credits are never on-chain and never redeemable; there is **no token pot or
escrow on a match outcome**. The on-chain token is only ever *spent into* the game.
These lines are deliberate — they keep the game clear of unlicensed gambling and
keep $AETHER a utility currency rather than an investment.

## Architecture highlights

- The battle engine (`shared/src/engine/battle.ts`) is **pure, deterministic, and
  seeded** — PvP runs through `resolveTurnPvP(state, you, them, rng)` on the server.
- The wire protocol in `shared/src/net/protocol.ts` is the single source of truth
  shared by client and server, so the two can't drift.
- On-chain payments are verified in **exact integer base units**, bound to the
  paying wallet, single-use (durable when a DB is configured), and recoverable if a
  result packet is lost — see the [security notes](MULTIPLAYER.md).

More: [MULTIPLAYER.md](MULTIPLAYER.md) · [DEPLOY.md](DEPLOY.md) ·
design specs in [`docs/superpowers/specs/`](docs/superpowers/specs).

## Assets & originality

Creature sprites, battle FX, UI sprites, music, SFX, the outdoor tileset, and the
character walk sheets are extracted from the project-provided **Yal Monster
Collector Engine** (commercial use OK, no resale — see
[`client/public/assets/ASSETS_CREDITS.md`](client/public/assets/ASSETS_CREDITS.md)).
Trees, buildings, and overlays are drawn procedurally. All creature names, the
world/region, types, the multiplayer + economy systems, and all game code are
**original**; only generic genre mechanics (turn math, capture, type tiers) are
shared conventions.

## Notes

- React **StrictMode is intentionally off** — its dev double-mount destroys the
  Phaser game mid-boot.
- Save data lives behind a `SaveAdapter` seam (local ↔ server) keyed to the wallet,
  so progression follows the account without touching game code.
