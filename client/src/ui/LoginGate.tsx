import { useEffect, useState } from 'react';
import { STARTERS } from '@aether/shared';
import { useNet, connectWallet, retryConnect } from '../net/net.js';
import { MonImg } from './components.js';

const TOKEN_KEY = 'aetherbeasts:nettoken';

/**
 * Mandatory wallet gate. The game is not playable until the player signs in with
 * a Solana wallet (Phantom). Returning players with a stored session token are
 * resumed automatically; everyone else must connect.
 */
export function LoginGate() {
  const socketReady = useNet((s) => s.socketReady); // transport reachable (≠ authenticated)
  const authFailed = useNet((s) => s.authFailed);
  const hasWallet = typeof window !== 'undefined' && !!(window.solana?.isPhantom || window.solflare?.isSolflare || window.solana || window.solflare);
  const [phase, setPhase] = useState<'checking' | 'idle' | 'connecting'>('checking');

  // Only briefly wait for an auto-resume if we actually have a token to try.
  useEffect(() => {
    const hasToken = !!localStorage.getItem(TOKEN_KEY);
    if (!hasToken) { setPhase('idle'); return; }
    const t = setTimeout(() => setPhase((p) => (p === 'checking' ? 'idle' : p)), 1800);
    return () => clearTimeout(t);
  }, []);

  // A failed resume (stale token / rejected sig) should drop us straight to Connect.
  useEffect(() => { if (authFailed) setPhase('idle'); }, [authFailed]);

  const onConnect = async () => {
    setPhase('connecting');
    await connectWallet(); // the gate unmounts once auth:ok sets the wallet
    setTimeout(() => setPhase((p) => (p === 'connecting' ? 'idle' : p)), 2000);
  };

  const checking = phase === 'checking';

  return (
    <div className="login-gate">
      <h1 className="title-logo">Aetherbeasts</h1>
      <div className="title-tag">Bind · Battle · Become</div>
      <div className="title-mons">
        {STARTERS.map((id) => <MonImg key={id} speciesId={id} size={56} />)}
      </div>

      <div className="login-card">
        <div className="login-head">👛 Connect your wallet to play</div>
        <p className="muted small">
          Aetherbeasts is a Solana game — your beasts, progress and Battle Credits live with your wallet.
          Connecting is free and off-chain (you just sign a message; no transaction).
        </p>

        {checking ? (
          <div className="login-status"><span className="spinner" /> Resuming your session…</div>
        ) : !hasWallet ? (
          <>
            <a className="btn big gold" href="https://phantom.app/download" target="_blank" rel="noreferrer">Install Phantom →</a>
            <a className="btn" href="https://solflare.com/download" target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>Install Solflare →</a>
            <div className="muted small" style={{ marginTop: 8 }}>No Solana wallet detected. Install Phantom or Solflare, then refresh.</div>
          </>
        ) : !socketReady ? (
          <>
            <div className="login-status warn">Can’t reach the game server.</div>
            <button className="btn" onClick={retryConnect}>Retry connection</button>
          </>
        ) : (
          <button className="btn big gold" disabled={phase === 'connecting'} onClick={onConnect}>
            {phase === 'connecting' ? 'Approve in your wallet…' : '👛 Connect Wallet'}
          </button>
        )}
      </div>
    </div>
  );
}
