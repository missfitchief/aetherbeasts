import { useState, useEffect } from 'react';
import { useNet } from '../../net/net.js';
import { loginClaim } from '../../net/net.js';
import { useGame } from '../../state/store.js';
import { Modal } from '../Panels.js';
import { monSpriteUrl } from '../../game/assets.js';

/** 7-day login reward calendar. Reads the server-owned cycle from the quest view. */
export function LoginCalendarPanel() {
  const closePanel = useGame((s) => s.closePanel);
  const qv = useNet((s) => s.questView);
  const login = qv?.login;
  // Captured at click time (the cycle advances once the server confirms).
  const [claimedLabel, setClaimedLabel] = useState<string | null>(null);

  // Show the "Claimed!" confirmation briefly, then close the modal on its own.
  useEffect(() => {
    if (claimedLabel === null) return;
    const t = setTimeout(closePanel, 1500);
    return () => clearTimeout(t);
  }, [claimedLabel, closePanel]);

  const onClaim = () => {
    if (!login?.claimableToday || claimedLabel !== null) return;
    setClaimedLabel(login.rewards[login.cycleDay]?.label ?? 'your reward');
    loginClaim();
  };

  return (
    <Modal title="🗓️ Daily Login" onClose={closePanel}>
      {!login ? (
        <div className="muted">Connect your wallet to claim daily rewards.</div>
      ) : (
        <div>
          <div className="small muted" style={{ marginBottom: 8 }}>
            Log in each day for a monster — keep the streak going for the Day 7 ★ rare!
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, margin: '6px 0 12px' }}>
            {login.rewards.map((r, i) => {
              const day = i + 1;
              // While the confirmation shows, light up the day we just claimed too.
              const claimed = day <= login.cycleDay || (claimedLabel !== null && day === login.cycleDay + 1);
              const day7 = day === 7;
              return (
                <div
                  key={day}
                  style={{
                    border: `2px solid ${day7 ? '#ffcf5c' : '#3a4a66'}`,
                    borderRadius: 6,
                    padding: '6px 3px',
                    textAlign: 'center',
                    background: claimed ? 'rgba(83,215,105,0.15)' : '#16243c',
                    opacity: claimed ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontSize: 11, color: day7 ? '#ffcf5c' : '#ffd166', fontWeight: 700 }}>Day {day}</div>
                  {r.speciesId ? (
                    <img src={monSpriteUrl(r.speciesId)} alt={r.label} style={{ width: 32, height: 32, imageRendering: 'pixelated', objectFit: 'contain', display: 'block', margin: '2px auto' }} />
                  ) : (
                    <div style={{ height: 32 }} />
                  )}
                  <div style={{ fontSize: 9, color: day7 ? '#ffcf5c' : '#cbd5e1', minHeight: 14, lineHeight: 1.2, fontWeight: day7 ? 700 : 400 }}>{r.label}</div>
                  <div style={{ color: '#53d769', height: 12 }}>{claimed ? '✓' : ''}</div>
                </div>
              );
            })}
          </div>

          {claimedLabel !== null ? (
            <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
              <div style={{ fontSize: 30, lineHeight: 1, color: '#53d769' }}>✓</div>
              <div style={{ color: '#53d769', fontWeight: 700 }}>Claimed!</div>
              <div className="small muted">{claimedLabel}</div>
            </div>
          ) : (
            <button className="btn big gold" disabled={!login.claimableToday} onClick={onClaim}>
              {login.claimableToday ? "✦ Claim today's reward!" : 'Come back tomorrow'}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
