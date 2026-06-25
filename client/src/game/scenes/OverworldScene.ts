import Phaser from 'phaser';
import {
  ENCOUNTER_ZONES, scaledWildLevel, createCreature, weightedPick, defaultRng, getSpecies, SPECIES_ORDER,
  pendingEvolution, evolve, displayName, wildCount, consumeWild,
  hasBadge, isTrainerDefeated, markTrainerDefeated, awardBadge, getTrainer,
  dailyBossOf, DAILY_BOSS_REWARD,
  type Creature, type Direction, type Trainer,
} from '@aether/shared';
import { getMap, TILE, ROUTE_START_Y, OBJ_DEF, type WorldMap, type Tile, type Npc, type Interactable } from '../world/maps.js';
import { useGame } from '../../state/store.js';
import { useNet, setPresenceHandler, sendPresenceEnter, sendPresenceMove, type PresenceEvent } from '../../net/net.js';
import { audio } from '../audio.js';
import { monSpriteUrl, assetUrl } from '../assets.js';
import { generateTileArt } from '../world/tileart.js';
import { bakeTerrain } from '../world/autotile.js';
import { generateObjectArt } from '../world/objectart.js';
import { recolorOutfit } from '../world/charrecolor.js';
import type { CharacterChoice } from '@aether/shared';
// Real 4x4 walk sheets: rows = direction (right/up/left/down), cols = walk frame.
const DIR_ROW: Record<Direction, number> = { right: 0, up: 1, left: 2, down: 3 };
const CHAR_FILES: [string, string][] = [
  ['sheet_player', 'char/char_player_sheet.png'],
  ['sheet_professor', 'char/char_professor_sheet.png'],
  ['sheet_hiker', 'char/char_hiker_sheet.png'],
  ['sheet_schoolgirl', 'char/char_schoolgirl_sheet.png'],
  ['sheet_guy', 'char/char_guy_sheet.png'],
  ['sheet_ranger', 'char/char_ranger_sheet.png'],
  ['sheet_knight', 'char/char_knight_sheet.png'],
  ['sheet_mage', 'char/char_mage_sheet.png'],
  ['sheet_ninja', 'char/char_ninja_sheet.png'],
  ['sheet_samurai', 'char/char_samurai_sheet.png'],
  ['sheet_pirate', 'char/char_pirate_sheet.png'],
  ['sheet_witch', 'char/char_witch_sheet.png'],
  ['sheet_viking', 'char/char_viking_sheet.png'],
  ['sheet_robot', 'char/char_robot_sheet.png'],
  ['sheet_cowboy', 'char/char_cowboy_sheet.png'],
];
const idleFrame = (d: Direction) => DIR_ROW[d] * 4;
const EMOTE_EMOJI: Record<string, string> = { wave: '👋', happy: '😄', surprised: '😯', fire: '🔥', heart: '❤️', cry: '😢', gg: '🏆', sleep: '😴' };
const BUBBLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontSize: '12px', color: '#ffffff', backgroundColor: 'rgba(13,21,38,0.85)', padding: { x: 4, y: 2 } };

const DIRV: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
};
const ENCOUNTER_CHANCE = 0.05;

const INTRO_LINES = [
  "Welcome to Aether Town! I'm Professor Wren.",
  'Move with WASD or the arrow keys. Press Space to talk to people, read signs, and confirm choices.',
  'Head SOUTH past the gate into Whisperwood Route, then WALK AROUND in the tall grass — roaming through it is how you stumble on wild Aetherbeasts to battle and catch.',
  'To catch one: weaken it in battle, then choose BAG and throw a Pact Stone. The lower its HP, the better your odds!',
  'Rest in your bed at Home, or kneel at the Chapel altar, any time to heal your team and save your journey. Now go — adventure awaits!',
];

// One-time tutorial shown the first time a player enters each building.
const BUILDING_TIPS: Record<string, { speaker: string; lines: string[] }> = {
  home: { speaker: 'Tip · Home 🏠', lines: [
    'This is your Home.',
    'Sleep in the bed any time to fully heal your team AND save your progress — the safest spot to recover before a tough fight.',
  ] },
  church: { speaker: 'Tip · Chapel ⛪', lines: [
    'Welcome to the Chapel.',
    'Kneel at the altar to heal your whole team and save your journey — a handy checkpoint when you’re far from Home.',
  ] },
  shop: { speaker: 'Tip · Provisioner 🛒', lines: [
    'This is the Provisioner — the shop.',
    'Spend ◈ GLINT here on Pact Stones (your tool for catching wild beasts) and Potions (to heal mid-battle). Stock up before you explore!',
  ] },
  lab: { speaker: 'Tip · Wren’s Lab 🔬', lines: [
    'Welcome to Wren’s Lab.',
    'Two machines here: the ✦ Aether Rift (left) summons brand-new beasts for ◈, and the Evolution Chamber (right) awakens beasts ready to evolve.',
    'Talk to Professor Wren whenever you need a hand.',
  ] },
  cottage: { speaker: 'Tip · Cottage 🏡', lines: [
    'A cozy cottage.',
    'Townsfolk live here — chat with them for tips and lore about the world of Aetherbeasts.',
  ] },
};

export class OverworldScene extends Phaser.Scene {
  private world!: WorldMap;
  private player!: Phaser.GameObjects.Sprite;
  private tx = 0;
  private ty = 0;
  private facing: Direction = 'down';
  private moving = false;
  private busy = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private remotePlayers = new Map<string, { c: Phaser.GameObjects.Container; spr: Phaser.GameObjects.Sprite; bubble?: Phaser.GameObjects.Text; tween?: Phaser.Tweens.Tween }>();
  private myId = '';
  /** Texture key for the local player's avatar (a base sheet, or 'sheet_me' if recolored). */
  private playerSheet = 'sheet_player';
  /** Everything drawn for the current map, so it can be cleared on a warp. */
  private mapGfx: Phaser.GameObjects.GameObject[] = [];
  private inForest = false;
  private prompt!: Phaser.GameObjects.Text;
  /** Guarantee a brand-new player's first grass step starts a battle. */
  private firstGrassStep = true;
  /** Interact key must be released before it can fire again (stops dialogue re-trigger loops). */
  private canInteract = true;

  constructor() {
    super('Overworld');
  }

  preload(): void {
    if (this.textures.exists('mon_drachnid')) return; // assets persist across scene restarts
    for (const id of SPECIES_ORDER) this.load.image(`mon_${id}`, monSpriteUrl(id));
    this.load.image('ui_catchball', assetUrl('ui/ui_catchball.png'));
    for (const [key, file] of CHAR_FILES) {
      this.load.spritesheet(key, assetUrl(file), { frameWidth: 16, frameHeight: 16 });
    }
  }

  private buildAnims(): void {
    for (const [sheet] of CHAR_FILES) {
      (['right', 'up', 'left', 'down'] as Direction[]).forEach((dir) => {
        const key = `${sheet}_${dir}`;
        if (this.anims.exists(key)) return;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(sheet, { start: DIR_ROW[dir] * 4, end: DIR_ROW[dir] * 4 + 3 }),
          frameRate: 8,
          repeat: -1,
        });
      });
    }
  }

  /** The player's chosen avatar sheet key — recoloring the base outfit if needed. */
  private resolvePlayerSheet(ap: CharacterChoice | null | undefined): string {
    if (!ap || !ap.base || !this.textures.exists(ap.base)) return 'sheet_player';
    if (!ap.hue) return ap.base;            // original colours — use the base sheet as-is
    this.registerRecolored('sheet_me', ap.base, ap.hue);
    return 'sheet_me';
  }

  /** Build a recolored copy of a base walk-sheet (outfit hue-rotated) + its anims. */
  private registerRecolored(outKey: string, baseKey: string, hue: number): void {
    if (this.textures.exists(outKey)) this.textures.remove(outKey);
    const src = this.textures.get(baseKey).getSourceImage() as HTMLImageElement;
    const w = src.width, h = src.height;
    const tex = this.textures.createCanvas(outKey, w, h);
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    recolorOutfit(img.data, hue);
    ctx.putImageData(img, 0, 0);
    let idx = 0;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) tex.add(idx++, 0, col * 16, row * 16, 16, 16);
    tex.refresh();
    (['right', 'up', 'left', 'down'] as Direction[]).forEach((dir) => {
      const akey = `${outKey}_${dir}`;
      if (this.anims.exists(akey)) this.anims.remove(akey);
      this.anims.create({ key: akey, frames: this.anims.generateFrameNumbers(outKey, { start: DIR_ROW[dir] * 4, end: DIR_ROW[dir] * 4 + 3 }), frameRate: 8, repeat: -1 });
    });
  }

  create(): void {
    if (!this.textures.exists('grass0')) generateTileArt(this);
    if (!this.textures.exists('tree0')) generateObjectArt(this);
    if (!this.anims.exists('water_shimmer')) {
      this.anims.create({
        key: 'water_shimmer',
        frames: [{ key: 'shimmer0' }, { key: 'shimmer1' }, { key: 'shimmer2' }, { key: 'shimmer1' }],
        frameRate: 3,
        repeat: -1,
      });
    }
    this.buildAnims();
    const save = useGame.getState().save!;
    this.playerSheet = this.resolvePlayerSheet(save.appearance);
    this.mapGfx = [];
    this.world = getMap(save.position?.map ?? 'world');
    this.busy = false;
    this.moving = false;
    this.firstGrassStep = true;
    this.drawMap();

    this.tx = save.position?.x ?? this.world.spawn.x;
    this.ty = save.position?.y ?? this.world.spawn.y;
    this.facing = save.position?.facing ?? 'down';

    this.player = this.add.sprite(0, 0, this.playerSheet, idleFrame(this.facing)).setOrigin(0.5, 0.85);
    this.placePlayer();

    // Live presence: render other players on this map + announce ourselves.
    setPresenceHandler((ev) => this.onPresence(ev));
    this.enterPresence();

    // Overworld renders 1:1 (small character like the engine); interiors zoom in.
    this.applyCamera();
    this.cameras.main.roundPixels = true;

    this.keys = this.input.keyboard!.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E,Z,ENTER,M,B,ESC',
    ) as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.keyboard!.on('keydown-M', () => useGame.getState().openPanel('menu'));
    this.input.keyboard!.on('keydown-B', () => useGame.getState().openPanel('bag'));
    // ESC = universal "back": close a panel, dismiss a dialogue, or step out of
    // a building. Always available so you can never get stuck inside.
    this.input.keyboard!.on('keydown-ESC', () => this.handleBack());

    // Floating "Space" prompt shown when facing something interactable.
    this.prompt = this.add
      .text(0, 0, '▲ Space', {
        fontFamily: 'monospace', fontSize: '8px', color: '#1a1410',
        backgroundColor: '#ffd166', padding: { x: 3, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(99999)
      .setVisible(false);

    this.updateMusic(true);
    this.cameras.main.fadeIn(350);

    // First-run tutorial.
    if (!save.seenIntro) {
      save.seenIntro = true;
      useGame.getState().persist();
      this.time.delayedCall(450, () =>
        useGame.getState().showDialogue(INTRO_LINES, { speaker: 'Professor Wren' }),
      );
    }
  }

  // --- map rendering ---
  private clearMap(): void {
    for (const g of this.mapGfx) g.destroy();
    this.mapGfx = [];
    this.npcSprites.clear();
  }

  private drawMap(): void {
    // Hand-authored terrain (grass/floor base + autotiled path/water + overlays).
    this.mapGfx.push(bakeTerrain(this, this.world));

    // Animated shimmer over water tiles.
    const { tiles, width, height } = this.world;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].type !== 'water') continue;
        const sh = this.add.sprite(x * TILE, y * TILE, 'shimmer0').setOrigin(0, 0).setDepth(0.6);
        sh.play('water_shimmer');
        sh.anims.setProgress(Math.random());
        this.mapGfx.push(sh);
      }
    }

    // Placed objects, y-sorted by base row (rugs lie flat under everyone).
    for (const o of this.world.objects) {
      const depth = o.kind === 'rug' ? 1 : (o.y + 1) * TILE;
      const img = this.add
        .image((o.x + 0.5) * TILE, (o.y + 1) * TILE, OBJ_DEF[o.kind].sprite)
        .setOrigin(0.5, 1)
        .setDepth(depth);
      this.mapGfx.push(img);
    }

    for (const npc of this.world.npcs) {
      const spr = this.add
        .sprite(npc.x * TILE + TILE / 2, npc.y * TILE + TILE * 0.85, npc.sheet, idleFrame(npc.facing))
        .setOrigin(0.5, 0.85);
      spr.setDepth(npc.y * TILE + TILE);
      this.npcSprites.set(npc.id, spr);
      this.mapGfx.push(spr);
    }
  }

  /** Camera bounds/zoom/background for the current map. Overworld follows the
   *  player; small interiors are fully visible, centred, with a dark surround. */
  private applyCamera(): void {
    const w = this.world;
    const cam = this.cameras.main;
    cam.setBackgroundColor(w.bg ?? 0x0b1020);
    if (w.kind === 'interior') {
      // No bounds: a room narrower than the viewport stays centred (with a dark
      // surround) instead of being clamped to the top-left corner.
      cam.removeBounds();
      cam.stopFollow();
      cam.setZoom(w.zoom ?? 2.25);
      cam.centerOn((w.width * TILE) / 2, (w.height * TILE) / 2);
    } else {
      cam.setBounds(0, 0, w.width * TILE, w.height * TILE);
      cam.setZoom(w.zoom ?? 1);
      cam.startFollow(this.player, true, 0.15, 0.15);
    }
  }

  /** Fade out, swap to another map, drop the player at the target, fade in. */
  private switchMap(toMap: string, toX: number, toY: number, facing: Direction): void {
    this.busy = true;
    this.cameras.main.fadeOut(170);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.clearMap();
      this.world = getMap(toMap);
      this.drawMap();
      this.tx = toX; this.ty = toY; this.facing = facing;
      this.placePlayer();
      this.applyCamera();
      this.clearRemotes();   // drop the previous map's players
      this.enterPresence();  // join the new map room + fetch its roster
      const save = useGame.getState().save;
      if (save) {
        save.position = { map: this.world.id, x: this.tx, y: this.ty, facing: this.facing };
        useGame.getState().persist();
      }
      this.firstGrassStep = false;
      this.updateMusic(true);
      this.cameras.main.fadeIn(170);
      this.busy = false;
      this.canInteract = false; // require a key release before interacting after a warp
      this.maybeBuildingTip();
    });
  }

  /** First time the player enters a building, explain what it’s for. */
  private maybeBuildingTip(): void {
    if (this.world.kind !== 'interior') return;
    const tip = BUILDING_TIPS[this.world.id];
    if (!tip) return;
    if (!useGame.getState().claimTip('enter:' + this.world.id)) return;
    useGame.getState().showDialogue(tip.lines, { speaker: tip.speaker });
  }

  private placePlayer(): void {
    this.player.x = this.tx * TILE + TILE / 2;
    this.player.y = this.ty * TILE + TILE * 0.85;
    this.player.setDepth(this.ty * TILE + TILE);
    this.player.anims.stop();
    this.player.setFrame(idleFrame(this.facing));
  }

  // --- live overworld presence (other players on the same map) ---------------
  private enterPresence(): void {
    this.myId = useNet.getState().profile?.id ?? '';
    sendPresenceEnter(this.world.id, this.tx, this.ty, this.facing, 'sheet_player');
  }

  private dirOf(facing: string): Direction {
    return (facing in DIR_ROW ? facing : 'down') as Direction;
  }

  private onPresence(ev: PresenceEvent): void {
    switch (ev.type) {
      case 'roster': for (const p of ev.players) this.addRemote(p.id, p.name, p.x, p.y, p.facing); break;
      case 'joined': this.addRemote(ev.player.id, ev.player.name, ev.player.x, ev.player.y, ev.player.facing); break;
      case 'moved': this.moveRemote(ev.id, ev.x, ev.y, ev.facing); break;
      case 'left': this.removeRemote(ev.id); break;
      case 'emoted': this.showBubble(ev.id, EMOTE_EMOJI[ev.kind] ?? '❓'); break;
    }
  }

  private addRemote(id: string, name: string, x: number, y: number, facing: string): void {
    if (!id || id === this.myId || this.remotePlayers.has(id)) return;
    const spr = this.add.sprite(0, 0, 'sheet_player', idleFrame(this.dirOf(facing))).setOrigin(0.5, 0.85).setAlpha(0.92);
    const label = this.add.text(0, -TILE * 0.95, name, { fontSize: '10px', color: '#9fe0ff' }).setOrigin(0.5, 1);
    const c = this.add.container(x * TILE + TILE / 2, y * TILE + TILE * 0.85, [spr, label]).setDepth(y * TILE + TILE);
    this.remotePlayers.set(id, { c, spr });
  }

  private moveRemote(id: string, x: number, y: number, facing: string): void {
    const r = this.remotePlayers.get(id);
    if (!r) return;
    const dir = this.dirOf(facing);
    r.spr.anims.play(`sheet_player_${dir}`, true);
    r.tween?.stop();
    r.tween = this.tweens.add({
      targets: r.c, x: x * TILE + TILE / 2, y: y * TILE + TILE * 0.85, duration: 160,
      onComplete: () => { r.spr.anims.stop(); r.spr.setFrame(idleFrame(dir)); r.c.setDepth(y * TILE + TILE); },
    });
    r.c.setDepth(y * TILE + TILE);
  }

  private removeRemote(id: string): void {
    const r = this.remotePlayers.get(id);
    if (!r) return;
    r.tween?.stop();
    r.c.destroy(); // destroys sprite + label + any bubble child
    this.remotePlayers.delete(id);
  }

  private clearRemotes(): void {
    for (const r of this.remotePlayers.values()) { r.tween?.stop(); r.c.destroy(); }
    this.remotePlayers.clear();
  }

  /** Float an emote/chat bubble over a player for a couple seconds. */
  private showBubble(id: string, text: string): void {
    if (!text) return;
    if (id === this.myId) {
      const b = this.add.text(this.player.x, this.player.y - TILE * 1.1, text, BUBBLE_STYLE).setOrigin(0.5, 1).setDepth(99999);
      this.time.delayedCall(2400, () => b.destroy());
      return;
    }
    const r = this.remotePlayers.get(id);
    if (!r) return;
    r.bubble?.destroy();
    const b = this.add.text(0, -TILE * 1.35, text, BUBBLE_STYLE).setOrigin(0.5, 1);
    r.c.add(b);
    r.bubble = b;
    this.time.delayedCall(2400, () => { if (r.bubble === b) { b.destroy(); r.bubble = undefined; } });
  }

  private interactKeyDown(): boolean {
    return this.down('SPACE') || this.down('E') || this.down('Z') || this.down('ENTER');
  }

  /** Universal "back": close a panel, dismiss a dialogue, or step out of a building. */
  private handleBack(): void {
    const g = useGame.getState();
    if (g.panel) { g.closePanel(); return; }
    if (g.dialogue) { useGame.setState({ dialogue: null }); return; }
    if (this.world.kind === 'interior' && !this.busy) {
      const exit = this.world.warps[0]; // the door back out to the overworld
      if (exit) {
        audio.sfx('sfx_ok', 0.3);
        this.switchMap(exit.toMap, exit.toX, exit.toY, exit.facing ?? 'down');
      }
    }
  }

  // --- input loop ---
  update(time: number): void {
    const st = useGame.getState();
    if (st.screen !== 'playing' || st.panel || st.dialogue || this.busy) {
      this.prompt.setVisible(false);
      return;
    }
    // Re-arm interact only once the key is released — and ONLY while nothing is
    // open. If we re-armed during a dialogue, the keypress that closes the last
    // line would instantly re-trigger the same NPC and loop the conversation.
    if (!this.interactKeyDown()) this.canInteract = true;
    if (this.moving) return;

    this.updatePrompt(time);

    if (this.canInteract && this.interactKeyDown()) {
      this.canInteract = false;
      this.interact();
      return;
    }

    let dir: Direction | null = null;
    if (this.down('UP') || this.down('W')) dir = 'up';
    else if (this.down('DOWN') || this.down('S')) dir = 'down';
    else if (this.down('LEFT') || this.down('A')) dir = 'left';
    else if (this.down('RIGHT') || this.down('D')) dir = 'right';
    if (dir) {
      this.tryMove(dir);
    } else {
      // idle: stop walking on the standing frame
      this.player.anims.stop();
      this.player.setFrame(idleFrame(this.facing));
    }
  }

  /** Show a bobbing "Space" hint above the NPC/shrine/sign the player faces. */
  private updatePrompt(time: number): void {
    const { dx, dy } = DIRV[this.facing];
    const fx = this.tx + dx;
    const fy = this.ty + dy;
    const target =
      this.world.npcs.some((n) => n.x === fx && n.y === fy) ||
      this.world.interactables.some((i) => i.x === fx && i.y === fy);
    if (target) {
      const bob = Math.sin(time / 180) * 2;
      this.prompt.setPosition(fx * TILE + TILE / 2, fy * TILE - 3 + bob).setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }
  }

  private down(k: string): boolean {
    return this.keys[k]?.isDown ?? false;
  }

  private tryMove(dir: Direction): void {
    this.facing = dir;
    const { dx, dy } = DIRV[dir];
    const nx = this.tx + dx;
    const ny = this.ty + dy;

    if (!this.walkable(nx, ny)) {
      this.player.anims.stop();
      this.player.setFrame(idleFrame(dir));
      audio.sfx('sfx_buzzer', 0.2);
      return;
    }
    this.moving = true;
    // play() with ignoreIfPlaying keeps the walk cycle smooth across tiles
    this.player.anims.play(`${this.playerSheet}_${dir}`, true);
    this.tweens.add({
      targets: this.player,
      x: nx * TILE + TILE / 2,
      y: ny * TILE + TILE * 0.85,
      duration: 160,
      onComplete: () => {
        this.tx = nx;
        this.ty = ny;
        this.player.setDepth(this.ty * TILE + TILE);
        this.moving = false;
        this.afterStep();
      },
    });
  }

  private walkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.world.width || y >= this.world.height) return false;
    if (this.world.solid[y][x]) return false;
    if (this.world.npcs.some((n) => n.x === x && n.y === y)) return false;
    return true;
  }

  private afterStep(): void {
    const save = useGame.getState().save;
    if (save) {
      save.position = { map: this.world.id, x: this.tx, y: this.ty, facing: this.facing };
      save.playtimeSteps += 1;
    }
    this.updateMusic(false);
    sendPresenceMove(this.tx, this.ty, this.facing);

    // Step-on warp (house doors + interior exits).
    const warp = this.world.warps.find((w) => w.x === this.tx && w.y === this.ty);
    if (warp) {
      if (warp.requiresBadge && !hasBadge(useGame.getState().save!, warp.requiresBadge)) {
        audio.sfx('sfx_buzzer', 0.25);
        useDialogue(warp.lockedText ?? ['The way is sealed for now.']);
        return;
      }
      audio.sfx('sfx_ok', 0.3);
      this.switchMap(warp.toMap, warp.toX, warp.toY, warp.facing ?? 'down');
      return;
    }

    const tile: Tile = this.world.tiles[this.ty][this.tx];
    if (tile.type === 'tallgrass') {
      // Rustle so you can feel you're in encounter grass.
      const r = this.add
        .image(this.tx * TILE + TILE / 2, this.ty * TILE, 'tallgrass_ov')
        .setOrigin(0, 0)
        .setDepth(this.ty * TILE + TILE + 1)
        .setAlpha(0.9);
      this.tweens.add({ targets: r, alpha: 0, scaleY: 1.2, duration: 280, onComplete: () => r.destroy() });
      audio.sfx('sfx_move', 0.12);
      if (tile.zone) {
        const save = useGame.getState().save!;
        const now = Date.now();
        // Encounters are gated by the timed wild pool: beasts accrue on a level-scaled
        // interval (~2 min early, up to a 90-min cap) toward a level-scaled count (3 for
        // new tamers, tightening to 1 late game), refilling even while you're away. You
        // stumble on one by walking; each fight consumes one slot.
        const available = wildCount(save, now);
        const caught = Object.values(save.dex).filter((e) => e.caught).length;
        const forceFirst = this.firstGrassStep && caught <= 1;
        this.firstGrassStep = false;
        if (available > 0 && (forceFirst || Math.random() < ENCOUNTER_CHANCE)) {
          consumeWild(save, now); // claim this beast from the pool (persisted by startEncounter)
          this.startEncounter(tile.zone);
        }
      }
    }
  }

  private updateMusic(force: boolean): void {
    const forest = this.ty >= ROUTE_START_Y;
    if (force || forest !== this.inForest) {
      this.inForest = forest;
      audio.playMusic(forest ? 'bgm_forest' : 'bgm_town', 0.35);
    }
  }

  // --- interaction ---
  private interact(): void {
    const { dx, dy } = DIRV[this.facing];
    const fx = this.tx + dx;
    const fy = this.ty + dy;

    const npc = this.world.npcs.find((n) => n.x === fx && n.y === fy);
    if (npc) {
      this.faceNpc(npc);
      this.talkToNpc(npc);
      return;
    }
    const inter = this.world.interactables.find((i) => i.x === fx && i.y === fy);
    if (inter) {
      if (inter.kind === 'shrine') this.useShrine();
      else if (inter.kind === 'restbed') this.useRestbed(inter);
      else if (inter.kind === 'shopcounter') {
        audio.sfx('sfx_ok', 0.4);
        useDialogue(['Welcome to the Provisioner!', 'Take a look at my wares.'], () => useGame.getState().openPanel('shop'));
      } else if (inter.kind === 'summon') {
        audio.sfx('sfx_ok', 0.4);
        useDialogue(inter.text ?? ['The Aether Rift swirls...'], () => useGame.getState().openPanel('summon'));
      } else if (inter.kind === 'evolve') this.useEvolveChamber(inter);
      else if (inter.kind === 'dailyboss') this.useDailyBoss();
      else if (inter.kind === 'sign') useDialogue(inter.text ?? ['It’s a wooden sign.']);
    }
  }

  /** A bed / recovery pod: fully heal + save, set the respawn to this door. */
  private useRestbed(inter: Interactable): void {
    audio.sfx('sfx_ok', 0.4);
    useGame.getState().heal();
    const save = useGame.getState().save!;
    const exit = this.world.warps[0]; // the door back out to the overworld
    if (exit) save.lastHeal = { map: 'world', x: exit.toX, y: exit.toY };
    useGame.getState().persist();
    audio.sfx('jingle_heal', 0.6);
    useDialogue([...(inter.text ?? []), 'Your team is fully restored, and your journey is saved.']);
  }

  /** Evolution Chamber (lab): evolve every party beast that's reached its level. */
  private useEvolveChamber(inter: Interactable): void {
    audio.sfx('sfx_ok', 0.4);
    const save = useGame.getState().save!;
    const ready = save.party.some((c) => pendingEvolution(c));
    if (!ready) {
      useDialogue([...(inter.text ?? []), 'No beast is ready to evolve yet — raise their levels first.']);
      return;
    }
    const lines: string[] = [...(inter.text ?? [])];
    useGame.getState().mutate((s) => {
      for (const c of s.party) {
        const into = pendingEvolution(c);
        if (into) { const from = displayName(c); evolve(c, into); lines.push(`${from} evolved into ${getSpecies(into).name}!`); }
      }
    });
    audio.sfx('jingle_evolve', 0.6);
    useDialogue(lines);
  }

  private faceNpc(npc: Npc): void {
    const spr = this.npcSprites.get(npc.id);
    if (!spr) return;
    const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
    spr.setFrame(idleFrame(opposite[this.facing]));
  }

  private talkToNpc(npc: Npc): void {
    audio.sfx('sfx_ok', 0.4);
    if (npc.trainerId) {
      this.handleTrainerNpc(npc.trainerId);
      return;
    }
    if (npc.lines) {
      useDialogue(npc.lines);
      return;
    }
    if (npc.kind === 'shopkeeper') {
      useDialogue(['Welcome to the Provisioner!', 'Take a look at my wares.'], () =>
        useGame.getState().openPanel('shop'),
      );
    } else if (npc.kind === 'professor') {
      useDialogue([
        'Ah, a new tamer! Splendid.',
        'Whisperwood teems with wild Aetherbeasts — weaken one, then hurl a Pact Stone to bind it.',
        'Press M for your menu, B for your bag. Off you go!',
      ]);
    } else {
      useDialogue(['The tall grass is full of surprises.', 'My cousin caught a Jestar there once!']);
    }
  }

  private useShrine(): void {
    audio.sfx('sfx_ok', 0.4);
    useGame.getState().heal();
    const save = useGame.getState().save!;
    save.lastHeal = { map: this.world.id, x: this.tx, y: this.ty + 1 };
    useGame.getState().persist();
    audio.sfx('jingle_heal', 0.6);
    useDialogue(['You touch the Aether Shrine.', 'Your team is fully restored, and your journey is saved.']);
  }

  // --- encounters / battle handoff ---
  private startEncounter(zoneId: string): void {
    const zone = ENCOUNTER_ZONES[zoneId];
    if (!zone) return;
    const speciesId = weightedPick(
      defaultRng,
      zone.table.map((e) => ({ value: e.species, weight: e.weight })),
    );
    const party = useGame.getState().save?.party ?? [];
    const partyTop = party.length ? Math.max(...party.map((c) => c.level)) : 5;
    const level = scaledWildLevel(zone, partyTop, defaultRng);
    const wild = createCreature(speciesId, level);

    this.busy = true;
    useGame.getState().mutate((s) => {
      (s.dex[speciesId] ??= { seen: false, caught: false }).seen = true;
    });

    this.cameras.main.flash(220, 255, 255, 255);
    this.time.delayedCall(260, () => {
      this.game.events.once('battle:end', (result: BattleResult) => this.onBattleEnd(result, wild));
      this.scene.launch('Battle', { wild, isWild: true });
      this.scene.pause();
    });
  }

  private onBattleEnd(result: BattleResult, wild: Creature): void {
    this.scene.stop('Battle');
    this.scene.resume();
    this.busy = false;
    this.input.keyboard!.resetKeys();

    const game = useGame.getState();
    if (result.outcome === 'caught') {
      game.addCreature(wild);
      const reward = 10 + wild.level * 3;
      game.addAether(reward);
      game.showToast(`${getSpecies(wild.speciesId).name} joined you!  +${reward} ◈ GLINT`);
    } else if (result.outcome === 'win') {
      const reward = 6 + wild.level * 3; // prize money for the win (tightened so ◈ stays meaningful)
      game.addAether(reward);
      game.showToast(`Victory!  +${reward} ◈ GLINT`);
    } else if (result.outcome === 'lose') {
      // Whiteout: heal + respawn at the last save point (and PERSIST it, so a
      // reload doesn't drop you back on the faint tile).
      game.heal();
      const save = game.save!;
      const dest = save.lastHeal;
      const map = dest.map ?? 'world';
      save.position = { map, x: dest.x, y: dest.y, facing: 'down' };
      useDialogue(['You black out...', 'Your team was restored where you last saved.']);
      if (map !== this.world.id) {
        this.switchMap(map, dest.x, dest.y, 'down');
      } else {
        this.tx = dest.x;
        this.ty = dest.y;
        this.placePlayer();
        this.cameras.main.fadeIn(300);
      }
    }
    // Persist any in-battle changes (HP, EXP, level, evolution mutated in place).
    game.mutate(() => {});
    this.updateMusic(true);
    this.cameras.main.flash(150);
  }

  // --- trainer / boss battles ---
  private handleTrainerNpc(trainerId: string): void {
    const trainer = getTrainer(trainerId);
    if (!trainer) return;
    const save = useGame.getState().save!;
    if (isTrainerDefeated(save, trainerId)) {
      useDialogue(trainer.kind === 'boss'
        ? [`${trainer.name}: You bested me fair and square, champion.`]
        : [`${trainer.name}: Good to see you again, tamer!`]);
      return;
    }
    // The Champion only accepts a challenge once the three Elites are beaten.
    if (trainerId === 'boss_champion') {
      const elites = ['e_league_1', 'e_league_2', 'e_league_3'];
      if (!elites.every((e) => isTrainerDefeated(save, e))) {
        useDialogue(['The Champion will not yet see you.', 'Defeat all three Elites first.']);
        return;
      }
    }
    // Play the intro lines, then drop into the trainer battle.
    useDialogue(trainer.intro, () => this.startTrainerEncounter(trainer));
  }

  private startTrainerEncounter(trainer: Trainer): void {
    this.busy = true;
    audio.sfx('jingle_battle_intro', 0.4);
    this.cameras.main.flash(220, 255, 220, 180);
    this.time.delayedCall(260, () => {
      this.game.events.once('battle:end', (result: BattleResult) => this.onTrainerBattleEnd(result, trainer));
      this.scene.launch('Battle', { trainer });
      this.scene.pause();
    });
  }

  private onTrainerBattleEnd(result: BattleResult, trainer: Trainer): void {
    this.scene.stop('Battle');
    this.scene.resume();
    this.busy = false;
    this.input.keyboard!.resetKeys();
    const game = useGame.getState();

    if (result.outcome === 'win') {
      const save = game.save!;
      markTrainerDefeated(save, trainer.id);
      game.addAether(trainer.moneyReward);
      const lines = [...trainer.defeat, `You won!  +${trainer.moneyReward} ◈ GLINT`];
      if (trainer.badge) {
        awardBadge(save, trainer.badge);
        if (trainer.badge === 'ember') {
          lines.push('The Aether League gate at the head of town is open — challenge the Elites and the Champion!');
        } else if (trainer.badge === 'champion') {
          lines.push('🏆 You are the AETHER CHAMPION! Now test your might against real tamers in the PvP Arena (⚔).');
        }
      }
      game.persist();
      useDialogue(lines);
    } else if (result.outcome === 'lose') {
      game.heal();
      const save = game.save!;
      const dest = save.lastHeal;
      const map = dest.map ?? 'world';
      save.position = { map, x: dest.x, y: dest.y, facing: 'down' };
      useDialogue(['You were overwhelmed...', 'Your team was restored where you last saved.']);
      if (map !== this.world.id) this.switchMap(map, dest.x, dest.y, 'down');
      else { this.tx = dest.x; this.ty = dest.y; this.placePlayer(); this.cameras.main.fadeIn(300); }
    }
    // 'fled' → no reward, trainer not marked defeated (the player may retry).
    game.mutate(() => {});
    this.updateMusic(true);
    this.cameras.main.flash(150);
  }

  // --- daily boss (one rotating champion per UTC day, beatable once for a bounty) ---
  private useDailyBoss(): void {
    const save = useGame.getState().save!;
    const today = new Date().toISOString().slice(0, 10);
    if (save.lastDailyBoss === today) {
      useDialogue(['The Daily Champion rests, already bested today.', 'Return tomorrow for a fresh challenge.']);
      return;
    }
    const boss = dailyBossOf(today);
    // The altar sits near spawn, but the champion is Lv 25-39 — don't throw a fresh
    // trainer into a hopeless fight. Gate it so you must be within striking range.
    const partyTop = save.party.length ? Math.max(...save.party.map((c) => c.level)) : 0;
    if (partyTop < boss.level - 5) {
      useDialogue([
        `The altar shows today's Daily Champion: a Lv ${boss.level} ${getSpecies(boss.species).name}.`,
        `Far too strong for your team (Lv ${partyTop}). Train up and return when you're closer to its level.`,
      ]);
      return;
    }
    audio.sfx('sfx_ok', 0.4);
    useDialogue(
      ['A fearsome Daily Champion appears!', `Best it for a ${DAILY_BOSS_REWARD} ◈ bounty — once per day.`],
      () => this.startDailyBoss(boss),
    );
  }

  private startDailyBoss(boss: { species: string; level: number }): void {
    const beast = createCreature(boss.species, boss.level);
    this.busy = true;
    useGame.getState().mutate((s) => { (s.dex[boss.species] ??= { seen: false, caught: false }).seen = true; });
    this.cameras.main.flash(240, 255, 200, 120);
    this.time.delayedCall(280, () => {
      this.game.events.once('battle:end', (r: BattleResult) => this.onDailyBossEnd(r));
      this.scene.launch('Battle', { wild: beast, isWild: false });
      this.scene.pause();
    });
  }

  private onDailyBossEnd(result: BattleResult): void {
    this.scene.stop('Battle');
    this.scene.resume();
    this.busy = false;
    this.input.keyboard!.resetKeys();
    const game = useGame.getState();
    if (result.outcome === 'win') {
      const save = game.save!;
      save.lastDailyBoss = new Date().toISOString().slice(0, 10);
      game.addAether(DAILY_BOSS_REWARD);
      game.persist();
      game.showToast(`Daily Champion defeated!  +${DAILY_BOSS_REWARD} ◈ GLINT`);
    } else if (result.outcome === 'lose') {
      game.heal();
      const save = game.save!;
      const dest = save.lastHeal;
      const map = dest.map ?? 'world';
      save.position = { map, x: dest.x, y: dest.y, facing: 'down' };
      useDialogue(['The Champion overwhelmed you...', 'Your team was restored where you last saved.']);
      if (map !== this.world.id) this.switchMap(map, dest.x, dest.y, 'down');
      else { this.tx = dest.x; this.ty = dest.y; this.placePlayer(); this.cameras.main.fadeIn(300); }
    }
    // 'fled' → no reward; the player may retry today.
    game.mutate(() => {});
    this.updateMusic(true);
    this.cameras.main.flash(150);
  }
}

export interface BattleResult {
  outcome: 'win' | 'lose' | 'caught' | 'fled';
}

function useDialogue(lines: string[], onDone?: () => void): void {
  useGame.getState().showDialogue(lines, { onDone });
}
