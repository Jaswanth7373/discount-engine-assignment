/**
 * csv.js — CSV input adapter (the original input mode).
 *
 * Converts raw CSV text into DiscountRule[] / CartItem[].
 * Bad rows are skipped and reported as warnings; good rows still load.
 *
 * rules.csv columns: rule_id, scope, applies_to, type, value, stackable, min_cart_value
 *   (applies_to is empty and min_cart_value is set for scope=cart)
 * cart.csv columns:  item_id, product, brand, platform, base_price
 */

import Papa from 'papaparse'
import { ok, fail } from './inputResult.js'
import { validateRuleFields } from './ruleSchema.js'
import { parsePrice } from './cartItem.js'

const RULE_COLUMNS = ['rule_id', 'scope', 'applies_to', 'type', 'value', 'stackable', 'min_cart_value']
const REQUIRED_RULE_COLUMNS = ['rule_id', 'scope', 'type', 'value']
const CART_COLUMNS = ['item_id', 'product', 'brand', 'platform', 'base_price']

/**
 * Parses CSV text and checks the header has the columns this kind of file needs,
 * so a cart file dropped into the rules box gets one clear message, not a list of bad rows.
 * @returns {{ ok: true, rows: Record<string, string>[] } | { ok: false, error: string }}
 */
function readTable(csvText, kind, expected, required) {
  const expectedText = `Expected columns: ${expected.join(', ')}.`
  if (csvText.trim() === '') return fail(`This file is empty. ${expectedText}`)

  const { data: rows, errors, meta } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  const fields = meta.fields ?? []
  const missing = required.filter((col) => !fields.includes(col))
  if (missing.length > 0) {
    const hasAll = (cols) => cols.every((col) => fields.includes(col))
    if (kind === 'rules' && hasAll(CART_COLUMNS)) {
      return fail('This is a cart file, not a rules file. Upload it in the Cart Items box (cart.csv), and upload a rules file here.')
    }
    if (kind === 'cart' && hasAll(REQUIRED_RULE_COLUMNS)) {
      return fail('This is a rules file, not a cart file. Upload it in the Discount Rules box, and upload a cart file here.')
    }
    const found = fields.filter(Boolean).slice(0, 8).join(', ') || 'none'
    return fail(`This doesn't look like a ${kind} file (missing: ${missing.join(', ')}; found: ${found}). ${expectedText}`)
  }
  if (errors.length > 0 && rows.length === 0) {
    return fail(`Couldn't read this ${kind} file. Check it is comma-separated with a header row. ${expectedText}`)
  }
  return { ok: true, rows }
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === ''

function parseOptionalNumber(v) {
  return isBlank(v) ? null : Number(String(v).replace(/,/g, ''))
}

function parseBoolean(v) {
  return ['true', '1', 'yes', 'y'].includes(String(v).trim().toLowerCase())
}

/**
 * @param {string} csvText
 * @returns {import('./inputResult.js').InputResult<import('../engine/discountEngine.js').DiscountRule[]>}
 */
export function parseRulesCSV(csvText) {
  const table = readTable(csvText, 'rules', RULE_COLUMNS, REQUIRED_RULE_COLUMNS)
  if (!table.ok) return table
  const { rows } = table

  const data = []
  const warnings = []
  const seenIds = new Set()

  rows.forEach((row, i) => {
    const rowNum = i + 2 // account for header row
    const missing = ['rule_id', 'scope', 'type', 'value'].filter((k) => isBlank(row[k]))
    if (missing.length > 0) {
      warnings.push(`Row ${rowNum} skipped: missing ${missing.join(', ')}`)
      return
    }

    const ruleId = row.rule_id.trim()
    if (seenIds.has(ruleId.toUpperCase())) {
      warnings.push(`Row ${rowNum} skipped: duplicate rule ID ${ruleId}`)
      return
    }

    const result = validateRuleFields({
      scope: row.scope.trim().toLowerCase(),
      appliesTo: row.applies_to ?? null,
      type: row.type.trim().toLowerCase(),
      value: Number(row.value),
      stackable: parseBoolean(row.stackable),
      minCartValue: parseOptionalNumber(row.min_cart_value),
    })

    if (!result.ok) {
      warnings.push(`Row ${rowNum} skipped (${ruleId}): ${result.errors.join('; ')}`)
      return
    }

    seenIds.add(ruleId.toUpperCase())
    data.push({ ruleId, ...result.rule })
  })

  if (data.length === 0) {
    return fail(
      warnings.length > 0
        ? `No valid rules found. ${warnings.join('. ')}`
        : `No rules found. Expected columns: ${RULE_COLUMNS.join(', ')}.`,
    )
  }
  return ok(data, warnings)
}

/**
 * @param {string} csvText
 * @returns {import('./inputResult.js').InputResult<import('../engine/discountEngine.js').CartItem[]>}
 */
export function parseCartCSV(csvText) {
  const table = readTable(csvText, 'cart', CART_COLUMNS, CART_COLUMNS)
  if (!table.ok) return table
  const { rows } = table

  const data = []
  const warnings = []

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const missing = ['item_id', 'product', 'brand', 'platform', 'base_price'].filter((k) =>
      isBlank(row[k]),
    )
    if (missing.length > 0) {
      warnings.push(`Row ${rowNum} skipped: missing ${missing.join(', ')}`)
      return
    }

    const basePrice = parsePrice(row.base_price)
    if (basePrice === null) {
      warnings.push(`Row ${rowNum} skipped: "${row.base_price}" is not a valid price`)
      return
    }

    data.push({
      itemId: row.item_id.trim(),
      product: row.product.trim(),
      brand: row.brand.trim(),
      platform: row.platform.trim(),
      basePrice,
    })
  })

  if (data.length === 0) {
    return fail(
      `No cart items found. Expected columns: ${CART_COLUMNS.join(', ')}.`,
    )
  }
  return ok(data, warnings)
}
