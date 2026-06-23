import { useGame } from '../../state/store.js';
import { Modal } from '../Panels.js';

interface Section { icon: string; title: string; body: string }

const SECTIONS: Section[] = [
  { icon: '🎮', title: 'Controls',
    body: 'Move with WASD or the arrow keys. Press Space (or E / Z) to talk, read signs, and confirm. Open this menu with M, your Bag with B, and press Esc to back out of anything.' },
  { icon: '🌿', title: 'Wild beasts',
    body: 'Walk through the tall grass on Whisperwood Route to meet wild Aetherbeasts. A fresh one roams every so often — watch the 🐾 timer at the top. Weaken a beast in battle, then open BAG and throw a Pact Stone; the lower its HP (and the more status it has), the better your catch odds.' },
  { icon: '⚔️', title: 'Battles',
    body: 'Pick FIGHT to attack, BAG to catch or heal, TEAM to switch, RUN to flee. Types matter — hitting a weakness deals extra damage. Winning earns EXP, levels, new moves, and ◈ GLINT.' },
  { icon: '🏠', title: 'Home & ⛪ Chapel',
    body: 'Sleep in your bed at Home, or kneel at the Chapel altar, to fully heal your team AND save your progress. Use them as checkpoints before a tough fight or a long trip.' },
  { icon: '🛒', title: 'Provisioner (Shop)',
    body: 'Spend ◈ GLINT on Pact Stones (to catch beasts) and Potions (to heal in battle). Stock up before you head out.' },
  { icon: '🔬', title: "Wren's Lab",
    body: 'The ✦ Aether Rift summons brand-new beasts for ◈. The Evolution Chamber awakens beasts that are ready to evolve. Professor Wren is there if you need help.' },
  { icon: '✦', title: 'Summoning & evolution',
    body: 'Summon at the Rift to add powerful beasts to your collection — pity guarantees a 5★ eventually. Many beasts evolve at a set level after a won battle, growing stronger and changing form.' },
  { icon: '🗓️', title: 'Quests & Season Points',
    body: 'Daily and weekly quests reward ◈ and Season Points — keep a login streak for bonus ◈. Season Points are your standing for future $AETHER airdrops, so playing daily pays off.' },
  { icon: '⚔️', title: 'PvP Arena',
    body: 'Open the Arena to quick-match another trainer and wager Battle Credits (a closed-loop, in-game currency — never real tokens). Win to take the pot and climb the rating.' },
  { icon: '◈', title: 'About the currencies',
    body: 'GLINT (◈) is the in-game currency you earn and spend on summons and the shop. $AETHER is the separate on-chain token. Battle Credits (for PvP) are separate and non-cashable. The game is built to be fun without spending a cent.' },
];

export function HelpPanel() {
  const closePanel = useGame((s) => s.closePanel);
  return (
    <Modal title="❔ How to Play" onClose={closePanel}>
      <div className="help">
        {SECTIONS.map((s) => (
          <div key={s.title} className="help-row">
            <span className="help-icon">{s.icon}</span>
            <div>
              <div className="help-title">{s.title}</div>
              <div className="muted small">{s.body}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
