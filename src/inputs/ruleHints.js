/**
 * ruleHints.js
 * Non-blocking checks shown on the rule confirmation card.
 */

const norm = (s) => s.trim().toLowerCase()

function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

/**
 * For a brand/platform rule, checks the name against the current cart.
 * @returns {null | { message: string, suggestion: string | null }}
 */
export function checkAppliesTo(rule, cartItems) {
  if (rule.scope === 'cart' || !rule.appliesTo) return null

  const field = rule.scope === 'brand' ? 'brand' : 'platform'
  const names = [...new Set(cartItems.map((item) => item[field]))]
  const target = norm(rule.appliesTo)
  if (names.some((n) => norm(n) === target)) return null

  const ranked = names
    .map((name) => {
      const n = norm(name)
      const distance = n.includes(target) || target.includes(n) ? 0 : editDistance(n, target)
      return { name, distance }
    })
    .sort((a, b) => a.distance - b.distance)

  const best = ranked[0]
  const suggestion = best && best.distance <= Math.max(2, Math.floor(target.length / 3)) ? best.name : null

  return {
    message: `No ${field} called "${rule.appliesTo}" is in the current cart, so this rule won't change any price yet.`,
    suggestion,
  }
}
