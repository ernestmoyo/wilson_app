import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ClipboardCheck, Award, AlertTriangle, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { Client, Assessment, Certificate } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  bg: string
}

function StatCard({ label, value, icon, color, bg }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg}`}>
        <span className={color}>{icon}</span>
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
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

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          label="Total Clients"
          value={clients.length}
          icon={<Building2 size={22} />}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          label="Assessments This Month"
          value={thisMonthAssessments.length}
          icon={<ClipboardCheck size={22} />}
          color="text-yellow-600"
          bg="bg-yellow-50"
        />
        <StatCard
          label="Certificates Granted"
          value={grantedCerts.length}
          icon={<Award size={22} />}
          color="text-green-600"
          bg="bg-green-50"
        />
        <StatCard
          label="Expiring Soon"
          value={expiring.length}
          icon={<AlertTriangle size={22} />}
          color="text-orange-600"
          bg="bg-orange-50"
        />
        <StatCard
          label="Pending Decisions"
          value={pendingDecisions}
          icon={<Clock size={24} />}
          color="text-orange-600"
          bg="bg-orange-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Assessments */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Recent Assessments</h2>
            <Link to="/assessment" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="overflow-x-auto">
            {recentAssessments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No assessments yet</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentAssessments.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">
                        <Link to={`/assessment/${a.id}`} className="hover:text-blue-600">
                          {a.client_name || `Client #${a.client_id}`}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">
                        <StatusBadge status={a.type} />
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">
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

        {/* Expiring Certificates */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Expiring Soon</h2>
            <Link to="/certificates" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {expiring.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No certificates expiring soon</p>
            ) : (
              expiring.slice(0, 6).map(cert => (
                <div key={cert.id} className="px-6 py-3">
                  <Link to={`/certificates/${cert.id}`} className="block hover:text-blue-600">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {cert.client_name || `Client #${cert.client_id}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{cert.substance_class}</p>
                    {cert.expiry_date && (
                      <p className="text-xs text-orange-600 font-medium mt-0.5">
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
