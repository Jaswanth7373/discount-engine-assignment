/**
 * Builds test-data/: one folder per scenario (rules.csv + cart files) and
 * test-data/README.md with the expected results.
 *
 * Expected results are not hand-written: every file is run through the real
 * CSV adapter, PDF adapter (pdf.js) and discount engine, so the guide always
 * matches what the app shows.
 *
 * Run: npm run make:test-data
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseRulesCSV, parseCartCSV } from '../src/inputs/csv.js'
import { parseCartFromTextItems } from '../src/inputs/pdfCart.js'
import { readTextItems } from '../src/inputs/pdfTextItems.js'
import { calculateCart, offerValue } from '../src/engine/discountEngine.js'
import { formatRs } from '../src/engine/format.js'

const ROOT = new URL('../test-data/', import.meta.url)
const RULES_HEADER = ['rule_id', 'scope', 'applies_to', 'type', 'value', 'stackable', 'min_cart_value']
const CART_HEADER = ['item_id', 'product', 'brand', 'platform', 'base_price']

// ── Shared data ──────────────────────────────────────────────────

const BRIEF_RULES = [
  ['RULE-01', 'platform', 'Amazon India', 'percentage', 15, false, ''],
  ['RULE-02', 'brand', 'Natura Casa', 'flat', 150, false, ''],
  ['RULE-03', 'platform', 'Flipkart', 'percentage', 10, true, ''],
  ['RULE-04', 'cart', '', 'percentage', 10, false, 4000],
]

const BRIEF_CART = [
  ['ITEM-01', 'Cushion Cover', 'Natura Casa', 'Amazon India', 1299],
  ['ITEM-02', 'Bed Sheet Set', 'Natura Casa', 'Flipkart', 849],
  ['ITEM-03', 'Wall Shelf', 'LivSpace Pro', 'Amazon India', 599],
  ['ITEM-04', 'Ceramic Vase', 'LivSpace Pro', 'Noon', 2499],
  ['ITEM-05', 'Cutting Board', 'Nordic Basics', 'Amazon India', 449],
  ['ITEM-06', 'Desk Organiser', 'Nordic Basics', 'Flipkart', 899],
]

// ── Scenarios ────────────────────────────────────────────────────
// files: { 'name.csv': string } | { 'name.pdf': { pdf: PdfSpec } } | { 'name.pdf': { bytes } }
// checks: which cart files to run against rules.csv and document

const scenarios = [
  {
    dir: '01-brief-sample',
    title: 'The sample data from the brief',
    tests: 'The baseline every reviewer checks first: max-discount selection, stacking, no-offer note, and the RULE-04 cart offer.',
    steps: ['Upload `rules.csv` and `cart.csv`, then click **Calculate Discounts**.', 'Then upload `cart.pdf`: same cart from a PDF, so the totals must be identical.'],
    files: {
      'rules.csv': csv(RULES_HEADER, BRIEF_RULES),
      'cart.csv': csv(CART_HEADER, BRIEF_CART),
      'cart.pdf': { pdf: { order: 'Order #OP-9921  |  Date: 15 Jan 2025', rows: BRIEF_CART.map(pdfRow) } },
    },
    checks: ['cart.csv', 'cart.pdf'],
    lookFor: [
      'ITEM-01: RULE-01 (Rs.195) beats RULE-02 (Rs.150); the reason says so.',
      'ITEM-02: Rs.849 → Rs.699 → Rs.629 (brand offer, then 10% Flipkart stacked on the reduced price).',
      'ITEM-04: "No offers available".',
      'Cart offer row: 10% off, Rs.593 saved. Final total **Rs.5,339**.',
    ],
  },
  {
    dir: '02-tie-break',
    title: 'Two offers give the same saving',
    tests: 'Ties between non-stackable rules go to the lowest rule ID in natural order (RULE-9 before RULE-10), and savings are compared exactly, before rounding.',
    steps: ['Upload `rules.csv` and `cart.csv`.'],
    files: {
      'rules.csv': csv(RULES_HEADER, [
        ['RULE-9', 'platform', 'Amazon India', 'percentage', 20, false, ''],
        ['RULE-10', 'brand', 'Natura Casa', 'flat', 200, false, ''],
        ['RULE-11', 'brand', 'Nordic Basics', 'flat', 150, false, ''],
        ['RULE-12', 'platform', 'Flipkart', 'flat', 150, false, ''],
      ]),
      'cart.csv': csv(CART_HEADER, [
        ['ITEM-01', 'Cushion Cover', 'Natura Casa', 'Amazon India', 1000],
        ['ITEM-02', 'Desk Lamp', 'Nordic Basics', 'Flipkart', 750],
        ['ITEM-03', 'Jute Rug', 'Natura Casa', 'Amazon India', 1001],
        ['ITEM-04', 'Door Mat', 'Natura Casa', 'Amazon India', 999],
      ]),
    },
    checks: ['cart.csv'],
    lookFor: [
      'Every item shows "same saving as the …": the customer pays the same whole-rupee price whichever offer applies.',
      'ITEM-01: 20% of 1,000 = Rs.200 = flat Rs.200, an exact tie, so RULE-9 wins (natural order; plain text sorting would wrongly pick RULE-10).',
      'ITEM-02: Rs.150 vs Rs.150 tie, so RULE-11 wins.',
      'ITEM-03: 20% of 1,001 = Rs.200.20 beats flat Rs.200. Both show as Rs.200, but the exact amount decides.',
      'ITEM-04: 20% of 999 = Rs.199.80 loses to flat Rs.200, so RULE-10 wins.',
    ],
  },
  {
    dir: '03-stacking',
    title: 'Several stackable offers on one item',
    tests: 'Stackable rules apply on top of the winner, each on the already-reduced price, in rule ID order; a stackable rule also applies alone when nothing else matches.',
    steps: ['Upload `rules.csv` and `cart.csv`.'],
    files: {
      'rules.csv': csv(RULES_HEADER, [
        ['RULE-01', 'brand', 'Natura Casa', 'flat', 150, false, ''],
        ['RULE-02', 'platform', 'Flipkart', 'percentage', 10, true, ''],
        ['RULE-03', 'brand', 'Natura Casa', 'flat', 100, true, ''],
        ['RULE-04', 'platform', 'Amazon India', 'percentage', 5, true, ''],
      ]),
      'cart.csv': csv(CART_HEADER, [
        ['ITEM-01', 'Bed Sheet Set', 'Natura Casa', 'Flipkart', 1000],
        ['ITEM-02', 'Desk Organiser', 'Nordic Basics', 'Flipkart', 899],
        ['ITEM-03', 'Cushion Cover', 'Natura Casa', 'Amazon India', 1299],
        ['ITEM-04', 'Ceramic Vase', 'LivSpace Pro', 'Noon', 2499],
      ]),
    },
    checks: ['cart.csv'],
    lookFor: [
      'ITEM-01: 1,000 − 150 = 850 → −10% = 765 → −100 = **665** (RULE-01, then RULE-02, then RULE-03).',
      'ITEM-02: only a stackable rule matches, so it applies on its own: 899 × 0.9 = **809**.',
      'ITEM-03: 1,299 − 150 = 1,149 → −100 = 1,049 → −5% = 996.55 → **997** (rounded once, at the end).',
    ],
  },
  {
    dir: '04-flat-discount-floor',
    title: 'Flat discount bigger than the price',
    tests: 'A flat discount never makes a price negative. It stops at Rs.0, and a stacked % on Rs.0 stays Rs.0.',
    steps: ['Upload `rules.csv` and `cart.csv`.'],
    files: {
      'rules.csv': csv(RULES_HEADER, [
        ['RULE-01', 'brand', 'Budget Home', 'flat', 500, false, ''],
        ['RULE-02', 'platform', 'Noon', 'percentage', 10, true, ''],
      ]),
      'cart.csv': csv(CART_HEADER, [
        ['ITEM-01', 'Coaster Set', 'Budget Home', 'Amazon India', 299],
        ['ITEM-02', 'Tea Towel', 'Budget Home', 'Noon', 450],
        ['ITEM-03', 'Table Lamp', 'Budget Home', 'Flipkart', 799],
        ['ITEM-04', 'Dinner Plate', 'Other Brand', 'Noon', 300],
      ]),
    },
    checks: ['cart.csv'],
    lookFor: ['ITEM-01 and ITEM-02 become **Rs.0**, not negative. "You save" equals the base price.', 'ITEM-03: 799 − 500 = 299.'],
  },
  {
    dir: '05-cart-threshold',
    title: 'Cart total exactly at, just below, and pushed below the threshold',
    tests: 'The cart offer condition is "≥ Rs.4,000", checked on the total *after* item discounts. Just below the threshold, the cart offer row disappears and an "Add Rs.X more" nudge shows instead.',
    steps: [
      'Upload `rules.csv`.',
      'Upload each cart file one after another. The summary re-runs every time.',
    ],
    files: {
      'rules.csv': csv(RULES_HEADER, [
        ['RULE-01', 'platform', 'Amazon India', 'percentage', 15, false, ''],
        ['RULE-04', 'cart', '', 'percentage', 10, false, 4000],
      ]),
      'cart-exactly-4000.csv': csv(CART_HEADER, [
        ['ITEM-01', 'Ceramic Vase', 'LivSpace Pro', 'Noon', 2500],
        ['ITEM-02', 'Floor Lamp', 'LivSpace Pro', 'Noon', 1500],
      ]),
      'cart-3999.csv': csv(CART_HEADER, [
        ['ITEM-01', 'Ceramic Vase', 'LivSpace Pro', 'Noon', 2500],
        ['ITEM-02', 'Floor Lamp', 'LivSpace Pro', 'Noon', 1499],
      ]),
      'cart-item-discount-drops-below.csv': csv(CART_HEADER, [
        ['ITEM-01', 'Sofa Throw', 'Natura Casa', 'Amazon India', 4200],
      ]),
    },
    checks: ['cart-exactly-4000.csv', 'cart-3999.csv', 'cart-item-discount-drops-below.csv'],
    lookFor: [
      'Exactly Rs.4,000: the cart offer **applies** (≥), Rs.400 off → Rs.3,600.',
      'Rs.3,999: **no** cart offer row; instead "Add Rs.1 more to unlock 10% off your cart".',
      'Base price Rs.4,200 is above the threshold, but after 15% off the item costs Rs.3,570, so no cart offer and a nudge for Rs.430. The threshold uses final item prices, as the brief says.',
    ],
  },
  {
    dir: '06-multiple-cart-rules',
    title: 'Several cart offers competing',
    tests: 'Only one cart offer applies: the biggest rupee saving among those that qualify. A cart rule marked stackable is still treated as not stackable. The nudge points to the next offer that would beat the current one.',
    steps: ['Upload `rules.csv`, then each cart file in turn.'],
    files: {
      'rules.csv': csv(RULES_HEADER, [
        ['RULE-01', 'cart', '', 'percentage', 10, false, 4000],
        ['RULE-02', 'cart', '', 'flat', 500, true, 3000],
        ['RULE-03', 'cart', '', 'percentage', 15, false, 10000],
      ]),
      'cart-3500.csv': csv(CART_HEADER, [['ITEM-01', 'Bookshelf', 'LivSpace Pro', 'Noon', 3500]]),
      'cart-4500.csv': csv(CART_HEADER, [['ITEM-01', 'Bookshelf', 'LivSpace Pro', 'Noon', 4500]]),
      'cart-6000.csv': csv(CART_HEADER, [['ITEM-01', 'Bookshelf', 'LivSpace Pro', 'Noon', 6000]]),
      'cart-12000.csv': csv(CART_HEADER, [['ITEM-01', 'Bookshelf', 'LivSpace Pro', 'Noon', 12000]]),
    },
    checks: ['cart-3500.csv', 'cart-4500.csv', 'cart-6000.csv', 'cart-12000.csv'],
    lookFor: [
      'The rules table shows RULE-02 as **Stackable: No** even though the CSV says `true`.',
      'Rs.4,500: 10% = Rs.450 loses to flat Rs.500, so RULE-02 wins.',
      'Rs.6,000: 10% = Rs.600 beats Rs.500, so RULE-01 wins.',
      'Rs.3,500: the nudge skips RULE-01 (only Rs.400 at Rs.4,000, worse than the Rs.500 you already get) and points to RULE-03.',
    ],
  },
  {
    dir: '07-messy-names',
    title: 'Inconsistent spelling of brands and platforms',
    tests: 'Matching ignores case, surrounding spaces and doubled inner spaces, but does not guess: "Amazon.in" is a different name.',
    steps: ['Upload `rules.csv` and `cart.csv`.'],
    files: {
      'rules.csv': csv(RULES_HEADER, [
        ['RULE-01', 'platform', 'Amazon India', 'percentage', 15, false, ''],
        ['RULE-02', 'brand', 'Natura Casa', 'flat', 150, false, ''],
      ]),
      'cart.csv': csv(CART_HEADER, [
        ['ITEM-01', 'Cushion Cover', '  natura casa ', 'Noon', 1299],
        ['ITEM-02', 'Wall Shelf', 'LivSpace Pro', 'AMAZON INDIA', 599],
        ['ITEM-03', 'Cutting Board', 'Nordic Basics', 'Amazon  India', 449],
        ['ITEM-04', 'Desk Organiser', 'Nordic Basics', 'Amazon.in', 899],
      ]),
    },
    checks: ['cart.csv'],
    lookFor: ['ITEM-01 to ITEM-03 all get their offer.', 'ITEM-04 ("Amazon.in") gets **no** offer. Fuzzy-matching prices would be risky, so this is deliberate.'],
  },
  {
    dir: '08-broken-rules-csv',
    title: 'A rules file full of mistakes',
    tests: 'Every bad row is skipped with a specific reason; good rows still load. Uses the same validation as AI-parsed rules.',
    steps: ['Upload `rules.csv` (and `cart.csv` to see prices with just the valid rules).'],
    files: {
      'rules.csv': csv(RULES_HEADER, [
        ['RULE-01', 'platform', 'Amazon India', 'percentage', 15, false, ''],
        ['RULE-02', 'category', 'Home Decor', 'percentage', 10, false, ''],
        ['RULE-03', 'brand', 'Natura Casa', 'percentage', 150, false, ''],
        ['RULE-04', 'cart', '', 'percentage', 10, false, ''],
        ['RULE-05', 'brand', '', 'flat', 100, false, ''],
        ['RULE-06', 'platform', 'Flipkart', 'flat', -50, false, ''],
        ['RULE-07', 'platform', 'Noon', 'flat', 'abc', false, ''],
        ['RULE-01', 'brand', 'Nordic Basics', 'flat', 100, false, ''],
        ['RULE-08', 'brand', 'Natura Casa', 'flat', 150, false, 2000],
        ['RULE-09', 'platform', 'Flipkart', 'percentage', 10, 'yes', ''],
        ['', 'platform', 'Flipkart', 'percentage', 10, false, ''],
        ['RULE-10', 'cart', 'Amazon India', 'percentage', 5, false, 3000],
      ]),
      'cart.csv': csv(CART_HEADER, BRIEF_CART),
    },
    checks: ['cart.csv'],
    lookFor: ['Only RULE-01 and RULE-09 load (2 rules); 10 rows are skipped with reasons.', '`stackable` accepts `yes` as well as `true`.'],
  },
  {
    dir: '09-broken-cart-csv',
    title: 'A cart file with bad rows and different price formats',
    tests: 'Prices like "Rs.1,299", "₹899" and "INR 1499" are understood; missing fields, text, negative and zero prices are skipped with a reason.',
    steps: ['Upload `rules.csv` and `cart.csv`.'],
    files: {
      'rules.csv': csv(RULES_HEADER, BRIEF_RULES),
      'cart.csv': csv(CART_HEADER, [
        ['ITEM-01', 'Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
        ['ITEM-02', 'Bed Sheet Set', '', 'Flipkart', 849],
        ['ITEM-03', 'Wall Shelf', 'LivSpace Pro', 'Amazon India', 'abc'],
        ['ITEM-04', 'Ceramic Vase', 'LivSpace Pro', 'Noon', -2499],
        ['ITEM-05', 'Cutting Board', 'Nordic Basics', 'Amazon India', 0],
        ['ITEM-06', 'Desk Organiser', 'Nordic Basics', 'Flipkart', '₹899'],
        ['ITEM-07', 'Table Runner', 'Natura Casa', 'Flipkart', 'INR 1499'],
        ['ITEM-08', '', 'Nordic Basics', 'Noon', 599],
      ]),
    },
    checks: ['cart.csv'],
    lookFor: ['3 items load (ITEM-01, 06, 07); 5 rows are listed as skipped.', 'Cart total is below Rs.4,000, so a nudge shows instead of the cart offer.'],
  },
  {
    dir: '10-wrong-files',
    title: 'Empty or wrong files',
    tests: 'A file with nothing usable shows a clear error and **does not wipe** what was already loaded.',
    steps: [
      'First load `01-brief-sample/rules.csv` and `cart.csv` and calculate.',
      'Then upload each file here into the box named in the table below. Each one shows an error, and the previous rules and cart stay on screen.',
    ],
    files: {
      'cart-header-only.csv': CART_HEADER.join(',') + '\n',
      'cart-empty.csv': '',
      'rules-file-uploaded-as-cart.csv': csv(RULES_HEADER, BRIEF_RULES),
      'rules-header-only.csv': RULES_HEADER.join(',') + '\n',
      'cart-file-uploaded-as-rules.csv': csv(CART_HEADER, BRIEF_CART),
    },
    errorChecks: [
      ['cart-header-only.csv', 'cart'],
      ['cart-empty.csv', 'cart'],
      ['rules-file-uploaded-as-cart.csv', 'cart'],
      ['rules-header-only.csv', 'rules'],
      ['cart-file-uploaded-as-rules.csv', 'rules'],
    ],
  },
  {
    dir: '11-pdf-big-order',
    title: 'Two-page order PDF, price variants and a wrapped name',
    tests: 'The PDF table continues onto page 2 (header repeated), prices use different formats ("Rs.1,299", "Rs. 1299", "INR 1299", "1,299"), and one long product name wraps onto a second line.',
    steps: ['Upload `rules.csv`, then upload `order.pdf` in the **Cart PDF** box.'],
    files: {
      'rules.csv': csv(RULES_HEADER, BRIEF_RULES),
      'order.pdf': { pdf: { order: 'Order #OP-10457  |  Date: 02 Feb 2025', rows: bigOrderRows(), rowsPerPage: 20 } },
    },
    checks: ['order.pdf'],
    lookFor: [
      '23 items load from both pages. The page-2 title ("Order #… (continued)") and repeated header are not read as items, so ITEM-19 is plain "Plant Stand".',
      'Every price format is understood ("Rs.2,537", "Rs. 1702", "INR 2075", "2,448").',
      'Cart total is far above Rs.4,000, so the cart offer applies.',
      '"Handwoven Jute Area Rug (5x7 ft)" is one item, not two.',
    ],
  },
  {
    dir: '12-pdf-problems',
    title: 'PDFs that cannot be used (or only partly)',
    tests: 'Each kind of bad PDF gets its own message. If nothing is usable, the current cart is kept. (Password-protected PDFs and PDFs over 5 MB are also handled, with their own messages, but are not included here: the tools used to generate these files cannot encrypt a PDF, and a 5 MB file would bloat the repo.)',
    steps: [
      "Upload `rules.csv` (the brief's rules), then `some-bad-rows.pdf` in the **Cart PDF** box.",
      'Then upload each of the other PDFs. Each shows an error and the cart from step 1 stays.',
    ],
    files: {
      'rules.csv': csv(RULES_HEADER, BRIEF_RULES),
      'some-bad-rows.pdf': {
        pdf: {
          order: 'Order #OP-20001  |  Date: 05 Feb 2025',
          rows: [
            ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
            ['(Set of 2)', '', '', ''],
            ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.abc'],
            ['Ceramic Vase', 'LivSpace Pro', 'Noon', ''],
            ['Desk Organiser', '', 'Flipkart', 'Rs.899'],
            ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
          ],
        },
      },
      'all-rows-bad.pdf': {
        pdf: {
          order: 'Order #OP-20002',
          rows: [
            ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'free'],
            ['Desk Organiser', '', 'Flipkart', 'Rs.899'],
          ],
        },
      },
      'no-table-header.pdf': {
        pdf: { order: 'Order #OP-20003', header: false, rows: BRIEF_CART.map(pdfRow).slice(0, 3) },
      },
      'scanned-no-text.pdf': { scanned: true },
      'not-really-a-pdf.pdf': { bytes: new TextEncoder().encode(csv(CART_HEADER, BRIEF_CART)) },
    },
    checks: ['some-bad-rows.pdf'],
    errorChecks: [
      ['all-rows-bad.pdf', 'pdf'],
      ['no-table-header.pdf', 'pdf'],
      ['scanned-no-text.pdf', 'pdf'],
      ['not-really-a-pdf.pdf', 'pdf'],
    ],
  },
]

// ── Helpers ──────────────────────────────────────────────────────

function csv(header, rows) {
  const cell = (v) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n'
}

function pdfRow([, product, brand, platform, price]) {
  return [product, brand, platform, `Rs.${Number(price).toLocaleString('en-IN')}`]
}

function bigOrderRows() {
  const brands = [
    ['Natura Casa', ['Cushion Cover', 'Bed Sheet Set', 'Table Runner', 'Throw Blanket', 'Curtain Pair', 'Bath Towel Set']],
    ['LivSpace Pro', ['Wall Shelf', 'Ceramic Vase', 'Floor Lamp', 'Shoe Rack', 'Coffee Table', 'Bookshelf']],
    ['Nordic Basics', ['Cutting Board', 'Desk Organiser', 'Spice Rack', 'Laundry Basket', 'Wall Clock', 'Plant Stand']],
  ]
  const platforms = ['Amazon India', 'Flipkart', 'Noon']
  const formats = [(p) => `Rs.${p.toLocaleString('en-IN')}`, (p) => `Rs. ${p}`, (p) => `INR ${p}`, (p) => p.toLocaleString('en-IN')]
  const rows = []
  let n = 0
  for (const [brand, products] of brands) {
    for (const product of products) {
      const price = 299 + ((n * 373) % 2700)
      rows.push([product, brand, platforms[n % 3], formats[n % 4](price)])
      n++
    }
  }
  rows.splice(5, 0, ['Handwoven Jute', 'Natura Casa', 'Flipkart', 'Rs.2,150'], ['Area Rug (5x7 ft)', '', '', ''])
  rows.push(['Ceramic Mug Set', 'Nordic Basics', 'Amazon India', 'Rs.649'], ['Photo Frame', 'LivSpace Pro', 'Flipkart', 'Rs. 399'])
  rows.push(['Cotton Rug', 'Natura Casa', 'Noon', 'INR 1899'], ['Door Stopper', 'Nordic Basics', 'Noon', '199'])
  return rows
}

async function makePdf({ order, rows, header = true, rowsPerPage = 30 }) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const X = [50, 190, 310, 430]
  for (let start = 0; start < rows.length; start += rowsPerPage) {
    const page = doc.addPage([595, 842])
    const text = (s, x, y, f = font) => page.drawText(s, { x, y, size: 11, font: f, color: rgb(0.08, 0.1, 0.28) })
    let y = 780
    if (start === 0) {
      text(order, 50, y)
      y -= 40
    } else {
      text(`${order}  (continued)`, 50, y)
      y -= 40
    }
    if (header) {
      ;['Product', 'Brand', 'Platform', 'Base Price'].forEach((h, i) => text(h, X[i], y, bold))
      page.drawLine({ start: { x: 50, y: y - 8 }, end: { x: 545, y: y - 8 }, thickness: 1 })
    }
    y -= 26
    for (const row of rows.slice(start, start + rowsPerPage)) {
      row.forEach((cell, c) => cell && text(cell, X[c], y))
      y -= 20
    }
  }
  return doc.save()
}

async function makeScannedPdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  for (let r = 0; r < 7; r++) {
    page.drawRectangle({ x: 50, y: 740 - r * 20, width: 495, height: 10, color: rgb(0.8, 0.8, 0.8) })
  }
  return doc.save()
}

/** Mirrors the browser path: the %PDF- check in pdfText.js runs before pdf.js. */
async function loadPdfCart(bytes) {
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
    return { ok: false, error: "That file isn't a PDF. Please upload the cart as a .pdf (or use the CSV upload)." }
  }
  const extracted = await readTextItems(pdfjs, bytes)
  return extracted.ok ? parseCartFromTextItems(extracted.data) : extracted
}

// ── Markdown ─────────────────────────────────────────────────────

const STATUS = { 'max-discount': 'Max discount', stacked: 'Stacked', applied: 'Discount applied', none: 'No offer' }

function loadNotes(result) {
  if (!result.ok) return [`**Error shown:** ${result.error}`]
  const lines = []
  if (result.summary) lines.push(`**Message:** ${result.summary}`)
  for (const w of result.warnings) lines.push(`**Skipped:** ${w}`)
  return lines
}

function resultMarkdown(calc) {
  const out = [
    '| Item | Product | Base price | Rule(s) applied | Final price | Status | What the customer reads |',
    '|---|---|---:|---|---:|---|---|',
    ...calc.items.map(
      (r) =>
        `| ${r.itemId} | ${r.product} (${r.brand.trim()} · ${r.platform.trim()}) | ${formatRs(r.basePrice)} | ${r.rulesApplied} | **${formatRs(r.finalPrice)}** | ${STATUS[r.status]} | ${r.reasoning} |`,
    ),
    '',
    `- Cart total before cart offer: **${formatRs(calc.subtotal)}**`,
    calc.cartOffer
      ? `- Cart offer row: **Cart offer: ${offerValue(calc.cartOffer.rule)} — ${formatRs(calc.cartOffer.saving)} saved**: ${calc.cartOffer.explanation}`
      : '- Cart offer row: *not shown* (no cart offer qualifies)',
  ]
  if (calc.nudge) out.push(`- Nudge: "Add ${formatRs(calc.nudge.shortBy)} more to unlock ${offerValue(calc.nudge.rule)} your cart" (${calc.nudge.rule.ruleId})`)
  out.push(`- **Final cart total: ${formatRs(calc.total)}**${calc.totalSavings ? ` (customer saves ${formatRs(calc.totalSavings)})` : ''}`)
  return out.join('\n')
}

// ── Build ────────────────────────────────────────────────────────

// Rebuild scenario folders only; 13-plain-english-rules.md comes from `npm run check:nl`.
for (const s of scenarios) rmSync(new URL(`${s.dir}/`, ROOT), { recursive: true, force: true })
const md = []
const index = []

for (const s of scenarios) {
  const dir = new URL(`${s.dir}/`, ROOT)
  mkdirSync(dir, { recursive: true })
  const bytesByName = {}

  for (const [name, content] of Object.entries(s.files)) {
    let data
    if (typeof content === 'string') data = content
    else if (content.pdf) data = await makePdf(content.pdf)
    else if (content.scanned) data = await makeScannedPdf()
    else data = content.bytes
    writeFileSync(new URL(name, dir), data)
    bytesByName[name] = typeof data === 'string' ? data : new Uint8Array(data)
  }

  index.push(`| [${s.dir}](#${s.dir}) | ${s.title} |`)
  md.push(`## ${s.dir}`, '', `### ${s.title}`, '', `**What it tests:** ${s.tests}`, '', '**Steps:**', ...s.steps.map((t, i) => `${i + 1}. ${t}`), '')

  let rules = []
  if (bytesByName['rules.csv'] !== undefined) {
    const rulesResult = parseRulesCSV(bytesByName['rules.csv'])
    rules = rulesResult.ok ? rulesResult.data : []
    md.push(
      `**rules.csv →** ${rulesResult.ok ? `${rules.length} active rule${rules.length === 1 ? '' : 's'}: ${rules.map((r) => `${r.ruleId} (${r.scope}${r.appliesTo ? ` ${r.appliesTo}` : ''}, ${offerValue(r)}${r.minCartValue ? `, cart ≥ ${formatRs(r.minCartValue)}` : ''}${r.stackable ? ', stackable' : ''})`).join('; ')}` : 'error'}`,
      '',
      ...loadNotes(rulesResult).filter((l) => l.startsWith('**Skipped') || l.startsWith('**Error')).map((l) => `- ${l}`),
      '',
    )
  }

  for (const cartFile of s.checks ?? []) {
    const cartResult = cartFile.endsWith('.pdf') ? await loadPdfCart(bytesByName[cartFile]) : parseCartCSV(bytesByName[cartFile])
    md.push(`#### Upload \`${cartFile}\``, '', ...loadNotes(cartResult).map((l) => `- ${l}`), '')
    if (cartResult.ok) md.push(resultMarkdown(calculateCart(cartResult.data, rules)), '')
  }

  if (s.errorChecks) {
    md.push('| File | Upload into | What you should see |', '|---|---|---|')
    for (const [file, kind] of s.errorChecks) {
      const result =
        kind === 'pdf' ? await loadPdfCart(bytesByName[file]) : kind === 'cart' ? parseCartCSV(bytesByName[file]) : parseRulesCSV(bytesByName[file])
      const box = kind === 'pdf' ? 'Cart PDF' : kind === 'cart' ? 'cart.csv' : 'rules.csv'
      md.push(`| \`${file}\` | ${box} | ${result.ok ? `Loads ${result.data.length} rows` : `Error: ${result.error}`} — previous data kept |`)
    }
    md.push('')
  }

  if (s.lookFor) md.push('**Look for:**', ...s.lookFor.map((l) => `- ${l}`), '')
  md.push('---', '')
}

const guide = `# Test data guide

Ready-made files for trying every rule of the discount engine, including the edge cases.
Every expected result below was produced by running these exact files through the app's own
CSV reader, PDF reader (pdf.js) and discount engine, so the app should match it exactly.
Regenerate everything with \`npm run make:test-data\`.

## Which file goes where

| Box in the app | Upload | Format |
|---|---|---|
| **Discount Rules** | \`rules.csv\` | \`rule_id, scope, applies_to, type, value, stackable, min_cart_value\` |
| **Cart Items → cart.csv** | \`cart*.csv\` | \`item_id, product, brand, platform, base_price\` |
| **Cart Items → Cart PDF** | \`*.pdf\` | Table with columns Product, Brand, Platform, Base Price |
| **Add a Rule in Plain English** | type a sentence | see [13-plain-english-rules.md](13-plain-english-rules.md) |

Rule fields: \`scope\` is \`brand\`, \`platform\` or \`cart\`; \`type\` is \`percentage\` or \`flat\`;
\`applies_to\` is the brand/platform name (empty for cart rules); \`min_cart_value\` is only for cart rules.

Typical flow: upload rules first, then a cart, click **Calculate Discounts** once. After that,
every new rules file, cart file, PDF or confirmed plain-English rule re-runs the prices automatically.

## Scenarios

| Folder | Scenario |
|---|---|
${index.join('\n')}
| [13-plain-english-rules.md](13-plain-english-rules.md) | Sentences to type into the plain-English box |

---

${md.join('\n')}
`

writeFileSync(new URL('README.md', ROOT), guide)
console.log(`wrote test-data/ (${scenarios.length} scenarios + README.md)`)
