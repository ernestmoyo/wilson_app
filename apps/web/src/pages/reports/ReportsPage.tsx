import { useEffect, useState, useCallback } from 'react'
import { Plus, Eye, Trash2, Printer, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { Report, Client, Assessment } from '@/types'
import Modal from '@/components/Modal'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

interface ReportItem {
  item_number: string
  description: string
  status: string
  comments?: string
}

interface ReportSection {
  section: string
  items: ReportItem[]
}

interface ReportContent {
  summary?: {
    total_items?: number
    compliant?: number
    non_compliant?: number
    inapplicable?: number
    pending?: number
    compliance_rate?: number
  }
  decision?: string
  sections?: ReportSection[]
}

const TYPE_LABELS: Record<string, string> = {
  compliance_report: 'Compliance Report',
  gap_analysis: 'Gap Analysis',
  non_compliance_notice: 'Non-Compliance Notice',
  certificate_report: 'Certificate Report',
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewReport, setViewReport] = useState<Report | null>(null)
  const [showGenModal, setShowGenModal] = useState(false)
  const [genClientId, setGenClientId] = useState('')
  const [genAssessmentId, setGenAssessmentId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.get<Report[]>('/reports')
      setReports(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  useEffect(() => {
    Promise.all([
      api.get<Client[]>('/clients'),
      api.get<Assessment[]>('/assessments'),
    ]).then(([c, a]) => { setClients(c); setAssessments(a) })
  }, [])

  const filteredAssessments = genClientId
    ? assessments.filter(a => a.client_id === Number(genClientId))
    : assessments

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!genAssessmentId) { setGenError('Please select an assessment.'); return }
    setGenerating(true)
    setGenError('')
    try {
      const report = await api.post<Report>(`/reports/generate/gap-analysis/${genAssessmentId}`, {})
      setShowGenModal(false)
      setGenClientId('')
      setGenAssessmentId('')
      fetchReports()
      setViewReport(report)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (reportId: number) => {
    if (!confirm('Delete this report?')) return
    try {
      await api.delete(`/reports/${reportId}`)
      setReports(prev => prev.filter(r => r.id !== reportId))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  const parseContent = (content: string): ReportContent => {
    try { return JSON.parse(content) } catch { return {} }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-end">
        <button
          onClick={() => { setShowGenModal(true); setGenError('') }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Generate Gap Analysis
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage message={error} onRetry={fetchReports} />
        ) : reports.length === 0 ? (
          <div className="text-center py-16">
            <FileText size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No reports generated yet.</p>
            <button
              onClick={() => setShowGenModal(true)}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Generate your first report
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{r.title}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">
                        {TYPE_LABELS[r.type] || r.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {clients.find(c => c.id === r.client_id)?.legal_name || `Client #${r.client_id}`}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(r.created_at).toLocaleDateString('en-NZ')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewReport(r)}
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <Eye size={14} />
                          View
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
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

      {/* Generate Modal */}
      <Modal isOpen={showGenModal} onClose={() => setShowGenModal(false)} title="Generate Gap Analysis Report" size="md">
        <form onSubmit={handleGenerate} className="space-y-4">
          {genError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{genError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select
              value={genClientId}
              onChange={e => { setGenClientId(e.target.value); setGenAssessmentId('') }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assessment *</label>
            <select
              required
              value={genAssessmentId}
              onChange={e => setGenAssessmentId(e.target.value)}
              disabled={!genClientId}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Select a client above to filter assessments…</option>
              {filteredAssessments.map(a => (
                <option key={a.id} value={a.id}>
                  #{a.id} - {a.client_name || `Client #${a.client_id}`} - {a.type.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowGenModal(false)}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={generating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Report Modal */}
      {viewReport && (
        <Modal isOpen={!!viewReport} onClose={() => setViewReport(null)} title={viewReport.title} size="xl">
          <ReportViewer report={viewReport} />
        </Modal>
      )}
    </div>
  )
}

function ReportViewer({ report }: { report: Report }) {
  const content = (() => {
    try { return JSON.parse(report.content) as ReportContent }
    catch { return null }
  })()

  const handlePrint = () => window.print()

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
        >
          <Printer size={15} />
          Print / PDF
        </button>
      </div>

      {content ? (
        <div className="space-y-6">
          {/* Decision badge */}
          {content.decision && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg font-semibold ${
              content.decision === 'compliant'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <span className="text-lg">{content.decision === 'compliant' ? '✓' : '✗'}</span>
              Decision: {content.decision}
            </div>
          )}

          {/* Summary */}
          {content.summary && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase mb-3">Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {content.summary.total_items !== undefined && (
                  <StatCard label="Total Items" value={content.summary.total_items} color="text-gray-700" bg="bg-gray-50" />
                )}
                {content.summary.compliant !== undefined && (
                  <StatCard label="Compliant" value={content.summary.compliant} color="text-green-700" bg="bg-green-50" />
                )}
                {content.summary.non_compliant !== undefined && (
                  <StatCard label="Non-Compliant" value={content.summary.non_compliant} color="text-red-700" bg="bg-red-50" />
                )}
                {content.summary.inapplicable !== undefined && (
                  <StatCard label="N/A" value={content.summary.inapplicable} color="text-gray-500" bg="bg-gray-50" />
                )}
                {content.summary.compliance_rate !== undefined && (
                  <StatCard label="Compliance Rate" value={`${content.summary.compliance_rate}%`} color="text-blue-700" bg="bg-blue-50" />
                )}
              </div>
            </div>
          )}

          {/* Non-compliant items derived from sections */}
          {content.sections && content.sections.length > 0 && (() => {
            const nonCompliantItems = content.sections.flatMap(section =>
              section.items
                .filter(i => i.status === 'non_compliant')
                .map(i => ({ ...i, sectionLabel: section.section }))
            )
            if (nonCompliantItems.length === 0) return null
            return (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase mb-3">Non-Compliant Items</h3>
                <div className="space-y-2">
                  {nonCompliantItems.map((item, i) => (
                    <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-xs text-red-600 font-bold mt-0.5 shrink-0">
                          {item.sectionLabel}{item.item_number}
                        </span>
                        <div>
                          <p className="text-sm text-gray-800">{item.description}</p>
                          {item.comments && (
                            <p className="text-xs text-gray-500 mt-1">Comment: {item.comments}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-4">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto">{report.content}</pre>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color, bg }: { label: string; value: number | string; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-lg p-3 text-center`}>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
