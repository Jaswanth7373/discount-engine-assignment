/**
 * Notice.jsx
 * Displays an error, warning or success message with optional detail lines.
 */

const TONES = {
  error:   { bg: '#fce8e8', border: '#e57373', accent: '#c0392b', title: '#8a1a1a', text: '#5a1010', role: 'alert' },
  warning: { bg: '#fff8e1', border: '#f0c36d', accent: '#e69500', title: '#7a4f00', text: '#5c3b00', role: 'status' },
  success: { bg: '#eaf6ec', border: '#8bc79a', accent: '#1e5c2c', title: '#1e5c2c', text: '#1e3d25', role: 'status' },
}

export default function Notice({ tone = 'error', title, messages = [] }) {
  if (!title && messages.length === 0) return null
  const t = TONES[tone]
  return (
    <div
      role={t.role}
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderLeft: `3px solid ${t.accent}`,
        borderRadius: 4,
        padding: '0.6rem 0.9rem',
        marginTop: '0.5rem',
      }}
    >
      {title && (
        <div style={{ fontWeight: 700, fontSize: 12, color: t.title, marginBottom: messages.length ? 4 : 0 }}>
          {title}
        </div>
      )}
      {messages.map((m, i) => (
        <div key={i} style={{ fontSize: 12, color: t.text, marginTop: 2 }}>
          {m}
        </div>
      ))}
    </div>
  )
}
