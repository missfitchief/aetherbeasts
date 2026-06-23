import Phaser from 'phaser';
import {
  startBattle, startTrainerBattle, resolveTurn, mustSwitch, applyForcedSwitch, getSpecies, getMove, getItem,
  statOf, expProgress, displayName, evolve, removeItem, createCreature,
  TYPE_COLOR,
  type Creature, type BattleState, type BattleEvent, type PlayerAction, type Side, type Trainer,
} from '@aether/shared';
import { useGame } from '../../state/store.js';
import { emitQuestProgress } from '../../net/net.js';
import { audio } from '../audio.js';

const W = 640;
const H = 360;
// --- layout (native 640x360) ---
const ENEMY_X = 472, ENEMY_Y = 138;
const PLAYER_X = 168, PLAYER_Y = 252;
const PANEL_W = 230;
const BAR_Y = 286, BAR_H = 70;        // bottom command bar
const MSG_W = 392;                     // message box (left of the bar)
const MENU_X = MSG_W + 14;             // action-menu box (right of the bar)
const MENU_W = W - MENU_X - 10;
const MOVE_SFX: Record<string, string> = {
  fire: 'sfx_fireball', water: 'sfx_bubble', plant: 'sfx_leaf', ground: 'sfx_sand',
  magic: 'sfx_magicstar', ghost: 'sfx_magicstar', air: 'sfx_bubble', normal: 'sfx_tackle',
};

interface HpBar {
  redraw: (pct: number) => void;
}

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;

  private enemySprite!: Phaser.GameObjects.Image;
  private playerSprite!: Phaser.GameObjects.Image;
  private enemyHp!: HpBar;
  private playerHp!: HpBar;
  private enemyPanel!: Phaser.GameObjects.Container;
  private playerPanel!: Phaser.GameObjects.Container;
  private expFill!: Phaser.GameObjects.Rectangle;
  private msgText!: Phaser.GameObjects.Text;

  private mode: 'idle' | 'choosing' = 'idle';
  private menu: { items: MenuItem[]; cursor: number; cols: number; wide: boolean; resolve: (v: number | 'cancel') => void } | null = null;
  private menuGfx: Phaser.GameObjects.Container | null = null;
  private skip = false;
  private evolveQueue: { uid: string; into: string }[] = [];
  private trainer: Trainer | null = null;

  constructor() {
    super('Battle');
  }

  init(data: { wild?: Creature; isWild?: boolean; trainer?: Trainer }): void {
    const party = useGame.getState().save!.party;
    if (data.trainer) {
      this.trainer = data.trainer;
      const team = data.trainer.team.map((m) => createCreature(m.species, m.level));
      this.state = startTrainerBattle(party, team);
    } else {
      this.trainer = null;
      this.state = startBattle(party, data.wild!, { isWild: data.isWild });
    }
    this.evolveQueue = [];
    this.mode = 'idle';
  }

  create(): void {
    this.buildBackground();
    this.buildSprites();
    this.buildPanels();
    this.buildMessageBox();
    this.setupInput();
    const pc = this.state.player.creature;
    this.lastPct = { player: pc.currentHp / statOf(pc, 'mhp'), enemy: 1 };
    audio.playMusic('bgm_battle', 0.4);
    audio.sfx('jingle_battle_intro', 0.5);
    void this.run();
  }

  // ---------------------------------------------------------------- layout
  private buildBackground(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a3d66, 0x2a3d66, 0x111a2e, 0x111a2e, 1);
    bg.fillRect(0, 0, W, H);
    // ground platforms
    this.add.ellipse(ENEMY_X, ENEMY_Y + 40, 180, 46, 0x3a5a3a).setAlpha(0.9);
    this.add.ellipse(PLAYER_X, PLAYER_Y + 34, 210, 54, 0x3a5a3a).setAlpha(0.9);
    // distant stars
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % W;
      const y = (i * 53) % 150;
      this.add.rectangle(x, y, 1, 1, 0xffffff).setAlpha(0.25 + (i % 3) * 0.15);
    }
  }

  private buildSprites(): void {
    const enemy = this.state.enemy.creature;
    const player = this.state.player.creature;
    this.enemySprite = this.add.image(W + 90, ENEMY_Y, `mon_${enemy.speciesId}`).setScale(0.74);
    this.playerSprite = this.add.image(-90, PLAYER_Y, `mon_${player.speciesId}`).setScale(0.86).setFlipX(true);
    if (enemy.shiny) this.enemySprite.setTint(0xfff2a8);
    if (player.shiny) this.playerSprite.setTint(0xfff2a8);
  }

  private buildPanels(): void {
    const e = this.makePanel(28, 30, this.state.enemy.creature, false);
    this.enemyPanel = e.container;
    this.enemyHp = e.hp;
    const p = this.makePanel(W - PANEL_W - 28, 196, this.state.player.creature, true);
    this.playerPanel = p.container;
    this.playerHp = p.hp;
    this.expFill = p.exp!;
    this.enemyPanel.setAlpha(0);
    this.playerPanel.setAlpha(0);
  }

  private makePanel(x: number, y: number, c: Creature, isPlayer: boolean): { container: Phaser.GameObjects.Container; hp: HpBar; exp?: Phaser.GameObjects.Rectangle } {
    const w = PANEL_W;
    const cont = this.add.container(x, y).setDepth(50);
    const box = this.add.graphics();
    box.fillStyle(0x0d1526, 0.92);
    box.fillRoundedRect(0, 0, w, isPlayer ? 50 : 40, 6);
    box.lineStyle(2, 0x8be0ff, 0.8);
    box.strokeRoundedRect(0, 0, w, isPlayer ? 50 : 40, 6);
    cont.add(box);

    const name = this.add.text(10, 6, displayName(c), { fontFamily: 'monospace', fontSize: '13px', color: '#ffffff' });
    const lv = this.add.text(w - 44, 6, `Lv${c.level}`, { fontFamily: 'monospace', fontSize: '12px', color: '#ffd166' });
    cont.add([name, lv]);

    // hp bar
    const barX = 10;
    const barY = 26;
    const barW = w - 20;
    const hpBg = this.add.graphics();
    hpBg.fillStyle(0x000000, 0.6);
    hpBg.fillRoundedRect(barX, barY, barW, 7, 3);
    cont.add(hpBg);
    const hpFill = this.add.graphics();
    cont.add(hpFill);
    const redraw = (pct: number) => {
      hpFill.clear();
      const col = pct > 0.5 ? 0x53d769 : pct > 0.2 ? 0xf5c542 : 0xe5484d;
      hpFill.fillStyle(col, 1);
      hpFill.fillRoundedRect(barX, barY, Math.max(0, barW * pct), 7, 3);
    };
    redraw(c.currentHp / statOf(c, 'mhp'));

    let exp: Phaser.GameObjects.Rectangle | undefined;
    if (isPlayer) {
      const hpNum = this.add.text(w - 70, 34, `${c.currentHp}/${statOf(c, 'mhp')}`, { fontFamily: 'monospace', fontSize: '10px', color: '#cbd5e1' });
      hpNum.setName('hpnum');
      cont.add(hpNum);
      const expBg = this.add.rectangle(10, 45, barW, 3, 0x223049).setOrigin(0, 0.5);
      exp = this.add.rectangle(10, 45, barW * expProgress(c), 3, 0x4aa3ff).setOrigin(0, 0.5);
      cont.add([expBg, exp]);
    }
    return { container: cont, hp: { redraw }, exp };
  }

  private buildMessageBox(): void {
    const box = this.add.graphics().setDepth(60);
    box.fillStyle(0x0d1526, 0.95);
    box.fillRoundedRect(8, BAR_Y, MSG_W, BAR_H, 7);
    box.lineStyle(2, 0x8be0ff, 0.8);
    box.strokeRoundedRect(8, BAR_Y, MSG_W, BAR_H, 7);
    this.msgText = this.add.text(22, BAR_Y + 14, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', lineSpacing: 4, wordWrap: { width: MSG_W - 28 } }).setDepth(61);
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    const move = (dx: number, dy: number) => {
      if (this.mode !== 'choosing' || !this.menu) return;
      const { cols, items } = this.menu;
      let i = this.menu.cursor;
      const rows = Math.ceil(items.length / cols);
      let col = i % cols;
      let row = Math.floor(i / cols);
      if (dx) col = (col + dx + cols) % cols;
      if (dy) row = (row + dy + rows) % rows;
      i = row * cols + col;
      if (i >= items.length) i = items.length - 1;
      this.menu.cursor = i;
      audio.sfx('sfx_move', 0.3);
      this.renderMenu();
    };
    kb.on('keydown-LEFT', () => move(-1, 0));
    kb.on('keydown-A', () => move(-1, 0));
    kb.on('keydown-RIGHT', () => move(1, 0));
    kb.on('keydown-D', () => move(1, 0));
    kb.on('keydown-UP', () => move(0, -1));
    kb.on('keydown-W', () => move(0, -1));
    kb.on('keydown-DOWN', () => move(0, 1));
    kb.on('keydown-S', () => move(0, 1));
    const confirm = () => {
      this.skip = true;
      if (this.mode === 'choosing' && this.menu) {
        const item = this.menu.items[this.menu.cursor];
        if (item.disabled) { audio.sfx('sfx_buzzer', 0.3); return; }
        audio.sfx('sfx_ok', 0.4);
        const r = this.menu.resolve;
        this.menu = null;
        this.mode = 'idle';
        this.clearMenu();
        r(item.index);
      }
    };
    kb.on('keydown-SPACE', confirm);
    kb.on('keydown-ENTER', confirm);
    kb.on('keydown-Z', confirm);
    kb.on('keydown-X', () => this.cancel());
    kb.on('keydown-BACKSPACE', () => this.cancel());
  }

  private cancel(): void {
    if (this.mode === 'choosing' && this.menu) {
      audio.sfx('sfx_buzzer', 0.3);
      const r = this.menu.resolve;
      this.menu = null;
      this.mode = 'idle';
      this.clearMenu();
      r('cancel');
    }
  }

  // ---------------------------------------------------------------- flow
  private async run(): Promise<void> {
    await this.intro();
    while (!this.state.over) {
      if (mustSwitch(this.state)) {
        await this.forceSwitch();
        continue;
      }
      const action = await this.commandPhase();
      if (!action) continue;
      const events = resolveTurn(this.state, action, this.deterministicRng());
      await this.playEvents(events);
    }
    await this.processEvolutions();
    await this.finish();
  }

  private deterministicRng() {
    return { next: () => Math.random() };
  }

  private async intro(): Promise<void> {
    await Promise.all([
      this.tweenP({ targets: this.enemySprite, x: ENEMY_X, duration: 480, ease: 'Back.out' }),
      this.tweenP({ targets: this.playerSprite, x: PLAYER_X, duration: 480, ease: 'Back.out' }),
    ]);
    this.tweens.add({ targets: this.enemyPanel, alpha: 1, duration: 200 });
    this.tweens.add({ targets: this.playerPanel, alpha: 1, duration: 200 });
    if (this.trainer) {
      await this.say(`${this.trainer.name} wants to battle!`);
      await this.say(`${this.trainer.name} sent out ${displayName(this.state.enemy.creature)}!`, { quick: true });
    } else {
      await this.say(`A wild ${displayName(this.state.enemy.creature)} appeared!`);
    }
  }

  private async commandPhase(): Promise<PlayerAction | null> {
    this.setMessage('What will you do?');
    const choice = await this.chooseMenu(
      [
        { index: 0, label: 'FIGHT', color: '#e5484d' },
        { index: 1, label: 'BAG', color: '#f5c542' },
        { index: 2, label: 'TEAM', color: '#53d769' },
        { index: 3, label: 'RUN', color: '#8be0ff' },
      ],
      2,
    );
    if (choice === 'cancel') return null;
    if (choice === 0) return this.chooseFight();
    if (choice === 1) return this.chooseBag();
    if (choice === 2) return this.chooseTeam(false);
    return { kind: 'run' };
  }

  private async chooseFight(): Promise<PlayerAction | null> {
    const c = this.state.player.creature;
    const items: MenuItem[] = c.moves.map((mid, i) => {
      const m = getMove(mid);
      return {
        index: i,
        label: `${m.name}`,
        sub: `${m.type.toUpperCase()}  ${c.pp[i]}/${m.pp}`,
        color: hex(TYPE_COLOR[m.type]),
        disabled: c.pp[i] <= 0,
      };
    });
    const pick = await this.chooseMenu(items, 2, { wide: true });
    if (pick === 'cancel') return null;
    return { kind: 'move', index: pick };
  }

  private async chooseBag(): Promise<PlayerAction | null> {
    const save = useGame.getState().save!;
    const usable = save.bag.filter((s) => {
      const it = getItem(s.itemId);
      if (this.trainer && it.category === 'catch') return false; // can't catch a trainer's beast
      return it.category === 'catch' || it.effect.kind === 'heal-hp' || it.effect.kind === 'cure';
    });
    if (usable.length === 0) {
      await this.say('Your bag has nothing usable here.');
      return null;
    }
    const items: MenuItem[] = usable.map((s, i) => {
      const it = getItem(s.itemId);
      return { index: i, label: it.name, sub: `x${s.qty}`, color: it.category === 'catch' ? '#ff8c69' : '#7bd88f' };
    });
    const pick = await this.chooseMenu(items, 1);
    if (pick === 'cancel') return null;
    const chosen = usable[pick];
    const it = getItem(chosen.itemId);
    removeItem(save, chosen.itemId, 1);
    if (it.category === 'catch') return { kind: 'catch', itemId: chosen.itemId };
    return { kind: 'item', itemId: chosen.itemId, targetIndex: this.state.activeIndex };
  }

  private async chooseTeam(forced: boolean): Promise<PlayerAction | null> {
    const party = this.state.party;
    const items: MenuItem[] = party.map((c, i) => ({
      index: i,
      label: displayName(c),
      sub: `Lv${c.level}  ${c.currentHp}/${statOf(c, 'mhp')}`,
      color: c.currentHp > 0 ? '#ffffff' : '#7a7a7a',
      disabled: c.currentHp <= 0 || i === this.state.activeIndex,
    }));
    const pick = await this.chooseMenu(items, 1, { allowCancel: !forced, title: forced ? 'Choose your next Aetherbeast!' : 'Switch to whom?' });
    if (pick === 'cancel') return null;
    return { kind: 'switch', partyIndex: pick };
  }

  private async forceSwitch(): Promise<void> {
    const action = await this.chooseTeam(true);
    if (action && action.kind === 'switch') {
      applyForcedSwitch(this.state, action.partyIndex);
      await this.swapPlayerSprite();
      await this.say(`Go, ${displayName(this.state.player.creature)}!`);
    }
  }

  // ---------------------------------------------------------------- events
  private async playEvents(events: BattleEvent[]): Promise<void> {
    for (const ev of events) {
      switch (ev.type) {
        case 'message':
          await this.say(ev.text);
          break;
        case 'use-move': {
          const m = getMove(ev.moveId);
          await this.say(`${this.nameOf(ev.side)} used ${m.name}!`, { quick: true });
          audio.sfx(MOVE_SFX[m.type] ?? 'sfx_tackle', 0.5);
          await this.lunge(ev.side);
          break;
        }
        case 'miss':
          audio.sfx('sfx_buzzer', 0.3);
          break;
        case 'damage':
          await this.applyDamage(ev);
          break;
        case 'heal':
          audio.sfx('sfx_heal', 0.5);
          this.refreshHp(ev.side);
          break;
        case 'buff':
          await this.flashBuff(ev.side, ev.delta > 0);
          break;
        case 'ailment':
          this.tintAil(ev.side);
          break;
        case 'ailment-clear':
          this.clearTint(ev.side);
          break;
        case 'ailment-tick':
          await this.applyAilmentTick(ev);
          break;
        case 'faint':
          await this.faint(ev.side);
          break;
        case 'levelup':
          audio.sfx('jingle_levelup', 0.6);
          this.refreshExp();
          await this.say(`${this.playerName()} grew to Lv${ev.level}!`);
          await this.sparkle(this.playerSprite);
          break;
        case 'learn':
          await this.say(`${this.playerName()} learned ${getMove(ev.moveId).name}!`);
          break;
        case 'exp':
          this.refreshExp();
          break;
        case 'evolve-ready':
          this.evolveQueue.push({ uid: ev.uid, into: ev.into });
          break;
        case 'capture':
          await this.captureAnim(ev.wobbles, ev.success);
          break;
        case 'run':
          if (ev.success) await this.tweenP({ targets: this.playerSprite, x: -100, alpha: 0, duration: 300 });
          break;
        case 'switch':
          if (ev.side === 'enemy') await this.swapEnemySprite();
          else await this.swapPlayerSprite();
          break;
        case 'end':
          break;
      }
    }
  }

  private async applyDamage(ev: Extract<BattleEvent, { type: 'damage' }>): Promise<void> {
    const target = ev.side;
    const spr = target === 'enemy' ? this.enemySprite : this.playerSprite;
    audio.sfx('sfx_damage', 0.5);
    // flicker + shake
    this.tweens.add({ targets: spr, alpha: 0.2, yoyo: true, repeat: 2, duration: 60 });
    this.cameras.main.shake(ev.crit ? 240 : 130, ev.crit ? 0.012 : 0.006);
    if (ev.crit) this.cameras.main.flash(120, 255, 255, 255);
    this.floatNumber(spr.x, spr.y - 30, ev.amount, ev.crit);
    await this.drainHp(target, ev.hpAfter / ev.maxHp);
    if (target === 'player') this.refreshHpNum();
  }

  private async applyAilmentTick(ev: Extract<BattleEvent, { type: 'ailment-tick' }>): Promise<void> {
    const spr = ev.side === 'enemy' ? this.enemySprite : this.playerSprite;
    this.floatNumber(spr.x, spr.y - 30, ev.amount, false, '#b072ff');
    await this.drainHp(ev.side, ev.hpAfter / ev.maxHp);
    if (ev.side === 'player') this.refreshHpNum();
  }

  private async lunge(side: Side): Promise<void> {
    const spr = side === 'enemy' ? this.enemySprite : this.playerSprite;
    const dir = side === 'enemy' ? -1 : 1;
    await this.tweenP({ targets: spr, x: spr.x + 18 * dir, duration: 90, yoyo: true, ease: 'Quad.out' });
  }

  private async faint(side: Side): Promise<void> {
    const spr = side === 'enemy' ? this.enemySprite : this.playerSprite;
    audio.sfx('sfx_buzzer', 0.3);
    await this.tweenP({ targets: spr, y: spr.y + 40, alpha: 0, duration: 420, ease: 'Quad.in' });
  }

  private async sparkle(spr: Phaser.GameObjects.Image): Promise<void> {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = this.add.rectangle(spr.x, spr.y, 3, 3, 0xffe066).setDepth(80);
      this.tweens.add({ targets: s, x: spr.x + Math.cos(a) * 40, y: spr.y + Math.sin(a) * 40, alpha: 0, duration: 420, onComplete: () => s.destroy() });
    }
    await this.wait(260);
  }

  private async flashBuff(side: Side, up: boolean): Promise<void> {
    const spr = side === 'enemy' ? this.enemySprite : this.playerSprite;
    for (let i = 0; i < 4; i++) {
      const r = this.add.triangle(spr.x - 18 + i * 12, spr.y, 0, 8, 4, 0, 8, 8, up ? 0x7bd88f : 0xe5707a).setDepth(80);
      this.tweens.add({ targets: r, y: spr.y + (up ? -34 : 34), alpha: 0, duration: 420, onComplete: () => r.destroy() });
    }
    await this.wait(180);
  }

  private async captureAnim(wobbles: number, success: boolean): Promise<void> {
    audio.sfx('sfx_catch_start', 0.6);
    const ball = this.add.image(this.playerSprite.x, this.playerSprite.y, 'ui_catchball').setScale(1.2).setDepth(70);
    await this.tweenP({ targets: ball, x: this.enemySprite.x, y: this.enemySprite.y - 6, duration: 420, ease: 'Quad.out' });
    // suck in
    this.tweens.add({ targets: this.enemySprite, scale: 0.05, alpha: 0.4, duration: 220 });
    await this.tweenP({ targets: ball, y: this.enemySprite.y + 30, duration: 260, ease: 'Quad.in' });
    for (let i = 0; i < wobbles; i++) {
      audio.sfx('sfx_catch_roll', 0.5);
      await this.tweenP({ targets: ball, angle: -18, duration: 120, yoyo: true });
      await this.tweenP({ targets: ball, angle: 18, duration: 120, yoyo: true });
    }
    if (success) {
      audio.sfx('sfx_catch_success', 0.6);
      this.tweens.add({ targets: ball, alpha: 0.85, duration: 200 });
      await this.sparkle(ball);
    } else {
      audio.sfx('sfx_catch_fail', 0.5);
      this.tweens.add({ targets: this.enemySprite, scale: 0.74, alpha: 1, duration: 200 });
      ball.destroy();
    }
  }

  // ---------------------------------------------------------------- evolution / finish
  private async processEvolutions(): Promise<void> {
    if (this.state.outcome !== 'win') return;
    for (const e of this.evolveQueue) {
      const c = this.state.party.find((p) => p.uid === e.uid);
      if (!c) continue;
      audio.stopMusic();
      await this.say(`What? ${displayName(c)} is evolving!`);
      audio.sfx('jingle_evolve', 0.6);
      this.playerSprite.setTexture(`mon_${c.speciesId}`);
      await this.tweenP({ targets: this.playerSprite, alpha: 0.2, scaleX: 0.9, duration: 600, yoyo: true, repeat: 1 });
      const fromName = displayName(c);
      evolve(c, e.into);
      this.playerSprite.setTexture(`mon_${c.speciesId}`).setScale(0.86).setFlipX(true).setAlpha(1);
      await this.sparkle(this.playerSprite);
      useGame.getState().mutate((s) => {
        (s.dex[e.into] ??= { seen: false, caught: false }).caught = true;
        s.dex[e.into].seen = true;
      });
      await this.say(`${fromName} evolved into ${getSpecies(e.into).name}!`);
      emitQuestProgress('evolve');
    }
  }

  private async finish(): Promise<void> {
    if (this.state.outcome === 'win') audio.sfx('jingle_win', 0.6);
    // Quest progress (PvE). The server clamps each to its quest target.
    if (!this.state.isPvp) {
      emitQuestProgress('battle_play');
      if (this.state.outcome === 'win') emitQuestProgress('battle_win');
      if (this.state.outcome === 'caught') emitQuestProgress('catch');
    }
    await this.wait(300);
    this.cameras.main.fadeOut(220);
    await this.wait(240);
    this.game.events.emit('battle:end', { outcome: this.state.outcome });
  }

  // ---------------------------------------------------------------- helpers
  private nameOf(side: Side): string {
    return displayName(side === 'enemy' ? this.state.enemy.creature : this.state.player.creature);
  }
  private playerName(): string {
    return displayName(this.state.player.creature);
  }

  private refreshHp(side: Side): void {
    const c = side === 'enemy' ? this.state.enemy.creature : this.state.player.creature;
    (side === 'enemy' ? this.enemyHp : this.playerHp).redraw(c.currentHp / statOf(c, 'mhp'));
    if (side === 'player') this.refreshHpNum();
  }
  private async drainHp(side: Side, pct: number): Promise<void> {
    const bar = side === 'enemy' ? this.enemyHp : this.playerHp;
    const obj = { v: this.lastPct[side] };
    await this.tweenP({
      targets: obj, v: pct, duration: 500, ease: 'Quad.out',
      onUpdate: () => bar.redraw(obj.v),
    });
    this.lastPct[side] = pct;
  }
  private lastPct: Record<Side, number> = { player: 1, enemy: 1 };

  private refreshExp(): void {
    this.expFill.width = (PANEL_W - 20) * expProgress(this.state.player.creature);
    const lvText = this.playerPanel.list.find((o) => (o as Phaser.GameObjects.Text).text?.startsWith?.('Lv')) as Phaser.GameObjects.Text | undefined;
    if (lvText) lvText.setText(`Lv${this.state.player.creature.level}`);
  }
  private refreshHpNum(): void {
    const c = this.state.player.creature;
    const num = this.playerPanel.getByName('hpnum') as Phaser.GameObjects.Text | null;
    if (num) num.setText(`${c.currentHp}/${statOf(c, 'mhp')}`);
  }

  private async swapPlayerSprite(): Promise<void> {
    this.lastPct.player = this.state.player.creature.currentHp / statOf(this.state.player.creature, 'mhp');
    this.playerSprite.setTexture(`mon_${this.state.player.creature.speciesId}`).setAlpha(1).setScale(0.86).setFlipX(true).setY(PLAYER_Y);
    this.playerHp.redraw(this.lastPct.player);
    this.refreshHpNum();
    this.refreshExp();
    await this.wait(50);
  }

  /** Trainer sent out their next beast — swap the enemy sprite + panel text. */
  private async swapEnemySprite(): Promise<void> {
    const e = this.state.enemy.creature;
    this.lastPct.enemy = e.currentHp / statOf(e, 'mhp');
    this.enemySprite.setTexture(`mon_${e.speciesId}`).setAlpha(1).setScale(0.74).setPosition(ENEMY_X, ENEMY_Y);
    if (e.shiny) this.enemySprite.setTint(0xfff2a8); else this.enemySprite.clearTint();
    this.enemyHp.redraw(this.lastPct.enemy);
    const texts = this.enemyPanel.list.filter((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text);
    if (texts[0]) texts[0].setText(displayName(e)); // name (added first in makePanel)
    if (texts[1]) texts[1].setText(`Lv${e.level}`); // level (added second)
    await this.wait(60);
  }

  private tintAil(side: Side): void {
    (side === 'enemy' ? this.enemySprite : this.playerSprite).setTint(0xb072ff);
  }
  private clearTint(side: Side): void {
    (side === 'enemy' ? this.enemySprite : this.playerSprite).clearTint();
  }

  private floatNumber(x: number, y: number, amount: number, crit: boolean, color = '#ffffff'): void {
    const t = this.add.text(x, y, `${amount}`, {
      fontFamily: 'monospace', fontSize: crit ? '22px' : '16px',
      color: crit ? '#ffd166' : color, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(90);
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 800, ease: 'Quad.out', onComplete: () => t.destroy() });
  }

  // ---- message typewriter ----
  private setMessage(text: string): void {
    this.msgText.setText(text);
  }
  private async say(text: string, opts: { quick?: boolean } = {}): Promise<void> {
    this.skip = false;
    this.msgText.setText('');
    const speed = opts.quick ? 8 : 16;
    for (let i = 0; i <= text.length; i++) {
      if (this.skip) { this.msgText.setText(text); break; }
      this.msgText.setText(text.slice(0, i));
      await this.wait(speed);
    }
    const hold = opts.quick ? 280 : 650;
    await this.waitOrSkip(hold);
  }
  private async waitOrSkip(ms: number): Promise<void> {
    this.skip = false;
    const start = this.time.now;
    while (this.time.now - start < ms && !this.skip) {
      await this.wait(30);
    }
  }

  // ---- generic cursor menu ----
  private chooseMenu(items: MenuItem[], cols: number, opts: { allowCancel?: boolean; title?: string; wide?: boolean } = {}): Promise<number | 'cancel'> {
    return new Promise((resolve) => {
      if (opts.title) this.setMessage(opts.title);
      const firstEnabled = items.findIndex((i) => !i.disabled);
      this.menu = { items, cursor: firstEnabled === -1 ? 0 : firstEnabled, cols, wide: opts.wide ?? false, resolve };
      this.mode = 'choosing';
      this.renderMenu();
    });
  }

  private clearMenu(): void {
    this.menuGfx?.destroy();
    this.menuGfx = null;
  }

  private renderMenu(): void {
    this.clearMenu();
    if (!this.menu) return;
    const { cols } = this.menu;
    // Multi-column menus (commands, moves) fill the bottom-right action box;
    // single-column lists (bag, team) get a centered panel above the bar.
    this.menuGfx = cols >= 2 ? this.renderGridMenu() : this.renderListMenu();
  }

  private renderGridMenu(): Phaser.GameObjects.Container {
    const { items, cursor, cols, wide } = this.menu!;
    const cont = this.add.container(0, 0).setDepth(75);
    // wide menus (move list) span the whole bar; compact menus sit in the right box.
    const boxX = wide ? 8 : MENU_X;
    const boxW = wide ? W - 16 : MENU_W;
    const panel = this.add.graphics();
    panel.fillStyle(0x0d1526, 0.96); panel.fillRoundedRect(boxX, BAR_Y, boxW, BAR_H, 7);
    panel.lineStyle(2, 0x8be0ff, 0.85); panel.strokeRoundedRect(boxX, BAR_Y, boxW, BAR_H, 7);
    cont.add(panel);
    const padX = 8, padY = 8;
    const rows = Math.ceil(items.length / cols);
    const cellW = (boxW - padX * 2) / cols;
    const cellH = (BAR_H - padY * 2) / rows;
    items.forEach((it, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = boxX + padX + col * cellW;
      const y = BAR_Y + padY + row * cellH;
      const selected = i === cursor;
      const cell = this.add.graphics();
      cell.fillStyle(selected ? 0x24426a : 0x16243c, 1);
      cell.fillRoundedRect(x + 1, y + 1, cellW - 4, cellH - 3, 4);
      if (selected) { cell.lineStyle(2, 0x8be0ff, 1); cell.strokeRoundedRect(x + 1, y + 1, cellW - 4, cellH - 3, 4); }
      // colour accent stripe on the left edge
      cell.fillStyle(Phaser.Display.Color.HexStringToColor(it.color ?? '#8be0ff').color, it.disabled ? 0.3 : 1);
      cell.fillRect(x + 2, y + 3, 3, cellH - 7);
      cont.add(cell);
      // Name on the left, "TYPE pp/pp" right-aligned — one vertically-centred
      // line so the two never overlap.
      const cyText = y + Math.round((cellH - 13) / 2);
      const label = this.add.text(x + 11, cyText, it.label, {
        fontFamily: 'monospace', fontSize: '13px',
        color: it.disabled ? '#5a6577' : it.color ?? '#ffffff',
      });
      cont.add(label);
      if (it.sub) {
        const sub = this.add.text(x + cellW - 10, cyText + 3, it.sub, {
          fontFamily: 'monospace', fontSize: '9px', color: it.disabled ? '#4a5364' : '#9fb0c8',
        }).setOrigin(1, 0);
        cont.add(sub);
      }
    });
    return cont;
  }

  private renderListMenu(): Phaser.GameObjects.Container {
    const { items, cursor } = this.menu!;
    const cont = this.add.container(0, 0).setDepth(75);
    const rowH = 24, padX = 12, padY = 10;
    const listW = 320;
    const listH = padY * 2 + items.length * rowH;
    const bx = Math.round((W - listW) / 2);
    const by = BAR_Y - listH - 6;
    const panel = this.add.graphics();
    panel.fillStyle(0x0d1526, 0.96); panel.fillRoundedRect(bx, by, listW, listH, 7);
    panel.lineStyle(2, 0x8be0ff, 0.85); panel.strokeRoundedRect(bx, by, listW, listH, 7);
    cont.add(panel);
    items.forEach((it, i) => {
      const y = by + padY + i * rowH;
      const selected = i === cursor;
      if (selected) {
        const hl = this.add.graphics();
        hl.fillStyle(0x24426a, 1); hl.fillRoundedRect(bx + 6, y - 2, listW - 12, rowH - 2, 4);
        hl.lineStyle(2, 0x8be0ff, 1); hl.strokeRoundedRect(bx + 6, y - 2, listW - 12, rowH - 2, 4);
        cont.add(hl);
      }
      const label = this.add.text(bx + padX + 4, y + 2, it.label, {
        fontFamily: 'monospace', fontSize: '13px', color: it.disabled ? '#5a6577' : it.color ?? '#ffffff',
      });
      cont.add(label);
      if (it.sub) {
        const sub = this.add.text(bx + listW - padX, y + 4, it.sub, { fontFamily: 'monospace', fontSize: '10px', color: '#9fb0c8' }).setOrigin(1, 0);
        cont.add(sub);
      }
    });
    return cont;
  }

  private tweenP(cfg: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.tweens.add({ ...cfg, onComplete: () => resolve() } as any);
    });
  }
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }
}

interface MenuItem {
  index: number;
  label: string;
  sub?: string;
  color?: string;
  disabled?: boolean;
}

const hex = (n: string) => n;
