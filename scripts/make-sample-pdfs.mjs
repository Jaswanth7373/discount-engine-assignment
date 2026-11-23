/**
 * Generates the demo cart PDFs in sample-data/:
 *   cart.pdf            the 6-item cart from the brief
 *   cart-malformed.pdf  one bad price, one missing brand, one wrapped product name
 *   cart-scanned.pdf    no text layer (simulates a scanned image)
 *
 * Run: npm run make:pdfs
 */

import { writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const COL_X = [50, 190, 310, 430]
const out = (name) => new URL(`../sample-data/${name}`, import.meta.url)

const VALID_ROWS = [
  ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
  ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
  ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.599'],
  ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
  ['Cutting Board', 'Nordic Basics', 'Amazon India', 'Rs.449'],
  ['Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'],
]

const MALFORMED_ROWS = [
  ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
  ['(Set of 2)', '', '', ''], // wrapped product name → joined onto the row above
  ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
  ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.abc'], // bad price → skipped
  ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
  ['Desk Organiser', '', 'Flipkart', 'Rs.899'], // missing brand → skipped
]

async function makeCartPdf(fileName, orderLine, rows) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const text = (str, x, y, f = font) => page.drawText(str, { x, y, size: 11, font: f, color: rgb(0.08, 0.1, 0.28) })

  text(orderLine, 50, 780)
  ;['Product', 'Brand', 'Platform', 'Base Price'].forEach((h, i) => text(h, COL_X[i], 740, bold))
  page.drawLine({ start: { x: 50, y: 732 }, end: { x: 545, y: 732 }, thickness: 1 })

  rows.forEach((row, r) => {
    const y = 714 - r * 20
    row.forEach((cell, c) => cell && text(cell, COL_X[c], y))
  })

  writeFileSync(out(fileName), await doc.save())
  console.log(`wrote sample-data/${fileName}`)
}

async function makeScannedPdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  // Grey bars stand in for an image of a printed table: no text layer at all.
  for (let r = 0; r < 7; r++) {
    page.drawRectangle({ x: 50, y: 740 - r * 20, width: 495, height: 10, color: rgb(0.8, 0.8, 0.8) })
  }
  writeFileSync(out('cart-scanned.pdf'), await doc.save())
  console.log('wrote sample-data/cart-scanned.pdf')
}

await makeCartPdf('cart.pdf', 'Order #OP-9921  |  Date: 15 Jan 2025', VALID_ROWS)
await makeCartPdf('cart-malformed.pdf', 'Order #OP-9922  |  Date: 16 Jan 2025', MALFORMED_ROWS)
await makeScannedPdf()
