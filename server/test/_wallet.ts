import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { io, type Socket } from 'socket.io-client';

export interface WalletClient {
  socket: Socket;
  profile: { credits: number; rating: number; guest: boolean; wallet: string | null; name: string; id: string };
  pubkey: string;
}

/**
 * Connect a socket and authenticate with a FRESH ed25519 wallet via the real
 * challenge/verify handshake — the only way to get an account now that anonymous
 * guests are disabled. Used by the e2e tests in place of auth:guest.
 */
export function walletConnect(url: string): Promise<WalletClient> {
  return new Promise((resolve, reject) => {
    const kp = nacl.sign.keyPair();
    const pubkey = bs58.encode(kp.publicKey);
    const socket = io(url, { transports: ['websocket'], forceNew: true });
    const to = setTimeout(() => reject(new Error('wallet auth timeout')), 8000);
    socket.on('auth:challenge', (c: { nonce: string; message: string }) => {
      const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(c.message), kp.secretKey));
      socket.emit('auth:verify', { publicKey: pubkey, signature: sig, nonce: c.nonce });
    });
    socket.once('auth:ok', (p: { profile: WalletClient['profile'] }) => { clearTimeout(to); resolve({ socket, profile: p.profile, pubkey }); });
    socket.on('auth:error', (e: { message: string }) => { clearTimeout(to); reject(new Error('auth:error ' + e.message)); });
    socket.emit('auth:challenge', { publicKey: pubkey });
  });
}
