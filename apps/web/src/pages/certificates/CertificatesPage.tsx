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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 flex-wrap">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowModal(true); setFormError('') }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          New Certificate
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} onRetry={() => fetchCerts(activeTab)} />
        ) : certificates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500">No certificates found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Certificate #</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Substance Class</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Issue Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expiry Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {certificates.map(c => {
                  const expiring = isExpiringSoon(c.expiry_date)
                  const expired = c.status === 'expired'
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">
                        {c.certificate_number || `CERT-${c.id}`}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {c.client_name || `Client #${c.client_id}`}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{c.substance_class || '—'}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {c.issue_date ? new Date(c.issue_date).toLocaleDateString('en-NZ') : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {c.expiry_date ? (
                          <span className={expired || expiring ? 'text-red-600 font-medium' : 'text-gray-600'}>
                            {new Date(c.expiry_date).toLocaleDateString('en-NZ')}
                            {expiring && !expired && ' ⚠'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          to={`/certificates/${c.id}`}
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
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
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{formError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select
              required
              value={form.client_id}
              onChange={e => setForm(f => ({ ...f, client_id: e.target.value, assessment_id: '' }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assessment (optional)</label>
            <select
              value={form.assessment_id}
              onChange={e => setForm(f => ({ ...f, assessment_id: e.target.value }))}
              disabled={!form.client_id}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Substance Class</label>
            <input
              type="text"
              value={form.substance_class}
              onChange={e => setForm(f => ({ ...f, substance_class: e.target.value }))}
              placeholder="e.g. 3.1A, 2.1.1"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Quantity</label>
            <input
              type="text"
              value={form.max_quantity}
              onChange={e => setForm(f => ({ ...f, max_quantity: e.target.value }))}
              placeholder="e.g. 1000L"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Certificate'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
