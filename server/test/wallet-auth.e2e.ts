/**
 * End-to-end proof of the Phantom wallet sign-in + guest->wallet upgrade:
 * connect as a guest, then sign the server's nonce with an ed25519 key and verify
 * — the server must accept the signature, return a wallet-bound profile, and carry
 * the guest's credits into the wallet account.
 *
 * Run: npm run test:auth   (node --import tsx server/test/wallet-auth.e2e.ts)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { io } from 'socket.io-client';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '..');
const PORT = 4601;
const URL = `http://localhost:${PORT}`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('ASSERTION FAILED: ' + msg);
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
    const kp = nacl.sign.keyPair();
    const pubkey = bs58.encode(kp.publicKey);
    const socket = io(URL, { transports: ['websocket'], forceNew: true });

    const authOk: any[] = [];
    let challenge: { nonce: string; message: string } | null = null;
    socket.on('auth:ok', (p) => authOk.push(p));
    socket.on('auth:challenge', (c) => { challenge = c; });
    socket.on('auth:error', (e) => { throw new Error('auth:error ' + e.message); });

    // 1) become a guest, note the starting credits
    socket.emit('auth:guest', {});
    await until(() => authOk.length >= 1, 5000, 'guest auth');
    const guest = authOk[0];
    assert(guest.profile.guest === true, 'first auth is a guest');
    const guestCredits = guest.profile.credits;

    // 2) request a challenge and sign it
    socket.emit('auth:challenge', { publicKey: pubkey });
    await until(() => challenge !== null, 5000, 'challenge');
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge!.message), kp.secretKey));
    socket.emit('auth:verify', { publicKey: pubkey, signature: sig, nonce: challenge!.nonce });
    await until(() => authOk.length >= 2, 5000, 'wallet auth');
    const wallet = authOk[1];

    // 3) the wallet account inherits the guest (same credits), is no longer a guest
    assert(wallet.profile.wallet === pubkey, 'profile bound to the signing wallet');
    assert(wallet.profile.guest === false, 'wallet account is not a guest');
    assert(wallet.profile.credits === guestCredits, `credits carried over (${wallet.profile.credits} === ${guestCredits})`);

    // 4) a BAD signature is rejected
    const bad = io(URL, { transports: ['websocket'], forceNew: true });
    let rejected = false;
    bad.on('auth:error', () => { rejected = true; });
    bad.on('auth:challenge', (c: any) => bad.emit('auth:verify', { publicKey: pubkey, signature: bs58.encode(new Uint8Array(64)), nonce: c.nonce }));
    bad.emit('auth:guest', {});
    bad.emit('auth:challenge', { publicKey: pubkey });
    await until(() => rejected, 5000, 'bad signature rejected');

    socket.close(); bad.close();
    console.log(`\n✅ wallet-auth e2e PASSED — signature verified, guest->wallet upgrade carried ${guestCredits} credits, bad signature rejected.`);
  } finally {
    child.kill();
  }
}

function until(cond: () => boolean, ms: number, what: string): Promise<void> {
  return new Promise((res, rej) => {
    const start = Date.now();
    const id = setInterval(() => {
      if (cond()) { clearInterval(id); res(); }
      else if (Date.now() - start > ms) { clearInterval(id); rej(new Error('timeout waiting for ' + what)); }
    }, 50);
  });
}

main().then(
  () => setTimeout(() => process.exit(0), 150),
  (e) => { console.error('\n❌ wallet-auth e2e FAILED:', e.message); setTimeout(() => process.exit(1), 150); },
);
