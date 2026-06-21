import { getSpecies, displayName } from '@aether/shared';
import { useGame } from '../../state/store.js';
import { Modal } from '../Panels.js';
import { MonImg } from '../components.js';

export function BoxPanel() {
  const save = useGame((s) => s.save);
  const openSummary = useGame((s) => s.openSummary);
  const closePanel = useGame((s) => s.closePanel);
  if (!save) return null;

  const stored = save.box.map((c, i) => ({ c, i })).filter((x) => x.c !== null);

  return (
    <Modal title="Spirit Realm · Storage" onClose={closePanel}>
      <div className="muted small" style={{ marginBottom: 8 }}>
        Team ({save.party.length}/6)
      </div>
      <div className="party-grid" style={{ marginBottom: 16 }}>
        {save.party.map((c) => (
          <div key={c.uid} className="card party-card" onClick={() => openSummary({ uid: c.uid, source: 'party' })}>
            <MonImg speciesId={c.speciesId} size={64} shiny={c.shiny} />
            <div className="nm small">{displayName(c)}</div>
            <div className="lv">Lv {c.level}</div>
          </div>
        ))}
      </div>

      <div className="muted small" style={{ marginBottom: 8 }}>
        Stored ({stored.length})
      </div>
      {stored.length === 0 ? (
        <div className="muted">The Spirit Realm is empty. Catch more than six to fill it.</div>
      ) : (
        <div className="party-grid">
          {stored.map(({ c }) => (
            <div key={c!.uid} className="card party-card" onClick={() => openSummary({ uid: c!.uid, source: 'box' })}>
              <MonImg speciesId={c!.speciesId} size={64} shiny={c!.shiny} />
              <div className="nm small">{displayName(c!)}</div>
              <div className="lv">
                Lv {c!.level} · {getSpecies(c!.speciesId).name}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
