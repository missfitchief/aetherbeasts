import { useState } from 'react';
import { useGame } from '../../state/store.js';
import { useNet, quoteExchange, redeemExchange } from '../../net/net.js';
import { Modal } from '../Panels.js';

/** The Aether Exchange: convert the cashable LUMEN token to on-chain $AETHER.
 *  One-way, server-authoritative, paid from a revenue-funded Rewards Pool. */
export function ExchangePanel() {
  const closePanel = useGame((s) => s.closePanel);
  const profile = useNet((s) => s.profile);
  const quote = useNet((s) => s.exchangeQuote);
  const busy = useNet((s) => s.exchangeBusy);
  const enabled = useNet((s) => s.exchangeEnabled);
  const [amount, setAmount] = useState(50);

  const lumen = profile?.lumen ?? 0;

  return (
    <Modal title="◆ The Aether Exchange" onClose={closePanel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        {!enabled && <p className="small muted" style={{ margin: 0 }}>The Exchange isn't open yet — cash-out goes live once the economy is enabled.</p>}

        <div className="rift-curr">
          <span className="rift-bal">◆ {lumen.toLocaleString()} LUMEN</span>
          <span className="muted small">Trade LUMEN for on-chain $AETHER. One-way, paid from the community Rewards Pool.</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="small">Convert{' '}
            <input
              type="number" min={1} value={amount}
              onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              style={{ width: 90 }}
            />{' '}LUMEN
          </label>
          <button className="btn" disabled={busy || !enabled} onClick={() => quoteExchange(amount)}>Get quote</button>
        </div>

        {quote && (
          <div style={{ border: '1px solid #2a3550', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {!quote.eligible && <div className="small" style={{ color: '#ffcf5c' }}>{quote.reason ?? 'Not eligible to cash out yet.'}</div>}
            {quote.eligible && !quote.ok && <div className="small" style={{ color: '#ffcf5c' }}>{quote.reason ?? 'Cannot cash out right now.'}</div>}
            {quote.ok && (
              <>
                <Row label="You convert" value={`${quote.acceptedLumen} LUMEN`} />
                <Row label={`Burn tax (${(quote.taxRate * 100).toFixed(0)}%)`} value={`-${quote.burnedLumen.toFixed(1)} LUMEN`} />
                <Row label="You receive" value={`${quote.aether} $AETHER`} strong />
              </>
            )}
            <div className="small muted">Redeemable: {quote.redeemable} · daily left: {quote.dailyRemaining} · weekly left: {quote.weeklyRemaining}</div>
          </div>
        )}

        <button className="btn big gold" disabled={busy || !enabled || !quote?.ok} onClick={() => redeemExchange(amount)}>
          Cash out{quote?.ok ? ` → ${quote.aether} $AETHER` : ''}
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          A 7-day hold applies to newly-earned LUMEN. The rate floats with the live $AETHER price, and the
          Rewards Pool caps total payouts — so the economy can't be drained.
        </p>
      </div>
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="small muted">{label}</span>
      <span className="small" style={{ fontWeight: strong ? 700 : 400, color: strong ? '#ffd166' : undefined }}>{value}</span>
    </div>
  );
}
