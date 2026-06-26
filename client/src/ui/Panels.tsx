import type { ReactNode } from 'react';
import { useGame } from '../state/store.js';
import { MenuPanel } from './panels/MenuPanel.js';
import { PartyPanel } from './panels/PartyPanel.js';
import { BoxPanel } from './panels/BoxPanel.js';
import { DexPanel } from './panels/DexPanel.js';
import { SummaryPanel } from './panels/SummaryPanel.js';
import { BagPanel } from './panels/BagPanel.js';
import { ShopPanel } from './panels/ShopPanel.js';
import { SummonPanel } from './panels/SummonPanel.js';
import { QuestLogPanel } from './panels/QuestLogPanel.js';
import { LoginCalendarPanel } from './panels/LoginCalendarPanel.js';
import { ShareCardPanel } from './panels/ShareCardPanel.js';
import { FairnessPanel } from './panels/FairnessPanel.js';
import { ExchangePanel } from './panels/ExchangePanel.js';
import { ExpeditionPanel } from './panels/ExpeditionPanel.js';
import { ChipsPanel } from './panels/ChipsPanel.js';
import { HelpPanel } from './panels/HelpPanel.js';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="x-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  );
}

export function Panels() {
  const panel = useGame((s) => s.panel);
  if (!panel) return null;
  switch (panel) {
    case 'menu':
      return <MenuPanel />;
    case 'party':
      return <PartyPanel />;
    case 'box':
      return <BoxPanel />;
    case 'dex':
      return <DexPanel />;
    case 'summary':
      return <SummaryPanel />;
    case 'bag':
      return <BagPanel />;
    case 'shop':
      return <ShopPanel />;
    case 'summon':
      return <SummonPanel />;
    case 'quests':
      return <QuestLogPanel />;
    case 'login':
      return <LoginCalendarPanel />;
    case 'share':
      return <ShareCardPanel />;
    case 'fairness':
      return <FairnessPanel />;
    case 'exchange':
      return <ExchangePanel />;
    case 'expedition':
      return <ExpeditionPanel />;
    case 'chips':
      return <ChipsPanel />;
    case 'help':
      return <HelpPanel />;
    default:
      return null;
  }
}
