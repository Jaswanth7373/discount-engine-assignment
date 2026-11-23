/**
 * POST /api/parse-rule   { text: string }  →  200 { raw: string } | 4xx/5xx { error: string }
 *
 * Vercel serverless function. Keeps GROQ_API_KEY on the server and forwards
 * one sentence to an LLM on Groq (OpenAI-compatible chat completions API).
 * It deliberately returns the model's raw text: the client adapter
 * (src/inputs/nlRule.js) is the single place that parses and validates it,
 * so nothing the model says is trusted without that check.
 */

import { SYSTEM_PROMPT } from './_prompt.js'

export const MAX_TEXT_LENGTH = 300
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'
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

function upstreamError(status) {
  if (status === 401 || status === 403) return [503, "The rule assistant isn't configured correctly on this server."]
  if (status === 429) return [502, 'The rule assistant is busy right now. Please try again in a moment.']
  if (status >= 500) return [502, 'The rule assistant is temporarily unavailable. Please try again.']
  return [502, "The rule assistant couldn't process that request. Please try again."]
}

/**
 * @param {{ apiKey: string | undefined, model?: string, fetchImpl?: typeof fetch }} deps
 */
export function createHandler({ apiKey, model = DEFAULT_MODEL, fetchImpl = fetch }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Use POST.' })
    }

    const input = validateRequestBody(req.body)
    if (!input.ok) return res.status(400).json({ error: input.error })

    if (!apiKey) {
      return res.status(503).json({ error: "The rule assistant isn't configured on this server." })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const upstream = await fetchImpl(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_completion_tokens: 1024,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: wrapUserText(input.text) },
          ],
        }),
        signal: controller.signal,
      })

      if (!upstream.ok) {
        // Log the status only: never the key, the request headers or the raw upstream body.
        console.error(`parse-rule upstream error: HTTP ${upstream.status}`)
        const [status, error] = upstreamError(upstream.status)
        return res.status(status).json({ error })
      }

      const data = await upstream.json()
      const raw = data?.choices?.[0]?.message?.content
      return res.status(200).json({ raw: typeof raw === 'string' ? raw : '' })
    } catch (err) {
      if (err?.name === 'AbortError') {
        return res.status(504).json({ error: 'The rule assistant took too long to respond. Please try again.' })
      }
      console.error(`parse-rule request failed: ${err?.name ?? 'Error'}`)
      return res.status(502).json({ error: "The rule assistant couldn't be reached. Please try again." })
    } finally {
      clearTimeout(timer)
    }
  }
}

export default createHandler({
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_MODEL || DEFAULT_MODEL,
})
