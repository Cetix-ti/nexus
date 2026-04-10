// ============================================================================
// ORGANIZATION APPROVERS
// Per-organization list of contacts who can approve tickets.
// Used as the source pool for ticket-level approval workflows.
// ============================================================================

export type ApproverScope =
  | "all_tickets"           // can approve any ticket from this org
  | "high_priority_only"    // only critical/high priority tickets
  | "specific_categories"   // only certain categories
  | "specific_amounts";     // only when ticket has time entry > X $

export const APPROVER_SCOPE_LABELS: Record<ApproverScope, string> = {
  all_tickets: "Tous les tickets",
  high_priority_only: "Priorité élevée et critique",
  specific_categories: "Catégories spécifiques",
  specific_amounts: "Montant minimum",
};

export interface OrgApprover {
  id: string;
  organizationId: string;
  // The contact who can approve
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  jobTitle?: string;
  // Role within the approval hierarchy
  level: number; // 1 = first approver, 2 = secondary, etc.
  isPrimary: boolean; // primary contact for approvals
  // Scope (what they can approve)
  scope: ApproverScope;
  scopeCategories?: string[]; // when scope = specific_categories
  scopeMinAmount?: number;    // when scope = specific_amounts
  // Notification preferences
  notifyByEmail: boolean;
  notifyBySms: boolean;
  // State
  isActive: boolean;
  // Stats
  totalApproved: number;
  totalRejected: number;
  averageResponseHours?: number;
  // Audit
  createdAt: string;
  addedBy: string;
}
