import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { Client } from '@/types'
import Modal from '@/components/Modal'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import Toast from '@/components/Toast'

interface TrainingRecord {
  id: number
  client_id: number
  worker_name: string
  department?: string
  course_name: string
  training_date?: string
  competent: number
  expiry_date?: string
  certificate_evidence_id?: number
  notes?: string
  created_at: string
}

interface TrainingSummary {
  total_workers: number
  total_records: number
  competent: number
  expired_or_expiring: number
}

interface TrainingForm {
  worker_name: string
  department: string
  course_name: string
  training_date: string
  competent: boolean
  expiry_date: string
  notes: string
}

const defaultForm: TrainingForm = {
  worker_name: '',
  department: '',
  course_name: '',
  training_date: '',
  competent: false,
  expiry_date: '',
  notes: '',
}

function getExpiryStyle(expiryDate?: string): { label: string; style: React.CSSProperties } | null {
  if (!expiryDate) return null
  const now = new Date()
  const expiry = new Date(expiryDate)
  const diffMs = expiry.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays < 0) {
    return {
      label: 'Expired',
      style: { background: '#FEE2E2', color: '#CC142B', border: '1px solid rgba(204,20,43,0.3)' },
    }
  }
  if (diffDays <= 180) {
    return {
      label: 'Expiring soon',
      style: { background: '#FEF3C7', color: '#92400E', border: '1px solid rgba(245,158,11,0.3)' },
    }
  }
  return null
}

export default function TrainingPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [records, setRecords] = useState<TrainingRecord[]>([])
  const [summary, setSummary] = useState<TrainingSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<TrainingForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [editItem, setEditItem] = useState<TrainingRecord | null>(null)
  const [editForm, setEditForm] = useState<TrainingForm>(defaultForm)
  const [editFormError, setEditFormError] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients)
  }, [])

  const fetchRecords = useCallback(async (clientId: string) => {
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      const [items, sum] = await Promise.allSettled([
        api.get<TrainingRecord[]>(`/training?client_id=${clientId}`),
        api.get<TrainingSummary>(`/training/summary/${clientId}`),
      ])
      if (items.status === 'fulfilled') setRecords(items.value)
      if (sum.status === 'fulfilled') setSummary(sum.value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load training records')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedClient) fetchRecords(selectedClient)
    else { setRecords([]); setSummary(null) }
  }, [selectedClient, fetchRecords])

  useEffect(() => {
    if (editItem) {
      setEditForm({
        worker_name: editItem.worker_name,
        department: editItem.department || '',
        course_name: editItem.course_name,
        training_date: editItem.training_date || '',
        competent: Boolean(editItem.competent),
        expiry_date: editItem.expiry_date || '',
        notes: editItem.notes || '',
      })
      setEditFormError('')
    }
  }, [editItem])

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editItem) return
    if (!editForm.worker_name.trim() || !editForm.course_name.trim()) {
      setEditFormError('Worker Name and Course Name are required.')
      return
    }
    setEditSubmitting(true)
    setEditFormError('')
    try {
      await api.put(`/training/${editItem.id}`, {
        worker_name: editForm.worker_name,
        department: editForm.department || undefined,
        course_name: editForm.course_name,
        training_date: editForm.training_date || undefined,
        competent: editForm.competent ? 1 : 0,
        expiry_date: editForm.expiry_date || undefined,
        notes: editForm.notes || undefined,
      })
      setEditItem(null)
      fetchRecords(selectedClient)
      setToast({ message: 'Training record updated successfully!', type: 'success' })
    } catch (e) {
      setEditFormError(e instanceof Error ? e.message : 'Failed to update training record')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDelete = async (itemId: number) => {
    if (!confirm('Delete this training record?')) return
    try {
      await api.delete(`/training/${itemId}`)
      setRecords(prev => prev.filter(i => i.id !== itemId))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.worker_name.trim() || !form.course_name.trim() || !selectedClient) {
      setFormError('Worker Name, Course Name, and Client are required.')
      return
    }
    setSubmitting(true)
    setFormError('')
    try {
      await api.post('/training', {
        client_id: Number(selectedClient),
        worker_name: form.worker_name,
        department: form.department || undefined,
        course_name: form.course_name,
        training_date: form.training_date || undefined,
        competent: form.competent ? 1 : 0,
        expiry_date: form.expiry_date || undefined,
        notes: form.notes || undefined,
      })
      setShowModal(false)
      setForm(defaultForm)
      fetchRecords(selectedClient)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add training record')
    } finally {
      setSubmitting(false)
    }
  }

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
            Add Training Record
          </button>
        )}
      </div>

      {!selectedClient ? (
        <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }} className="py-16 text-center">
          <p className="text-gray-400">Select a client to view and manage their worker training records.</p>
        </div>
      ) : loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => fetchRecords(selectedClient)} />
      ) : (
        <>
          {/* Training Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }}>
                <p style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Total Workers</p>
                <p style={{ color: 'var(--nz-navy)', fontWeight: 700, fontSize: 28, marginTop: 4 }}>{summary.total_workers}</p>
              </div>
              <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }}>
                <p style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Total Records</p>
                <p style={{ color: 'var(--nz-navy)', fontWeight: 700, fontSize: 28, marginTop: 4 }}>{summary.total_records}</p>
              </div>
              <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }}>
                <p style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Competent</p>
                <p style={{ color: '#16A34A', fontWeight: 700, fontSize: 28, marginTop: 4 }}>{summary.competent}</p>
              </div>
              <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }}>
                <p style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Expired / Expiring</p>
                <p style={{ color: '#CC142B', fontWeight: 700, fontSize: 28, marginTop: 4 }}>{summary.expired_or_expiring}</p>
              </div>
            </div>
          )}

          {/* Training Records table */}
          <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }} className="overflow-hidden">
            {records.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-500">No training records for this client.</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-3 text-sm hover:underline"
                  style={{ color: 'var(--nz-navy)' }}
                >
                  Add the first training record
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Worker Name</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Department</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Course</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Training Date</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Competent</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Expiry Date</th>
                      <th className="px-6 py-3 text-left" style={{ color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {records.map(item => {
                      const expiryInfo = getExpiryStyle(item.expiry_date)
                      return (
                        <tr key={item.id} style={{ height: 52 }} className="transition-colors" onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td className="px-6 py-4 text-sm" style={{ fontWeight: 600, color: 'var(--nz-navy)' }}>{item.worker_name}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{item.department || '—'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{item.course_name}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{item.training_date || '—'}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              item.competent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {item.competent ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {item.expiry_date ? (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600">{item.expiry_date}</span>
                                {expiryInfo && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={expiryInfo.style}>
                                    {expiryInfo.label}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
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
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit Training Record Modal */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Edit Training Record" size="lg">
        <form onSubmit={handleEditSave} className="space-y-4">
          {editFormError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{editFormError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Worker Name *</label>
            <input
              type="text"
              required
              value={editForm.worker_name}
              onChange={e => setEditForm(f => ({ ...f, worker_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input
                type="text"
                value={editForm.department}
                onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}
                placeholder="e.g. Operations"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Course Name *</label>
              <input
                type="text"
                required
                value={editForm.course_name}
                onChange={e => setEditForm(f => ({ ...f, course_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Training Date</label>
              <input
                type="date"
                value={editForm.training_date}
                onChange={e => setEditForm(f => ({ ...f, training_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={editForm.expiry_date}
                onChange={e => setEditForm(f => ({ ...f, expiry_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
                checked={editForm.competent}
                onChange={e => setEditForm(f => ({ ...f, competent: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Competent</span>
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

      {/* Add Training Record Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Training Record" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{formError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Worker Name *</label>
            <input
              type="text"
              required
              value={form.worker_name}
              onChange={e => setForm(f => ({ ...f, worker_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input
                type="text"
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                placeholder="e.g. Operations"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Course Name *</label>
              <input
                type="text"
                required
                value={form.course_name}
                onChange={e => setForm(f => ({ ...f, course_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Training Date</label>
              <input
                type="date"
                value={form.training_date}
                onChange={e => setForm(f => ({ ...f, training_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
                checked={form.competent}
                onChange={e => setForm(f => ({ ...f, competent: e.target.checked }))}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Competent</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
              {submitting ? 'Adding...' : 'Add Training Record'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
