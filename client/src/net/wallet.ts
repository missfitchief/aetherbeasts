import bs58 from 'bs58';
import type { Transaction } from '@solana/web3.js';

// Minimal shape of a Solana wallet provider we rely on (Phantom, Solflare, …).
export interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } } | void>;
  signMessage: (msg: Uint8Array, display?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
  /** The wallet signs AND submits the transaction, returning its signature. */
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
  /** Wallet events — Phantom/Solflare emit 'accountChanged' when the user switches accounts. */
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
  /** Disconnect the dApp from the wallet extension. */
  disconnect?: () => Promise<void>;
}
declare global {
  interface Window {
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
  }
}

/** First installed Solana wallet — Phantom or Solflare (Phantom wins if both). */
export function detectWallet(): SolanaProvider | null {
  if (typeof window === 'undefined') return null;
  if (window.solana?.isPhantom) return window.solana;
  if (window.solflare?.isSolflare) return window.solflare;
  return window.solana ?? window.solflare ?? null; // any other injected provider
}

export function walletInstalled(): boolean {
  return detectWallet() !== null;
}

/** The connected wallet provider, or throw a user-facing error. */
export async function getConnectedProvider(): Promise<SolanaProvider> {
  const provider = detectWallet();
  if (!provider) throw new Error('No Solana wallet found. Install Phantom or Solflare, then refresh.');
  if (!provider.publicKey) await provider.connect();
  return provider;
}

export interface WalletHandle {
  publicKey: string;
  /** Sign the login message; returns a base58 signature. Only called on a click. */
  signLogin: (message: string) => Promise<string>;
}

function readPublicKey(provider: SolanaProvider): string {
  const pk = provider.publicKey;
  if (!pk) throw new Error('Wallet did not return a public key.');
  return pk.toString();
}
// Phantom returns { signature }; Solflare may return the raw bytes.
function toSignatureBytes(res: { signature: Uint8Array } | Uint8Array): Uint8Array {
  return res instanceof Uint8Array ? res : res.signature;
}

/**
 * Connect to a Solana wallet (Phantom or Solflare). Never auto-signs — the
 * signature is produced only when signLogin() is called from a user action.
 */
export async function connectWallet(): Promise<WalletHandle> {
  const provider = detectWallet();
  if (!provider) throw new Error('No Solana wallet found. Install Phantom or Solflare.');
  await provider.connect();
  const publicKey = readPublicKey(provider);
  return {
    publicKey,
    signLogin: async (message: string) => {
      const encoded = new TextEncoder().encode(message);
      const res = await provider.signMessage(encoded, 'utf8');
      return bs58.encode(toSignatureBytes(res));
    },
  };
}

let watchingAccount = false;
/**
 * Fire `cb` when the user switches the active account in their wallet extension
 * (Phantom/Solflare emit `accountChanged`) or disconnects. `cb` gets the new
 * public key as base58, or null if disconnected/locked. Attaches once and
 * retries until a provider is injected. NOTE: this event is unreliable (Phantom
 * may not emit it when switching to an account that hasn't connected to the
 * dApp) — `activeTrustedKey()` polled on focus is the dependable path.
 */
export function watchAccountChange(cb: (publicKey: string | null) => void): void {
  if (watchingAccount) return;
  const toKey = (pk: unknown) => (pk && typeof (pk as { toString(): string }).toString === 'function' ? (pk as { toString(): string }).toString() : null);
  const attach = (): boolean => {
    const p = detectWallet();
    if (!p || typeof p.on !== 'function') return false;
    p.on('accountChanged', (pk: unknown) => cb(toKey(pk)));
    p.on('disconnect', () => cb(null));
    watchingAccount = true;
    return true;
  };
  if (attach()) return;
  let tries = 0;
  const iv = setInterval(() => { if (attach() || ++tries > 25) clearInterval(iv); }, 300);
}

/**
 * The currently-active wallet account, but ONLY if it already trusts this dApp
 * (silent — never shows a popup). Returns its base58 key, or null if the active
 * account hasn't trusted the dApp / the wallet is locked. This is the reliable
 * way to detect an account switch: poll it when the page regains focus.
 */
export async function activeTrustedKey(): Promise<string | null> {
  const p = detectWallet();
  if (!p) return null;
  try {
    const res = await p.connect({ onlyIfTrusted: true });
    const pk = (res && (res as { publicKey?: { toString(): string } }).publicKey) || p.publicKey;
    return pk ? pk.toString() : null;
  } catch {
    return null; // active account hasn't trusted the dApp (or wallet locked)
  }
}

/** The wallet's currently-reported account key (synchronous property read, no
 *  RPC/popup), or null if none. Cheap enough to poll. */
export function currentProviderKey(): string | null {
  const pk = detectWallet()?.publicKey;
  return pk ? pk.toString() : null;
}

/** Best-effort: disconnect the dApp from the wallet extension, so the next
 *  connect() starts fresh (and the user can pick a different account). */
export async function disconnectWallet(): Promise<void> {
  const p = detectWallet();
  try { await p?.disconnect?.(); } catch { /* ignore — clearing the session is what matters */ }
}
