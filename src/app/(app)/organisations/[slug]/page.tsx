"use client";

import { useState, useMemo, useEffect } from "react";
import { useParams } from "next/navigation";
import { PageLoader } from "@/components/ui/page-loader";
// useRouter imported below alongside Eye + impersonation
import Link from "next/link";
import {
  ArrowLeft,
  Globe,
  Phone,
  Calendar,
  Building2,
  Ticket,
  FileText,
  MapPin,
  Users,
  Monitor,
  Star,
  Clock,
  CheckCircle2,
  AlertCircle,
  Circle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { EditOrgModal, type EditOrgModalOrg } from "@/components/organizations/edit-org-modal";
import { Pencil, ShieldCheck } from "lucide-react";
import {
  PORTAL_ROLE_LABELS,
  DEFAULT_VIEWER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  type ClientPortalPermissions,
} from "@/lib/projects/types";
import { PORTAL_ORGS } from "@/lib/portal/org-resolver";
import { usePortalImpersonation } from "@/stores/portal-impersonation-store";
import { useRouter } from "next/navigation";
import { Eye, Trash2 } from "lucide-react";
import {
  EditPortalAccessModal,
  type PortalAccessUser,
} from "@/components/portal/edit-portal-access-modal";
import { OrgApproversSection } from "@/components/approvers/org-approvers-section";
import { ContractModal } from "@/components/settings/contract-modal";
import { EditContactModal, type EditContactModalContact } from "@/components/contacts/edit-contact-modal";
import type { Contract as BillingContract } from "@/lib/billing/types";
import { ClientBillingOverridesSection } from "@/components/billing/client-billing-overrides-section";
import { OrgAssetsTab } from "@/components/assets/org-assets-tab";
import { OrgAssetsTabWrapper } from "@/components/assets/org-assets-tab-wrapper";
import { OrgSlaSection } from "@/components/sla/org-sla-section";
import { OrgPortalSection } from "@/components/portal/org-portal-section";
import { OrgReportsTab } from "@/components/organizations/org-reports-tab";
import { OrgAnalyticsWorkbench } from "@/components/organizations/org-analytics-workbench";
import { OrgHistorySection } from "@/components/organizations/org-history-section";
import { OrgNetworkSection } from "@/components/organizations/org-network-section";
import { OrgAiIntelligenceTab } from "@/components/organizations/org-ai-intelligence-tab";
import { OrgBudgetTab } from "@/components/budgets/org-budget-tab";
import { OrgMonthlyReportsTab } from "@/components/reports/monthly/org-monthly-reports-tab";
import { OrgParticularitiesTab } from "@/components/particularities/org-particularities-tab";
import { OrgSoftwareTab } from "@/components/software/org-software-tab";
import { OrgPoliciesTab } from "@/components/policies/org-policies-tab";
import { OrgChangesTab } from "@/components/changes/org-changes-tab";
import { ChangesOverviewWidget } from "@/components/changes/overview-widget";
import { RenewalsWidget } from "@/components/assets/renewals-widget";
import { OrgMaturitySection } from "@/components/organizations/org-maturity-section";
import { OrgCapabilitiesSection } from "@/components/organizations/org-capabilities-section";
import { OrgDossierExportButton } from "@/components/organizations/org-dossier-export";
import { Lightbulb, ShieldCheck as ShieldCheckIcon, Package, GitCommit } from "lucide-react";
import { Plus, X } from "lucide-react";
import { useAgentAvatarsStore } from "@/stores/agent-avatars-store";

function portalRoleVariant(role: ClientPortalPermissions["portalRole"] | null): "danger" | "warning" | "primary" | "default" {
  if (role === "admin") return "danger";
  if (role === "manager") return "warning";
  if (role === "viewer") return "primary";
  return "default";
}

// ---------- Types ----------
interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  plan: "Standard" | "Premium" | "Enterprise";
  status: "Actif" | "Inactif";
  color: string;
  domain: string;
  phone: string;
  createdAt: string;
  openTickets: number;
  activeContracts: number;
  sitesCount: number;
  contactsCount: number;
  assetsCount: number;
  logo?: string | null;
}

interface Site {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  primary: boolean;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  vip: boolean;
}

interface OrgTicket {
  id: string;
  number: string;
  subject: string;
  status: "Nouveau" | "Ouvert" | "En cours" | "Sur place" | "En attente" | "Résolu" | "Fermé";
  priority: "Basse" | "Moyenne" | "Haute" | "Critique";
  requester: string;
  assignee: string | null;
  assigneeAvatar: string | null;
  createdAt: string;
}

interface Contract {
  id: string;
  name: string;
  type: string;
  status: "Actif" | "Expiré" | "Brouillon";
  startDate: string;
  endDate: string;
  hours: number;
  usedHours: number;
}

interface Asset {
  id: string;
  name: string;
  type: string;
  status: "En service" | "En maintenance" | "Retiré";
  serial: string;
  site: string;
}

interface Activity {
  id: string;
  text: string;
  time: string;
  type: "ticket" | "contract" | "contact" | "asset";
  /** URL cible quand l'item est cliquable. */
  href?: string;
}

// ---------- Mock Data by org ----------
const orgsMap: Record<string, OrgDetail> = {
  "org-1": { id: "org-1", name: "Cetix", slug: "cetix", plan: "Enterprise", status: "Actif", color: "bg-blue-600", domain: "cetix.ca", phone: "+1 514 555-0100", createdAt: "2023-06-15", openTickets: 7, activeContracts: 2, sitesCount: 4, contactsCount: 18, assetsCount: 42 },
  "org-2": { id: "org-2", name: "Acme Corp", slug: "acme-corp", plan: "Premium", status: "Actif", color: "bg-emerald-600", domain: "acmecorp.com", phone: "+1 438 555-0200", createdAt: "2023-09-22", openTickets: 4, activeContracts: 1, sitesCount: 3, contactsCount: 12, assetsCount: 28 },
  "org-3": { id: "org-3", name: "TechStart Inc", slug: "techstart-inc", plan: "Standard", status: "Actif", color: "bg-violet-600", domain: "techstart.io", phone: "+1 450 555-0300", createdAt: "2024-01-10", openTickets: 2, activeContracts: 1, sitesCount: 1, contactsCount: 5, assetsCount: 8 },
  "org-4": { id: "org-4", name: "Global Finance", slug: "global-finance", plan: "Enterprise", status: "Actif", color: "bg-amber-600", domain: "globalfinance.ca", phone: "+1 514 555-0400", createdAt: "2022-11-03", openTickets: 11, activeContracts: 3, sitesCount: 6, contactsCount: 32, assetsCount: 96 },
  "org-5": { id: "org-5", name: "HealthCare Plus", slug: "healthcare-plus", plan: "Premium", status: "Inactif", color: "bg-rose-600", domain: "healthcareplus.ca", phone: "+1 819 555-0500", createdAt: "2023-03-18", openTickets: 3, activeContracts: 0, sitesCount: 2, contactsCount: 9, assetsCount: 15 },
  "org-6": { id: "org-6", name: "MédiaCentre QC", slug: "mediacentre-qc", plan: "Standard", status: "Actif", color: "bg-cyan-600", domain: "mediacentre.qc.ca", phone: "+1 418 555-0600", createdAt: "2024-08-01", openTickets: 1, activeContracts: 1, sitesCount: 1, contactsCount: 4, assetsCount: 6 },
};

// Sites are now fetched from /api/v1/sites (see useEffect below)

// contactsData removed — now fetched from /api/v1/contacts?organizationId={id}

// ticketsData removed — now fetched from /api/v1/tickets?organizationId={id}

// contractsData removed — now fetched from /api/v1/contracts?organizationId={id}

const assetsData: Record<string, Asset[]> = {
  "org-1": [
    { id: "a1", name: "SRV-PROD-01", type: "Serveur", status: "En service", serial: "SN-2024-001", site: "Siège social" },
    { id: "a2", name: "SRV-BACKUP-01", type: "Serveur", status: "En service", serial: "SN-2024-002", site: "Siège social" },
    { id: "a3", name: "FW-MAIN-01", type: "Pare-feu", status: "En service", serial: "FW-2023-015", site: "Siège social" },
    { id: "a4", name: "SW-CORE-01", type: "Commutateur", status: "En service", serial: "SW-2024-008", site: "Siège social" },
    { id: "a5", name: "AP-WIFI-QC-01", type: "Point d'accès", status: "En service", serial: "AP-2024-101", site: "Bureau Québec" },
    { id: "a6", name: "SRV-DEV-01", type: "Serveur", status: "En maintenance", serial: "SN-2022-019", site: "Entrepôt Laval" },
  ],
  "org-2": [
    { id: "a7", name: "SRV-WEB-01", type: "Serveur", status: "En service", serial: "SN-2023-044", site: "Head Office" },
    { id: "a8", name: "NAS-STORAGE-01", type: "Stockage", status: "En service", serial: "NAS-2024-003", site: "Head Office" },
    { id: "a9", name: "FW-LAB-01", type: "Pare-feu", status: "En service", serial: "FW-2024-022", site: "R&D Lab" },
    { id: "a10", name: "UPS-MAIN-01", type: "Onduleur", status: "Retiré", serial: "UPS-2020-007", site: "Warehouse" },
  ],
  "org-4": [
    { id: "a11", name: "SRV-TRADE-01", type: "Serveur", status: "En service", serial: "SN-2024-100", site: "Tour principale" },
    { id: "a12", name: "SRV-TRADE-02", type: "Serveur", status: "En service", serial: "SN-2024-101", site: "Tour principale" },
    { id: "a13", name: "FW-CORE-01", type: "Pare-feu", status: "En service", serial: "FW-2024-050", site: "Tour principale" },
    { id: "a14", name: "SRV-DC-01", type: "Serveur", status: "En service", serial: "SN-2024-102", site: "Centre de données" },
    { id: "a15", name: "SAN-MAIN-01", type: "Stockage", status: "En service", serial: "SAN-2024-010", site: "Centre de données" },
    { id: "a16", name: "SRV-BACKUP-DC", type: "Serveur", status: "En maintenance", serial: "SN-2023-090", site: "Centre de données" },
  ],
};

/** Derive recent activities from real ticket data. */
function deriveActivities(tickets: OrgTicket[]): Activity[] {
  const sorted = [...tickets].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return sorted.slice(0, 5).map((t) => {
    const d = new Date(t.createdAt);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffH = Math.floor(diffMs / 3_600_000);
    const diffD = Math.floor(diffMs / 86_400_000);
    const time =
      diffMin < 60
        ? `Il y a ${diffMin} min`
        : diffH < 24
        ? `Il y a ${diffH} h`
        : `Il y a ${diffD} j`;
    return {
      id: `act-${t.id}`,
      text: `Ticket #${t.number} — ${t.subject}`,
      time,
      type: "ticket" as const,
      href: `/tickets/${t.id}`,
    };
  });
}

// ---------- Helpers ----------
const planBadgeVariant = (plan: string) => {
  switch (plan) {
    case "Enterprise": return "primary" as const;
    case "Premium": return "warning" as const;
    default: return "default" as const;
  }
};

const statusBadgeVariant = (s: string) => {
  switch (s) {
    case "Actif": case "En service": return "success" as const;
    case "Inactif": case "Expiré": case "Retiré": return "danger" as const;
    case "En attente": case "En maintenance": case "Brouillon": return "warning" as const;
    default: return "default" as const;
  }
};

const ticketStatusIcon = (s: string) => {
  switch (s) {
    case "Nouveau": return <Circle className="h-3.5 w-3.5 text-blue-500" />;
    case "Ouvert": return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
    case "En cours": return <Clock className="h-3.5 w-3.5 text-violet-500" />;
    case "Sur place": return <MapPin className="h-3.5 w-3.5 text-cyan-500" />;
    case "En attente": return <Clock className="h-3.5 w-3.5 text-orange-500" />;
    case "Résolu": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "Fermé": return <CheckCircle2 className="h-3.5 w-3.5 text-gray-400" />;
    default: return <Circle className="h-3.5 w-3.5 text-gray-400" />;
  }
};

// Status group config for the org tickets tab
const TICKET_STATUS_GROUPS: { key: OrgTicket["status"]; label: string; bg: string; ring: string; dot: string }[] = [
  { key: "Nouveau", label: "Nouveau", bg: "bg-blue-50/60", ring: "ring-blue-200/60", dot: "bg-blue-500" },
  { key: "Ouvert", label: "Ouvert", bg: "bg-amber-50/60", ring: "ring-amber-200/60", dot: "bg-amber-500" },
  { key: "En cours", label: "En cours", bg: "bg-violet-50/60", ring: "ring-violet-200/60", dot: "bg-violet-500" },
  { key: "En attente", label: "En attente", bg: "bg-orange-50/60", ring: "ring-orange-200/60", dot: "bg-orange-500" },
  { key: "Résolu", label: "Résolu", bg: "bg-emerald-50/60", ring: "ring-emerald-200/60", dot: "bg-emerald-500" },
  { key: "Fermé", label: "Fermé", bg: "bg-slate-50/60", ring: "ring-slate-200/60", dot: "bg-slate-400" },
];

function getInitialsName(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarGradient(name: string): string {
  const gradients = [
    "from-blue-500 to-blue-700",
    "from-violet-500 to-violet-700",
    "from-emerald-500 to-emerald-700",
    "from-amber-500 to-amber-700",
    "from-rose-500 to-rose-700",
    "from-cyan-500 to-cyan-700",
    "from-fuchsia-500 to-fuchsia-700",
    "from-indigo-500 to-indigo-700",
  ];
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

function OrgTicketsTab({ tickets }: { tickets: OrgTicket[] }) {
  const onSiteTickets = tickets.filter((t) => t.status === "Sur place");
  const otherTickets = tickets.filter((t) => t.status !== "Sur place");

  const avatars = useAgentAvatarsStore((s) => s.avatars);
  const loadAvatars = useAgentAvatarsStore((s) => s.load);
  useEffect(() => { loadAvatars(); }, [loadAvatars]);

  return (
    <div className="space-y-5">
      {/* SUR PLACE — Featured section */}
      <Card className="overflow-hidden ring-1 ring-cyan-200/60 border-cyan-200/80">
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-cyan-50/80 to-blue-50/40 border-b border-cyan-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-100 flex items-center justify-center text-cyan-600 ring-1 ring-inset ring-cyan-200/60">
              <MapPin className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">
                Tickets à faire sur place
              </h3>
              <p className="text-[12.5px] text-slate-600">
                Interventions nécessitant un déplacement chez le client
              </p>
            </div>
          </div>
          <span className="inline-flex h-7 items-center rounded-full bg-white px-3 text-[13px] font-bold text-cyan-700 tabular-nums ring-1 ring-inset ring-cyan-200">
            {onSiteTickets.length} {onSiteTickets.length === 1 ? "ticket" : "tickets"}
          </span>
        </div>
        {onSiteTickets.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[13px] text-slate-500">
              Aucun ticket nécessitant une intervention sur place actuellement.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {onSiteTickets.map((t) => (
              <div
                key={t.id}
                className="group flex items-center gap-4 px-5 py-3.5 hover:bg-cyan-50/30 transition-colors"
              >
                <span className="font-mono text-[11px] font-semibold text-cyan-600 tabular-nums shrink-0">
                  {t.number}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-slate-900 truncate">
                    {t.subject}
                  </p>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">
                    Demandé par {t.requester} •{" "}
                    {new Date(t.createdAt).toLocaleDateString("fr-CA")}
                  </p>
                </div>
                <Badge variant={priorityColor(t.priority)}>{t.priority}</Badge>
                {t.assignee ? (
                  <div className="flex items-center gap-2 shrink-0">
                    {t.assigneeAvatar ? (
                      <img
                        src={t.assigneeAvatar}
                        alt={t.assignee}
                        title={t.assignee}
                        className="h-7 w-7 rounded-full object-cover ring-2 ring-white shadow-sm"
                      />
                    ) : (
                      <div
                        className={cn(
                          "h-7 w-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold ring-2 ring-white shadow-sm",
                          getAvatarGradient(t.assignee)
                        )}
                        title={t.assignee}
                      >
                        {getInitialsName(t.assignee)}
                      </div>
                    )}
                    <span className="text-[12px] text-slate-700 hidden md:inline">
                      {t.assignee}
                    </span>
                  </div>
                ) : (
                  <span className="text-[11.5px] italic text-slate-400 shrink-0">
                    Non assigné
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* OTHER STATUSES — Grouped */}
      {TICKET_STATUS_GROUPS.map((group) => {
        const groupTickets = otherTickets.filter((t) => t.status === group.key);
        if (groupTickets.length === 0) return null;
        return (
          <Card key={group.key} className="overflow-hidden">
            <div
              className={cn(
                "flex items-center justify-between px-5 py-3 border-b border-slate-100 ring-1 ring-inset",
                group.bg,
                group.ring
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className={cn("h-2 w-2 rounded-full", group.dot)} />
                <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-slate-700">
                  {group.label}
                </h3>
                <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-md bg-white px-1.5 text-[11px] font-bold text-slate-700 tabular-nums shadow-sm ring-1 ring-inset ring-slate-200/60">
                  {groupTickets.length}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/40">
                    <th className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      #
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      Sujet
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      Priorité
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      Assigné à
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      Demandeur
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      Créé le
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupTickets.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 tabular-nums">
                        {t.number}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-slate-900">
                          {t.subject}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={priorityColor(t.priority)}>
                          {t.priority}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {t.assignee ? (
                          <div className="flex items-center gap-2">
                            {t.assigneeAvatar ? (
                              <img
                                src={t.assigneeAvatar}
                                alt={t.assignee}
                                title={t.assignee}
                                className="h-6 w-6 rounded-full object-cover ring-2 ring-white shadow-sm"
                              />
                            ) : (
                              <div
                                className={cn(
                                  "h-6 w-6 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[9px] font-semibold ring-2 ring-white shadow-sm",
                                  getAvatarGradient(t.assignee)
                                )}
                                title={t.assignee}
                              >
                                {getInitialsName(t.assignee)}
                              </div>
                            )}
                            <span className="text-[12px] text-slate-700 whitespace-nowrap">
                              {t.assignee}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11.5px] italic text-slate-400">
                            Non assigné
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-slate-600">
                        {t.requester}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-slate-500 tabular-nums">
                        {new Date(t.createdAt).toLocaleDateString("fr-CA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      {tickets.length === 0 && (
        <Card>
          <div className="p-12 text-center text-slate-400 text-[13px]">
            Aucun ticket trouvé pour cette organisation.
          </div>
        </Card>
      )}
    </div>
  );
}

const priorityColor = (p: string) => {
  switch (p) {
    case "Critique": return "danger" as const;
    case "Haute": return "warning" as const;
    case "Moyenne": return "default" as const;
    case "Basse": return "success" as const;
    default: return "outline" as const;
  }
};

const activityIcon = (type: string) => {
  switch (type) {
    case "ticket": return <Ticket className="h-4 w-4 text-blue-500" />;
    case "contract": return <FileText className="h-4 w-4 text-emerald-500" />;
    case "contact": return <Users className="h-4 w-4 text-violet-500" />;
    case "asset": return <Monitor className="h-4 w-4 text-amber-500" />;
    default: return <Circle className="h-4 w-4 text-gray-400" />;
  }
};

// ---------- Tabs ----------
// Ordre maître défini au niveau architecture : on aligne l'utilisateur sur
// un parcours cohérent (identité → inventaire → gouvernance documentaire →
// contrats → livrables → exposition). Les nouveaux modules (Particularités,
// Politiques, Logiciels, Changements) s'intercalent ici ;
// les onglets dont le rendu n'existe pas encore affichent un placeholder
// qui redirige vers leur version transversale dans la sidebar.
const TABS = [
  { key: "overview", label: "Aperçu" },
  { key: "contacts", label: "Contacts" },
  { key: "sites", label: "Sites" },
  { key: "tickets", label: "Tickets" },
  { key: "assets", label: "Actifs" },
  { key: "particularities", label: "Particularités" },
  { key: "policies", label: "Politiques" },
  { key: "software", label: "Logiciels" },
  { key: "changes", label: "Changements" },
  { key: "contracts", label: "Contrats" },
  { key: "sla", label: "SLA" },
  { key: "billing", label: "Facturation" },
  { key: "budget", label: "Budget" },
  { key: "reports", label: "Rapports" },
  { key: "portal_access", label: "Portail client" },
  { key: "ai", label: "Intelligence IA" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ---------- Sites Tab (editable) ----------
function OrgSitesTab({
  initialSites,
  organizationId,
}: {
  initialSites: Site[];
  organizationId: string;
}) {
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Site, "id">>({
    name: "",
    address: "",
    city: "",
    phone: "",
    primary: false,
  });

  function startCreate() {
    setForm({ name: "", address: "", city: "", phone: "", primary: false });
    setEditingId(null);
    setCreating(true);
  }

  function startEdit(site: Site) {
    setForm({
      name: site.name,
      address: site.address,
      city: site.city,
      phone: site.phone,
      primary: site.primary,
    });
    setEditingId(site.id);
    setCreating(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  const [saving, setSaving] = useState(false);

  async function saveSite() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/v1/sites/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("Échec de la mise à jour");
        setSites((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, ...form } : s))
        );
      } else if (creating) {
        const res = await fetch("/api/v1/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            address: form.address,
            city: form.city,
            phone: form.phone,
            primary: false,
            organizationId,
          }),
        });
        if (!res.ok) throw new Error("Échec de la création");
        const created = await res.json();
        setSites((prev) => [
          ...prev,
          {
            id: created.id,
            name: created.name,
            address: created.address || "—",
            city: created.city || "—",
            phone: created.phone || "—",
            primary: created.isMain ?? false,
          },
        ]);
      }
      cancelEdit();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSite(id: string) {
    try {
      const res = await fetch(`/api/v1/sites/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression");
      setSites((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  async function setPrimary(id: string) {
    try {
      const res = await fetch(`/api/v1/sites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary: true }),
      });
      if (!res.ok) throw new Error("Échec de la mise à jour");
      setSites((prev) =>
        prev.map((s) => ({ ...s, primary: s.id === id }))
      );
    } catch (err) {
      console.error(err);
    }
  }

  const isEditing = editingId !== null || creating;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">
            Sites de l&apos;organisation
          </h3>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Gérez les adresses physiques et bureaux du client
          </p>
        </div>
        {!isEditing && (
          <Button variant="primary" size="md" onClick={startCreate}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Nouveau site
          </Button>
        )}
      </div>

      {isEditing && (
        <Card className="border-blue-200 bg-blue-50/30">
          <div className="p-5 space-y-3">
            <h4 className="text-[13px] font-semibold text-slate-900">
              {editingId ? "Modifier le site" : "Nouveau site"}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Nom du site"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Siège social Québec"
              />
              <Input
                label="Téléphone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 514 555-0100"
              />
              <AddressAutocomplete
                label="Adresse"
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                onSelect={(result) => {
                  setForm((f) => ({
                    ...f,
                    address: result.street || f.address,
                    city: result.city
                      ? result.province
                        ? `${result.city}, ${result.province}`
                        : result.city
                      : f.city,
                  }));
                }}
                placeholder="Commencez à taper une adresse..."
              />
              <Input
                label="Ville"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Québec, QC"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, primary: !form.primary })}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
                  form.primary ? "bg-blue-600" : "bg-slate-300"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow translate-y-0.5",
                    form.primary ? "translate-x-[18px]" : "translate-x-0.5"
                  )}
                />
              </button>
              <span className="text-[12.5px] text-slate-700">
                Site principal
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                Annuler
              </Button>
              <Button variant="primary" size="sm" onClick={saveSite}>
                Enregistrer
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/60">
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Nom
                </th>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Adresse
                </th>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Ville
                </th>
                <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Téléphone
                </th>
                <th className="px-4 py-3 text-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Principal
                </th>
                <th className="px-4 py-3 text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sites.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-slate-50/80 transition-colors group"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {s.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-[12.5px]">
                    {s.address}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-[12.5px]">
                    {s.city}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-[12.5px]">
                    {s.phone}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.primary ? (
                      <Badge variant="primary">Principal</Badge>
                    ) : (
                      <button
                        onClick={() => setPrimary(s.id)}
                        className="text-[11px] text-slate-400 hover:text-blue-600"
                      >
                        Définir
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(s)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteSite(s.id)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sites.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-[13px]">
                    Aucun site. Cliquez sur « Nouveau site » pour en créer un.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <OrgNetworkSection
        organizationId={organizationId}
        sites={sites.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}

// ---------- Component ----------
export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const startImpersonation = usePortalImpersonation((s) => s.startImpersonation);
  const [removedPortalAccess, setRemovedPortalAccess] = useState<Set<string>>(new Set());
  const [dbPortalUsers, setDbPortalUsers] = useState<
    Array<{ id: string; name: string; email: string; role: ClientPortalPermissions["portalRole"] | null }> | null
  >(null);
  const slugOrId = (params.slug || params.id) as string;
  const [orgId, setOrgId] = useState<string>(slugOrId);

  // Resolve slug to org ID if the URL param is a slug (not a cuid)
  useEffect(() => {
    if (slugOrId && !slugOrId.match(/^c[a-z0-9]{20,}/)) {
      fetch(`/api/v1/organizations/resolve?slug=${encodeURIComponent(slugOrId)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.id) setOrgId(d.id); })
        .catch(() => {});
    }
  }, [slugOrId]);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [tabSearch, setTabSearch] = useState("");
  // Les onglets Facturation / Contrats / Rapports exposent taux, revenus
  // et marges. On les gate derrière la capabilité "finances" — même pattern
  // que la sidebar. Les caps sont chargées depuis /api/v1/me (source de
  // vérité, pas le JWT qui ne se rafraîchit pas).
  const [userCapabilities, setUserCapabilities] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/v1/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.capabilities) setUserCapabilities(d.capabilities); })
      .catch(() => {});
  }, []);
  const canFinances = userCapabilities.includes("finances");
  const visibleTabs = useMemo(
    () =>
      TABS.filter((t) => {
        if (
          t.key === "billing" ||
          t.key === "contracts" ||
          t.key === "reports" ||
          t.key === "budget"
        ) {
          return canFinances;
        }
        return true;
      }),
    [canFinances],
  );
  // Si le tab actif est gaté et l'utilisateur n'a pas la cap, on retombe
  // sur "overview" pour éviter un écran blanc.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab("overview");
    }
  }, [visibleTabs, activeTab]);
  const [editingOrg, setEditingOrg] = useState<EditOrgModalOrg | null>(null);
  const [editingContact, setEditingContact] = useState<EditContactModalContact | null>(null);
  const [editingPortalUser, setEditingPortalUser] = useState<PortalAccessUser | null>(null);
  const [editingContract, setEditingContract] = useState<BillingContract | null>(null);
  const [creatingContract, setCreatingContract] = useState(false);
  const [dbOrg, setDbOrg] = useState<{
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    isActive: boolean;
    sitesCount: number;
    contactsCount: number;
    assetsCount: number;
    openTickets: number;
    activeContracts: number;
    createdAt: string;
    logo: string | null;
    monthlyReportAutoPublish?: boolean;
  } | null>(null);

  useEffect(() => {
    // Reset immédiat à chaque changement d'orgId — sinon, le temps que le
    // fetch revienne, on continue d'afficher les données de l'org précédente,
    // ce qui donne un flash visible "mauvaise compagnie".
    setDbOrg(null);
    setDbPortalUsers(null);
    let cancelled = false;
    fetch(`/api/v1/organizations/${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setDbOrg(data);
      })
      .catch(() => {});
    fetch(`/api/v1/portal-access?organizationId=${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        setDbPortalUsers(
          data.map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: (u.role || "viewer") as ClientPortalPermissions["portalRole"],
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const org = orgsMap[orgId];

  // Fallback for unknown org ids
  const fallbackOrg: OrgDetail = {
    id: orgId,
    name: "Organisation inconnue",
    slug: orgId,
    plan: "Standard",
    status: "Inactif",
    color: "bg-gray-500",
    domain: "-",
    phone: "-",
    createdAt: "-",
    openTickets: 0,
    activeContracts: 0,
    sitesCount: 0,
    contactsCount: 0,
    assetsCount: 0,
  };

  // Real DB org takes priority — overrides hardcoded mock fields when available
  const o: OrgDetail = dbOrg
    ? {
        ...(org || fallbackOrg),
        id: dbOrg.id,
        name: dbOrg.name,
        slug: dbOrg.slug,
        domain: dbOrg.domain || "—",
        status: dbOrg.isActive ? "Actif" : "Inactif",
        sitesCount: dbOrg.sitesCount,
        contactsCount: dbOrg.contactsCount,
        assetsCount: dbOrg.assetsCount,
        openTickets: dbOrg.openTickets,
        activeContracts: dbOrg.activeContracts,
        createdAt: dbOrg.createdAt,
        logo: dbOrg.logo,
      }
    : org || fallbackOrg;
  const [dbSites, setDbSites] = useState<Site[] | null>(null);
  const [sitesLoading, setSitesLoading] = useState(true);
  useEffect(() => {
    setDbSites(null);
    setSitesLoading(true);
    let cancelled = false;
    fetch(`/api/v1/sites?organizationId=${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data)) { setDbSites([]); return; }
        setDbSites(
          data.map((s: any) => ({
            id: s.id,
            name: s.name,
            address: s.address || "—",
            city: s.city || "—",
            phone: s.phone || "—",
            primary: s.primary ?? false,
          }))
        );
      })
      .catch(() => { if (!cancelled) setDbSites([]); })
      .finally(() => { if (!cancelled) setSitesLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);
  const sites = dbSites ?? [];
  const [dbContacts, setDbContacts] = useState<Contact[] | null>(null);
  const [contactsLoading, setContactsLoading] = useState(true);
  useEffect(() => {
    setDbContacts(null);
    setContactsLoading(true);
    let cancelled = false;
    fetch(`/api/v1/contacts?organizationId=${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data)) { setDbContacts([]); return; }
        setDbContacts(
          data.map((c: any) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            phone: c.phone || "—",
            jobTitle: c.jobTitle || "—",
            vip: c.vip || false,
          }))
        );
      })
      .catch(() => { if (!cancelled) setDbContacts([]); })
      .finally(() => { if (!cancelled) setContactsLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);
  const contacts = dbContacts ?? [];

  const [dbTickets, setDbTickets] = useState<OrgTicket[] | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  useEffect(() => {
    setDbTickets(null);
    setTicketsLoading(true);
    let cancelled = false;
    fetch(`/api/v1/tickets?organizationId=${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data)) { setDbTickets([]); return; }
        const STATUS_FR: Record<string, OrgTicket["status"]> = {
          new: "Nouveau",
          open: "Ouvert",
          in_progress: "En cours",
          on_site: "Sur place",
          waiting_client: "En attente",
          waiting_vendor: "En attente",
          pending: "En attente",
          resolved: "Résolu",
          closed: "Fermé",
          cancelled: "Fermé",
        };
        const PRIO_FR: Record<string, OrgTicket["priority"]> = {
          low: "Basse",
          medium: "Moyenne",
          high: "Haute",
          critical: "Critique",
        };
        setDbTickets(
          data.slice(0, 200).map((t: any) => ({
            id: t.id,
            number: t.number,
            subject: t.subject,
            status: STATUS_FR[t.status] || "Ouvert",
            priority: PRIO_FR[t.priority] || "Moyenne",
            requester: t.requesterName || "—",
            assignee: t.assigneeName,
            assigneeAvatar: t.assigneeAvatar ?? null,
            createdAt: t.createdAt,
          }))
        );
      })
      .catch(() => { if (!cancelled) setDbTickets([]); })
      .finally(() => { if (!cancelled) setTicketsLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);
  const tickets = dbTickets ?? [];

  const [dbContracts, setDbContracts] = useState<Contract[] | null>(null);
  const [contractsLoading, setContractsLoading] = useState(true);
  useEffect(() => {
    setDbContracts(null);
    setContractsLoading(true);
    let cancelled = false;
    fetch(`/api/v1/contracts?organizationId=${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data)) { setDbContracts([]); return; }
        const STATUS_FR: Record<string, Contract["status"]> = {
          ACTIVE: "Actif",
          EXPIRED: "Expiré",
          DRAFT: "Brouillon",
          CANCELLED: "Expiré",
          EXPIRING: "Actif",
        };
        setDbContracts(
          data.map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            status: STATUS_FR[c.status] || "Brouillon",
            startDate: c.startDate?.slice(0, 10) || "",
            endDate: c.endDate?.slice(0, 10) || "",
            hours: c.monthlyHours || 0,
            usedHours: 0,
          }))
        );
      })
      .catch(() => { if (!cancelled) setDbContracts([]); })
      .finally(() => { if (!cancelled) setContractsLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);
  const contracts = dbContracts ?? [];
  const assets = assetsData[orgId] || assetsData["org-1"] || [];
  const activities = useMemo(() => deriveActivities(tickets), [tickets]);

  // Tab-level search filter
  const filteredSites = useMemo(() => {
    if (!tabSearch.trim()) return sites;
    const q = tabSearch.toLowerCase();
    return sites.filter((s) => s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q) || s.address.toLowerCase().includes(q));
  }, [sites, tabSearch]);

  const filteredContacts = useMemo(() => {
    if (!tabSearch.trim()) return contacts;
    const q = tabSearch.toLowerCase();
    return contacts.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.jobTitle.toLowerCase().includes(q));
  }, [contacts, tabSearch]);

  const filteredTickets = useMemo(() => {
    if (!tabSearch.trim()) return tickets;
    const q = tabSearch.toLowerCase();
    return tickets.filter((t) => t.subject.toLowerCase().includes(q) || t.number.toLowerCase().includes(q) || t.requester.toLowerCase().includes(q));
  }, [tickets, tabSearch]);

  const filteredContracts = useMemo(() => {
    if (!tabSearch.trim()) return contracts;
    const q = tabSearch.toLowerCase();
    return contracts.filter((c) => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [contracts, tabSearch]);

  const filteredAssets = useMemo(() => {
    if (!tabSearch.trim()) return assets;
    const q = tabSearch.toLowerCase();
    return assets.filter((a) => a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q) || a.serial.toLowerCase().includes(q) || a.site.toLowerCase().includes(q));
  }, [assets, tabSearch]);

  const showTabSearch = activeTab !== "overview";

  // Tant que la vraie org n'est pas chargée, on affiche un loader plutôt
  // que les données mock figées (qui faisaient apparaître brièvement la
  // mauvaise compagnie).
  if (!dbOrg) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux organisations
        </Link>
        <PageLoader variant="detail" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Back */}
      <Link href="/organizations" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors w-fit">
        <ArrowLeft className="h-4 w-4" />
        Retour aux organisations
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4 min-w-0">
          {o.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={o.logo}
              alt={o.name}
              className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl object-contain bg-white ring-1 ring-slate-200 shrink-0"
            />
          ) : (
            <div className={cn("flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl text-xl font-bold text-white shrink-0", o.color)}>
              {o.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 break-words">{o.name}</h1>
              <Badge variant={planBadgeVariant(o.plan)}>{o.plan}</Badge>
              <Badge variant={statusBadgeVariant(o.status)}>{o.status}</Badge>
            </div>
            <p className="mt-0.5 text-[12px] sm:text-sm text-gray-500 truncate">{o.domain}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrgDossierExportButton organizationId={orgId} organizationSlug={o.slug} />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setEditingOrg({
                id: o.id,
                name: o.name,
                slug: o.slug,
                plan: o.plan,
                domain: o.domain,
                isActive: o.status === "Actif",
                clientCode: (dbOrg as any)?.clientCode || null,
                website: (dbOrg as any)?.website || null,
                description: (dbOrg as any)?.description || null,
                phone: (dbOrg as any)?.phone || null,
                address: (dbOrg as any)?.address || null,
                city: (dbOrg as any)?.city || null,
                province: (dbOrg as any)?.province || null,
                postalCode: (dbOrg as any)?.postalCode || null,
                country: (dbOrg as any)?.country || null,
                logo: (dbOrg as any)?.logo || null,
                calendarAliases: (dbOrg as any)?.calendarAliases ?? [],
              })
            }
          >
            <Pencil className="h-4 w-4" />
            <span className="hidden sm:inline">Modifier</span>
          </Button>
        </div>
      </div>

      <EditOrgModal
        open={!!editingOrg}
        onClose={() => setEditingOrg(null)}
        org={editingOrg}
      />

      <EditContactModal
        open={!!editingContact}
        onClose={() => setEditingContact(null)}
        contact={editingContact}
      />

      <EditPortalAccessModal
        open={!!editingPortalUser}
        user={editingPortalUser}
        onClose={() => setEditingPortalUser(null)}
        onSave={() => setEditingPortalUser(null)}
      />

      {(editingContract || creatingContract) && (
        <ContractModal
          contract={editingContract}
          onClose={() => {
            setEditingContract(null);
            setCreatingContract(false);
          }}
          onSave={() => {
            setEditingContract(null);
            setCreatingContract(false);
          }}
        />
      )}


      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setTabSearch(""); }}
              className={cn(
                "relative px-4 py-3 text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>
      {showTabSearch && (
        <div className="w-full max-w-xl mt-4 mb-2">
          <Input
            placeholder="Rechercher..."
            value={tabSearch}
            onChange={(e) => setTabSearch(e.target.value)}
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
      )}

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 flex flex-col gap-4 sm:gap-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 lg:gap-4">
              {[
                { label: "Tickets ouverts", value: o.openTickets, icon: Ticket, color: "text-blue-600 bg-blue-50" },
                { label: "Contrats actifs", value: o.activeContracts, icon: FileText, color: "text-emerald-600 bg-emerald-50" },
                { label: "Sites", value: o.sitesCount, icon: MapPin, color: "text-violet-600 bg-violet-50" },
                { label: "Contacts", value: o.contactsCount, icon: Users, color: "text-amber-600 bg-amber-50" },
                { label: "Actifs", value: o.assetsCount, icon: Monitor, color: "text-rose-600 bg-rose-50" },
              ].map((stat) => (
                <Card key={stat.label} className="p-4 text-center">
                  <div className={cn("mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg", stat.color)}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                </Card>
              ))}
            </div>

            {/* Recent Tickets */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tickets récents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-gray-100">
                  {tickets.slice(0, 5).map((t) => (
                    <Link
                      key={t.id}
                      href={`/tickets/${t.id}?back=${encodeURIComponent(`/organizations/${orgId}`)}`}
                      className="-mx-2 flex items-center justify-between rounded-md px-2 py-3 first:pt-0 last:pb-0 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {ticketStatusIcon(t.status)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-400">{t.number}</span>
                            <span className="text-sm font-medium text-gray-900 hover:text-blue-700">{t.subject}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{t.requester} - {new Date(t.createdAt).toLocaleDateString("fr-CA")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={priorityColor(t.priority)}>{t.priority}</Badge>
                        <Badge variant={statusBadgeVariant(t.status)}>{t.status}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            {/* Info card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Informations</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                    <div>
                      <dt className="text-xs text-gray-500">Domaine</dt>
                      <dd className="text-sm font-medium text-gray-900">{o.domain}</dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                    <div>
                      <dt className="text-xs text-gray-500">Téléphone</dt>
                      <dd className="text-sm font-medium text-gray-900">{o.phone}</dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                    <div>
                      <dt className="text-xs text-gray-500">Plan</dt>
                      <dd className="text-sm"><Badge variant={planBadgeVariant(o.plan)}>{o.plan}</Badge></dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                    <div>
                      <dt className="text-xs text-gray-500">Date de création</dt>
                      <dd className="text-sm font-medium text-gray-900">{o.createdAt !== "-" ? new Date(o.createdAt).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "-"}</dd>
                    </div>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {/* Activity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Activité récente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activities.map((a) => {
                    const href =
                      a.href ??
                      (a.type === "ticket"
                        ? `/tickets?organizationId=${orgId}`
                        : a.type === "contact"
                        ? `/contacts?organizationId=${orgId}`
                        : a.type === "asset"
                        ? `/assets?organizationId=${orgId}`
                        : null);
                    const inner = (
                      <>
                        <div className="mt-0.5 shrink-0">{activityIcon(a.type)}</div>
                        <div>
                          <p className="text-sm text-gray-700">{a.text}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{a.time}</p>
                        </div>
                      </>
                    );
                    return href ? (
                      <Link
                        key={a.id}
                        href={href}
                        className="-mx-2 flex gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 transition-colors"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div key={a.id} className="flex gap-3">
                        {inner}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-3">
            <OrgMaturitySection organizationId={orgId} />
          </div>
          <div className="lg:col-span-3 grid gap-4 md:grid-cols-2">
            <ChangesOverviewWidget organizationId={orgId} />
            <RenewalsWidget organizationId={orgId} />
          </div>
          <div className="lg:col-span-3">
            <OrgCapabilitiesSection organizationId={orgId} />
          </div>
        </div>
      )}

      {/* Sites Tab */}
      {activeTab === "sites" && (
        <OrgSitesTab initialSites={filteredSites} organizationId={orgId} />
      )}

      {/* Contacts Tab */}
      {activeTab === "contacts" && (
        <Card className="overflow-hidden">
          {contactsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                <p className="text-[13px] text-slate-500">Chargement des contacts...</p>
              </div>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Courriel</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Téléphone</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Poste</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">VIP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContacts.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50/80 transition-colors cursor-pointer"
                    onClick={() =>
                      setEditingContact({
                        id: c.id,
                        name: `${c.firstName} ${c.lastName}`,
                        email: c.email,
                        phone: c.phone,
                        organization: o.name,
                        jobTitle: c.jobTitle,
                        isVIP: c.vip,
                      })
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                          {c.firstName.charAt(0)}{c.lastName.charAt(0)}
                        </div>
                        <span className="font-medium text-gray-900">{c.firstName} {c.lastName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.email}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                    <td className="px-4 py-3 text-gray-600">{c.jobTitle}</td>
                    <td className="px-4 py-3 text-center">
                      {c.vip && <Star className="inline h-4 w-4 text-amber-500 fill-amber-500" />}
                    </td>
                  </tr>
                ))}
                {filteredContacts.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">Aucun contact trouvé.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      )}

      {/* Tickets Tab */}
      {activeTab === "tickets" && (
        ticketsLoading ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                <p className="text-[13px] text-slate-500">Chargement des tickets...</p>
              </div>
            </div>
          </Card>
        ) : (
          <OrgTicketsTab tickets={filteredTickets} />
        )
      )}

      {/* Billing Tab — overrides tarifaires + rapports mensuels + auto-publish */}
      {activeTab === "billing" && canFinances && (
        <div className="space-y-6">
          <ClientBillingOverridesSection
            organizationId={orgId}
            organizationName={o.name}
          />

          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                <FileText className="h-4.5 w-4.5 text-indigo-700" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">
                  Rapports mensuels (livrables client)
                </h3>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  Génération PDF, publication automatique et historique des
                  rapports envoyés au client.
                </p>
              </div>
            </div>
            <OrgMonthlyReportsTab
              organizationId={orgId}
              initialAutoPublish={dbOrg?.monthlyReportAutoPublish ?? false}
            />
          </div>
        </div>
      )}

      {/* Contracts Tab */}
      {activeTab === "contracts" && canFinances && (
        <Card className="overflow-hidden">
          {contractsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                <p className="text-[13px] text-slate-500">Chargement des contrats...</p>
              </div>
            </div>
          ) : (
          <>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">
                Contrats actifs
              </h3>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Gérez les ententes contractuelles avec ce client
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => setCreatingContract(true)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Nouveau contrat
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Début</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Fin</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Heures</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContracts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.type}</td>
                    <td className="px-4 py-3"><Badge variant={statusBadgeVariant(c.status)}>{c.status}</Badge></td>
                    <td className="px-4 py-3 text-gray-500">{new Date(c.startDate).toLocaleDateString("fr-CA")}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(c.endDate).toLocaleDateString("fr-CA")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              c.usedHours / c.hours > 0.9 ? "bg-red-500" : c.usedHours / c.hours > 0.7 ? "bg-amber-500" : "bg-blue-500"
                            )}
                            style={{ width: `${Math.min(100, (c.usedHours / c.hours) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{c.usedHours}/{c.hours}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Build a Contract object from the displayed row
                          const fakeContract: BillingContract = {
                            id: c.id,
                            organizationId: orgId,
                            organizationName: org?.name || "",
                            name: c.name,
                            contractNumber: c.id,
                            type: "hour_bank" as const,
                            status: "active" as const,
                            billingProfileId: "bp_standard",
                            startDate: c.startDate,
                            endDate: c.endDate,
                            description: "",
                            autoRenew: false,
                            hourBank: {
                              totalHoursPurchased: c.hours,
                              hoursConsumed: c.usedHours,
                              eligibleTimeTypes: ["remote_work", "onsite_work", "preparation", "follow_up"],
                              carryOverHours: false,
                              allowOverage: true,
                              overageRate: 145,
                              includesTravel: false,
                              includesOnsite: true,
                              validFrom: c.startDate,
                              validTo: c.endDate,
                            },
                            createdAt: c.startDate,
                            updatedAt: c.startDate,
                          };
                          setEditingContract(fakeContract);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredContracts.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Aucun contrat trouvé. Cliquez sur « Nouveau contrat » pour commencer.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
          )}
        </Card>
      )}

      {/* Rapports : fusion analytique ad-hoc (OrgReportsTab) + rapports
          mensuels (livrables client PDF). Un seul onglet, deux sections. */}
      {activeTab === "reports" && canFinances && (
        <div className="space-y-6">
          {/* Rapports personnalisés attribués à cette org — synchronisés
              avec /analytics/dashboards. Wrappé en error boundary. */}
          <OrgAnalyticsWorkbench organizationId={orgId} organizationName={o.name} />

          <OrgHistorySection organizationId={orgId} />

          <OrgReportsTab organizationId={orgId} />
        </div>
      )}

      {/* Particularités — connaissances opérationnelles spécifiques au client. */}
      {activeTab === "particularities" && (
        <OrgParticularitiesTab organizationId={orgId} organizationName={o.name} />
      )}

      {/* Politiques / Logiciels / Changements — placeholders avant modules dédiés.
          Chaque entrée redirige vers la bibliothèque globale filtrée pour l'org. */}
      {activeTab === "policies" && (
        <OrgPoliciesTab organizationId={orgId} organizationName={o.name} />
      )}
      {activeTab === "software" && (
        <OrgSoftwareTab organizationId={orgId} organizationName={o.name} />
      )}
      {activeTab === "changes" && (
        <OrgChangesTab organizationId={orgId} organizationName={o.name} />
      )}

      {/* Budget TI — annuel, construit par Cetix, approuvé par le client. */}
      {activeTab === "budget" && (
        <OrgBudgetTab organizationId={orgId} organizationName={o.name} />
      )}

      {/* Intelligence IA Tab — Phase 3 : analyse risques, rapports
          exécutifs mensuels, opportunités commerciales. */}
      {activeTab === "ai" && (
        <OrgAiIntelligenceTab
          organizationId={orgId}
          organizationSlug={slugOrId}
        />
      )}

      {/* Portal Access Tab */}
      {activeTab === "portal_access" && (
        <OrgPortalSection
          organizationId={orgId}
          organizationName={o.name}
        />
      )}

      {/* Assets Tab — sous-onglets Matériel / Logiciels (redirect) / Engagements */}
      {activeTab === "assets" && (
        <OrgAssetsTabWrapper organizationId={orgId} organizationName={(org || fallbackOrg).name} />
      )}

      {/* SLA Tab */}
      {activeTab === "sla" && (
        <OrgSlaSection
          organizationId={orgId}
          organizationName={o.name}
        />
      )}
    </div>
  );
}

// Placeholder utilisé pour les onglets Politiques / Logiciels / Changements
// tant que leurs composants dédiés ne sont pas livrés (phases B2/B3/B4).
// L'URL `href` pointe vers la bibliothèque globale filtrée pour cette org
// — évite de paraître vide sans perdre l'entrée de nav.
function ModuleStub({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Card>
      <div className="p-10 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Icon className="h-7 w-7 text-slate-500" />
        </div>
        <h3 className="text-[17px] font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 mx-auto max-w-md text-[13px] text-slate-600 leading-relaxed">
          {description}
        </p>
        <p className="mt-3 mx-auto max-w-md text-[12px] text-slate-500">
          Ce module arrive bientôt dans la fiche organisation. En attendant, la
          bibliothèque globale permet déjà de gérer les contenus.
        </p>
        <Link
          href={href}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-medium px-3.5 py-2"
        >
          Ouvrir la bibliothèque
        </Link>
      </div>
    </Card>
  );
}
