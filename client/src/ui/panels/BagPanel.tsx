import { useState } from 'react';
import {
  getItem, statOf, removeItem, displayName, type ItemData,
} from '@aether/shared';
import { useGame } from '../../state/store.js';
import { audio } from '../../game/audio.js';
import { Modal } from '../Panels.js';
import { MonImg } from '../components.js';

export function BagPanel() {
  const save = useGame((s) => s.save);
  const mutate = useGame((s) => s.mutate);
  const closePanel = useGame((s) => s.closePanel);
  const showToast = useGame((s) => s.showToast);
  const [using, setUsing] = useState<ItemData | null>(null);
  if (!save) return null;

  const fieldUsable = (it: ItemData) => it.effect.kind === 'heal-hp' || it.effect.kind === 'cure';

  const applyTo = (it: ItemData, uid: string) => {
    const target = save.party.find((c) => c.uid === uid);
    if (!target) return;
    let ok = false;
    if (it.effect.kind === 'heal-hp') {
      const max = statOf(target, 'mhp');
      if (target.currentHp > 0 && target.currentHp < max) {
        mutate((s) => {
          const t = s.party.find((c) => c.uid === uid)!;
          t.currentHp = Math.min(max, t.currentHp + (it.effect as { amount: number }).amount);
          removeItem(s, it.id, 1);
        });
        ok = true;
      }
    } else if (it.effect.kind === 'cure') {
      const want = it.effect.ailment;
      if (target.ailment && (want === null || want === target.ailment)) {
        mutate((s) => {
          const t = s.party.find((c) => c.uid === uid)!;
          t.ailment = null;
          removeItem(s, it.id, 1);
        });
        ok = true;
      }
    }
    if (ok) {
      audio.sfx('sfx_heal', 0.5);
      showToast(`Used ${it.name} on ${displayName(target)}.`);
    } else {
      showToast('It would have no effect.');
    }
    setUsing(null);
  };

  return (
    <Modal title={`Bag · ◈ ${save.aether.toLocaleString()} $AETHER`} onClose={closePanel}>
      {using ? (
        <div>
          <div className="muted" style={{ marginBottom: 10 }}>
            Use <b>{using.name}</b> on which Aetherbeast?
          </div>
          <div className="party-grid">
            {save.party.map((c) => (
              <div key={c.uid} className="card party-card" onClick={() => applyTo(using, c.uid)}>
                <MonImg speciesId={c.speciesId} size={64} shiny={c.shiny} />
                <div className="nm small">{displayName(c)}</div>
                <div className="lv">
                  {c.currentHp}/{statOf(c, 'mhp')} HP {c.ailment ? `· ${c.ailment}` : ''}
                </div>
              </div>
            ))}
          </div>
          <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setUsing(null)}>
            ← Back
          </button>
        </div>
      ) : (
        <>
          {save.bag.length === 0 && <div className="muted">Your bag is empty.</div>}
          {save.bag.map((slot) => {
            const it = getItem(slot.itemId);
            return (
              <div className="row" key={slot.itemId}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>
                    {it.name} <span className="muted small">×{slot.qty}</span>
                  </div>
                  <div className="muted small">{it.desc}</div>
                </div>
                {fieldUsable(it) && (
                  <button className="btn" onClick={() => setUsing(it)}>
                    Use
                  </button>
                )}
                {it.category === 'catch' && <span className="muted small">Battle only</span>}
              </div>
            );
          })}
        </>
      )}
    </Modal>
  );
}
