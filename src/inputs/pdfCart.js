/**
 * pdfCart.js — PDF cart input adapter.
 *
 * Expected layout (one table, any number of pages):
 *
 *   Order #OP-9921 | Date: 15 Jan 2025
 *   Product        Brand        Platform      Base Price
 *   ──────────────────────────────────────────────────
 *   Cushion Cover  Natura Casa  Amazon India  Rs.1,299
 *
 * Pipeline:
 *   extractTextItems(file)      I/O, pdf.js (pdfText.js, lazy-loaded)
 *   → groupIntoLines(items)     pure: text fragments → visual lines (by y, then x)
 *   → linesToRows(lines)        pure: lines → string[][] using the header's column positions
 *   → parseRows(rows)           pure: string[][] → CartItem[] + per-row warnings
 *
 * Malformed-row policy: skip the bad row, keep the good ones, say why.
 * Zero good rows → error, and the caller keeps the existing cart.
 */

import { ok, fail } from './inputResult.js'
import { parsePrice, generateItemId } from './cartItem.js'

/** @typedef {{ str: string, x: number, y: number, page: number }} TextItem */

export const COLUMNS = ['product', 'brand', 'platform', 'price']
// "Base Price" may arrive as one fragment or two ("Base", "Price"); the column starts at "Base".
const HEADER_WORDS = [/^product$/i, /^brand$/i, /^platform$/i, /^(base(\s+price)?|price)$/i]
const NO_ITEMS_ERROR = 'No cart items found. Expected columns: Product, Brand, Platform, Base Price.'

const Y_TOLERANCE = 3 // pt: fragments within this vertical distance share a line
const X_TOLERANCE = 6 // pt: a cell may start slightly left of its header

const lineText = (line) => line.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
const isSeparator = (text) => /^[\s\-─━_=|.]+$/.test(text)

/**
 * Groups text fragments into visual lines: page order, top to bottom, left to right.
 * @param {TextItem[]} items
 * @returns {TextItem[][]}
 */
export function groupIntoLines(items, yTolerance = Y_TOLERANCE) {
  const sorted = items
    .filter((i) => i.str.trim() !== '')
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)

  const lines = []
  for (const item of sorted) {
    const current = lines[lines.length - 1]
    if (current && current[0].page === item.page && Math.abs(current[0].y - item.y) <= yTolerance) {
      current.push(item)
    } else {
      lines.push([item])
    }
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x))
}

/** Splits a header line's fragments into words with x positions ("Base Price" may be one fragment). */
function headerColumnStarts(line) {
  const text = lineText(line)
  const words = text.split(' ')
  if (words.length < 4 || words.length > 6) return null

  const starts = []
  for (const pattern of HEADER_WORDS) {
    const hit = line.find((frag) => pattern.test(frag.str.trim()))
    if (!hit) return null
    starts.push(hit.x)
  }
  const increasing = starts.every((x, i) => i === 0 || x > starts[i - 1])
  return increasing ? starts : null
}

/**
 * Turns lines into table rows using the header's x positions as column boundaries.
 * Positional mapping (not gap-splitting) means an empty cell stays empty instead of
 * shifting the next value into the wrong column.
 *
 * @param {TextItem[][]} lines
 * @returns {{ ok: true, rows: string[][], orderId: string|null } | { ok: false, error: string }}
 */
export function linesToRows(lines) {
  let starts = null
  let orderId = null
  const rows = []

  // Pages that repeat the table header: anything above it on that page is a
  // page title ("Order #… (continued)"), never cart data.
  const headerIndexByPage = new Map()
  lines.forEach((line, i) => {
    if (!headerIndexByPage.has(line[0].page) && headerColumnStarts(line)) headerIndexByPage.set(line[0].page, i)
  })

  lines.forEach((line, i) => {
    const text = lineText(line)
    const headerStarts = headerColumnStarts(line)
    const pageHeaderAt = headerIndexByPage.get(line[0].page)
    const orderMatch = /order\s*#\s*([A-Z0-9-]+)/i.exec(text)

    if (headerStarts) {
      starts = headerStarts
      return
    }
    if (!starts || (pageHeaderAt !== undefined && i < pageHeaderAt) || orderMatch) {
      orderId ??= orderMatch?.[1] ?? null
      return
    }
    if (isSeparator(text)) return

    const cells = ['', '', '', '']
    for (const frag of line) {
      let col = 0
      for (let c = 0; c < starts.length; c++) {
        if (frag.x + X_TOLERANCE >= starts[c]) col = c
      }
      cells[col] = `${cells[col]} ${frag.str}`.trim()
    }
    rows.push(cells.map((c) => c.replace(/\s+/g, ' ')))
  })

  if (!starts) {
    return {
      ok: false,
      error: "Couldn't find the cart table. The PDF needs a header row with: Product, Brand, Platform, Base Price.",
    }
  }
  return { ok: true, rows, orderId }
}

/**
 * Converts table rows into CartItems. Pure and unit-tested.
 * A row with only a product name directly after a valid row is a wrapped name
 * and is joined onto that row.
 *
 * @param {string[][]} rows  cells in COLUMNS order
 * @returns {import('./inputResult.js').InputResult<import('../engine/discountEngine.js').CartItem[]>}
 */
export function parseRows(rows) {
  const items = []
  const warnings = []
  let previousRowValid = false

  rows.forEach((raw, i) => {
    const rowNum = i + 1
    const [product, brand, platform, priceText] = COLUMNS.map((_, c) => (raw[c] ?? '').trim())

    if (!product && !brand && !platform && !priceText) return

    if (product && !brand && !platform && !priceText && previousRowValid) {
      const last = items[items.length - 1]
      last.product = `${last.product} ${product}`
      return
    }

    const missing = []
    if (!product) missing.push('product')
    if (!brand) missing.push('brand')
    if (!platform) missing.push('platform')
    if (missing.length > 0) {
      warnings.push(`Row ${rowNum} skipped: missing ${missing.join(', ')}`)
      previousRowValid = false
      return
    }

    const basePrice = parsePrice(priceText)
    if (basePrice === null) {
      warnings.push(
        priceText
          ? `Row ${rowNum} skipped: "${priceText}" is not a valid price`
          : `Row ${rowNum} skipped: price not found`,
      )
      previousRowValid = false
      return
    }

    items.push({ itemId: generateItemId(items.length), product, brand, platform, basePrice })
    previousRowValid = true
  })

  if (items.length === 0) {
    return fail(warnings.length > 0 ? `${NO_ITEMS_ERROR} (${warnings.join('; ')})` : NO_ITEMS_ERROR)
  }
  return ok(items, warnings)
}

/** Lines → CartItems with an order-level summary. Pure; shared by the browser and tests. */
export function parseCartFromTextItems(textItems) {
  const table = linesToRows(groupIntoLines(textItems))
  if (!table.ok) return fail(table.error)

  const result = parseRows(table.rows)
  if (!result.ok) return result

  const skipped = result.warnings.length
  const summary =
    `Loaded ${result.data.length} item${result.data.length === 1 ? '' : 's'}` +
    (table.orderId ? ` from order ${table.orderId}` : '') +
    (skipped ? ` (${skipped} row${skipped === 1 ? '' : 's'} skipped)` : '')

  return ok(result.data, result.warnings, summary)
}

/**
 * Browser entry point: File → InputResult<CartItem[]>.
 * pdf.js is loaded on demand so it isn't in the main bundle.
 * @param {File} file
 */
export async function parsePdfCart(file) {
  const { extractTextItems } = await import('./pdfText.js')
  const extracted = await extractTextItems(file)
  if (!extracted.ok) return extracted
  return parseCartFromTextItems(extracted.data)
}
