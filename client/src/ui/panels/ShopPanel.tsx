import { SHOP_STOCK, getItem, itemCount } from '@aether/shared';
import { useGame } from '../../state/store.js';
import { audio } from '../../game/audio.js';
import { Modal } from '../Panels.js';

export function ShopPanel() {
  const save = useGame((s) => s.save);
  const buyItem = useGame((s) => s.buyItem);
  const closePanel = useGame((s) => s.closePanel);
  const showToast = useGame((s) => s.showToast);
  if (!save) return null;

  const buy = (id: string, price: number, name: string) => {
    if (buyItem(id, price)) {
      audio.sfx('sfx_purchase', 0.5);
      showToast(`Bought ${name}.`);
    } else {
      audio.sfx('sfx_buzzer', 0.3);
      showToast('Not enough $AETHER.');
    }
  };

  return (
    <Modal title={`Provisioner · ◈ ${save.aether.toLocaleString()} $AETHER`} onClose={closePanel}>
      {SHOP_STOCK.map((id) => {
        const it = getItem(id);
        const owned = itemCount(save, id);
        return (
          <div className="row" key={id}>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>
                {it.name} {owned > 0 && <span className="muted small">(have {owned})</span>}
              </div>
              <div className="muted small">{it.desc}</div>
            </div>
            <div className="price">◈ {it.price.toLocaleString()}</div>
            <button className="btn" disabled={save.aether < it.price} onClick={() => buy(id, it.price, it.name)}>
              Buy
            </button>
          </div>
        );
      })}
    </Modal>
  );
}
