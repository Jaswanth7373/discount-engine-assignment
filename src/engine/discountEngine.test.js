import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyDiscounts, calculateCart, evaluateCartRules, roundRupees } from './discountEngine.js'
import { parseRulesCSV, parseCartCSV } from '../inputs/csv.js'

const sample = (name) => readFileSync(new URL(`../../sample-data/${name}`, import.meta.url), 'utf8')

const rule = (overrides) => ({
  ruleId: 'RULE-X',
  scope: 'platform',
  appliesTo: 'Amazon India',
  type: 'percentage',
  value: 10,
  stackable: false,
  minCartValue: null,
  ...overrides,
})
const item = (overrides) => ({
  itemId: 'ITEM-01',
  product: 'Thing',
  brand: 'Natura Casa',
  platform: 'Amazon India',
  basePrice: 1000,
  ...overrides,
})
const cartRule = (id, value, min) =>
  rule({ ruleId: id, scope: 'cart', appliesTo: null, value, minCartValue: min })

describe('sample data (expected results from the brief)', () => {
  const rules = parseRulesCSV(sample('rules.csv'))
  const cart = parseCartCSV(sample('cart.csv'))
  const result = calculateCart(cart.data, rules.data)
  const byId = Object.fromEntries(result.items.map((r) => [r.itemId, r]))

  it('loads all rules and items without warnings', () => {
    expect(rules.ok && rules.data).toHaveLength(4)
    expect(cart.ok && cart.data).toHaveLength(6)
    expect(rules.warnings).toEqual([])
  })

  it.each([
    ['ITEM-01', 1104, ['RULE-01'], 'max-discount'],
    ['ITEM-02', 629, ['RULE-02', 'RULE-03'], 'stacked'],
    ['ITEM-03', 509, ['RULE-01'], 'applied'],
    ['ITEM-04', 2499, [], 'none'],
    ['ITEM-05', 382, ['RULE-01'], 'applied'],
    ['ITEM-06', 809, ['RULE-03'], 'applied'],
  ])('%s → Rs.%i', (id, final, applied, status) => {
    expect(byId[id].finalPrice).toBe(final)
    expect(byId[id].appliedRules).toEqual(applied)
    expect(byId[id].status).toBe(status)
  })

  it('explains why RULE-01 beat RULE-02 on ITEM-01', () => {
    expect(byId['ITEM-01'].skippedRules).toEqual(['RULE-02'])
    expect(byId['ITEM-01'].reasoning).toBe(
      'Amazon India offer: 15% off (saves Rs.195, more than the Rs.150 Natura Casa brand offer)',
    )
  })

  it('describes the stack on ITEM-02', () => {
    expect(byId['ITEM-02'].reasoning).toBe(
      'Natura Casa brand offer: Rs.150 off + Flipkart offer: extra 10% off (stacked)',
    )
  })

  it('says "No offers available" for ITEM-04', () => {
    expect(byId['ITEM-04'].reasoning).toBe('No offers available')
  })

  it('applies RULE-04 to the cart: 5932 → −593 → 5339', () => {
    expect(result.subtotal).toBe(5932)
    expect(result.cartOffer.rule.ruleId).toBe('RULE-04')
    expect(result.cartOffer.saving).toBe(593)
    expect(result.total).toBe(5339)
    expect(result.nudge).toBeNull()
  })
})

describe('item-level rules', () => {
  it('breaks a tie between non-stackable rules with the lowest rule ID', () => {
    const rules = [
      rule({ ruleId: 'RULE-10', scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 100 }),
      rule({ ruleId: 'RULE-02', value: 10 }), // 10% of 1000 = 100
    ]
    const r = applyDiscounts(item(), rules)
    expect(r.appliedRules).toEqual(['RULE-02'])
    expect(r.finalPrice).toBe(900)
    expect(r.reasoning).toContain('same saving')
  })

  it('compares exact savings, not rounded ones', () => {
    // 15% of 1003 = 150.45 → beats Rs.150 flat even though both round to 150
    const rules = [
      rule({ ruleId: 'RULE-01', scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 150 }),
      rule({ ruleId: 'RULE-02', value: 15 }),
    ]
    expect(applyDiscounts(item({ basePrice: 1003 }), rules).appliedRules).toEqual(['RULE-02'])
  })

  it('applies a stackable rule on its own when no non-stackable rule matches', () => {
    const r = applyDiscounts(item({ basePrice: 899 }), [rule({ stackable: true })])
    expect(r.finalPrice).toBe(809)
    expect(r.reasoning).toBe('Amazon India offer: 10% off')
  })

  it('returns base price and a note when nothing matches', () => {
    const r = applyDiscounts(item({ platform: 'Noon', brand: 'Other' }), [rule()])
    expect(r).toMatchObject({ finalPrice: 1000, totalDiscount: 0, status: 'none' })
    expect(r.reasoning).toBe('No offers available')
  })

  it('never takes a price below zero with a flat discount', () => {
    const r = applyDiscounts(item({ basePrice: 100 }), [rule({ type: 'flat', value: 150 })])
    expect(r.finalPrice).toBe(0)
    expect(r.totalDiscount).toBe(100)
  })

  it('applies multiple stackable rules in rule ID order, each on the reduced price', () => {
    const rules = [
      rule({ ruleId: 'RULE-09', scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 100, stackable: true }),
      rule({ ruleId: 'RULE-03', value: 10, stackable: true }),
    ]
    const r = applyDiscounts(item(), rules)
    // 1000 → 10% → 900 → −100 → 800 (the other order would give 810)
    expect(r.appliedRules).toEqual(['RULE-03', 'RULE-09'])
    expect(r.finalPrice).toBe(800)
  })

  it('matches brand/platform names case- and whitespace-insensitively', () => {
    const r = applyDiscounts(item({ brand: '  natura CASA ' }), [
      rule({ scope: 'brand', appliesTo: 'Natura Casa' }),
    ])
    expect(r.appliedRules).toEqual(['RULE-X'])
  })

  it('never applies cart rules to individual items', () => {
    expect(applyDiscounts(item(), [cartRule('RULE-04', 10, 1)]).status).toBe('none')
  })

  it('rounds half up only once, on the final price', () => {
    expect(roundRupees(381.65)).toBe(382)
    expect(roundRupees(629.1)).toBe(629)
    expect(roundRupees(100.5)).toBe(101)
  })
})

describe('cart-level rules', () => {
  const rules = [cartRule('RULE-04', 10, 4000)]

  it('triggers at exactly the threshold', () => {
    expect(evaluateCartRules(4000, rules).cartOffer).toEqual({ rule: rules[0], saving: 400 })
  })

  it('does not trigger one rupee below, and nudges instead', () => {
    const { cartOffer, nudge } = evaluateCartRules(3999, rules)
    expect(cartOffer).toBeNull()
    expect(nudge).toEqual({ rule: rules[0], shortBy: 1 })
  })

  it('picks the largest saving when several cart rules qualify', () => {
    const many = [cartRule('RULE-04', 10, 4000), cartRule('RULE-05', 500, 3000)]
    many[1].type = 'flat'
    const { cartOffer } = evaluateCartRules(6000, many)
    expect(cartOffer.rule.ruleId).toBe('RULE-04') // 600 > 500
    expect(evaluateCartRules(4500, many).cartOffer.rule.ruleId).toBe('RULE-05') // 500 > 450
  })

  it('nudges toward a better offer even when a smaller one already applies', () => {
    const many = [cartRule('RULE-04', 5, 1000), cartRule('RULE-05', 10, 5000)]
    const { cartOffer, nudge } = evaluateCartRules(4500, many)
    expect(cartOffer.rule.ruleId).toBe('RULE-04')
    expect(nudge).toEqual({ rule: many[1], shortBy: 500 })
  })

  it('handles an empty cart', () => {
    const result = calculateCart([], rules)
    expect(result).toMatchObject({ items: [], subtotal: 0, cartOffer: null, nudge: null, total: 0 })
  })
})
