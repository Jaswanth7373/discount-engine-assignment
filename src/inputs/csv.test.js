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
    expect(cartAsRules.error).toMatch(/^This is a cart file, not a rules file\. Upload it in the Cart Items box/)
    const rulesAsCart = parseCartCSV(RULES + 'RULE-01,platform,Noon,flat,10,false,\n')
    expect(rulesAsCart.error).toMatch(/^This is a rules file, not a cart file/)
  })

  it('lists the columns it found when a file is neither kind', () => {
    expect(parseCartCSV('name,price\nVase,100\n').error).toContain(
      "doesn't look like a cart file (missing: item_id, product, brand, platform, base_price; found: name, price)",
    )
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
