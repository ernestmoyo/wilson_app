import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import EnquiriesPage from '@/pages/enquiries/EnquiriesPage'
import ClientsPage from '@/pages/clients/ClientsPage'
import ClientDetail from '@/pages/clients/ClientDetail'
import AssessmentList from '@/pages/assessment/AssessmentList'
import AssessmentDetail from '@/pages/assessment/AssessmentDetail'
import NewAssessment from '@/pages/assessment/NewAssessment'
import CertificatesPage from '@/pages/certificates/CertificatesPage'
import CertificateDetail from '@/pages/certificates/CertificateDetail'
import InventoryPage from '@/pages/inventory/InventoryPage'
import EvidencePage from '@/pages/evidence/EvidencePage'
import SitePlannerPage from '@/pages/site-planner/SitePlannerPage'
import ReportsPage from '@/pages/reports/ReportsPage'
import AuditLogPage from '@/pages/audit-log/AuditLogPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="enquiries" element={<EnquiriesPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="assessment" element={<AssessmentList />} />
          <Route path="assessment/new" element={<NewAssessment />} />
          <Route path="assessment/:id" element={<AssessmentDetail />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="certificates/:id" element={<CertificateDetail />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="evidence" element={<EvidencePage />} />
          <Route path="site-planner" element={<SitePlannerPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
