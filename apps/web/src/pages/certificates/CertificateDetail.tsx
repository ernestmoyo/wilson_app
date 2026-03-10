import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { Certificate } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

export default function CertificateDetail() {
  const { id } = useParams<{ id: string }>()
  const [cert, setCert] = useState<Certificate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState<'grant' | 'refuse' | null>(null)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 3)
    return d.toISOString().split('T')[0]
  })
  const [refusalReasons, setRefusalReasons] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    api.get<Certificate>(`/certificates/${id}`)
      .then(setCert)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  const handleGrant = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const updated = await api.put<Certificate>(`/certificates/${id}`, {
        status: 'granted',
        issue_date: issueDate,
        expiry_date: expiryDate,
      })
      setCert(updated)
      setAction(null)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to grant certificate')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRefuse = async () => {
    if (!refusalReasons.trim()) {
      setSubmitError('Please enter refusal reasons.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const updated = await api.put<Certificate>(`/certificates/${id}`, {
        status: 'refused',
        refusal_reasons: refusalReasons,
      })
      setCert(updated)
      setAction(null)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to refuse certificate')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!cert) return <ErrorMessage message="Certificate not found" />

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link to="/certificates" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} />
          Certificates
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm font-medium text-gray-900">{cert.certificate_number || `Certificate #${id}`}</span>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {cert.certificate_number || `CERT-${cert.id}`}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {cert.client_name || `Client #${cert.client_id}`}
            </p>
          </div>
          <StatusBadge status={cert.status} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <InfoRow label="Client" value={cert.client_name || `Client #${cert.client_id}`} />
          <InfoRow label="Substance Class" value={cert.substance_class} />
          <InfoRow label="Max Quantity" value={cert.max_quantity} />
          <InfoRow label="Status" value={cert.status.charAt(0).toUpperCase() + cert.status.slice(1)} />
          <InfoRow label="Issue Date" value={cert.issue_date ? new Date(cert.issue_date).toLocaleDateString('en-NZ') : undefined} />
          <InfoRow label="Expiry Date" value={cert.expiry_date ? new Date(cert.expiry_date).toLocaleDateString('en-NZ') : undefined} />
          <InfoRow label="Created" value={new Date(cert.created_at).toLocaleDateString('en-NZ')} />
          {cert.assessment_id && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Assessment</p>
              <Link to={`/assessment/${cert.assessment_id}`} className="text-sm text-blue-600 hover:underline">
                Assessment #{cert.assessment_id}
              </Link>
            </div>
          )}
        </div>

        {cert.refusal_reasons && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-semibold text-red-700 uppercase mb-1">Refusal Reasons</p>
            <p className="text-sm text-red-800">{cert.refusal_reasons}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {cert.status === 'pending' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Certificate Decision</h3>

          {submitError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {submitError}
            </div>
          )}

          {action === null && (
            <div className="flex gap-3">
              <button
                onClick={() => { setAction('grant'); setSubmitError('') }}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <CheckCircle size={16} />
                Grant Certificate
              </button>
              <button
                onClick={() => { setAction('refuse'); setSubmitError('') }}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                <XCircle size={16} />
                Refuse Certificate
              </button>
            </div>
          )}

          {action === 'grant' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-green-700">Grant Certificate</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={e => setIssueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setAction(null)}
                  className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGrant}
                  disabled={submitting}
                  className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? 'Granting...' : 'Confirm Grant'}
                </button>
              </div>
            </div>
          )}

          {action === 'refuse' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-red-700">Refuse Certificate</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refusal Reasons *</label>
                <textarea
                  value={refusalReasons}
                  onChange={e => setRefusalReasons(e.target.value)}
                  rows={4}
                  placeholder="Enter the reasons for refusing this certificate..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setAction(null)}
                  className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRefuse}
                  disabled={submitting}
                  className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? 'Refusing...' : 'Confirm Refusal'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
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
