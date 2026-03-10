import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ClipboardCheck, Award, AlertTriangle, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, Assessment, Certificate } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'

// Silver fern SVG inline (simple leaf shape)
const SilverFern = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2 C12 2 8 6 7 10 C6 14 9 17 12 22 C15 17 18 14 17 10 C16 6 12 2 12 2Z" fill="#C0C0C0" opacity="0.7"/>
    <path d="M12 8 C10 9 9 11 9 13" stroke="#C0C0C0" strokeWidth="0.5" fill="none"/>
    <path d="M12 8 C14 9 15 11 15 13" stroke="#C0C0C0" strokeWidth="0.5" fill="none"/>
  </svg>
)

function StatCard({
  label,
  value,
  icon,
  accentColor = 'var(--nz-navy)',
  iconBg = '#EEF2FF',
  iconColor = 'var(--nz-navy)',
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  accentColor?: string
  iconBg?: string
  iconColor?: string
}) {
  return (
    <div
      className="bg-white rounded-2xl p-6 flex items-center gap-4"
      style={{
        boxShadow: '0 2px 8px rgba(0,36,125,0.08)',
        border: '1px solid rgba(0,36,125,0.08)',
        borderTop: `3px solid ${accentColor}`,
      }}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <span style={{ color: iconColor }}>{icon}</span>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#94A3B8' }}>{label}</p>
        <p className="text-3xl font-bold" style={{ color: 'var(--nz-navy)' }}>{value}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [expiring, setExpiring] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()

    Promise.allSettled([
      api.get<Client[]>('/clients'),
      api.get<Assessment[]>('/assessments'),
      api.get<Certificate[]>('/certificates'),
      api.get<Certificate[]>('/certificates/expiring'),
    ]).then(([c, a, cert, exp]) => {
      if (c.status === 'fulfilled') setClients(c.value)
      if (a.status === 'fulfilled') setAssessments(a.value)
      if (cert.status === 'fulfilled') setCertificates(cert.value)
      if (exp.status === 'fulfilled') setExpiring(exp.value)
      setLoading(false)
    })

    void month
    void year
  }, [])

  const thisMonthAssessments = assessments.filter(a => {
    if (!a.inspection_date && !a.created_at) return false
    const d = new Date(a.inspection_date || a.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })

  const grantedCerts = certificates.filter(c => c.status === 'granted')
  const pendingDecisions = certificates.filter(c => c.status === 'pending').length
  const recentAssessments = [...assessments].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 5)

  if (loading) return <LoadingSpinner />

  const todayNZ = new Date().toLocaleDateString('en-NZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div>
      {/* Welcome heading */}
      <h2 style={{ color: 'var(--nz-navy)', fontSize: 32, fontWeight: 700, margin: 0 }}>
        Welcome back, Bryan.{' '}
        <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 8 }}>
          <SilverFern />
        </span>
      </h2>
      <p className="text-sm mt-1" style={{ color: '#94A3B8' }}>{todayNZ}</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mt-6">
        <StatCard
          label="Total Clients"
          value={clients.length}
          icon={<Building2 size={22} />}
          accentColor="var(--nz-navy)"
          iconBg="#EEF2FF"
          iconColor="var(--nz-navy)"
        />
        <StatCard
          label="Assessments This Month"
          value={thisMonthAssessments.length}
          icon={<ClipboardCheck size={22} />}
          accentColor="var(--nz-navy)"
          iconBg="#EEF2FF"
          iconColor="var(--nz-navy)"
        />
        <StatCard
          label="Certificates Granted"
          value={grantedCerts.length}
          icon={<Award size={22} />}
          accentColor="#16A34A"
          iconBg="#DCFCE7"
          iconColor="#16A34A"
        />
        <StatCard
          label="Expiring Soon"
          value={expiring.length}
          icon={<AlertTriangle size={22} />}
          accentColor="#CC142B"
          iconBg="#FEE2E2"
          iconColor="#CC142B"
        />
        <StatCard
          label="Pending Decisions"
          value={pendingDecisions}
          icon={<Clock size={22} />}
          accentColor="#F59E0B"
          iconBg="#FEF3C7"
          iconColor="#92400E"
        />
      </div>

      {/* Two-column detail grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Recent Assessments */}
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{
            boxShadow: '0 2px 8px rgba(0,36,125,0.08)',
            border: '1px solid rgba(0,36,125,0.08)',
          }}
        >
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(0,36,125,0.07)' }}
          >
            <h2 className="text-base font-semibold" style={{ color: 'var(--nz-navy)' }}>Recent Assessments</h2>
            <Link
              to="/assessment"
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--nz-light-blue)' }}
            >
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            {recentAssessments.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: '#94A3B8' }}>No assessments yet</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(0,36,125,0.07)' }}>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Client</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Type</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAssessments.map(a => (
                    <tr
                      key={a.id}
                      style={{ borderBottom: '1px solid rgba(0,36,125,0.04)' }}
                      className="hover:bg-blue-50/30 transition-colors"
                    >
                      <td className="px-6 py-3 text-sm font-medium">
                        <Link
                          to={`/assessment/${a.id}`}
                          className="hover:underline"
                          style={{ color: 'var(--nz-navy)' }}
                        >
                          {a.client_name || `Client #${a.client_id}`}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-sm">
                        <StatusBadge status={a.type} />
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-6 py-3 text-sm" style={{ color: '#64748B' }}>
                        {a.inspection_date
                          ? new Date(a.inspection_date).toLocaleDateString('en-NZ')
                          : new Date(a.created_at).toLocaleDateString('en-NZ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Expiring Soon */}
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{
            boxShadow: '0 2px 8px rgba(0,36,125,0.08)',
            border: '1px solid rgba(0,36,125,0.08)',
          }}
        >
          <div
            className="px-6 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid rgba(0,36,125,0.07)' }}
          >
            <h2 className="text-base font-semibold" style={{ color: 'var(--nz-navy)' }}>Expiring Soon</h2>
            <Link
              to="/certificates"
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--nz-light-blue)' }}
            >
              View all
            </Link>
          </div>
          <div>
            {expiring.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: '#94A3B8' }}>No certificates expiring soon</p>
            ) : (
              expiring.slice(0, 6).map(cert => (
                <div
                  key={cert.id}
                  className="px-6 py-3 hover:bg-blue-50/30 transition-colors"
                  style={{ borderBottom: '1px solid rgba(0,36,125,0.04)' }}
                >
                  <Link to={`/certificates/${cert.id}`} className="block">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--nz-navy)' }}>
                      {cert.client_name || `Client #${cert.client_id}`}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{cert.substance_class}</p>
                    {cert.expiry_date && (
                      <p className="text-xs font-medium mt-0.5" style={{ color: '#CC142B' }}>
                        Expires {new Date(cert.expiry_date).toLocaleDateString('en-NZ')}
                      </p>
                    )}
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
