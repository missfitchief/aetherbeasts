import { useState } from 'react';
import { BANNERS, GACHA_ODDS, previewSummon, getSpecies } from '@aether/shared';
import { useGame } from '../../state/store.js';
import { Modal } from '../Panels.js';
import { MonImg } from '../components.js';

const TIER_COLOR: Record<number, string> = { 5: '#ffcf5c', 4: '#c792ea', 3: '#7fb2e6' };
const stars = (t: number) => '★'.repeat(t);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/**
 * Provably-fair transparency: publishes the exact odds (sourced from the engine,
 * so they can never drift from reality) and lets the player reproduce any seeded
 * pull right here via previewSummon — the same deterministic code the game runs.
 */
export function FairnessPanel() {
  const openPanel = useGame((s) => s.openPanel);
  const [bannerId, setBannerId] = useState(BANNERS[0].id);
  const [seed, setSeed] = useState('12345');
  const [count, setCount] = useState(10);

  const seedNum = Math.max(0, Math.floor(Number(seed) || 0));
  const preview = previewSummon(bannerId, seedNum, count, 0, 0);

  return (
    <Modal title="🔒 Provably Fair" onClose={() => openPanel('summon')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 540 }}>
        <p className="small muted" style={{ margin: 0 }}>
          Every summon is produced by an open, deterministic algorithm from a single random{' '}
          <b>seed</b>. After each pull we show you that seed — paste it below to reproduce the
          exact result yourself. Nothing about your pull is decided after you tap Summon.
        </p>

        <div>
          <h4 style={{ margin: '0 0 6px' }}>Published odds</h4>
          <div style={{ display: 'flex', gap: 18 }}>
            <span>5★ <b style={{ color: TIER_COLOR[5] }}>{pct(GACHA_ODDS.rate5)}</b></span>
            <span>4★ <b style={{ color: TIER_COLOR[4] }}>{pct(GACHA_ODDS.rate4)}</b></span>
            <span>3★ <b style={{ color: TIER_COLOR[3] }}>{pct(GACHA_ODDS.rate3)}</b></span>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            4★ floor every {GACHA_ODDS.pity4Floor} pulls · soft 5★ pity from {GACHA_ODDS.softPity5From} ·
            guaranteed 5★ by {GACHA_ODDS.hardPity5}. Featured units take {pct(GACHA_ODDS.featuredShare)} of their tier's pulls.
          </div>
        </div>

        <div>
          <h4 style={{ margin: '0 0 6px' }}>Verify a pull</h4>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={bannerId} onChange={(e) => setBannerId(e.target.value)}>
              {BANNERS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <label className="small">seed{' '}
              <input value={seed} onChange={(e) => setSeed(e.target.value)} style={{ width: 120 }} inputMode="numeric" />
            </label>
            <label className="small">pulls{' '}
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={10}>10</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {preview.map((p, i) => (
              <div key={i} style={{ textAlign: 'center', width: 66 }}>
                <MonImg speciesId={p.speciesId} size={48} shiny={p.shiny} />
                <div className="small" style={{ color: TIER_COLOR[p.tier], lineHeight: 1 }}>{stars(p.tier)}</div>
                <div className="small">{getSpecies(p.speciesId).name}</div>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            The same seed always yields these exact results — recompute it anywhere with the open-source engine.
          </p>
        </div>

        <p className="small muted" style={{ margin: 0 }}>
          Paid <b>$AETHER</b> pulls (at token launch) add a full commit-reveal: the server publishes
          a hash of its seed <i>before</i> you pull and reveals the seed after, verifiable on-chain.
        </p>
      </div>
    </Modal>
  );
}
