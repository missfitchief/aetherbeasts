import { TYPE_COLOR, statOf, getSpecies, type Creature, type TypeId } from '@aether/shared';
import { monSpriteUrl } from '../game/assets.js';

export function TypeChip({ type }: { type: TypeId }) {
  return (
    <span className="type-chip" style={{ background: TYPE_COLOR[type] }}>
      {type}
    </span>
  );
}

export function MonImg({ speciesId, size = 84, shiny = false }: { speciesId: string; size?: number; shiny?: boolean }) {
  return (
    <img
      className="mon-sprite"
      src={monSpriteUrl(speciesId)}
      width={size}
      height={size}
      alt={getSpecies(speciesId).name}
      loading="eager"
      decoding="async"
      style={shiny ? { filter: 'hue-rotate(40deg) saturate(1.4) drop-shadow(0 0 6px gold)' } : undefined}
      draggable={false}
      onError={(e) => {
        // Never show the browser's broken-image glyph — hide and let the card's
        // label carry the identity.
        (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
      }}
    />
  );
}

export function HpBar({ creature }: { creature: Creature }) {
  const max = statOf(creature, 'mhp');
  const pct = Math.max(0, creature.currentHp / max);
  const color = pct > 0.5 ? 'var(--good)' : pct > 0.2 ? '#f5c542' : 'var(--bad)';
  return (
    <div style={{ width: '100%' }}>
      <div className="hpbar">
        <div style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <div className="small muted" style={{ textAlign: 'right' }}>
        {creature.currentHp}/{max} HP {creature.ailment ? `· ${creature.ailment}` : ''}
      </div>
    </div>
  );
}
