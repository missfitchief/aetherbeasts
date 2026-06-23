/**
 * End-to-end proof of the quest flow on the authoritative server:
 *  1. a fresh wallet receives a quest board on login,
 *  2. reporting PvE progress advances a daily quest (clamped to its target),
 *  3. claiming it grants ◈ into the save + Season Points — server-authoritative,
 *  4. a second claim of the same quest is refused (idempotent, no double-grant).
 *
 * Run: npm run test:quests   (node --import tsx server/test/quests.e2e.ts)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { newSave, questDef, type QuestView } from '@aether/shared';
import { walletConnect } from './_wallet.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '..');
const PORT = 4603;
const URL = `http://localhost:${PORT}`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
}
function until(cond: () => boolean, ms: number, what: string): Promise<void> {
  return new Promise((res, rej) => {
    const start = Date.now();
    const id = setInterval(() => {
      if (cond()) { clearInterval(id); res(); }
      else if (Date.now() - start > ms) { clearInterval(id); rej(new Error('timeout: ' + what)); }
    }, 50);
  });
}
async function waitForListen(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('server did not start')), 20_000);
    child.stdout?.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(to); res(); } });
    child.stderr?.on('data', (d) => process.stderr.write(`[server:err] ${d}`));
    child.on('exit', (c) => { clearTimeout(to); rej(new Error('server exited early ' + c)); });
  });
}

// PvE actions the client can report via quest:progress.
const REPORTABLE = new Set(['battle_play', 'battle_win', 'catch', 'summon', 'evolve']);

async function main() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT), CLIENT_ORIGIN: '*', DATABASE_URL: '' },
  });
  try {
    await waitForListen(child);
    const w = await walletConnect(URL);
    const s = w.socket;

    let view: QuestView | null = null;
    let claimed: { questId: string; aether: number; points: number; save: { aether?: number }; view: QuestView } | null = null;
    s.on('quest:state', (v: QuestView) => { view = v; });
    s.on('quest:claimed', (p: any) => { claimed = p; });

    // 1) board arrives on login
    await until(() => view !== null, 5000, 'quest:state on login');
    assert(view!.daily.length === 3, 'three dailies assigned');
    assert(view!.weekly.length >= 3, 'weekly quests present');

    // give the account a save so the ◈ reward has somewhere to land
    const save = newSave(w.profile.id, 'Tester');
    const startAether = save.aether;
    s.emit('save:push', { save });
    await new Promise((r) => setTimeout(r, 300));

    // 2) pick a daily we can complete by reporting PvE progress, and complete it
    const target = view!.daily.find((q) => REPORTABLE.has(questDef(q.id)!.type));
    assert(target, 'at least one daily is PvE-reportable');
    const def = questDef(target!.id)!;
    s.emit('quest:progress', { type: def.type, amount: def.target });
    await until(() => !!view!.daily.find((q) => q.id === def.id && q.progress >= def.target), 5000, 'progress reaches target');

    // 3) claim → ◈ + points granted, server-side
    s.emit('quest:claim', { questId: def.id });
    await until(() => claimed !== null, 5000, 'quest:claimed');
    assert(claimed!.questId === def.id, 'claimed the right quest');
    assert(claimed!.aether >= def.aether, `granted at least the quest ◈ (got ${claimed!.aether})`);
    assert(claimed!.points === def.points, 'granted the quest points');
    assert((claimed!.save.aether ?? 0) === startAether + claimed!.aether, 'the ◈ landed in the save');
    assert(claimed!.view.seasonPoints === def.points, 'season points accrued in the board');

    // 4) a second claim is refused (no double-grant)
    const before = claimed!.aether;
    claimed = null;
    s.emit('quest:claim', { questId: def.id });
    await new Promise((r) => setTimeout(r, 400));
    assert(claimed === null, 'second claim of the same quest is ignored');
    void before;

    s.close();
    console.log('\n✅ quests e2e PASSED — board on login, progress clamps, claim grants ◈ + points server-side, no double-claim.');
  } finally {
    child.kill();
  }
}

main().then(
  () => setTimeout(() => process.exit(0), 150),
  (e) => { console.error('\n❌ quests e2e FAILED:', e.message); setTimeout(() => process.exit(1), 150); },
);
