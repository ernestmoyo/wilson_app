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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
        <Link
          to="/assessment/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          New Assessment
        </Link>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} onRetry={() => fetchAssessments(statusFilter)} />
        ) : assessments.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500">No assessments found.</p>
            <Link to="/assessment/new" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
              Create the first assessment
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Inspector</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assessments.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {a.client_name || `Client #${a.client_id}`}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={a.type} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {a.inspection_date
                        ? new Date(a.inspection_date).toLocaleDateString('en-NZ')
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {a.inspector_name || `#${a.inspector_id}`}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/assessment/${a.id}`}
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
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
