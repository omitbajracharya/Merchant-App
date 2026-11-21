export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'REJECTED';

export type ReviewDecision = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'COMMENT';

export type SensitiveFieldName = 'owner_tax_id' | 'account_number';

export interface MerchantApplication {
  id: string;
  application_number: string;
  status: ApplicationStatus;

  created_by: string;
  assigned_reviewer_id: string | null;
  created_by_name?: string;
  assigned_reviewer_name?: string | null;

  // Step 1: Business Details
  business_name: string | null;
  legal_entity_type: string | null;
  registration_number: string | null;
  industry_category: string | null;
  website_url: string | null;
  business_address: string | null;

  // Step 2: Owner / KYC Details
  owner_full_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  owner_tax_id_last4?: string | null;
  owner_tax_id_masked?: string | null;

  // Step 3: Banking & Processing Details
  bank_name: string | null;
  routing_number: string | null;
  account_number_last4?: string | null;
  account_number_masked?: string | null;
  expected_monthly_volume: number | null;
  average_ticket_size: number | null;

  // Draft & Metadata
  current_step: number;
  version: number;
  last_saved_at: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDraftPayload {
  business_name?: string | null;
  legal_entity_type?: string | null;
  registration_number?: string | null;
  industry_category?: string | null;
  website_url?: string | null;
  business_address?: string | null;
  owner_full_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  owner_tax_id?: string | null;
  bank_name?: string | null;
  routing_number?: string | null;
  account_number?: string | null;
  expected_monthly_volume?: number | null;
  average_ticket_size?: number | null;
  current_step?: number;
}

export interface RiskReview {
  id: string;
  decision: ReviewDecision;
  risk_score: number | null;
  notes: string;
  created_at: string;
  reviewer_name: string;
}

export interface ReviewerOption {
  id: string;
  full_name: string;
  email: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedApplicationsResponse {
  data: MerchantApplication[];
  pagination: PaginationMeta;
}

export interface ApplicationDetailResponse {
  application: MerchantApplication;
  reviews: RiskReview[];
}

export interface RevealFieldResponse {
  field: SensitiveFieldName;
  value: string | null;
}