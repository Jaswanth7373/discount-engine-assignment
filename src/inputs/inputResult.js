/**
 * inputResult.js
 *
 * The one contract every input adapter returns, so the UI can treat
 * CSV, PDF, natural language (and any future input) the same way:
 *
 * @template T
 * @typedef {{ ok: true, data: T, warnings: string[], summary?: string } | { ok: false, error: string }} InputResult
 */

/**
 * @template T
 * @param {T} data
 * @param {string[]} [warnings]
 * @param {string} [summary]  one-line, customer-readable description of what was loaded
 * @returns {InputResult<T>}
 */
export function ok(data, warnings = [], summary) {
  return { ok: true, data, warnings, ...(summary ? { summary } : {}) }
}

/**
 * @param {string} error
 * @returns {InputResult<never>}
 */
export function fail(error) {
  return { ok: false, error }
}
