/**
 * App.jsx
 *
 * Top-level component. Owns the session state (rules + cart) and wires
 * input adapters → engine → display.
 *
 * Every input mode goes through the same two entry points:
 *   loadRules(InputResult<DiscountRule[]>)   loadCart(InputResult<CartItem[]>)
 * Results are derived from state with useMemo, so they re-run whenever the
 * rules or cart change and can never show stale reasoning.
 */

import { useMemo, useState } from 'react'
import FileUploader from './components/FileUploader.jsx'
import DataTable from './components/DataTable.jsx'
import InputStatus from './components/InputStatus.jsx'
import CartSummary from './components/CartSummary.jsx'
import { parseRulesCSV, parseCartCSV } from './inputs/csv.js'
import { calculateCart, offerValue } from './engine/discountEngine.js'
import { formatRs } from './engine/format.js'

// ── Column definitions ───────────────────────────────────────────

const capitalise = (v) => v.charAt(0).toUpperCase() + v.slice(1)

const RULES_COLUMNS = [
  { key: 'ruleId',       label: 'Rule ID' },
  { key: 'scope',        label: 'Scope',      render: capitalise },
  { key: 'appliesTo',    label: 'Applies To', render: (v) => v ?? 'Entire cart' },
  { key: 'value',        label: 'Offer',      render: (_, row) => offerValue(row) },
  { key: 'minCartValue', label: 'Condition',  render: (v) => (v ? `Cart ≥ ${formatRs(v)}` : '—') },
  { key: 'stackable',    label: 'Stackable',  render: (v) => (v ? 'Yes' : 'No') },
]

const CART_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'product',   label: 'Product' },
  { key: 'brand',     label: 'Brand' },
  { key: 'platform',  label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: formatRs },
]

// ── Styles ───────────────────────────────────────────────────────

const S = {
  page:    { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header:  { background: '#131A48', padding: '0.85rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoTxt: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  logoSpan:{ color: '#FF5800' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main:    { maxWidth: 1000, margin: '0 auto', padding: '1.8rem 1.5rem' },
  section: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  count:   { fontSize: 11, color: '#888', marginBottom: 4 },
  btn: (enabled) => ({
    background: enabled ? '#FF5800' : '#CECECE', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: enabled ? 'pointer' : 'not-allowed',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  }),
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// ── Component ────────────────────────────────────────────────────

export default function App() {
  const [rules, setRules]             = useState([])
  const [rulesStatus, setRulesStatus] = useState(null)   // { source, result }

  const [cartItems, setCartItems]     = useState([])
  const [cartStatus, setCartStatus]   = useState(null)   // { source, result }

  const [showResults, setShowResults] = useState(false)

  const calculation = useMemo(() => calculateCart(cartItems, rules), [cartItems, rules])

  // ── Input entry points (shared by every input mode) ──

  /** A failed load never wipes the current rules. */
  function loadRules(result, source) {
    setRulesStatus({ source, result })
    if (result.ok) setRules(result.data)
  }

  /** A failed load never wipes the current cart. */
  function loadCart(result, source, { revealResults = false } = {}) {
    setCartStatus({ source, result })
    if (!result.ok) return
    setCartItems(result.data)
    if (revealResults) setShowResults(true)
  }

  async function handleRulesFile(file) {
    loadRules(parseRulesCSV(await file.text()), file.name)
  }

  async function handleCartCsv(file) {
    loadCart(parseCartCSV(await file.text()), file.name)
  }

  const canCalculate = cartItems.length > 0

  // ── Render ──

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.logoTxt}>O<span style={S.logoSpan}>pp</span>tra</div>
        <div style={S.headerSub}>Discount Engine</div>
      </header>

      <main className="app-main" style={S.main}>
        <div className="grid2">
          {/* Rules */}
          <section style={S.section} aria-labelledby="rules-title">
            <h2 id="rules-title" style={S.sectionTitle}>Discount Rules</h2>
            <FileUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              accept=".csv,text/csv"
              onFile={handleRulesFile}
              hasData={rules.length > 0}
              fileName={rulesStatus?.source}
            />
            <InputStatus status={rulesStatus} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={S.count}>{plural(rules.length, 'active rule')}</div>
                <DataTable columns={RULES_COLUMNS} rows={rules} rowKey="ruleId" />
              </div>
            )}
          </section>

          {/* Cart */}
          <section style={S.section} aria-labelledby="cart-title">
            <h2 id="cart-title" style={S.sectionTitle}>Cart Items</h2>
            <FileUploader
              label="cart.csv"
              description="Upload your cart CSV"
              accept=".csv,text/csv"
              onFile={handleCartCsv}
              hasData={cartItems.length > 0}
              fileName={cartStatus?.source}
            />
            <InputStatus status={cartStatus} />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={S.count}>{plural(cartItems.length, 'item')} in cart</div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} rowKey="itemId" />
              </div>
            )}
          </section>
        </div>

        {!showResults && (
          <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
            <button style={S.btn(canCalculate)} onClick={() => setShowResults(true)} disabled={!canCalculate}>
              Calculate Discounts
            </button>
            {!canCalculate && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>Upload a cart to calculate</div>
            )}
          </div>
        )}

        {showResults && canCalculate && (
          <section style={S.section} aria-labelledby="summary-title" aria-live="polite">
            <h2 id="summary-title" style={S.sectionTitle}>Cart Summary</h2>
            <div style={S.count}>Prices update automatically when rules or the cart change.</div>
            <CartSummary calculation={calculation} />
          </section>
        )}
      </main>
    </div>
  )
}
