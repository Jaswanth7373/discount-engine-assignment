import { describe, it, expect } from 'vitest'
import { parseRulesCSV, parseCartCSV } from './csv.js'

const RULES = 'rule_id,scope,applies_to,type,value,stackable,min_cart_value\n'
const CART = 'item_id,product,brand,platform,base_price\n'

describe('csv adapter: file-level problems', () => {
  it('says an empty file is empty', () => {
    expect(parseCartCSV('')).toEqual({ ok: false, error: expect.stringMatching(/^This file is empty\./) })
    expect(parseRulesCSV('  \n ')).toEqual({ ok: false, error: expect.stringMatching(/^This file is empty\./) })
  })

  it('spots a cart file uploaded as rules (and vice versa) from the header', () => {
    const cartAsRules = parseRulesCSV(CART + 'ITEM-01,Vase,B,Noon,100\n')
    expect(cartAsRules.error).toMatch(/doesn't look like a rules file \(missing: rule_id, scope, type, value\)/)
    const rulesAsCart = parseCartCSV(RULES + 'RULE-01,platform,Noon,flat,10,false,\n')
    expect(rulesAsCart.error).toMatch(/doesn't look like a cart file/)
  })

  it('reports a header-only file as having no rows', () => {
    expect(parseCartCSV(CART).error).toMatch(/^No cart items found/)
    expect(parseRulesCSV(RULES).error).toMatch(/^No rules found/)
  })

  it('accepts rules files without the optional columns', () => {
    const r = parseRulesCSV('rule_id,scope,applies_to,type,value\nRULE-01,platform,Noon,flat,10\n')
    expect(r.ok && r.data[0]).toMatchObject({ ruleId: 'RULE-01', stackable: false, minCartValue: null })
  })
})
