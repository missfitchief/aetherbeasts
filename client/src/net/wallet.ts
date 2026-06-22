import bs58 from 'bs58';
import type { Transaction } from '@solana/web3.js';

// Minimal shape of the Phantom (window.solana) provider we rely on.
export interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (msg: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
  /** Phantom signs AND submits the transaction, returning its signature. */
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
}
declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

/** The connected Phantom provider, or throw a user-facing error. */
export async function getConnectedProvider(): Promise<SolanaProvider> {
  const provider = window.solana;
  if (!provider || !provider.isPhantom) throw new Error('Phantom wallet not found. Install it from phantom.app.');
  if (!provider.publicKey) await provider.connect();
  return provider;
}

export interface WalletHandle {
  publicKey: string;
  /** Sign the login message; returns a base58 signature. Only called on a click. */
  signLogin: (message: string) => Promise<string>;
}

/**
 * Connect to Phantom (or any window.solana provider). Never auto-signs — the
 * signature is produced only when signLogin() is called from a user action.
 */
export async function connectPhantom(): Promise<WalletHandle> {
  const provider = window.solana;
  if (!provider || !provider.isPhantom) {
    throw new Error('Phantom wallet not found. Install it from phantom.app.');
  }
  const resp = await provider.connect();
  const publicKey = resp.publicKey.toString();
  return {
    publicKey,
    signLogin: async (message: string) => {
      const encoded = new TextEncoder().encode(message);
      const { signature } = await provider.signMessage(encoded, 'utf8');
      return bs58.encode(signature);
    },
  };
}
