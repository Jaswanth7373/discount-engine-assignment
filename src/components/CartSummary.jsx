/**
 * CartSummary.jsx
 *
 * Checkout view of a CartCalculation, laid out like the brief's "Expected Results":
 * ITEM · PRODUCT · BASE PRICE · RULE(S) APPLIED · FINAL PRICE · STATUS, then
 * cart total before offer, the cart offer row (only when it applies), an unlock
 * nudge when the cart is just short of a cart offer, and the final cart total.
 * Each rule line is followed by the plain-language explanation the customer reads.
 */

import { formatRs } from '../engine/format.js'
import { offerValue } from '../engine/discountEngine.js'

const STATUS_TAGS = {
  'max-discount': { label: 'Max discount',     color: '#1e5c2c', bg: '#e3f3e6' },
  stacked:        { label: 'Stacked',          color: '#1c3f94', bg: '#e6ecfb' },
  applied:        { label: 'Discount applied', color: '#1e5c2c', bg: '#e3f3e6' },
  none:           { label: 'No offer',         color: '#666',    bg: '#eee' },
  cart:           { label: 'Cart offer',       color: '#7a4f00', bg: '#fdf0cc' },
}

function StatusTag({ status }) {
  const t = STATUS_TAGS[status]
  return (
    <span
      data-testid="status"
      style={{
        display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
        background: t.bg, color: t.color, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
      }}
    >
      {t.label}
    </span>
  )
}

const th = { padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }
const td = { padding: '7px 10px', color: '#131A48', verticalAlign: 'top', borderBottom: '1px solid #f0f0f0' }
const money = { ...td, whiteSpace: 'nowrap' }

export default function CartSummary({ calculation }) {
  const { items, subtotal, cartOffer, nudge, total, totalSavings } = calculation

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #CECECE', borderRadius: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#131A48', color: '#fff' }}>
              <th style={th}>Item</th>
              <th style={th}>Product</th>
              <th style={th}>Base Price</th>
              <th style={th}>Rule(s) Applied</th>
              <th style={th}>Final Price</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => (
              <tr key={r.itemId} data-testid="item-row" style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={money} data-col="itemId">{r.itemId}</td>
                <td style={td} data-col="product">
                  <div style={{ fontWeight: 600 }}>{r.product}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{r.brand} · {r.platform}</div>
                </td>
                <td style={money} data-col="basePrice">{formatRs(r.basePrice)}</td>
                <td style={{ ...td, minWidth: 220 }}>
                  <div data-testid="rules-applied" style={{ fontWeight: 600, color: r.status === 'none' ? '#888' : '#131A48' }}>
                    {r.rulesApplied}
                  </div>
                  <div data-testid="reasoning" style={{ fontSize: 11, color: '#555', marginTop: 2, fontStyle: r.status === 'none' ? 'italic' : 'normal' }}>
                    {r.reasoning}
                  </div>
                </td>
                <td style={money} data-col="finalPrice">
                  <div style={{ fontWeight: 700, color: r.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>{formatRs(r.finalPrice)}</div>
                  {r.totalDiscount > 0 && (
                    <div style={{ fontSize: 11, color: '#1e5c2c' }}>You save {formatRs(r.totalDiscount)}</div>
                  )}
                </td>
                <td style={td}><StatusTag status={r.status} /></td>
              </tr>
            ))}

            <tr style={{ background: '#fffbea' }}>
              <td style={{ ...td, fontWeight: 700 }} colSpan={2}>Cart Total before offer</td>
              <td style={{ ...money, fontWeight: 700 }} data-testid="subtotal">{formatRs(subtotal)}</td>
              <td style={td} colSpan={3} />
            </tr>

            {cartOffer && (
              <tr data-testid="cart-offer" style={{ background: '#fff8e1' }}>
                <td style={{ ...td, fontWeight: 700, color: '#7a4f00' }} colSpan={2}>
                  Cart Offer — {cartOffer.rule.ruleId}
                </td>
                <td style={td} />
                <td style={td}>
                  <div data-testid="cart-offer-label" style={{ fontWeight: 600, color: '#7a4f00' }}>
                    Cart offer: {offerValue(cartOffer.rule)} — {formatRs(cartOffer.saving)} saved
                  </div>
                  <div data-testid="cart-offer-explanation" style={{ fontSize: 11, color: '#7a5a20', marginTop: 2 }}>
                    {cartOffer.explanation}
                  </div>
                </td>
                <td style={{ ...money, fontWeight: 700, color: '#1e5c2c' }}>−{formatRs(cartOffer.saving)}</td>
                <td style={td}><StatusTag status="cart" /></td>
              </tr>
            )}

            <tr style={{ background: '#e8f4ea' }}>
              <td style={{ ...td, fontWeight: 700, fontSize: 13 }} colSpan={2}>Final Cart Total</td>
              <td style={{ ...money, fontWeight: 700, fontSize: 16 }} data-testid="total">{formatRs(total)}</td>
              <td style={{ ...td, color: '#1e5c2c' }} colSpan={3}>
                {totalSavings > 0 ? `You save ${formatRs(totalSavings)} in total` : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {nudge && (
        <div role="status" data-testid="nudge" style={{ fontSize: 12, color: '#1c3f94', background: '#eef2fd', borderRadius: 4, padding: '0.5rem 0.7rem', marginTop: '0.6rem' }}>
          Add {formatRs(nudge.shortBy)} more to unlock {offerValue(nudge.rule)} your cart
          <span style={{ color: '#5a6ea8' }}> ({nudge.rule.ruleId}: cart total must reach {formatRs(nudge.rule.minCartValue)})</span>
        </div>
      )}
    </div>
  )
}
