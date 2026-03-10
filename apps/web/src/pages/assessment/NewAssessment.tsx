import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, Assessment } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'

type AssessmentType = 'pre_inspection' | 'site_inspection' | 'validation'

interface FormData {
  client_id: string
  type: AssessmentType
  inspection_date: string
  substance_classes: string
  notes: string
}

export default function NewAssessment() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormData>({
    client_id: '',
    type: 'site_inspection',
    inspection_date: new Date().toISOString().split('T')[0],
    substance_classes: '',
    notes: '',
  })

  useEffect(() => {
    api.get<Client[]>('/clients')
      .then(setClients)
      .finally(() => setLoadingClients(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_id) {
      setError('Please select a client.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const data = await api.post<Assessment>('/assessments', {
        ...form,
        client_id: Number(form.client_id),
      })
      navigate(`/assessment/${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create assessment')
      setSubmitting(false)
    }
  }

  const typeOptions: { value: AssessmentType; label: string; desc: string }[] = [
    { value: 'pre_inspection', label: 'Pre-Inspection', desc: 'Initial document review before site visit' },
    { value: 'site_inspection', label: 'Site Inspection', desc: 'On-site hazardous substances inspection' },
    { value: 'validation', label: 'Validation', desc: 'Compliance validation and certification check' },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link to="/assessment" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} />
          Assessments
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm font-medium text-gray-900">New Assessment</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Create New Assessment</h2>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            {loadingClients ? (
              <LoadingSpinner message="Loading clients..." />
            ) : (
              <select
                required
                value={form.client_id}
                onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.legal_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assessment Type *</label>
            <div className="space-y-2">
              {typeOptions.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    form.type === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={opt.value}
                    checked={form.type === opt.value}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as AssessmentType }))}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Inspection Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Inspection Date</label>
            <input
              type="date"
              value={form.inspection_date}
              onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Substance Classes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Substance Classes</label>
            <input
              type="text"
              value={form.substance_classes}
              onChange={e => setForm(f => ({ ...f, substance_classes: e.target.value }))}
              placeholder="e.g. 2.1.1, 3.1A, 6.3A"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={4}
              placeholder="Any additional notes about this assessment..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Link
              to="/assessment"
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
