# Deploying Aetherbeasts

The game is three pieces: an **authoritative server** (Node + Socket.IO), a
**static client** (built by Vite), and the optional **$AETHER token** that turns on
premium summons. You can ship the server + client first and leave the token off —
the game is fully playable without it.

> Nothing on-chain goes live by accident: premium summons stay **disabled** until
> both `AETHER_MINT` and `TREASURY_ADDRESS` are set. The server prints its resolved
> on-chain state at boot and warns on any half-configuration.

---

## 1. Server (Render — blueprint included)

The repo ships a [`render.yaml`](render.yaml) blueprint.

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. On [Render](https://render.com): **New → Blueprint** → pick this repo. It builds
   `npm install --include=dev` and starts `npm run start` (runs via `tsx`, no build
   step), health-checked at `/health`.
3. Use the **Starter** plan or higher — **not** Free (it sleeps and drops live
   battles).
4. Set environment variables (see the [reference](#environment-variables) below).
   For a server-only launch you just need `CLIENT_ORIGIN`; leave the on-chain block
   unset.
5. (Recommended) Add a **Postgres** instance and set `DATABASE_URL` — it persists
   accounts *and* makes used-payment signatures durable (replay-safe across restarts
   and multiple instances).

Note the service URL (e.g. `https://aetherbeasts-server.onrender.com`).

## 2. Client (any static host — Netlify / Vercel / Cloudflare Pages)

The client is a static bundle. Build it with the server URL baked in (Vite inlines
`VITE_*` at **build time**, so these must be set wherever you build):

```bash
VITE_SERVER_URL=https://aetherbeasts-server.onrender.com \
VITE_SOLANA_RPC=https://<your-paid-rpc>          # only needed once the token is live
npm run build                                     # output: client/dist
```

Deploy `client/dist` to your host. On Netlify/Vercel set those same two vars in the
project's build environment and point the build at `npm run build` (publish
`client/dist`). Set `CLIENT_ORIGIN` on the server to this client's origin.

## 3. Turn on the $AETHER gacha (when you launch the token)

1. Launch **$AETHER** (e.g. on pump.fun) and grab the **mint address**.
2. Create/choose a **treasury wallet** that premium summons pay into.
3. On the **server**, set: `AETHER_MINT`, `TREASURY_ADDRESS`, `TOKEN_MODE=mainnet`,
   a **paid** `SOLANA_RPC` (the public endpoint rate-limits and will deny paid
   pulls), and tune `SUMMON_USD_1` / `SUMMON_USD_10`. Set `AETHER_PRICE_FLOOR_USD`
   near your launch price.
4. On the **client** build, set `VITE_SOLANA_RPC` to a paid mainnet RPC and rebuild.
5. Redeploy. The server log should read `on-chain summons ENABLED (...)`. The
   "Pay with $AETHER" buttons now appear in-game.

Prices are USD-pegged and converted to $AETHER at the live price, so a pull costs
~the same dollars no matter how far the token moves — no manual re-pricing.

---

## Environment variables

**Server** (see [`server/.env.example`](server/.env.example))

| Var | Needed | Notes |
|---|---|---|
| `CLIENT_ORIGIN` | always | your client origin (don't leave `*` in prod) |
| `DATABASE_URL` | recommended | Postgres → durable accounts + replay protection |
| `TOKEN_MODE` | for token | `sim` (default) / `devnet` / `mainnet` |
| `AETHER_MINT` | for token | the $AETHER SPL mint |
| `TREASURY_ADDRESS` | for token | wallet that receives summon payments |
| `SOLANA_RPC` | for token | **paid** RPC (Helius/QuickNode) — public 429s deny pulls |
| `SUMMON_USD_1` / `SUMMON_USD_10` | optional | USD price per pull (`1.5` / `13.5`) |
| `AETHER_PRICE_FLOOR_USD` | optional | fallback price if the feed is down |
| `AETHER_DECIMALS` | optional | mint decimals (pump.fun = `6`) |

**Client** (see [`client/.env.example`](client/.env.example)) — build-time only:

| Var | Needed | Notes |
|---|---|---|
| `VITE_SERVER_URL` | always | the deployed server URL (else it points at localhost) |
| `VITE_SOLANA_RPC` | for token | paid mainnet RPC for submitting payments |

## Checklist

- [ ] Server deployed, `/health` returns ok, not on a sleeping free tier
- [ ] `CLIENT_ORIGIN` set to the real client origin (CORS locked down)
- [ ] Client built with `VITE_SERVER_URL` → connects (title shows "Arena online")
- [ ] (Token) `AETHER_MINT` + `TREASURY_ADDRESS` set; boot log says **ENABLED**
- [ ] (Token) paid `SOLANA_RPC` + `VITE_SOLANA_RPC`; `TOKEN_MODE=mainnet`
- [ ] `DATABASE_URL` set for durable accounts + replay protection

## Before going on-chain

Get **legal counsel** on the premium-summon (loot-box / consumer-protection),
treasury-handling, and money-transmission (MSB) questions for your jurisdiction. The
code keeps clear lines — closed-loop Battle Credits, one-way token spend, no NFTs,
no on-chain wager pot — but the launch decision is yours and is outside the code.
