import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Eye } from 'lucide-react'
import { api } from '@/lib/api'
import { Assessment } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

const STATUS_OPTIONS = ['all', 'draft', 'in_progress', 'completed', 'compliant', 'non_compliant']

export default function AssessmentList() {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchAssessments = useCallback(async (status?: string) => {
    setLoading(true)
    setError('')
    try {
      const url = status && status !== 'all' ? `/assessments?status=${status}` : '/assessments'
      const data = await api.get<Assessment[]>(url)
      setAssessments(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assessments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAssessments(statusFilter)
  }, [fetchAssessments, statusFilter])

  return (
    <div style={{ background: 'var(--nz-bg)', minHeight: '100%' }} className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={statusFilter === s
                ? { background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 14px', height: 36, border: 'none', cursor: 'pointer', fontSize: 13 }
                : { background: 'white', color: '#64748B', border: '1px solid rgba(0,36,125,0.10)', borderRadius: 10, fontWeight: 500, padding: '0 14px', height: 36, cursor: 'pointer', fontSize: 13 }
              }
            >
              {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
        <Link
          to="/assessment/new"
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, textDecoration: 'none', fontSize: 14 }}
        >
          <Plus size={16} />
          New Assessment
        </Link>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', overflow: 'hidden' }}>
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} onRetry={() => fetchAssessments(statusFilter)} />
        ) : assessments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <p style={{ color: '#94A3B8', fontSize: 14 }}>No assessments found.</p>
            <Link to="/assessment/new" style={{ fontSize: 13, color: 'var(--nz-navy)', fontWeight: 600, textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
              Create the first assessment
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ borderBottom: '1px solid rgba(0,36,125,0.08)' }}>
                <tr>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Client</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Inspector</th>
                  <th style={{ padding: '12px 24px', textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(a => (
                  <tr key={a.id} style={{ height: 52, borderBottom: '1px solid rgba(0,36,125,0.05)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '0 24px', fontWeight: 600, color: 'var(--nz-navy)', fontSize: 14 }}>
                      {a.client_name || `Client #${a.client_id}`}
                    </td>
                    <td style={{ padding: '0 24px' }}>
                      <StatusBadge status={a.type} />
                    </td>
                    <td style={{ padding: '0 24px' }}>
                      <StatusBadge status={a.status} />
                    </td>
                    <td style={{ padding: '0 24px', fontSize: 13, color: '#64748B' }}>
                      {a.inspection_date
                        ? new Date(a.inspection_date).toLocaleDateString('en-NZ')
                        : '—'}
                    </td>
                    <td style={{ padding: '0 24px', fontSize: 13, color: '#64748B' }}>
                      {a.inspector_name || `#${a.inspector_id}`}
                    </td>
                    <td style={{ padding: '0 24px' }}>
                      <Link
                        to={`/assessment/${a.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--nz-navy)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        <Eye size={14} />
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
