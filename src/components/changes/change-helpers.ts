import type { ChangeCategory, ChangeImpact, ChangeStatus } from "@prisma/client";

export const CATEGORY_LABELS: Record<ChangeCategory, { label: string; icon: string; color: string }> = {
  INFRASTRUCTURE:   { label: "Infrastructure",    icon: "🖥️", color: "#3B82F6" },
  NETWORK_SECURITY: { label: "Réseau & sécurité", icon: "🛡️", color: "#EF4444" },
  IDENTITY_ACCESS:  { label: "Identités & accès", icon: "🔑", color: "#F59E0B" },
  M365_CLOUD:       { label: "M365 & cloud",      icon: "☁️", color: "#06B6D4" },
  SOFTWARE:         { label: "Logiciels",         icon: "📦", color: "#8B5CF6" },
  BACKUPS:          { label: "Sauvegardes",       icon: "💾", color: "#10B981" },
  WORKSTATIONS:     { label: "Postes",            icon: "💻", color: "#6366F1" },
  TELECOM_PRINT:    { label: "Téléphonie / Impression", icon: "☎️", color: "#64748B" },
  CONTRACTS:        { label: "Contrats",          icon: "📄", color: "#A855F7" },
  ORGANIZATIONAL:   { label: "Organisationnel",   icon: "🏢", color: "#94A3B8" },
  OTHER:            { label: "Autre",             icon: "📌", color: "#94A3B8" },
};

export const IMPACT_LABELS: Record<ChangeImpact, { label: string; color: string }> = {
  MINOR:      { label: "Mineur",     color: "bg-slate-100 text-slate-600 ring-slate-200" },
  MODERATE:   { label: "Modéré",     color: "bg-blue-50 text-blue-700 ring-blue-200" },
  MAJOR:      { label: "Majeur",     color: "bg-amber-50 text-amber-800 ring-amber-200" },
  STRUCTURAL: { label: "Structurant", color: "bg-red-50 text-red-700 ring-red-200" },
};

export const STATUS_LABELS: Record<ChangeStatus, { label: string; color: string }> = {
  AI_SUGGESTED: { label: "Suggéré IA",  color: "bg-violet-50 text-violet-700 ring-violet-200" },
  IN_REVIEW:    { label: "En révision", color: "bg-slate-100 text-slate-700 ring-slate-200" },
  APPROVED:     { label: "Approuvé",    color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  PUBLISHED:    { label: "Publié",      color: "bg-blue-50 text-blue-700 ring-blue-200" },
  REJECTED:     { label: "Rejeté",      color: "bg-red-50 text-red-700 ring-red-200" },
  ARCHIVED:     { label: "Archivé",     color: "bg-slate-50 text-slate-500 ring-slate-200" },
};

export const CLIENT_SAFE_CATEGORIES: ChangeCategory[] = [
  "SOFTWARE", "M365_CLOUD", "BACKUPS", "WORKSTATIONS", "TELECOM_PRINT", "CONTRACTS", "ORGANIZATIONAL", "OTHER",
];
