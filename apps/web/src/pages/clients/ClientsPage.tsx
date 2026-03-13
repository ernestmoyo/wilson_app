import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, Eye } from 'lucide-react'
import { api } from '@/lib/api'
import { Client } from '@/types'
import Modal from '@/components/Modal'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

const INDUSTRIES: { value: string; label: string }[] = [
  { value: 'agriculture_farming', label: 'Agriculture & Farming' },
  { value: 'chemical_manufacturing', label: 'Chemical Manufacturing' },
  { value: 'construction', label: 'Construction' },
  { value: 'education_research', label: 'Education & Research' },
  { value: 'food_beverage', label: 'Food & Beverage Manufacturing' },
  { value: 'forestry', label: 'Forestry' },
  { value: 'healthcare', label: 'Healthcare & Hospitals' },
  { value: 'horticulture', label: 'Horticulture & Viticulture' },
  { value: 'industrial_manufacturing', label: 'Industrial Manufacturing' },
  { value: 'laboratory', label: 'Laboratories' },
  { value: 'mining_quarrying', label: 'Mining & Quarrying' },
  { value: 'oil_gas', label: 'Oil & Gas' },
  { value: 'paint_coatings', label: 'Paint & Coatings' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'retail', label: 'Retail (Hardware / Farm Supply)' },
  { value: 'transport_logistics', label: 'Transport & Logistics' },
  { value: 'veterinary', label: 'Veterinary Services' },
  { value: 'waste_management', label: 'Waste Management' },
  { value: 'water_treatment', label: 'Water Treatment' },
  { value: 'other', label: 'Other' },
]

interface ClientFormData {
  legal_name: string
  trading_name: string
  site_address: string
  postal_address: string
  phone: string
  email: string
  manager_name: string
  manager_phone: string
  manager_email: string
  industry: string
  nzbn: string
  companies_number: string
}

const defaultForm: ClientFormData = {
  legal_name: '',
  trading_name: '',
  site_address: '',
  postal_address: '',
  phone: '',
  email: '',
  manager_name: '',
  manager_phone: '',
  manager_email: '',
  industry: '',
  nzbn: '',
  companies_number: '',
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<ClientFormData>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchClients = useCallback(async (q?: string) => {
    setLoading(true)
    setError('')
    try {
      const url = q ? `/clients?search=${encodeURIComponent(q)}` : '/clients'
      const data = await api.get<Client[]>(url)
      setClients(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchClients(search)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.legal_name.trim() || !form.site_address.trim()) {
      setFormError('Legal Name and Site Address are required.')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      await api.post('/clients', form)
      setShowModal(false)
      setForm(defaultForm)
      fetchClients(search)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create client')
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = (field: keyof ClientFormData, value: string) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  const inputStyle = { width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)', marginBottom: 4 } as const

  return (
    <div style={{ background: 'var(--nz-bg)', minHeight: '100%' }} className="space-y-6 p-1">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients..."
              style={{ ...inputStyle, paddingLeft: 36 }}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>
          <button type="submit"
            style={{ border: '1.5px solid var(--nz-navy)', color: 'var(--nz-navy)', background: 'transparent', borderRadius: 10, fontWeight: 600, padding: '0 16px', height: 40, cursor: 'pointer', fontSize: 14 }}>
            Search
          </button>
        </form>
        <button
          onClick={() => { setShowModal(true); setFormError('') }}
          style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
        >
          <Plus size={16} />
          Add Client
        </button>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', overflow: 'hidden' }}>
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} onRetry={() => fetchClients(search)} />
        ) : clients.length === 0 ? (
          <div className="text-center py-16">
            <p style={{ color: '#94A3B8' }}>No clients found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ borderBottom: '1px solid rgba(0,36,125,0.08)' }}>
                <tr>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Legal Name</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Trading Name</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Site Address</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Manager</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Assessments</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} style={{ height: 52, borderBottom: '1px solid rgba(0,36,125,0.05)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '0 24px', fontWeight: 600, color: 'var(--nz-navy)', fontSize: 14 }}>{c.legal_name}</td>
                    <td style={{ padding: '0 24px', fontSize: 14, color: '#64748B' }}>{c.trading_name || '—'}</td>
                    <td style={{ padding: '0 24px', fontSize: 14, color: '#64748B', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.site_address}</td>
                    <td style={{ padding: '0 24px', fontSize: 14, color: '#64748B' }}>{c.manager_name || '—'}</td>
                    <td style={{ padding: '0 24px' }}>
                      <span style={{ background: 'rgba(0,36,125,0.08)', color: 'var(--nz-navy)', borderRadius: 9999, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                        {c.assessment_count ?? 0}
                      </span>
                    </td>
                    <td style={{ padding: '0 24px' }}>
                      <Link
                        to={`/clients/${c.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--nz-navy)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        <Eye size={14} />
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add New Client" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--nz-red)', fontSize: 13, padding: '8px 12px', borderRadius: 8 }}>{formError}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Legal Name *</label>
              <input
                type="text"
                required
                value={form.legal_name}
                onChange={e => handleChange('legal_name', e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
            <div>
              <label style={labelStyle}>Trading Name</label>
              <input
                type="text"
                value={form.trading_name}
                onChange={e => handleChange('trading_name', e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Site Address *</label>
            <input
              type="text"
              required
              value={form.site_address}
              onChange={e => handleChange('site_address', e.target.value)}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>

          <div>
            <label style={labelStyle}>Postal Address</label>
            <input
              type="text"
              value={form.postal_address}
              onChange={e => handleChange('postal_address', e.target.value)}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => handleChange('phone', e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Industry</label>
              <select
                value={form.industry}
                onChange={e => handleChange('industry', e.target.value)}
                style={inputStyle}
              >
                <option value="">Select industry...</option>
                {INDUSTRIES.map(ind => (
                  <option key={ind.value} value={ind.value}>{ind.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>NZBN</label>
              <input
                type="text"
                value={form.nzbn}
                onChange={e => handleChange('nzbn', e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Companies Number</label>
            <input
              type="text"
              value={form.companies_number}
              onChange={e => handleChange('companies_number', e.target.value)}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
            <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Companies Office Number (reg 6.26(2)(e)(ii))</p>
          </div>

          <div style={{ borderTop: '1px solid rgba(0,36,125,0.08)', paddingTop: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 12 }}>Site Manager</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  type="text"
                  value={form.manager_name}
                  onChange={e => handleChange('manager_name', e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                  onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  type="tel"
                  value={form.manager_phone}
                  onChange={e => handleChange('manager_phone', e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                  onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={form.manager_email}
                  onChange={e => handleChange('manager_email', e.target.value)}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                  onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              style={{ border: '1.5px solid var(--nz-navy)', color: 'var(--nz-navy)', background: 'transparent', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, cursor: 'pointer', fontSize: 14 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', fontSize: 14, opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Saving...' : 'Add Client'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
