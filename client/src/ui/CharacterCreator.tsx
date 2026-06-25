import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGame } from '../state/store.js';
import { assetUrl } from '../game/assets.js';
import { CHAR_BASES, OUTFIT_HUES, recolorOutfit } from '../game/world/charrecolor.js';

const sheetUrl = (baseKey: string) => assetUrl(`char/char_${baseKey.replace('sheet_', '')}_sheet.png`);

// Cache each base sheet's raw 64x64 pixels once loaded.
const baseCache: Record<string, ImageData> = {};
function loadBase(baseKey: string): Promise<ImageData> {
  if (baseCache[baseKey]) return Promise.resolve(baseCache[baseKey]);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('no ctx'));
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, 64, 64);
      baseCache[baseKey] = d;
      resolve(d);
    };
    img.onerror = reject;
    img.src = sheetUrl(baseKey);
  });
}

/** Draw one walk-frame of base+hue (down row) onto a canvas, scaled, no smoothing. */
function drawFrame(canvas: HTMLCanvasElement, base: ImageData, hue: number, frame: number) {
  const data = new Uint8ClampedArray(base.data);
  recolorOutfit(data, hue);
  const off = document.createElement('canvas'); off.width = 64; off.height = 64;
  const octx = off.getContext('2d'); if (!octx) return;
  octx.putImageData(new ImageData(data, 64, 64), 0, 0);
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(off, (frame % 4) * 16, 3 * 16, 16, 16, 0, 0, canvas.width, canvas.height); // row 3 = down
}

function BaseThumb({ baseKey, selected, onClick }: { baseKey: string; selected: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { loadBase(baseKey).then((d) => { if (ref.current) drawFrame(ref.current, d, 0, 0); }).catch(() => {}); }, [baseKey]);
  return (
    <button onClick={onClick} style={{
      padding: 4, borderRadius: 8, cursor: 'pointer', background: 'rgba(13,21,38,0.6)',
      border: selected ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,0.15)',
      boxShadow: selected ? '0 0 7px var(--accent)' : 'none', lineHeight: 0,
    }}>
      <canvas ref={ref} width={44} height={44} style={{ width: 44, height: 44, imageRendering: 'pixelated' }} />
    </button>
  );
}

function Swatch({ hue, selected, on }: { hue: number; selected: boolean; on: () => void }) {
  return (
    <button onClick={on} title={hue === 0 ? 'Original' : ''} style={{
      width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
      background: hue === 0 ? '#aeb4c0' : `hsl(${hue},62%,50%)`,
      border: selected ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,0.18)',
      boxShadow: selected ? '0 0 6px var(--accent)' : 'none',
    }} />
  );
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 };
const lbl: CSSProperties = { width: 54, textAlign: 'right' };

export function CharacterCreator() {
  const mutate = useGame((s) => s.mutate);
  const savedName = useGame((s) => s.save?.playerName ?? 'Tamer');
  const [baseKey, setBaseKey] = useState(CHAR_BASES[0].key);
  const [hue, setHue] = useState(0);
  const [name, setName] = useState(savedName);
  const [baseData, setBaseData] = useState<ImageData | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { loadBase(baseKey).then(setBaseData).catch(() => {}); }, [baseKey]);

  useEffect(() => {
    const cv = previewRef.current;
    if (!cv || !baseData) return;
    let frame = 0;
    const tick = () => { drawFrame(cv, baseData, hue, frame); frame++; };
    tick();
    const t = setInterval(tick, 180);
    return () => clearInterval(t);
  }, [baseData, hue]);

  const start = () => mutate((s) => { s.appearance = { base: baseKey, hue }; s.playerName = name.trim() || 'Tamer'; });

  return (
    <div className="title-screen">
      <h1 className="title-logo" style={{ fontSize: 'clamp(24px,4.5vw,44px)' }}>Create your Tamer</h1>
      <div className="muted" style={{ marginTop: -6 }}>Pick a look and an outfit colour — then claim your name.</div>

      <div style={{ display: 'flex', gap: 24, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div className="card" style={{ padding: 16 }}>
          <canvas ref={previewRef} width={132} height={132} style={{ width: 132, height: 132, imageRendering: 'pixelated', background: 'rgba(13,21,38,0.5)', borderRadius: 8 }} />
        </div>

        <div className="card" style={{ padding: 16, minWidth: 300 }}>
          <div style={row}>
            <div className="muted small" style={lbl}>Body</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CHAR_BASES.map((b) => <BaseThumb key={b.key} baseKey={b.key} selected={baseKey === b.key} onClick={() => setBaseKey(b.key)} />)}
            </div>
          </div>
          <div style={row}>
            <div className="muted small" style={lbl}>Outfit</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {OUTFIT_HUES.map((h) => <Swatch key={h} hue={h} selected={hue === h} on={() => setHue(h)} />)}
            </div>
          </div>
          <div style={row}>
            <div className="muted small" style={lbl}>Name</div>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 16))} placeholder="Tamer" style={{ padding: '4px 8px', borderRadius: 6, width: 200 }} />
          </div>
          <button className="btn primary" style={{ marginTop: 16, width: '100%' }} onClick={start}>Start Adventure →</button>
        </div>
      </div>
    </div>
  );
}
