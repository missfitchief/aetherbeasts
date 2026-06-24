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
 * (Phantom/Solflare emit `accountChanged`). `cb` gets the new public key as a
 * base58 string, or null if the wallet disconnected/locked. Attaches once and
 * retries until a provider is injected.
 */
export function watchAccountChange(cb: (publicKey: string | null) => void): void {
  if (watchingAccount) return;
  const attach = (): boolean => {
    const p = detectWallet();
    if (!p || typeof p.on !== 'function') return false;
    p.on('accountChanged', (pk: unknown) => {
      const next = pk && typeof (pk as { toString(): string }).toString === 'function'
        ? (pk as { toString(): string }).toString()
        : null;
      cb(next);
    });
    watchingAccount = true;
    return true;
  };
  if (attach()) return;
  let tries = 0;
  const iv = setInterval(() => { if (attach() || ++tries > 25) clearInterval(iv); }, 300);
}
