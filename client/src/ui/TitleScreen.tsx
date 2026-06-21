import { useState } from 'react';
import { useGame } from '../state/store.js';
import { STARTERS } from '@aether/shared';
import { MonImg } from './components.js';
import { useNet, connectWallet } from '../net/net.js';

export function TitleScreen() {
  const save = useGame((s) => s.save);
  const continueGame = useGame((s) => s.continueGame);
  const startNewGame = useGame((s) => s.startNewGame);
  const status = useNet((s) => s.status);
  const wallet = useNet((s) => s.wallet);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const hasSave = !!save && save.party.length > 0;
  const short = wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : null;

  return (
    <div className="title-screen">
      <h1 className="title-logo">Aetherbeasts</h1>
      <div className="title-tag">Bind · Battle · Become</div>
      <div className="title-mons">
        {STARTERS.map((id) => (
          <MonImg key={id} speciesId={id} size={56} />
        ))}
      </div>

      {!naming ? (
        <div className="title-row">
          <button className="btn primary" onClick={() => setNaming(true)}>
            New Journey
          </button>
          <button className="btn" disabled={!hasSave} onClick={continueGame}>
            Continue{hasSave ? ` — ${save!.playerName}` : ''}
          </button>
        </div>
      ) : (
        <div className="title-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <input
            className="field"
            autoFocus
            placeholder="Your tamer name"
            maxLength={14}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startNewGame(name)}
          />
          <div className="title-row">
            <button className="btn primary" disabled={!name.trim()} onClick={() => startNewGame(name)}>
              Begin
            </button>
            <button className="btn ghost" onClick={() => setNaming(false)}>
              Back
            </button>
          </div>
        </div>
      )}
      <div className="title-net">
        <span className={'net-dot ' + status} />
        <span className="muted small">
          {status === 'online' ? 'Arena online — PvP ready' : status === 'connecting' ? 'Connecting to arena…' : 'Arena offline (single-player ready)'}
        </span>
        {short ? (
          <span className="wallet-chip" title={wallet ?? ''}>🦊 {short}</span>
        ) : (
          <button className="btn ghost small" onClick={connectWallet}>🦊 Connect Phantom</button>
        )}
      </div>

      <div className="muted small" style={{ marginTop: 14 }}>
        Move: WASD / Arrows · Interact: Space · Menu: M · Bag: B
      </div>
    </div>
  );
}
