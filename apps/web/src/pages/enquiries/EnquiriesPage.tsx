import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronDown, ChevronUp, Phone, Mail, MapPin, Building2, Calendar } from 'lucide-react'
import { api } from '@/lib/api'
import { Enquiry } from '@/types'
import Modal from '@/components/Modal'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'

type EnquiryStatus = 'all' | Enquiry['status']

const STATUS_TABS: { key: EnquiryStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'received', label: 'Received' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
  { key: 'converted', label: 'Converted' },
]

const ENQUIRY_TYPES: { value: Enquiry['enquiry_type']; label: string }[] = [
  { value: 'new_certification', label: 'New Certification' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'variation', label: 'Variation' },
  { value: 'handler_certification', label: 'Handler Certification' },
  { value: 'general_enquiry', label: 'General Enquiry' },
]

const PRIORITIES: { value: Enquiry['priority']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const ENQUIRY_SOURCES: { value: string; label: string }[] = [
  { value: 'phone_call', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'worksafe_nz', label: 'WorkSafe NZ' },
  { value: 'repeat_client', label: 'Repeat Client' },
  { value: 'other', label: 'Other' },
]

const SUBSTANCE_CLASS_OPTIONS: { value: string; label: string }[] = [
  { value: '2.1.1', label: '2.1.1 — Flammable Gas Cat.1' },
  { value: '2.1.2', label: '2.1.2 — Flammable Gas Cat.2' },
  { value: '3.1A', label: '3.1A — Flammable Liquid Cat.1' },
  { value: '3.1B', label: '3.1B — Flammable Liquid Cat.2' },
  { value: '3.1C', label: '3.1C — Flammable Liquid Cat.3' },
  { value: '3.1D', label: '3.1D — Flammable Liquid Cat.4' },
  { value: '4.1.1', label: '4.1.1 — Flammable Solid' },
  { value: '4.2A', label: '4.2A — Spontaneously Combustible' },
  { value: '4.3A', label: '4.3A — Dangerous When Wet' },
  { value: '5.1.1', label: '5.1.1 — Oxidising Substance' },
  { value: '5.2', label: '5.2 — Organic Peroxide' },
  { value: '6.1A', label: '6.1A — Acutely Toxic Cat.1' },
  { value: '6.1B', label: '6.1B — Acutely Toxic Cat.2' },
  { value: '6.1C', label: '6.1C — Acutely Toxic Cat.3' },
  { value: '6.3A', label: '6.3A — Skin Irritant' },
  { value: '6.4A', label: '6.4A — Eye Irritant' },
  { value: '6.5A', label: '6.5A — Sensitiser' },
  { value: '8.1A', label: '8.1A — Metallic Corrosive' },
  { value: '8.2A', label: '8.2A — Skin Corrosive Cat.1' },
  { value: '8.3A', label: '8.3A — Eye Corrosive' },
  { value: '9.1A', label: '9.1A — Aquatic Ecotoxic' },
  { value: '9.3C', label: '9.3C — Terrestrial Vertebrate Ecotoxic' },
]

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: '#FEE2E2', text: '#DC2626' },
  high:   { bg: '#FFF7ED', text: '#EA580C' },
  normal: { bg: '#DBEAFE', text: '#2563EB' },
  low:    { bg: '#F1F5F9', text: '#64748B' },
}

const TYPE_LABELS: Record<string, string> = {
  new_certification: 'New Certification',
  renewal: 'Renewal',
  variation: 'Variation',
  handler_certification: 'Handler Certification',
  general_enquiry: 'General Enquiry',
}

interface EnquiryFormData {
  contact_name: string
  contact_email: string
  contact_phone: string
  company_name: string
  site_address: string
  enquiry_type: Enquiry['enquiry_type']
  priority: Enquiry['priority']
  substance_classes: string
  estimated_quantities: string
  description: string
  source: string
  notes: string
}

const defaultForm: EnquiryFormData = {
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  company_name: '',
  site_address: '',
  enquiry_type: 'new_certification',
  priority: 'normal',
  substance_classes: '',
  estimated_quantities: '',
  description: '',
  source: '',
  notes: '',
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.normal
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  )
}

export default function EnquiriesPage() {
  const navigate = useNavigate()
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<EnquiryStatus>('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<EnquiryFormData>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const fetchEnquiries = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get<Enquiry[]>('/enquiries')
      setEnquiries(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load enquiries')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEnquiries()
  }, [fetchEnquiries])

  const filtered = activeTab === 'all'
    ? enquiries
    : enquiries.filter(e => e.status === activeTab)

  const handleChange = (field: keyof EnquiryFormData, value: string) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.contact_name.trim()) {
      setFormError('Contact Name is required.')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      await api.post('/enquiries', form)
      setShowModal(false)
      setForm(defaultForm)
      fetchEnquiries()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create enquiry')
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (id: number, status: string) => {
    setActionLoading(true)
    try {
      await api.put(`/enquiries/${id}`, { status })
      fetchEnquiries()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update enquiry')
    } finally {
      setActionLoading(false)
    }
  }

  const convertToAssessment = async (id: number) => {
    setActionLoading(true)
    try {
      const result = await api.put<{ enquiry: Enquiry; assessment: { id: number } }>(`/enquiries/${id}/convert`, {})
      fetchEnquiries()
      navigate(`/assessment/${result.assessment.id}`)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to convert enquiry')
    } finally {
      setActionLoading(false)
    }
  }

  const inputStyle = { width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)', marginBottom: 4 } as const
  const actionBtnBase = { borderRadius: 10, fontWeight: 600, padding: '0 16px', height: 36, cursor: 'pointer', fontSize: 13, border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 } as const

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ background: 'var(--nz-bg)', minHeight: '100%' }} className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 style={{ color: 'var(--nz-navy)', fontSize: 32, fontWeight: 700, margin: 0 }}>
          Enquiries
        </h2>
        <button
          onClick={() => { setShowModal(true); setFormError('') }}
          style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
        >
          <Plus size={16} />
          New Enquiry
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap" style={{ background: 'rgba(0,36,125,0.04)', borderRadius: 12, padding: 4 }}>
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: activeTab === tab.key ? 'white' : 'transparent',
              color: activeTab === tab.key ? 'var(--nz-navy)' : '#64748B',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,36,125,0.10)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
            {tab.key !== 'all' && (
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                {enquiries.filter(e => e.status === tab.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.08)', overflow: 'hidden' }}>
        {error ? (
          <div className="text-center py-16">
            <p style={{ color: 'var(--nz-red)' }}>{error}</p>
            <button
              onClick={fetchEnquiries}
              style={{ ...actionBtnBase, background: 'var(--nz-navy)', color: 'white', marginTop: 12 }}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p style={{ color: '#94A3B8' }}>No enquiries found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ borderBottom: '1px solid rgba(0,36,125,0.08)' }}>
                <tr>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Contact Name</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Company</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Priority</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Follow-up</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Created</th>
                  <th style={{ padding: '12px 24px', width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(enq => (
                  <>
                    <tr
                      key={enq.id}
                      onClick={() => setExpandedId(expandedId === enq.id ? null : enq.id)}
                      style={{ height: 52, borderBottom: '1px solid rgba(0,36,125,0.05)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = expandedId === enq.id ? 'rgba(0,36,125,0.02)' : 'transparent')}
                    >
                      <td style={{ padding: '0 24px', fontWeight: 600, color: 'var(--nz-navy)', fontSize: 14 }}>{enq.contact_name}</td>
                      <td style={{ padding: '0 24px', fontSize: 14, color: '#64748B' }}>{enq.company_name || '—'}</td>
                      <td style={{ padding: '0 24px', fontSize: 14, color: '#64748B' }}>{TYPE_LABELS[enq.enquiry_type] || enq.enquiry_type}</td>
                      <td style={{ padding: '0 24px' }}><PriorityBadge priority={enq.priority} /></td>
                      <td style={{ padding: '0 24px' }}><StatusBadge status={enq.status} /></td>
                      <td style={{ padding: '0 24px', fontSize: 14, color: '#64748B' }}>
                        {enq.follow_up_date ? new Date(enq.follow_up_date).toLocaleDateString('en-NZ') : '—'}
                      </td>
                      <td style={{ padding: '0 24px', fontSize: 14, color: '#64748B' }}>
                        {new Date(enq.created_at).toLocaleDateString('en-NZ')}
                      </td>
                      <td style={{ padding: '0 24px' }}>
                        {expandedId === enq.id ? <ChevronUp size={16} style={{ color: '#94A3B8' }} /> : <ChevronDown size={16} style={{ color: '#94A3B8' }} />}
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {expandedId === enq.id && (
                      <tr key={`${enq.id}-detail`} style={{ background: 'rgba(0,36,125,0.02)' }}>
                        <td colSpan={8} style={{ padding: '20px 24px' }}>
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Contact info */}
                            <div className="space-y-3">
                              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 8 }}>Contact Details</p>
                              {enq.contact_email && (
                                <div className="flex items-center gap-2" style={{ fontSize: 14, color: '#64748B' }}>
                                  <Mail size={14} style={{ color: '#94A3B8' }} />
                                  {enq.contact_email}
                                </div>
                              )}
                              {enq.contact_phone && (
                                <div className="flex items-center gap-2" style={{ fontSize: 14, color: '#64748B' }}>
                                  <Phone size={14} style={{ color: '#94A3B8' }} />
                                  {enq.contact_phone}
                                </div>
                              )}
                              {enq.company_name && (
                                <div className="flex items-center gap-2" style={{ fontSize: 14, color: '#64748B' }}>
                                  <Building2 size={14} style={{ color: '#94A3B8' }} />
                                  {enq.company_name}
                                </div>
                              )}
                              {enq.site_address && (
                                <div className="flex items-center gap-2" style={{ fontSize: 14, color: '#64748B' }}>
                                  <MapPin size={14} style={{ color: '#94A3B8' }} />
                                  {enq.site_address}
                                </div>
                              )}
                              {enq.source && (
                                <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 8 }}>
                                  Source: <span style={{ color: '#64748B' }}>{ENQUIRY_SOURCES.find(s => s.value === enq.source)?.label || enq.source}</span>
                                </div>
                              )}
                            </div>

                            {/* Substance info */}
                            <div className="space-y-3">
                              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 8 }}>Substance Details</p>
                              {enq.substance_classes && (
                                <div style={{ fontSize: 14, color: '#64748B' }}>
                                  <span style={{ fontSize: 12, color: '#94A3B8' }}>Classes: </span>{enq.substance_classes}
                                </div>
                              )}
                              {enq.estimated_quantities && (
                                <div style={{ fontSize: 14, color: '#64748B' }}>
                                  <span style={{ fontSize: 12, color: '#94A3B8' }}>Est. Quantities: </span>{enq.estimated_quantities}
                                </div>
                              )}
                              {enq.description && (
                                <div style={{ fontSize: 14, color: '#64748B', marginTop: 8 }}>
                                  <span style={{ fontSize: 12, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Description</span>
                                  {enq.description}
                                </div>
                              )}
                              {enq.quoted_amount != null && (
                                <div style={{ fontSize: 14, color: 'var(--nz-navy)', fontWeight: 600, marginTop: 8 }}>
                                  Quoted: ${enq.quoted_amount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                                  {enq.quote_date && (
                                    <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 400, marginLeft: 8 }}>
                                      on {new Date(enq.quote_date).toLocaleDateString('en-NZ')}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Notes & follow-up */}
                            <div className="space-y-3">
                              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 8 }}>Notes & Follow-up</p>
                              {enq.follow_up_date && (
                                <div className="flex items-center gap-2" style={{ fontSize: 14, color: '#64748B' }}>
                                  <Calendar size={14} style={{ color: '#94A3B8' }} />
                                  Follow-up: {new Date(enq.follow_up_date).toLocaleDateString('en-NZ')}
                                </div>
                              )}
                              {enq.assigned_to_name && (
                                <div style={{ fontSize: 14, color: '#64748B' }}>
                                  <span style={{ fontSize: 12, color: '#94A3B8' }}>Assigned to: </span>{enq.assigned_to_name}
                                </div>
                              )}
                              {enq.notes && (
                                <div style={{ fontSize: 14, color: '#64748B', marginTop: 8, background: 'rgba(0,36,125,0.03)', borderRadius: 8, padding: '10px 12px' }}>
                                  {enq.notes}
                                </div>
                              )}
                              {enq.converted_assessment_id && (
                                <div style={{ fontSize: 13, marginTop: 8 }}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/assessment/${enq.converted_assessment_id}`) }}
                                    style={{ color: 'var(--nz-light-blue)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}
                                  >
                                    View Assessment #{enq.converted_assessment_id}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2 mt-6 pt-4" style={{ borderTop: '1px solid rgba(0,36,125,0.08)' }}>
                            {enq.status === 'received' && (
                              <button
                                disabled={actionLoading}
                                onClick={(e) => { e.stopPropagation(); updateStatus(enq.id, 'reviewing') }}
                                style={{ ...actionBtnBase, background: 'var(--nz-navy)', color: 'white', opacity: actionLoading ? 0.6 : 1 }}
                              >
                                Mark as Reviewing
                              </button>
                            )}
                            {(enq.status === 'received' || enq.status === 'reviewing') && (
                              <button
                                disabled={actionLoading}
                                onClick={(e) => { e.stopPropagation(); updateStatus(enq.id, 'quoted') }}
                                style={{ ...actionBtnBase, background: '#2563EB', color: 'white', opacity: actionLoading ? 0.6 : 1 }}
                              >
                                Send Quote
                              </button>
                            )}
                            {enq.status === 'quoted' && (
                              <>
                                <button
                                  disabled={actionLoading}
                                  onClick={(e) => { e.stopPropagation(); updateStatus(enq.id, 'accepted') }}
                                  style={{ ...actionBtnBase, background: '#16A34A', color: 'white', opacity: actionLoading ? 0.6 : 1 }}
                                >
                                  Accept
                                </button>
                                <button
                                  disabled={actionLoading}
                                  onClick={(e) => { e.stopPropagation(); updateStatus(enq.id, 'declined') }}
                                  style={{ ...actionBtnBase, background: '#DC2626', color: 'white', opacity: actionLoading ? 0.6 : 1 }}
                                >
                                  Decline
                                </button>
                              </>
                            )}
                            {(enq.status === 'accepted') && !enq.converted_assessment_id && (
                              <button
                                disabled={actionLoading}
                                onClick={(e) => { e.stopPropagation(); convertToAssessment(enq.id) }}
                                style={{ ...actionBtnBase, background: 'var(--nz-navy)', color: 'white', opacity: actionLoading ? 0.6 : 1 }}
                              >
                                Convert to Assessment
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Enquiry Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Enquiry" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--nz-red)', fontSize: 13, padding: '8px 12px', borderRadius: 8 }}>{formError}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Contact Name *</label>
              <input
                type="text"
                required
                value={form.contact_name}
                onChange={e => handleChange('contact_name', e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
            <div>
              <label style={labelStyle}>Contact Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={e => handleChange('contact_email', e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Contact Phone</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={e => handleChange('contact_phone', e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
            <div>
              <label style={labelStyle}>Company Name</label>
              <input
                type="text"
                value={form.company_name}
                onChange={e => handleChange('company_name', e.target.value)}
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Site Address</label>
            <input
              type="text"
              value={form.site_address}
              onChange={e => handleChange('site_address', e.target.value)}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Enquiry Type</label>
              <select
                value={form.enquiry_type}
                onChange={e => handleChange('enquiry_type', e.target.value)}
                style={inputStyle}
              >
                {ENQUIRY_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select
                value={form.priority}
                onChange={e => handleChange('priority', e.target.value)}
                style={inputStyle}
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Substance Classes</label>
            <div style={{ border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', maxHeight: 160, overflowY: 'auto' }}>
              {SUBSTANCE_CLASS_OPTIONS.map(opt => {
                const selected = form.substance_classes.split(',').map(s => s.trim()).filter(Boolean)
                const checked = selected.includes(opt.value)
                return (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? selected.filter(v => v !== opt.value)
                          : [...selected, opt.value]
                        handleChange('substance_classes', next.join(', '))
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ color: '#1E293B' }}>{opt.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Estimated Quantities</label>
            <input
              type="text"
              value={form.estimated_quantities}
              onChange={e => handleChange('estimated_quantities', e.target.value)}
              placeholder="e.g. 500L LPG, 200kg fertiliser"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={e => handleChange('description', e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>

          <div>
            <label style={labelStyle}>Source</label>
            <select
              value={form.source}
              onChange={e => handleChange('source', e.target.value)}
              style={inputStyle}
            >
              <option value="">Select source...</option>
              {ENQUIRY_SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => handleChange('notes', e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
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
              {submitting ? 'Saving...' : 'Create Enquiry'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
