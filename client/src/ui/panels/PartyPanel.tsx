import { useState } from 'react';
import { useGame, type SlotLoc } from '../../state/store.js';
import { displayName, type Creature } from '@aether/shared';
import { Modal } from '../Panels.js';
import { MonImg } from '../components.js';

export function PartyPanel() {
  const save = useGame((s) => s.save);
  const move = useGame((s) => s.moveCreature);
  const openSummary = useGame((s) => s.openSummary);
  const closePanel = useGame((s) => s.closePanel);
  const [drag, setDrag] = useState<SlotLoc | null>(null);
  const [over, setOver] = useState<string | null>(null);
  if (!save) return null;

  const firstEmptyBox = save.box.findIndex((c) => c === null);
  const boxFilled = save.box
    .map((c, i) => ({ c, i }))
    .filter((x): x is { c: Creature; i: number } => x.c !== null);

  const drop = (to: SlotLoc) => { if (drag) move(drag, to); setDrag(null); setOver(null); };
  const keyOf = (l: SlotLoc) => `${l.zone}-${l.index}`;

  const beast = (c: Creature, loc: SlotLoc) => {
    const k = keyOf(loc);
    const isDragging = drag && drag.zone === loc.zone && drag.index === loc.index;
    return (
      <div
        key={c.uid}
        className={`beast-cell${isDragging ? ' dragging' : ''}${over === k ? ' over' : ''}`}
        draggable
        onDragStart={() => setDrag(loc)}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        onDragOver={(e) => { e.preventDefault(); setOver(k); }}
        onDragLeave={() => setOver((o) => (o === k ? null : o))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(loc); }}
        onClick={() => openSummary({ uid: c.uid, source: loc.zone })}
        title={`${displayName(c)} — drag to swap, click for details`}
      >
        {loc.zone === 'party' && loc.index === 0 && <span className="bc-lead">LEAD</span>}
        <MonImg speciesId={c.speciesId} size={54} shiny={c.shiny} />
        <div className="bc-nm">{displayName(c)}</div>
        <div className="bc-lv">Lv {c.level}{c.stars ? <span className="bc-star"> {'★'.repeat(c.stars)}</span> : null}</div>
      </div>
    );
  };

  const emptySlot = (loc: SlotLoc) => {
    const k = keyOf(loc);
    return (
      <div
        key={k}
        className={`beast-cell empty${over === k ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(k); }}
        onDragLeave={() => setOver((o) => (o === k ? null : o))}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(loc); }}
      >
        ＋
      </div>
    );
  };

  return (
    <Modal title="Team & Storage" onClose={closePanel}>
      <div className="muted small" style={{ marginBottom: 8 }}>
        Drag a beast onto a slot to swap them. The <b>first</b> slot (LEAD) is sent out first each battle. Click a beast for its summary &amp; awaken.
      </div>

      <div className="team-label">TEAM · {save.party.length}/6</div>
      <div className="beast-row">
        {Array.from({ length: 6 }, (_, i) => {
          const c = save.party[i];
          return c ? beast(c, { zone: 'party', index: i }) : emptySlot({ zone: 'party', index: i });
        })}
      </div>

      <div className="team-label">STORAGE · {boxFilled.length}</div>
      <div
        className={`beast-storage${over === 'storage' ? ' over' : ''}`}
        onDragOver={(e) => { if (drag?.zone === 'party' && firstEmptyBox >= 0) { e.preventDefault(); setOver('storage'); } }}
        onDragLeave={() => setOver((o) => (o === 'storage' ? null : o))}
        onDrop={(e) => { e.preventDefault(); if (drag?.zone === 'party' && firstEmptyBox >= 0) drop({ zone: 'box', index: firstEmptyBox }); }}
      >
        {boxFilled.length
          ? boxFilled.map(({ c, i }) => beast(c, { zone: 'box', index: i }))
          : <div className="muted small" style={{ gridColumn: '1 / -1', alignSelf: 'center' }}>No stored beasts — drag one here to deposit, or catch &amp; summon more.</div>}
      </div>
    </Modal>
  );
}
