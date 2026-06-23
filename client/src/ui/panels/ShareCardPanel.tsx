import { useEffect, useRef } from 'react';
import { dexCounts } from '@aether/shared';
import { useGame } from '../../state/store.js';
import { useNet } from '../../net/net.js';
import { monSpriteUrl } from '../../game/assets.js';
import { Modal } from '../Panels.js';

const W = 600, H = 320;

/** A shareable "my team" card rendered to a canvas, downloadable / native-shareable. */
export function ShareCardPanel() {
  const closePanel = useGame((s) => s.closePanel);
  const save = useGame((s) => s.save);
  const profile = useNet((s) => s.profile);
  const qv = useNet((s) => s.questView);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !save) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1b2347'); g.addColorStop(1, '#2a1840');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#8be0ff'; ctx.lineWidth = 4; ctx.strokeRect(4, 4, W - 8, H - 8);

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#9a8cff'; ctx.font = 'bold 32px monospace';
    ctx.fillText('AETHERBEASTS', 24, 18);
    ctx.fillStyle = '#9fb0c8'; ctx.font = '13px monospace';
    ctx.fillText('BIND · BATTLE · BECOME', 26, 54);

    const dc = dexCounts(save);
    const top = save.party.length ? Math.max(...save.party.map((c) => c.level)) : 0;
    ctx.fillStyle = '#ffd166'; ctx.font = 'bold 20px monospace';
    ctx.fillText(save.playerName || 'Tamer', 24, 84);
    ctx.fillStyle = '#e6edf6'; ctx.font = '14px monospace';
    ctx.fillText(`Dex ${dc.caught}/${dc.total}    Badges ${save.badges?.length ?? 0}/2    Top Lv${top}`, 24, 112);
    if (profile) ctx.fillText(`Arena ${profile.wins}W-${profile.losses}L · ${profile.rating} rating`, 24, 132);
    if (qv) ctx.fillText(`★ ${qv.seasonPoints.toLocaleString()} Season Points`, 24, 152);

    ctx.fillStyle = '#9fb0c8'; ctx.font = '12px monospace';
    ctx.fillText('MY TEAM', 24, 192);
    ctx.fillStyle = '#7fb2e6'; ctx.font = '13px monospace';
    ctx.fillText('play free · missfitchief.github.io/aetherbeasts', 24, H - 26);

    // Party sprites (load async, draw onto their slots).
    const party = save.party.slice(0, 6);
    party.forEach((c, i) => {
      const x = 24 + i * 92, y = 210;
      ctx.fillStyle = '#16243c'; ctx.fillRect(x, y, 80, 80);
      ctx.strokeStyle = '#3a4a66'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 79, 79);
      const img = new Image();
      img.onload = () => {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x + 8, y + 4, 64, 64);
        ctx.fillStyle = '#ffd166'; ctx.font = 'bold 12px monospace'; ctx.textBaseline = 'top';
        ctx.fillText(`Lv${c.level}`, x + 8, y + 66);
      };
      img.src = monSpriteUrl(c.speciesId);
    });
  }, [save, profile, qv]);

  const download = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'aetherbeasts-team.png'; a.click();
      URL.revokeObjectURL(url);
    });
  };

  const shareNative = () => {
    canvasRef.current?.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'aetherbeasts-team.png', { type: 'image/png' });
      try {
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        if (nav.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Aetherbeasts', text: 'My Aetherbeasts team! Play free:' });
        }
      } catch { /* user cancelled the share sheet */ }
    });
  };

  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator;

  return (
    <Modal title="📣 Share Your Team" onClose={closePanel}>
      {!save ? (
        <div className="muted">Start your journey first.</div>
      ) : (
        <div>
          <canvas ref={canvasRef} width={W} height={H} style={{ width: '100%', borderRadius: 8, imageRendering: 'pixelated', display: 'block' }} />
          <div className="rift-actions" style={{ marginTop: 10 }}>
            <button className="btn big gold" onClick={download}>⬇ Download card</button>
            {canShare && <button className="btn big" onClick={shareNative}>Share…</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
