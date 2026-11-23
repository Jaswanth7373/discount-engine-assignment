import { describe, it, expect, vi } from 'vitest'
import { interpretModelOutput, parseRuleText, UNUSABLE_OUTPUT, AMBIGUOUS_HINT as AMBIGUOUS_HINT_TEXT } from './nlRule.js'
import { checkAppliesTo } from './ruleHints.js'

const envelope = (rule, status = 'ok', reason = 'ok') => JSON.stringify({ status, reason, rule })

describe('interpretModelOutput (validating mocked LLM output)', () => {
  it.each([
    [
      '20% Natura Casa stackable',
      { scope: 'brand', applies_to: 'Natura Casa', type: 'percentage', value: 20, stackable: true, min_cart_value: null },
      { scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null },
    ],
    [
      'Rs.100 flat Flipkart',
      { scope: 'platform', applies_to: 'Flipkart', type: 'flat', value: 100, stackable: false, min_cart_value: null },
      { scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null },
    ],
    [
      '10% cart over 5000',
      { scope: 'cart', applies_to: null, type: 'percentage', value: 10, stackable: false, min_cart_value: 5000 },
      { scope: 'cart', appliesTo: null, type: 'percentage', value: 10, stackable: false, minCartValue: 5000 },
    ],
  ])('accepts a valid rule: %s', (_, modelRule, expected) => {
    const r = interpretModelOutput(envelope(modelRule))
    expect(r.ok).toBe(true)
    expect(r.data).toEqual(expected)
  })

  it('strips ```json code fences', () => {
    const raw = '```json\n' + envelope({ scope: 'platform', applies_to: 'Noon', type: 'flat', value: 50, stackable: false, min_cart_value: null }) + '\n```'
    expect(interpretModelOutput(raw).ok).toBe(true)
  })

  it('normalises enum casing but rejects unknown enums', () => {
    const good = { scope: 'Brand', applies_to: 'X', type: 'PERCENTAGE', value: 5, stackable: false, min_cart_value: null }
    expect(interpretModelOutput(envelope(good)).ok).toBe(true)
    const bad = { ...good, scope: 'category' }
    expect(interpretModelOutput(envelope(bad))).toEqual({ ok: false, error: expect.stringContaining('scope must be brand, platform or cart') })
  })

  it.each([
    ['negative value', { value: -10 }, 'value must be greater than 0'],
    ['percent over 100', { value: 120 }, 'cannot be more than 100%'],
    ['missing applies_to', { applies_to: null }, 'needs the brand name'],
    ['string value', { value: '20' }, 'value must be a number'],
  ])('rejects %s', (_, override, message) => {
    const rule = { scope: 'brand', applies_to: 'Natura Casa', type: 'percentage', value: 20, stackable: false, min_cart_value: null, ...override }
    const r = interpretModelOutput(envelope(rule))
    expect(r.ok).toBe(false)
    expect(r.error).toContain(UNUSABLE_OUTPUT)
    expect(r.error).toContain(message)
  })

  it('rejects a cart rule without a minimum cart value', () => {
    const r = interpretModelOutput(envelope({ scope: 'cart', applies_to: null, type: 'percentage', value: 10, stackable: false, min_cart_value: null }))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('minimum cart value')
  })

  it('forces cart rules to be non-stackable', () => {
    const r = interpretModelOutput(envelope({ scope: 'cart', applies_to: null, type: 'flat', value: 200, stackable: true, min_cart_value: 3000 }))
    expect(r.data.stackable).toBe(false)
  })

  it('rejects garbage text', () => {
    expect(interpretModelOutput('Sure! Here is your rule: 20% off')).toEqual({ ok: false, error: UNUSABLE_OUTPUT })
    expect(interpretModelOutput(undefined)).toEqual({ ok: false, error: UNUSABLE_OUTPUT })
  })

  it('rejects an "ok" envelope with no rule', () => {
    expect(interpretModelOutput(envelope(null))).toEqual({ ok: false, error: UNUSABLE_OUTPUT })
  })

  it('surfaces ambiguous input with the model reason and what to add', () => {
    const r = interpretModelOutput(envelope(null, 'ambiguous', 'No discount amount and no minimum order value were given.'))
    expect(r.ok).toBe(false)
    expect(r.ambiguous).toBe(true)
    expect(r.error).toBe(
      'No discount amount and no minimum order value were given. ' + AMBIGUOUS_HINT_TEXT,
    )
  })

  it('never lets an ambiguous status carry a rule through', () => {
    const r = interpretModelOutput(envelope({ scope: 'brand', applies_to: 'X', type: 'flat', value: 1, stackable: false, min_cart_value: null }, 'ambiguous', 'unclear'))
    expect(r.ok).toBe(false)
  })
})

describe('parseRuleText (mocked fetch)', () => {
  const jsonResponse = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const validRaw = envelope({ scope: 'platform', applies_to: 'Flipkart', type: 'flat', value: 100, stackable: false, min_cart_value: null })

  it('posts the text and returns the validated rule', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { raw: validRaw }))
    const r = await parseRuleText('  Rs.100 flat discount on all Flipkart items ', { fetchImpl })
    expect(r.ok).toBe(true)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ text: 'Rs.100 flat discount on all Flipkart items' })
  })

  it('validates input before calling the server', async () => {
    const fetchImpl = vi.fn()
    expect((await parseRuleText('   ', { fetchImpl })).ok).toBe(false)
    expect((await parseRuleText('x'.repeat(301), { fetchImpl })).error).toContain('under 300')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reports network failures', async () => {
    const r = await parseRuleText('10% off', { fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
    expect(r.error).toMatch(/Couldn't reach/)
  })

  it('reports a timeout', async () => {
    const fetchImpl = (_, { signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    const r = await parseRuleText('10% off', { fetchImpl, timeoutMs: 5 })
    expect(r.error).toMatch(/took too long/)
  })

  it('passes through the server error message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(502, { error: 'The rule assistant is busy right now.' }))
    expect((await parseRuleText('10% off', { fetchImpl })).error).toBe('The rule assistant is busy right now.')
  })

  it('explains when the API is not running (plain npm run dev)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } }))
    expect((await parseRuleText('10% off', { fetchImpl })).error).toMatch(/isn't available in this environment/)
  })
})

describe('checkAppliesTo', () => {
  const cart = [{ brand: 'Natura Casa', platform: 'Amazon India' }, { brand: 'Nordic Basics', platform: 'Flipkart' }]
  const brandRule = (appliesTo) => ({ scope: 'brand', appliesTo })

  it('is quiet when the name is in the cart (any casing)', () => {
    expect(checkAppliesTo(brandRule('natura casa'), cart)).toBeNull()
  })

  it('warns and suggests a close match', () => {
    expect(checkAppliesTo(brandRule('Natura Kasa'), cart)).toMatchObject({ suggestion: 'Natura Casa' })
  })

  it('warns without a suggestion when nothing is close', () => {
    expect(checkAppliesTo(brandRule('Ikea'), cart)).toMatchObject({ suggestion: null })
  })

  it('ignores cart rules', () => {
    expect(checkAppliesTo({ scope: 'cart', appliesTo: null }, cart)).toBeNull()
  })
})
