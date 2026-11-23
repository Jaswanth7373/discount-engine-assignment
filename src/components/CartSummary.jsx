/**
 * CartSummary.jsx
 *
 * Customer-facing checkout view of a CartCalculation: each item's final price
 * and offer, then the subtotal, the cart offer row (only when it applies),
 * an unlock nudge when the cart is just short of a cart offer, and the total.
 */

import DataTable from './DataTable.jsx'
import { formatRs } from '../engine/format.js'
import { offerValue } from '../engine/discountEngine.js'

const STATUS_TAGS = {
  'max-discount': { label: 'Max discount', color: '#1e5c2c', bg: '#e3f3e6' },
  stacked:        { label: 'Stacked',      color: '#1c3f94', bg: '#e6ecfb' },
  applied:        { label: 'Discount applied', color: '#1e5c2c', bg: '#e3f3e6' },
  none:           { label: 'No offer',     color: '#666',    bg: '#eee' },
}

function StatusTag({ status }) {
  const t = STATUS_TAGS[status]
  return (
    <span
      style={{
        display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
        background: t.bg, color: t.color, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
      }}
    >
      {t.label}
    </span>
  )
}

const COLUMNS = [
  { key: 'product', label: 'Item', render: (v, row) => (
    <>
      <div style={{ fontWeight: 600 }}>{v}</div>
      <div style={{ fontSize: 11, color: '#888' }}>{row.brand} · {row.platform}</div>
    </>
  ) },
  { key: 'basePrice', label: 'Price', render: (v, row) => (
    <span style={{ color: row.totalDiscount > 0 ? '#888' : '#131A48', textDecoration: row.totalDiscount > 0 ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>
      {formatRs(v)}
    </span>
  ) },
  { key: 'finalPrice', label: 'You Pay', render: (v, row) => (
    <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48', whiteSpace: 'nowrap' }}>
      {formatRs(v)}
    </span>
  ) },
  { key: 'reasoning', label: 'Offer Applied', render: (v, row) => (
    <>
      <div style={{ color: row.status === 'none' ? '#888' : '#131A48', fontStyle: row.status === 'none' ? 'italic' : 'normal' }}>
        {v}
      </div>
      {row.totalDiscount > 0 && (
        <div style={{ fontSize: 11, color: '#1e5c2c', marginTop: 2 }}>You save {formatRs(row.totalDiscount)}</div>
      )}
    </>
  ) },
  { key: 'status', label: 'Status', render: (v) => <StatusTag status={v} /> },
]

const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', padding: '0.45rem 0', fontSize: 13 }

export default function CartSummary({ calculation }) {
  const { items, subtotal, cartOffer, nudge, total, totalSavings } = calculation

  return (
    <div>
      <DataTable columns={COLUMNS} rows={items} rowKey="itemId" />

      <div style={{ marginTop: '0.75rem', marginLeft: 'auto', maxWidth: 440 }}>
        <div style={row}>
          <span style={{ color: '#555' }}>Cart total before cart offer</span>
          <span style={{ fontWeight: 600 }}>{formatRs(subtotal)}</span>
        </div>

        {cartOffer && (
          <div style={{ ...row, background: '#fff8e1', margin: '0 -0.6rem', padding: '0.45rem 0.6rem', borderRadius: 4 }}>
            <span style={{ color: '#7a4f00' }}>
              <strong>Cart offer: {offerValue(cartOffer.rule)}</strong>
              {' '}— {formatRs(cartOffer.saving)} saved
              <span style={{ display: 'block', fontSize: 11, color: '#a07020' }}>
                Your cart is over {formatRs(cartOffer.rule.minCartValue)} ({cartOffer.rule.ruleId})
              </span>
            </span>
            <span style={{ fontWeight: 700, color: '#1e5c2c', whiteSpace: 'nowrap' }}>−{formatRs(cartOffer.saving)}</span>
          </div>
        )}

        {nudge && (
          <div role="status" style={{ fontSize: 12, color: '#1c3f94', background: '#eef2fd', borderRadius: 4, padding: '0.4rem 0.6rem', margin: '0.3rem 0' }}>
            Add {formatRs(nudge.shortBy)} more to unlock {offerValue(nudge.rule)} your cart
          </div>
        )}

        <div style={{ ...row, borderTop: '2px solid #131A48', marginTop: '0.3rem', paddingTop: '0.6rem' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#131A48' }}>Final cart total</span>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#131A48' }}>{formatRs(total)}</span>
        </div>
        {totalSavings > 0 && (
          <div style={{ textAlign: 'right', fontSize: 12, color: '#1e5c2c' }}>
            You save {formatRs(totalSavings)} in total
          </div>
        )}
      </div>
    </div>
  )
}
