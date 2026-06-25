import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGame } from '../state/store.js';
import { useChat, sendPresenceChat } from '../net/net.js';

const wrap: CSSProperties = {
  position: 'fixed', right: 12, bottom: 12, width: 264, zIndex: 44,
  display: 'flex', flexDirection: 'column', gap: 6,
  background: 'rgba(13,21,38,0.82)', border: '1px solid #2a3550', borderRadius: 10, padding: 8,
  pointerEvents: 'auto', backdropFilter: 'blur(2px)',
};
const log: CSSProperties = { maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, lineHeight: 1.35 };
const input: CSSProperties = { width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #3a4a66', background: '#0d1526', color: '#fff', fontSize: 12, boxSizing: 'border-box' };

/** Free-text overworld chat — a small corner box. Messages show here, NOT above
 *  players' heads. Keystrokes are stopped from reaching the Phaser game while typing. */
export function ChatBox() {
  const screen = useGame((s) => s.screen);
  const panel = useGame((s) => s.panel);
  const messages = useChat((s) => s.messages);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    // Clicking/tapping anywhere OUTSIDE the chat box releases the input so the game gets
    // keyboard control back (you can walk again). Capture phase so it fires even though the
    // Phaser canvas stops pointer propagation and would otherwise keep the input focused.
    const onDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) inputRef.current?.blur();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  if (screen !== 'playing' || panel) return null;

  const send = () => {
    const t = text.trim();
    if (t) sendPresenceChat(t.slice(0, 160));
    setText('');
    inputRef.current?.blur(); // hand keyboard control back to the game after sending
  };

  return (
    <div ref={wrapRef} style={wrap}>
      <div ref={logRef} style={log}>
        {messages.length === 0 && <div className="muted" style={{ fontSize: 11 }}>Say hi to other Tamers nearby…</div>}
        {messages.map((m) => (
          <div key={m.key}><span style={{ color: '#8be0ff', fontWeight: 600 }}>{m.name}:</span> <span style={{ wordBreak: 'break-word' }}>{m.text}</span></div>
        ))}
      </div>
      <input
        ref={inputRef}
        style={input}
        value={text}
        maxLength={160}
        placeholder="Click to chat · click map to walk"
        onChange={(e) => setText(e.target.value.slice(0, 160))}
        // Keep WASD/arrows/hotkeys from driving the game while the chat input is focused.
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); send(); }
          else if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        }}
        onKeyUp={(e) => e.stopPropagation()}
      />
    </div>
  );
}
