import { useState } from 'react';
import {
  SPECIES_ORDER, getSpecies, dexCounts, TYPE_COLOR,
} from '@aether/shared';
import { useGame } from '../../state/store.js';
import { Modal } from '../Panels.js';
import { MonImg, TypeChip } from '../components.js';

export function DexPanel() {
  const save = useGame((s) => s.save);
  const closePanel = useGame((s) => s.closePanel);
  const [selected, setSelected] = useState<string | null>(null);
  if (!save) return null;

  const dc = dexCounts(save);
  const sel = selected ? getSpecies(selected) : null;
  const selEntry = selected ? save.dex[selected] : null;

  return (
    <Modal title={`Aether-Dex · ${dc.caught}/${dc.total} caught · ${dc.seen} seen`} onClose={closePanel}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <div className="dex-grid" style={{ flex: 1, minWidth: 280 }}>
          {SPECIES_ORDER.map((id, idx) => {
            const e = save.dex[id] ?? { seen: false, caught: false };
            const sp = getSpecies(id);
            return (
              <div
                key={id}
                className={`dex-cell ${e.seen ? '' : 'unseen'}`}
                onClick={() => e.seen && setSelected(id)}
                style={{ outline: selected === id ? '2px solid var(--accent)' : undefined, borderRadius: 8 }}
              >
                <div className="dex-num">#{String(idx + 1).padStart(2, '0')}</div>
                <MonImg speciesId={id} size={72} />
                <div className="dn">{e.seen ? sp.name : '???'}</div>
                <div className="small" style={{ color: e.caught ? 'var(--good)' : 'var(--muted)' }}>
                  {e.caught ? '● owned' : e.seen ? '○ seen' : ''}
                </div>
              </div>
            );
          })}
        </div>

        {sel && selEntry?.seen && (
          <div className="card" style={{ width: 250 }}>
            <div style={{ textAlign: 'center' }}>
              <MonImg speciesId={sel.id} size={120} />
              <h3 style={{ margin: '6px 0' }}>{sel.name}</h3>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                {sel.types.map((t) => (
                  <TypeChip key={t} type={t} />
                ))}
              </div>
            </div>
            <p className="small" style={{ lineHeight: 1.5 }}>
              {selEntry.caught ? sel.desc : 'Catch this Aetherbeast to reveal its lore.'}
            </p>
            {sel.evolutions.length > 0 && (
              <div className="small muted">
                Evolves into{' '}
                <span style={{ color: TYPE_COLOR[sel.types[0]] }}>
                  {getSpecies(sel.evolutions[0].into).name}
                </span>{' '}
                at Lv {String(sel.evolutions[0].arg)}.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
