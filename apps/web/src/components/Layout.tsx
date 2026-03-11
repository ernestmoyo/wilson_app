import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Building2, ClipboardCheck, Award, Package, Map, FileText, MessageSquarePlus, Camera, Shield } from 'lucide-react'
import Avatar from './Avatar'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/enquiries', icon: MessageSquarePlus, label: 'Enquiries' },
  { to: '/clients', icon: Building2, label: 'Clients' },
  { to: '/assessment', icon: ClipboardCheck, label: 'Assessment' },
  { to: '/certificates', icon: Award, label: 'Certificates' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/evidence', icon: Camera, label: 'Evidence' },
  { to: '/site-planner', icon: Map, label: 'Site Planner' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/audit-log', icon: Shield, label: 'Audit Log' },
]

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard'
  if (pathname.startsWith('/enquiries')) return 'Enquiries'
  if (pathname.startsWith('/clients/')) return 'Client Details'
  if (pathname.startsWith('/clients')) return 'Clients'
  if (pathname === '/assessment/new') return 'New Assessment'
  if (pathname.startsWith('/assessment/')) return 'Assessment Detail'
  if (pathname.startsWith('/assessment')) return 'Assessment'
  if (pathname.startsWith('/certificates/')) return 'Certificate Detail'
  if (pathname.startsWith('/certificates')) return 'Certificates'
  if (pathname.startsWith('/inventory')) return 'Inventory'
  if (pathname.startsWith('/evidence')) return 'Evidence'
  if (pathname.startsWith('/site-planner')) return 'Site Planner'
  if (pathname.startsWith('/reports')) return 'Reports'
  if (pathname.startsWith('/audit-log')) return 'Audit Log'
  return 'Wilson Suite'
}

export default function Layout() {
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--nz-bg)' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col shrink-0 h-full"
        style={{ width: 220, background: 'var(--nz-navy)' }}
      >
        {/* Brand */}
        <div className="px-4 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0"
              style={{ background: 'var(--nz-red)' }}
            >
              W
            </div>
            <div className="min-w-0">
              <div className="text-white font-bold text-base leading-tight tracking-tight">Wilson Suite</div>
              <div className="text-xs leading-tight flex items-center gap-1 mt-0.5" style={{ color: '#93C5FD' }}>
                🇳🇿 NZ Hazardous Substances
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      background: 'rgba(204, 20, 43, 0.18)',
                      borderLeft: '3px solid var(--nz-red)',
                      paddingLeft: '9px',
                    }
                  : {}
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Profile */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
          <div className="flex items-center gap-3">
            <Avatar size={40} />
            <div className="min-w-0">
              <div className="text-white text-sm font-semibold leading-tight truncate">Bryan Wilson</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span>
                <span className="text-xs" style={{ color: '#86EFAC' }}>Active Certifier</span>
              </div>
            </div>
          </div>
        </div>

        {/* Legal footer */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
            HSW (Hazardous Substances)<br />
            Regulations 2017 · WorkSafe NZ<br />
            v. 20 Oct 2025
          </p>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top header */}
        <header
          className="flex items-center justify-between px-8 flex-shrink-0"
          style={{
            height: 64,
            background: '#ffffff',
            borderBottom: '1px solid rgba(0,36,125,0.10)',
          }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nz-navy)' }}>{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: '#64748B' }}>Bryan Wilson</span>
            <Avatar size={40} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
