/**
 * ruleSchema.js
 *
 * Single source of truth for "is this a usable DiscountRule?".
 * Shared by the CSV adapter and the natural-language adapter so a rule
 * can't be valid through one door and invalid through another.
 */

import { z } from 'zod'

const trimmedOrNull = z
  .string()
  .nullish()
  .transform((s) => (typeof s === 'string' && s.trim() !== '' ? s.trim() : null))

export const ruleFieldsSchema = z
  .object({
    scope: z.enum(['brand', 'platform', 'cart'], {
      errorMap: () => ({ message: 'scope must be brand, platform or cart' }),
    }),
    appliesTo: trimmedOrNull,
    type: z.enum(['percentage', 'flat'], {
      errorMap: () => ({ message: 'type must be percentage or flat' }),
    }),
    value: z
      .number({ invalid_type_error: 'value must be a number' })
      .finite('value must be a number')
      .positive('value must be greater than 0'),
    stackable: z.boolean({ invalid_type_error: 'stackable must be true or false' }),
    minCartValue: z
      .number({ invalid_type_error: 'min cart value must be a number' })
      .finite()
      .nullish()
      .transform((v) => v ?? null),
  })
  .superRefine((rule, ctx) => {
    const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })

    if (rule.type === 'percentage' && rule.value > 100) {
      issue('a percentage discount cannot be more than 100%')
    }
    if (rule.scope === 'cart') {
      if (rule.minCartValue === null || rule.minCartValue <= 0) {
        issue('a cart offer needs a minimum cart value greater than 0')
      }
      if (rule.appliesTo !== null) {
        issue('a cart offer applies to the whole cart, not to a brand or platform')
      }
    } else {
      if (rule.appliesTo === null) {
        issue(`a ${rule.scope} offer needs the ${rule.scope} name it applies to`)
      }
      if (rule.minCartValue !== null) {
        issue('only cart offers can have a minimum cart value')
      }
    }
  })
  .transform((rule) =>
    // Cart rules are never stackable: exactly one cart offer applies.
    rule.scope === 'cart' ? { ...rule, stackable: false } : rule,
  )

/**
 * @param {unknown} candidate
 * @returns {{ ok: true, rule: Omit<import('../engine/discountEngine.js').DiscountRule, 'ruleId'> } | { ok: false, errors: string[] }}
 */
export function validateRuleFields(candidate) {
  const result = ruleFieldsSchema.safeParse(candidate)
  if (result.success) return { ok: true, rule: result.data }
  return { ok: false, errors: [...new Set(result.error.issues.map((i) => i.message))] }
}

/** Next free ID in the RULE-xx series, e.g. RULE-05 after RULE-04. */
export function nextRuleId(existingRules) {
  const max = existingRules.reduce((m, r) => {
    const n = Number(/^RULE-(\d+)$/i.exec(r.ruleId)?.[1] ?? 0)
    return Math.max(m, n)
  }, 0)
  return `RULE-${String(max + 1).padStart(2, '0')}`
}
