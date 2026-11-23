/**
 * format.js
 * One rupee format used everywhere in the app: "Rs.5,339" (en-IN digit grouping).
 */

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/** @param {number} amount */
export function formatRs(amount) {
  return `Rs.${grouping.format(amount)}`
}
