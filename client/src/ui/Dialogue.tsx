import { useEffect, useState } from 'react';
import { useGame } from '../state/store.js';
import { audio } from '../game/audio.js';

export function Dialogue() {
  const dialogue = useGame((s) => s.dialogue);
  const advance = useGame((s) => s.advanceDialogue);
  const [shown, setShown] = useState('');

  const full = dialogue ? dialogue.lines[dialogue.index] : '';

  useEffect(() => {
    if (!dialogue) return;
    setShown('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [full, dialogue]);

  const onClick = () => {
    if (shown.length < full.length) {
      setShown(full);
    } else {
      audio.sfx('sfx_ok', 0.3);
      advance();
    }
  };

  useEffect(() => {
    if (!dialogue) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.key === 'e') {
        e.preventDefault();
        onClick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogue, shown, full]);

  if (!dialogue) return null;

  return (
    <div className="dialogue" onClick={onClick}>
      {dialogue.speaker && <div className="speaker">{dialogue.speaker}</div>}
      <div className="line">{shown}</div>
      <div className="hint">▼ click / space</div>
    </div>
  );
}
