import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, InventoryItem } from '@/types'
import Modal from '@/components/Modal'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import Toast from '@/components/Toast'

const HAZARD_CLASSES = [
  '2.1.1', '2.1.2', '3.1A', '3.1B', '3.1C', '3.1D',
  '6.3A', '6.4A', '6.4B', '9.1A', '9.3C',
]

interface SummaryItem {
  hazard_class: string
  total_quantity: number
  unit: string
  item_count: number
}

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

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients)
  }, [])

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

  return (
    <div className="space-y-6">
      {/* Client selector */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4">
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 ml-auto"
          >
            <Plus size={15} />
            Add Substance
          </button>
        )}
      </div>

      {!selectedClient ? (
        <div className="bg-white rounded-xl shadow-sm p-16 text-center">
          <p className="text-gray-400">Select a client to view and manage their hazardous substances inventory.</p>
        </div>
      ) : loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => fetchInventory(selectedClient)} />
      ) : (
        <>
          {/* Summary by hazard class */}
          {summary.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary by Hazard Class</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {summary.map(s => (
                  <div key={s.hazard_class} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-xs font-bold text-orange-700 font-mono">{s.hazard_class}</p>
                    <p className="text-lg font-bold text-gray-900 mt-1">{s.total_quantity}</p>
                    <p className="text-xs text-gray-500">{s.unit} · {s.item_count} item{s.item_count !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inventory table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {inventory.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-500">No inventory items for this client.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-3 text-sm text-blue-600 hover:underline"
                >
                  Add the first substance
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Substance</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Hazard Class</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Container</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">SDS</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inventory.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.substance_name}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs font-mono rounded">
                            {item.hazard_class}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{item.quantity} {item.unit}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {item.container_size && item.container_count
                            ? `${item.container_count} × ${item.container_size}L`
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{item.storage_location || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.sds_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {item.sds_available ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditItem(item)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
                {HAZARD_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
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
                {HAZARD_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Adding...' : 'Add Substance'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
