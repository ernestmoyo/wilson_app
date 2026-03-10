import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Eye } from 'lucide-react'
import { api } from '@/lib/api'
import { Certificate, Client, Assessment } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import Modal from '@/components/Modal'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

type StatusTab = 'all' | 'pending' | 'granted' | 'refused' | 'expired'

const STATUS_TABS: StatusTab[] = ['all', 'pending', 'granted', 'refused', 'expired']

function isExpiringSoon(expiry?: string): boolean {
  if (!expiry) return false
  const exp = new Date(expiry)
  const now = new Date()
  const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  return diff <= 90
}

interface NewCertForm {
  client_id: string
  assessment_id: string
  substance_class: string
  max_quantity: string
}

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<StatusTab>('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewCertForm>({ client_id: '', assessment_id: '', substance_class: '', max_quantity: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchCerts = useCallback(async (status?: string) => {
    setLoading(true)
    setError('')
    try {
      const url = status && status !== 'all' ? `/certificates?status=${status}` : '/certificates'
      const data = await api.get<Certificate[]>(url)
      setCertificates(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load certificates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCerts(activeTab)
  }, [fetchCerts, activeTab])

  useEffect(() => {
    Promise.all([
      api.get<Client[]>('/clients'),
      api.get<Assessment[]>('/assessments'),
    ]).then(([c, a]) => { setClients(c); setAssessments(a) })
  }, [])

  const filteredAssessments = form.client_id
    ? assessments.filter(a => a.client_id === Number(form.client_id))
    : assessments

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_id) { setFormError('Please select a client.'); return }
    setSubmitting(true)
    setFormError('')
    try {
      await api.post('/certificates', {
        client_id: Number(form.client_id),
        assessment_id: form.assessment_id ? Number(form.assessment_id) : undefined,
        substance_class: form.substance_class,
        max_quantity: form.max_quantity,
      })
      setShowModal(false)
      setForm({ client_id: '', assessment_id: '', substance_class: '', max_quantity: '' })
      fetchCerts(activeTab)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create certificate')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: 'var(--nz-bg)', minHeight: '100%' }} className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div style={{ background: 'white', border: '1px solid rgba(0,36,125,0.10)', borderRadius: 10, padding: '4px' }} className="flex items-center gap-1 flex-wrap">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={activeTab === tab
                ? { background: 'var(--nz-navy)', color: 'white', borderRadius: 8, padding: '6px 14px', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }
                : { background: 'transparent', color: '#64748B', borderRadius: 8, padding: '6px 14px', fontWeight: 500, fontSize: 13, border: 'none', cursor: 'pointer' }
              }
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError('') }}
          style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
        >
          <Plus size={16} />
          New Certificate
        </button>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} onRetry={() => fetchCerts(activeTab)} />
        ) : certificates.length === 0 ? (
          <div className="text-center py-16">
            <p style={{ color: '#94A3B8' }}>No certificates found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ borderBottom: '1px solid rgba(0,36,125,0.08)' }}>
                <tr>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Certificate #</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Client</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Substance Class</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Issue Date</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Expiry Date</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map(c => {
                  const expiring = isExpiringSoon(c.expiry_date)
                  const expired = c.status === 'expired'
                  return (
                    <tr key={c.id} style={{ height: 52, borderBottom: '1px solid rgba(0,36,125,0.05)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '0 24px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--nz-navy)', fontFamily: 'monospace', fontSize: 13 }}>
                          {c.certificate_number || `CERT-${c.id}`}
                        </span>
                      </td>
                      <td style={{ padding: '0 24px', fontSize: 14, color: '#1E293B' }}>
                        {c.client_name || `Client #${c.client_id}`}
                      </td>
                      <td style={{ padding: '0 24px', fontSize: 14, color: '#64748B' }}>{c.substance_class || '—'}</td>
                      <td style={{ padding: '0 24px' }}>
                        <StatusBadge status={c.status} />
                      </td>
                      <td style={{ padding: '0 24px', fontSize: 14, color: '#64748B' }}>
                        {c.issue_date ? new Date(c.issue_date).toLocaleDateString('en-NZ') : '—'}
                      </td>
                      <td style={{ padding: '0 24px', fontSize: 14 }}>
                        {c.expiry_date ? (
                          <span style={{ color: expired || expiring ? 'var(--nz-red)' : '#64748B', fontWeight: expired || expiring ? 600 : 400 }}>
                            {new Date(c.expiry_date).toLocaleDateString('en-NZ')}
                            {expiring && !expired && ' ⚠'}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '0 24px' }}>
                        <Link
                          to={`/certificates/${c.id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--nz-navy)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          <Eye size={14} />
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Certificate" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--nz-red)', fontSize: 13, padding: '8px 12px', borderRadius: 8 }}>{formError}</div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)', marginBottom: 4 }}>Client *</label>
            <select
              required
              value={form.client_id}
              onChange={e => setForm(f => ({ ...f, client_id: e.target.value, assessment_id: '' }))}
              style={{ width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none' }}
            >
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)', marginBottom: 4 }}>Assessment (optional)</label>
            <select
              value={form.assessment_id}
              onChange={e => setForm(f => ({ ...f, assessment_id: e.target.value }))}
              disabled={!form.client_id}
              style={{ width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none' }}
            >
              {!form.client_id && <option value="" disabled>Select a client first…</option>}
              <option value="">None</option>
              {filteredAssessments.map(a => (
                <option key={a.id} value={a.id}>
                  Assessment #{a.id} - {a.type.replace('_', ' ')} ({a.status})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)', marginBottom: 4 }}>Substance Class</label>
            <input
              type="text"
              value={form.substance_class}
              onChange={e => setForm(f => ({ ...f, substance_class: e.target.value }))}
              placeholder="e.g. 3.1A, 2.1.1"
              style={{ width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)', marginBottom: 4 }}>Max Quantity</label>
            <input
              type="text"
              value={form.max_quantity}
              onChange={e => setForm(f => ({ ...f, max_quantity: e.target.value }))}
              placeholder="e.g. 1000L"
              style={{ width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              style={{ border: '1.5px solid var(--nz-navy)', color: 'var(--nz-navy)', background: 'transparent', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, cursor: 'pointer', fontSize: 14 }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', fontSize: 14, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Creating...' : 'Create Certificate'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
