import nacl from 'tweetnacl';
import bs58 from 'bs58';

// The exact message the client is asked to sign. MUST match the client.
export function buildLoginMessage(nonce: string): string {
  return [
    'Aetherbeasts login',
    'Sign to prove you own this wallet.',
    'This is free, off-chain, and sends no transaction.',
    `nonce: ${nonce}`,
  ].join('\n');
}

// Verify an ed25519 signature produced by a Solana wallet (Phantom) over the
// login message. publicKey + signature are base58 (Solana convention).
export function verifySignature(publicKey: string, signatureB58: string, nonce: string): boolean {
  try {
    const msg = new TextEncoder().encode(buildLoginMessage(nonce));
    const sig = bs58.decode(signatureB58);
    const key = bs58.decode(publicKey);
    if (key.length !== 32 || sig.length !== 64) return false;
    return nacl.sign.detached.verify(msg, sig, key);
  } catch {
    return false;
  }
}
