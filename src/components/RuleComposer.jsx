/**
 * RuleComposer.jsx
 *
 * Plain-English rule input → AI parse → confirmation card → onConfirm(rule).
 * Nothing is added to the active rules until the user presses Confirm.
 */

import { useMemo, useState } from 'react'
import Notice from './Notice.jsx'
import { parseRuleText, MAX_TEXT_LENGTH } from '../inputs/nlRule.js'
import { checkAppliesTo } from '../inputs/ruleHints.js'
import { nextRuleId } from '../inputs/ruleSchema.js'
import { calculateCart, offerValue } from '../engine/discountEngine.js'
import { formatRs } from '../engine/format.js'

const EXAMPLES = [
  '20% off for Natura Casa brand, stackable with other offers',
  'Rs.100 flat discount on all Flipkart items',
  '10% off if cart value is more than Rs.5,000',
  'Give a discount for big orders',
]

const S = {
  textarea: { width: '100%', minHeight: 64, resize: 'vertical', font: 'inherit', fontSize: 13, padding: '0.55rem 0.7rem', border: '1px solid #CECECE', borderRadius: 4 },
  btn: (variant, enabled = true) => ({
    background: !enabled ? '#CECECE' : variant === 'primary' ? '#FF5800' : variant === 'confirm' ? '#1e5c2c' : '#fff',
    color: variant === 'ghost' && enabled ? '#131A48' : '#fff',
    border: variant === 'ghost' ? '1px solid #CECECE' : 'none',
    borderRadius: 4, padding: '0.5rem 1.1rem', fontSize: 12, fontWeight: 700,
    cursor: enabled ? 'pointer' : 'not-allowed', letterSpacing: '0.04em', textTransform: 'uppercase',
  }),
  chip: { background: '#f3f4f8', border: '1px solid #e1e3ec', borderRadius: 14, padding: '3px 10px', fontSize: 11, color: '#131A48', cursor: 'pointer', font: 'inherit' },
  card: { border: '1px solid #131A48', borderRadius: 6, padding: '0.9rem 1rem', marginTop: '0.75rem', background: '#fbfbfe' },
  dl: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', margin: '0.5rem 0', fontSize: 13 },
  dt: { color: '#666' },
  dd: { margin: 0, fontWeight: 600, color: '#131A48' },
}

function describeImpact(before, after) {
  const changed = after.items.filter((item, i) => item.finalPrice !== before.items[i].finalPrice).length
  const diff = before.total - after.total
  const cartOfferChanged = before.cartOffer?.rule.ruleId !== after.cartOffer?.rule.ruleId
  if (diff === 0 && changed === 0 && !cartOfferChanged) {
    return 'No change to the current cart.'
  }
  const what = [changed > 0 && `${changed} item price${changed === 1 ? '' : 's'}`, cartOfferChanged && 'the cart offer']
    .filter(Boolean)
    .join(' and ')
  const direction = diff >= 0 ? `saves the customer ${formatRs(diff)} more` : `costs the customer ${formatRs(-diff)} more`
  return `Changes ${what || 'nothing visible'}. Cart total ${formatRs(before.total)} → ${formatRs(after.total)} (${direction}).`
}

export default function RuleComposer({ rules, cartItems, onConfirm }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null) // { message, ambiguous }
  const [candidate, setCandidate] = useState(null) // { rule, reason }

  const newRuleId = nextRuleId(rules)
  const hint = candidate ? checkAppliesTo(candidate.rule, cartItems) : null

  const impact = useMemo(() => {
    if (!candidate || cartItems.length === 0) return null
    const before = calculateCart(cartItems, rules)
    const after = calculateCart(cartItems, [...rules, { ruleId: newRuleId, ...candidate.rule }])
    return describeImpact(before, after)
  }, [candidate, cartItems, rules, newRuleId])

  async function handleParse(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setCandidate(null)
    const result = await parseRuleText(text)
    setLoading(false)
    if (result.ok) setCandidate({ rule: result.data, reason: result.reason })
    else setError({ message: result.error, ambiguous: Boolean(result.ambiguous) })
  }

  function handleConfirm() {
    onConfirm(candidate.rule)
    setCandidate(null)
    setText('')
  }

  function applySuggestion(name) {
    setCandidate((c) => ({ ...c, rule: { ...c.rule, appliesTo: name } }))
  }

  const canParse = text.trim().length > 0 && !loading

  return (
    <div>
      <form onSubmit={handleParse}>
        <label htmlFor="rule-text" style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>
          Describe a new discount in plain English
        </label>
        <textarea
          id="rule-text"
          style={S.textarea}
          value={text}
          maxLength={MAX_TEXT_LENGTH}
          placeholder="e.g. 20% off for Natura Casa brand, stackable with other offers"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && canParse) handleParse(e)
          }}
          disabled={loading}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button type="submit" style={S.btn('primary', canParse)} disabled={!canParse} aria-busy={loading}>
            {loading ? 'Parsing…' : 'Parse rule'}
          </button>
          <span style={{ fontSize: 11, color: '#888' }}>
            {text.length}/{MAX_TEXT_LENGTH}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: '0.6rem' }} aria-label="Example rules">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" style={S.chip} onClick={() => setText(ex)} disabled={loading}>
              {ex}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <Notice
          tone={error.ambiguous ? 'warning' : 'error'}
          title={error.ambiguous ? "This rule can't be added yet: it's too vague" : 'Rule not parsed'}
          messages={[error.message]}
        />
      )}

      {candidate && (
        <div style={S.card} role="region" aria-label="Confirm new rule">
          <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>Check this rule before adding it ({newRuleId})</div>
          {candidate.reason && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{candidate.reason}</div>}
          <dl style={S.dl}>
            <dt style={S.dt}>Scope</dt>
            <dd style={S.dd}>{candidate.rule.scope.charAt(0).toUpperCase() + candidate.rule.scope.slice(1)}</dd>
            <dt style={S.dt}>Applies to</dt>
            <dd style={S.dd}>{candidate.rule.appliesTo ?? 'Entire cart'}</dd>
            <dt style={S.dt}>Type</dt>
            <dd style={S.dd}>{candidate.rule.type === 'percentage' ? 'Percentage' : 'Flat'}</dd>
            <dt style={S.dt}>Value</dt>
            <dd style={S.dd}>{offerValue(candidate.rule)}</dd>
            <dt style={S.dt}>Stackable</dt>
            <dd style={S.dd}>{candidate.rule.stackable ? 'Yes' : 'No'}</dd>
            <dt style={S.dt}>Min cart value</dt>
            <dd style={S.dd}>{candidate.rule.minCartValue ? `${formatRs(candidate.rule.minCartValue)} (cart total ≥ this)` : '—'}</dd>
          </dl>

          {hint && (
            <Notice tone="warning" title="Heads up" messages={[hint.message]} />
          )}
          {hint?.suggestion && (
            <button type="button" style={{ ...S.chip, marginTop: 6 }} onClick={() => applySuggestion(hint.suggestion)}>
              Did you mean {hint.suggestion}? Use it
            </button>
          )}
          {impact && <div style={{ fontSize: 12, color: '#1c3f94', marginTop: 8 }}>Preview: {impact}</div>}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" style={S.btn('confirm')} onClick={handleConfirm}>Confirm & add</button>
            <button type="button" style={S.btn('ghost')} onClick={() => setCandidate(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  )
}
