/**
 * cartItem.js
 * Helpers shared by every adapter that produces CartItem[].
 */

/**
 * Parses a customer-written price: "Rs.1,299", "Rs. 1299", "₹1,299", "INR 1299", "1299".
 * Returns a whole-rupee number, or null if the text isn't a positive price.
 * Rejects negatives and anything with leftover characters (e.g. "Rs.12abc").
 *
 * @param {unknown} text
 * @returns {number|null}
 */
export function parsePrice(text) {
  if (typeof text === 'number') return Number.isFinite(text) && text > 0 ? Math.round(text) : null
  if (typeof text !== 'string') return null

  const cleaned = text
    .trim()
    .replace(/^(rs\.?|inr|₹)\s*/i, '')
    .replace(/\/-$/, '')
    .trim()

  if (!/^\d{1,3}(,\d{2,3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(cleaned)) return null

  const value = Number(cleaned.replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

/** ITEM-01, ITEM-02, ... for adapters whose source has no item IDs. */
export function generateItemId(index) {
  return `ITEM-${String(index + 1).padStart(2, '0')}`
}
