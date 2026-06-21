# Aetherbeasts — Multiplayer + Phantom Wallet (v1) Design

**Date:** 2026-06-21
**Status:** Draft for review
**Scope:** One cohesive milestone delivering: a backend server, Phantom wallet login/identity, server-saved progress, read-only `$AETHER` balance, authoritative real-time PvP battles via quick-match, and closed-loop soft-currency wagers.

---

## 1. Goal & decisions

Turn the single-player, fully client-side Aetherbeasts into a wallet-authenticated multiplayer game where two players can battle each other for stakes — built on a server that can't be cheated.

User decisions (2026-06-21):
- **Sequencing:** *Both together* — server + wallet + working PvP ship as one milestone. (Built internally in dependency order to de-risk; see §10.)
- **Stakes:** *Closed-loop soft wager* — players stake in-game soft currency; winner takes the in-game pot. **No on-chain payout.**
- **Matchmaking:** *Quick-match queue* — auto-pair two waiting players.

Assumed defaults (override anytime):
- Hosting: Render or Railway (always-warm, native WebSocket), ~$5–7/mo, optional Postgres.
- Auth: classic nonce + `signMessage` (reuses FarmTown's `auth.ts` 1:1).
- `$AETHER` balance: **sim mode** until a devnet mint exists; `sim → devnet → mainnet` config switch.
- Turn timer: 30s/turn; ~60s reconnect grace before forfeit.

---

## 2. The hard boundary (non-negotiable)

A pot where the game **escrows real on-chain `$AETHER` and pays the winner** is unlicensed real-money gambling (prize + chance + consideration; battle RNG defeats the skill-game exemption) **and** money transmission (custody → FinCEN MSB + state licenses). **This will not be built**, memecoin status notwithstanding.

**What ships instead:** a closed-loop wager in **soft currency that is never redeemable on-chain** — in-game points/credits, winner takes the in-game pot, ranking and bragging rights. Connecting Phantom, wallet-as-login, and *reading* an `$AETHER` balance are all non-custodial and clean.

**Out of scope (this milestone and until cleared with gaming-law counsel):** on-chain token escrow, pot-to-winner payouts, buying/selling `$AETHER`, any custody of user funds.

---

## 3. Current state (verified)

- **No server, no networking, no wallet.** Two npm workspaces: `shared/` (pure-TS engine) + `client/` (React+Phaser+Vite).
- **Battle engine is already authoritative-ready.** `shared/src/engine/battle.ts`: `resolveTurn(state, action, rng): BattleEvent[]` (line 285) is pure + deterministic + seeded; runs headlessly in tests. This is the exact core a PvP server needs.
- **Identity & economy are local and forgeable.** `client/src/state/persistence.ts` holds `SaveAdapter { load/save/clear }`, `localSaveAdapter` (localStorage key `aetherbeasts:save:v1`), and `getOrCreatePlayerId()` (random `local_xxxx`, commented as a wallet-pubkey placeholder). `$AETHER` is mintable client-side (there is a free-mint "Buy $AETHER" button in the Summon panel).
- **FarmTown (sibling) is the reuse source** — same React+Vite+TS monorepo with a complete Socket.IO server + Phantom nonce auth + optional-Postgres store. See §9.

---

## 4. Architecture

```
aetherbeasts/
├── shared/   @aether/shared  — engine + NEW wire-protocol types (single source of truth for events)
├── server/   NEW workspace   — Socket.IO authoritative server (ported from FarmTown)
└── client/   React+Phaser    — wallet providers, net layer, PvP-aware BattleScene
```

- **Transport:** Socket.IO over `http.createServer` (no Express), matching FarmTown. Turn-based ⇒ request → authoritative response (no optimistic predict/rollback).
- **Authority:** server owns `BattleState` + the seeded RNG + the soft-currency economy. Clients send *intents* (chosen action) and *animate* server-sent `BattleEvent[]`. Clients never resolve real state.
- **State location:**
  - Durable per-player (save, soft-currency balance, creatures, pity): in-memory `Map` canonical + **optional** Postgres `jsonb` blob (write-through). Survives restart only if Postgres is on.
  - Ephemeral per-match (`BattleState`, seed, pending actions, escrowed stakes): in-memory `Map<matchId, Match>`. Plus a per-turn move/RNG log so an in-flight staked match can be reconstructed after a restart and audited.
- **Single instance** to start. Multi-instance later requires sticky sessions + a Redis Socket.IO adapter — so the data model must not assume cross-socket in-memory locality beyond a single match's room.

---

## 5. Subsystems

### 5.1 Server foundation (M)
New `server/` workspace ported from FarmTown `server/src/`:
- `index.ts` — `http.createServer` + `new Server(httpServer, { cors })`, top-level-await `store.init()`, `/health`, auth handlers, post-auth `Session`, and the **per-player idempotency/cooldown gate** (`guard`/`replayCached`/`rememberResult`). The gate matters *more* in PvP: a turn submission must be exactly-once across reconnects. **Drop** FarmTown's three `setInterval` world loops — turn-based has no continuous simulation.
- `config.ts` — `PORT` (3001), `CLIENT_ORIGIN` (CORS), `DATABASE_URL` (`''` ⇒ in-memory), `SOLANA_CLUSTER`; add `$AETHER` mint + `TOKEN_MODE`.
- `store.ts` — in-memory Maps canonical + optional Postgres (`CREATE TABLE IF NOT EXISTS`, boot hydration, per-row `writeChains` anti-clobber). Rename FarmTown's `farms` table to `players`; blob = `SaveData`.
- Root `package.json` → workspaces `['shared','server','client']` + a `concurrently` dev script.

### 5.2 Wallet connect + identity (M)
- **Client:** add `@solana/wallet-adapter-react` (+ `react-ui`, `wallets`) over `@solana/web3.js ^1.9x`, plus `vite-plugin-node-polyfills` with `globals.Buffer = true, globals.process = true` (avoids `Buffer is not defined`). Wrap app in `ConnectionProvider(devnet) → WalletProvider(Phantom, autoConnect) → WalletModalProvider`. Add `WalletMultiButton` to the title screen.
- **Auth handshake:** `auth:challenge` (server issues single-use, short-TTL nonce) → client signs `buildLoginMessage(nonce)` via `useWallet().signMessage` → `auth:verify` → server verifies with ported `auth.ts` (`tweetnacl` ed25519 over `bs58` pubkey/sig), re-deriving the exact signed message → `auth:ok` with a session token keyed to the pubkey.
- **Identity:** replace `getOrCreatePlayerId()` with the wallet pubkey. Guest-token auth (`auth:guest` + token resume) also wired so the game is playable without a wallet and so dev/testing two clients is trivial.

### 5.3 Server-backed save (M)
- Implement `ServerSaveAdapter` behind the existing `SaveAdapter` seam.
- **Wrinkle:** the seam is synchronous (`load(): SaveData | null`). Server I/O is async. Pattern: on login, **hydrate once** (await server fetch) into an in-memory cache, then `load()` returns the cache and `save()` write-throughs to both localStorage (offline cache) and a debounced server push. Game code is untouched.

### 5.4 `$AETHER` balance display (S) — read-only
- `connection.getParsedTokenAccountsByOwner(owner, { mint: AETHER_MINT })` (or ATA + `getAccount`); empty ⇒ `0`.
- Per-cluster config with `TOKEN_MODE` `sim | devnet | mainnet`. Ships in **sim** (fake number) with the real RPC path stubbed behind the switch, so flipping to a real mint is a config change. Pure display — no signing, no spend, no escrow. (OFFWORLD's `scripts/create-token.ts` is the recipe when devnet funding lands.)

### 5.5 Authoritative PvP battle (L) — the genuinely new work
The engine currently bakes in the wild AI. Refactor:
- Add `resolveTurnPvP(state, playerAction, opponentAction, rng): BattleEvent[]`. Make `doMoveExchange` (`battle.ts:322–323`) accept the opponent's submitted move index instead of calling `enemyChooseMoveIndex`; do the same for the item/catch/switch free-move path (`battle.ts:345`). `decideOrder` / `effectiveSpeed` / `resolveMove` / `endOfTurnAilments` / `mustSwitch` / `applyForcedSwitch` are reused unchanged.
- **Server per match:** one `BattleState` + `seededRng(seed)`; collect *both* players' `PlayerAction` in a `pendingActions` map; resolve once both arrive (or on turn-timeout auto-pick); broadcast `BattleEvent[]` to room `match:{id}`. Clone teams before simulating (no client-driven in-place desync). `isWild: false` (auto-disables catch). PvP win/lose conditions + a reward/rating hook — **not** the PvE `awardWin` (no exp/catch/prize).
- **Validate every action** before resolving: whose turn, legal move, PP available.
- **Client BattleScene:** generalize from "player = local / enemy = AI" to: accept both teams from the server, gate input to the local side, await server events instead of resolving locally. Replace `deterministicRng()` (currently returns `Math.random()`) so the client never needs a real RNG — the server owns it; the client only plays back events.
- **Tests:** new `battle.pvp.test.ts` — same two teams + same seed on two "sides" ⇒ identical event stream; turn order, faints, forced switches resolve correctly from collected actions.

### 5.6 Matchmaking / lobby (M)
- **Quick-match queue:** push a waiting socket; when a second arrives, pop the pair. On pair: mint `matchId`, both sockets `join('match:'+matchId)`, create `Match { state, seed, players:[a,b], pendingActions, stake }`.
- Shared lifecycle events: `match:find`, `match:found { matchId, opponent, youAre, teams, stake }`, `battle:action`, `battle:events`, `match:over { outcome, potAwarded }`, `opponent:left`.
- Per-match `setTimeout` turn-timeout (auto-pick/forfeit) — modeled on FarmTown's star-expiry timer, **not** its interval sweeps.
- Reconnect: re-send a perspective-correct `BattleState` snapshot to the returning player within the grace window; expiry ⇒ forfeit.

### 5.7 Economy / wager layer (L) — closed-loop only
- Make soft currency + creature ownership **server-authoritative**: balance, gacha summon (server-owned RNG + pity, reusing `shared` `gacha.ts`), awakening, rewards, `buyItem`. This kills client forgery.
- **Wager:** at quick-match, both players ante a **fixed soft-currency stake** (one preset tier for v1; configurable/selectable tiers are a later add); server escrows it in `Match.stake`; on `match:over` the server credits the pot to the winner and persists. Forfeit/disconnect-past-grace ⇒ opponent wins the pot. Purely in-game numbers; never touches the chain.
- **Remove the free-mint "Buy $AETHER" demo button** before any value is at stake.
- **Terminology:** keep the staked currency clearly *soft* (e.g. "Battle Credits" / ranked points) and distinct from the on-chain `$AETHER` balance shown read-only, so there is no implication of cashing out.

---

## 6. Wire protocol (new shared types)

Mirror FarmTown's `ServerToClient` / `ClientToServer` typed maps in `shared/`. Most payloads already exist (`PlayerAction`, `BattleEvent[]`, a serializable `BattleState` snapshot); add the auth + match-lifecycle events above. Shared types are the single source of truth for the wire — client and server both import them.

---

## 7. Anti-cheat invariants (must hold)

1. Server owns `BattleState` + seeded RNG; clients only animate `BattleEvent[]`.
2. Every `PlayerAction` validated (turn ownership, legal move, PP) server-side before resolution.
3. Teams cloned before simulation.
4. Soft-currency balance, gacha RNG/pity, ownership all server-side; no client mint.
5. Auth nonce: server-generated, single-use, short-TTL, exact-message re-derivation (no replay).
6. Turn submission idempotent across reconnects (the ported per-player gate).

---

## 8. Risks & constraints

- **Gambling / money-transmission boundary** — see §2. Closed-loop soft currency only.
- **Engine refactor is real work** — FarmTown resolves each action immediately (touches one farm); PvP must *collect both* actions then resolve once, and the wild-AI is currently hardwired (§5.5). FarmTown's optimistic predict/rollback does **not** port.
- **Vite polyfills** — `@solana/web3.js` needs Node globals; use `vite-plugin-node-polyfills` (not the `define: { global }` hack).
- **Hosting/persistence** — avoid free tiers that sleep (drop live battles). In-memory match state is lost on crash; persist active matches + per-turn log for staked games. Don't assume in-memory locality for multi-instance later (sticky + Redis adapter).
- **Devnet token** — `$AETHER` devnet funding pending; ship balance in sim mode; wrong mint silently shows 0, so keep per-cluster mints in config.
- **Dependency pinning** — `@solana/web3.js ^1.9x`; do **not** adopt `@solana/kit` (web3.js v2) mid-milestone.

---

## 9. Reuse map (FarmTown → Aetherbeasts)

| FarmTown file | Reused for |
|---|---|
| `package.json` (root) | 3-workspace template + `concurrently` dev script |
| `server/package.json` | new `server` pkg: `type:module`, `tsx` scripts, deps `socket.io ^4.8`, `pg`, `dotenv`, `cors`, `bs58`, `tweetnacl`; dep `@aether/shared` |
| `server/src/index.ts` | server skeleton + auth handlers + per-player idempotency gate (drop interval world loops) |
| `server/src/store.ts` | in-memory + optional Postgres `jsonb` store; `farms`→`players` |
| `server/src/config.ts` | env scaffold + `$AETHER` mint + `TOKEN_MODE` |
| `server/src/auth.ts` | Phantom nonce verify (tweetnacl/bs58) almost verbatim; change message string |
| `client/src/solana/wallet.ts` | wallet helper reference (modern path: `useWallet().signMessage`) |
| `client/src/net/socket.ts` | lazy `ensureSocket()` + `wire()` + reconnect/token-resume (drop predict/rollback) |
| `shared/src/types.ts` | "shared types = wire protocol" pattern; add match-lifecycle events |

---

## 10. Internal build order (ships as one milestone, built to de-risk)

1. `server/` workspace + shared wire types + in-memory store + `/health`; root workspaces + dev script. **Verify:** server boots, client still runs.
2. Guest auth + `ServerSaveAdapter` (async hydrate + write-through). **Verify:** existing save round-trips through the server.
3. Phantom connect + nonce sign-in → identity = pubkey. **Verify:** connect → sign → save keyed to pubkey.
4. `$AETHER` balance (sim mode) in HUD.
5. Engine refactor `resolveTurnPvP` + server seeded RNG + `battle.pvp.test.ts`. **Verify:** tests green.
6. `Match` model + quick-match queue + room join + turn collection + broadcast.
7. Client BattleScene PvP mode (input gated to local side, animate server events). **Verify:** two browsers complete a battle.
8. Closed-loop wager: ante → escrow in `Match.stake` → award pot to winner server-side.
9. Server-authoritative economy hardening (balance/gacha/awaken server-side); remove free-mint button.
10. Reconnect/timeout/forfeit.
11. Deploy config (Render/Railway) — local works without it.

---

## 11. Acceptance criteria (v1 done)

- Two players open the game, connect Phantom (or guest), and are matched by the quick-match queue.
- Each anteing soft currency; the server escrows the pot.
- They battle a full turn-based match where the **server** resolves every turn (clients only animate); illegal/forged actions are rejected.
- The winner receives the soft-currency pot; balances persist server-side keyed to the wallet pubkey.
- A read-only `$AETHER` balance is visible (sim mode).
- No on-chain custody, payout, or spend anywhere in the flow.
- `shared` tests (incl. new PvP tests) pass; client builds clean.

---

## 12. Out of scope (v1)

On-chain `$AETHER` wagering/escrow/payout · buying/selling `$AETHER` · spectating · tournaments/brackets · ranked seasons/leaderboard UI (rating *hook* only) · multi-server scaling (Redis adapter) · mobile.
