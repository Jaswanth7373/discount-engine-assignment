# Design decisions

The calls I made where the brief left room, and why. Each one is enforced in code and covered by a test unless stated otherwise.

## Pricing

**1. Rounding.** I keep exact amounts through every item-level step and round once, on the item's final price, to the nearest rupee (half up). The cart offer is also rounded to the nearest rupee. The base code rounded at every step, which can drift by Rs.1 when rules stack. Rounding once also means rules are compared on exact savings: 15% of Rs.1,003 (Rs.150.45) correctly beats a flat Rs.150, even though both display as Rs.150.

**2. Stacking compounds.** A stackable rule applies to the price *after* the winning non-stackable rule (Rs.849 − 150 = 699, then 10% → Rs.629, as in the brief). The alternative was to compute each discount on the base price and add them up (849 − 150 − 84.9 = Rs.614). That's more generous, but it doesn't match the brief's expected Rs.629, and it can compound past 100% with several stackable percentages.

**3. Ties.** If two non-stackable rules give the same saving, the lowest rule ID wins (natural order, so RULE-2 comes before RULE-10). The customer pays the same either way. The point is that the result never depends on CSV row order. The reasoning text says the saving was the same.

**4. Multiple stackable rules** apply in rule ID order, each on the already-reduced price. Order matters once flat and percentage rules mix (10% then Rs.100 gives 800; the reverse gives 810), so I made it deterministic.

**5. Multiple cart rules.** Only one cart offer applies: the qualifying rule with the largest rupee saving (ties go to the lowest ID). Cart rules are never stackable, even if a CSV or the AI marks them so. Two whole-cart discounts compounding is the kind of surprise a pricing team wouldn't sign off on silently.

**6. Flat discounts stop at Rs.0.** A Rs.150 flat offer on a Rs.100 item makes it free, not −Rs.50.

**7. Cart total just below the threshold.** The condition is `subtotal ≥ min_cart_value`, checked on the sum of rounded final item prices. At Rs.3,999 against a Rs.4,000 threshold, the cart offer row is not shown, as the brief says. Instead the customer sees "Add Rs.1 more to unlock 10% off your cart". The nudge also appears when a better cart offer is within reach, even if a smaller one already applies.

## Inputs

**8. PDF malformed rows: skip and warn, don't fail everything.** A cart with one bad row out of twenty shouldn't block checkout.

- Bad rows are skipped with a specific reason ("Row 4 skipped: "Rs.abc" is not a valid price", "Row 6 skipped: missing brand"), and the valid rows load.
- If *zero* rows are valid, it's an error and the existing cart is **kept**, not replaced with an empty one.
- Non-PDFs, password-protected PDFs, damaged PDFs, scanned PDFs (no text layer) and files over 5 MB each get their own message.
- Columns are mapped by the header row's x-positions rather than by gaps between words. An empty Brand cell then stays empty instead of shifting "Flipkart" into the Brand column.
- A line holding only a product name, directly after a valid row, is treated as a wrapped name and joined onto that row.
- Row numbers in the warnings count table rows after the header.

**9. The LLM's output is never trusted.**
- The server returns the model's raw text, and the browser does all the parsing.
- **Parsing and validation:** strip code fences, `JSON.parse`, then check the envelope with zod. The rule is then checked by the *same* schema the CSV uses (`ruleSchema.js`): value > 0, percentage ≤ 100, brand/platform rules need a name, cart rules need a minimum cart value and no name.
- **Status "ambiguous":** the result can't carry a rule through. The user sees the model's reason plus what to add.
- **Specific failures:** network errors, timeouts, "API not running", non-JSON output and invalid output each get their own message.
- **Never auto-added:** even a valid rule only lands on a confirmation card. It enters the engine only on **Confirm**, which assigns the next RULE-xx ID.
- **Unknown names:** if the brand or platform isn't in the current cart, I warn but don't block, and suggest the closest name ("Did you mean Natura Casa?"). A rule for a brand that isn't in today's cart can still be legitimate.

**10. Serverless proxy for the LLM, PDF parsing in the browser.**
- **LLM proxy:** the Anthropic key must never reach the bundle, so `api/parse-rule.js` (a Vercel function) holds it. It uses a 10 s timeout and no retries: a user waiting on a button is better served by a fast, clear "try again" than a 30 s silent retry.
- **PDF parsing** needs no secret, and pdf.js runs well in the browser, so it stays client-side. It is lazy-loaded so the main bundle stays small.

**11. Prompt injection and input length.**
- **Length:** input is capped at 300 characters, on both client and server.
- **Tagging:** the user's sentence goes inside `<rule_text>` tags, and any attempt to close those tags early is stripped. The system prompt says the content is data, never instructions.
- **Backstop:** if the model is talked into something odd anyway, schema validation and the confirmation step catch it. The worst case is a rejected rule, never a silently changed price.
- **Error handling:** upstream error details never reach the client; only the error class is logged.

**12. "More than Rs.5,000" vs `≥`.** The brief's NL example says "more than Rs.5,000", but RULE-04's condition is "≥ Rs.4,000". I kept one meaning everywhere: a cart threshold is inclusive (≥), and the confirmation card states it ("Rs.5,000 (cart total ≥ this)") so the person confirming sees it. Strictly, "more than" means >. If the business wants strict thresholds, I'd add an explicit `inclusive` flag rather than guess per sentence.

## Where I'd push back on the brief

**13. Disagreements and alternatives.**

- **The PDF table format is brittle.** Parsing positioned text works for a known template but breaks with a new layout, a second table, or a scanned slip. Alternatives:
  - (a) Ask the order source for a structured export (CSV/JSON), since that's the real fix.
  - (b) Fall back to LLM-assisted extraction when the header isn't found. The model would read the PDF and propose rows, which go through the same validation and a review table before replacing the cart, like the rule confirmation step.
- **The confirmation step should show impact, not just fields.** I added it: the card previews how many prices change and the new cart total. A rule that looks right can still have a surprising effect, such as a "stackable" 20% that takes an item below cost.
- **Stacking order is underspecified.** The brief doesn't say what happens with two stackable rules, or whether stacking compounds or adds. I chose compounding in rule ID order (decisions 2 and 4). In production I'd want an explicit priority field rather than relying on rule IDs.
- **Task numbering.** The brief calls PDF upload "Task 3", but the evaluation section refers to it as "Task 2" ("Does Task 2 replace the cart and re-run?"). I read the evaluation as meaning the PDF task.

## With more time

**14. Next steps.**
- **API protection:** auth and rate limiting on `/api/parse-rule` (it's an open proxy to a paid API).
- **End-to-end tests:** Playwright on the deployed site (I smoke-tested the production build in headless Chrome by hand).
- **Rule sets:** persisted and versioned, with an audit trail of who added which rule.
- **Formatting:** proper INR/i18n currency formatting (paise, ₹ symbol) via a locale setting.
- **TypeScript:** port the codebase. I kept the base repo's JavaScript and used JSDoc types plus zod at the boundaries rather than mixing languages mid-assignment.
