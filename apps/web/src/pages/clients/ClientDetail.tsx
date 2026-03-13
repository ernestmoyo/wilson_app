import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Edit2, Save, X, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, Assessment, Certificate, InventoryItem, StorageArea } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import Modal from '@/components/Modal'

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

type Tab = 'details' | 'assessments' | 'certificates' | 'inventory' | 'storage_areas'

const AREA_TYPES: { value: string; label: string }[] = [
  { value: 'room', label: 'Room' },
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'bunker', label: 'Bunker' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'coolroom', label: 'Coolroom' },
  { value: 'tank_farm', label: 'Tank Farm' },
  { value: 'other', label: 'Other' },
]

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [storageAreas, setStorageAreas] = useState<StorageArea[]>([])
  const [tabLoading, setTabLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Client>>({})
  const [saving, setSaving] = useState(false)
  const [storageModalOpen, setStorageModalOpen] = useState(false)
  const [editingStorageArea, setEditingStorageArea] = useState<StorageArea | null>(null)
  const [storageForm, setStorageForm] = useState<Partial<StorageArea>>({})
  const [storageSaving, setStorageSaving] = useState(false)

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
    } else if (activeTab === 'storage_areas' && client) {
      setTabLoading(true)
      api.get<StorageArea[]>(`/storage-areas?client_id=${id}`)
        .then(setStorageAreas)
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

  const openStorageModal = (area?: StorageArea) => {
    if (area) {
      setEditingStorageArea(area)
      setStorageForm(area)
    } else {
      setEditingStorageArea(null)
      setStorageForm({ client_id: Number(id) })
    }
    setStorageModalOpen(true)
  }

  const handleStorageSave = async () => {
    setStorageSaving(true)
    try {
      if (editingStorageArea) {
        const updated = await api.put<StorageArea>(`/storage-areas/${editingStorageArea.id}`, storageForm)
        setStorageAreas(prev => prev.map(a => a.id === updated.id ? updated : a))
      } else {
        const created = await api.post<StorageArea>('/storage-areas', storageForm)
        setStorageAreas(prev => [...prev, created])
      }
      setStorageModalOpen(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save storage area')
    } finally {
      setStorageSaving(false)
    }
  }

  const handleStorageDelete = async (areaId: number) => {
    if (!confirm('Delete this storage area?')) return
    try {
      await api.delete(`/storage-areas/${areaId}`)
      setStorageAreas(prev => prev.filter(a => a.id !== areaId))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete storage area')
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
    { key: 'storage_areas', label: 'Storage Areas' },
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
                  <SelectField label="Industry" value={editForm.industry || ''} onChange={v => setEditForm(f => ({ ...f, industry: v }))} options={INDUSTRIES} />
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
                  <InfoRow label="Industry" value={INDUSTRIES.find(i => i.value === client.industry)?.label || client.industry} />
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

          {activeTab === 'storage_areas' && (
            tabLoading ? <LoadingSpinner /> : (
              <div>
                <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--nz-navy)', margin: 0 }}>Storage Areas</h3>
                  <button
                    onClick={() => openStorageModal()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 14px', height: 36, border: 'none', cursor: 'pointer', fontSize: 13 }}
                  >
                    <Plus size={14} /> Add Storage Area
                  </button>
                </div>
                {storageAreas.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#94A3B8' }}>No storage areas for this client.</p>
                ) : (
                  <table className="w-full">
                    <thead style={{ borderBottom: '1px solid rgba(0,36,125,0.08)' }}>
                      <tr>
                        <th style={thStyle}>Area Name</th>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Substance Classes</th>
                        <th style={thStyle}>Max Capacity</th>
                        <th style={thStyle}>Building Type</th>
                        <th style={thStyle}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storageAreas.map(area => (
                        <tr key={area.id} style={{ height: 48, borderBottom: '1px solid rgba(0,36,125,0.05)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)' }}>{area.area_name}</td>
                          <td style={{ fontSize: 13, color: '#64748B' }}>{AREA_TYPES.find(t => t.value === area.area_type)?.label || area.area_type || '—'}</td>
                          <td style={{ fontSize: 13, color: '#64748B' }}>{area.substance_classes || '—'}</td>
                          <td style={{ fontSize: 13, color: '#64748B' }}>{area.max_capacity || '—'}</td>
                          <td style={{ fontSize: 13, color: '#64748B' }}>{area.building_type || '—'}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openStorageModal(area)}
                                style={{ fontSize: 13, color: 'var(--nz-navy)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleStorageDelete(area.id)}
                                style={{ color: 'var(--nz-red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Storage Area Modal */}
      <Modal isOpen={storageModalOpen} onClose={() => setStorageModalOpen(false)} title={editingStorageArea ? 'Edit Storage Area' : 'Add Storage Area'}>
        <div className="space-y-4">
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 4 }}>Area Name *</label>
            <input
              type="text"
              value={storageForm.area_name || ''}
              onChange={e => setStorageForm(f => ({ ...f, area_name: e.target.value }))}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 4 }}>Area Type</label>
            <select
              value={storageForm.area_type || ''}
              onChange={e => setStorageForm(f => ({ ...f, area_type: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Select...</option>
              {AREA_TYPES.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 4 }}>Substance Classes</label>
            <input
              type="text"
              value={storageForm.substance_classes || ''}
              onChange={e => setStorageForm(f => ({ ...f, substance_classes: e.target.value }))}
              placeholder="e.g. 3.1A, 6.1A"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 4 }}>Max Capacity</label>
            <input
              type="text"
              value={storageForm.max_capacity || ''}
              onChange={e => setStorageForm(f => ({ ...f, max_capacity: e.target.value }))}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 4 }}>Building Type</label>
            <input
              type="text"
              value={storageForm.building_type || ''}
              onChange={e => setStorageForm(f => ({ ...f, building_type: e.target.value }))}
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 4 }}>Notes</label>
            <textarea
              value={storageForm.notes || ''}
              onChange={e => setStorageForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>
          <div className="flex justify-end gap-3" style={{ paddingTop: 8 }}>
            <button
              onClick={() => setStorageModalOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid var(--nz-navy)', color: 'var(--nz-navy)', background: 'transparent', borderRadius: 10, fontWeight: 600, padding: '0 14px', height: 36, cursor: 'pointer', fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              onClick={handleStorageSave}
              disabled={storageSaving || !storageForm.area_name}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 14px', height: 36, border: 'none', cursor: 'pointer', fontSize: 13, opacity: storageSaving || !storageForm.area_name ? 0.6 : 1 }}
            >
              {storageSaving ? 'Saving...' : editingStorageArea ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>
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

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 4 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
      >
        <option value="">Select...</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
