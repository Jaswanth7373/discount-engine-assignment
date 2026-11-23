/**
 * pdfText.js — the only file that touches pdf.js.
 * Reads a PDF File in the browser and returns its positioned text fragments.
 */

import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fail } from './inputResult.js'
import { readTextItems } from './pdfTextItems.js'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export const MAX_PDF_BYTES = 5 * 1024 * 1024

async function looksLikePdf(file) {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  return String.fromCharCode(...head) === '%PDF-'
}

/**
 * @param {File} file
 * @returns {Promise<import('./inputResult.js').InputResult<import('./pdfCart.js').TextItem[]>>}
 */
export async function extractTextItems(file) {
  if (file.size > MAX_PDF_BYTES) {
    return fail('This PDF is larger than 5 MB. Please upload a smaller cart file.')
  }
  if (!(await looksLikePdf(file))) {
    return fail("That file isn't a PDF. Please upload the cart as a .pdf (or use the CSV upload).")
  }

  const data = new Uint8Array(await file.arrayBuffer())
  return readTextItems(pdfjs, data)
}
