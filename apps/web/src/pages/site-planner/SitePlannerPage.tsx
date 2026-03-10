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
  const [savedOnce, setSavedOnce] = useState(false)

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

    // Grid — NZ light blue
    ctx.strokeStyle = '#EEF2FF'
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
      setSavedOnce(true)
      setToast({ message: 'Site plan saved!', type: 'success' })
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const LEGAL_REQUIREMENTS = [
    { type: 'storage_area',    label: 'At least one Storage Area (HSL) placed on plan',          ref: 'reg 10.26(4)(b)(i)',  required: true },
    { type: 'hazmat_zone',     label: 'At least one Hazmat Zone (Hazardous Area) placed on plan', ref: 'reg 10.26(4)(b)(ii)', required: true },
    { type: 'exit',            label: 'At least one Exit marked',                                 ref: 'reg 5.7',             required: false },
    { type: 'assembly_point',  label: 'At least one Assembly Point marked',                       ref: 'reg 5.7(3)(a)',       required: false },
    { type: 'extinguisher',    label: 'At least one Extinguisher location marked',                ref: 'reg 5.3',             required: false },
    { type: 'sds_location',    label: 'At least one SDS Location marked',                         ref: 'reg 2.11(3)',         required: false },
  ];

  const unmetRequired = LEGAL_REQUIREMENTS.filter(req => req.required && !elements.some(e => e.type === req.type));
  const unmetAll = LEGAL_REQUIREMENTS.filter(req => !elements.some(e => e.type === req.type));
  const legalSaveBlocked = unmetRequired.length > 0;

  // Save button style: green when requirements met, grey when blocked
  const saveButtonStyle: React.CSSProperties = saving || !selectedClient || legalSaveBlocked
    ? { background: '#94A3B8', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: 8, opacity: 0.6 }
    : { background: '#16A34A', color: 'white', borderRadius: 10, fontWeight: 600, padding: '0 20px', height: 40, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }

  const secondaryBtnStyle: React.CSSProperties = {
    background: 'white',
    color: 'var(--nz-navy)',
    border: '1.5px solid var(--nz-navy)',
    borderRadius: 8,
    fontWeight: 500,
    padding: '0 12px',
    height: 34,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
  }

  const secondaryBtnDisabledStyle: React.CSSProperties = {
    ...secondaryBtnStyle,
    opacity: 0.4,
    cursor: 'not-allowed',
    borderColor: '#CBD5E1',
    color: '#94A3B8',
  }

  return (
    <div className="space-y-4" style={{ background: 'var(--nz-bg)', minHeight: '100%', padding: 0 }}>
      {/* Controls bar */}
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 16 }} className="flex items-center gap-4 flex-wrap">
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
            style={historyIndex <= 0 ? secondaryBtnDisabledStyle : secondaryBtnStyle}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={14} />
            Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            style={historyIndex >= history.length - 1 ? secondaryBtnDisabledStyle : secondaryBtnStyle}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={14} />
            Redo
          </button>
          {elements.length > 0 && (
            <button
              onClick={() => { setElements([]); setSelectedEl(null) }}
              style={{ ...secondaryBtnStyle, color: 'var(--nz-red)', borderColor: 'var(--nz-red)' }}
            >
              <Trash2 size={14} />
              Clear
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !selectedClient || legalSaveBlocked}
            title={legalSaveBlocked ? 'Plan does not meet minimum legal requirements (reg 10.26)' : undefined}
            style={saveButtonStyle}
          >
            <Save size={15} />
            {saving ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Tool palette panel */}
        <div style={{ width: 176, flexShrink: 0, background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 12, alignSelf: 'flex-start' }}>
          <p style={{ color: 'var(--nz-navy)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, paddingLeft: 4 }}>Elements</p>
          {/* Select/Move tool */}
          <button
            onClick={() => setSelectedTool(null)}
            style={!selectedTool
              ? { width: '100%', textAlign: 'left', borderRadius: 10, border: '1.5px solid var(--nz-navy)', background: 'rgba(0,36,125,0.04)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 4 }
              : { width: '100%', textAlign: 'left', borderRadius: 10, border: '1.5px solid #E2E8F0', background: 'white', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 4, color: '#475569' }
            }
          >
            Select / Move
          </button>
          {ELEMENT_TYPES.map(et => (
            <button
              key={et.type}
              onClick={() => setSelectedTool(selectedTool === et.type ? null : et.type)}
              style={selectedTool === et.type
                ? { width: '100%', textAlign: 'left', borderRadius: 10, border: '1.5px solid var(--nz-navy)', background: 'rgba(0,36,125,0.04)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 4, transition: 'border-color 150ms' }
                : { width: '100%', textAlign: 'left', borderRadius: 10, border: '1.5px solid #E2E8F0', background: 'white', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 4, color: '#475569', transition: 'border-color 150ms' }
              }
              onMouseEnter={e => { if (selectedTool !== et.type) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--nz-navy)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,36,125,0.04)' } }}
              onMouseLeave={e => { if (selectedTool !== et.type) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLButtonElement).style.background = 'white' } }}
            >
              <span
                style={{ width: 10, height: 10, borderRadius: '50%', background: et.color, flexShrink: 0 }}
              />
              {et.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid #EEF2FF', paddingTop: 8, marginTop: 8 }}>
            <p className="text-xs text-gray-400 px-1">Tips:</p>
            <p className="text-xs text-gray-400 px-1 mt-0.5">Right-click to delete</p>
            <p className="text-xs text-gray-400 px-1">Del key to remove selected</p>
          </div>
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', overflow: 'hidden', background: 'white' }}>
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
                  background: 'white',
                }}
                onClick={handleCanvasClick}
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={handleContextMenu}
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
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 16 }}>
        <p style={{ color: 'var(--nz-navy)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Legend</p>
        <div className="flex flex-wrap gap-3">
          {ELEMENT_TYPES.map(et => (
            <div key={et.type} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded shrink-0" style={{ background: et.color }} />
              <span className="text-xs text-gray-600">{et.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Site Plan Legal Compliance Checklist */}
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,36,125,0.08)', border: '1px solid rgba(0,36,125,0.10)', padding: 16 }}>
        <p style={{ color: 'var(--nz-navy)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Site Plan Legal Compliance Checklist</p>
        <ul className="space-y-2">
          {LEGAL_REQUIREMENTS.map(req => {
            const met = elements.some(e => e.type === req.type);
            return (
              <li key={req.type} className="flex items-start gap-2">
                {met ? (
                  <span style={{ fontWeight: 700, color: '#16A34A', flexShrink: 0, fontSize: 14 }}>✓</span>
                ) : req.required ? (
                  <span style={{ fontWeight: 700, color: 'var(--nz-red)', flexShrink: 0, fontSize: 14 }}>✗</span>
                ) : (
                  <span style={{ fontWeight: 700, color: '#F59E0B', flexShrink: 0, fontSize: 14 }}>✗</span>
                )}
                <span style={{ fontSize: 13, fontWeight: 500, color: met ? '#16A34A' : req.required ? 'var(--nz-red)' : '#F59E0B' }}>
                  {req.label}
                </span>
                <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 4, flexShrink: 0 }}>{req.ref}</span>
              </li>
            );
          })}
        </ul>
        {savedOnce && unmetAll.length > 0 && (
          <div style={{ marginTop: 12, background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 12, padding: '12px 16px', color: '#92400E', fontSize: 13 }}>
            ⚠ This site plan may not fully comply with reg 10.26(4)(b). Missing: {unmetAll.map(r => r.label).join(', ')}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
