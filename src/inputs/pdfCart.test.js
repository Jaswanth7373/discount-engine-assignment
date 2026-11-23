import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseRows, groupIntoLines, linesToRows, parseCartFromTextItems } from './pdfCart.js'
import { readTextItems } from './pdfTextItems.js'
import { parsePrice } from './cartItem.js'

describe('parsePrice', () => {
  it.each([
    ['Rs.1,299', 1299],
    ['Rs. 1299', 1299],
    ['₹1,299', 1299],
    ['INR 1299', 1299],
    ['rs 849', 849],
    ['1,00,000', 100000],
    ['599.50', 600],
  ])('%s → %i', (input, expected) => expect(parsePrice(input)).toBe(expected))

  it.each(['', 'Rs.abc', '-499', 'Rs.0', 'Rs.12abc', 'free'])('rejects %j', (input) =>
    expect(parsePrice(input)).toBeNull(),
  )
})

describe('parseRows', () => {
  it('converts valid rows to CartItems with generated IDs', () => {
    const r = parseRows([
      ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
      ['Ceramic Vase', 'LivSpace Pro', 'Noon', '₹2,499'],
    ])
    expect(r.ok).toBe(true)
    expect(r.data).toEqual([
      { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
      { itemId: 'ITEM-02', product: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 2499 },
    ])
    expect(r.warnings).toEqual([])
  })

  it('skips a row with a bad price and keeps the rest', () => {
    const r = parseRows([
      ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.abc'],
      ['Desk Organiser', 'Nordic Basics', 'Flipkart', ''],
      ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
    ])
    expect(r.data.map((i) => i.product)).toEqual(['Bed Sheet Set'])
    expect(r.warnings).toEqual([
      'Row 1 skipped: "Rs.abc" is not a valid price',
      'Row 2 skipped: price not found',
    ])
  })

  it('skips a row with a missing column', () => {
    const r = parseRows([
      ['Desk Organiser', '', 'Flipkart', 'Rs.899'],
      ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
    ])
    expect(r.warnings).toEqual(['Row 1 skipped: missing brand'])
    expect(r.data[0].itemId).toBe('ITEM-01')
  })

  it('trims extra whitespace', () => {
    const r = parseRows([['  Cushion Cover ', ' Natura Casa', 'Amazon India  ', '  Rs.1,299 ']])
    expect(r.data[0]).toMatchObject({ product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India' })
  })

  it('joins a wrapped product name onto the row above', () => {
    const r = parseRows([
      ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
      ['(Set of 2)', '', '', ''],
    ])
    expect(r.data).toHaveLength(1)
    expect(r.data[0].product).toBe('Cushion Cover (Set of 2)')
  })

  it('fails with a clear error when no row is usable', () => {
    expect(parseRows([])).toEqual({
      ok: false,
      error: 'No cart items found. Expected columns: Product, Brand, Platform, Base Price.',
    })
    expect(parseRows([['Only product', '', 'Noon', 'x']]).ok).toBe(false)
  })
})

describe('layout → rows', () => {
  const frag = (str, x, y, page = 1) => ({ str, x, y, page })

  it('groups fragments by line and keeps an empty cell in its column', () => {
    const items = [
      frag('Order #OP-1 | Date: today', 50, 780),
      frag('Product', 50, 740), frag('Brand', 190, 740), frag('Platform', 310, 740), frag('Base Price', 430, 740),
      frag('Desk Organiser', 50, 714), frag('Flipkart', 310, 714.5), frag('Rs.899', 430, 714),
    ]
    const table = linesToRows(groupIntoLines(items))
    expect(table).toEqual({ ok: true, orderId: 'OP-1', rows: [['Desk Organiser', '', 'Flipkart', 'Rs.899']] })
  })

  it('errors when there is no header row', () => {
    const table = linesToRows(groupIntoLines([frag('Hello world', 50, 700)]))
    expect(table.ok).toBe(false)
  })
})

describe('sample PDFs (real pdf.js text extraction)', () => {
  const load = async (name) => {
    const data = new Uint8Array(readFileSync(new URL(`../../sample-data/${name}`, import.meta.url)))
    const extracted = await readTextItems(pdfjs, data)
    return extracted.ok ? parseCartFromTextItems(extracted.data) : extracted
  }

  it('cart.pdf loads the 6 items from the brief', async () => {
    const r = await load('cart.pdf')
    expect(r.ok).toBe(true)
    expect(r.summary).toBe('Loaded 6 items from order OP-9921')
    expect(r.data.map((i) => [i.product, i.brand, i.platform, i.basePrice])).toEqual([
      ['Cushion Cover', 'Natura Casa', 'Amazon India', 1299],
      ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 849],
      ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 599],
      ['Ceramic Vase', 'LivSpace Pro', 'Noon', 2499],
      ['Cutting Board', 'Nordic Basics', 'Amazon India', 449],
      ['Desk Organiser', 'Nordic Basics', 'Flipkart', 899],
    ])
  })

  it('cart-malformed.pdf keeps good rows and explains skipped ones', async () => {
    const r = await load('cart-malformed.pdf')
    expect(r.ok).toBe(true)
    expect(r.data.map((i) => i.product)).toEqual(['Cushion Cover (Set of 2)', 'Bed Sheet Set', 'Ceramic Vase'])
    expect(r.warnings).toEqual([
      'Row 4 skipped: "Rs.abc" is not a valid price',
      'Row 6 skipped: missing brand',
    ])
    expect(r.summary).toBe('Loaded 3 items from order OP-9922 (2 rows skipped)')
  })

  it('cart-scanned.pdf is reported as having no text layer', async () => {
    const r = await load('cart-scanned.pdf')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/scanned image/)
  })

  it('a non-PDF byte stream gives a friendly error', async () => {
    const r = await readTextItems(pdfjs, new TextEncoder().encode('item_id,product\n'))
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/couldn't be opened/) })
  })
})
