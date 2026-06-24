import { useEffect, useRef, useState } from 'react';
import type { CharacterAppearance, RGB } from '@aether/shared';
import { useGame } from '../state/store.js';
import {
  drawSheet, SKIN_TONES, HAIR_COLORS, TOP_COLORS, BOTTOM_COLORS, HAIR_STYLES, SHEET_W, SHEET_H,
} from '../game/world/characterart.js';

const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function randomConfig(): CharacterAppearance {
  const hat = Math.random() < 0.3 ? 'cap' : 'none';
  return {
    skin: pick(SKIN_TONES), hair: pick(HAIR_COLORS), hairStyle: pick(HAIR_STYLES),
    top: pick(TOP_COLORS), bottom: pick(BOTTOM_COLORS), shoe: [50, 40, 35], hat, hatColor: pick(TOP_COLORS),
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <div className="muted small" style={{ width: 64, textAlign: 'right' }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

function Swatch({ color, on, sel }: { color: RGB; on: () => void; sel: boolean }) {
  return (
    <button
      onClick={on}
      title=""
      style={{
        width: 22, height: 22, borderRadius: 5, cursor: 'pointer', background: css(color),
        border: sel ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,0.18)',
        boxShadow: sel ? '0 0 6px var(--accent)' : 'none',
      }}
    />
  );
}

function Chip({ label, on, sel }: { label: string; on: () => void; sel: boolean }) {
  return (
    <button onClick={on} className={sel ? 'btn primary' : 'btn'} style={{ padding: '3px 10px', fontSize: 12 }}>
      {label}
    </button>
  );
}

export function CharacterCreator() {
  const mutate = useGame((s) => s.mutate);
  const savedName = useGame((s) => s.save?.playerName ?? 'Tamer');
  const [cfg, setCfg] = useState<CharacterAppearance>(() => randomConfig());
  const [name, setName] = useState(savedName);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const set = (patch: Partial<CharacterAppearance>) => setCfg((c) => ({ ...c, ...patch }));

  // Live, animated front-facing walk preview (cycles the 'down' row frames).
  useEffect(() => {
    const off = document.createElement('canvas');
    off.width = SHEET_W; off.height = SHEET_H;
    const octx = off.getContext('2d');
    const cv = canvasRef.current;
    if (!octx || !cv) return;
    const data = octx.createImageData(SHEET_W, SHEET_H);
    data.data.set(drawSheet(cfg));
    octx.putImageData(data, 0, 0);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(off, (frame % 4) * 16, 3 * 16, 16, 16, 0, 0, cv.width, cv.height); // row 3 = down
      frame++;
    };
    draw();
    const t = setInterval(draw, 180);
    return () => clearInterval(t);
  }, [cfg]);

  const start = () => mutate((s) => { s.appearance = cfg; s.playerName = name.trim() || 'Tamer'; });

  return (
    <div className="title-screen">
      <h1 className="title-logo" style={{ fontSize: 'clamp(24px,4.5vw,44px)' }}>Create your Tamer</h1>
      <div className="muted" style={{ marginTop: -6 }}>Design your look — you can be anyone in the world of Aetherbeasts.</div>

      <div style={{ display: 'flex', gap: 24, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <canvas
            ref={canvasRef}
            width={128}
            height={128}
            style={{ width: 128, height: 128, imageRendering: 'pixelated', background: 'rgba(13,21,38,0.5)', borderRadius: 8 }}
          />
          <button className="btn" onClick={() => setCfg(randomConfig())}>🎲 Randomize</button>
        </div>

        <div className="card" style={{ padding: 16, minWidth: 320 }}>
          <Row label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              style={{ padding: '4px 8px', borderRadius: 6, width: 200 }}
              placeholder="Tamer"
            />
          </Row>
          <Row label="Skin">
            {SKIN_TONES.map((c, i) => <Swatch key={i} color={c} sel={cfg.skin === c} on={() => set({ skin: c })} />)}
          </Row>
          <Row label="Hair">
            {HAIR_COLORS.map((c, i) => <Swatch key={i} color={c} sel={cfg.hair === c} on={() => set({ hair: c })} />)}
          </Row>
          <Row label="Style">
            {HAIR_STYLES.map((s) => <Chip key={s} label={s} sel={cfg.hairStyle === s} on={() => set({ hairStyle: s })} />)}
          </Row>
          <Row label="Shirt">
            {TOP_COLORS.map((c, i) => <Swatch key={i} color={c} sel={cfg.top === c} on={() => set({ top: c })} />)}
          </Row>
          <Row label="Pants">
            {BOTTOM_COLORS.map((c, i) => <Swatch key={i} color={c} sel={cfg.bottom === c} on={() => set({ bottom: c })} />)}
          </Row>
          <Row label="Hat">
            <Chip label="none" sel={cfg.hat === 'none'} on={() => set({ hat: 'none' })} />
            <Chip label="cap" sel={cfg.hat === 'cap'} on={() => set({ hat: 'cap' })} />
            {cfg.hat === 'cap' && TOP_COLORS.map((c, i) => <Swatch key={i} color={c} sel={cfg.hatColor === c} on={() => set({ hatColor: c })} />)}
          </Row>
          <button className="btn primary" style={{ marginTop: 16, width: '100%' }} onClick={start}>
            Start Adventure →
          </button>
        </div>
      </div>
    </div>
  );
}
