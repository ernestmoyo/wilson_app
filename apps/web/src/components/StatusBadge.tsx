interface StatusBadgeProps {
  status: string
  className?: string
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  compliant:      { bg: '#DCFCE7', text: '#16A34A', label: 'Compliant' },
  non_compliant:  { bg: '#FEE2E2', text: '#CC142B', label: 'Non-Compliant' },
  in_progress:    { bg: '#DBEAFE', text: '#00247D', label: 'In Progress' },
  draft:          { bg: '#F1F5F9', text: '#64748B', label: 'Draft' },
  pending:        { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  granted:        { bg: '#DCFCE7', text: '#16A34A', label: 'Granted' },
  refused:        { bg: '#FEE2E2', text: '#CC142B', label: 'Refused' },
  expired:        { bg: '#F1F5F9', text: '#64748B', label: 'Expired' },
  inapplicable:   { bg: '#F1F5F9', text: '#94A3B8', label: 'N/A' },
  completed:      { bg: '#DCFCE7', text: '#16A34A', label: 'Completed' },
  validation:     { bg: '#F3E8FF', text: '#7C3AED', label: 'Validation' },
  pre_inspection: { bg: '#DBEAFE', text: '#00247D', label: 'Pre-Inspection' },
  site_inspection:{ bg: '#E0E7FF', text: '#3730A3', label: 'Site Inspection' },
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? { bg: '#F1F5F9', text: '#64748B', label: status.charAt(0).toUpperCase() + status.slice(1) }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${className}`}
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  )
}
