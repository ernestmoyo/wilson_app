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

export interface Enquiry {
  id: number
  client_id?: number
  contact_name: string
  contact_email?: string
  contact_phone?: string
  company_name?: string
  site_address?: string
  enquiry_type: 'new_certification' | 'renewal' | 'variation' | 'handler_certification' | 'general_enquiry'
  status: 'received' | 'reviewing' | 'quoted' | 'accepted' | 'declined' | 'converted'
  substance_classes?: string
  estimated_quantities?: string
  description?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  source?: string
  assigned_to?: number
  quoted_amount?: number
  quote_date?: string
  converted_assessment_id?: number
  follow_up_date?: string
  notes?: string
  created_at: string
  updated_at: string
  client_name?: string
  assigned_to_name?: string
}

export interface Assessment {
  id: number
  client_id: number
  inspector_id: number
  type: 'pre_inspection' | 'site_inspection' | 'validation' | 'certified_handler'
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
  status: 'compliant' | 'non_compliant' | 'inapplicable' | 'pending' | 'conditional'
  comments?: string
  sort_order: number
  legal_ref?: string
  risk_level?: 'low' | 'medium' | 'high' | 'critical'
  evidence_required?: number
  nc_code?: string
  nc_severity?: 'critical' | 'major' | 'minor'
  corrective_action?: string
  corrective_action_due?: string
  corrective_action_status?: 'open' | 'in_progress' | 'resolved' | 'verified'
  action?: string
  records?: string
  checklist_group?: string
}

export interface Certificate {
  id: number
  client_id: number
  assessment_id?: number
  inspector_id: number
  certificate_number?: string
  status: 'pending' | 'granted' | 'refused' | 'expired' | 'conditional'
  certificate_type?: 'location' | 'certified_handler'
  substance_class?: string
  max_quantity?: string
  issue_date?: string
  in_force_date?: string
  expiry_date?: string
  refusal_reasons?: string
  refusal_date?: string
  refusal_regulations_not_met?: string
  refusal_form_generated?: number
  worksafe_notification_due?: string
  worksafe_notification_sent?: string
  applicant_notification_sent?: string
  applicant_notified?: boolean
  worksafe_notified?: boolean
  worksafe_registered?: boolean
  is_conditional?: boolean
  condition_details?: string
  condition_deadline?: string
  handler_name?: string
  handler_address?: string
  handler_dob?: string
  handler_id_type?: string
  handler_id_verified?: number
  certifier_name?: string
  certifier_number?: string
  trading_name?: string
  nzbn?: string
  companies_number?: string
  site_address?: string
  created_at: string
  client_name?: string
  inspector_name?: string
}

export interface Evidence {
  id: number
  assessment_id?: number
  assessment_item_id?: number
  client_id?: number
  certificate_id?: number
  file_name: string
  file_path: string
  file_type?: string
  file_size?: number
  description?: string
  evidence_type: 'photo' | 'document' | 'calculation' | 'engineer_cert' | 'sds' | 'site_plan' | 'erp' | 'training_record' | 'id_document' | 'other'
  gps_latitude?: number
  gps_longitude?: number
  captured_by?: string
  captured_at?: string
  device_info?: string
  sha256_hash?: string
  appendix_category?: string
  appendix_number?: number
  location_area?: string
  created_at: string
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
  hsno_approval?: string
  notes?: string
  un_number?: string
  hazard_classifications?: string
  storage_requirements?: string
  incompatible_items?: string
  sds_expiry_date?: string
  sku?: string
  substance_state?: string
  max_quantity?: number
  storage_area_id?: number
  created_at: string
}

export interface StorageArea {
  id: number
  client_id: number
  area_name: string
  area_type?: string
  substance_classes?: string
  max_capacity?: string
  building_type?: string
  notes?: string
  created_at: string
}

export interface TrainingRecord {
  id: number
  client_id: number
  worker_name: string
  department?: string
  course_name: string
  training_date?: string
  competent: number
  expiry_date?: string
  certificate_evidence_id?: number
  notes?: string
  created_at: string
}

export interface HandlerAssessment {
  id: number
  assessment_id: number
  applicant_name?: string
  applicant_address?: string
  applicant_dob?: string
  employer_pcbu?: string
  employer_nzbn?: string
  substance_lifecycle_phases?: string
  qualifications?: string
  education_verified: number
  id_type?: string
  id_number?: string
  id_expiry?: string
  id_sighted: number
  knowledge_score?: number
  written_score?: number
  written_total: number
  written_pass_pct: number
  practical_passed: number
  overall_result?: string
  assessor_statement?: string
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
  type: 'compliance_report' | 'gap_analysis' | 'non_compliance_notice' | 'certificate_report' | 'refusal_notification'
  title: string
  content: string
  created_at: string
}

export interface AuditLogEntry {
  id: number
  entity_type: string
  entity_id: number
  action: string
  user_id?: number
  user_name?: string
  details?: string
  ip_address?: string
  created_at: string
}
