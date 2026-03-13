import { useState, FormEvent } from 'react'

interface LoginPageProps {
  onLogin: () => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Login failed' }))
        setError(data.error || 'Login failed')
        return
      }

      onLogin()
    } catch {
      setError('Unable to connect to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--nz-bg, #f0f2f5)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: 48,
        width: 400,
        maxWidth: '90vw',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        border: '1px solid #e5e7eb',
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--nz-navy, #1B3A5C)',
            margin: '0 0 8px',
          }}>
            Wilson Suite
          </h1>
          <p style={{
            fontSize: 14,
            color: '#6b7280',
            margin: 0,
          }}>
            Hazardous Substances Compliance Certification
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 16,
                border: '1px solid #d1d5db',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--nz-navy, #1B3A5C)'}
              onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
            />
          </div>

          {error && (
            <div style={{
              color: '#dc2626',
              fontSize: 14,
              marginBottom: 16,
              padding: '8px 12px',
              background: '#fef2f2',
              borderRadius: 6,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: 16,
              fontWeight: 600,
              color: '#fff',
              background: loading || !password ? '#9ca3af' : 'var(--nz-navy, #1B3A5C)',
              border: 'none',
              borderRadius: 8,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{
          marginTop: 24,
          fontSize: 11,
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          LCC TST100250 — Bryan Wilson
        </p>
      </div>
    </div>
  )
}
