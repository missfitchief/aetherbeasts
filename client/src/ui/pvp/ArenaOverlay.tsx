import { useEffect, useState } from 'react';
import { getMove, getSpecies, statOf, TYPE_COLOR, type Creature } from '@aether/shared';
import { useNet, findMatch, cancelMatch, submitMove, submitSwitch, forfeitMatch, leaveResult } from '../../net/net.js';
import { useGame } from '../../state/store.js';
import { MonImg, HpBar } from '../components.js';

/** Root overlay: nothing unless the arena is open or a match is live. */
export function ArenaOverlay() {
  const arenaOpen = useNet((s) => s.arenaOpen);
  const lobby = useNet((s) => s.lobby);
  if (!arenaOpen && lobby === 'idle') return null;
  if (lobby === 'battling') return <BattleArena />;
  if (lobby === 'result') return <ResultCard />;
  return <Lobby />;
}

function Lobby() {
  const status = useNet((s) => s.status);
  const profile = useNet((s) => s.profile);
  const lobby = useNet((s) => s.lobby);
  const stake = useNet((s) => s.stake);
  const setArena = useNet((s) => s.setArena);
  const setStake = useNet((s) => s.setStake);
  const note = useNet((s) => s.note);
  const party = useGame((s) => s.save?.party ?? []);

  const credits = profile?.credits ?? 0;
  const tiers = [50, 100, 250, 500];
  // Closing while searching must also leave the server queue (no ghost entries).
  const close = () => {
    if (lobby === 'queued') cancelMatch();
    setArena(false);
  };

  return (
    <div className="arena-overlay" onClick={() => lobby === 'idle' && setArena(false)}>
      <div className="arena-card" onClick={(e) => e.stopPropagation()}>
        <div className="arena-head">
          <h2>⚔ The Aether Arena</h2>
          <button className="icon-btn" aria-label="Close arena" onClick={close}>✕</button>
        </div>

        <div className="arena-sub">Real-time PvP. Stake Battle Credits — winner takes the pot.</div>

        <div className="arena-stats">
          <div className="arena-stat"><span>◈ {credits.toLocaleString()}</span><label>Battle Credits</label></div>
          <div className="arena-stat"><span>{profile?.rating ?? 1000}</span><label>Rating</label></div>
          <div className="arena-stat"><span>{profile?.wins ?? 0}–{profile?.losses ?? 0}</span><label>W–L</label></div>
        </div>

        <div className="arena-team">
          <label className="muted small">Your team ({party.length})</label>
          <div className="arena-team-row">
            {party.length === 0 && <span className="muted small">No beasts yet — catch or summon one first.</span>}
            {party.map((c) => <MonImg key={c.uid} speciesId={c.speciesId} size={40} shiny={c.shiny} />)}
          </div>
        </div>

        <div className="arena-stake">
          <label className="muted small">Stake</label>
          <div className="arena-stake-row">
            {tiers.map((t) => (
              <button key={t} className={'stake-chip' + (t === stake ? ' active' : '')} disabled={lobby === 'queued'}
                onClick={() => setStake(t)}>{t} ◈</button>
            ))}
          </div>
        </div>

        {note && <div className="arena-note">{note}</div>}

        {status !== 'online' && <div className="arena-note warn">Arena server offline — start it with <code>npm run dev</code>. Single-player still works.</div>}

        {lobby === 'queued' ? (
          <div className="arena-actions">
            <div className="searching"><span className="spinner" /> Searching for an opponent at {stake} ◈…</div>
            <button className="btn" onClick={cancelMatch}>Cancel</button>
          </div>
        ) : (
          <div className="arena-actions">
            <button className="btn big gold" disabled={status !== 'online' || party.length === 0 || credits < stake}
              onClick={() => findMatch(stake)}>
              Quick Match — stake {stake} ◈
            </button>
          </div>
        )}

        <div className="arena-foot muted small">
          Battle Credits are an in-game soft currency — they are never cashed out or sent on-chain.
        </div>
      </div>
    </div>
  );
}

function Countdown({ deadline }: { deadline: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => tick((n) => n + 1), 400);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  return <span className={'turn-timer' + (left <= 5 ? ' low' : '')}>{left}s</span>;
}

function BattleArena() {
  const view = useNet((s) => s.view);
  const log = useNet((s) => s.log);
  const myTurn = useNet((s) => s.myTurn);
  const submitting = useNet((s) => s.submitting);
  const deadline = useNet((s) => s.deadline);
  const note = useNet((s) => s.note);
  const [switching, setSwitching] = useState(false);

  if (!view) {
    return (
      <div className="pvp-arena">
        <div className="pvp-loading"><span className="spinner" /> Entering the arena…</div>
      </div>
    );
  }

  const me = view.you.active;
  const opp = view.opponent.active;

  return (
    <div className="pvp-arena">
      <div className="pvp-top">
        <div className="pvp-name">{view.opponent.name} <BallRow total={view.opponent.partySize} alive={view.opponent.remaining} /></div>
        <div className="pvp-combatant enemy">
          <div className="pvp-hpbox">
            <div className="pvp-mon-name">{monName(opp)} <span className="lvl">Lv{opp.level}</span></div>
            <HpBar creature={opp} />
          </div>
          <MonImg speciesId={opp.speciesId} size={104} shiny={opp.shiny} />
        </div>
      </div>

      <div className="pvp-mid">
        <span className="pvp-stake">Pot: {view.stake * 2} ◈</span>
        {myTurn ? <span className="pvp-turn you">Your move! <Countdown deadline={deadline} /></span>
          : submitting ? <span className="pvp-turn">Waiting for opponent…</span>
          : <span className="pvp-turn">Opponent is choosing… <Countdown deadline={deadline} /></span>}
      </div>

      <div className="pvp-bottom">
        <div className="pvp-combatant you">
          <MonImg speciesId={me.speciesId} size={112} shiny={me.shiny} />
          <div className="pvp-hpbox">
            <div className="pvp-mon-name">{monName(me)} <span className="lvl">Lv{me.level}</span></div>
            <HpBar creature={me} />
          </div>
        </div>
        <div className="pvp-name you">{view.you.name} <BallRow total={view.you.partySize} alive={view.you.remaining} /></div>
      </div>

      <div className="pvp-log">
        {log.slice(-5).map((l, i) => <div key={i} className="pvp-log-line">{l}</div>)}
      </div>
      {note && <div className="pvp-note">{note}</div>}

      <div className="pvp-controls">
        {!switching ? (
          <div className="pvp-moves">
            {me.moves.map((mid, i) => {
              const mv = getMove(mid);
              const pp = me.pp[i] ?? 0;
              return (
                <button key={i} className="pvp-move" disabled={!myTurn || submitting || pp <= 0}
                  style={{ borderColor: TYPE_COLOR[mv.type] }} onClick={() => submitMove(i)}>
                  <span className="pvp-move-name">{mv.name}</span>
                  <span className="pvp-move-meta">
                    <span className="pvp-move-type" style={{ background: TYPE_COLOR[mv.type] }}>{mv.type}</span>
                    <span className="pvp-move-pp">{pp}/{mv.pp}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="pvp-switch">
            {view.you.party.map((c, i) =>
              i === view.you.activeIndex ? null : (
                <button key={c.uid} className="pvp-bench" disabled={!myTurn || submitting || c.currentHp <= 0}
                  onClick={() => { submitSwitch(i); setSwitching(false); }}>
                  <MonImg speciesId={c.speciesId} size={34} shiny={c.shiny} />
                  <span>{monName(c)}</span>
                  <span className="muted small">{c.currentHp <= 0 ? 'fainted' : `${c.currentHp}/${statOf(c, 'mhp')}`}</span>
                </button>
              ),
            )}
            <button className="btn small ghost" onClick={() => setSwitching(false)}>Back</button>
          </div>
        )}
        <div className="pvp-actions-row">
          {!switching && (
            <button className="btn small" disabled={!myTurn || submitting || aliveBench(view.you.party, view.you.activeIndex) === 0}
              onClick={() => setSwitching(true)}>Switch</button>
          )}
          <button className="btn small ghost danger" onClick={forfeitMatch}>Forfeit</button>
        </div>
      </div>
    </div>
  );
}

function ResultCard() {
  const result = useNet((s) => s.result);
  const stake = useNet((s) => s.stake);
  if (!result) return null;
  const cls = result.outcome === 'win' ? 'win' : result.outcome === 'draw' ? 'draw' : 'lose';
  const title = result.outcome === 'win' ? 'VICTORY' : result.outcome === 'draw' ? 'DRAW' : 'DEFEAT';
  return (
    <div className="arena-overlay">
      <div className={`result-card ${cls}`} onClick={(e) => e.stopPropagation()}>
        <div className="result-title">{title}</div>
        <div className="result-msg">{result.message}</div>
        <div className="result-stats">
          <div><span>◈ {result.credits.toLocaleString()}</span><label>Battle Credits</label></div>
          <div><span>{result.rating}</span><label>Rating</label></div>
        </div>
        <div className="result-actions">
          <button className="btn big gold" onClick={() => { leaveResult(); findMatch(stake); }}>Find Another</button>
          <button className="btn" onClick={leaveResult}>Back to Arena</button>
        </div>
      </div>
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------
function monName(c: Creature): string {
  return c.nickname ?? getSpecies(c.speciesId).name;
}
function aliveBench(party: Creature[], activeIndex: number): number {
  return party.filter((c, i) => i !== activeIndex && c.currentHp > 0).length;
}
function BallRow({ total, alive }: { total: number; alive: number }) {
  return (
    <span className="ball-row">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={'ball' + (i < alive ? '' : ' out')} />
      ))}
    </span>
  );
}
