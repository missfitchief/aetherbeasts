import { useGame } from '../../state/store.js';
import { useNet, logout } from '../../net/net.js';
import { dexCounts } from '@aether/shared';
import { Modal } from '../Panels.js';

export function MenuPanel() {
  const openPanel = useGame((s) => s.openPanel);
  const closePanel = useGame((s) => s.closePanel);
  const persist = useGame((s) => s.persist);
  const setScreen = useGame((s) => s.setScreen);
  const showToast = useGame((s) => s.showToast);
  const save = useGame((s) => s.save);
  const exchangeEnabled = useNet((s) => s.exchangeEnabled);
  const wallet = useNet((s) => s.wallet);
  if (!save) return null;
  const dc = dexCounts(save);

  const items: { emoji: string; label: string; sub?: string; onClick: () => void }[] = [
    { emoji: '🛡️', label: 'Team', sub: `${save.party.length}/6`, onClick: () => openPanel('party') },
    { emoji: '🗓️', label: 'Quests', sub: 'Daily / Weekly', onClick: () => openPanel('quests') },
    { emoji: '🎁', label: 'Daily Login', sub: 'Reward', onClick: () => openPanel('login') },
    { emoji: '📣', label: 'Share', sub: 'My team', onClick: () => openPanel('share') },
    { emoji: '✦', label: 'Aether Rift', sub: 'Summon', onClick: () => openPanel('summon') },
    ...(exchangeEnabled ? [{ emoji: '◆', label: 'Aether Exchange', sub: 'Cash out LUMEN', onClick: () => openPanel('exchange') }] : []),
    { emoji: '🎒', label: 'Bag', onClick: () => openPanel('bag') },
    { emoji: '📖', label: 'Aether-Dex', sub: `${dc.caught}/${dc.total}`, onClick: () => openPanel('dex') },
    { emoji: '🌀', label: 'Spirit Realm', sub: 'Storage', onClick: () => openPanel('box') },
    { emoji: '❔', label: 'How to Play', sub: 'Guide', onClick: () => openPanel('help') },
    {
      emoji: '💾',
      label: 'Save Game',
      onClick: () => {
        persist();
        showToast('Game saved.');
      },
    },
    {
      emoji: '🚪',
      label: 'Title Screen',
      onClick: () => {
        persist();
        closePanel();
        setScreen('title');
      },
    },
    {
      emoji: '🔌',
      label: 'Switch Wallet',
      sub: wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : 'Log out',
      onClick: () => {
        if (window.confirm('Log out and switch wallet? Your progress is saved to this wallet.')) {
          persist();
          void logout();
        }
      },
    },
  ];

  return (
    <Modal title="Menu" onClose={closePanel}>
      <div className="menu-grid">
        {items.map((it) => (
          <div key={it.label} className="menu-item" onClick={it.onClick}>
            <span className="emoji">{it.emoji}</span>
            <div>
              <div>{it.label}</div>
              {it.sub && <div className="muted small">{it.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
