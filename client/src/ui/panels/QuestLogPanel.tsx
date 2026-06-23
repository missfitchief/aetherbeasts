import { useEffect } from 'react';
import type { QuestViewItem } from '@aether/shared';
import { useGame } from '../../state/store.js';
import { useNet } from '../../net/net.js';
import { claimQuest, refreshQuests } from '../../net/net.js';
import { Modal } from '../Panels.js';

function fmtResets(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${Math.floor((s % 3600) / 60)}m`;
}

function QuestRow({ q }: { q: QuestViewItem }) {
  const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
  const done = q.progress >= q.target;
  return (
    <div className={'quest-row' + (q.claimed ? ' claimed' : done ? ' ready' : '')}>
      <div className="quest-info">
        <div className="quest-goal">{q.goal}</div>
        <div className="quest-bar"><div className="quest-bar-fill" style={{ width: pct + '%' }} /></div>
        <div className="quest-meta small muted">{Math.min(q.progress, q.target)}/{q.target} · +{q.aether} ◈ · +{q.points} pts</div>
      </div>
      <div className="quest-action">
        {q.claimed
          ? <span className="quest-check">✓</span>
          : <button className="btn small" disabled={!done} onClick={() => claimQuest(q.id)}>Claim</button>}
      </div>
    </div>
  );
}

export function QuestLogPanel() {
  const closePanel = useGame((s) => s.closePanel);
  const qv = useNet((s) => s.questView);
  const wallet = useNet((s) => s.wallet);

  // Pull a fresh board on open so it reflects any daily/weekly rollover.
  useEffect(() => { refreshQuests(); }, []);

  return (
    <Modal title="🗓️ Quests" onClose={closePanel}>
      {!qv ? (
        <div className="muted">{wallet ? 'Loading quests…' : 'Connect your wallet to track quests.'}</div>
      ) : (
        <div className="quests">
          <div className="quest-header">
            <span className="quest-streak">🔥 {qv.streak}-day streak</span>
            <span className="quest-points">★ {qv.seasonPoints.toLocaleString()} Season Points</span>
          </div>

          <div className="quest-section">
            <div className="quest-section-head"><h3>Daily</h3><span className="small muted">resets in {fmtResets(qv.dailyResetsInMs)}</span></div>
            {qv.daily.map((q) => <QuestRow key={q.id} q={q} />)}
          </div>

          <div className="quest-section">
            <div className="quest-section-head"><h3>Weekly</h3><span className="small muted">resets in {fmtResets(qv.weeklyResetsInMs)}</span></div>
            {qv.weekly.map((q) => <QuestRow key={q.id} q={q} />)}
          </div>

          <div className="quest-foot small muted">
            Season Points decide your share of future <b>$AETHER</b> airdrops — keep your streak alive.
          </div>
        </div>
      )}
    </Modal>
  );
}
