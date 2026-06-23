import { useNet } from '../../net/net.js';
import { loginClaim } from '../../net/net.js';
import { useGame } from '../../state/store.js';
import { Modal } from '../Panels.js';

/** 7-day login reward calendar. Reads the server-owned cycle from the quest view. */
export function LoginCalendarPanel() {
  const closePanel = useGame((s) => s.closePanel);
  const qv = useNet((s) => s.questView);
  const login = qv?.login;

  return (
    <Modal title="🗓️ Daily Login" onClose={closePanel}>
      {!login ? (
        <div className="muted">Connect your wallet to claim daily rewards.</div>
      ) : (
        <div>
          <div className="small muted" style={{ marginBottom: 8 }}>
            Log in each day for a reward — keep the streak going for the Day 7 prize!
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, margin: '6px 0 12px' }}>
            {login.rewards.map((label, i) => {
              const day = i + 1;
              const claimed = day <= login.cycleDay;
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
                  <div style={{ fontSize: 9, color: '#cbd5e1', minHeight: 22, lineHeight: 1.2 }}>{label}</div>
                  <div style={{ color: '#53d769', height: 12 }}>{claimed ? '✓' : ''}</div>
                </div>
              );
            })}
          </div>
          <button className="btn big gold" disabled={!login.claimableToday} onClick={() => loginClaim()}>
            {login.claimableToday ? "✦ Claim today's reward!" : 'Come back tomorrow'}
          </button>
        </div>
      )}
    </Modal>
  );
}
