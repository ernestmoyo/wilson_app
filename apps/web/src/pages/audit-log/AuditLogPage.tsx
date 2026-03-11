import { useEffect, useState } from 'react'
import { Shield, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { AuditLogEntry } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  created: { bg: '#DCFCE7', text: '#16A34A' },
  updated: { bg: '#DBEAFE', text: '#2563EB' },
  deleted: { bg: '#FEE2E2', text: '#DC2626' },
  refused: { bg: '#FEE2E2', text: '#DC2626' },
  converted: { bg: '#EDE9FE', text: '#7C3AED' },
  granted: { bg: '#DCFCE7', text: '#16A34A' },
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [entityFilter, setEntityFilter] = useState('')

  const loadLog = () => {
    setLoading(true)
    const params = entityFilter ? `?entity_type=${entityFilter}` : ''
    api.get<AuditLogEntry[]>(`/audit-log${params}`)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadLog() }, [entityFilter])

  const entityTypes = [...new Set(entries.map(e => e.entity_type))].sort()

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--nz-navy)' }}>Audit Log</h2>
          <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
            Tamper-evident record of all system actions — {entries.length} entries
          </p>
        </div>
        <button
          onClick={loadLog}
          className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Entity type filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setEntityFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!entityFilter ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          All
        </button>
        {entityTypes.map(t => (
          <button
            key={t}
            onClick={() => setEntityFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${entityFilter === t ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Log table */}
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.08)' }}
      >
        {entries.length === 0 ? (
          <div className="text-center py-12">
            <Shield size={48} className="mx-auto mb-3" style={{ color: '#CBD5E1' }} />
            <p className="text-sm" style={{ color: '#94A3B8' }}>No audit log entries yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,36,125,0.07)' }}>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Action</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Entity</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>User</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const colors = ACTION_COLORS[entry.action] || { bg: '#F1F5F9', text: '#475569' }
                let details = ''
                try {
                  if (entry.details) {
                    const d = JSON.parse(entry.details)
                    details = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(', ')
                  }
                } catch {
                  details = entry.details || ''
                }

                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid rgba(0,36,125,0.04)' }} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-6 py-3 text-sm font-mono" style={{ color: '#64748B' }}>
                      {new Date(entry.created_at).toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize"
                        style={{ background: colors.bg, color: colors.text }}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm capitalize" style={{ color: 'var(--nz-navy)' }}>
                      {entry.entity_type} #{entry.entity_id}
                    </td>
                    <td className="px-6 py-3 text-sm" style={{ color: '#64748B' }}>
                      {entry.user_name || (entry.user_id ? `User #${entry.user_id}` : 'System')}
                    </td>
                    <td className="px-6 py-3 text-sm truncate max-w-[300px]" style={{ color: '#94A3B8' }}>
                      {details || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
