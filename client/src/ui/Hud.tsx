import { useEffect, useState } from 'react';
import { dexCounts, wildCount, wildNextInMs } from '@aether/shared';
import { useGame } from '../state/store.js';
import { useNet } from '../net/net.js';

function objective(caught: number, inForest: boolean): string {
  if (caught <= 1) return inForest ? 'Walk the tall grass to find a wild beast' : 'Head south to Whisperwood Route';
  if (caught < 4) return 'Weaken a wild beast, then throw a Pact Stone';
  return 'Explore deeper — tougher beasts await';
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function Hud() {
  const save = useGame((s) => s.save);
  const openPanel = useGame((s) => s.openPanel);
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const panel = useGame((s) => s.panel);
  const profile = useNet((s) => s.profile);
  const balance = useNet((s) => s.balance);
  const online = useNet((s) => s.status === 'online');
  const setArena = useNet((s) => s.setArena);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000); // live wild-beast countdown
    return () => clearInterval(id);
  }, []);
  if (!save) return null;

  const inside = (save.position?.map ?? 'world') !== 'world';
  const inForest = (save.position?.y ?? 0) >= 24;
  const { caught } = dexCounts(save);
  const now = Date.now();
  const wildReady = wildCount(save, now) > 0;
  const wildNext = wildNextInMs(save, now);

  return (
    <div className="hud">
      <div className="pill">{inside ? '🚪 Indoors' : `🧭 ${inForest ? 'Whisperwood Route' : 'Aether Town'}`}</div>
      {inside && <div className="pill esc-hint">⎋ Press ESC to leave</div>}
      <div className="pill">◈ {save.aether.toLocaleString()} $AETHER</div>
      {profile && <div className="pill" title="Battle Credits — staked in PvP, never cashed out">⚔ {profile.credits.toLocaleString()} BC</div>}
      {balance && <div className="pill" title={`On-chain $AETHER balance (${balance.mode})`}>⛓ {balance.amount.toLocaleString()} {balance.mode === 'sim' ? '$AETHER·sim' : '$AETHER'}</div>}
      <div className={'pill wild-pill' + (wildReady ? ' ready' : '')} title="A wild beast is roaming the grass when ready; encounter it to reset the timer.">
        {wildReady ? '🐾 Wild beast roaming!' : `🐾 Next wild: ${fmtCountdown(wildNext)}`}
      </div>
      <div className="pill objective">🎯 {objective(caught, inForest)}</div>
      <div className="spacer" />
      {!panel && (
        <>
          <button className={'icon-btn arena-btn' + (online ? '' : ' off')} title={online ? 'The Aether Arena — PvP' : 'Arena server offline'} onClick={() => setArena(true)}>⚔</button>
          <button className="icon-btn rift-btn" title="The Aether Rift — summon beasts" onClick={() => openPanel('summon')}>✦</button>
          <button className="icon-btn" title="Bag (B)" onClick={() => openPanel('bag')}>🎒</button>
          <button className="icon-btn" title="Menu (M)" onClick={() => openPanel('menu')}>☰</button>
          <button className="icon-btn" title="Mute" onClick={toggleMute}>{muted ? '🔇' : '🔊'}</button>
        </>
      )}
    </div>
  );
}
