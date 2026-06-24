# Live Shared Overworld + Busier Grass — Design

**Date:** 2026-06-24
**Goal:** Make the world feel alive and retain players. (1) Everyone is visible on the same
map in real time, with emotes + quick-chat. (2) The grass is busier so the catching loop
never stalls between spawns.

Additive layer on the existing Socket.IO server (which already runs auth/PvP/quests/economy).
The single-player Phaser overworld is unchanged except for rendering other players + sending
position. Presence is **ephemeral** (in-memory; dies with the socket) — nothing persisted.

## 1. Server — presence layer (`server/src/presence.ts` + wires in `index.ts`)

Per-socket presence record: `{ playerId, name, map, x, y, facing, sprite }`. Socket.IO
**room per map** (`map:<id>`) so traffic is scoped to people who can actually see each other.

Events (all gated on an authed session; rate-limited; coords sanity-checked):
- `presence:enter {map,x,y,facing,sprite}` — join the map room; reply `presence:roster
  {players:[...]}`; broadcast `presence:joined {player}` to the room. Leaving the old room first.
- `presence:move {x,y,facing}` — update + broadcast `presence:moved {id,x,y,facing}` to the room.
  Throttled client-side to ~1/tile-step; server drops absurd deltas / spam.
- `presence:emote {kind}` / `presence:chat {phraseId}` — relay `presence:emoted` / `presence:said`
  to the room.
- `disconnect` — broadcast `presence:left {id}`; drop the record.

Constants (shared): `EMOTES` (a fixed list) and `QUICK_CHAT` (canned phrases) — both small,
fixed sets. No free text in v1 → **no moderation surface**.

## 2. Client — remote players (`RemotePlayers` in `OverworldScene`)

A manager that owns other-player sprites:
- `roster` → spawn all; `joined` → add; `moved` → tween to the new tile (smooth interp);
  `left` → remove. Each has a name label above it; emote/chat shows a bubble for a few seconds.
- Reuses the existing character sheets (by `sprite` key). **No collision** with the local
  player (walk through each other — avoids blocking/griefing).
- Renders only the nearest ~20 to stay smooth if a map is crowded.

Net bridge: `net.ts` gains `sendPresenceEnter/Move/Emote/Chat` emitters and a
`setPresenceHandler(fn)` the scene registers on create / clears on shutdown (the socket lives
in net.ts; the scene subscribes). OverworldScene emits `enter` on map load/switch and `move`
on each committed tile-step (throttled).

## 3. Social UI — emote + quick-chat

A small React control (overlay, like TouchControls): an emote button → wheel, and a quick-chat
button → canned phrase list. Both call the net emitters. Bubbles render in-scene over the
relevant player.

## 4. Retention — busier grass (`shared/src/engine/wildspawn.ts`)

Raise the early wild pool so something is almost always catchable: bump `wildCap` (≈3→5 for
L≤12, 2→3 mid) and keep the interval short (already capped at 5 min). Tune the encounter flow
so walking grass with a full pool reliably triggers. Update `wildspawn.test.ts` for the new caps.

## Scope / YAGNI

Ephemeral presence (no DB), no player collision, capped render count, canned chat only (no free
text/moderation), economy + mainnet untouched. Pure additive layer; the game runs identically
if a client never sends presence.

## Verification

Typecheck all workspaces; shared tests (wildspawn caps); a two-client check that one client sees
the other move/emote in the same map. Phaser canvas can't be auto-screenshotted (wallet gate +
hidden-tab RAF) → final presence verification is a live two-browser playtest.
