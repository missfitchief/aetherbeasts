import Phaser from 'phaser';
import {
  ENCOUNTER_ZONES, scaledWildLevel, createCreature, weightedPick, defaultRng, getSpecies, SPECIES_ORDER,
  pendingEvolution, evolve, displayName,
  type Creature, type Direction,
} from '@aether/shared';
import { getMap, TILE, ROUTE_START_Y, OBJ_DEF, type WorldMap, type Tile, type Npc, type Interactable } from '../world/maps.js';
import { useGame } from '../../state/store.js';
import { audio } from '../audio.js';
import { monSpriteUrl, assetUrl } from '../assets.js';
import { generateTileArt } from '../world/tileart.js';
import { bakeTerrain } from '../world/autotile.js';
import { generateObjectArt } from '../world/objectart.js';

// Real 4x4 walk sheets: rows = direction (right/up/left/down), cols = walk frame.
const DIR_ROW: Record<Direction, number> = { right: 0, up: 1, left: 2, down: 3 };
const CHAR_FILES: [string, string][] = [
  ['sheet_player', 'char/char_player_sheet.png'],
  ['sheet_professor', 'char/char_professor_sheet.png'],
  ['sheet_hiker', 'char/char_hiker_sheet.png'],
  ['sheet_schoolgirl', 'char/char_schoolgirl_sheet.png'],
  ['sheet_guy', 'char/char_guy_sheet.png'],
];
const idleFrame = (d: Direction) => DIR_ROW[d] * 4;

const DIRV: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
};
const ENCOUNTER_CHANCE = 0.05;

const INTRO_LINES = [
  "Welcome to Aether Town! I'm Professor Wren.",
  'Move with WASD or the arrow keys. Press Space to talk to people, read signs, and confirm choices.',
  'Head SOUTH past the gate into Whisperwood Route — its tall grass is crawling with wild Aetherbeasts.',
  'To catch one: weaken it in battle, then choose BAG and throw a Pact Stone. The lower its HP, the better your odds!',
  'Touch the glowing Aether Shrine here in town any time to heal your team and save. Now go — adventure awaits!',
];

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
    // Character walk sheets (16px frames). Terrain is hand-authored (tileart.ts).
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
    this.mapGfx = [];
    this.world = getMap(save.position?.map ?? 'world');
    this.busy = false;
    this.moving = false;
    this.firstGrassStep = true;
    this.drawMap();

    this.tx = save.position?.x ?? this.world.spawn.x;
    this.ty = save.position?.y ?? this.world.spawn.y;
    this.facing = save.position?.facing ?? 'down';

    this.player = this.add.sprite(0, 0, 'sheet_player', idleFrame(this.facing)).setOrigin(0.5, 0.85);
    this.placePlayer();

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
    });
  }

  private placePlayer(): void {
    this.player.x = this.tx * TILE + TILE / 2;
    this.player.y = this.ty * TILE + TILE * 0.85;
    this.player.setDepth(this.ty * TILE + TILE);
    this.player.anims.stop();
    this.player.setFrame(idleFrame(this.facing));
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
    // Re-arm interact only once the key has been released (prevents the
    // dialogue-dismiss keypress from instantly re-opening the same interaction).
    if (!this.interactKeyDown()) this.canInteract = true;

    if (st.screen !== 'playing' || st.panel || st.dialogue || this.busy) {
      this.prompt.setVisible(false);
      return;
    }
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
    this.player.anims.play(`sheet_player_${dir}`, true);
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

    // Step-on warp (house doors + interior exits).
    const warp = this.world.warps.find((w) => w.x === this.tx && w.y === this.ty);
    if (warp) {
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
        const caught = Object.values(useGame.getState().save!.dex).filter((e) => e.caught).length;
        const forceFirst = this.firstGrassStep && caught <= 1;
        this.firstGrassStep = false;
        if (forceFirst || Math.random() < ENCOUNTER_CHANCE) this.startEncounter(tile.zone);
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
    save.lastHeal = { map: 'world', x: this.tx, y: this.ty + 1 };
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
      const reward = 20 + wild.level * 5;
      game.addAether(reward);
      game.showToast(`${getSpecies(wild.speciesId).name} joined you!  +${reward} ◈ $AETHER`);
    } else if (result.outcome === 'win') {
      const reward = 12 + wild.level * 6; // prize money for the win
      game.addAether(reward);
      game.showToast(`Victory!  +${reward} ◈ $AETHER`);
    } else if (result.outcome === 'lose') {
      // Whiteout: return to last shrine + heal.
      game.heal();
      const save = game.save!;
      this.tx = save.lastHeal.x;
      this.ty = save.lastHeal.y;
      this.placePlayer();
      this.cameras.main.fadeIn(300);
      useDialogue(['You scramble back to safety...', 'Your team has been restored at the shrine.']);
    }
    // Persist any in-battle changes (HP, EXP, level, evolution mutated in place).
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
