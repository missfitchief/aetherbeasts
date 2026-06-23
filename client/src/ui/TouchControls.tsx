import { useEffect, useState, type CSSProperties } from 'react';
import { useGame } from '../state/store.js';

/**
 * On-screen touch controls for mobile. Rather than wire touch into each scene,
 * we synthesize real keyboard events on `window` — both the Phaser overworld and
 * battle scenes already listen there, so a d-pad + buttons drive everything.
 * Phaser keys on `keyCode`, which the KeyboardEvent constructor drops, so we
 * force it via defineProperty.
 */
function dispatchKey(type: 'keydown' | 'keyup', code: string, keyCode: number, k: string) {
  const ev = new KeyboardEvent(type, { key: k, code, bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
  Object.defineProperty(ev, 'which', { get: () => keyCode });
  window.dispatchEvent(ev);
}
const tap = (code: string, keyCode: number, k: string) => {
  dispatchKey('keydown', code, keyCode, k);
  setTimeout(() => dispatchKey('keyup', code, keyCode, k), 60);
};

const DIRS = {
  up: ['ArrowUp', 38, 'ArrowUp', '▲'],
  down: ['ArrowDown', 40, 'ArrowDown', '▼'],
  left: ['ArrowLeft', 37, 'ArrowLeft', '◀'],
  right: ['ArrowRight', 39, 'ArrowRight', '▶'],
} as const;

const btn: CSSProperties = {
  position: 'absolute', width: 52, height: 52, borderRadius: 10,
  border: '2px solid #8be0ff', background: 'rgba(13,21,38,0.72)', color: '#cbd5e1',
  fontSize: 20, userSelect: 'none', touchAction: 'none', padding: 0,
};
const aBtn: CSSProperties = {
  width: 70, height: 70, borderRadius: 35, border: '2px solid #ffcf5c',
  background: 'rgba(40,24,16,0.82)', color: '#ffd166', fontWeight: 700, fontSize: 22,
  userSelect: 'none', touchAction: 'none',
};
const smBtn: CSSProperties = {
  width: 42, height: 42, borderRadius: 9, border: '2px solid #8be0ff',
  background: 'rgba(13,21,38,0.72)', color: '#cbd5e1', fontSize: 16, userSelect: 'none', touchAction: 'none',
};

export function TouchControls() {
  const screen = useGame((s) => s.screen);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(
      typeof window !== 'undefined' &&
      ((typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window),
    );
  }, []);
  if (!touch || screen !== 'playing') return null;

  const dir = (d: keyof typeof DIRS, pos: CSSProperties) => {
    const [code, kc, k, label] = DIRS[d];
    const release = () => dispatchKey('keyup', code, kc, k);
    return (
      <button
        style={{ ...btn, ...pos }}
        onPointerDown={(e) => { e.preventDefault(); dispatchKey('keydown', code, kc, k); }}
        onPointerUp={(e) => { e.preventDefault(); release(); }}
        onPointerLeave={release}
        onPointerCancel={release}
      >{label}</button>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      <div style={{ position: 'absolute', left: 18, bottom: 24, width: 156, height: 156, pointerEvents: 'auto' }}>
        {dir('up', { left: 52, top: 0 })}
        {dir('left', { left: 0, top: 52 })}
        {dir('right', { left: 104, top: 52 })}
        {dir('down', { left: 52, top: 104 })}
      </div>
      <div style={{ position: 'absolute', right: 18, bottom: 24, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <button style={aBtn} onPointerDown={(e) => { e.preventDefault(); tap('Space', 32, ' '); }}>A</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={smBtn} onPointerDown={(e) => { e.preventDefault(); tap('KeyM', 77, 'm'); }}>☰</button>
          <button style={smBtn} onPointerDown={(e) => { e.preventDefault(); tap('KeyB', 66, 'b'); }}>🎒</button>
        </div>
      </div>
    </div>
  );
}
