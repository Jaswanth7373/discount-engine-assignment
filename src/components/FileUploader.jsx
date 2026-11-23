/**
 * FileUploader.jsx
 *
 * Click-to-upload area for a single file. Knows nothing about file formats:
 * it hands the File to onFile and the caller's input adapter does the rest.
 */

import { useRef } from 'react'

export default function FileUploader({ label, description, accept, onFile, hasData, fileName, busy = false }) {
  const inputRef = useRef(null)

  function handleChange(e) {
    const file = e.target.files[0]
    // Reset so the same file can be re-uploaded after a fix
    e.target.value = ''
    if (file) onFile(file)
  }

  const borderColor = hasData ? '#1e5c2c' : '#CECECE'

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={busy}
      aria-label={`Upload ${label}`}
      style={{
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
        border: `2px dashed ${borderColor}`,
        borderRadius: 6,
        padding: '1rem 1.2rem',
        background: hasData ? '#f0faf2' : '#fafafa',
        cursor: busy ? 'progress' : 'pointer',
        opacity: busy ? 0.7 : 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleChange}
        tabIndex={-1}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span aria-hidden="true" style={{ fontSize: 20 }}>{hasData ? '✅' : '📄'}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>{label}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflowWrap: 'anywhere' }}>
            {busy ? 'Reading file…' : hasData && fileName ? fileName : description}
          </div>
        </div>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 700,
            color: hasData ? '#1e5c2c' : '#FF5800',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {hasData ? 'Change' : 'Upload'}
        </span>
      </div>
    </button>
  )
}
