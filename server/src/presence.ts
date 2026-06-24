import type { Server, Socket } from 'socket.io';
import { EMOTES, QUICK_CHAT, type PresencePlayer, type PresenceEnterMsg, type PresenceMoveMsg, type Emote } from '@aether/shared';

/**
 * Live overworld presence — ephemeral, broadcast within a map only. Each player is
 * in a Socket.IO room per map (`map:<id>`), so position/emote/chat traffic only
 * reaches people who can actually see them. Nothing is persisted; a player's
 * presence dies with their socket.
 */
const room = (map: string) => `map:${map}`;
const MOVE_MIN_MS = 40; // drop position spam faster than this

function clampCoord(n: number): number {
  return Number.isFinite(n) ? Math.max(-5, Math.min(300, Math.round(n))) : 0;
}

export class PresenceManager {
  private byPlayer = new Map<string, PresencePlayer>();
  private lastMove = new Map<string, number>();
  constructor(private io: Server) {}

  /** Enter (or switch to) a map: leave the old room, join the new one, exchange rosters. */
  enter(socket: Socket, playerId: string, name: string, p: PresenceEnterMsg): void {
    if (!p || typeof p.map !== 'string' || !p.map) return;
    const prev = this.byPlayer.get(playerId);
    if (prev && prev.map !== p.map) {
      socket.leave(room(prev.map));
      socket.to(room(prev.map)).emit('presence:left', { id: playerId });
    }
    const rec: PresencePlayer = {
      id: playerId,
      name: String(name || 'Tamer').slice(0, 24),
      map: p.map,
      x: clampCoord(p.x),
      y: clampCoord(p.y),
      facing: String(p.facing || 'down'),
      sprite: String(p.sprite || 'hero'),
    };
    this.byPlayer.set(playerId, rec);
    socket.join(room(p.map));
    const roster = [...this.byPlayer.values()].filter((q) => q.map === p.map && q.id !== playerId);
    socket.emit('presence:roster', { players: roster });
    socket.to(room(p.map)).emit('presence:joined', { player: rec });
  }

  move(socket: Socket, playerId: string, p: PresenceMoveMsg): void {
    const rec = this.byPlayer.get(playerId);
    if (!rec || !p) return;
    const now = Date.now();
    if (now - (this.lastMove.get(playerId) ?? 0) < MOVE_MIN_MS) return;
    this.lastMove.set(playerId, now);
    rec.x = clampCoord(p.x);
    rec.y = clampCoord(p.y);
    rec.facing = String(p.facing || rec.facing);
    socket.to(room(rec.map)).emit('presence:moved', { id: playerId, x: rec.x, y: rec.y, facing: rec.facing });
  }

  emote(socket: Socket, playerId: string, kind: string): void {
    const rec = this.byPlayer.get(playerId);
    if (!rec || !EMOTES.includes(kind as Emote)) return; // fixed set only
    socket.to(room(rec.map)).emit('presence:emoted', { id: playerId, kind });
  }

  chat(socket: Socket, playerId: string, phrase: number): void {
    const rec = this.byPlayer.get(playerId);
    if (!rec || !Number.isInteger(phrase) || phrase < 0 || phrase >= QUICK_CHAT.length) return; // canned only
    socket.to(room(rec.map)).emit('presence:said', { id: playerId, phrase });
  }

  leave(playerId: string): void {
    const rec = this.byPlayer.get(playerId);
    if (!rec) return;
    this.io.to(room(rec.map)).emit('presence:left', { id: playerId });
    this.byPlayer.delete(playerId);
    this.lastMove.delete(playerId);
  }
}
