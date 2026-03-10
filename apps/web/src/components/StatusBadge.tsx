interface StatusBadgeProps {
  status: string
  className?: string
}

const STATUS_COLORS: Record<string, string> = {
  compliant: 'bg-green-100 text-green-800',
  non_compliant: 'bg-red-100 text-red-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  draft: 'bg-gray-100 text-gray-700',
  pending: 'bg-blue-100 text-blue-800',
  granted: 'bg-green-100 text-green-800',
  refused: 'bg-red-100 text-red-800',
  expired: 'bg-orange-100 text-orange-800',
  inapplicable: 'bg-gray-100 text-gray-500',
  completed: 'bg-green-100 text-green-800',
  validation: 'bg-purple-100 text-purple-800',
  pre_inspection: 'bg-blue-100 text-blue-800',
  site_inspection: 'bg-indigo-100 text-indigo-800',
}

const STATUS_LABELS: Record<string, string> = {
  non_compliant: 'Non-Compliant',
  in_progress: 'In Progress',
  pre_inspection: 'Pre-Inspection',
  site_inspection: 'Site Inspection',
  inapplicable: 'N/A',
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'
  const label = STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors} ${className}`}>
      {label}
    </span>
  )
}
