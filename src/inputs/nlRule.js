/**
 * nlRule.js — natural-language rule input adapter.
 *
 * parseRuleText(text)          I/O: POST /api/parse-rule, maps every failure to a friendly message
 * interpretModelOutput(raw)    pure: model text → validated rule fields (never trusted as-is)
 *
 * Output is rule fields without a ruleId. The caller assigns the ID only after the
 * user confirms, so nothing reaches the engine without a human in the loop.
 */

import { z } from 'zod'
import { ok, fail } from './inputResult.js'
import { validateRuleFields } from './ruleSchema.js'

export const MAX_TEXT_LENGTH = 300
const CLIENT_TIMEOUT_MS = 15_000 // server gives up at 10s; this only catches a hung connection

export const UNUSABLE_OUTPUT = "The AI returned something I couldn't use. Please rephrase the rule."
const AMBIGUOUS_HINT = 'Please include a discount value and, for cart offers, a minimum cart value.'

const envelopeSchema = z.object({
  status: z.enum(['ok', 'ambiguous']),
  reason: z.string().optional().default(''),
  rule: z
    .object({
      scope: z.unknown(),
      applies_to: z.unknown().optional(),
      type: z.unknown(),
      value: z.unknown(),
      stackable: z.unknown().optional(),
      min_cart_value: z.unknown().optional(),
    })
    .nullable()
    .optional(),
})

/** Removes ```json fences or chatter around the first {...} block. */
export function extractJson(raw) {
  const text = String(raw ?? '').trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text)
  if (fenced) return fenced[1]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start !== -1 && end > start ? text.slice(start, end + 1) : text
}

const lower = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)

/**
 * @param {string} raw  the model's text response
 * @returns {import('./inputResult.js').InputResult<Omit<import('../engine/discountEngine.js').DiscountRule, 'ruleId'>> & { ambiguous?: boolean, reason?: string }}
 */
export function interpretModelOutput(raw) {
  let json
  try {
    json = JSON.parse(extractJson(raw))
  } catch {
    return fail(UNUSABLE_OUTPUT)
  }

  const envelope = envelopeSchema.safeParse(json)
  if (!envelope.success) return fail(UNUSABLE_OUTPUT)

  const { status, reason, rule } = envelope.data

  if (status === 'ambiguous') {
    const why = reason.trim() || "That description doesn't have enough detail to build a rule."
    return { ...fail(`${why} ${AMBIGUOUS_HINT}`), ambiguous: true }
  }
  if (!rule) return fail(UNUSABLE_OUTPUT)

  const validated = validateRuleFields({
    scope: lower(rule.scope),
    appliesTo: rule.applies_to ?? null,
    type: lower(rule.type),
    value: rule.value,
    stackable: rule.stackable ?? false,
    minCartValue: rule.min_cart_value ?? null,
  })

  if (!validated.ok) {
    return fail(`${UNUSABLE_OUTPUT} (${validated.errors.join('; ')})`)
  }
  return { ...ok(validated.rule), reason: reason.trim() }
}

/**
 * @param {string} text
 * @param {{ fetchImpl?: typeof fetch, endpoint?: string, timeoutMs?: number }} [options]
 */
export async function parseRuleText(text, { fetchImpl = fetch, endpoint = '/api/parse-rule', timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) return fail('Describe the discount in a sentence first.')
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return fail(`Please keep the description under ${MAX_TEXT_LENGTH} characters.`)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
      signal: controller.signal,
    })
  } catch (err) {
    return fail(
      err?.name === 'AbortError'
        ? 'The rule assistant took too long to respond. Please try again.'
        : "Couldn't reach the rule assistant. Check your connection and try again.",
    )
  } finally {
    clearTimeout(timer)
  }

  const isJson = (response.headers.get('content-type') ?? '').includes('application/json')
  if (!isJson) {
    // e.g. `npm run dev` without the serverless function: Vite answers 404 / HTML.
    return fail("AI rule parsing isn't available in this environment. Run the app with `npx vercel dev` or use the live site.")
  }

  let body
  try {
    body = await response.json()
  } catch {
    return fail(UNUSABLE_OUTPUT)
  }

  if (!response.ok) {
    return fail(typeof body?.error === 'string' ? body.error : 'The rule assistant ran into a problem. Please try again.')
  }
  return interpretModelOutput(body?.raw)
}
