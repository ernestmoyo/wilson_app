import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, Assessment } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'

interface ClassGroup {
  key: string
  label: string
  item_count: number
}

interface ClassPreview {
  general: { label: string; item_count: number }
  class_specific: ClassGroup[]
  total_items: number
}

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

type AssessmentType = 'pre_inspection' | 'site_inspection' | 'validation' | 'certified_handler'

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
  const [classPreview, setClassPreview] = useState<ClassPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // Fetch class-group preview when substance_classes changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const classes = form.substance_classes.split(',').map(s => s.trim()).filter(Boolean)
    if (form.type !== 'site_inspection' || classes.length === 0) {
      setClassPreview(null)
      return
    }

    debounceRef.current = setTimeout(() => {
      setLoadingPreview(true)
      api.get<{ data: ClassPreview }>(`/assessments/class-groups?substance_classes=${encodeURIComponent(classes.join(','))}`)
        .then(res => setClassPreview(res.data))
        .catch(() => setClassPreview(null))
        .finally(() => setLoadingPreview(false))
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [form.substance_classes, form.type])

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
    { value: 'site_inspection', label: 'Site Inspection', desc: `Site Inspection — On-site hazardous substances inspection (${classPreview ? `${classPreview.total_items}-item` : 'class-conditional'} checklist)` },
    { value: 'certified_handler', label: 'Certified Handler', desc: 'Handler competency assessment — identity, knowledge & practical tests (13-item checklist)' },
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
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', maxHeight: 180, overflowY: 'auto' }}>
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
                        setForm(f => ({ ...f, substance_classes: next.join(', ') }))
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ color: '#1E293B' }}>{opt.label}</span>
                  </label>
                )
              })}
            </div>

            {/* Checklist Preview */}
            {form.type === 'site_inspection' && form.substance_classes.split(',').filter(s => s.trim()).length > 0 && (
              <div style={{ marginTop: 12, border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', backgroundColor: '#F9FAFB' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 8 }}>Checklist Preview</p>
                <hr style={{ border: 'none', borderTop: '1px solid #D1D5DB', marginBottom: 8 }} />
                {loadingPreview ? (
                  <p style={{ fontSize: 12, color: '#6B7280' }}>Loading preview...</p>
                ) : classPreview ? (
                  <>
                    <p style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
                      Part 1: {classPreview.general.label} — {classPreview.general.item_count} items (always included)
                    </p>
                    {classPreview.class_specific.map(group => (
                      <p key={group.key} style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
                        Part 2: {group.label} — {group.item_count} items
                      </p>
                    ))}
                    <hr style={{ border: 'none', borderTop: '1px solid #D1D5DB', marginTop: 8, marginBottom: 8 }} />
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#1E293B' }}>
                      Total: {classPreview.total_items} items
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: 12, color: '#6B7280' }}>Unable to load preview.</p>
                )}
              </div>
            )}
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
