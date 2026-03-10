import { useEffect, useRef, useState, useCallback } from 'react'
import { Save, Trash2, Undo2, Redo2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, SitePlan } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Toast from '@/components/Toast'

interface PlanElement {
  id: string
  type: string
  x: number
  y: number
  label: string
  color: string
}

const ELEMENT_TYPES = [
  { type: 'storage_area', label: 'Storage Area', color: '#f97316' },
  { type: 'assembly_point', label: 'Assembly Point', color: '#22c55e' },
  { type: 'exit', label: 'Exit', color: '#3b82f6' },
  { type: 'extinguisher', label: 'Extinguisher', color: '#ef4444' },
  { type: 'sds_location', label: 'SDS Location', color: '#a855f7' },
  { type: 'hydrant', label: 'Hydrant', color: '#06b6d4' },
  { type: 'hazmat_zone', label: 'Hazmat Zone', color: '#eab308' },
]

const ELEM_W = 90
const ELEM_H = 50

function generateId() {
  return Math.random().toString(36).slice(2)
}

export default function SitePlannerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [elements, setElements] = useState<PlanElement[]>([])
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [selectedEl, setSelectedEl] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [planId, setPlanId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [history, setHistory] = useState<PlanElement[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isUndoRedo = useRef(false)

  useEffect(() => {
    api.get<Client[]>('/clients').then(setClients)
  }, [])

  useEffect(() => {
    if (!selectedClient) { setElements([]); setPlanId(null); return }
    setLoadingPlan(true)
    api.get<SitePlan[]>(`/site-plans?client_id=${selectedClient}`)
      .then(plans => {
        if (plans && plans.length > 0) {
          const plan = plans[0]
          setPlanId(plan.id)
          try {
            setElements(JSON.parse(plan.plan_data))
          } catch {
            setElements([])
          }
        } else {
          setElements([])
          setPlanId(null)
        }
      })
      .catch(() => { setElements([]); setPlanId(null) })
      .finally(() => setLoadingPlan(false))
  }, [selectedClient])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Grid
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
    }
    for (let y = 0; y <= canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
    }

    // Elements
    for (const el of elements) {
      const isSelected = el.id === selectedEl
      const radius = 6

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.15)'
      ctx.shadowBlur = isSelected ? 8 : 4
      ctx.shadowOffsetY = 2

      // Box
      ctx.beginPath()
      ctx.moveTo(el.x + radius, el.y)
      ctx.lineTo(el.x + ELEM_W - radius, el.y)
      ctx.arcTo(el.x + ELEM_W, el.y, el.x + ELEM_W, el.y + radius, radius)
      ctx.lineTo(el.x + ELEM_W, el.y + ELEM_H - radius)
      ctx.arcTo(el.x + ELEM_W, el.y + ELEM_H, el.x + ELEM_W - radius, el.y + ELEM_H, radius)
      ctx.lineTo(el.x + radius, el.y + ELEM_H)
      ctx.arcTo(el.x, el.y + ELEM_H, el.x, el.y + ELEM_H - radius, radius)
      ctx.lineTo(el.x, el.y + radius)
      ctx.arcTo(el.x, el.y, el.x + radius, el.y, radius)
      ctx.closePath()

      ctx.fillStyle = el.color
      ctx.fill()

      if (isSelected) {
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 2.5
        ctx.stroke()
      }

      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // Label
      ctx.fillStyle = 'white'
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Abbreviation
      const short = el.type.split('_').map(w => w[0].toUpperCase()).join('')
      ctx.font = 'bold 14px system-ui, sans-serif'
      ctx.fillText(short, el.x + ELEM_W / 2, el.y + ELEM_H / 2 - 7)

      ctx.font = '10px system-ui, sans-serif'
      ctx.fillText(el.label, el.x + ELEM_W / 2, el.y + ELEM_H / 2 + 8)
    }
  }, [elements, selectedEl])

  useEffect(() => { draw() }, [draw])

  const getElementAt = (x: number, y: number): PlanElement | null => {
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      if (x >= el.x && x <= el.x + ELEM_W && y >= el.y && y <= el.y + ELEM_H) {
        return el
      }
    }
    return null
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (selectedTool) {
      const toolDef = ELEMENT_TYPES.find(t => t.type === selectedTool)
      if (!toolDef) return
      const newEl: PlanElement = {
        id: generateId(),
        type: selectedTool,
        x: x - ELEM_W / 2,
        y: y - ELEM_H / 2,
        label: toolDef.label,
        color: toolDef.color,
      }
      setElements(prev => [...prev, newEl])
      setSelectedEl(newEl.id)
    } else {
      const el = getElementAt(x, y)
      setSelectedEl(el?.id ?? null)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const el = getElementAt(x, y)
    if (el) {
      setDragging({ id: el.id, offsetX: x - el.x, offsetY: y - el.y })
      setSelectedEl(el.id)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setElements(prev => prev.map(el =>
      el.id === dragging.id
        ? { ...el, x: Math.max(0, x - dragging.offsetX), y: Math.max(0, y - dragging.offsetY) }
        : el
    ))
  }

  const handleMouseUp = () => setDragging(null)

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const el = getElementAt(x, y)
    if (el) {
      const newLabel = window.prompt('Edit label:', el.label)
      if (newLabel !== null) {
        setElements(prev => prev.map(item =>
          item.id === el.id ? { ...item, label: newLabel } : item
        ))
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const el = getElementAt(x, y)
    if (el) {
      setElements(prev => prev.filter(item => item.id !== el.id))
      setSelectedEl(null)
    }
  }

  useEffect(() => {
    if (isUndoRedo.current) {
      isUndoRedo.current = false
      return
    }
    setHistory(prev => {
      const truncated = prev.slice(0, historyIndex + 1)
      const next = [...truncated, elements].slice(-20)
      return next
    })
    setHistoryIndex(prev => Math.min(prev + 1, 19))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements])

  const handleUndo = useCallback(() => {
    setHistoryIndex(prev => {
      if (prev <= 0) return prev
      const newIndex = prev - 1
      isUndoRedo.current = true
      setElements(history[newIndex])
      return newIndex
    })
  }, [history])

  const handleRedo = useCallback(() => {
    setHistoryIndex(prev => {
      if (prev >= history.length - 1) return prev
      const newIndex = prev + 1
      isUndoRedo.current = true
      setElements(history[newIndex])
      return newIndex
    })
  }, [history])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEl) {
        setElements(prev => prev.filter(el => el.id !== selectedEl))
        setSelectedEl(null)
      }
      if (e.key === 'Escape') { setSelectedTool(null); setSelectedEl(null) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedEl, handleUndo, handleRedo])

  const handleSave = async () => {
    if (!selectedClient) return
    setSaving(true)
    try {
      const planData = JSON.stringify(elements)
      if (planId) {
        await api.put(`/site-plans/${planId}`, {
          plan_data: planData,
          plan_name: `Site Plan - ${clients.find(c => String(c.id) === selectedClient)?.legal_name}`,
        })
      } else {
        const created = await api.post<SitePlan>('/site-plans', {
          client_id: Number(selectedClient),
          plan_name: `Site Plan - ${clients.find(c => String(c.id) === selectedClient)?.legal_name}`,
          plan_data: planData,
        })
        setPlanId(created.id)
      }
      setToast({ message: 'Site plan saved!', type: 'success' })
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Client:</label>
          <select
            value={selectedClient}
            onChange={e => setSelectedClient(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={14} />
            Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={14} />
            Redo
          </button>
          {elements.length > 0 && (
            <button
              onClick={() => { setElements([]); setSelectedEl(null) }}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200"
            >
              <Trash2 size={14} />
              Clear
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !selectedClient}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Toolbar */}
        <div className="w-44 shrink-0 bg-white rounded-xl shadow-sm p-3 space-y-1 self-start">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3 px-1">Place Element</p>
          <button
            onClick={() => setSelectedTool(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              !selectedTool ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Select / Move
          </button>
          {ELEMENT_TYPES.map(et => (
            <button
              key={et.type}
              onClick={() => setSelectedTool(selectedTool === et.type ? null : et.type)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedTool === et.type ? 'bg-gray-100 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span
                className="w-3 h-3 rounded shrink-0"
                style={{ background: et.color }}
              />
              {et.label}
            </button>
          ))}
          <div className="border-t border-gray-100 pt-2 mt-2">
            <p className="text-xs text-gray-400 px-1">Tips:</p>
            <p className="text-xs text-gray-400 px-1 mt-0.5">Right-click to delete</p>
            <p className="text-xs text-gray-400 px-1">Del key to remove selected</p>
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden">
          {loadingPlan ? (
            <LoadingSpinner message="Loading plan..." />
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                style={{
                  cursor: selectedTool ? 'crosshair' : dragging ? 'grabbing' : 'default',
                  display: 'block',
                  maxWidth: '100%',
                }}
                onClick={handleCanvasClick}
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={handleContextMenu}
                className="bg-slate-50"
              />
              {!selectedClient && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <p className="text-gray-400 text-sm">Select a client to start planning</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Legend</p>
        <div className="flex flex-wrap gap-3">
          {ELEMENT_TYPES.map(et => (
            <div key={et.type} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded shrink-0" style={{ background: et.color }} />
              <span className="text-xs text-gray-600">{et.label}</span>
            </div>
          ))}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
