/**
 * pdfTextItems.js
 * Pulls positioned text out of PDF bytes using an injected pdf.js build
 * (browser build in the app, legacy Node build in tests), and maps pdf.js
 * failures to friendly, distinct messages.
 */

import { ok, fail } from './inputResult.js'

/**
 * @param {typeof import('pdfjs-dist')} pdfjs
 * @param {Uint8Array} data
 * @returns {Promise<import('./inputResult.js').InputResult<import('./pdfCart.js').TextItem[]>>}
 */
export async function readTextItems(pdfjs, data) {
  let doc
  try {
    // Only text positions are needed, so font-loading warnings are noise: log errors only.
    doc = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    }).promise
  } catch (err) {
    if (err?.name === 'PasswordException') {
      return fail('This PDF is password-protected. Please upload an unlocked copy.')
    }
    return fail("This PDF couldn't be opened. It may be damaged. Try exporting it again.")
  }

  try {
    const items = []
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo)
      const content = await page.getTextContent()
      for (const it of content.items) {
        if (typeof it.str !== 'string' || it.str.trim() === '') continue
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], page: pageNo })
      }
    }

    if (items.length === 0) {
      return fail(
        'This PDF has no readable text. It looks like a scanned image. Please upload a text-based PDF or the CSV.',
      )
    }
    return ok(items)
  } finally {
    await doc.destroy()
  }
}
