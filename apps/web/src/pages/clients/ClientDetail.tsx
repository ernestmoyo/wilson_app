import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Edit2, Save, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, Assessment, Certificate, InventoryItem } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

type Tab = 'details' | 'assessments' | 'certificates' | 'inventory'

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [tabLoading, setTabLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Client>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<Client>(`/clients/${id}`)
      .then(data => { setClient(data); setEditForm(data) })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (activeTab === 'assessments' && client) {
      setTabLoading(true)
      api.get<Assessment[]>(`/assessments?client_id=${id}`)
        .then(setAssessments)
        .finally(() => setTabLoading(false))
    } else if (activeTab === 'certificates' && client) {
      setTabLoading(true)
      api.get<Certificate[]>(`/certificates?client_id=${id}`)
        .then(setCertificates)
        .finally(() => setTabLoading(false))
    } else if (activeTab === 'inventory' && client) {
      setTabLoading(true)
      api.get<InventoryItem[]>(`/inventory?client_id=${id}`)
        .then(setInventory)
        .finally(() => setTabLoading(false))
    }
  }, [activeTab, client, id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await api.put<Client>(`/clients/${id}`, editForm)
      setClient(updated)
      setEditing(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!client) return <ErrorMessage message="Client not found" />

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'assessments', label: 'Assessments' },
    { key: 'certificates', label: 'Certificates' },
    { key: 'inventory', label: 'Inventory' },
  ]

  const inputStyle = { width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }
  const thStyle = { paddingBottom: 12, textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }

  return (
    <div style={{ background: 'var(--nz-bg)', minHeight: '100%' }} className="space-y-6 p-1">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link to="/clients" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#64748B', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
          Clients
        </Link>
        <span style={{ color: '#CBD5E1' }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)' }}>{client.legal_name}</span>
      </div>

      {/* Client header */}
      <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--nz-navy)', margin: 0 }}>{client.legal_name}</h2>
            {client.trading_name && (
              <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>Trading as: {client.trading_name}</p>
            )}
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>{client.site_address}</p>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setEditForm(client) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid var(--nz-navy)', color: 'var(--nz-navy)', background: 'transparent', borderRadius: 10, fontWeight: 600, padding: '0 14px', height: 36, cursor: 'pointer', fontSize: 13 }}
                >
                  <X size={14} /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 14px', height: 36, border: 'none', cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}
                >
                  <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 14px', height: 36, border: 'none', cursor: 'pointer', fontSize: 13 }}
              >
                <Edit2 size={14} /> Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', overflow: 'hidden' }}>
        <div style={{ borderBottom: '1px solid rgba(0,36,125,0.08)', display: 'flex' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 24px',
                fontSize: 13,
                fontWeight: 600,
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--nz-navy)' : '2px solid transparent',
                color: activeTab === tab.key ? 'var(--nz-navy)' : '#94A3B8',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {editing ? (
                <>
                  <Field label="Legal Name" value={editForm.legal_name || ''} onChange={v => setEditForm(f => ({ ...f, legal_name: v }))} />
                  <Field label="Trading Name" value={editForm.trading_name || ''} onChange={v => setEditForm(f => ({ ...f, trading_name: v }))} />
                  <Field label="Site Address" value={editForm.site_address || ''} onChange={v => setEditForm(f => ({ ...f, site_address: v }))} />
                  <Field label="Postal Address" value={editForm.postal_address || ''} onChange={v => setEditForm(f => ({ ...f, postal_address: v }))} />
                  <Field label="Phone" value={editForm.phone || ''} onChange={v => setEditForm(f => ({ ...f, phone: v }))} />
                  <Field label="Email" value={editForm.email || ''} onChange={v => setEditForm(f => ({ ...f, email: v }))} />
                  <Field label="Industry" value={editForm.industry || ''} onChange={v => setEditForm(f => ({ ...f, industry: v }))} />
                  <Field label="NZBN" value={editForm.nzbn || ''} onChange={v => setEditForm(f => ({ ...f, nzbn: v }))} />
                  <Field label="Companies Number" value={editForm.companies_number || ''} onChange={v => setEditForm(f => ({ ...f, companies_number: v }))} />
                  <Field label="Manager Name" value={editForm.manager_name || ''} onChange={v => setEditForm(f => ({ ...f, manager_name: v }))} />
                  <Field label="Manager Phone" value={editForm.manager_phone || ''} onChange={v => setEditForm(f => ({ ...f, manager_phone: v }))} />
                  <Field label="Manager Email" value={editForm.manager_email || ''} onChange={v => setEditForm(f => ({ ...f, manager_email: v }))} />
                </>
              ) : (
                <>
                  <InfoRow label="Legal Name" value={client.legal_name} />
                  <InfoRow label="Trading Name" value={client.trading_name} />
                  <InfoRow label="Site Address" value={client.site_address} />
                  <InfoRow label="Postal Address" value={client.postal_address} />
                  <InfoRow label="Phone" value={client.phone} />
                  <InfoRow label="Email" value={client.email} />
                  <InfoRow label="Industry" value={client.industry} />
                  <InfoRow label="NZBN" value={client.nzbn} isCode />
                  <InfoRow label="Companies Number" value={client.companies_number} isCode />
                  <InfoRow label="Manager Name" value={client.manager_name} />
                  <InfoRow label="Manager Phone" value={client.manager_phone} />
                  <InfoRow label="Manager Email" value={client.manager_email} />
                  <InfoRow label="Created" value={new Date(client.created_at).toLocaleDateString('en-NZ')} />
                </>
              )}
            </div>
          )}

          {activeTab === 'assessments' && (
            tabLoading ? <LoadingSpinner /> : (
              assessments.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8' }}>No assessments for this client.</p>
              ) : (
                <table className="w-full">
                  <thead style={{ borderBottom: '1px solid rgba(0,36,125,0.08)' }}>
                    <tr>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.map(a => (
                      <tr key={a.id} style={{ height: 48, borderBottom: '1px solid rgba(0,36,125,0.05)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ paddingBottom: 0 }}><StatusBadge status={a.type} /></td>
                        <td style={{ paddingBottom: 0 }}><StatusBadge status={a.status} /></td>
                        <td style={{ fontSize: 13, color: '#64748B' }}>
                          {a.inspection_date ? new Date(a.inspection_date).toLocaleDateString('en-NZ') : '—'}
                        </td>
                        <td>
                          <Link to={`/assessment/${a.id}`} style={{ fontSize: 13, color: 'var(--nz-navy)', fontWeight: 600, textDecoration: 'none' }}>View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )
          )}

          {activeTab === 'certificates' && (
            tabLoading ? <LoadingSpinner /> : (
              certificates.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8' }}>No certificates for this client.</p>
              ) : (
                <table className="w-full">
                  <thead style={{ borderBottom: '1px solid rgba(0,36,125,0.08)' }}>
                    <tr>
                      <th style={thStyle}>Certificate #</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Substance Class</th>
                      <th style={thStyle}>Expiry</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.map(c => (
                      <tr key={c.id} style={{ height: 48, borderBottom: '1px solid rgba(0,36,125,0.05)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ fontSize: 13, fontWeight: 700, color: 'var(--nz-navy)', fontFamily: 'monospace' }}>{c.certificate_number || `#${c.id}`}</td>
                        <td><StatusBadge status={c.status} /></td>
                        <td style={{ fontSize: 13, color: '#64748B' }}>{c.substance_class || '—'}</td>
                        <td style={{ fontSize: 13, color: '#64748B' }}>
                          {c.expiry_date ? new Date(c.expiry_date).toLocaleDateString('en-NZ') : '—'}
                        </td>
                        <td>
                          <Link to={`/certificates/${c.id}`} style={{ fontSize: 13, color: 'var(--nz-navy)', fontWeight: 600, textDecoration: 'none' }}>View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )
          )}

          {activeTab === 'inventory' && (
            tabLoading ? <LoadingSpinner /> : (
              inventory.length === 0 ? (
                <div>
                  <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 8 }}>No inventory items for this client.</p>
                  <Link to="/inventory" style={{ fontSize: 13, color: 'var(--nz-navy)', fontWeight: 600, textDecoration: 'none' }}>Go to Inventory Manager</Link>
                </div>
              ) : (
                <table className="w-full">
                  <thead style={{ borderBottom: '1px solid rgba(0,36,125,0.08)' }}>
                    <tr>
                      <th style={thStyle}>Substance</th>
                      <th style={thStyle}>Hazard Class</th>
                      <th style={thStyle}>Quantity</th>
                      <th style={thStyle}>Location</th>
                      <th style={thStyle}>SDS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map(item => (
                      <tr key={item.id} style={{ height: 48, borderBottom: '1px solid rgba(0,36,125,0.05)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)' }}>{item.substance_name}</td>
                        <td style={{ fontSize: 13, color: '#64748B' }}>{item.hazard_class}</td>
                        <td style={{ fontSize: 13, color: '#64748B' }}>{item.quantity} {item.unit}</td>
                        <td style={{ fontSize: 13, color: '#64748B' }}>{item.storage_location || '—'}</td>
                        <td>
                          <span style={{
                            display: 'inline-flex', padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600,
                            background: item.sds_available ? '#DCFCE7' : '#FEF2F2',
                            color: item.sds_available ? '#16A34A' : 'var(--nz-red)',
                          }}>
                            {item.sds_available ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, isCode }: { label: string; value?: string | null; isCode?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 4 }}>{label}</p>
      {isCode && value ? (
        <span style={{ display: 'inline-block', background: 'rgba(0,36,125,0.07)', color: 'var(--nz-navy)', borderRadius: 6, padding: '2px 10px', fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>
          {value}
        </span>
      ) : (
        <p style={{ fontSize: 15, color: '#1E293B', fontWeight: 500, margin: 0 }}>{value || '—'}</p>
      )}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 4 }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
        onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
      />
    </div>
  )
}
