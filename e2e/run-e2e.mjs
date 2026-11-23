/**
 * End-to-end test of the built app in a real browser (Chrome/Edge via puppeteer-core).
 *
 * For every folder in test-data/ it uploads the files through the real upload boxes
 * and checks what is on screen:
 *   1. against hand-calculated numbers (independent of the engine), and
 *   2. against the engine's own result for the same files (catches UI/wiring bugs).
 * It also checks error files keep the previous data, the plain-English flow
 * (parse → confirm → re-run, vague input, discard) against the live LLM API,
 * the phone layout, and that the browser console stays clean.
 *
 * Usage:  npm run build && npm run preview   (in one terminal)
 *         npm run test:e2e                   (in another)
 * Env: E2E_URL (default http://localhost:4173), CHROME_PATH, E2E_SKIP_NL=1 to skip LLM calls.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseRulesCSV, parseCartCSV } from '../src/inputs/csv.js'
import { parseCartFromTextItems } from '../src/inputs/pdfCart.js'
import { readTextItems } from '../src/inputs/pdfTextItems.js'
import { calculateCart, offerValue } from '../src/engine/discountEngine.js'
import { formatRs } from '../src/engine/format.js'

const URL_BASE = process.env.E2E_URL || 'http://localhost:4173'
const DATA = new URL('../test-data/', import.meta.url)
const path = (rel) => decodeURIComponent(new URL(rel, DATA).pathname).replace(/^\/([A-Z]:)/i, '$1')

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p))

const STATUS = { 'max-discount': 'MAX DISCOUNT', stacked: 'STACKED', applied: 'DISCOUNT APPLIED', none: 'NO OFFER' }

// Hand-calculated expectations (independent oracle, worked out from the brief's rules by hand).
const HAND = {
  '01-brief-sample/cart.csv': { finals: [1104, 629, 509, 2499, 382, 809], subtotal: 5932, offer: 593, total: 5339 },
  '01-brief-sample/cart.pdf': { finals: [1104, 629, 509, 2499, 382, 809], subtotal: 5932, offer: 593, total: 5339 },
  '02-tie-break/cart.csv': { finals: [800, 600, 801, 799], subtotal: 3000, total: 3000 },
  '03-stacking/cart.csv': { finals: [665, 809, 997, 2499], subtotal: 4970, total: 4970 },
  '04-flat-discount-floor/cart.csv': { finals: [0, 0, 299, 270], subtotal: 569, total: 569 },
  '05-cart-threshold/cart-exactly-4000.csv': { subtotal: 4000, offer: 400, total: 3600 },
  '05-cart-threshold/cart-3999.csv': { subtotal: 3999, total: 3999, nudge: 1 },
  '05-cart-threshold/cart-item-discount-drops-below.csv': { finals: [3570], subtotal: 3570, total: 3570, nudge: 430 },
  '06-multiple-cart-rules/cart-3500.csv': { offer: 500, total: 3000, nudge: 6500 },
  '06-multiple-cart-rules/cart-4500.csv': { offer: 500, total: 4000, nudge: 5500 },
  '06-multiple-cart-rules/cart-6000.csv': { offer: 600, total: 5400, nudge: 4000 },
  '06-multiple-cart-rules/cart-12000.csv': { offer: 1800, total: 10200 },
  '07-messy-names/cart.csv': { finals: [1149, 509, 382, 899] },
  '09-broken-cart-csv/cart.csv': { finals: [1104, 809, 1214], subtotal: 3127, nudge: 873 },
}

let passed = 0
const failures = []
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++
  } else {
    failures.push(`${name}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`)
  }
}

async function loadCartFile(rel) {
  if (rel.endsWith('.csv')) return parseCartCSV(readFileSync(path(rel), 'utf8'))
  const bytes = new Uint8Array(readFileSync(path(rel)))
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
    return { ok: false, error: "That file isn't a PDF. Please upload the cart as a .pdf (or use the CSV upload)." }
  }
  const extracted = await readTextItems(pdfjs, bytes)
  return extracted.ok ? parseCartFromTextItems(extracted.data) : extracted
}

function expectedView(calc) {
  return {
    rows: calc.items.map((r) => ({
      itemId: r.itemId,
      final: formatRs(r.finalPrice),
      rulesApplied: r.rulesApplied,
      reasoning: r.reasoning,
      status: STATUS[r.status],
    })),
    subtotal: formatRs(calc.subtotal),
    cartOffer: calc.cartOffer
      ? `Cart offer: ${offerValue(calc.cartOffer.rule)} — ${formatRs(calc.cartOffer.saving)} saved | ${calc.cartOffer.explanation}`
      : null,
    nudge: calc.nudge ? `Add ${formatRs(calc.nudge.shortBy)} more to unlock ${offerValue(calc.nudge.rule)} your cart` : null,
    total: formatRs(calc.total),
  }
}

async function readView(page) {
  return page.evaluate(() => {
    const text = (el) => (el ? el.innerText.trim() : null)
    const q = (sel) => document.querySelector(sel)
    return {
      rows: [...document.querySelectorAll('[data-testid=item-row]')].map((tr) => ({
        itemId: text(tr.querySelector('[data-col=itemId]')),
        final: text(tr.querySelector('[data-col=finalPrice] div')),
        rulesApplied: text(tr.querySelector('[data-testid=rules-applied]')),
        reasoning: text(tr.querySelector('[data-testid=reasoning]')),
        status: text(tr.querySelector('[data-testid=status]')),
      })),
      subtotal: text(q('[data-testid=subtotal]')),
      cartOffer: q('[data-testid=cart-offer]')
        ? `${text(q('[data-testid=cart-offer-label]'))} | ${text(q('[data-testid=cart-offer-explanation]'))}`
        : null,
      nudge: q('[data-testid=nudge]') ? text(q('[data-testid=nudge]')).split(' (')[0] : null,
      total: text(q('[data-testid=total]')),
    }
  })
}

/** Polls the page until the view equals `expected` (uploads/PDF parsing are async). */
async function waitForView(page, expected, timeout = 15000) {
  const end = Date.now() + timeout
  let view
  while (Date.now() < end) {
    view = await readView(page)
    if (JSON.stringify(view) === JSON.stringify(expected)) return view
    await new Promise((r) => setTimeout(r, 150))
  }
  return view
}

const inputs = async (page) => page.$$('input[type=file]') // [rules.csv, cart.csv, cart.pdf]
const cartCount = (page) => page.evaluate(() => /(\d+) items? in cart/.exec(document.body.innerText)?.[1] ?? '0')

async function uploadCart(page, rel) {
  const [, csvInput, pdfInput] = await inputs(page)
  await (rel.endsWith('.pdf') ? pdfInput : csvInput).uploadFile(path(rel))
}

async function revealResults(page) {
  const btn = await page.$('xpath/.//button[contains(., "Calculate Discounts")]')
  if (btn) await btn.click()
}

async function freshPage(browser, consoleIssues) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && consoleIssues.push(m.text()))
  page.on('pageerror', (e) => consoleIssues.push(e.message))
  await page.goto(URL_BASE, { waitUntil: 'networkidle0' })
  return page
}

async function runScenario(browser, dir, consoleIssues) {
  const page = await freshPage(browser, consoleIssues)
  const files = readdirSync(path(dir)).sort()
  const hasRules = files.includes('rules.csv')
  const rules = hasRules ? parseRulesCSV(readFileSync(path(`${dir}/rules.csv`), 'utf8')) : null
  const activeRules = rules?.ok ? rules.data : []

  if (dir === '10-wrong-files' || dir === '12-pdf-problems') {
    // Load a known-good state first so we can prove error files don't wipe it.
    const [rulesInput] = await inputs(page)
    await rulesInput.uploadFile(path(hasRules ? `${dir}/rules.csv` : '01-brief-sample/rules.csv'))
    await uploadCart(page, '01-brief-sample/cart.csv')
    await page.waitForFunction(() => document.body.innerText.includes('6 items in cart'))
    await revealResults(page)
  } else if (hasRules) {
    const [rulesInput] = await inputs(page)
    await rulesInput.uploadFile(path(`${dir}/rules.csv`))
    await page.waitForFunction((n) => document.body.innerText.includes(`${n} active rule`), {}, activeRules.length)
    check(`${dir}: rules loaded`, await page.evaluate(() => /(\d+) active rules?/.exec(document.body.innerText)?.[1]), String(activeRules.length))
    for (const w of rules.warnings) {
      check(`${dir}: rules warning shown "${w}"`, await page.evaluate((t) => document.body.innerText.includes(t), w), true)
    }
  }

  for (const file of files.filter((f) => f !== 'rules.csv' && /\.(csv|pdf)$/.test(f))) {
    const rel = `${dir}/${file}`
    const isRulesFile = file.startsWith('rules-') || file.endsWith('-as-rules.csv')
    const expected = isRulesFile ? parseRulesCSV(readFileSync(path(rel), 'utf8')) : await loadCartFile(rel)
    const before = await cartCount(page)

    if (isRulesFile) {
      const [rulesInput] = await inputs(page)
      await rulesInput.uploadFile(path(rel))
    } else {
      await uploadCart(page, rel)
    }

    if (!expected.ok) {
      await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 15000 }, expected.error).catch(() => {})
      check(`${rel}: error message shown`, await page.evaluate((t) => document.body.innerText.includes(t), expected.error), true)
      check(`${rel}: previous cart kept`, await cartCount(page), before)
      continue
    }
    if (isRulesFile) continue

    if (expected.summary) {
      // Wait for this upload's own message, so an identical previous cart can't pass for it.
      await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 15000 }, expected.summary).catch(() => {})
    }
    await revealResults(page)
    const want = expectedView(calculateCart(expected.data, activeRules))
    const got = await waitForView(page, want)
    check(`${rel}: screen matches engine (every row, offer, nudge, total)`, got, want)

    for (const w of expected.warnings) {
      check(`${rel}: skipped-row warning shown "${w}"`, await page.evaluate((t) => document.body.innerText.includes(t), w), true)
    }
    if (expected.summary) {
      check(`${rel}: load summary shown`, await page.evaluate((t) => document.body.innerText.includes(t), expected.summary), true)
    }

    const hand = HAND[rel]
    if (hand) {
      if (hand.finals) check(`${rel}: hand-calculated final prices`, got.rows.map((r) => r.final), hand.finals.map(formatRs))
      if (hand.subtotal !== undefined) check(`${rel}: hand-calculated subtotal`, got.subtotal, formatRs(hand.subtotal))
      check(`${rel}: hand-calculated cart offer`, got.cartOffer?.match(/— (Rs\.[\d,]+) saved/)?.[1] ?? null, hand.offer ? formatRs(hand.offer) : null)
      if (hand.total !== undefined) check(`${rel}: hand-calculated total`, got.total, formatRs(hand.total))
      check(`${rel}: hand-calculated nudge`, got.nudge?.match(/Add (Rs\.[\d,]+)/)?.[1] ?? null, hand.nudge ? formatRs(hand.nudge) : null)
    }
  }
  await page.close()
}

async function runPlainEnglish(browser, consoleIssues) {
  const page = await freshPage(browser, consoleIssues)
  const [rulesInput] = await inputs(page)
  await rulesInput.uploadFile(path('01-brief-sample/rules.csv'))
  await uploadCart(page, '01-brief-sample/cart.csv')
  await page.waitForFunction(() => document.body.innerText.includes('6 items in cart'))
  await revealResults(page)

  const parse = async (text) => {
    await page.$eval('#rule-text', (el) => (el.value = ''))
    await page.type('#rule-text', text)
    await page.click('xpath/.//button[contains(., "Parse rule")]')
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Confirm new rule"]') || /Rule not parsed|too vague/.test(document.body.innerText),
      { timeout: 30000 },
    )
    await new Promise((r) => setTimeout(r, 4000)) // stay under the free-tier rate limit
  }
  const card = () => page.evaluate(() => document.querySelector('[aria-label="Confirm new rule"]')?.innerText ?? null)

  // 1. Brief example → card → confirm → engine re-runs with the new rule.
  await parse('20% off for Natura Casa brand, stackable with other offers')
  const c1 = await card()
  check('NL: card shows Brand / Natura Casa / Percentage / 20% off / stackable Yes',
    Boolean(c1 && /Scope\s+Brand/.test(c1) && /Applies to\s+Natura Casa/.test(c1) && /Type\s+Percentage/.test(c1) && /Value\s+20% off/.test(c1) && /Stackable\s+Yes/.test(c1)), true)
  check('NL: card offers Confirm and Discard',
    Boolean(c1 && /Confirm & add/i.test(c1) && /Discard/i.test(c1)), true)
  await page.click('xpath/.//button[contains(., "Confirm & add")]')
  const rules = parseRulesCSV(readFileSync(path('01-brief-sample/rules.csv'), 'utf8')).data
  const newRule = { ruleId: 'RULE-05', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null }
  const cart = parseCartCSV(readFileSync(path('01-brief-sample/cart.csv'), 'utf8')).data
  const want = expectedView(calculateCart(cart, [...rules, newRule]))
  check('NL: RULE-05 added and summary re-ran with it', await waitForView(page, want), want)
  check('NL: rules table lists RULE-05', await page.evaluate(() => document.body.innerText.includes('RULE-05')), true)
  check('NL: Applied To column shows RULE-05 on the Natura Casa items',
    await page.$eval('[data-testid=usage-RULE-05]', (el) => el.innerText), 'ITEM-01, ITEM-02')

  // 2. Ambiguous input is surfaced, nothing added.
  await parse('Give a discount for big orders')
  check('NL: vague input surfaced as too vague', await page.evaluate(() => document.body.innerText.includes("This rule can't be added yet")), true)
  check('NL: nothing added for vague input', await page.evaluate(() => document.body.innerText.includes('RULE-06')), false)

  // 3. Discard leaves the rules unchanged.
  await parse('Rs.100 flat discount on all Flipkart items')
  const c3 = await card()
  check('NL: card shows Platform / Flipkart / Flat / Rs.100 off / stackable No',
    Boolean(c3 && /Scope\s+Platform/.test(c3) && /Applies to\s+Flipkart/.test(c3) && /Type\s+Flat/.test(c3) && /Value\s+Rs\.100 off/.test(c3) && /Stackable\s+No/.test(c3)), true)
  await page.click('xpath/.//button[contains(., "Discard")]')
  check('NL: discard adds nothing', await page.evaluate(() => document.body.innerText.includes('RULE-06')), false)

  // 4. Cart rule from text.
  await parse('10% off if cart value is more than Rs.5,000')
  const c4 = await card()
  check('NL: card shows Cart / 10% off / min Rs.5,000',
    Boolean(c4 && /Scope\s+Cart/.test(c4) && /Value\s+10% off/.test(c4) && /Rs\.5,000/.test(c4)), true)

  await page.close()
}

async function runLayout(browser, consoleIssues) {
  const page = await freshPage(browser, consoleIssues)
  const [rulesInput] = await inputs(page)
  await rulesInput.uploadFile(path('01-brief-sample/rules.csv'))
  await uploadCart(page, '01-brief-sample/cart.csv')
  await page.waitForFunction(() => document.body.innerText.includes('6 items in cart'))
  await revealResults(page)
  await page.setViewport({ width: 375, height: 812 })
  check('Phone layout: no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await page.close()
}

if (!CHROME) {
  console.error('No Chrome/Edge found. Set CHROME_PATH.')
  process.exit(1)
}
try {
  await fetch(URL_BASE)
} catch {
  console.error(`App not reachable at ${URL_BASE}. Run "npm run build && npm run preview" first.`)
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const consoleIssues = []
for (const dir of readdirSync(path('.')).filter((d) => /^\d\d-/.test(d) && !d.endsWith('.md')).sort()) {
  const before = passed + failures.length
  await runScenario(browser, dir, consoleIssues)
  console.log(`${dir.padEnd(26)} ${passed + failures.length - before} checks`)
}
if (process.env.E2E_SKIP_NL !== '1') {
  await runPlainEnglish(browser, consoleIssues)
  console.log('plain-English (live LLM)   done')
}
await runLayout(browser, consoleIssues)
await browser.close()
check('Browser console: no errors or warnings', consoleIssues, [])

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log('\nFailures:\n  ' + failures.join('\n  '))
  process.exit(1)
}
