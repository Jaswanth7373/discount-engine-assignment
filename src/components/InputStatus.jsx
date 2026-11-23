/**
 * InputStatus.jsx
 * Renders the outcome of any input adapter (an InputResult) the same way:
 * a red error, or a green summary plus yellow per-row warnings.
 */

import Notice from './Notice.jsx'

export default function InputStatus({ status }) {
  if (!status) return null
  const { result } = status

  if (!result.ok) {
    return <Notice tone="error" title="Nothing was loaded" messages={[result.error]} />
  }

  return (
    <>
      {result.summary && <Notice tone="success" title={result.summary} />}
      {result.warnings.length > 0 && (
        <Notice
          tone="warning"
          title={`${result.warnings.length} row${result.warnings.length > 1 ? 's' : ''} skipped`}
          messages={result.warnings}
        />
      )}
    </>
  )
}
