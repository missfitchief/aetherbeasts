import { useState, useEffect } from 'react';
import {
  incubatorReady, incubatorNextInMs, incubatorCap, incubatorIntervalMin, trainerLevel,
  getSpecies, type Creature,
} from '@aether/shared';
import { useGame } from '../../state/store.js';
import { audio } from '../../game/audio.js';
import { Modal } from '../Panels.js';
import { MonImg } from '../components.js';

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

export function IncubatorPanel() {
  const save = useGame((s) => s.save);
  const claim = useGame((s) => s.claimIncubator);
  const closePanel = useGame((s) => s.closePanel);
  const [, setTick] = useState(0);
  const [collected, setCollected] = useState<{ beasts: Creature[]; aether: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!save) return null;
  const now = Date.now();
  const lvl = trainerLevel(save);
  const cap = incubatorCap(lvl);
  const ready = incubatorReady(save, now);
  const interval = incubatorIntervalMin(lvl);
  const nextIn = incubatorNextInMs(save, now);

  const onCollect = () => {
    const res = claim();
    if (!res.beasts.length && !res.aether) return;
    setCollected(res);
    audio.sfx(res.beasts.some((b) => b.shiny) ? 'jingle_evolve' : 'sfx_ok', 0.5);
  };

  return (
    <Modal title="🥚 Aether Incubator" onClose={closePanel}>
      <div className="incu">
        <p className="muted small">
          Wild aether condenses into a new beast every <b>{interval} min</b>. They keep coming while
          you're away — up to <b>{cap}</b> can wait. As your team grows stronger, beasts arrive slower
          and the cap shrinks.
        </p>

        <div className="incu-eggs">
          {Array.from({ length: cap }).map((_, i) => (
            <span key={i} className={'incu-egg' + (i < ready ? ' filled' : '')}>🥚</span>
          ))}
        </div>

        <div className="incu-status">
          <div><span className="incu-big">{ready}</span><label>ready / {cap}</label></div>
          <div>
            <span className="incu-big">{ready >= cap ? 'FULL' : fmt(nextIn)}</span>
            <label>{ready >= cap ? 'cap reached' : 'next beast'}</label>
          </div>
          <div><span className="incu-big">Lv{lvl}</span><label>strongest</label></div>
        </div>

        <button className="btn big gold" disabled={ready <= 0} onClick={onCollect}>
          {ready > 0 ? `Collect ${ready} beast${ready > 1 ? 's' : ''}` : 'Nothing ready yet'}
        </button>
        <div className="muted small" style={{ textAlign: 'center', marginTop: 6 }}>
          New beasts land in your Box — raise them, build a team, or feed duplicates into Awaken.
        </div>

        {collected && (
          <div className="incu-reveal" onClick={() => setCollected(null)}>
            <div className="incu-reveal-head">Collected!</div>
            <div className="incu-reveal-grid">
              {collected.beasts.map((b) => (
                <div key={b.uid} className="incu-card">
                  <MonImg speciesId={b.speciesId} size={48} shiny={b.shiny} />
                  <div className="small">{getSpecies(b.speciesId).name}</div>
                  <div className="muted small">Lv{b.level}{b.shiny ? ' ✨' : ''}</div>
                </div>
              ))}
            </div>
            {collected.aether > 0 && (
              <div className="muted small">Box was full — released extras for +{collected.aether} ◈ $AETHER.</div>
            )}
            <button className="btn small" onClick={() => setCollected(null)}>OK</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
