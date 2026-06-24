import { useState, type CSSProperties } from 'react';
import { EMOTES, QUICK_CHAT } from '@aether/shared';
import { useGame } from '../state/store.js';
import { sendPresenceEmote, sendPresenceChat } from '../net/net.js';

const EMOTE_EMOJI: Record<string, string> = { wave: '👋', happy: '😄', surprised: '😯', fire: '🔥', heart: '❤️', cry: '😢', gg: '🏆', sleep: '😴' };

const btn: CSSProperties = { width: 44, height: 44, borderRadius: 22, border: '2px solid #8be0ff', background: 'rgba(13,21,38,0.8)', color: '#fff', fontSize: 20, cursor: 'pointer', touchAction: 'none' };
const popup: CSSProperties = { display: 'flex', gap: 6, background: 'rgba(13,21,38,0.94)', border: '1px solid #2a3550', borderRadius: 10, padding: 8, pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 340 };
const chip: CSSProperties = { minWidth: 40, height: 38, borderRadius: 8, border: '1px solid #3a4a66', background: '#16243c', color: '#fff', fontSize: 18, cursor: 'pointer' };

/** Emote + quick-chat picker. Sends to everyone on your map; bubbles render in-scene.
 *  Canned options only — no free text, so there's nothing to moderate. */
export function SocialControls() {
  const screen = useGame((s) => s.screen);
  const panel = useGame((s) => s.panel);
  const [open, setOpen] = useState<null | 'emote' | 'chat'>(null);
  if (screen !== 'playing' || panel) return null;

  const emote = (k: string) => { sendPresenceEmote(k); setOpen(null); };
  const chat = (i: number) => { sendPresenceChat(i); setOpen(null); };

  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 45, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
      {open === 'emote' && (
        <div style={popup}>
          {EMOTES.map((k) => <button key={k} style={chip} onClick={() => emote(k)}>{EMOTE_EMOJI[k] ?? '❓'}</button>)}
        </div>
      )}
      {open === 'chat' && (
        <div style={popup}>
          {QUICK_CHAT.map((p, i) => <button key={i} style={{ ...chip, padding: '0 10px', fontSize: 12 }} onClick={() => chat(i)}>{p}</button>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button style={btn} title="Emote" onClick={() => setOpen(open === 'emote' ? null : 'emote')}>😊</button>
        <button style={btn} title="Quick chat" onClick={() => setOpen(open === 'chat' ? null : 'chat')}>💬</button>
      </div>
    </div>
  );
}
