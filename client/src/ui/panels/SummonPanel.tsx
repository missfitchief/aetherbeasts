import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  BANNERS, getBanner, summonCost, getSpecies,
  type SummonReport, type GachaTier, type Currency,
} from '@aether/shared';
import { useGame } from '../../state/store.js';
import { useNet } from '../../net/net.js';
import { premiumSummon } from '../../net/net.js';
import { audio } from '../../game/audio.js';
import { Modal } from '../Panels.js';
import { MonImg } from '../components.js';

const TIER_META: Record<GachaTier, { label: string; color: string; glow: string }> = {
  5: { label: '★★★★★', color: '#ffcf5c', glow: 'rgba(255,207,92,0.75)' },
  4: { label: '★★★★', color: '#c792ea', glow: 'rgba(199,146,234,0.6)' },
  3: { label: '★★★', color: '#7fb2e6', glow: 'rgba(127,178,230,0.45)' },
};

export function SummonPanel() {
  const save = useGame((s) => s.save);
  const summon = useGame((s) => s.summon);
  const closePanel = useGame((s) => s.closePanel);
  const showToast = useGame((s) => s.showToast);
  const summonPhase = useNet((s) => s.summonPhase);
  const summonReport = useNet((s) => s.summonReport);
  const onchainSummon = useNet((s) => s.onchainSummon);
  const clearSummonReport = useNet((s) => s.clearSummonReport);
  const [bannerId, setBannerId] = useState('featured');
  const [report, setReport] = useState<SummonReport | null>(null);
  if (!save) return null;

  const busy = summonPhase !== 'idle';
  const phaseLabel =
    summonPhase === 'quoting' ? 'Pricing in $AETHER…'
    : summonPhase === 'signing' ? 'Approve the payment in your wallet…'
    : summonPhase === 'verifying' ? 'Confirming on-chain…'
    : null;
  // One reveal for either path — free ◈ pulls (local) or paid $AETHER pulls (server).
  const activeReport = report ?? summonReport;
  const closeReveal = () => { setReport(null); clearSummonReport(); };

  const banner = getBanner(bannerId);
  const cost1 = summonCost(bannerId, 1);
  const cost10 = summonCost(bannerId, 10);
  const balance = (_cur: Currency) => save.aether;
  const icon = (_cur: Currency) => '◈';
  const pity = save.gachaPity?.[bannerId]?.since5 ?? 0;

  const pull = (count: number) => {
    const r = summon(bannerId, count);
    if (!r) {
      audio.sfx('sfx_buzzer', 0.3);
      showToast('Not enough $AETHER.');
      return;
    }
    setReport(r); // the reveal sequence (portal → cards) owns the audio
  };

  return (
    <Modal title="✦ The Aether Rift" onClose={closePanel}>
      <div className="rift">
        <div className="rift-curr">
          <span className="rift-bal">◈ {save.aether.toLocaleString()} $AETHER</span>
          <span className="muted small">Earn $AETHER from battles, catches & duplicates.</span>
        </div>

        <div className="rift-tabs">
          {BANNERS.map((b) => (
            <button
              key={b.id}
              className={'rift-tab' + (b.id === bannerId ? ' active' : '')}
              onClick={() => setBannerId(b.id)}
            >
              {b.name}
            </button>
          ))}
        </div>

        <div className="rift-splash">
          {banner.featured5 && (
            <div className="rift-feat" style={{ boxShadow: `0 0 44px ${TIER_META[5].glow}` }}>
              <MonImg speciesId={banner.featured5} size={132} />
            </div>
          )}
          <div className="rift-info">
            <div className="rift-name">{banner.name}</div>
            <div className="muted small">{banner.blurb}</div>
            <div className="rift-rates">5★ 3% · 4★ 12% · 3★ 85%</div>
            <div className="small muted">Pity: guaranteed 5★ by 80 pulls — you're at {pity}/80.</div>
            {banner.featured5 && (
              <div className="small">
                Featured 5★: <b style={{ color: TIER_META[5].color }}>{getSpecies(banner.featured5).name}</b>
              </div>
            )}
          </div>
        </div>

        <div className="rift-actions">
          <button className="btn big" disabled={busy || balance(cost1.currency) < cost1.amount} onClick={() => pull(1)}>
            Summon ×1 <span className="cost">{icon(cost1.currency)} {cost1.amount.toLocaleString()}</span>
          </button>
          <button className="btn big gold" disabled={busy || balance(cost10.currency) < cost10.amount} onClick={() => pull(10)}>
            Summon ×10 <span className="cost">{icon(cost10.currency)} {cost10.amount.toLocaleString()}</span>
          </button>
        </div>

        {onchainSummon && (
          <div className="rift-premium">
            <div className="small muted">Out of ◈? Skip the grind — summon instantly with your <b>$AETHER</b> token:</div>
            <div className="rift-actions">
              <button className="btn" disabled={busy} onClick={() => premiumSummon(bannerId, 1)}>Pay $AETHER ×1</button>
              <button className="btn gold" disabled={busy} onClick={() => premiumSummon(bannerId, 10)}>Pay $AETHER ×10</button>
            </div>
            {phaseLabel && <div className="small premium-status">{phaseLabel}</div>}
          </div>
        )}
      </div>

      {activeReport && createPortal(
        <SummonReveal report={activeReport} onClose={closeReveal} />,
        document.body,
      )}
    </Modal>
  );
}

function SummonReveal({ report, onClose }: { report: SummonReport; onClose: () => void }) {
  const [phase, setPhase] = useState<'portal' | 'cards'>('portal');
  const top = report.results.reduce<GachaTier>((m, r) => (r.tier > m ? r.tier : m), 3);

  useEffect(() => {
    audio.sfx('sfx_magicstar', 0.5);
    const t = setTimeout(() => {
      setPhase('cards');
      audio.sfx(top === 5 ? 'jingle_evolve' : top === 4 ? 'jingle_levelup' : 'sfx_ok', 0.6);
    }, 1100);
    return () => clearTimeout(t);
  }, [top]);

  const rarity = top === 5 ? 'five' : top === 4 ? 'four' : 'three';

  if (phase === 'portal') {
    return (
      <div className="reveal-overlay">
        <div className={`summon-egg-stage ${rarity}`}>
          <div className="egg-rays" />
          <div className="summon-egg">
            <span className="egg-spot a" /><span className="egg-spot b" /><span className="egg-shine" />
          </div>
          <div className="portal-label">Summoning…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="reveal-overlay" onClick={onClose}>
      {top === 5 && <div className="reveal-flash" />}
      <div className="reveal-grid" onClick={(e) => e.stopPropagation()}>
        {report.results.map((r, i) => {
          const m = TIER_META[r.tier];
          return (
            <div
              key={i}
              className={`reveal-card tier${r.tier}`}
              style={{ animationDelay: `${i * 90}ms`, borderColor: m.color, boxShadow: `0 0 14px ${m.glow}` }}
            >
              <MonImg speciesId={r.speciesId} size={62} shiny={r.shiny} />
              <div className="reveal-stars" style={{ color: m.color }}>{m.label}</div>
              <div className="reveal-name">{getSpecies(r.speciesId).name}</div>
              {r.isDupe
                ? <div className="reveal-badge dupe">DUPE +{r.aetherAwarded}◈</div>
                : <div className="reveal-badge new">NEW</div>}
              {r.shiny && <div className="reveal-shiny">✨ SHINY</div>}
            </div>
          );
        })}
      </div>
      <div className="reveal-foot">
        {report.aetherGained > 0 && <span className="muted small">Duplicates refunded ◈ {report.aetherGained} $AETHER.</span>}
        <button className="btn" onClick={onClose}>Continue</button>
      </div>
    </div>
  );
}
