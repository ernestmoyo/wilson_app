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

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link to="/clients" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} />
          Clients
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm text-gray-900 font-medium">{client.legal_name}</span>
      </div>

      {/* Client header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{client.legal_name}</h2>
            {client.trading_name && (
              <p className="text-sm text-gray-500 mt-0.5">Trading as: {client.trading_name}</p>
            )}
            <p className="text-sm text-gray-600 mt-1">{client.site_address}</p>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setEditForm(client) }}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                >
                  <X size={14} /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
              >
                <Edit2 size={14} /> Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 flex">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
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
                  <InfoRow label="NZBN" value={client.nzbn} />
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
                <p className="text-sm text-gray-500">No assessments for this client.</p>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {assessments.map(a => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="py-3"><StatusBadge status={a.type} /></td>
                        <td className="py-3"><StatusBadge status={a.status} /></td>
                        <td className="py-3 text-sm text-gray-600">
                          {a.inspection_date ? new Date(a.inspection_date).toLocaleDateString('en-NZ') : '—'}
                        </td>
                        <td className="py-3">
                          <Link to={`/assessment/${a.id}`} className="text-sm text-blue-600 hover:underline">View</Link>
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
                <p className="text-sm text-gray-500">No certificates for this client.</p>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Certificate #</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Substance Class</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Expiry</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {certificates.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="py-3 text-sm font-medium text-gray-900">{c.certificate_number || `#${c.id}`}</td>
                        <td className="py-3"><StatusBadge status={c.status} /></td>
                        <td className="py-3 text-sm text-gray-600">{c.substance_class || '—'}</td>
                        <td className="py-3 text-sm text-gray-600">
                          {c.expiry_date ? new Date(c.expiry_date).toLocaleDateString('en-NZ') : '—'}
                        </td>
                        <td className="py-3">
                          <Link to={`/certificates/${c.id}`} className="text-sm text-blue-600 hover:underline">View</Link>
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
                  <p className="text-sm text-gray-500 mb-3">No inventory items for this client.</p>
                  <Link to="/inventory" className="text-sm text-blue-600 hover:underline">Go to Inventory Manager</Link>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-gray-100">
                    <tr>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Substance</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Hazard Class</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Quantity</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">Location</th>
                      <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase">SDS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {inventory.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="py-3 text-sm font-medium text-gray-900">{item.substance_name}</td>
                        <td className="py-3 text-sm text-gray-600">{item.hazard_class}</td>
                        <td className="py-3 text-sm text-gray-600">{item.quantity} {item.unit}</td>
                        <td className="py-3 text-sm text-gray-600">{item.storage_location || '—'}</td>
                        <td className="py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.sds_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
