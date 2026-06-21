import {
  getSpecies, getMove, displayName, allStats, expProgress,
  ivTotalPercent, CORE_STATS, STAT_TLA, TYPE_COLOR, dupesFor, MAX_STARS, type Creature,
} from '@aether/shared';
import { useGame } from '../../state/store.js';
import { Modal } from '../Panels.js';
import { MonImg, TypeChip } from '../components.js';

const STAT_MAX = 200;

export function SummaryPanel() {
  const save = useGame((s) => s.save);
  const summary = useGame((s) => s.summary);
  const closePanel = useGame((s) => s.closePanel);
  const openPanel = useGame((s) => s.openPanel);
  const deposit = useGame((s) => s.depositCreature);
  const withdraw = useGame((s) => s.withdrawCreature);
  const awaken = useGame((s) => s.awaken);
  const showToast = useGame((s) => s.showToast);
  if (!save || !summary) return null;

  const c: Creature | undefined =
    summary.source === 'party'
      ? save.party.find((x) => x.uid === summary.uid)
      : (save.box.find((x) => x?.uid === summary.uid) ?? undefined);
  if (!c) return null;

  const sp = getSpecies(c.speciesId);
  const stats = allStats(c);
  const stars = c.stars ?? 0;
  const dupes = dupesFor(save, c.uid);
  const back = () => openPanel(summary.source === 'party' ? 'party' : 'box');

  return (
    <Modal title={`${displayName(c)} · Lv ${c.level}`} onClose={closePanel}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <MonImg speciesId={c.speciesId} size={150} shiny={c.shiny} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6 }}>
            {sp.types.map((t) => (
              <TypeChip key={t} type={t} />
            ))}
          </div>
          <div style={{ marginTop: 8, color: '#ffcf5c', letterSpacing: 2, fontSize: 15 }}>
            {'★'.repeat(stars)}<span style={{ color: '#4a5364' }}>{'★'.repeat(MAX_STARS - stars)}</span>
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {c.nature} nature · {c.ability}
            <br />
            IV potential {ivTotalPercent(c)}%{c.shiny ? ' · ✨ Shiny' : ''}
            {stars > 0 ? <><br />Awakened +{stars * 8}% stats</> : null}
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="muted small">EXP to next</div>
            <div className="stat-bar" style={{ width: 150 }}>
              <div style={{ width: `${expProgress(c) * 100}%` }} />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="muted small" style={{ marginBottom: 6 }}>
            BASE STATS
          </div>
          {CORE_STATS.map((s) => (
            <div className="stat-row" key={s}>
              <span className="lbl">{STAT_TLA[s]}</span>
              <span className="stat-bar">
                <div style={{ width: `${Math.min(100, (stats[s] / STAT_MAX) * 100)}%` }} />
              </span>
              <span className="stat-val">{stats[s]}</span>
            </div>
          ))}

          <div className="muted small" style={{ margin: '12px 0 6px' }}>
            MOVES
          </div>
          {c.moves.map((mid, i) => {
            const m = getMove(mid);
            return (
              <div className="row" key={mid} style={{ marginBottom: 6, padding: '8px 10px' }}>
                <span className="type-chip" style={{ background: TYPE_COLOR[m.type] }}>
                  {m.type}
                </span>
                <span className="grow" style={{ fontWeight: 600 }}>
                  {m.name}
                </span>
                <span className="muted small">
                  {m.category === 'support' ? 'SUP' : `PWR ${m.power}`} · PP {c.pp[i]}/{m.pp}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn ghost" onClick={back}>
          ← Back
        </button>
        <button
          className="btn"
          disabled={stars >= MAX_STARS || dupes.length === 0}
          title={dupes.length === 0 ? `Need a duplicate ${sp.name} to awaken` : `Feeds one ${sp.name}`}
          onClick={() => {
            if (awaken(c.uid, dupes[0].uid)) showToast(`${displayName(c)} awakened to ${stars + 1}★! +8% stats.`);
            else showToast('Cannot awaken further.');
          }}
        >
          ★ Awaken{stars >= MAX_STARS ? ' (MAX)' : dupes.length ? ` (${dupes.length})` : ''}
        </button>
        <div style={{ flex: 1 }} />
        {summary.source === 'party' ? (
          <button
            className="btn"
            disabled={save.party.length <= 1}
            onClick={() => {
              if (deposit(c.uid)) {
                showToast(`${displayName(c)} sent to the Spirit Realm.`);
                openPanel('party');
              } else showToast('Your team must keep at least one Aetherbeast.');
            }}
          >
            🌀 Deposit
          </button>
        ) : (
          <button
            className="btn primary"
            disabled={save.party.length >= 6}
            onClick={() => {
              if (withdraw(c.uid)) {
                showToast(`${displayName(c)} joined your team.`);
                openPanel('box');
              } else showToast('Your team is full (6).');
            }}
          >
            ⬆ Withdraw
          </button>
        )}
      </div>
    </Modal>
  );
}
