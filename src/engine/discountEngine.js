/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no I/O, no knowledge of where
 * rules or cart items came from (CSV, PDF, LLM, ...). Input adapters in
 * src/inputs/ produce these shapes; this file never imports from there.
 *
 * Data shapes:
 *
 * @typedef {Object} DiscountRule
 * @property {string} ruleId              e.g. "RULE-01"
 * @property {'brand'|'platform'|'cart'} scope
 * @property {string|null} appliesTo      brand/platform name; null for cart rules
 * @property {'percentage'|'flat'} type
 * @property {number} value               percentage as a number (15 = 15%), flat in rupees
 * @property {boolean} stackable          ignored for cart rules (only one cart offer applies)
 * @property {number|null} minCartValue   cart rules only: threshold in rupees (inclusive)
 *
 * @typedef {Object} CartItem
 * @property {string} itemId
 * @property {string} product
 * @property {string} brand
 * @property {string} platform
 * @property {number} basePrice           whole rupees
 *
 * @typedef {'max-discount'|'stacked'|'applied'|'none'} OfferStatus
 *
 * @typedef {Object} DiscountResult
 * @property {string} itemId
 * @property {string} product
 * @property {string} brand
 * @property {string} platform
 * @property {number} basePrice
 * @property {number} finalPrice          rounded to the nearest rupee (half up)
 * @property {number} totalDiscount
 * @property {string[]} appliedRules      in the order they were applied
 * @property {string[]} skippedRules      non-stackable rules that lost to the winner
 * @property {OfferStatus} status
 * @property {string} reasoning           customer-readable explanation
 *
 * @typedef {Object} CartOffer
 * @property {DiscountRule} rule
 * @property {number} saving              whole rupees
 *
 * @typedef {Object} CartNudge
 * @property {DiscountRule} rule
 * @property {number} shortBy             rupees still needed to unlock the rule
 *
 * @typedef {Object} CartCalculation
 * @property {DiscountResult[]} items
 * @property {number} subtotal            sum of final item prices
 * @property {CartOffer|null} cartOffer
 * @property {CartNudge|null} nudge
 * @property {number} total               subtotal minus the cart offer
 * @property {number} totalSavings        item savings + cart offer saving
 */

import { formatRs } from './format.js'

// ── Helpers ──────────────────────────────────────────────────────

const normalise = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '')

/** Rounds to the nearest rupee, halves going up. Epsilon absorbs float noise (e.g. 0.1 + 0.2). */
export function roundRupees(amount) {
  return Math.floor(amount + 0.5 + 1e-9)
}

/** Orders rule IDs naturally so RULE-2 < RULE-10. */
function compareRuleIds(a, b) {
  return a.ruleId.localeCompare(b.ruleId, undefined, { numeric: true })
}

function isCartRule(rule) {
  return rule.scope === 'cart'
}

// ── Item-level rules ─────────────────────────────────────────────

/**
 * Returns true if the item-level rule applies to this cart item.
 * Cart rules never match individual items.
 */
export function ruleMatchesItem(item, rule) {
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  return false
}

/**
 * Exact (unrounded) rupee discount a rule gives on a price.
 * Uses the price passed in, not the base price, which is what makes stacking compound.
 * A flat discount never exceeds the price, so a price can't go negative.
 */
export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') {
    return (price * Math.min(rule.value, 100)) / 100
  }
  if (rule.type === 'flat') {
    return Math.min(rule.value, price)
  }
  return 0
}

/** Short customer-facing name of the offer, e.g. "Amazon India offer". */
export function offerName(rule) {
  if (rule.scope === 'brand') return `${rule.appliesTo} brand offer`
  if (rule.scope === 'platform') return `${rule.appliesTo} offer`
  return 'Cart offer'
}

/** "15% off" / "Rs.150 off" */
export function offerValue(rule) {
  return rule.type === 'percentage' ? `${rule.value}% off` : `${formatRs(rule.value)} off`
}

/**
 * Picks the non-stackable rule with the largest exact saving on the base price.
 * Ties go to the lowest rule ID so the result never depends on input order.
 */
function pickWinner(basePrice, nonStackable) {
  const ranked = nonStackable
    .map((rule) => ({ rule, saving: calculateDiscountAmount(basePrice, rule) }))
    .sort((a, b) => b.saving - a.saving || compareRuleIds(a.rule, b.rule))
  return { winner: ranked[0] ?? null, losers: ranked.slice(1) }
}

function buildReasoning(winner, losers, stacked) {
  const parts = []

  if (winner) {
    let text = `${offerName(winner.rule)}: ${offerValue(winner.rule)}`
    if (losers.length > 0) {
      const best = losers[0]
      const tied = roundRupees(best.saving) === roundRupees(winner.saving)
      text += tied
        ? ` (same saving as the ${offerName(best.rule)}, so we applied one of them)`
        : ` (saves ${formatRs(roundRupees(winner.saving))}, more than the ${formatRs(
            roundRupees(best.saving),
          )} ${offerName(best.rule)})`
    }
    parts.push(text)
  }

  for (const rule of stacked) {
    const onTop = parts.length > 0
    parts.push(
      onTop
        ? `${offerName(rule)}: extra ${offerValue(rule)} (stacked)`
        : `${offerName(rule)}: ${offerValue(rule)}`,
    )
  }

  return parts.join(' + ')
}

/**
 * Applies the active item-level discount rules to a single cart item.
 *
 * Logic:
 *   1. Find all item-level rules that match this item.
 *   2. Among non-stackable rules, pick the one giving the largest saving (scope irrelevant).
 *   3. Apply stackable rules on top of the discounted price, in rule ID order.
 *   4. Round the final price once, to the nearest rupee.
 *
 * @param {CartItem} item
 * @param {DiscountRule[]} rules
 * @returns {DiscountResult}
 */
export function applyDiscounts(item, rules) {
  const base = {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
  }

  const matchingRules = rules.filter((r) => ruleMatchesItem(item, r))

  if (matchingRules.length === 0) {
    return {
      ...base,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      status: 'none',
      reasoning: 'No offers available',
    }
  }

  const { winner, losers } = pickWinner(
    item.basePrice,
    matchingRules.filter((r) => !r.stackable),
  )
  const stacked = matchingRules.filter((r) => r.stackable).sort(compareRuleIds)

  let price = item.basePrice
  const appliedRules = []

  if (winner) {
    price -= calculateDiscountAmount(price, winner.rule)
    appliedRules.push(winner.rule.ruleId)
  }
  for (const rule of stacked) {
    price -= calculateDiscountAmount(price, rule)
    appliedRules.push(rule.ruleId)
  }

  const finalPrice = Math.max(0, roundRupees(price))

  /** @type {OfferStatus} */
  let status = 'applied'
  if (appliedRules.length > 1) status = 'stacked'
  else if (losers.length > 0) status = 'max-discount'

  return {
    ...base,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: losers.map((l) => l.rule.ruleId),
    status,
    reasoning: buildReasoning(winner, losers, stacked),
  }
}

/**
 * Runs applyDiscounts across every item in the cart.
 * @returns {DiscountResult[]}
 */
export function processCart(cartItems, rules) {
  return cartItems.map((item) => applyDiscounts(item, rules))
}

/** Sums the final prices across all results. */
export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}

// ── Cart-level rules ─────────────────────────────────────────────

/**
 * Evaluates cart rules against the sum of final item prices.
 * - A rule qualifies when subtotal >= minCartValue.
 * - Only one cart offer applies: the largest saving, ties to the lowest rule ID.
 * - The nudge points at the cheapest-to-unlock rule that would beat the current offer.
 *
 * @param {number} subtotal
 * @param {DiscountRule[]} rules
 * @returns {{ cartOffer: CartOffer|null, nudge: CartNudge|null }}
 */
export function evaluateCartRules(subtotal, rules) {
  const cartRules = rules.filter(isCartRule)
  const savingFor = (rule, amount) => roundRupees(calculateDiscountAmount(amount, rule))

  const qualifying = cartRules
    .filter((r) => subtotal > 0 && subtotal >= (r.minCartValue ?? 0))
    .map((rule) => ({ rule, saving: savingFor(rule, subtotal) }))
    .sort((a, b) => b.saving - a.saving || compareRuleIds(a.rule, b.rule))

  const cartOffer = qualifying[0] ?? null
  const currentSaving = cartOffer?.saving ?? 0

  const nudgeRule = cartRules
    .filter((r) => subtotal > 0 && subtotal < (r.minCartValue ?? 0))
    .filter((r) => savingFor(r, r.minCartValue) > currentSaving)
    .sort((a, b) => a.minCartValue - b.minCartValue || compareRuleIds(a, b))[0]

  const nudge = nudgeRule ? { rule: nudgeRule, shortBy: nudgeRule.minCartValue - subtotal } : null

  return { cartOffer, nudge }
}

/**
 * Full cart calculation: item-level discounts first, then at most one cart offer
 * applied to the sum of final item prices.
 *
 * @param {CartItem[]} cartItems
 * @param {DiscountRule[]} rules
 * @returns {CartCalculation}
 */
export function calculateCart(cartItems, rules) {
  const items = processCart(cartItems, rules)
  const subtotal = cartTotal(items)
  const { cartOffer, nudge } = evaluateCartRules(subtotal, rules)
  const total = subtotal - (cartOffer?.saving ?? 0)
  const itemSavings = items.reduce((sum, r) => sum + r.totalDiscount, 0)

  return {
    items,
    subtotal,
    cartOffer,
    nudge,
    total,
    totalSavings: itemSavings + (cartOffer?.saving ?? 0),
  }
}
