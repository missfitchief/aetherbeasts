/**
 * End-to-end proof of the MANDATORY wallet login + sign-in security:
 *  1. an anonymous auth:guest (no token) is REFUSED (no Sybil faucet),
 *  2. a valid ed25519 signature creates a wallet account with the starting credits,
 *  3. a bad signature is rejected.
 *
 * Run: npm run test:auth   (node --import tsx server/test/wallet-auth.e2e.ts)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { io } from 'socket.io-client';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { walletConnect } from './_wallet.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '..');
const PORT = 4601;
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

async function main() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT), CLIENT_ORIGIN: '*', DATABASE_URL: '' },
  });
  try {
    await waitForListen(child);

    // 1) anonymous guest is refused (mandatory wallet)
    const g = io(URL, { transports: ['websocket'], forceNew: true });
    let guestErr = false, guestOk = false;
    g.on('auth:error', () => { guestErr = true; });
    g.on('auth:ok', () => { guestOk = true; });
    g.emit('auth:guest', {});
    await until(() => guestErr || guestOk, 5000, 'guest response');
    assert(guestErr && !guestOk, 'anonymous auth:guest is refused');
    g.close();

    // 2) a valid signature creates a wallet account with starting credits
    const w = await walletConnect(URL);
    assert(w.profile.wallet === w.pubkey, 'profile bound to the signing wallet');
    assert(w.profile.guest === false, 'account is a wallet account, not a guest');
    assert(w.profile.credits === 1000, `wallet starts with 1000 credits (got ${w.profile.credits})`);
    w.socket.close();

    // 3) a bad signature is rejected
    const kp = nacl.sign.keyPair();
    const pub = bs58.encode(kp.publicKey);
    const bad = io(URL, { transports: ['websocket'], forceNew: true });
    let rejected = false;
    bad.on('auth:error', () => { rejected = true; });
    bad.on('auth:challenge', (c: any) => bad.emit('auth:verify', { publicKey: pub, signature: bs58.encode(new Uint8Array(64)), nonce: c.nonce }));
    bad.emit('auth:challenge', { publicKey: pub });
    await until(() => rejected, 5000, 'bad signature rejected');
    bad.close();

    console.log('\n✅ wallet-auth e2e PASSED — anonymous guest refused, valid signature creates a 1000-credit wallet account, bad signature rejected.');
  } finally {
    child.kill();
  }
}

main().then(
  () => setTimeout(() => process.exit(0), 150),
  (e) => { console.error('\n❌ wallet-auth e2e FAILED:', e.message); setTimeout(() => process.exit(1), 150); },
);
