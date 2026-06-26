import { useEffect, useState } from 'react';
import { useNet, requestExpedition, startExpedition, claimExpedition } from '../../net/net.js';
import { useGame } from '../../state/store.js';
import { Modal } from '../Panels.js';
import { EXPEDITIONS, getExpedition, expeditionMs, expeditionReward } from '@aether/shared';

/** Format a remaining duration as a compact countdown (e.g. "3h 12m", "45s"). */
function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

/**
 * Expeditions — idle / passive PvE income. Send the team out for a real-time
 * duration, then claim ◈ (always) and ◆ (once the economy is live). The server
 * owns the timer + the LUMEN grant; this panel is a read-only view + two actions.
 */
export function ExpeditionPanel() {
  const closePanel = useGame((s) => s.closePanel);
  const party = useGame((s) => s.save?.party ?? []);
  const active = useNet((s) => s.expedition);
  // ◆ is meaningless to the player until they can cash out or wager it.
  const lumenLive = useNet((s) => s.exchangeEnabled || s.stakedPvpEnabled);
  const [, setTick] = useState(0);

  useEffect(() => { requestExpedition(); }, []);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000); // drive the live countdown
    return () => clearInterval(id);
  }, []);

  const topLevel = party.length ? Math.max(...party.map((c) => c.level)) : 1;

  if (active) {
    const tier = getExpedition(active.tier);
    const reward = tier ? expeditionReward(tier, topLevel) : { glint: 0, lumen: 0 };
    const readyAt = active.startedAt + (tier ? expeditionMs(tier) : 0);
    const left = readyAt - Date.now();
    const ready = left <= 0;
    return (
      <Modal title="🧭 Expeditions" onClose={closePanel}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: 40, lineHeight: 1 }}>{tier?.emoji ?? '🧭'}</div>
          <div style={{ fontWeight: 700, color: '#ffd166', margin: '4px 0' }}>{tier?.label ?? 'Expedition'}</div>
          {ready ? (
            <div style={{ color: '#53d769', fontWeight: 700, margin: '6px 0' }}>Your team is back!</div>
          ) : (
            <div className="muted" style={{ margin: '6px 0' }}>
              Back in <b style={{ color: '#cbd5e1' }}>{fmt(left)}</b>
            </div>
          )}
          <div className="small muted" style={{ marginBottom: 10 }}>
            Haul: <b style={{ color: '#9be7a0' }}>+{reward.glint} ◈</b>
            {lumenLive && reward.lumen > 0 ? <> · <b style={{ color: '#7cc4ff' }}>+{reward.lumen} ◆</b></> : null}
          </div>
          <button className="btn big gold" disabled={!ready} onClick={() => ready && claimExpedition()}>
            {ready ? '✦ Claim the haul!' : 'On expedition…'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="🧭 Expeditions" onClose={closePanel}>
      <div className="small muted" style={{ marginBottom: 10 }}>
        Send your team into the field to earn ◈{lumenLive ? ' and ◆' : ''} while you're away. Stronger teams haul more.
      </div>
      {party.length === 0 ? (
        <div className="muted">Catch a beast first — you need a team to send out.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {EXPEDITIONS.map((t) => {
            const reward = expeditionReward(t, topLevel);
            return (
              <div key={t.id} style={{ border: '2px solid #3a4a66', borderRadius: 8, padding: '8px 10px', background: '#16243c', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 28 }}>{t.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#ffd166' }}>
                    {t.label} <span className="small muted">· {t.hours}h</span>
                  </div>
                  <div className="small muted">{t.blurb}</div>
                  <div className="small" style={{ color: '#9be7a0' }}>
                    +{reward.glint} ◈
                    {lumenLive && reward.lumen > 0 ? <span style={{ color: '#7cc4ff' }}> · +{reward.lumen} ◆</span> : null}
                  </div>
                </div>
                <button className="btn" onClick={() => startExpedition(t.id)}>Send</button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
