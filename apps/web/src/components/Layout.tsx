import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Building2, ClipboardCheck, Award, Package, Map, FileText } from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/clients', icon: Building2, label: 'Clients' },
  { to: '/assessment', icon: ClipboardCheck, label: 'Assessment' },
  { to: '/certificates', icon: Award, label: 'Certificates' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/site-planner', icon: Map, label: 'Site Planner' },
  { to: '/reports', icon: FileText, label: 'Reports' },
]

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard'
  if (pathname.startsWith('/clients/')) return 'Client Details'
  if (pathname.startsWith('/clients')) return 'Clients'
  if (pathname === '/assessment/new') return 'New Assessment'
  if (pathname.startsWith('/assessment/')) return 'Assessment Detail'
  if (pathname.startsWith('/assessment')) return 'Assessment'
  if (pathname.startsWith('/certificates/')) return 'Certificate Detail'
  if (pathname.startsWith('/certificates')) return 'Certificates'
  if (pathname.startsWith('/inventory')) return 'Inventory'
  if (pathname.startsWith('/site-planner')) return 'Site Planner'
  if (pathname.startsWith('/reports')) return 'Reports'
  return 'Wilson Suite'
}

export default function Layout() {
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex flex-col shrink-0"
        style={{ width: 240, background: '#0f172a' }}
      >
        {/* Brand */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ background: '#2563eb' }}
            >
              W
            </div>
            <span className="text-white font-bold text-lg tracking-tight">Wilson Suite</span>
          </div>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>NZ Hazardous Substances</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Certifier info */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: '#1e40af' }}
            >
              BW
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">Bryan Wilson</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                <span className="text-xs" style={{ color: '#94a3b8' }}>Active Certifier</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-semibold text-gray-900">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Bryan Wilson</span>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: '#2563eb' }}
            >
              BW
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6" style={{ background: '#f8fafc' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
