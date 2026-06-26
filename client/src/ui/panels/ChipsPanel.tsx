import { useState } from 'react';
import { CHIP_BUY_USD, CHIP_CASHOUT_MIN, chipsForUsd, usdForChips } from '@aether/shared';
import { useGame } from '../../state/store.js';
import { useNet, buyChips, cashoutChips } from '../../net/net.js';
import { Modal } from '../Panels.js';

/**
 * Wager Chips — buy in with $AETHER, wager head-to-head in the Arena, cash out.
 * Chips are a SEPARATE balance from the faucet LUMEN; the cash-out is paid from
 * the treasury that holds the buy-ins (solvent by construction). Shown only when
 * the server has the chip casino enabled.
 */
export function ChipsPanel() {
  const closePanel = useGame((s) => s.closePanel);
  const chips = useNet((s) => s.profile?.chips ?? 0);
  const enabled = useNet((s) => s.chipsEnabled);
  const busy = useNet((s) => s.chipBusy);
  const [amt, setAmt] = useState('');
  const cashAmt = Math.max(0, Math.floor(Number(amt) || 0));

  return (
    <Modal title="🎰 Wager Chips" onClose={closePanel}>
      {!enabled ? (
        <div className="muted">
          The chip casino isn’t open yet. Chips let you wager <b>$AETHER</b> head-to-head in the Arena — buy in, out-battle other tamers, cash out. Coming at launch.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#ffd166' }}>🎰 {chips.toLocaleString()} chips</div>
            <div className="small muted">≈ ${usdForChips(chips).toFixed(2)} · wager these in the Arena</div>
          </div>

          <div>
            <div className="small muted" style={{ marginBottom: 4 }}>Buy chips with $AETHER</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CHIP_BUY_USD.map((usd) => (
                <button key={usd} className="btn" disabled={busy} onClick={() => buyChips(usd)}>
                  ${usd} · {chipsForUsd(usd).toLocaleString()} 🎰
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="small muted" style={{ marginBottom: 4 }}>Cash out chips → $AETHER (min {CHIP_CASHOUT_MIN})</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={amt}
                inputMode="numeric"
                onChange={(e) => setAmt(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="chips"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button className="btn" disabled={busy || cashAmt < CHIP_CASHOUT_MIN || cashAmt > chips} onClick={() => cashoutChips(cashAmt)}>
                Cash out
              </button>
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>≈ ${usdForChips(cashAmt).toFixed(2)} in $AETHER</div>
          </div>

          <div className="small muted">A wagering balance — buy in, win by out-battling others, cash out. Not an investment.</div>
        </div>
      )}
    </Modal>
  );
}
