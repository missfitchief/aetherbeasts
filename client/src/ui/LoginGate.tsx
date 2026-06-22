import { useEffect, useState } from 'react';
import { STARTERS } from '@aether/shared';
import { useNet, connectWallet } from '../net/net.js';
import { MonImg } from './components.js';

const TOKEN_KEY = 'aetherbeasts:nettoken';

/**
 * Mandatory wallet gate. The game is not playable until the player signs in with
 * a Solana wallet (Phantom). Returning players with a stored session token are
 * resumed automatically; everyone else must connect.
 */
export function LoginGate() {
  const status = useNet((s) => s.status);
  const hasPhantom = typeof window !== 'undefined' && !!window.solana?.isPhantom;
  const [phase, setPhase] = useState<'checking' | 'idle' | 'connecting'>('checking');

  useEffect(() => {
    // Give an auto-resume (stored token) a moment before prompting to connect.
    const hasToken = !!localStorage.getItem(TOKEN_KEY);
    const t = setTimeout(() => setPhase((p) => (p === 'checking' ? 'idle' : p)), hasToken ? 1800 : 0);
    return () => clearTimeout(t);
  }, []);

  const onConnect = async () => {
    setPhase('connecting');
    await connectWallet(); // the gate unmounts once auth:ok sets the wallet
    setTimeout(() => setPhase('idle'), 1500); // re-enable if the user cancelled / it failed
  };

  return (
    <div className="login-gate">
      <h1 className="title-logo">Aetherbeasts</h1>
      <div className="title-tag">Bind · Battle · Become</div>
      <div className="title-mons">
        {STARTERS.map((id) => <MonImg key={id} speciesId={id} size={56} />)}
      </div>

      <div className="login-card">
        <div className="login-head">🦊 Connect your wallet to play</div>
        <p className="muted small">
          Aetherbeasts is a Solana game — your beasts, progress and Battle Credits live with your wallet.
          Connecting is free and off-chain (you just sign a message; no transaction).
        </p>

        {phase === 'checking' ? (
          <div className="login-status"><span className="spinner" /> Resuming your session…</div>
        ) : !hasPhantom ? (
          <a className="btn big gold" href="https://phantom.app/download" target="_blank" rel="noreferrer">
            Install Phantom →
          </a>
        ) : status === 'offline' ? (
          <div className="login-status warn">Can’t reach the game server. Reconnecting…</div>
        ) : (
          <button className="btn big gold" disabled={phase === 'connecting' || status !== 'online'} onClick={onConnect}>
            {phase === 'connecting' ? 'Check Phantom…' : status === 'connecting' ? 'Connecting…' : '🦊 Connect Phantom'}
          </button>
        )}

        {!hasPhantom && phase !== 'checking' && (
          <div className="muted small" style={{ marginTop: 8 }}>No Solana wallet detected. Install Phantom, then refresh.</div>
        )}
      </div>
    </div>
  );
}
