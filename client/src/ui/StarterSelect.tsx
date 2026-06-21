import { useState } from 'react';
import { STARTERS, getSpecies } from '@aether/shared';
import { useGame } from '../state/store.js';
import { MonImg, TypeChip } from './components.js';

const BLURB: Record<string, string> = {
  drachnid: 'A fierce spider-dragon chimaera. High Magic — a glass cannon that hits hard.',
  draquatic: 'A nimble deep-sea dragon. Balanced and quick on its feet.',
  plaugspout: 'A toxic amanita sprout. A bulky wall that poisons all who approach.',
};

export function StarterSelect() {
  const pickStarter = useGame((s) => s.pickStarter);
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div className="title-screen">
      <h1 className="title-logo" style={{ fontSize: 'clamp(28px,5vw,52px)' }}>
        Choose your first Aetherbeast
      </h1>
      <div className="muted" style={{ marginTop: -6 }}>
        Professor Wren offers you three companions for the road ahead.
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
        {STARTERS.map((id) => {
          const sp = getSpecies(id);
          return (
            <div
              key={id}
              className="card party-card"
              style={{ width: 220, padding: 16, borderColor: hover === id ? 'var(--accent)' : undefined }}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => pickStarter(id)}
            >
              <MonImg speciesId={id} size={120} />
              <div className="nm" style={{ fontSize: 18 }}>
                {sp.name}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {sp.types.map((t) => (
                  <TypeChip key={t} type={t} />
                ))}
              </div>
              <div className="muted small" style={{ minHeight: 54, marginTop: 6, textAlign: 'center' }}>
                {BLURB[id]}
              </div>
              <button className="btn primary" style={{ marginTop: 6 }}>
                Choose {sp.name}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
