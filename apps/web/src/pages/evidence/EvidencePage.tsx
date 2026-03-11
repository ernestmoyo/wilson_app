import { useEffect, useState } from 'react'
import { Camera, Upload, Trash2, Download, MapPin, FileText, Image } from 'lucide-react'
import { api } from '@/lib/api'
import { Evidence } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import Modal from '@/components/Modal'

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

export default function EvidencePage() {
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState('')

  const loadEvidence = () => {
    setLoading(true)
    api.get<Evidence[]>('/evidence')
      .then(setEvidence)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadEvidence() }, [])

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)

    setUploading(true)
    try {
      const res = await fetch('/api/evidence', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      setShowUpload(false)
      form.reset()
      loadEvidence()
    } catch {
      alert('Failed to upload evidence')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this evidence file?')) return
    try {
      await api.delete(`/evidence/${id}`)
      setEvidence(prev => prev.filter(e => e.id !== id))
    } catch {
      alert('Failed to delete')
    }
  }

  const filtered = filter
    ? evidence.filter(e => e.evidence_type === filter)
    : evidence

  const getIcon = (type: string) => {
    if (type === 'photo') return <Image size={16} />
    return <FileText size={16} />
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--nz-navy)' }}>Evidence Library</h2>
          <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>
            {evidence.length} files stored with SHA-256 integrity hashes
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
          style={{ background: 'var(--nz-navy)' }}
        >
          <Upload size={16} /> Upload Evidence
        </button>
      </div>

      {/* Filter */}
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

      {/* Evidence grid */}
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.08)' }}
      >
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Camera size={48} className="mx-auto mb-3" style={{ color: '#CBD5E1' }} />
            <p className="text-sm" style={{ color: '#94A3B8' }}>No evidence files yet</p>
            <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>Upload photos, documents, and certificates</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,36,125,0.07)' }}>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>File</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Description</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Location</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Hash</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Date</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ev => (
                <tr key={ev.id} style={{ borderBottom: '1px solid rgba(0,36,125,0.04)' }} className="hover:bg-blue-50/30 transition-colors">
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
                    {ev.description || '—'}
                  </td>
                  <td className="px-6 py-3">
                    {ev.gps_latitude && ev.gps_longitude ? (
                      <span className="flex items-center gap-1 text-xs" style={{ color: '#16A34A' }}>
                        <MapPin size={12} />
                        {ev.gps_latitude.toFixed(4)}, {ev.gps_longitude.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: '#CBD5E1' }}>No GPS</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {ev.sha256_hash ? (
                      <span className="text-xs font-mono" style={{ color: '#94A3B8' }} title={ev.sha256_hash}>
                        {ev.sha256_hash.substring(0, 12)}...
                      </span>
                    ) : '—'}
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
                        className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                        title="Download"
                      >
                        <Download size={14} style={{ color: '#64748B' }} />
                      </a>
                      <button
                        onClick={() => handleDelete(ev.id)}
                        className="p-1.5 rounded hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} style={{ color: '#EF4444' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload Modal */}
      <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload Evidence">
        <form onSubmit={handleUpload} className="space-y-4" encType="multipart/form-data">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File *</label>
            <input type="file" name="file" required className="w-full text-sm" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Evidence Type</label>
            <select name="evidence_type" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {EVIDENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input type="text" name="description" placeholder="What does this evidence show?" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
            <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-6 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
              style={{ background: 'var(--nz-navy)' }}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
