import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, InventoryItem, StorageArea } from '@/types'
import Modal from '@/components/Modal'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import Toast from '@/components/Toast'
import { HSL_THRESHOLDS } from '@/lib/thresholds'

const HAZARD_CLASSES_WITH_LABELS: { value: string; label: string }[] = [
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
  { value: '6.4B', label: '6.4B — Eye Irritant Cat.2' },
  { value: '6.5A', label: '6.5A — Sensitiser' },
  { value: '8.1A', label: '8.1A — Metallic Corrosive' },
  { value: '8.2A', label: '8.2A — Skin Corrosive Cat.1' },
  { value: '8.3A', label: '8.3A — Eye Corrosive' },
  { value: '9.1A', label: '9.1A — Aquatic Ecotoxic' },
  { value: '9.3C', label: '9.3C — Terrestrial Vertebrate Ecotoxic' },
]

const HAZARD_CLASSES = HAZARD_CLASSES_WITH_LABELS.map(h => h.value)

interface SummaryItem {
  hazard_class: string
  total_quantity: number
  unit: string
  item_count: number
}

const SUBSTANCE_STATES = [
  { value: '', label: 'Select state...' },
  { value: 'solid', label: 'Solid' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'gas', label: 'Gas' },
  { value: 'aerosol', label: 'Aerosol' },
]

interface AddForm {
  substance_name: string
  hazard_class: string
  quantity: string
  unit: string
  container_size: string
  container_count: string
  storage_location: string
  sds_available: boolean
  notes: string
  un_number: string
  hsno_approval: string
  substance_state: string
  sds_expiry_date: string
  max_quantity: string
  storage_area_id: string
}

const defaultForm: AddForm = {
  substance_name: '',
  hazard_class: '3.1A',
  quantity: '',
  unit: 'litres',
  container_size: '',
  container_count: '',
  storage_location: '',
  sds_available: false,
  notes: '',
  un_number: '',
  hsno_approval: '',
  substance_state: '',
  sds_expiry_date: '',
  max_quantity: '',
  storage_area_id: '',
}

function getHazardBadgeStyle(hazardClass: string): React.CSSProperties {
  if (hazardClass.startsWith('3.1')) {
    return { background: '#FFF7ED', color: '#C2410C', borderLeft: '3px solid #F97316' }
  } else if (hazardClass.startsWith('2.1')) {
    return { background: '#EFF6FF', color: '#1D4ED8', borderLeft: '3px solid #3B82F6' }
  } else if (hazardClass.startsWith('4.')) {
    return { background: '#FAF5FF', color: '#7C3AED', borderLeft: '3px solid #8B5CF6' }
  } else if (hazardClass.startsWith('6.')) {
    return { background: '#FEF2F2', color: '#DC2626', borderLeft: '3px solid #EF4444' }
  } else {
    return { background: '#F8FAFC', color: '#64748B', borderLeft: '3px solid #CBD5E1' }
  }
}

function getSdsExpiryStyle(expiryDate?: string): { background: string; color: string; label: string } {
  if (!expiryDate) return { background: '#F1F5F9', color: '#64748B', label: '—' }
  const now = new Date()
  const expiry = new Date(expiryDate)
  const sixMonths = new Date()
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  if (expiry < now) {
    return { background: '#FEE2E2', color: '#DC2626', label: expiryDate }
  } else if (expiry <= sixMonths) {
    return { background: '#FEF3C7', color: '#92400E', label: expiryDate }
  }
  return { background: '#DCFCE7', color: '#16A34A', label: expiryDate }
}

export default function InventoryPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [summary, setSummary] = useState<SummaryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<AddForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [editForm, setEditForm] = useState<AddForm>(defaultForm)
  const [editFormError, setEditFormError] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [storageAreas, setStorageAreas] = useState<StorageArea[]>([])

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients)
  }, [])

  useEffect(() => {
    if (selectedClient) {
      api.get<StorageArea[]>(`/storage-areas?client_id=${selectedClient}`)
        .then(setStorageAreas)
        .catch(() => setStorageAreas([]))
    } else {
      setStorageAreas([])
    }
  }, [selectedClient])

  const fetchInventory = useCallback(async (clientId: string) => {
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      const [items, sum] = await Promise.allSettled([
        api.get<InventoryItem[]>(`/inventory?client_id=${clientId}`),
        api.get<SummaryItem[]>(`/inventory/summary/${clientId}`),
      ])
      if (items.status === 'fulfilled') setInventory(items.value)
      if (sum.status === 'fulfilled') setSummary(sum.value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedClient) fetchInventory(selectedClient)
    else { setInventory([]); setSummary([]) }
  }, [selectedClient, fetchInventory])

  useEffect(() => {
    if (editItem) {
      setEditForm({
        substance_name: editItem.substance_name,
        hazard_class: editItem.hazard_class,
        quantity: String(editItem.quantity),
        unit: editItem.unit,
        container_size: editItem.container_size != null ? String(editItem.container_size) : '',
        container_count: editItem.container_count != null ? String(editItem.container_count) : '',
        storage_location: editItem.storage_location || '',
        sds_available: Boolean(editItem.sds_available),
        notes: editItem.notes || '',
        un_number: editItem.un_number || '',
        hsno_approval: editItem.hsno_approval || editItem.hazard_classifications || '',
        substance_state: editItem.substance_state || '',
        sds_expiry_date: editItem.sds_expiry_date || '',
        max_quantity: editItem.max_quantity != null ? String(editItem.max_quantity) : '',
        storage_area_id: editItem.storage_area_id != null ? String(editItem.storage_area_id) : '',
      })
      setEditFormError('')
    }
  }, [editItem])

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editItem) return
    if (!editForm.substance_name.trim() || !editForm.quantity) {
      setEditFormError('Substance Name and Quantity are required.')
      return
    }
    setEditSubmitting(true)
    setEditFormError('')
    try {
      await api.put(`/inventory/${editItem.id}`, {
        substance_name: editForm.substance_name,
        hazard_class: editForm.hazard_class,
        quantity: Number(editForm.quantity),
        unit: editForm.unit,
        container_size: editForm.container_size ? Number(editForm.container_size) : undefined,
        container_count: editForm.container_count ? Number(editForm.container_count) : undefined,
        storage_location: editForm.storage_location,
        sds_available: editForm.sds_available ? 1 : 0,
        notes: editForm.notes,
        un_number: editForm.un_number || undefined,
        hsno_approval: editForm.hsno_approval || undefined,
        substance_state: editForm.substance_state || undefined,
        sds_expiry_date: editForm.sds_expiry_date || undefined,
        max_quantity: editForm.max_quantity ? Number(editForm.max_quantity) : undefined,
        storage_area_id: editForm.storage_area_id ? Number(editForm.storage_area_id) : undefined,
      })
      setEditItem(null)
      fetchInventory(selectedClient)
      setToast({ message: 'Substance updated successfully!', type: 'success' })
    } catch (e) {
      setEditFormError(e instanceof Error ? e.message : 'Failed to update substance')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDelete = async (itemId: number) => {
    if (!confirm('Delete this inventory item?')) return
    try {
      await api.delete(`/inventory/${itemId}`)
      setInventory(prev => prev.filter(i => i.id !== itemId))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.substance_name.trim() || !form.quantity || !selectedClient) {
      setFormError('Substance Name, Quantity, and Client are required.')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      await api.post('/inventory', {
        client_id: Number(selectedClient),
        substance_name: form.substance_name,
        hazard_class: form.hazard_class,
        quantity: Number(form.quantity),
        unit: form.unit,
        container_size: form.container_size ? Number(form.container_size) : undefined,
        container_count: form.container_count ? Number(form.container_count) : undefined,
        storage_location: form.storage_location,
        sds_available: form.sds_available ? 1 : 0,
        notes: form.notes,
        un_number: form.un_number || undefined,
        hsno_approval: form.hsno_approval || undefined,
        substance_state: form.substance_state || undefined,
        sds_expiry_date: form.sds_expiry_date || undefined,
        max_quantity: form.max_quantity ? Number(form.max_quantity) : undefined,
        storage_area_id: form.storage_area_id ? Number(form.storage_area_id) : undefined,
      })
      setShowModal(false)
      setForm(defaultForm)
      fetchInventory(selectedClient)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add substance')
    } finally {
      setSubmitting(false)
    }
  }

  const totalsByClass = inventory.reduce<Record<string, number>>((acc, item) => {
    acc[item.hazard_class] = (acc[item.hazard_class] || 0) + item.quantity;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Client selector */}
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }} className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 shrink-0">Select Client:</label>
        <select
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Choose a client...</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
        </select>
        {selectedClient && (
          <button
            onClick={() => { setShowModal(true); setFormError('') }}
            style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            className="ml-auto"
          >
            <Plus size={15} />
            Add Substance
          </button>
        )}
      </div>

      {!selectedClient ? (
        <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }} className="py-16 text-center">
          <p className="text-gray-400">Select a client to view and manage their hazardous substances inventory.</p>
        </div>
      ) : loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => fetchInventory(selectedClient)} />
      ) : (
        <>
          {/* Summary by Hazard Class */}
          {Object.keys(totalsByClass).length > 0 && (
            <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }}>
              <h3 style={{ color: 'var(--nz-navy)', fontWeight: 700 }} className="text-sm mb-4">Summary by Hazard Class</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-2 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Hazard Class</th>
                      <th className="px-4 py-2 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Total Qty</th>
                      <th className="px-4 py-2 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Unit</th>
                      <th className="px-4 py-2 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>HSL Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {Object.entries(totalsByClass).map(([hazardClass, total]) => {
                      const threshold = HSL_THRESHOLDS[hazardClass];
                      const unitLabel = inventory.find(i => i.hazard_class === hazardClass)?.unit ?? '';
                      let badge: React.ReactNode;
                      if (threshold) {
                        if (total >= threshold.value) {
                          badge = (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium" style={{ background: '#FEE2E2', color: '#CC142B', border: '1px solid rgba(204,20,43,0.3)' }}>
                              ⚠ HSL threshold exceeded (reg 10.26) — Location Compliance Certificate required (reg 10.34/10.36)
                            </span>
                          );
                        } else if (total >= threshold.value * 0.8) {
                          badge = (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid rgba(245,158,11,0.3)' }}>
                              Approaching HSL threshold (reg 10.26) — certificate will be required above {threshold.value} {threshold.unit}
                            </span>
                          );
                        } else {
                          badge = (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium" style={{ background: '#DCFCE7', color: '#16A34A', border: '1px solid rgba(22,163,74,0.3)' }}>
                              Compliant
                            </span>
                          );
                        }
                      } else {
                        badge = (
                          <span className="text-xs text-gray-400">No HSL threshold defined</span>
                        );
                      }
                      return (
                        <tr key={hazardClass} style={{ height: 52 }} className="transition-colors" onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 text-xs font-semibold rounded" style={getHazardBadgeStyle(hazardClass)}>{hazardClass}</span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{total}</td>
                          <td className="px-4 py-3 text-gray-500">{unitLabel}</td>
                          <td className="px-4 py-3">{badge}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inventory table */}
          <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }} className="overflow-hidden">
            {inventory.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-500">No inventory items for this client.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-3 text-sm hover:underline"
                  style={{ color: 'var(--nz-navy)' }}
                >
                  Add the first substance
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Substance</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Hazard Class</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>UN No.</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Quantity</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Container</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Location</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>SDS</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>SDS Expiry</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inventory.map(item => (
                      <tr key={item.id} style={{ height: 52 }} className="transition-colors" onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td className="px-6 py-4 text-sm" style={{ fontWeight: 600, color: 'var(--nz-navy)' }}>{item.substance_name}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 text-xs font-semibold rounded" style={getHazardBadgeStyle(item.hazard_class)}>
                            {item.hazard_class}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{item.un_number || '—'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{item.quantity} {item.unit}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {item.container_size && item.container_count
                            ? `${item.container_count} × ${item.container_size}L`
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {item.storage_area_id
                            ? storageAreas.find(a => a.id === item.storage_area_id)?.area_name || item.storage_location || '—'
                            : item.storage_location || '—'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.sds_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {item.sds_available ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {(() => {
                            const sdsStyle = getSdsExpiryStyle(item.sds_expiry_date)
                            return (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: sdsStyle.background, color: sdsStyle.color }}>
                                {sdsStyle.label}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditItem(item)}
                              className="p-1.5 rounded transition-colors"
                              style={{ color: 'var(--nz-navy)', background: 'transparent' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,36,125,0.08)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                              title="Edit"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-1.5 rounded transition-colors"
                              style={{ color: 'var(--nz-red)', background: 'transparent' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(204,20,43,0.08)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit Hazardous Substance Modal */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Edit Hazardous Substance" size="lg">
        <form onSubmit={handleEditSave} className="space-y-4">
          {editFormError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{editFormError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Substance Name *</label>
            <input
              type="text"
              required
              value={editForm.substance_name}
              onChange={e => setEditForm(f => ({ ...f, substance_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hazard Class *</label>
              <select
                required
                value={editForm.hazard_class}
                onChange={e => setEditForm(f => ({ ...f, hazard_class: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {HAZARD_CLASSES_WITH_LABELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select
                required
                value={editForm.unit}
                onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="litres">Litres</option>
                <option value="kg">Kilograms</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={editForm.quantity}
                onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Container Size</label>
              <input
                type="number"
                min="0"
                value={editForm.container_size}
                onChange={e => setEditForm(f => ({ ...f, container_size: e.target.value }))}
                placeholder="Litres"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Container Count</label>
              <input
                type="number"
                min="0"
                value={editForm.container_count}
                onChange={e => setEditForm(f => ({ ...f, container_count: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">UN Number</label>
              <input
                type="text"
                value={editForm.un_number}
                onChange={e => setEditForm(f => ({ ...f, un_number: e.target.value }))}
                placeholder="e.g. UN1203"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HSNO Approval</label>
              <input
                type="text"
                value={editForm.hsno_approval}
                onChange={e => setEditForm(f => ({ ...f, hsno_approval: e.target.value }))}
                placeholder="e.g. HSR001375"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Substance State</label>
              <select
                value={editForm.substance_state}
                onChange={e => setEditForm(f => ({ ...f, substance_state: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SUBSTANCE_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Quantity</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.max_quantity}
                onChange={e => setEditForm(f => ({ ...f, max_quantity: e.target.value }))}
                placeholder="Maximum permitted quantity"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Storage Area</label>
              <select
                value={editForm.storage_area_id}
                onChange={e => setEditForm(f => ({ ...f, storage_area_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None (use free-text location)</option>
                {storageAreas.map(a => <option key={a.id} value={a.id}>{a.area_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Storage Location</label>
              <input
                type="text"
                value={editForm.storage_location}
                onChange={e => setEditForm(f => ({ ...f, storage_location: e.target.value }))}
                placeholder="e.g. Chemical Store Room A"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SDS Expiry Date</label>
            <input
              type="date"
              value={editForm.sds_expiry_date}
              onChange={e => setEditForm(f => ({ ...f, sds_expiry_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={editForm.notes}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.sds_available}
                onChange={e => setEditForm(f => ({ ...f, sds_available: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Safety Data Sheet (SDS) Available</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditItem(null)}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={editSubmitting}
              style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', opacity: editSubmitting ? 0.5 : 1 }}>
              {editSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Substance Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Hazardous Substance" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{formError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Substance Name *</label>
            <input
              type="text"
              required
              value={form.substance_name}
              onChange={e => setForm(f => ({ ...f, substance_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hazard Class *</label>
              <select
                required
                value={form.hazard_class}
                onChange={e => setForm(f => ({ ...f, hazard_class: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {HAZARD_CLASSES_WITH_LABELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select
                required
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="litres">Litres</option>
                <option value="kg">Kilograms</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Container Size</label>
              <input
                type="number"
                min="0"
                value={form.container_size}
                onChange={e => setForm(f => ({ ...f, container_size: e.target.value }))}
                placeholder="Litres"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Container Count</label>
              <input
                type="number"
                min="0"
                value={form.container_count}
                onChange={e => setForm(f => ({ ...f, container_count: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">UN Number</label>
              <input
                type="text"
                value={form.un_number}
                onChange={e => setForm(f => ({ ...f, un_number: e.target.value }))}
                placeholder="e.g. UN1203"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HSNO Approval</label>
              <input
                type="text"
                value={form.hsno_approval}
                onChange={e => setForm(f => ({ ...f, hsno_approval: e.target.value }))}
                placeholder="e.g. HSR001375"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Substance State</label>
              <select
                value={form.substance_state}
                onChange={e => setForm(f => ({ ...f, substance_state: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SUBSTANCE_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Quantity</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.max_quantity}
                onChange={e => setForm(f => ({ ...f, max_quantity: e.target.value }))}
                placeholder="Maximum permitted quantity"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Storage Area</label>
              <select
                value={form.storage_area_id}
                onChange={e => setForm(f => ({ ...f, storage_area_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None (use free-text location)</option>
                {storageAreas.map(a => <option key={a.id} value={a.id}>{a.area_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Storage Location</label>
              <input
                type="text"
                value={form.storage_location}
                onChange={e => setForm(f => ({ ...f, storage_location: e.target.value }))}
                placeholder="e.g. Chemical Store Room A"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SDS Expiry Date</label>
            <input
              type="date"
              value={form.sds_expiry_date}
              onChange={e => setForm(f => ({ ...f, sds_expiry_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.sds_available}
                onChange={e => setForm(f => ({ ...f, sds_available: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Safety Data Sheet (SDS) Available</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
              {submitting ? 'Adding...' : 'Add Substance'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
