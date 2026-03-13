import { useEffect, useState, useCallback } from 'react'
import { Upload, Trash2, Download, FileText, Image, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, Evidence } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import Modal from '@/components/Modal'
import Toast from '@/components/Toast'

const EVIDENCE_TYPES = [
  { value: 'photo', label: 'Photo' },
  { value: 'document', label: 'Document' },
  { value: 'calculation', label: 'Calculation' },
  { value: 'engineer_cert', label: 'Engineer Certificate' },
  { value: 'sds', label: 'Safety Data Sheet' },
  { value: 'site_plan', label: 'Site Plan' },
  { value: 'erp', label: 'Emergency Response Plan' },
  { value: 'training_record', label: 'Training Record' },
  { value: 'id_document', label: 'ID Document' },
  { value: 'other', label: 'Other' },
]

const APPENDIX_CATEGORIES = [
  { value: 'erp', label: 'Emergency Response Plan', number: 1 },
  { value: 'fire_extinguishers', label: 'Fire Extinguishers', number: 2 },
  { value: 'inventory_register', label: 'Inventory Register', number: 3 },
  { value: 'pictures', label: 'Pictures', number: 4 },
  { value: 'ppe_register', label: 'PPE Register', number: 5 },
  { value: 'sds', label: 'Safety Data Sheets', number: 6 },
  { value: 'security', label: 'Security', number: 7 },
  { value: 'signage', label: 'Signage', number: 8 },
  { value: 'site_plan', label: 'Site Plan', number: 9 },
  { value: 'training', label: 'Training & Supervision', number: 10 },
  { value: 'worksafe_notification', label: 'WorkSafe Notification', number: 11 },
]

type ViewTab = 'appendix' | 'all'

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 16,
  boxShadow: '0 2px 8px rgba(0,36,125,0.08)',
  border: '1px solid rgba(0,36,125,0.10)',
  padding: 24,
}

const thStyle: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 600,
}

export default function EvidencePage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<ViewTab>('appendix')
  const [expandedAppendices, setExpandedAppendices] = useState<Set<string>>(new Set())
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients)
  }, [])

  const fetchEvidence = useCallback(async (clientId: string) => {
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      const items = await api.get<Evidence[]>(`/evidence?client_id=${clientId}`)
      setEvidence(items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load evidence')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedClient) fetchEvidence(selectedClient)
    else setEvidence([])
  }, [selectedClient, fetchEvidence])

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    if (selectedClient) {
      formData.set('client_id', selectedClient)
    }

    setUploading(true)
    try {
      const res = await fetch('/api/evidence', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      setShowUpload(false)
      form.reset()
      fetchEvidence(selectedClient)
      setToast({ message: 'Evidence uploaded successfully!', type: 'success' })
    } catch {
      setToast({ message: 'Failed to upload evidence', type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this evidence file?')) return
    try {
      await api.delete(`/evidence/${id}`)
      setEvidence(prev => prev.filter(e => e.id !== id))
      setToast({ message: 'Evidence deleted', type: 'success' })
    } catch {
      setToast({ message: 'Failed to delete', type: 'error' })
    }
  }

  const toggleAppendix = (category: string) => {
    setExpandedAppendices(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const getFilesByAppendix = (category: string) =>
    evidence.filter(e => e.appendix_category === category)

  const filteredEvidence = filter
    ? evidence.filter(e => e.evidence_type === filter)
    : evidence

  const getIcon = (type: string) => {
    if (type === 'photo') return <Image size={16} />
    return <FileText size={16} />
  }

  const getAppendixLabel = (value: string) => {
    const cat = APPENDIX_CATEGORIES.find(c => c.value === value)
    return cat ? `${cat.number}: ${cat.label}` : value
  }

  return (
    <div className="space-y-6">
      {/* Client selector */}
      <div style={cardStyle} className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 shrink-0">Select Client:</label>
        <select
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Choose a client...</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
        </select>
        {selectedClient && (
          <button
            onClick={() => setShowUpload(true)}
            style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            className="ml-auto"
          >
            <Upload size={15} />
            Upload Evidence
          </button>
        )}
      </div>

      {!selectedClient ? (
        <div style={cardStyle} className="py-16 text-center">
          <p className="text-gray-400">Select a client to view and manage their evidence library.</p>
        </div>
      ) : loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} onRetry={() => fetchEvidence(selectedClient)} />
      ) : (
        <>
          {/* Header with tabs */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--nz-navy)' }}>Evidence Library</h2>
              <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
                {evidence.length} file{evidence.length !== 1 ? 's' : ''} stored with SHA-256 integrity hashes
              </p>
            </div>
            {/* View tabs */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(0,36,125,0.15)' }}>
              <button
                onClick={() => setActiveTab('appendix')}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  background: activeTab === 'appendix' ? 'var(--nz-navy)' : 'white',
                  color: activeTab === 'appendix' ? 'white' : 'var(--nz-navy)',
                }}
              >
                Appendix View
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  background: activeTab === 'all' ? 'var(--nz-navy)' : 'white',
                  color: activeTab === 'all' ? 'white' : 'var(--nz-navy)',
                  borderLeft: '1px solid rgba(0,36,125,0.15)',
                }}
              >
                All Evidence
              </button>
            </div>
          </div>

          {/* Appendix View */}
          {activeTab === 'appendix' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {APPENDIX_CATEGORIES.map(cat => {
                const files = getFilesByAppendix(cat.value)
                const isExpanded = expandedAppendices.has(cat.value)
                return (
                  <div
                    key={cat.value}
                    style={{
                      ...cardStyle,
                      padding: 0,
                      gridColumn: isExpanded ? '1 / -1' : undefined,
                    }}
                  >
                    {/* Card header */}
                    <button
                      onClick={() => toggleAppendix(cat.value)}
                      className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-blue-50/30"
                      style={{ borderRadius: isExpanded ? '16px 16px 0 0' : 16 }}
                    >
                      <span
                        className="flex items-center justify-center rounded-lg text-sm font-bold shrink-0"
                        style={{
                          width: 36,
                          height: 36,
                          background: 'rgba(0,36,125,0.08)',
                          color: 'var(--nz-navy)',
                        }}
                      >
                        {cat.number}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold" style={{ color: 'var(--nz-navy)' }}>
                          {cat.label}
                        </span>
                      </div>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background: files.length > 0 ? 'rgba(0,36,125,0.08)' : '#F1F5F9',
                          color: files.length > 0 ? 'var(--nz-navy)' : '#94A3B8',
                        }}
                      >
                        {files.length}
                      </span>
                      {isExpanded
                        ? <ChevronDown size={16} style={{ color: '#94A3B8' }} />
                        : <ChevronRight size={16} style={{ color: '#94A3B8' }} />
                      }
                    </button>

                    {/* Expanded file list */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid rgba(0,36,125,0.07)' }}>
                        {files.length === 0 ? (
                          <div className="text-center py-8">
                            <FolderOpen size={32} className="mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                            <p className="text-sm" style={{ color: '#94A3B8' }}>No files in this appendix</p>
                          </div>
                        ) : (
                          <table className="w-full">
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(0,36,125,0.07)' }}>
                                <th className="px-6 py-3 text-left" style={thStyle}>File</th>
                                <th className="px-6 py-3 text-left" style={thStyle}>Type</th>
                                <th className="px-6 py-3 text-left" style={thStyle}>Description</th>
                                <th className="px-6 py-3 text-left" style={thStyle}>Location Area</th>
                                <th className="px-6 py-3 text-left" style={thStyle}>Date</th>
                                <th className="px-6 py-3 text-right" style={thStyle}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {files.map(ev => (
                                <tr
                                  key={ev.id}
                                  style={{ borderBottom: '1px solid rgba(0,36,125,0.04)' }}
                                  className="transition-colors"
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                                >
                                  <td className="px-6 py-3">
                                    <div className="flex items-center gap-2">
                                      {getIcon(ev.evidence_type)}
                                      <span className="text-sm font-medium truncate max-w-[200px]" style={{ color: 'var(--nz-navy)' }}>{ev.file_name}</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-3">
                                    <StatusBadge status={ev.evidence_type} />
                                  </td>
                                  <td className="px-6 py-3 text-sm" style={{ color: '#64748B' }}>
                                    {ev.description || '\u2014'}
                                  </td>
                                  <td className="px-6 py-3 text-sm" style={{ color: '#64748B' }}>
                                    {ev.location_area || '\u2014'}
                                  </td>
                                  <td className="px-6 py-3 text-sm" style={{ color: '#64748B' }}>
                                    {new Date(ev.created_at).toLocaleDateString('en-NZ')}
                                  </td>
                                  <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <a
                                        href={`/api/evidence/${ev.id}/file`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 rounded transition-colors"
                                        style={{ color: '#64748B', background: 'transparent' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,36,125,0.08)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
                                        title="Download"
                                      >
                                        <Download size={14} />
                                      </a>
                                      <button
                                        onClick={() => handleDelete(ev.id)}
                                        className="p-1.5 rounded transition-colors"
                                        style={{ color: 'var(--nz-red, #EF4444)', background: 'transparent' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(204,20,43,0.08)' }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
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
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* All Evidence View */}
          {activeTab === 'all' && (
            <>
              {/* Type filter pills */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setFilter('')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filter ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  All ({evidence.length})
                </button>
                {EVIDENCE_TYPES.map(t => {
                  const count = evidence.filter(e => e.evidence_type === t.value).length
                  if (count === 0) return null
                  return (
                    <button
                      key={t.value}
                      onClick={() => setFilter(t.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === t.value ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {t.label} ({count})
                    </button>
                  )
                })}
              </div>

              {/* Flat table */}
              <div style={cardStyle} className="overflow-hidden">
                {filteredEvidence.length === 0 ? (
                  <div className="text-center py-16">
                    <FolderOpen size={48} className="mx-auto mb-3" style={{ color: '#CBD5E1' }} />
                    <p className="text-sm" style={{ color: '#94A3B8' }}>No evidence files yet</p>
                    <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>Upload photos, documents, and certificates</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left" style={thStyle}>File</th>
                          <th className="px-6 py-3 text-left" style={thStyle}>Type</th>
                          <th className="px-6 py-3 text-left" style={thStyle}>Appendix</th>
                          <th className="px-6 py-3 text-left" style={thStyle}>Description</th>
                          <th className="px-6 py-3 text-left" style={thStyle}>Location Area</th>
                          <th className="px-6 py-3 text-left" style={thStyle}>Hash</th>
                          <th className="px-6 py-3 text-left" style={thStyle}>Date</th>
                          <th className="px-6 py-3 text-right" style={thStyle}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredEvidence.map(ev => (
                          <tr
                            key={ev.id}
                            style={{ height: 52 }}
                            className="transition-colors"
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,36,125,0.03)')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                          >
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2">
                                {getIcon(ev.evidence_type)}
                                <span className="text-sm font-medium truncate max-w-[200px]" style={{ color: 'var(--nz-navy)' }}>{ev.file_name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <StatusBadge status={ev.evidence_type} />
                            </td>
                            <td className="px-6 py-3 text-sm" style={{ color: '#64748B' }}>
                              {ev.appendix_category
                                ? getAppendixLabel(ev.appendix_category)
                                : '\u2014'}
                            </td>
                            <td className="px-6 py-3 text-sm" style={{ color: '#64748B' }}>
                              {ev.description || '\u2014'}
                            </td>
                            <td className="px-6 py-3 text-sm" style={{ color: '#64748B' }}>
                              {ev.location_area || '\u2014'}
                            </td>
                            <td className="px-6 py-3">
                              {ev.sha256_hash ? (
                                <span className="text-xs font-mono" style={{ color: '#94A3B8' }} title={ev.sha256_hash}>
                                  {ev.sha256_hash.substring(0, 12)}...
                                </span>
                              ) : '\u2014'}
                            </td>
                            <td className="px-6 py-3 text-sm" style={{ color: '#64748B' }}>
                              {new Date(ev.created_at).toLocaleDateString('en-NZ')}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <a
                                  href={`/api/evidence/${ev.id}/file`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded transition-colors"
                                  style={{ color: '#64748B', background: 'transparent' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(0,36,125,0.08)' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
                                  title="Download"
                                >
                                  <Download size={14} />
                                </a>
                                <button
                                  onClick={() => handleDelete(ev.id)}
                                  className="p-1.5 rounded transition-colors"
                                  style={{ color: 'var(--nz-red, #EF4444)', background: 'transparent' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(204,20,43,0.08)' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
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
            </>
          )}
        </>
      )}

      {/* Upload Modal */}
      <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload Evidence" size="lg">
        <form onSubmit={handleUpload} className="space-y-4" encType="multipart/form-data">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
            <input type="file" name="file" required className="w-full text-sm" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              name="description"
              placeholder="What does this evidence show?"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Evidence Type</label>
              <select
                name="evidence_type"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {EVIDENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Appendix Category</label>
              <select
                name="appendix_category"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select category...</option>
                {APPENDIX_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.number}: {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location Area</label>
            <input
              type="text"
              name="location_area"
              placeholder="e.g. Coolroom 2, Main Warehouse"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GPS Latitude</label>
              <input type="number" step="any" name="gps_latitude" placeholder="-36.8485" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GPS Longitude</label>
              <input type="number" step="any" name="gps_longitude" placeholder="174.7633" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Captured By</label>
            <input type="text" name="captured_by" placeholder="Inspector name" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowUpload(false)}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              style={{ background: 'var(--nz-navy)', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
