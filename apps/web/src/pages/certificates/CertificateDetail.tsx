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

  const inputStyle = { width: '100%', border: '1.5px solid #CBD5E1', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)', marginBottom: 4 } as const

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link to="/certificates" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#64748B', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
          Certificates
        </Link>
        <span style={{ color: '#CBD5E1' }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)' }}>{cert.certificate_number || `Certificate #${id}`}</span>
      </div>

      {/* Conditional certificate banner */}
      {cert.is_conditional && (
        <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 12, padding: 16, color: '#92400E' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
            <AlertTriangle size={16} />
            CONDITIONAL CERTIFICATE
          </div>
          <p style={{ fontSize: 13, marginBottom: 2 }}>
            Condition must be met by: <strong>{cert.condition_deadline ? new Date(cert.condition_deadline).toLocaleDateString('en-NZ') : '—'}</strong>
          </p>
          <p style={{ fontSize: 13, marginBottom: 2 }}>
            Unmet requirement: <strong>{cert.condition_details || '—'}</strong>
          </p>
          <p style={{ fontSize: 11, color: '#B45309' }}>Authority: HSW Regs 2017, reg 6.24</p>
          {conditionOverdue && (
            <button
              onClick={handleMarkConditionMet}
              disabled={submitting}
              style={{ marginTop: 8, background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 36, border: 'none', cursor: 'pointer', fontSize: 13, opacity: submitting ? 0.6 : 1 }}
            >
              Mark Condition Met
            </button>
          )}
        </div>
      )}

      {/* Register warning banner */}
      {cert.status === 'granted' && !cert.worksafe_registered && registerDeadline && (
        <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 12, padding: 16, color: '#92400E' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
            <span>📋</span> Register Entry Required
          </div>
          <p style={{ fontSize: 13 }}>
            Under reg 6.22(5), you must enter this certificate in the WorkSafe register of compliance
            certificates within 15 working days of issue (by{' '}
            <strong>{registerDeadline.toLocaleDateString('en-NZ')}</strong>).
          </p>
          <button
            onClick={handleMarkRegistered}
            disabled={submitting}
            style={{ marginTop: 12, background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 36, border: 'none', cursor: 'pointer', fontSize: 13, opacity: submitting ? 0.6 : 1 }}
          >
            Mark as Registered
          </button>
        </div>
      )}
      {cert.status === 'granted' && cert.worksafe_registered && (
        <div style={{ background: '#DCFCE7', border: '1px solid #16A34A', borderRadius: 12, padding: 16, color: '#16A34A', fontSize: 13, fontWeight: 600 }}>
          ✓ Entered in WorkSafe register.
        </div>
      )}

      {/* Main card */}
      <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--nz-navy)', margin: 0 }}>
              {cert.certificate_number || `CERT-${cert.id}`}
            </h2>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
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
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 8 }}>Assessment</p>
              <Link to={`/assessment/${cert.assessment_id}`} style={{ fontSize: 13, color: 'var(--nz-navy)', fontWeight: 600 }}>
                Assessment #{cert.assessment_id}
              </Link>
            </div>
          )}
        </div>

        {cert.refusal_reasons && (
          <div style={{ marginTop: 24, padding: 16, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--nz-red)', textTransform: 'uppercase', marginBottom: 4 }}>Refusal Reasons</p>
            <p style={{ fontSize: 13, color: '#7F1D1D' }}>{cert.refusal_reasons}</p>
            {(cert.applicant_notified || cert.worksafe_notified) && (
              <p style={{ fontSize: 11, color: '#B91C1C', marginTop: 8 }}>
                Applicant notified: {cert.applicant_notified ? 'Yes' : 'No'} | WorkSafe notified: {cert.worksafe_notified ? 'Yes' : 'No'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Register Entry Preview (reg 6.26) */}
      <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', overflow: 'hidden' }}>
        <button
          onClick={() => setShowRegPreview(v => !v)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span>Register Entry Preview (reg 6.26)</span>
          {showRegPreview ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showRegPreview && (
          <div style={{ padding: '0 24px 24px' }}>
            <dl style={{ borderTop: '1px solid rgba(0,36,125,0.08)' }}>
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
        <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--nz-navy)', marginBottom: 16, marginTop: 0 }}>Certificate Decision</h3>

          {submitError && (
            <div style={{ marginBottom: 16, background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--nz-red)', fontSize: 13, padding: '8px 12px', borderRadius: 8 }}>
              {submitError}
            </div>
          )}

          {action === null && (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => { setAction('grant'); setSubmitError('') }}
                style={{ background: '#16A34A', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
              >
                <CheckCircle size={16} />
                Grant Certificate
              </button>
              <button
                onClick={() => { setAction('conditional'); setSubmitError('') }}
                style={{ background: '#F59E0B', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
              >
                <AlertTriangle size={16} />
                Grant Conditional Certificate
              </button>
              <button
                onClick={() => { setAction('refuse'); setSubmitError('') }}
                style={{ background: 'var(--nz-red)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
              >
                <XCircle size={16} />
                Refuse Certificate
              </button>
            </div>
          )}

          {/* Grant form */}
          {action === 'grant' && (
            <div className="space-y-4">
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#16A34A', margin: 0 }}>Grant Certificate</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>Issue Date</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={e => setIssueDate(e.target.value)}
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                    onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                    onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setAction(null)}
                  style={{ border: '1.5px solid var(--nz-navy)', color: 'var(--nz-navy)', background: 'transparent', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, cursor: 'pointer', fontSize: 14 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleGrant}
                  disabled={submitting}
                  style={{ background: '#16A34A', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', fontSize: 14, opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? 'Granting...' : 'Confirm Grant'}
                </button>
              </div>
            </div>
          )}

          {/* Conditional grant form */}
          {action === 'conditional' && (
            <div className="space-y-4">
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#B45309', margin: 0 }}>Grant Conditional Certificate (reg 6.24)</h4>
              <p style={{ fontSize: 11, color: '#94A3B8' }}>WorkSafe recommends a maximum 3-year term for location compliance certificates.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>Issue Date</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={e => setIssueDate(e.target.value)}
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                    onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expiry</label>
                  <select
                    value={expiryOption}
                    onChange={e => setExpiryOption(e.target.value as '1' | '2' | '3' | 'custom')}
                    style={inputStyle}
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
                      style={{ ...inputStyle, marginTop: 8 }}
                      onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                      onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                    />
                  )}
                </div>
              </div>
              <div>
                <label style={labelStyle}>
                  Unmet requirement (reg 6.24(2)(a)) *
                </label>
                <textarea
                  value={conditionDetails}
                  onChange={e => setConditionDetails(e.target.value)}
                  required
                  rows={3}
                  placeholder="Specify the requirement not yet met..."
                  style={{ ...inputStyle, resize: 'none' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                  onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                />
              </div>
              <div>
                <label style={labelStyle}>
                  Date by which requirement must be met — max 3 months (reg 6.24(2)(b)) *
                </label>
                <input
                  type="date"
                  value={conditionDeadline}
                  onChange={e => setConditionDeadline(e.target.value)}
                  max={maxConditionDeadline}
                  required
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                  onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setAction(null)}
                  style={{ border: '1.5px solid var(--nz-navy)', color: 'var(--nz-navy)', background: 'transparent', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, cursor: 'pointer', fontSize: 14 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConditionalGrant}
                  disabled={submitting}
                  style={{ background: '#F59E0B', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', fontSize: 14, opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? 'Granting...' : 'Confirm Conditional Grant'}
                </button>
              </div>
            </div>
          )}

          {/* Refuse form */}
          {action === 'refuse' && (
            <div className="space-y-4">
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--nz-red)', margin: 0 }}>Refuse Certificate</h4>
              <div>
                <label style={labelStyle}>Refusal Reasons *</label>
                <textarea
                  value={refusalReasons}
                  onChange={e => setRefusalReasons(e.target.value)}
                  rows={4}
                  placeholder="Enter the reasons for refusing this certificate..."
                  style={{ ...inputStyle, resize: 'none' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                  onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
                />
              </div>

              {/* reg 6.23 notification obligations */}
              <div style={{ border: '1px solid rgba(0,36,125,0.15)', background: 'rgba(0,36,125,0.04)', borderRadius: 10, padding: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--nz-navy)', marginBottom: 8, marginTop: 0 }}>Under reg 6.23(2), you are legally required to:</p>
                <ul style={{ margin: '0 0 10px 0', padding: '0 0 0 4px', listStyle: 'none' }}>
                  <li style={{ fontSize: 13, color: 'var(--nz-navy)', marginBottom: 4 }}>✉ Notify the applicant in writing of this refusal and reasons</li>
                  <li style={{ fontSize: 13, color: 'var(--nz-navy)' }}>✉ Notify WorkSafe of this refusal and reasons (within 15 working days — reg 6.22(5))</li>
                </ul>
                <div className="space-y-2">
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#1E293B', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={applicantNotified}
                      onChange={e => setApplicantNotified(e.target.checked)}
                      style={{ marginTop: 2, accentColor: 'var(--nz-navy)' }}
                    />
                    I have notified or will notify the applicant in writing (reg 6.23(2)(b))
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#1E293B', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={worksafeNotified}
                      onChange={e => setWorksafeNotified(e.target.checked)}
                      style={{ marginTop: 2, accentColor: 'var(--nz-navy)' }}
                    />
                    I have notified or will notify WorkSafe in writing (reg 6.23(2)(c))
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setAction(null)}
                  style={{ border: '1.5px solid var(--nz-navy)', color: 'var(--nz-navy)', background: 'transparent', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, cursor: 'pointer', fontSize: 14 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRefuse}
                  disabled={submitting || !applicantNotified || !worksafeNotified}
                  style={{ background: 'var(--nz-red)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', fontSize: 14, opacity: (submitting || !applicantNotified || !worksafeNotified) ? 0.5 : 1 }}
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
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 14, color: '#1E293B', fontWeight: 500 }}>{value || '—'}</p>
    </div>
  )
}

function RegField({ label, reg, value }: { label: string; reg: string; value: string }) {
  return (
    <div style={{ padding: '12px 0', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, borderBottom: '1px solid rgba(0,36,125,0.06)' }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{reg}</p>
      </div>
      <p style={{ fontSize: 13, color: '#1E293B', margin: 0, alignSelf: 'center' }}>{value}</p>
    </div>
  )
}
