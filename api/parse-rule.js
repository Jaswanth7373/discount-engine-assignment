/**
 * POST /api/parse-rule   { text: string }  →  200 { raw: string } | 4xx/5xx { error: string }
 *
 * Vercel serverless function. Keeps ANTHROPIC_API_KEY on the server and forwards
 * one sentence to Claude. It deliberately returns the model's raw text: the
 * client adapter (src/inputs/nlRule.js) is the single place that parses and
 * validates it, so nothing the model says is trusted without that check.
 */

import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from './_prompt.js'

export const MAX_TEXT_LENGTH = 300
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
const TIMEOUT_MS = 10_000

/**
 * @param {unknown} body
 * @returns {{ ok: true, text: string } | { ok: false, error: string }}
 */
export function validateRequestBody(body) {
  let parsed = body
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return { ok: false, error: 'Send JSON like {"text": "10% off on Flipkart"}.' }
    }
  }
  const text = parsed && typeof parsed === 'object' ? parsed.text : undefined
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'Describe the discount in a sentence first.' }
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `Please keep the description under ${MAX_TEXT_LENGTH} characters.` }
  }
  return { ok: true, text: text.trim() }
}

/** Wraps user text as data; strips any attempt to close the wrapper tag early. */
export function wrapUserText(text) {
  return `<rule_text>${text.replace(/<\/?rule_text>/gi, '')}</rule_text>`
}

function upstreamError(err) {
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return [504, 'The rule assistant took too long to respond. Please try again.']
  }
  if (err instanceof Anthropic.RateLimitError) {
    return [502, 'The rule assistant is busy right now. Please try again in a moment.']
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return [503, "The rule assistant isn't configured correctly on this server."]
  }
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) {
    return [502, 'The rule assistant is temporarily unavailable. Please try again.']
  }
  return [502, "The rule assistant couldn't process that request. Please try again."]
}

/**
 * @param {{ getClient: () => Pick<Anthropic, 'messages'> | null }} deps
 */
export function createHandler({ getClient }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Use POST.' })
    }

    const input = validateRequestBody(req.body)
    if (!input.ok) return res.status(400).json({ error: input.error })

    const client = getClient()
    if (!client) {
      return res.status(503).json({ error: "The rule assistant isn't configured on this server." })
    }

    try {
      const message = await client.messages.create(
        {
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: wrapUserText(input.text) }],
        },
        { timeout: TIMEOUT_MS, maxRetries: 0 },
      )

      if (message.stop_reason === 'refusal') {
        return res.status(422).json({ error: "The rule assistant couldn't help with that text. Please rephrase it as a discount." })
      }

      const raw = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('')
      return res.status(200).json({ raw })
    } catch (err) {
      const [status, error] = upstreamError(err)
      // Log the type only: never the key, the request headers or the raw upstream body.
      console.error(`parse-rule upstream error: ${err?.constructor?.name ?? 'Error'} ${err?.status ?? ''}`)
      return res.status(status).json({ error })
    }
  }
}

export default createHandler({
  getClient: () =>
    process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null,
})
