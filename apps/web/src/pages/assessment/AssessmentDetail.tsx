import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { Assessment, AssessmentItem } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

type ItemStatus = 'compliant' | 'non_compliant' | 'inapplicable' | 'pending'

interface LocalItem extends AssessmentItem {
  _dirty?: boolean
}

const STATUS_BTN: { value: ItemStatus; label: string; colors: string }[] = [
  { value: 'compliant', label: 'C', colors: 'bg-green-500 text-white hover:bg-green-600' },
  { value: 'non_compliant', label: 'NC', colors: 'bg-red-500 text-white hover:bg-red-600' },
  { value: 'inapplicable', label: 'N/A', colors: 'bg-gray-400 text-white hover:bg-gray-500' },
  { value: 'pending', label: '?', colors: 'bg-yellow-400 text-white hover:bg-yellow-500' },
]

const STATUS_INACTIVE: Record<ItemStatus, string> = {
  compliant: 'bg-white border border-green-300 text-green-600 hover:bg-green-50',
  non_compliant: 'bg-white border border-red-300 text-red-600 hover:bg-red-50',
  inapplicable: 'bg-white border border-gray-300 text-gray-500 hover:bg-gray-50',
  pending: 'bg-white border border-yellow-300 text-yellow-600 hover:bg-yellow-50',
}

function groupBySection(items: LocalItem[]) {
  const groups: Record<string, LocalItem[]> = {}
  for (const item of items) {
    if (!groups[item.section]) groups[item.section] = []
    groups[item.section].push(item)
  }
  return groups
}

export default function AssessmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [items, setItems] = useState<LocalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [asmnt, itemsData] = await Promise.all([
        api.get<Assessment>(`/assessments/${id}`),
        api.get<AssessmentItem[]>(`/assessments/${id}/items`),
      ])
      setAssessment(asmnt)
      setItems(itemsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assessment')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const updateItem = (itemId: number, field: keyof AssessmentItem, value: string) => {
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, [field]: value, _dirty: true } : item
    ))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await api.post(`/assessments/${id}/items`, { items })
      setSaveMsg('Saved successfully!')
      setItems(prev => prev.map(i => ({ ...i, _dirty: false })))
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateReport = async () => {
    if (!window.confirm('Generate a compliance report for this assessment?')) return
    try {
      const existing = await api.get<unknown[]>('/reports?assessment_id=' + id)
      if (existing && existing.length > 0) {
        const proceed = window.confirm('A report already exists for this assessment. Generate a new one anyway?')
        if (!proceed) return
      }
    } catch {
      // If the check fails, proceed anyway
    }
    setGenerating(true)
    try {
      await api.post(`/reports/generate/gap-analysis/${id}`, {})
      window.alert('Report generated successfully!')
      navigate('/reports')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const toggleSection = (section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />
  if (!assessment) return <ErrorMessage message="Assessment not found" />

  const groups = groupBySection(items)
  const sections = Object.keys(groups).sort()

  const total = items.length
  const compliantCount = items.filter(i => i.status === 'compliant').length
  const nonCompliantCount = items.filter(i => i.status === 'non_compliant').length
  const naCount = items.filter(i => i.status === 'inapplicable').length
  const pendingCount = items.filter(i => i.status === 'pending').length
  const applicable = total - naCount
  const compliancePercent = applicable > 0 ? Math.round((compliantCount / applicable) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link to="/assessment" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} />
          Assessments
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-sm font-medium text-gray-900">Assessment #{id}</span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">
                {assessment.client_name || `Client #${assessment.client_id}`}
              </h2>
              <StatusBadge status={assessment.type} />
              <StatusBadge status={assessment.status} />
            </div>
            <p className="text-sm text-gray-500">
              Inspector: {assessment.inspector_name || `#${assessment.inspector_id}`}
              {assessment.inspection_date && (
                <> · {new Date(assessment.inspection_date).toLocaleDateString('en-NZ')}</>
              )}
              {assessment.substance_classes && (
                <> · Classes: {assessment.substance_classes}</>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleGenerateReport}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <FileText size={15} />
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={15} />
              {saving ? 'Saving...' : 'Save All Items'}
            </button>
          </div>
        </div>

        {saveMsg && (
          <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${
            saveMsg.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {saveMsg}
          </div>
        )}

        {/* Compliance stats */}
        {total > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-48">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Compliance</span>
                  <span className="font-semibold text-gray-900">{compliancePercent}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${compliancePercent}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-4 text-sm flex-wrap">
                <span className="text-green-600 font-medium">{compliantCount} Compliant</span>
                <span className="text-red-600 font-medium">{nonCompliantCount} Non-Compliant</span>
                <span className="text-gray-400">{naCount} N/A</span>
                <span className="text-yellow-600">{pendingCount} Pending</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Checklist */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-gray-500">No checklist items found for this assessment.</p>
          <p className="text-sm text-gray-400 mt-1">Items are generated automatically by assessment type.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map(section => {
            const sectionItems = groups[section]
            const isCollapsed = collapsed[section]
            const sectionCompliant = sectionItems.filter(i => i.status === 'compliant').length
            const sectionTotal = sectionItems.filter(i => i.status !== 'inapplicable').length

            return (
              <div key={section} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isCollapsed ? <ChevronRight size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                    <span className="font-semibold text-gray-900">Section {section}</span>
                    <span className="text-sm text-gray-500">({sectionItems.length} items)</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {sectionCompliant}/{sectionTotal} compliant
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-gray-100">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-6 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-20">Item</th>
                          <th className="px-6 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                          <th className="px-6 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-52">Status</th>
                          <th className="px-6 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-64">Comments</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sectionItems.sort((a, b) => a.sort_order - b.sort_order).map(item => (
                          <tr key={item.id} className={`${item._dirty ? 'bg-blue-50/30' : 'hover:bg-gray-50'}`}>
                            <td className="px-6 py-3 text-sm font-mono text-gray-600">{item.item_number}</td>
                            <td className="px-6 py-3 text-sm text-gray-700">
                              {item.description}
                              {item.legal_ref && (
                                <span className="relative group ml-2 inline-flex">
                                  <button className="text-blue-400 hover:text-blue-600 text-xs font-bold w-4 h-4 rounded-full border border-current flex items-center justify-center" type="button">ⓘ</button>
                                  <span className="hidden group-hover:block absolute left-6 top-0 z-50 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-xl">
                                    {item.legal_ref}
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex gap-1">
                                {STATUS_BTN.map(btn => (
                                  <button
                                    key={btn.value}
                                    onClick={() => updateItem(item.id, 'status', btn.value)}
                                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                                      item.status === btn.value
                                        ? btn.colors
                                        : STATUS_INACTIVE[btn.value]
                                    }`}
                                    title={btn.value.replace('_', ' ')}
                                  >
                                    {btn.label}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <input
                                type="text"
                                value={item.comments || ''}
                                onChange={e => updateItem(item.id, 'comments', e.target.value)}
                                placeholder="Add comments..."
                                className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Bottom save bar */}
      {items.length > 0 && (
        <div className="sticky bottom-4 flex justify-end">
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
            {saveMsg && (
              <span className={`text-sm ${saveMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={15} />
              {saving ? 'Saving...' : 'Save All Items'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
