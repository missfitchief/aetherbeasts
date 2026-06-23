# Aetherbeasts Social-Posting Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `social/` workspace that drafts PlayKintara-style Aetherbeasts tweets (reviewed/approved by a human in Claude Code), queues them in Neon, and posts them on schedule via GitHub Actions on the X API free tier.

**Architecture:** New self-contained npm workspace `social/` in the existing monorepo. Pure dependency-injected modules (`config`, `db`, `queue`, `media`, `xclient`, `context`, `draft`, `validate`, `post`) so every unit tests with hand-rolled fakes — no network, no real DB. CLIs wire them for the drafting brief, the approval write, the live smoke test, and the scheduled poster. A GitHub Actions cron runs the poster.

**Tech Stack:** TypeScript (ESM), `tsx`, `pg` (Neon Postgres), `twitter-api-v2` (OAuth 1.0a user context), `dotenv`. Tests are standalone `node --import tsx test/*.test.ts` files using `node:assert/strict` (matches the `server/` workspace).

## Global Constraints

- **X API free tier only:** write path (`POST /2/tweets`), ~500 posts/month, OAuth 1.0a user context. No read endpoints.
- **No new paid infra:** scheduler = GitHub Actions (free for this public repo); state = existing free Neon DB. No Render upgrade.
- **Human-in-the-loop mandatory:** a `social_posts` row is created ONLY by an explicit in-session approval. There is no autonomous posting path.
- **Copy rules (enforced in drafting brief + voice rules):** `$AETHER` is utility/in-game currency only — NEVER framed as investment, price, ROI, or "buy to profit". NEVER use the word "NFT". Reference only real, shipped features.
- **Repo conventions:** ESM (`"type": "module"`); relative imports use the `.js` extension; `pg` Pool uses `ssl: local ? false : { rejectUnauthorized: false }`; Node 20 in CI; ids generated app-side via `randomUUID()` (matches `server/`).
- **Secrets** live only in GitHub repo secrets + a gitignored local `social/.env`. Never logged, never committed.

---

### Task 1: Workspace scaffold + config

**Files:**
- Create: `social/package.json`
- Create: `social/tsconfig.json`
- Create: `social/src/config.ts`
- Create: `social/test/config.test.ts`
- Modify: `package.json` (root — add workspace + scripts)
- Modify: `.gitignore` (ignore `social/.env`)

**Interfaces:**
- Produces: `requireXCreds(): XCreds` (`{ appKey, appSecret, accessToken, accessSecret }`), `requireDatabaseUrl(): string`, and consts `GAME_URL: string`, `MEDIA_DIR: string`, `MAX_ATTEMPTS: number`, `MAX_IMAGE_BYTES: number`.

- [ ] **Step 1: Create `social/package.json`**

```json
{
  "name": "@aether/social",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "plan": "tsx src/cli/plan.ts",
    "enqueue": "tsx src/cli/enqueue.ts",
    "post": "tsx src/cli/post.ts",
    "smoke": "tsx src/cli/smoke.ts",
    "test": "node --import tsx test/run.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "pg": "^8.13.1",
    "tsx": "^4.19.2",
    "twitter-api-v2": "^1.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/pg": "^8.11.10",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Create `social/tsconfig.json`** (mirrors `server/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `social/src/config.ts`**

```ts
import 'dotenv/config';

export const GAME_URL = process.env.GAME_URL ?? 'https://missfitchief.github.io/aetherbeasts/';
export const MEDIA_DIR = process.env.SOCIAL_MEDIA_DIR ?? 'media';
export const MAX_ATTEMPTS = Number(process.env.SOCIAL_MAX_ATTEMPTS ?? 3);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // X still image limit

export interface XCreds {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

// Read live from process.env (not module consts) so callers can set env before calling — and so tests can too.
export function requireXCreds(): XCreds {
  const creds: XCreds = {
    appKey: process.env.X_APP_KEY ?? '',
    appSecret: process.env.X_APP_SECRET ?? '',
    accessToken: process.env.X_ACCESS_TOKEN ?? '',
    accessSecret: process.env.X_ACCESS_SECRET ?? '',
  };
  for (const [k, v] of Object.entries(creds)) {
    if (!v) throw new Error(`Missing X credential: ${k}`);
  }
  return creds;
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}
```

- [ ] **Step 4: Write the failing test** `social/test/config.test.ts`

```ts
import assert from 'node:assert/strict';
import { requireXCreds, requireDatabaseUrl, MAX_ATTEMPTS, GAME_URL } from '../src/config.js';

// defaults
assert.equal(MAX_ATTEMPTS, 3);
assert.match(GAME_URL, /aetherbeasts/);

// requireXCreds throws when missing
for (const k of ['X_APP_KEY', 'X_APP_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']) delete process.env[k];
assert.throws(() => requireXCreds(), /Missing X credential/);

// requireXCreds returns object when present
process.env.X_APP_KEY = 'a';
process.env.X_APP_SECRET = 'b';
process.env.X_ACCESS_TOKEN = 'c';
process.env.X_ACCESS_SECRET = 'd';
assert.deepEqual(requireXCreds(), { appKey: 'a', appSecret: 'b', accessToken: 'c', accessSecret: 'd' });

// requireDatabaseUrl
delete process.env.DATABASE_URL;
assert.throws(() => requireDatabaseUrl(), /DATABASE_URL/);
process.env.DATABASE_URL = 'postgres://x';
assert.equal(requireDatabaseUrl(), 'postgres://x');

console.log('config.test ok');
```

- [ ] **Step 5: Create the test runner** `social/test/run.ts` (imports every test file; CI entry)

```ts
// Importing a test file runs its assertions. Add new files here as they land.
import './config.test.js';
```

- [ ] **Step 6: Modify root `package.json`** — add `"social"` to `workspaces` (after `"client"`) and add these scripts inside `"scripts"`:

```json
    "social:plan": "npm -w @aether/social run plan",
    "social:post": "npm -w @aether/social run post",
    "test:social": "npm -w @aether/social run test",
```

Also append to the existing `"typecheck"` script so it ends with:
` && npm -w @aether/social run typecheck`

- [ ] **Step 7: Modify `.gitignore`** — add a line:

```
social/.env
```

- [ ] **Step 8: Install + verify** — from repo root:

Run: `npm install`
Then: `npm -w @aether/social run test`
Expected: prints `config.test ok`, exit 0.
Then: `npm -w @aether/social run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add social/package.json social/tsconfig.json social/src/config.ts social/test/config.test.ts social/test/run.ts package.json package-lock.json .gitignore
git commit -m "feat(social): scaffold social workspace + config"
```

---

### Task 2: DB module + `social_posts` schema

**Files:**
- Create: `social/src/db.ts`
- Create: `social/test/db.test.ts`
- Modify: `social/test/run.ts` (add `import './db.test.js';`)

**Interfaces:**
- Produces: `Queryable` (`{ query(text, params?): Promise<{ rows: any[]; rowCount: number | null }> }`), `createPool(connectionString?): Pool`, `ensureSchema(db: Queryable): Promise<void>`.
- Consumes: `requireDatabaseUrl` from config (Task 1).

- [ ] **Step 1: Write the failing test** `social/test/db.test.ts`

```ts
import assert from 'node:assert/strict';
import { ensureSchema, type Queryable } from '../src/db.js';

const sql: string[] = [];
const fake: Queryable = {
  async query(text: string) { sql.push(text); return { rows: [], rowCount: 0 }; },
};

await ensureSchema(fake);
assert.equal(sql.length, 2, 'creates table + index');
assert.match(sql[0], /CREATE TABLE IF NOT EXISTS social_posts/);
assert.match(sql[0], /id text PRIMARY KEY/);
assert.match(sql[0], /status text NOT NULL DEFAULT 'approved'/);
assert.match(sql[1], /CREATE INDEX IF NOT EXISTS social_posts_due/);

console.log('db.test ok');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx social/test/db.test.ts`
Expected: FAIL — `Cannot find module '../src/db.js'`.

- [ ] **Step 3: Create `social/src/db.ts`**

```ts
import { Pool } from 'pg';
import { requireDatabaseUrl } from './config.js';

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export function createPool(connectionString: string = requireDatabaseUrl()): Pool {
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({ connectionString, ssl: local ? false : { rejectUnauthorized: false } });
}

export async function ensureSchema(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS social_posts (
      id text PRIMARY KEY,
      kind text NOT NULL,
      text text NOT NULL,
      media_file text,
      scheduled_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'approved',
      tweet_id text,
      error text,
      attempts int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS social_posts_due ON social_posts (status, scheduled_at);`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx social/test/db.test.ts`
Expected: prints `db.test ok`.

- [ ] **Step 5: Wire into runner** — add `import './db.test.js';` to `social/test/run.ts`.

- [ ] **Step 6: Commit**

```bash
git add social/src/db.ts social/test/db.test.ts social/test/run.ts
git commit -m "feat(social): db pool + social_posts schema bootstrap"
```

---

### Task 3: Queue (CRUD + status transitions)

**Files:**
- Create: `social/src/queue.ts`
- Create: `social/test/queue.test.ts`
- Modify: `social/test/run.ts` (add `import './queue.test.js';`)

**Interfaces:**
- Produces: types `PostKind = 'feature'|'creature'|'fomo'|'mechanic'|'cta'`, `PostStatus = 'approved'|'posted'|'failed'`, `ApprovedPost = { kind: PostKind; text: string; mediaFile: string | null; scheduledAt: Date }`, `DuePost = { id: string; kind: PostKind; text: string; mediaFile: string | null; attempts: number }`; functions `enqueue(db, post): Promise<string>`, `listDue(db, now): Promise<DuePost[]>`, `markPosted(db, id, tweetId): Promise<boolean>`, `markFailed(db, id, attempts, error): Promise<void>`.
- Consumes: `Queryable` (Task 2), `MAX_ATTEMPTS` (Task 1).

- [ ] **Step 1: Write the failing test** `social/test/queue.test.ts`

```ts
import assert from 'node:assert/strict';
import { enqueue, listDue, markPosted, markFailed, type ApprovedPost } from '../src/queue.js';
import type { Queryable } from '../src/db.js';

function fakeDb(opts: { rows?: any[]; rowCount?: number } = {}) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const db: Queryable = {
    async query(text, params) {
      calls.push({ text, params });
      return { rows: opts.rows ?? [], rowCount: opts.rowCount ?? (opts.rows?.length ?? 0) };
    },
  };
  return { db, calls };
}

// enqueue inserts approved + returns an id
{
  const { db, calls } = fakeDb();
  const post: ApprovedPost = { kind: 'feature', text: 'hi', mediaFile: null, scheduledAt: new Date('2026-06-24T10:00:00Z') };
  const id = await enqueue(db, post);
  assert.equal(typeof id, 'string');
  assert.match(calls[0].text, /INSERT INTO social_posts/);
  assert.match(calls[0].text, /'approved'/);
  assert.deepEqual(calls[0].params, [id, 'feature', 'hi', null, '2026-06-24T10:00:00.000Z']);
}

// listDue selects approved + due, maps rows
{
  const { db, calls } = fakeDb({ rows: [{ id: '1', kind: 'cta', text: 't', media_file: 'a.png', attempts: 0 }] });
  const now = new Date('2026-06-24T10:00:00Z');
  const due = await listDue(db, now);
  assert.match(calls[0].text, /status = 'approved' AND scheduled_at <= \$1/);
  assert.deepEqual(due, [{ id: '1', kind: 'cta', text: 't', mediaFile: 'a.png', attempts: 0 }]);
}

// markPosted: conditional update guarded on approved; true when a row changed
{
  const { db, calls } = fakeDb({ rowCount: 1 });
  const ok = await markPosted(db, 'abc', '999');
  assert.equal(ok, true);
  assert.match(calls[0].text, /SET status = 'posted'/);
  assert.match(calls[0].text, /WHERE id = \$1 AND status = 'approved'/);
  assert.deepEqual(calls[0].params, ['abc', '999']);
}
{
  const { db } = fakeDb({ rowCount: 0 });
  assert.equal(await markPosted(db, 'abc', '999'), false, 'already claimed by another run');
}

// markFailed: stays approved below MAX_ATTEMPTS, flips to failed at/above it
{
  const { db, calls } = fakeDb();
  await markFailed(db, 'abc', 0, 'boom'); // attempts -> 1, < 3
  assert.deepEqual(calls[0].params, ['abc', 1, 'boom', 'approved']);
}
{
  const { db, calls } = fakeDb();
  await markFailed(db, 'abc', 2, 'boom'); // attempts -> 3, >= 3
  assert.deepEqual(calls[0].params, ['abc', 3, 'boom', 'failed']);
}

console.log('queue.test ok');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx social/test/queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `social/src/queue.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { Queryable } from './db.js';
import { MAX_ATTEMPTS } from './config.js';

export type PostKind = 'feature' | 'creature' | 'fomo' | 'mechanic' | 'cta';
export type PostStatus = 'approved' | 'posted' | 'failed';

export interface ApprovedPost {
  kind: PostKind;
  text: string;
  mediaFile: string | null;
  scheduledAt: Date;
}

export interface DuePost {
  id: string;
  kind: PostKind;
  text: string;
  mediaFile: string | null;
  attempts: number;
}

export async function enqueue(db: Queryable, post: ApprovedPost): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO social_posts (id, kind, text, media_file, scheduled_at, status)
     VALUES ($1, $2, $3, $4, $5, 'approved')`,
    [id, post.kind, post.text, post.mediaFile, post.scheduledAt.toISOString()],
  );
  return id;
}

export async function listDue(db: Queryable, now: Date): Promise<DuePost[]> {
  const { rows } = await db.query(
    `SELECT id, kind, text, media_file, attempts FROM social_posts
     WHERE status = 'approved' AND scheduled_at <= $1
     ORDER BY scheduled_at ASC`,
    [now.toISOString()],
  );
  return rows.map((r) => ({
    id: r.id, kind: r.kind, text: r.text, mediaFile: r.media_file, attempts: r.attempts,
  }));
}

// Conditional on status='approved' so two overlapping runs can't both mark the same row posted.
export async function markPosted(db: Queryable, id: string, tweetId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE social_posts SET status = 'posted', tweet_id = $2, error = NULL
     WHERE id = $1 AND status = 'approved'`,
    [id, tweetId],
  );
  return (rowCount ?? 0) > 0;
}

export async function markFailed(db: Queryable, id: string, attempts: number, error: string): Promise<void> {
  const next = attempts + 1;
  const status: PostStatus = next >= MAX_ATTEMPTS ? 'failed' : 'approved';
  await db.query(
    `UPDATE social_posts SET attempts = $2, error = $3, status = $4 WHERE id = $1`,
    [id, next, error, status],
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx social/test/queue.test.ts`
Expected: prints `queue.test ok`.

- [ ] **Step 5: Wire into runner** — add `import './queue.test.js';` to `social/test/run.ts`.

- [ ] **Step 6: Commit**

```bash
git add social/src/queue.ts social/test/queue.test.ts social/test/run.ts
git commit -m "feat(social): approved-post queue (enqueue/listDue/markPosted/markFailed)"
```

---

### Task 4: Media indexing + validation

**Files:**
- Create: `social/src/media.ts`
- Create: `social/test/media.test.ts`
- Modify: `social/test/run.ts` (add `import './media.test.js';`)

**Interfaces:**
- Produces: `MediaItem = { file: string; bytes: number }`, `indexMedia(dir, maxBytes?): Promise<MediaItem[]>`, `resolveMedia(dir, file, maxBytes?): Promise<string>` (returns absolute path; throws if missing/oversize).
- Consumes: `MAX_IMAGE_BYTES` (Task 1).

- [ ] **Step 1: Write the failing test** `social/test/media.test.ts`

```ts
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexMedia, resolveMedia } from '../src/media.js';

const dir = await mkdtemp(join(tmpdir(), 'social-media-'));
await writeFile(join(dir, 'b.png'), 'PNG');
await writeFile(join(dir, 'a.jpg'), 'JPG-bytes');
await writeFile(join(dir, 'notes.txt'), 'ignore me');
await mkdir(join(dir, 'sub'));

// indexes only allowed image types, sorted by name
const items = await indexMedia(dir);
assert.deepEqual(items.map((i) => i.file), ['a.jpg', 'b.png']);

// oversize excluded (pass a tiny max)
assert.equal((await indexMedia(dir, 1)).length, 0);

// missing dir -> empty
assert.deepEqual(await indexMedia(join(dir, 'nope')), []);

// resolveMedia returns abs path for existing
const abs = await resolveMedia(dir, 'a.jpg');
assert.ok(abs.endsWith('a.jpg'));

// resolveMedia throws for missing + oversize
await assert.rejects(resolveMedia(dir, 'ghost.png'), /not found/);
await assert.rejects(resolveMedia(dir, 'a.jpg', 1), /too large/);

console.log('media.test ok');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx social/test/media.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `social/src/media.ts`**

```ts
import { promises as fs } from 'node:fs';
import { join, extname } from 'node:path';
import { MAX_IMAGE_BYTES } from './config.js';

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

export interface MediaItem {
  file: string;
  bytes: number;
}

export async function indexMedia(dir: string, maxBytes: number = MAX_IMAGE_BYTES): Promise<MediaItem[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const items: MediaItem[] = [];
  for (const name of names) {
    if (!ALLOWED.has(extname(name).toLowerCase())) continue;
    const stat = await fs.stat(join(dir, name));
    if (!stat.isFile() || stat.size > maxBytes) continue;
    items.push({ file: name, bytes: stat.size });
  }
  return items.sort((a, b) => a.file.localeCompare(b.file));
}

export async function resolveMedia(dir: string, file: string, maxBytes: number = MAX_IMAGE_BYTES): Promise<string> {
  const abs = join(dir, file);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat || !stat.isFile()) throw new Error(`Media file not found: ${file}`);
  if (stat.size > maxBytes) throw new Error(`Media file too large: ${file}`);
  return abs;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx social/test/media.test.ts`
Expected: prints `media.test ok`.

- [ ] **Step 5: Wire into runner** — add `import './media.test.js';` to `social/test/run.ts`.

- [ ] **Step 6: Commit**

```bash
git add social/src/media.ts social/test/media.test.ts social/test/run.ts
git commit -m "feat(social): media pool indexing + validation"
```

---

### Task 5: X API client (wraps `twitter-api-v2`)

**Files:**
- Create: `social/src/xclient.ts`
- Create: `social/test/xclient.test.ts`
- Modify: `social/test/run.ts` (add `import './xclient.test.js';`)

**Interfaces:**
- Produces: `XClient = { uploadMedia(absPath): Promise<string>; createTweet(text, mediaId?): Promise<string> }`, `makeXClient(api): XClient` (api = a `twitter-api-v2` instance — injectable for tests), `createXClient(creds: XCreds): XClient`.
- Consumes: `XCreds` (Task 1).

- [ ] **Step 1: Write the failing test** `social/test/xclient.test.ts`

```ts
import assert from 'node:assert/strict';
import { makeXClient } from '../src/xclient.js';

// Fake twitter-api-v2 instance recording calls.
function fakeApi() {
  const calls: any = { upload: [], tweet: [] };
  const api = {
    v1: { uploadMedia: async (p: string) => { calls.upload.push(p); return 'media-123'; } },
    v2: { tweet: async (payload: any) => { calls.tweet.push(payload); return { data: { id: 'tweet-999' } }; } },
  };
  return { api, calls };
}

// uploadMedia delegates to v1 and returns the id
{
  const { api, calls } = fakeApi();
  const client = makeXClient(api as any);
  const id = await client.uploadMedia('/tmp/a.png');
  assert.equal(id, 'media-123');
  assert.deepEqual(calls.upload, ['/tmp/a.png']);
}

// createTweet WITH media includes media_ids
{
  const { api, calls } = fakeApi();
  const client = makeXClient(api as any);
  const id = await client.createTweet('hello', 'media-123');
  assert.equal(id, 'tweet-999');
  assert.deepEqual(calls.tweet[0], { text: 'hello', media: { media_ids: ['media-123'] } });
}

// createTweet WITHOUT media omits the media key
{
  const { api, calls } = fakeApi();
  const client = makeXClient(api as any);
  await client.createTweet('text only');
  assert.deepEqual(calls.tweet[0], { text: 'text only' });
}

console.log('xclient.test ok');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx social/test/xclient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `social/src/xclient.ts`**

```ts
import { TwitterApi } from 'twitter-api-v2';
import type { XCreds } from './config.js';

export interface XClient {
  uploadMedia(absPath: string): Promise<string>;
  createTweet(text: string, mediaId?: string): Promise<string>;
}

// Accepts the underlying twitter-api-v2 instance so it can be faked in tests.
export function makeXClient(api: TwitterApi): XClient {
  return {
    async uploadMedia(absPath) {
      return api.v1.uploadMedia(absPath);
    },
    async createTweet(text, mediaId) {
      const payload = mediaId
        ? { text, media: { media_ids: [mediaId] as [string] } }
        : { text };
      const res = await api.v2.tweet(payload);
      return res.data.id;
    },
  };
}

export function createXClient(creds: XCreds): XClient {
  const api = new TwitterApi({
    appKey: creds.appKey,
    appSecret: creds.appSecret,
    accessToken: creds.accessToken,
    accessSecret: creds.accessSecret,
  });
  return makeXClient(api);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx social/test/xclient.test.ts`
Expected: prints `xclient.test ok`.

- [ ] **Step 5: Wire into runner** — add `import './xclient.test.js';` to `social/test/run.ts`.

- [ ] **Step 6: Commit**

```bash
git add social/src/xclient.ts social/test/xclient.test.ts social/test/run.ts
git commit -m "feat(social): X API client wrapping twitter-api-v2"
```

---

### Task 6: Smoke CLI + live media-upload verification

> **Gate:** requires the user's real X API keys in `social/.env` (see SOCIAL.md / Task 11). This is the spec's "settle the media-upload risk early" step. If keys aren't ready yet, the CLI still builds/typechecks — run the live part once keys exist.

**Files:**
- Create: `social/src/cli/smoke.ts`

**Interfaces:**
- Consumes: `createXClient` (Task 5), `requireXCreds`/`MEDIA_DIR` (Task 1), `indexMedia`/`resolveMedia` (Task 4).

- [ ] **Step 1: Create `social/src/cli/smoke.ts`**

```ts
import { resolve } from 'node:path';
import { createXClient } from '../xclient.js';
import { requireXCreds, MEDIA_DIR } from '../config.js';
import { indexMedia, resolveMedia } from '../media.js';

const client = createXClient(requireXCreds());

const stamp = new Date().toISOString();
const textId = await client.createTweet(`Aetherbeasts API smoke test ${stamp} — please ignore.`);
console.log('TEXT tweet posted:', textId, '(write path works)');

const media = await indexMedia(resolve(MEDIA_DIR));
if (media.length === 0) {
  console.log(`No media in ${MEDIA_DIR}/ — add an image to verify media upload.`);
} else {
  try {
    const abs = await resolveMedia(resolve(MEDIA_DIR), media[0].file);
    const mediaId = await client.uploadMedia(abs);
    const id = await client.createTweet('Aetherbeasts media smoke test — please ignore.', mediaId);
    console.log('MEDIA tweet posted:', id, '✅ media upload WORKS on the free tier');
  } catch (e) {
    console.log('❌ media upload FAILED on the free tier:', e instanceof Error ? e.message : e);
    console.log('   -> the poster will fall back to text + game-link cards.');
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm -w @aether/social run typecheck`
Expected: no errors.

- [ ] **Step 3: (Live, once keys exist) Run the smoke test**

Run: `npm -w @aether/social run smoke`
Expected: prints a TEXT tweet id; then either `✅ media upload WORKS` or `❌ media upload FAILED` (which is fine — the fallback in Task 8 covers it). Delete the two test tweets from the account afterward.
**Record the media-upload result** — it confirms whether `mediaFile` posts will carry real images or fall back to link cards.

- [ ] **Step 4: Commit**

```bash
git add social/src/cli/smoke.ts
git commit -m "feat(social): live smoke test CLI for write + media-upload"
```

---

### Task 7: Approval validation + enqueue CLI

**Files:**
- Create: `social/src/validate.ts`
- Create: `social/src/cli/enqueue.ts`
- Create: `social/test/validate.test.ts`
- Modify: `social/test/run.ts` (add `import './validate.test.js';`)

**Interfaces:**
- Produces: `parseApproved(input: unknown): ApprovedPost` (throws on invalid).
- Consumes: `ApprovedPost`/`PostKind` (Task 3), `createPool`/`ensureSchema` (Task 2), `enqueue` (Task 3), `resolveMedia` (Task 4), `MEDIA_DIR` (Task 1).

- [ ] **Step 1: Write the failing test** `social/test/validate.test.ts`

```ts
import assert from 'node:assert/strict';
import { parseApproved } from '../src/validate.js';

// valid, null media
const p = parseApproved({ kind: 'feature', text: 'hi', mediaFile: null, scheduledAt: '2026-06-24T10:00:00Z' });
assert.equal(p.kind, 'feature');
assert.equal(p.mediaFile, null);
assert.ok(p.scheduledAt instanceof Date);

// valid, with media
assert.equal(parseApproved({ kind: 'cta', text: 'go', mediaFile: 'a.png', scheduledAt: '2026-06-24T10:00:00Z' }).mediaFile, 'a.png');

// bad kind
assert.throws(() => parseApproved({ kind: 'nope', text: 't', scheduledAt: '2026-06-24T10:00:00Z' }), /kind must be/);
// empty text
assert.throws(() => parseApproved({ kind: 'feature', text: '  ', scheduledAt: '2026-06-24T10:00:00Z' }), /text is required/);
// too long
assert.throws(() => parseApproved({ kind: 'feature', text: 'x'.repeat(281), scheduledAt: '2026-06-24T10:00:00Z' }), /max 280/);
// bad date
assert.throws(() => parseApproved({ kind: 'feature', text: 't', scheduledAt: 'not-a-date' }), /valid ISO date/);

console.log('validate.test ok');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx social/test/validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `social/src/validate.ts`**

```ts
import type { ApprovedPost, PostKind } from './queue.js';

const KINDS: PostKind[] = ['feature', 'creature', 'fomo', 'mechanic', 'cta'];

export function parseApproved(input: unknown): ApprovedPost {
  if (typeof input !== 'object' || input === null) throw new Error('post must be an object');
  const o = input as Record<string, unknown>;

  if (!KINDS.includes(o.kind as PostKind)) throw new Error(`kind must be one of: ${KINDS.join(', ')}`);
  if (typeof o.text !== 'string' || !o.text.trim()) throw new Error('text is required');
  if (o.text.length > 280) throw new Error(`text is ${o.text.length} chars (max 280)`);

  const mediaFile = o.mediaFile == null ? null : String(o.mediaFile);
  const scheduledAt = new Date(String(o.scheduledAt));
  if (Number.isNaN(scheduledAt.getTime())) throw new Error('scheduledAt must be a valid ISO date');

  return { kind: o.kind as PostKind, text: o.text, mediaFile, scheduledAt };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx social/test/validate.test.ts`
Expected: prints `validate.test ok`.

- [ ] **Step 5: Create `social/src/cli/enqueue.ts`**

```ts
import { resolve } from 'node:path';
import { createPool, ensureSchema } from '../db.js';
import { enqueue } from '../queue.js';
import { parseApproved } from '../validate.js';
import { resolveMedia } from '../media.js';
import { MEDIA_DIR } from '../config.js';

const raw = process.argv[2];
if (!raw) {
  console.error(`usage: enqueue '{"kind":"feature","text":"...","mediaFile":null,"scheduledAt":"2026-06-24T10:00:00Z"}'`);
  process.exit(1);
}

const post = parseApproved(JSON.parse(raw));

// Fail fast if the chosen media file does not exist in the pool.
if (post.mediaFile) await resolveMedia(resolve(MEDIA_DIR), post.mediaFile);

const pool = createPool();
await ensureSchema(pool);
const id = await enqueue(pool, post);
await pool.end();
console.log(`enqueued ${id} — ${post.kind} @ ${post.scheduledAt.toISOString()}`);
```

- [ ] **Step 6: Wire into runner + typecheck** — add `import './validate.test.js';` to `social/test/run.ts`, then:

Run: `npm -w @aether/social run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add social/src/validate.ts social/src/cli/enqueue.ts social/test/validate.test.ts social/test/run.ts
git commit -m "feat(social): approval validation + enqueue CLI"
```

---

### Task 8: Poster orchestration + post CLI

**Files:**
- Create: `social/src/post.ts`
- Create: `social/src/cli/post.ts`
- Create: `social/test/post.test.ts`
- Modify: `social/test/run.ts` (add `import './post.test.js';`)

**Interfaces:**
- Produces: `PosterDeps = { db: Queryable; client: XClient; mediaDir: string; gameUrl: string; now: Date; dryRun?: boolean }`, `PostResult = { id: string; ok: boolean; tweetId?: string; degraded?: boolean; error?: string }`, `runPoster(deps): Promise<PostResult[]>`.
- Consumes: `listDue`/`markPosted`/`markFailed` (Task 3), `resolveMedia` (Task 4), `XClient` (Task 5), `Queryable` (Task 2).

- [ ] **Step 1: Write the failing test** `social/test/post.test.ts`

```ts
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPoster } from '../src/post.js';
import type { Queryable } from '../src/db.js';
import type { XClient } from '../src/xclient.js';

const dir = await mkdtemp(join(tmpdir(), 'social-post-'));
await writeFile(join(dir, 'shot.png'), 'PNG');

// db fake: listDue returns the given rows; record mark* calls.
function fakeDb(due: any[]) {
  const marks: { kind: string; params: unknown[] }[] = [];
  const db: Queryable = {
    async query(text, params = []) {
      if (/SELECT/.test(text)) return { rows: due, rowCount: due.length };
      if (/SET status = 'posted'/.test(text)) { marks.push({ kind: 'posted', params }); return { rows: [], rowCount: 1 }; }
      marks.push({ kind: 'failed', params }); return { rows: [], rowCount: 1 };
    },
  };
  return { db, marks };
}

function fakeClient(opts: { failUpload?: boolean; failTweet?: boolean } = {}): XClient & { calls: any } {
  const calls: any = { upload: [], tweet: [] };
  return {
    calls,
    async uploadMedia(p) { calls.upload.push(p); if (opts.failUpload) throw new Error('media blocked'); return 'm1'; },
    async createTweet(text, mediaId) { calls.tweet.push({ text, mediaId }); if (opts.failTweet) throw new Error('429'); return 'tw1'; },
  } as any;
}

const now = new Date('2026-06-24T10:00:00Z');

// happy path WITH media
{
  const { db, marks } = fakeDb([{ id: '1', kind: 'feature', text: 'hi', media_file: 'shot.png', attempts: 0 }]);
  const client = fakeClient();
  const res = await runPoster({ db, client, mediaDir: dir, gameUrl: 'https://g', now });
  assert.equal(client.calls.upload.length, 1);
  assert.equal(client.calls.tweet[0].mediaId, 'm1');
  assert.equal(marks[0].kind, 'posted');
  assert.deepEqual(res[0], { id: '1', ok: true, tweetId: 'tw1', degraded: false });
}

// media upload FAILS -> degrade to text + appended link, still posts
{
  const { db, marks } = fakeDb([{ id: '2', kind: 'feature', text: 'hi', media_file: 'shot.png', attempts: 0 }]);
  const client = fakeClient({ failUpload: true });
  const res = await runPoster({ db, client, mediaDir: dir, gameUrl: 'https://g', now });
  assert.equal(client.calls.tweet[0].mediaId, undefined);
  assert.match(client.calls.tweet[0].text, /https:\/\/g/);
  assert.equal(res[0].degraded, true);
  assert.equal(marks[0].kind, 'posted');
}

// createTweet FAILS -> markFailed with attempts
{
  const { db, marks } = fakeDb([{ id: '3', kind: 'cta', text: 'go', media_file: null, attempts: 1 }]);
  const client = fakeClient({ failTweet: true });
  const res = await runPoster({ db, client, mediaDir: dir, gameUrl: 'https://g', now });
  assert.equal(res[0].ok, false);
  assert.equal(marks[0].kind, 'failed');
  assert.equal(marks[0].params[1], 2); // attempts -> 2
}

// dryRun -> no client calls
{
  const { db } = fakeDb([{ id: '4', kind: 'cta', text: 'go', media_file: null, attempts: 0 }]);
  const client = fakeClient();
  await runPoster({ db, client, mediaDir: dir, gameUrl: 'https://g', now, dryRun: true });
  assert.equal(client.calls.tweet.length, 0);
}

console.log('post.test ok');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx social/test/post.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `social/src/post.ts`**

```ts
import type { Queryable } from './db.js';
import type { XClient } from './xclient.js';
import { listDue, markPosted, markFailed } from './queue.js';
import { resolveMedia } from './media.js';

export interface PosterDeps {
  db: Queryable;
  client: XClient;
  mediaDir: string;
  gameUrl: string;
  now: Date;
  dryRun?: boolean;
}

export interface PostResult {
  id: string;
  ok: boolean;
  tweetId?: string;
  degraded?: boolean;
  error?: string;
}

export async function runPoster(deps: PosterDeps): Promise<PostResult[]> {
  const due = await listDue(deps.db, deps.now);
  const results: PostResult[] = [];

  for (const post of due) {
    if (deps.dryRun) {
      results.push({ id: post.id, ok: true });
      continue;
    }
    try {
      let mediaId: string | undefined;
      let degraded = false;
      if (post.mediaFile) {
        try {
          const abs = await resolveMedia(deps.mediaDir, post.mediaFile);
          mediaId = await deps.client.uploadMedia(abs);
        } catch {
          degraded = true; // media-upload fallback: post text + link card instead of dropping
        }
      }
      const text = mediaId ? post.text : ensureLink(post.text, deps.gameUrl, degraded);
      const tweetId = await deps.client.createTweet(text, mediaId);
      const ok = await markPosted(deps.db, post.id, tweetId);
      results.push({ id: post.id, ok, tweetId, degraded });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await markFailed(deps.db, post.id, post.attempts, error);
      results.push({ id: post.id, ok: false, error });
    }
  }
  return results;
}

// When media failed, append the game URL so X renders a link-preview card — only if it fits in 280.
function ensureLink(text: string, gameUrl: string, degraded: boolean): string {
  if (!degraded || text.includes(gameUrl)) return text;
  const withLink = `${text}\n${gameUrl}`;
  return withLink.length <= 280 ? withLink : text;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx social/test/post.test.ts`
Expected: prints `post.test ok`.

- [ ] **Step 5: Create `social/src/cli/post.ts`**

```ts
import { resolve } from 'node:path';
import { createPool, ensureSchema } from '../db.js';
import { createXClient, type XClient } from '../xclient.js';
import { runPoster } from '../post.js';
import { requireXCreds, GAME_URL, MEDIA_DIR } from '../config.js';

const dryRun = process.argv.includes('--dry-run');

const pool = createPool();
await ensureSchema(pool);

// In dry-run we never touch the network, so creds aren't required.
const client: XClient = dryRun
  ? { uploadMedia: async () => '', createTweet: async () => '' }
  : createXClient(requireXCreds());

const results = await runPoster({
  db: pool, client, mediaDir: resolve(MEDIA_DIR), gameUrl: GAME_URL, now: new Date(), dryRun,
});
await pool.end();

const posted = results.filter((r) => r.ok && !r.error).length;
const failed = results.filter((r) => r.error);
console.log(JSON.stringify({ dryRun, posted, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
```

- [ ] **Step 6: Wire into runner + typecheck** — add `import './post.test.js';` to `social/test/run.ts`, then:

Run: `npm -w @aether/social run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add social/src/post.ts social/src/cli/post.ts social/test/post.test.ts social/test/run.ts
git commit -m "feat(social): poster orchestration (media fallback + retry) + post CLI"
```

---

### Task 9: Content seed + context + draft brief + plan CLI

**Files:**
- Create: `social/src/content/features.json`
- Create: `social/src/context.ts`
- Create: `social/src/draft.ts`
- Create: `social/src/cli/plan.ts`
- Create: `social/test/draft.test.ts`
- Modify: `social/test/run.ts` (add `import './draft.test.js';`)

**Interfaces:**
- Produces: `FeatureSeed = { kind: string; title: string; blurb: string }`; `DraftContext = { recentCommits: string[]; features: FeatureSeed[]; creatures: string[]; media: MediaItem[] }`; `gatherContext({ mediaDir, contentPath, commitCount? }): Promise<DraftContext>`; `TAXONOMY`, `VOICE_RULES`, `DraftBrief`, `buildBrief(ctx, gameUrl): DraftBrief`.
- Consumes: `indexMedia`/`MediaItem` (Task 4).

- [ ] **Step 1: Create `social/src/content/features.json`** (curated — the user edits this over time)

```json
{
  "features": [
    { "kind": "feature", "title": "Building interiors", "blurb": "All 6 buildings in Aether Town are now enterable — homes, the lab, the shop and more." },
    { "kind": "feature", "title": "16 collectible beasts", "blurb": "Catch and evolve 16 original creatures across 8 evolution lines." },
    { "kind": "mechanic", "title": "The Aether Rift", "blurb": "Summon beasts at the Aether Rift — featured rate-up banners, guaranteed 5-star by pity 80." },
    { "kind": "mechanic", "title": "PvP Arena", "blurb": "Real-time quick-match PvP. Stake Battle Credits and climb the Elo ladder." },
    { "kind": "mechanic", "title": "Quests & streaks", "blurb": "Daily and weekly quests plus login streaks earn AETHER and Season Points." },
    { "kind": "cta", "title": "Play now", "blurb": "Play free in your browser — no download. Connect Phantom and go." }
  ],
  "creatures": [
    "Grodent -> Ratssive (Lv16)",
    "Drachnid -> Draquatic (Lv20)",
    "Duvan (Lv21)",
    "Jestar / Spookshroom (Lv22)",
    "Moldole (Lv26)"
  ]
}
```

- [ ] **Step 2: Create `social/src/context.ts`**

```ts
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { indexMedia, type MediaItem } from './media.js';

export interface FeatureSeed {
  kind: string;
  title: string;
  blurb: string;
}

export interface DraftContext {
  recentCommits: string[];
  features: FeatureSeed[];
  creatures: string[];
  media: MediaItem[];
}

export async function gatherContext(opts: {
  mediaDir: string;
  contentPath: string;
  commitCount?: number;
}): Promise<DraftContext> {
  const content = await readContent(opts.contentPath);
  return {
    recentCommits: recentCommits(opts.commitCount ?? 15),
    features: content.features,
    creatures: content.creatures,
    media: await indexMedia(opts.mediaDir),
  };
}

export async function readContent(path: string): Promise<{ features: FeatureSeed[]; creatures: string[] }> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return { features: parsed.features ?? [], creatures: parsed.creatures ?? [] };
  } catch {
    return { features: [], creatures: [] };
  }
}

function recentCommits(n: number): string[] {
  try {
    const out = execFileSync('git', ['log', `-n${n}`, '--pretty=format:%s'], { encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Create `social/src/draft.ts`**

```ts
import type { DraftContext } from './context.js';

export const TAXONOMY = [
  { kind: 'feature', label: 'Feature drop', hint: 'Announce a shipped feature. Hook first, then what it does.' },
  { kind: 'creature', label: 'Creature spotlight', hint: 'Highlight one beast and its evolution line.' },
  { kind: 'fomo', label: 'FOMO / social proof', hint: 'Leaderboard, battle counts, limited-time gacha banner.' },
  { kind: 'mechanic', label: 'Mechanic explainer', hint: 'How AETHER / gacha / PvP / quests work.' },
  { kind: 'cta', label: 'Play-now CTA', hint: 'Drive clicks to the game URL.' },
] as const;

export const VOICE_RULES = [
  'Hook first. One clear CTA.',
  'Keep it under 280 characters.',
  'Emoji: light but present (1-3).',
  'NEVER frame $AETHER as an investment, price, ROI, or "buy now to profit".',
  'NEVER use the word "NFT" — there are none.',
  'Reference real, shipped features only — no vaporware.',
];

export interface DraftBrief {
  generatedFrom: { commits: number; features: number; creatures: number; media: number };
  taxonomy: typeof TAXONOMY;
  voiceRules: string[];
  gameUrl: string;
  recentCommits: string[];
  features: DraftContext['features'];
  creatures: string[];
  mediaFiles: string[];
}

export function buildBrief(ctx: DraftContext, gameUrl: string): DraftBrief {
  return {
    generatedFrom: {
      commits: ctx.recentCommits.length,
      features: ctx.features.length,
      creatures: ctx.creatures.length,
      media: ctx.media.length,
    },
    taxonomy: TAXONOMY,
    voiceRules: VOICE_RULES,
    gameUrl,
    recentCommits: ctx.recentCommits,
    features: ctx.features,
    creatures: ctx.creatures,
    mediaFiles: ctx.media.map((m) => m.file),
  };
}
```

- [ ] **Step 4: Write the failing test** `social/test/draft.test.ts`

```ts
import assert from 'node:assert/strict';
import { buildBrief, TAXONOMY, VOICE_RULES } from '../src/draft.js';
import type { DraftContext } from '../src/context.js';

const ctx: DraftContext = {
  recentCommits: ['feat: thing', 'fix: bug'],
  features: [{ kind: 'feature', title: 'X', blurb: 'does X' }],
  creatures: ['Grodent -> Ratssive (Lv16)'],
  media: [{ file: 'a.png', bytes: 10 }, { file: 'b.png', bytes: 20 }],
};

const brief = buildBrief(ctx, 'https://game');

// deterministic + faithful mapping
assert.equal(brief.gameUrl, 'https://game');
assert.deepEqual(brief.mediaFiles, ['a.png', 'b.png']);
assert.deepEqual(brief.generatedFrom, { commits: 2, features: 1, creatures: 1, media: 2 });
assert.equal(brief.taxonomy.length, 5);

// all five kinds present
const kinds = brief.taxonomy.map((t) => t.kind);
for (const k of ['feature', 'creature', 'fomo', 'mechanic', 'cta']) assert.ok(kinds.includes(k as any), `missing ${k}`);

// the hard copy rules are present
assert.ok(VOICE_RULES.some((r) => /NFT/.test(r)), 'no-NFT rule present');
assert.ok(VOICE_RULES.some((r) => /investment|ROI/.test(r)), 'no-investment rule present');

console.log('draft.test ok');
```

- [ ] **Step 5: Run it to verify it fails**

Run: `node --import tsx social/test/draft.test.ts`
Expected: FAIL — module not found (or assertion mismatch).

- [ ] **Step 6: Create `social/src/cli/plan.ts`**

```ts
import { resolve } from 'node:path';
import { gatherContext } from '../context.js';
import { buildBrief } from '../draft.js';
import { GAME_URL, MEDIA_DIR } from '../config.js';

const ctx = await gatherContext({
  mediaDir: resolve(MEDIA_DIR),
  contentPath: resolve('src/content/features.json'),
});
console.log(JSON.stringify(buildBrief(ctx, GAME_URL), null, 2));
```

- [ ] **Step 7: Run the test + plan smoke**

Run: `node --import tsx social/test/draft.test.ts`
Expected: prints `draft.test ok`.
Run: `npm -w @aether/social run plan`
Expected: prints a JSON brief with `features`, `creatures`, `taxonomy`, `voiceRules`, `mediaFiles` (mediaFiles empty until you stock `social/media/`).

- [ ] **Step 8: Wire into runner + commit** — add `import './draft.test.js';` to `social/test/run.ts`.

```bash
git add social/src/content/features.json social/src/context.ts social/src/draft.ts social/src/cli/plan.ts social/test/draft.test.ts social/test/run.ts
git commit -m "feat(social): content seed + drafting context/brief + plan CLI"
```

---

### Task 10: GitHub Actions poster workflow + CI wiring

**Files:**
- Create: `.github/workflows/social-post.yml`
- Modify: `.github/workflows/ci.yml` (add social typecheck + unit tests)

**Interfaces:**
- Consumes: root scripts `social:post`, `test:social`, and `typecheck` (Task 1); GitHub repo secrets `DATABASE_URL`, `X_APP_KEY`, `X_APP_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.

- [ ] **Step 1: Create `.github/workflows/social-post.yml`**

```yaml
name: Social poster

on:
  schedule:
    - cron: '*/30 * * * *' # every 30 min (GitHub may delay scheduled runs under load)
  workflow_dispatch: {}

# Never let two poster runs overlap -> with markPosted's guard, a row can't double-post.
concurrency:
  group: social-post
  cancel-in-progress: false

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Post due tweets
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          X_APP_KEY: ${{ secrets.X_APP_KEY }}
          X_APP_SECRET: ${{ secrets.X_APP_SECRET }}
          X_ACCESS_TOKEN: ${{ secrets.X_ACCESS_TOKEN }}
          X_ACCESS_SECRET: ${{ secrets.X_ACCESS_SECRET }}
        run: npm run social:post
```

- [ ] **Step 2: Modify `.github/workflows/ci.yml`** — add a step after the existing `Unit tests (engine)` step:

```yaml
      - name: Social unit tests
        run: npm run test:social
```

(The existing `Typecheck` step already runs `npm run typecheck`, which now includes the social workspace from Task 1, Step 6.)

- [ ] **Step 3: Validate the workflow YAML locally**

Run: `node -e "const c=require('fs').readFileSync('.github/workflows/social-post.yml','utf8'); if(!/cron: '\*\/30/.test(c)||!/social:post/.test(c)) throw new Error('workflow content missing'); console.log('workflow ok')"`
Expected: prints `workflow ok`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/social-post.yml .github/workflows/ci.yml
git commit -m "ci(social): scheduled poster workflow + social tests in CI"
```

> **Manual (after secrets are set):** trigger `Social poster` via the Actions tab ("Run workflow") to dispatch a one-off run; with an empty queue it should post nothing and exit 0.

---

### Task 11: `/tweet-batch` command + SOCIAL.md + end-to-end

**Files:**
- Create: `.claude/commands/tweet-batch.md`
- Create: `social/media/.gitkeep`
- Create: `SOCIAL.md`

**Interfaces:**
- Consumes: `social:plan` and the workspace `enqueue` script (Tasks 7, 9).

- [ ] **Step 1: Create `social/media/.gitkeep`** (empty file — keeps the media dir in git so the workflow checkout has it)

```
```

- [ ] **Step 2: Create `.claude/commands/tweet-batch.md`**

````markdown
---
description: Draft a batch of Aetherbeasts tweets (PlayKintara style), review, and queue the approved ones
---

You are drafting tweets for the **Aetherbeasts** X account in the **@PlayKintara** style:
hook-driven, media-first feature-drop / FOMO posts with `$AETHER` woven in as the game's mechanic.

Follow this loop:

1. Run `npm -w @aether/social run plan` and read the JSON brief: `taxonomy`, `voiceRules`,
   `recentCommits`, `features`, `creatures`, available `mediaFiles`, and `gameUrl`.
2. Draft **3–5 candidate posts** spread across different taxonomy `kind`s. Each candidate has:
   - `kind` (one of: feature, creature, fomo, mechanic, cta)
   - `text` — **< 280 chars**, obeying EVERY voice rule. Hard rules: never frame `$AETHER` as an
     investment / price / ROI / "buy to profit"; never use the word "NFT"; only reference real,
     shipped features (use `recentCommits` + `features`).
   - a suggested `mediaFile` from `mediaFiles` (or `null` if none fits).
3. Present the candidates as a numbered list (text + suggested image). Let the user
   **approve / edit text / swap image / set a post time**. Default scheduling: stagger approved
   posts over the next few days at ~1–2/day, on the hour.
4. For each **approved** post, run (one call per post):

   ```
   npm -w @aether/social run enqueue -- '{"kind":"<kind>","text":"<text>","mediaFile":<"file.png" or null>,"scheduledAt":"<ISO-8601>"}'
   ```

   `mediaFile` must name a file that exists in `social/media/`, or be `null`.
5. Confirm what was queued and at what times.

**Never enqueue a post the user did not explicitly approve.**
````

- [ ] **Step 3: Create `SOCIAL.md`**

```markdown
# Aetherbeasts Social Automation

PlayKintara-style X posting for Aetherbeasts on the **free** X API tier: you draft + approve
posts in Claude Code, they queue in Neon, and a GitHub Actions cron posts them on schedule.

## One-time setup

1. **X developer app** — at https://developer.x.com create an app; enable **OAuth 1.0a** with
   **Read and Write**. Generate: API key (`X_APP_KEY`), API secret (`X_APP_SECRET`),
   Access token (`X_ACCESS_TOKEN`), Access token secret (`X_ACCESS_SECRET`).
2. **GitHub repo secrets** (Settings -> Secrets and variables -> Actions): add the 4 X values
   above plus `DATABASE_URL` (the same Neon URL the game server uses).
3. **Local `.env`** — create `social/.env` (gitignored) with the same 5 vars for drafting +
   the live smoke test.
4. **Media pool** — drop gameplay screenshots/clips into `social/media/` and commit them.

## Daily use

- In Claude Code, run **`/tweet-batch`**: it drafts candidates, you approve/edit/schedule, and
  approved posts are written to the Neon `social_posts` queue.
- The **Social poster** GitHub Action runs every ~30 min and posts anything due.

## Commands

- `npm -w @aether/social run plan` — print the drafting brief (used by `/tweet-batch`).
- `npm -w @aether/social run post -- --dry-run` — show what *would* post, calling nothing.
- `npm -w @aether/social run smoke` — live: post a test tweet + verify media upload (needs `.env`).
- `npm run social:post` — run the poster once (what CI runs).

## Free-tier notes

- ~500 posts/month write cap; no read access (so replies/monitoring are **not** built — see the
  deferred plug-ins in the design spec if you upgrade to Basic).
- If media upload is blocked on free (the smoke test tells you), the poster auto-falls back to
  text + the game link (X renders a preview card).
```

- [ ] **Step 4: End-to-end dry run (no live posting)**

Run: `npm -w @aether/social run enqueue -- '{"kind":"cta","text":"Play Aetherbeasts free in your browser!","mediaFile":null,"scheduledAt":"2000-01-01T00:00:00Z"}'`
Expected: prints `enqueued <id> — cta @ 2000-01-01T00:00:00.000Z` (requires `DATABASE_URL` in `social/.env`).
Run: `npm -w @aether/social run post -- --dry-run`
Expected: JSON with `"dryRun": true` and the past-dated row listed under `results` with `ok: true` (nothing actually posts).
Then remove the test row from Neon (or let it post a real CTA on the next live run — your call).

- [ ] **Step 5: Full live end-to-end (after secrets are set)**

Run `/tweet-batch` in Claude Code, approve one post scheduled a few minutes out, then either wait
for the cron or trigger `Social poster` manually in the Actions tab. Confirm the tweet appears on
the account and the row's `status` is `posted` with a `tweet_id`.

- [ ] **Step 6: Commit**

```bash
git add .claude/commands/tweet-batch.md social/media/.gitkeep SOCIAL.md
git commit -m "feat(social): /tweet-batch command, media dir, SOCIAL.md docs"
```

---

## Self-Review

**Spec coverage:**
- §2 scope (draft→approve→queue→post; no reply/monitor) → Tasks 7–11. ✓
- §4 architecture (`social/` workspace, one-job modules) → Tasks 1–9 map 1:1 to the module list. ✓
- §5 `social_posts` schema → Task 2 (all columns present; `id text` app-generated per repo convention). ✓
- §6 content engine (taxonomy, voice rules, cadence) → Task 9 (`TAXONOMY`, `VOICE_RULES`); cadence is applied at scheduling time by `/tweet-batch` (Task 11). ✓
- §7 pipeline (plan → enqueue → post CLIs) → Tasks 9, 7, 8. ✓
- §8 media + fallback → Task 4 (index/validate) + Task 8 (`ensureLink` degrade) + Task 6 (live verify). ✓
- §9 error handling (idempotent markPosted guard, retry/`failed` threshold, no double-post via workflow `concurrency`) → Tasks 3, 8, 10. ✓
- §10 deferred plug-ins → intentionally NOT built; noted in SOCIAL.md. ✓
- §11 user actions → SOCIAL.md setup (Task 11). ✓
- §12 testing → unit tests in Tasks 1–9; dry-run + smoke in Tasks 6, 8, 11; CI wiring Task 10. ✓
- §13 build order → tasks ordered config→db→queue→media→xclient→smoke→enqueue→draft→post→CI→command. ✓

**Placeholder scan:** No TBD/TODO; every code/test step has full content; `.gitkeep` empty-file is intentional. ✓

**Type consistency:** `Queryable`, `ApprovedPost`, `DuePost`, `PostKind`, `XClient`, `DraftContext`, `FeatureSeed`, `PosterDeps`, `PostResult` are each defined once and consumed with matching shapes; `enqueue/listDue/markPosted/markFailed` signatures match between Task 3 and Task 8; `parseApproved` returns the Task 3 `ApprovedPost`. ✓
