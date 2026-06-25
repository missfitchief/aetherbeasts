import type { Server, Socket } from 'socket.io';
import { EMOTES, type PresencePlayer, type PresenceEnterMsg, type PresenceMoveMsg, type Emote } from '@aether/shared';

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

/** Strip control characters (codes < 32 and DEL) without regex escapes. */
function sanitizeText(s: string): string {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.charCodeAt(0);
    out += (c >= 32 && c !== 127) ? ch : ' ';
  }
  return out.trim().slice(0, 160);
}

export class PresenceManager {
  private byPlayer = new Map<string, PresencePlayer>();
  private lastMove = new Map<string, number>();
  private lastChat = new Map<string, number>();
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
      battling: prev?.battling ?? false, // preserved across a reconnect re-enter
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

  emote(playerId: string, kind: string): void {
    const rec = this.byPlayer.get(playerId);
    if (!rec || !EMOTES.includes(kind as Emote)) return; // fixed set only
    this.io.to(room(rec.map)).emit('presence:emoted', { id: playerId, kind }); // include sender (own bubble)
  }

  /** Flag a player as in/out of battle — relayed so others on the map show a ⚔ marker. */
  setBattling(playerId: string, battling: boolean): void {
    const rec = this.byPlayer.get(playerId);
    if (!rec || rec.battling === battling) return;
    rec.battling = battling;
    this.io.to(room(rec.map)).emit('presence:status', { id: playerId, battling });
  }

  /** Free-text chat, relayed to everyone on the sender's map. Length-clamped +
   *  rate-limited + control chars stripped. NOTE: no content moderation. */
  chat(playerId: string, text: string): void {
    const rec = this.byPlayer.get(playerId);
    if (!rec) return;
    const now = Date.now();
    if (now - (this.lastChat.get(playerId) ?? 0) < 600) return; // anti-spam
    const clean = sanitizeText(text);
    if (!clean) return;
    this.lastChat.set(playerId, now);
    this.io.to(room(rec.map)).emit('presence:said', { id: playerId, name: rec.name, text: clean }); // include sender
  }

  leave(playerId: string): void {
    const rec = this.byPlayer.get(playerId);
    if (!rec) return;
    this.io.to(room(rec.map)).emit('presence:left', { id: playerId });
    this.byPlayer.delete(playerId);
    this.lastMove.delete(playerId);
    this.lastChat.delete(playerId);
  }
}
