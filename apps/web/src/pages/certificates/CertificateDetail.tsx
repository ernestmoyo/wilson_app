import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
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
  const [action, setAction] = useState<'grant' | 'refuse' | 'conditional' | null>(null)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 3)
    return d.toISOString().split('T')[0]
  })
  const [expiryOption, setExpiryOption] = useState<'1' | '2' | '3' | 'custom'>('3')
  const [customExpiry, setCustomExpiry] = useState('')
  const [refusalReasons, setRefusalReasons] = useState('')
  const [applicantNotified, setApplicantNotified] = useState(false)
  const [worksafeNotified, setWorksafeNotified] = useState(false)
  const [conditionDetails, setConditionDetails] = useState('')
  const [conditionDeadline, setConditionDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [showRegPreview, setShowRegPreview] = useState(false)

  // Max condition deadline = today + 92 days
  const maxConditionDeadline = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 92)
    return d.toISOString().split('T')[0]
  })()

  const refreshCert = () => {
    api.get<Certificate>(`/certificates/${id}`)
      .then(setCert)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
  }

  useEffect(() => {
    api.get<Certificate>(`/certificates/${id}`)
      .then(setCert)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  // Compute expiry date from option
  useEffect(() => {
    if (expiryOption === 'custom') {
      setExpiryDate(customExpiry)
      return
    }
    const d = new Date(issueDate || new Date())
    d.setFullYear(d.getFullYear() + Number(expiryOption))
    setExpiryDate(d.toISOString().split('T')[0])
  }, [expiryOption, issueDate, customExpiry])

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
    if (!applicantNotified || !worksafeNotified) {
      setSubmitError('Please confirm both notification obligations before refusing.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const updated = await api.put<Certificate>(`/certificates/${id}`, {
        status: 'refused',
        refusal_reasons: refusalReasons,
        applicant_notified: true,
        worksafe_notified: true,
      })
      setCert(updated)
      setAction(null)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to refuse certificate')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConditionalGrant = async () => {
    if (!conditionDetails.trim()) {
      setSubmitError('Please specify the unmet requirement.')
      return
    }
    if (!conditionDeadline) {
      setSubmitError('Please enter the date by which the requirement must be met.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const updated = await api.put<Certificate>(`/certificates/${id}`, {
        status: 'granted',
        is_conditional: true,
        condition_details: conditionDetails,
        condition_deadline: conditionDeadline,
        issue_date: issueDate,
        expiry_date: expiryDate,
      })
      setCert(updated)
      setAction(null)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to grant conditional certificate')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkConditionMet = async () => {
    setSubmitting(true)
    try {
      const updated = await api.put<Certificate>(`/certificates/${id}`, { is_conditional: false })
      setCert(updated)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkRegistered = async () => {
    setSubmitting(true)
    try {
      const updated = await api.put<Certificate>(`/certificates/${id}`, { worksafe_registered: true })
      setCert(updated)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!cert) return <ErrorMessage message="Certificate not found" />

  // Register deadline = issue_date + 21 days
  const registerDeadline = (() => {
    if (!cert.issue_date) return null
    const d = new Date(cert.issue_date)
    d.setDate(d.getDate() + 21)
    return d
  })()

  // Condition overdue check
  const conditionOverdue = cert.is_conditional && cert.condition_deadline
    ? new Date() > new Date(cert.condition_deadline)
    : false

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

      {/* Conditional certificate banner */}
      {cert.is_conditional && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-amber-800">
            <AlertTriangle size={16} />
            CONDITIONAL CERTIFICATE
          </div>
          <p className="text-sm text-amber-700">
            Condition must be met by: <span className="font-medium">{cert.condition_deadline ? new Date(cert.condition_deadline).toLocaleDateString('en-NZ') : '—'}</span>
          </p>
          <p className="text-sm text-amber-700">
            Unmet requirement: <span className="font-medium">{cert.condition_details || '—'}</span>
          </p>
          <p className="text-xs text-amber-600">Authority: HSW Regs 2017, reg 6.24</p>
          {conditionOverdue && (
            <button
              onClick={handleMarkConditionMet}
              disabled={submitting}
              className="mt-2 px-4 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              Mark Condition Met
            </button>
          )}
        </div>
      )}

      {/* Register warning banner */}
      {cert.status === 'granted' && !cert.worksafe_registered && registerDeadline && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-800 mb-1">
            <span>📋</span> Register Entry Required
          </div>
          <p className="text-sm text-amber-700">
            Under reg 6.22(5), you must enter this certificate in the WorkSafe register of compliance
            certificates within 15 working days of issue (by{' '}
            <span className="font-medium">{registerDeadline.toLocaleDateString('en-NZ')}</span>).
          </p>
          <button
            onClick={handleMarkRegistered}
            disabled={submitting}
            className="mt-3 px-4 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            Mark as Registered
          </button>
        </div>
      )}
      {cert.status === 'granted' && cert.worksafe_registered && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 font-medium">
          ✓ Entered in WorkSafe register.
        </div>
      )}

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
            {(cert.applicant_notified || cert.worksafe_notified) && (
              <p className="text-xs text-red-600 mt-2">
                Applicant notified: {cert.applicant_notified ? 'Yes' : 'No'} | WorkSafe notified: {cert.worksafe_notified ? 'Yes' : 'No'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Register Entry Preview (reg 6.26) */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowRegPreview(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span>Register Entry Preview (reg 6.26)</span>
          {showRegPreview ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showRegPreview && (
          <div className="px-6 pb-6">
            <dl className="divide-y divide-gray-100">
              <RegField label="Issue date" reg="reg 6.26(2)(a)" value={cert.issue_date ? new Date(cert.issue_date).toLocaleDateString('en-NZ') : '—'} />
              <RegField label="Commencement date" reg="reg 6.26(2)(a)" value={cert.issue_date ? new Date(cert.issue_date).toLocaleDateString('en-NZ') : '—'} />
              <RegField label="Expiry date" reg="reg 6.26(2)(a)" value={cert.expiry_date ? new Date(cert.expiry_date).toLocaleDateString('en-NZ') : '—'} />
              <RegField label="Substance classes" reg="reg 6.26(2)(b)" value={cert.substance_class || '—'} />
              <RegField label="Certifier name" reg="reg 6.26(2)(c)" value={cert.certifier_name || '—'} />
              <RegField label="PCBU legal name" reg="reg 6.26(2)(e)" value={cert.client_name || '—'} />
              <RegField label="PCBU trading name" reg="reg 6.26(2)(e)" value={cert.trading_name || '—'} />
              <RegField label="NZBN" reg="reg 6.26(2)(e)" value={cert.nzbn || '—'} />
              <RegField label="Site address" reg="reg 6.26(2)(e)" value={'—'} />
              <RegField label="Companies number" reg="reg 6.26(2)(e)(ii)" value={cert.companies_number || '—'} />
            </dl>
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
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => { setAction('grant'); setSubmitError('') }}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <CheckCircle size={16} />
                Grant Certificate
              </button>
              <button
                onClick={() => { setAction('conditional'); setSubmitError('') }}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                <AlertTriangle size={16} />
                Grant Conditional Certificate
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

          {/* Grant form */}
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

          {/* Conditional grant form */}
          {action === 'conditional' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-amber-700">Grant Conditional Certificate (reg 6.24)</h4>
              <p className="text-xs text-gray-500">WorkSafe recommends a maximum 3-year term for location compliance certificates.</p>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry</label>
                  <select
                    value={expiryOption}
                    onChange={e => setExpiryOption(e.target.value as '1' | '2' | '3' | 'custom')}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="1">1 year</option>
                    <option value="2">2 years</option>
                    <option value="3">3 years (recommended)</option>
                    <option value="custom">Custom date</option>
                  </select>
                  {expiryOption === 'custom' && (
                    <input
                      type="date"
                      value={customExpiry}
                      onChange={e => setCustomExpiry(e.target.value)}
                      className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unmet requirement (reg 6.24(2)(a)) *
                </label>
                <textarea
                  value={conditionDetails}
                  onChange={e => setConditionDetails(e.target.value)}
                  required
                  rows={3}
                  placeholder="Specify the requirement not yet met..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date by which requirement must be met — max 3 months (reg 6.24(2)(b)) *
                </label>
                <input
                  type="date"
                  value={conditionDeadline}
                  onChange={e => setConditionDeadline(e.target.value)}
                  max={maxConditionDeadline}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                  onClick={handleConditionalGrant}
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  {submitting ? 'Granting...' : 'Confirm Conditional Grant'}
                </button>
              </div>
            </div>
          )}

          {/* Refuse form */}
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

              {/* reg 6.23 notification obligations */}
              <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-indigo-800">Under reg 6.23(2), you are legally required to:</p>
                <ul className="space-y-1 text-sm text-indigo-700">
                  <li>✉ Notify the applicant in writing of this refusal and reasons</li>
                  <li>✉ Notify WorkSafe of this refusal and reasons (within 15 working days — reg 6.22(5))</li>
                </ul>
                <div className="space-y-2 pt-1">
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applicantNotified}
                      onChange={e => setApplicantNotified(e.target.checked)}
                      className="mt-0.5 accent-indigo-600"
                    />
                    I have notified or will notify the applicant in writing (reg 6.23(2)(b))
                  </label>
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={worksafeNotified}
                      onChange={e => setWorksafeNotified(e.target.checked)}
                      className="mt-0.5 accent-indigo-600"
                    />
                    I have notified or will notify WorkSafe in writing (reg 6.23(2)(c))
                  </label>
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
                  onClick={handleRefuse}
                  disabled={submitting || !applicantNotified || !worksafeNotified}
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

function RegField({ label, reg, value }: { label: string; reg: string; value: string }) {
  return (
    <div className="py-3 grid grid-cols-3 gap-4">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{reg}</p>
      </div>
      <p className="col-span-2 text-sm text-gray-900 self-center">{value}</p>
    </div>
  )
}
