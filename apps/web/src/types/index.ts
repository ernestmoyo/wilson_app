export interface User {
  id: number
  name: string
  email: string
  role: string
  certifier_number?: string
  phone?: string
  created_at: string
}

export interface Client {
  id: number
  legal_name: string
  trading_name?: string
  site_address: string
  postal_address?: string
  phone?: string
  email?: string
  website?: string
  nzbn?: string
  companies_number?: string
  industry?: string
  manager_name?: string
  manager_phone?: string
  manager_email?: string
  created_at: string
  updated_at: string
  assessment_count?: number
  certificate_count?: number
}

export interface Assessment {
  id: number
  client_id: number
  inspector_id: number
  type: 'pre_inspection' | 'site_inspection' | 'validation'
  status: 'draft' | 'in_progress' | 'completed' | 'compliant' | 'non_compliant'
  inspection_date?: string
  substance_classes?: string
  notes?: string
  created_at: string
  updated_at: string
  client_name?: string
  inspector_name?: string
}

export interface AssessmentItem {
  id: number
  assessment_id: number
  section: string
  item_number: string
  description: string
  status: 'compliant' | 'non_compliant' | 'inapplicable' | 'pending'
  comments?: string
  sort_order: number
  legal_ref?: string
}

export interface Certificate {
  id: number
  client_id: number
  assessment_id?: number
  inspector_id: number
  certificate_number?: string
  status: 'pending' | 'granted' | 'refused' | 'expired'
  substance_class?: string
  max_quantity?: string
  issue_date?: string
  expiry_date?: string
  refusal_reasons?: string
  applicant_notified?: boolean
  worksafe_notified?: boolean
  worksafe_registered?: boolean
  is_conditional?: boolean
  condition_details?: string
  condition_deadline?: string
  certifier_name?: string
  trading_name?: string
  nzbn?: string
  companies_number?: string
  created_at: string
  client_name?: string
}

export interface InventoryItem {
  id: number
  client_id: number
  substance_name: string
  hazard_class: string
  quantity: number
  unit: string
  container_size?: number
  container_count?: number
  storage_location?: string
  sds_available: number
  notes?: string
  created_at: string
}

export interface SitePlan {
  id: number
  client_id: number
  plan_name: string
  plan_data: string
  version: number
  created_at: string
  updated_at: string
}

export interface Report {
  id: number
  client_id: number
  assessment_id?: number
  inspector_id: number
  type: 'compliance_report' | 'gap_analysis' | 'non_compliance_notice' | 'certificate_report'
  title: string
  content: string
  created_at: string
}
