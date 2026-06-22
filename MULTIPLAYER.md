# Aetherbeasts — Multiplayer + Phantom Wallet (v1)

Real-time **PvP battles** with **quick-match**, a **Phantom wallet** login, server-saved
progress, a read-only **$AETHER** balance, and **closed-loop wagers** (stake
*Battle Credits*, winner takes the pot — never on-chain).

Design spec: [docs/superpowers/specs/2026-06-21-multiplayer-wallet-design.md](docs/superpowers/specs/2026-06-21-multiplayer-wallet-design.md)

## Architecture

```
shared/  @aether/shared  — pure engine + the wire protocol (single source of truth)
server/  @aether/server  — authoritative Socket.IO server (matchmaking + battle + credits)
client/  React+Phaser    — overworld game + React PvP arena overlay + wallet/net layer
```

- The battle engine (`shared/src/engine/battle.ts`) is pure + deterministic + seeded.
  PvP runs through `resolveTurnPvP(state, playerAction, opponentAction, rng)`.
- The **server owns** the `BattleState`, the seeded RNG, and the wager currency. Clients
  send only *intents* (a chosen move/switch) and animate server-sent events. This is what
  makes stakes un-forgeable.
- Each client gets a **perspective-correct** view (it always sees itself as "you"); the
  server flips event sides for the opponent.

## Currencies (and the gambling boundary)

| Currency | Where | Used for | At stake in PvP? |
|---|---|---|---|
| `$AETHER` (◈, in-game) | client save | free gacha / shop / PvE rewards | no |
| **Battle Credits** | **server-authoritative** | **PvP wagers** | **yes** |
| on-chain `$AETHER` | wallet | **premium summons** (one-way) + display | never |

Battle Credits are a non-redeemable in-game soft currency. **There is no on-chain payout
or token escrow** — staking real tokens on a match outcome is unlicensed gambling and is
deliberately out of scope. The on-chain `$AETHER` is spent **one-way** (you buy summons; you
never cash out beasts or earnings into the token), keeping premium pulls a loot box (with
published odds) rather than gambling.

## On-chain $AETHER gacha (premium summons)

Premium summons are paid in the real `$AETHER` token, priced in **USD** and converted to
`$AETHER` at the **live token price**, so a pull costs ~constant dollars no matter how far
the token moves — you never re-price by hand.

Flow (no custody — the treasury just receives a payment):
1. Client asks the server for a quote → server returns `{ aetherAmount, treasury, valid 90s }`
   (USD target ÷ live price from Jupiter → DexScreener, cached 60 s, floored on outage).
2. Client builds an SPL transfer of that `$AETHER` to the treasury and Phantom signs+submits it.
3. Client sends the signature; the server **verifies the transfer on-chain** (mint, amount,
   recipient, confirmed, single-use) and only then runs the pull **server-side** (server RNG +
   the player's pity) and returns the authoritative save.

The whole feature is **dormant** until `AETHER_MINT` + `TREASURY_ADDRESS` are set, so the live
game is unchanged until launch. Tune prices with `SUMMON_USD_1` / `SUMMON_USD_10` (env, no code
change).

## Run it locally

```bash
npm install
npm run dev          # starts BOTH the server (:3001) and the client (:5181)
# open http://localhost:5181 — the title screen shows "Arena online" when connected
```

Other scripts: `npm run dev:client-only`, `npm run test` (engine unit tests),
`npm run test:server` (two-client PvP e2e), `npm run typecheck`, `npm run build`.

To battle yourself, open the client in two browser profiles (or a normal + incognito
window), hit **⚔ Arena → Quick Match** at the same stake in both.

## Deploy

- **Server:** Render blueprint in [`render.yaml`](render.yaml) (or any Node host with
  native WebSockets — avoid free tiers that sleep). Optional `DATABASE_URL` enables durable
  Postgres accounts; without it the server runs in memory.
- **Client:** set `VITE_SERVER_URL` to the deployed server URL (see
  [`client/.env.example`](client/.env.example)) and build with `npm run build`.

## $AETHER balance modes

`TOKEN_MODE` (server env): `sim` (default — a stable fake balance, no token needed),
`devnet`, or `mainnet`. For real reads set `AETHER_MINT` to the SPL mint; the server reads
the balance over JSON-RPC.

## Wallet sign-in

Phantom login is a free, off-chain `signMessage` over a single-use server nonce, verified
with ed25519 (`tweetnacl`/`bs58`). The wallet pubkey becomes your account key; connecting a
wallet claims your current guest progress.
