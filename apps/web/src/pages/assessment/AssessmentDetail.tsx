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

const STATUS_BTN: { value: ItemStatus; label: string; activeStyle: React.CSSProperties; inactiveStyle: React.CSSProperties }[] = [
  {
    value: 'compliant',
    label: 'C',
    activeStyle: { background: '#16A34A', color: 'white', border: '1px solid #16A34A' },
    inactiveStyle: { background: 'white', color: '#16A34A', border: '1px solid #86EFAC' },
  },
  {
    value: 'non_compliant',
    label: 'NC',
    activeStyle: { background: '#CC142B', color: 'white', border: '1px solid #CC142B' },
    inactiveStyle: { background: 'white', color: '#CC142B', border: '1px solid #FCA5A5' },
  },
  {
    value: 'inapplicable',
    label: 'N/A',
    activeStyle: { background: '#64748B', color: 'white', border: '1px solid #64748B' },
    inactiveStyle: { background: 'white', color: '#94A3B8', border: '1px solid #CBD5E1' },
  },
  {
    value: 'pending',
    label: '?',
    activeStyle: { background: '#F59E0B', color: 'white', border: '1px solid #F59E0B' },
    inactiveStyle: { background: 'white', color: '#D97706', border: '1px solid #FCD34D' },
  },
]

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

  const thStyle = { padding: '8px 24px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }

  return (
    <div style={{ background: 'var(--nz-bg)', minHeight: '100%' }} className="space-y-6 p-1">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link to="/assessment" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#64748B', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
          Assessments
        </Link>
        <span style={{ color: '#CBD5E1' }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--nz-navy)' }}>Assessment #{id}</span>
      </div>

      {/* Header card */}
      <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 24 }}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--nz-navy)', margin: 0 }}>
                {assessment.client_name || `Client #${assessment.client_id}`}
              </h2>
              <StatusBadge status={assessment.type} />
              <StatusBadge status={assessment.status} />
            </div>
            <p style={{ fontSize: 13, color: '#64748B' }}>
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
              style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid var(--nz-navy)', color: 'var(--nz-navy)', background: 'transparent', borderRadius: 10, fontWeight: 600, padding: '0 16px', height: 40, cursor: 'pointer', fontSize: 13, opacity: generating ? 0.6 : 1 }}
            >
              <FileText size={15} />
              {generating ? 'Generating...' : 'Generate Report'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 16px', height: 40, border: 'none', cursor: 'pointer', fontSize: 13, opacity: saving ? 0.6 : 1 }}
            >
              <Save size={15} />
              {saving ? 'Saving...' : 'Save All Items'}
            </button>
          </div>
        </div>

        {saveMsg && (
          <div style={{ marginTop: 12, fontSize: 13, padding: '8px 12px', borderRadius: 8, background: saveMsg.includes('success') ? '#DCFCE7' : '#FEF2F2', color: saveMsg.includes('success') ? '#16A34A' : 'var(--nz-red)' }}>
            {saveMsg}
          </div>
        )}

        {/* Compliance stats */}
        {total > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(0,36,125,0.08)' }}>
            <div className="flex items-center gap-4 flex-wrap">
              <div style={{ flex: 1, minWidth: 192 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>
                  <span>Compliance</span>
                  <span style={{ fontWeight: 700, color: 'var(--nz-navy)' }}>{compliancePercent}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: '#E2E8F0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${compliancePercent}%`, background: 'linear-gradient(to right, var(--nz-navy), var(--nz-light-blue))' }} />
                </div>
              </div>
              <div className="flex gap-4 text-sm flex-wrap">
                <span style={{ color: '#16A34A', fontWeight: 600, fontSize: 13 }}>{compliantCount} Compliant</span>
                <span style={{ color: 'var(--nz-red)', fontWeight: 600, fontSize: 13 }}>{nonCompliantCount} Non-Compliant</span>
                <span style={{ color: '#94A3B8', fontSize: 13 }}>{naCount} N/A</span>
                <span style={{ color: '#D97706', fontSize: 13 }}>{pendingCount} Pending</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Checklist */}
      {items.length === 0 ? (
        <div style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 32, textAlign: 'center' }}>
          <p style={{ color: '#94A3B8', fontSize: 14 }}>No checklist items found for this assessment.</p>
          <p style={{ color: '#CBD5E1', fontSize: 12, marginTop: 4 }}>Items are generated automatically by assessment type.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map(section => {
            const sectionItems = groups[section]
            const isCollapsed = collapsed[section]
            const sectionCompliant = sectionItems.filter(i => i.status === 'compliant').length
            const sectionTotal = sectionItems.filter(i => i.status !== 'inapplicable').length

            return (
              <div key={section} style={{ borderRadius: 16, background: 'white', boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', overflow: 'hidden' }}>
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isCollapsed
                      ? <ChevronRight size={18} style={{ color: '#94A3B8' }} />
                      : <ChevronDown size={18} style={{ color: '#94A3B8' }} />
                    }
                    <span style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 9999, padding: '2px 12px', fontSize: 12, fontWeight: 700 }}>
                      Section {section}
                    </span>
                    <span style={{ fontSize: 13, color: '#94A3B8' }}>({sectionItems.length} items)</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>
                    {sectionCompliant}/{sectionTotal} compliant
                  </div>
                </button>

                {!isCollapsed && (
                  <div style={{ borderTop: '1px solid rgba(0,36,125,0.08)' }}>
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: 'rgba(0,36,125,0.02)', borderBottom: '1px solid rgba(0,36,125,0.06)' }}>
                          <th style={{ ...thStyle, width: 80 }}>Item</th>
                          <th style={thStyle}>Description</th>
                          <th style={{ ...thStyle, width: 208 }}>Status</th>
                          <th style={{ ...thStyle, width: 256 }}>Comments</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionItems.sort((a, b) => a.sort_order - b.sort_order).map(item => (
                          <tr key={item.id}
                            style={{
                              minHeight: 52,
                              borderBottom: '1px solid rgba(0,36,125,0.04)',
                              background: item._dirty ? 'rgba(0,36,125,0.03)' : 'transparent',
                            }}
                            onMouseEnter={e => { if (!item._dirty) e.currentTarget.style.background = 'rgba(0,36,125,0.03)' }}
                            onMouseLeave={e => { if (!item._dirty) e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={{ padding: '10px 24px', fontSize: 12, fontFamily: 'monospace', color: '#64748B' }}>{item.item_number}</td>
                            <td style={{ padding: '10px 24px', fontSize: 13, color: '#1E293B' }}>
                              {item.description}
                              {item.legal_ref && (
                                <span style={{ position: 'relative', display: 'inline-flex', marginLeft: 8 }} className="group">
                                  <button style={{ color: 'var(--nz-light-blue)', fontSize: 11, fontWeight: 700, width: 16, height: 16, borderRadius: '50%', border: '1px solid currentColor', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} type="button">ⓘ</button>
                                  <span className="hidden group-hover:block absolute left-6 top-0 z-50 w-64 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-xl">
                                    {item.legal_ref}
                                  </span>
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 24px' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {STATUS_BTN.map(btn => (
                                  <button
                                    key={btn.value}
                                    onClick={() => updateItem(item.id, 'status', btn.value)}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      ...(item.status === btn.value ? btn.activeStyle : btn.inactiveStyle),
                                    }}
                                    title={btn.value.replace('_', ' ')}
                                  >
                                    {btn.label}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: '10px 24px' }}>
                              <input
                                type="text"
                                value={item.comments || ''}
                                onChange={e => updateItem(item.id, 'comments', e.target.value)}
                                placeholder="Add comments..."
                                style={{ width: '100%', padding: '4px 8px', fontSize: 12, border: '1.5px solid #CBD5E1', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }}
                                onFocus={e => (e.target.style.borderColor = 'var(--nz-navy)')}
                                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
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
        <div style={{ position: 'sticky', bottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ background: 'white', border: '1px solid rgba(0,36,125,0.10)', borderRadius: 14, boxShadow: '0 4px 16px rgba(0,36,125,0.12)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            {saveMsg && (
              <span style={{ fontSize: 13, color: saveMsg.includes('success') ? '#16A34A' : 'var(--nz-red)' }}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', fontSize: 14, opacity: saving ? 0.6 : 1 }}
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
