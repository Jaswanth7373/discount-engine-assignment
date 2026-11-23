# Opptra Discount Engine

A customer-facing cart pricing engine. For every cart item it picks the offer that saves the customer the most, stacks the stackable ones on top, applies a cart-level offer when the cart qualifies, and explains each price in plain language.

**Live demo:** _LIVE_URL_PENDING_ (to be added after deployment)

Three ways to feed it, all through the same untouched engine:

| Input | What it does |
|---|---|
| **CSV** (rules + cart) | The original upload flow. |
| **PDF cart** | Upload an order PDF (Product / Brand / Platform / Base Price). It replaces the cart and prices re-run instantly. |
| **Plain-English rule** | "20% off for Natura Casa brand, stackable". An LLM on Groq (`openai/gpt-oss-120b`) parses it, you check it on a confirmation card, and it is added only when you confirm. |

## Run locally

1. `npm install`
2. `cp .env.example .env.local` and set `GROQ_API_KEY` (free key at console.groq.com)
3. `npx vercel dev`, then open the URL it prints

`npm run dev` also works and serves the UI on http://localhost:5173, but without the `/api` function. CSV and PDF work fully. The plain-English rule box then shows a friendly "AI rule parsing isn't available in this environment" message instead of failing.

## Try it

1. Upload `sample-data/rules.csv` and `sample-data/cart.csv`, then click **Calculate Discounts**. Expected: final cart total **Rs.5,339** (Rs.5,932 − Rs.593 cart offer).
2. Upload `sample-data/cart-malformed.pdf`. You should see 3 items loaded and 2 rows skipped, each with its reason.
3. Upload `sample-data/cart-scanned.pdf`. You should get a clear "scanned image" error, and the cart is kept.
4. Type `Give a discount for big orders`. It's flagged as too vague, so nothing is added.
5. Type `20% off for Natura Casa brand, stackable with other offers`, check the card, then click **Confirm**. Prices update.

| Demo file | Shows |
|---|---|
| `sample-data/rules.csv` | RULE-01…04 from the brief (incl. the cart rule) |
| `sample-data/cart.csv` / `cart.pdf` | The 6-item sample cart |
| `sample-data/cart-malformed.pdf` | Bad price, missing brand, wrapped product name |
| `sample-data/cart-scanned.pdf` | PDF with no text layer |

Regenerate the PDFs with `npm run make:pdfs`.

## Architecture

```
 ┌───────────── inputs (src/inputs/) ──────────────┐
 │ csv.js        rules.csv / cart.csv               │
 │ pdfCart.js    PDF → lines → columns → CartItem[] │──┐   every adapter returns
 │ nlRule.js     text → /api/parse-rule → rule      │  │   InputResult<T> =
 │ ruleSchema.js shared zod validation for rules    │  │   { ok, data, warnings }
 └──────────────────────────────────────────────────┘  │   | { ok: false, error }
                                                        ▼
                          App.jsx: loadRules() / loadCart() / addRule()
                                                        │  state: rules[], cartItems[]
                                                        ▼
                    src/engine/discountEngine.js  calculateCart(cart, rules)
                    (pure; imports nothing from inputs/ or the UI)
                                                        │
                                                        ▼
                    components/CartSummary.jsx: items, cart offer row, nudge, total

 api/parse-rule.js: Vercel function. Holds GROQ_API_KEY and calls the LLM on Groq.
 It returns the model's raw text; the browser validates it.
```

```
api/                 serverless function + prompt (_prompt.js is not a route)
scripts/             sample PDF generator
sample-data/         demo CSVs and PDFs
src/engine/          discountEngine.js (pricing), format.js (Rs.1,234 formatting)
src/inputs/          one adapter per input mode + shared helpers
src/components/      UI pieces (CartSummary, RuleComposer, FileUploader, …)
```

### Adding a fourth input mode

1. Create `src/inputs/myInput.js` that returns `ok(cartItems, warnings, summary)` or `fail(message)` (from `inputResult.js`).
2. For rules, run each candidate through `validateRuleFields()` in `ruleSchema.js`.
3. In `App.jsx`, call `loadCart(await myInput(file), file.name)`, or `loadRules(...)` / `addRule(...)` for rules.
4. Add an uploader or button for it. `InputStatus` already renders its errors and warnings.
5. The engine doesn't change.

## Tests

```bash
npm test
```

91 tests cover:

- **Engine:** the sample results from the brief, ties, stacking order, the Rs.0 floor, case-insensitive matching, and cart thresholds at 3,999 / 4,000.
- **PDF adapter:** fixtures plus real pdf.js extraction of the sample PDFs.
- **AI rule validator:** checked against mocked model outputs.
- **Client adapter:** tested with a mocked `fetch`.
- **API handler:** input validation, error mapping, and no leaking of upstream errors.
- **Cart offer row:** rendered output.

## Deploying (Vercel)

Import the repo in Vercel; it detects Vite and deploys `api/` as functions. Set `GROQ_API_KEY` in **Project → Settings → Environment Variables**, then redeploy.

Design decisions and the places I disagree with the brief are in [DECISIONS.md](DECISIONS.md).
