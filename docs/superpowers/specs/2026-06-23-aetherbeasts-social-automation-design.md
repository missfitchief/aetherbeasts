# Aetherbeasts Social-Posting Automation — Design

- **Date:** 2026-06-23
- **Status:** Approved (brainstorming) — pending spec review → implementation plan
- **Reference model:** [@PlayKintara](https://x.com/PlayKintara) — the account style to emulate
- **Account being automated:** the Aetherbeasts X (Twitter) marketing account

## 1. Goal

Run the Aetherbeasts X account like @PlayKintara — frequent, hook-driven, media-first
feature-drop / FOMO posts with the `$AETHER` token woven in as the game's mechanic — but
**automated** on the **X API free tier**, with a human (you) approving every post before it
goes out.

PlayKintara's playbook has two halves; the free tier only permits one:

| PlayKintara behavior | Free-tier automatable? | This project |
|---|---|---|
| Broadcast: feature drops, hype, FOMO stats, scheduled posts | yes | **build now** |
| Media (image/clip per post) | conditional (see §8) | **build now, with fallback** |
| Two-way: replies, quote-RTs, mention/`$AETHER` monitoring | no — needs read access (Basic ~$200/mo) | **deferred plug-ins (§10)** |

## 2. Scope

**In scope**
- AI-drafted posts in the PlayKintara style, drawn from real Aetherbeasts progress.
- Human review/edit/approve/schedule, done **in a Claude Code session** (no separate app).
- An approved-post **queue in Neon Postgres** (reuses the existing Aetherbeasts DB).
- An **unattended scheduled poster** (GitHub Actions) that posts due+approved items to X.
- Curated **media pool** with a clean text-only fallback.

**Out of scope (now)**
- Replying, quote-tweeting, DMs, mention/keyword monitoring (read access — deferred, §10).
- A web dashboard (review happens in Claude Code).
- Posting to any account other than Aetherbeasts.
- Any change to the game client, the Socket.IO server, or the on-chain/token code.

## 3. Constraints

- **X API: free tier only.** Write-capable (`POST /2/tweets`), ~500 posts/month at the user
  level. No meaningful read access. Posting requires **OAuth 1.0a user context**.
- **No new paid infra.** Scheduler runs on GitHub Actions (free for this public repo); state
  lives in the existing free Neon DB. No Render upgrade required.
- **Human-in-the-loop is mandatory.** Nothing posts that you did not approve. There is no
  fully-autonomous posting path.
- **Existing project hard lines carry over:** `$AETHER` is a utility/in-game currency, never
  marketed as an investment or with ROI/price-pump promises; no NFTs; no
  buy-now/financial-advice language. The drafter must respect these in generated copy.

## 4. Architecture

A new **`social/` workspace** inside the `aetherbeasts` npm-workspaces monorepo (mirrors how
`server/` was added). Self-contained; imports read-only game data from `@aether/shared` where
useful, but never mutates game/server code.

```
aetherbeasts/
  social/
    package.json            (@aether/social)
    src/
      config.ts             env + constants (cadence, taxonomy weights, paths)
      db.ts                 Neon pool + social_posts schema bootstrap (idempotent)
      queue.ts              enqueue / list-due / mark-posted / mark-failed
      context.ts            gathers drafting context (recent commits, feature list, media index)
      media.ts              index social/media/, validate files, resolve a pick
      draft.ts              builds a draft "context bundle" for the Claude Code session
      post.ts               the poster: pull due rows -> upload media -> POST tweet -> mark
      xclient.ts            thin X API client (OAuth 1.0a sign, media upload, create tweet)
    test/
      queue.test.ts, draft.test.ts, xclient.test.ts (mocked), post.test.ts (mocked)
    media/                  committed curated screenshots/clips (you stock this)
  .github/workflows/
    social-post.yml         scheduled poster (every ~30 min) + manual dispatch
```

**Component responsibilities (one job each):**

- **config** — single source of truth for env vars and tunables. No logic.
- **db** — owns the Neon connection and creates `social_posts` if absent. Nothing else queries
  Postgres directly.
- **queue** — the only module that reads/writes `social_posts`. Pure CRUD with status
  transitions. Testable against a throwaway DB or a mock.
- **context** — read-only gatherer: last N git commits, a curated feature list, and the media
  index. Produces a plain JSON bundle. No network, no AI.
- **draft** — turns a context bundle into a prompt-ready brief for the Claude Code session.
  (The actual creative drafting is done by Claude in-session, not by code.)
- **media** — indexes `social/media/`, validates type/size against X limits, resolves a chosen
  filename to bytes at post time.
- **xclient** — the only module that talks to the X API. Signs OAuth 1.0a, uploads media
  (v1.1), creates tweets (v2). Everything else is X-API-agnostic.
- **post** — orchestrates a posting run: `queue.listDue()` → for each, `media.resolve()` +
  `xclient.upload` (if any) → `xclient.createTweet` → `queue.markPosted/markFailed`.

## 5. Data model — `social_posts` (Neon)

| column | type | notes |
|---|---|---|
| `id` | uuid / serial PK | |
| `kind` | text | taxonomy type (§6), for analytics |
| `text` | text | tweet body (≤ 280) |
| `media_file` | text null | filename in `social/media/`, or null (text/link-card post) |
| `scheduled_at` | timestamptz | when it may be posted |
| `status` | text | `approved` → `posted` \| `failed` |
| `tweet_id` | text null | set on success |
| `error` | text null | last failure reason |
| `attempts` | int default 0 | retry guard |
| `created_at` | timestamptz default now() | |

A row is created **only** by an approval in a Claude Code session. The poster only ever reads
rows where `status='approved' AND scheduled_at <= now()`.

## 6. Content engine

**Taxonomy** (drafts rotate across these so the feed mirrors PlayKintara's):

1. **Feature drop** — "New in Aetherbeasts: <feature> 👇" — sourced from recent commits / a
   curated shipped-features list.
2. **Creature spotlight** — one of the 16 beasts + its evolution line.
3. **FOMO / social proof** — season-points leaderboard, battle counts, limited-time gacha
   banner ("Aether Rift" rate-up).
4. **Mechanic explainer** — "Hold `$AETHER`, pull at the Aether Rift 👇" / how PvP / quests work.
5. **Play-now CTA** — "Play free in your browser 👉 https://missfitchief.github.io/aetherbeasts/".

**Cadence:** default **1–2 posts/day** (~45/month ≈ 9% of the free 500/month cap). Configurable
in `config.ts`. Big headroom for launch-day bursts.

**Voice rules (enforced in the drafting brief):** hook-first, emoji-light-but-present, one clear
CTA, ≤ 280 chars, no investment/price/ROI language about `$AETHER`, no "NFT".

## 7. Pipeline (data flow)

1. **Draft** — in a Claude Code session you invoke the project command (`/tweet-batch`, a project
   skill/command added by this work). It runs `context` + `draft` to assemble a brief; Claude
   produces 3–5 candidates, each = `{kind, text, suggested media_file}`.
2. **Approve** — inline in the session: approve / edit text / swap image / set `scheduled_at`.
   Each approved candidate is written to `social_posts` via `queue.enqueue()`.
3. **Post** — the GitHub Actions workflow (every ~30 min) runs `social:post`, which posts every
   due+approved row and marks it `posted` (with `tweet_id`) or `failed` (with `error`).

CLI scripts (root `package.json`): `social:plan` (dump context bundle), `social:enqueue`
(write an approved post — used by the in-session approval), `social:post` (run the poster
once — used by CI and for local manual runs).

## 8. Media handling + fallback

- Curated screenshots/clips live in committed **`social/media/`**. You stock it; `media.ts`
  indexes and validates against X limits (images ≤ 5 MB; basic type check).
- ⚠️ **Risk:** free-tier **media-upload** access has historically been inconsistent. **Build
  step 1 verifies** a real media upload + post end-to-end on the actual credentials.
- **Fallback (if media upload is blocked on free):** post **text + the game URL**; X renders a
  link-preview card, so posts still carry a visual. `post.ts` degrades to text-only on a media
  failure rather than dropping the post, and records the degrade in `error`.

## 9. Error handling

- **Poster is idempotent & safe:** a row moves out of `approved` only on a definitive outcome.
  Network/5xx/timeout → `attempts++`, leave `approved` for the next run; after `MAX_ATTEMPTS`
  (default 3) → `failed` with the reason (no infinite retrying).
- **Never double-post:** success path sets `status='posted'` + `tweet_id` in the same statement
  that guards on `status='approved'` (conditional update), so two overlapping runs can't both
  post the same row.
- **Auth/credential errors** fail loudly in the CI log and mark the row `failed` (not retried as
  if transient).
- **Rate-limit (429):** back off, leave `approved`, surface in the run summary.
- **Secrets** only ever live in GitHub repo secrets + a local `.env` (gitignored). Never logged,
  never committed.

## 10. Deferred plug-ins (when/if you go Basic ~$200/mo)

Designed as additive modules, off by default, no rework of the above:
- **Reply/engage** — read mentions, draft replies, same review-gate before sending.
- **Monitor/listen** — track `$AETHER` / "Aetherbeasts" mentions + competitors, summarize to you.
Both gated behind a `READ_TIER_ENABLED` config flag and separate workflows.

## 11. User-required actions (cannot be automated)

1. Create an X developer app at `developer.x.com`; enable **OAuth 1.0a, read+write**.
2. Generate the 4 credentials: consumer (API) key + secret, access token + secret.
3. Add them as **GitHub repo secrets** (for the workflow) and to a local **`.env`** (for
   drafting/manual runs).
4. Stock `social/media/` with a handful of gameplay screenshots.

## 12. Testing strategy

- **queue** — CRUD + status transitions + the conditional "claim" update (mocked/throwaway DB).
- **xclient** — OAuth 1.0a signature correctness + request shaping, with the network mocked.
- **post** — orchestration: due-selection, media-fallback path, retry/`failed` thresholds,
  no-double-post guard — all with `xclient` and `queue` mocked.
- **draft/context** — brief assembly is deterministic given a fixed context bundle.
- A **manual `social:post --dry-run`** prints what *would* post without calling X.
- **Live smoke test (build step 1):** one real media post to the account to settle §8's risk.
- CI: extend the existing workflow to typecheck + run `social` unit tests.

## 13. Build order (for the implementation plan)

1. Scaffold `social/` workspace + `config` + `db`/`social_posts` bootstrap.
2. `xclient` + **live smoke test**: post one real text tweet, then one with media → settle the
   media-upload question (§8); wire the fallback.
3. `queue` (+ tests).
4. `context` + `draft` + the `/tweet-batch` Claude Code command; dry-run the drafting loop.
5. `media` indexing/validation.
6. `post` orchestration (+ tests, dry-run).
7. `social-post.yml` GitHub Actions workflow + repo secrets wiring.
8. End-to-end: approve a real post in-session → workflow posts it on schedule → verify on X.
