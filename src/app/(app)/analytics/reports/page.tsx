"use client";

// ============================================================================
// Rapports programmés — programmation d'un ou plusieurs dashboards à envoyer
// par courriel à des destinataires, pour une ou plusieurs organisations.
//
// Modèle :
//   - Un rapport = liste ordonnée de dashboards + liste d'orgs + destinataires
//   - Si assigné à une ou plusieurs orgs, le rapport apparaît dans l'onglet
//     Rapports de chaque org. Les dashboards y sont alors filtrés automatique-
//     ment par l'organisationId courante (géré dans le widget renderer).
//
// Stockage : localStorage (nexus:scheduled-reports) — partagé avec l'onglet
// Rapports des organisations (org-analytics-workbench).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText, Plus, Send, Building2, Loader2, Trash2, Mail, X, Pencil,
  LayoutDashboard, ChevronUp, ChevronDown, Calendar, Copy, Power,
  Check, Search, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AnalyticsSectionTabs } from "@/components/analytics/section-tabs";

// ===========================================================================
// Data model
// ===========================================================================

interface ScheduledReport {
  id: string;
  name: string;
  description: string;
  /** Dashboards inclus, dans l'ordre choisi par l'utilisateur. */
  dashboardIds: string[];
  /** Organisations ciblées. Vide = global (pas associé à un client). */
  organizationIds: string[];
  /** Destinataires (emails). */
  recipients: string[];
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "on_demand";
  format: "pdf" | "html_email" | "excel";
  isActive: boolean;
  lastSentAt?: string | null;
  nextSendAt?: string | null;
  createdAt: string;
}

interface DashboardSummary {
  id: string;
  label: string;
  description?: string;
  category?: string;
  parentId?: string | null;
  organizationIds?: string[];
  organizationId?: string;
}

interface OrgSummary { id: string; name: string; clientCode?: string | null }

const FREQUENCIES: Array<{ id: ScheduledReport["frequency"]; label: string }> = [
  { id: "weekly",     label: "Hebdomadaire" },
  { id: "biweekly",   label: "Aux deux semaines" },
  { id: "monthly",    label: "Mensuel" },
  { id: "quarterly",  label: "Trimestriel" },
  { id: "on_demand",  label: "Sur demande" },
];

const FORMATS: Array<{ id: ScheduledReport["format"]; label: string }> = [
  { id: "pdf",        label: "PDF" },
  { id: "html_email", label: "Courriel HTML" },
  { id: "excel",      label: "Excel" },
];

const FREQ_LABEL: Record<string, string> = Object.fromEntries(FREQUENCIES.map((f) => [f.id, f.label]));
const FORMAT_LABEL: Record<string, string> = Object.fromEntries(FORMATS.map((f) => [f.id, f.label]));

// Dashboards built-in (miroir du catalogue dans /analytics/dashboards).
// Synchronisé manuellement — pas de dépendance circulaire.
const BUILTIN_DASHBOARDS: DashboardSummary[] = [
  { id: "monthly_billing",  label: "Rapport mensuel de facturation", description: "Heures et revenus pour le mois (par client, couverture)", category: "facturation" },
  { id: "ticket_overview",  label: "Vue d'ensemble des tickets", description: "Volume, distribution, SLA et tendances", category: "tickets" },
  { id: "agent_review",     label: "Revue de performance des techniciens", description: "Heures, revenus, tickets résolus par technicien", category: "performance" },
  { id: "profitability",    label: "Analyse de rentabilité", description: "Taux facturable, horaire moyen, revenus par client", category: "facturation" },
  { id: "sla_compliance",   label: "Conformité SLA", description: "Tickets SLA dépassés, conformité, résolution", category: "tickets" },
  { id: "contract_review",  label: "Revue des contrats", description: "Utilisation des heures, dépassements, valeur récurrente", category: "contrats" },
  { id: "client_ranking",   label: "Classement des clients", description: "Clients par revenus, tickets, heures", category: "facturation" },
  { id: "quickbooks_report",label: "Rapport QuickBooks", description: "AR, revenus, vieillissement, P&L", category: "facturation" },
  { id: "full_report",      label: "Rapport complet", description: "Tous les indicateurs combinés", category: "complet" },
];

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("fr-CA"); } catch { return "—"; }
}

// ===========================================================================
// Persistence — localStorage + migration des anciens enregistrements
// ===========================================================================

const STORAGE_KEY = "nexus:scheduled-reports";
const CUSTOM_DASHBOARDS_KEY = "nexus:reports:custom";

interface ReportInput {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  dashboardIds?: unknown;
  widgets?: unknown;
  organizationIds?: unknown;
  organizationId?: unknown;
  recipients?: unknown;
  frequency?: unknown;
  format?: unknown;
  isActive?: unknown;
  lastSentAt?: unknown;
  nextSendAt?: unknown;
  createdAt?: unknown;
}

function loadReports(): ScheduledReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r: ReportInput): ScheduledReport => ({
      id: String(r.id ?? `sr_${Date.now()}`),
      name: String(r.name ?? "Sans nom"),
      description: String(r.description ?? ""),
      // Migration : l'ancien modèle stockait des widget IDs dans `widgets[]`.
      // On les jette — le nouveau modèle exige des dashboard IDs explicites,
      // l'utilisateur les resélectionnera.
      dashboardIds: Array.isArray(r.dashboardIds) ? r.dashboardIds.filter((x): x is string => typeof x === "string") : [],
      organizationIds: Array.isArray(r.organizationIds)
        ? r.organizationIds.filter((x): x is string => typeof x === "string")
        : (typeof r.organizationId === "string" && r.organizationId ? [r.organizationId] : []),
      recipients: Array.isArray(r.recipients) ? r.recipients.filter((x): x is string => typeof x === "string") : [],
      frequency: ((): ScheduledReport["frequency"] => {
        const f = String(r.frequency ?? "monthly");
        return (FREQUENCIES.some((x) => x.id === f) ? f : "monthly") as ScheduledReport["frequency"];
      })(),
      format: ((): ScheduledReport["format"] => {
        const f = String(r.format ?? "pdf");
        return (FORMATS.some((x) => x.id === f) ? f : "pdf") as ScheduledReport["format"];
      })(),
      isActive: r.isActive !== false,
      lastSentAt: typeof r.lastSentAt === "string" ? r.lastSentAt : null,
      nextSendAt: typeof r.nextSendAt === "string" ? r.nextSendAt : null,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    }));
  } catch { return []; }
}

function saveReports(reports: ScheduledReport[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reports)); } catch {}
}

function loadCustomDashboards(): DashboardSummary[] {
  try {
    const raw = localStorage.getItem(CUSTOM_DASHBOARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// ===========================================================================
// Page
// ===========================================================================

export default function AnalyticsReportsPage() {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [customDashboards, setCustomDashboards] = useState<DashboardSummary[]>([]);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [editing, setEditing] = useState<ScheduledReport | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setReports(loadReports());
    setCustomDashboards(loadCustomDashboards());
    fetch("/api/v1/organizations")
      .then((r) => r.ok ? r.json() : [])
      .then((list: OrgSummary[]) => { setOrgs(Array.isArray(list) ? list : []); })
      .catch(() => setOrgs([]))
      .finally(() => setLoadingOrgs(false));
  }, []);

  const allDashboards: DashboardSummary[] = useMemo(
    () => [...BUILTIN_DASHBOARDS, ...customDashboards],
    [customDashboards],
  );
  const dashboardById = useMemo(() => {
    const m: Record<string, DashboardSummary> = {};
    for (const d of allDashboards) m[d.id] = d;
    return m;
  }, [allDashboards]);
  const orgById = useMemo(() => {
    const m: Record<string, OrgSummary> = {};
    for (const o of orgs) m[o.id] = o;
    return m;
  }, [orgs]);

  function openCreate() {
    setEditing({
      id: `sr_${Date.now()}`,
      name: "",
      description: "",
      dashboardIds: [],
      organizationIds: [],
      recipients: [],
      frequency: "monthly",
      format: "pdf",
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    setShowForm(true);
  }

  function openEdit(r: ScheduledReport) {
    setEditing({ ...r });
    setShowForm(true);
  }

  function persist(next: ScheduledReport[]) {
    setReports(next);
    saveReports(next);
  }

  function save(r: ScheduledReport) {
    const exists = reports.some((x) => x.id === r.id);
    const next = exists
      ? reports.map((x) => (x.id === r.id ? r : x))
      : [...reports, r];
    persist(next);
    setShowForm(false);
    setEditing(null);
  }

  function remove(id: string) {
    if (!confirm("Supprimer ce rapport programmé ?")) return;
    persist(reports.filter((r) => r.id !== id));
  }

  function duplicate(r: ScheduledReport) {
    const clone: ScheduledReport = {
      ...r,
      id: `sr_${Date.now()}`,
      name: `${r.name} (copie)`,
      createdAt: new Date().toISOString(),
      lastSentAt: null,
    };
    persist([...reports, clone]);
  }

  function toggleActive(r: ScheduledReport) {
    persist(reports.map((x) => (x.id === r.id ? { ...x, isActive: !x.isActive } : x)));
  }

  function sendNow(r: ScheduledReport) {
    // Stub — pas encore d'intégration email. Met à jour lastSentAt pour la
    // démo et informe l'utilisateur.
    const updated: ScheduledReport = { ...r, lastSentAt: new Date().toISOString() };
    persist(reports.map((x) => (x.id === r.id ? updated : x)));
    alert(
      `Envoi simulé du rapport « ${r.name} » à ${r.recipients.length} destinataire(s).\n\n`
      + `L'intégration email sera branchée ultérieurement — pour l'instant seule la date « Dernier envoi » est mise à jour.`,
    );
  }

  return (
    <div className="space-y-5">
      <AnalyticsSectionTabs section="reports" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Rapports programmés</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Chaque rapport assemble un ou plusieurs dashboards à envoyer par courriel.
            Les rapports assignés à une organisation apparaissent dans son onglet Rapports
            avec un filtre d&apos;organisation appliqué automatiquement.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> Nouveau rapport
        </Button>
      </div>

      <Link href="/analytics/monthly-reports" className="block">
        <Card className="border-blue-200 bg-blue-50/40 hover:bg-blue-50 transition-colors">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-slate-900">
                Rapports mensuels client (PDF générés)
              </p>
              <p className="text-[12px] text-slate-600">
                Livrable mensuel par client — heures facturées, tickets, déplacements,
                demandeurs. Générés depuis la fiche organisation.
              </p>
            </div>
            <Button variant="outline" size="sm">Voir les rapports →</Button>
          </CardContent>
        </Card>
      </Link>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Calendar className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-[15px] font-semibold text-slate-900">Aucun rapport programmé</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Crée ton premier rapport pour envoyer automatiquement des dashboards par courriel.
            </p>
            <Button variant="primary" size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Nouveau rapport
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              dashboardById={dashboardById}
              orgById={orgById}
              onEdit={() => openEdit(r)}
              onDuplicate={() => duplicate(r)}
              onDelete={() => remove(r.id)}
              onToggleActive={() => toggleActive(r)}
              onSendNow={() => sendNow(r)}
            />
          ))}
        </div>
      )}

      {showForm && editing && (
        <ReportFormModal
          report={editing}
          allDashboards={allDashboards}
          orgs={orgs}
          orgsLoading={loadingOrgs}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={save}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Report card
// ===========================================================================

function ReportCard({
  report, dashboardById, orgById, onEdit, onDuplicate, onDelete, onToggleActive, onSendNow,
}: {
  report: ScheduledReport;
  dashboardById: Record<string, DashboardSummary>;
  orgById: Record<string, OrgSummary>;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onSendNow: () => void;
}) {
  const dashboards = report.dashboardIds.map((id) => dashboardById[id]).filter(Boolean) as DashboardSummary[];
  const orgs = report.organizationIds.map((id) => orgById[id]).filter(Boolean) as OrgSummary[];
  const missingDashboards = report.dashboardIds.length - dashboards.length;

  return (
    <Card className={cn(!report.isActive && "opacity-70")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[14.5px] font-semibold text-slate-900">{report.name || "Sans nom"}</h3>
              {!report.isActive && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">
                  Désactivé
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 ring-1 ring-inset ring-slate-200 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                <Calendar className="h-2.5 w-2.5" />
                {FREQ_LABEL[report.frequency] ?? report.frequency}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 ring-1 ring-inset ring-slate-200 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                {FORMAT_LABEL[report.format] ?? report.format}
              </span>
            </div>
            {report.description && <p className="text-[12px] text-slate-500 mt-1">{report.description}</p>}

            <div className="mt-2.5 flex items-start gap-2 flex-wrap text-[11.5px] text-slate-600">
              <div className="inline-flex items-center gap-1">
                <LayoutDashboard className="h-3 w-3 text-blue-500" />
                <span>
                  {dashboards.length} dashboard{dashboards.length !== 1 ? "s" : ""}
                  {missingDashboards > 0 && (
                    <span className="ml-1 text-amber-700 bg-amber-50 rounded px-1 inline-flex items-center gap-0.5">
                      <AlertCircle className="h-2.5 w-2.5" /> {missingDashboards} introuvable{missingDashboards > 1 ? "s" : ""}
                    </span>
                  )}
                </span>
              </div>
              <span className="text-slate-300">·</span>
              <div className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3 text-emerald-500" />
                <span>
                  {orgs.length === 0 ? "Global (non assigné)" : `${orgs.length} organisation${orgs.length > 1 ? "s" : ""}`}
                </span>
              </div>
              <span className="text-slate-300">·</span>
              <div className="inline-flex items-center gap-1">
                <Mail className="h-3 w-3 text-violet-500" />
                <span>{report.recipients.length} destinataire{report.recipients.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {dashboards.length > 0 && (
              <div className="mt-2 flex items-center gap-1 flex-wrap">
                {dashboards.map((d, i) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-1 rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-[10.5px] font-medium"
                  >
                    <span className="text-blue-400 tabular-nums">{i + 1}</span>
                    {d.label}
                  </span>
                ))}
              </div>
            )}
            {orgs.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                {orgs.map((o) => (
                  <span key={o.id} className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10.5px] font-medium">
                    <Building2 className="h-2.5 w-2.5" />
                    {o.name}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-2 text-[10.5px] text-slate-400 flex items-center gap-3">
              <span>Créé le {fmtDate(report.createdAt)}</span>
              {report.lastSentAt && <span>· Dernier envoi : {fmtDate(report.lastSentAt)}</span>}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button variant="primary" size="sm" onClick={onSendNow} disabled={!report.isActive || report.recipients.length === 0}>
              <Send className="h-3.5 w-3.5" /> Envoyer
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit} title="Éditer">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={onDuplicate} title="Dupliquer">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={onToggleActive} title={report.isActive ? "Désactiver" : "Réactiver"}>
              <Power className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete} title="Supprimer">
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Create/edit modal
// ===========================================================================

function ReportFormModal({
  report, allDashboards, orgs, orgsLoading, onCancel, onSave,
}: {
  report: ScheduledReport;
  allDashboards: DashboardSummary[];
  orgs: OrgSummary[];
  orgsLoading: boolean;
  onCancel: () => void;
  onSave: (r: ScheduledReport) => void;
}) {
  const [draft, setDraft] = useState<ScheduledReport>(report);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [newRecipient, setNewRecipient] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const dashboardById = useMemo(() => {
    const m: Record<string, DashboardSummary> = {};
    for (const d of allDashboards) m[d.id] = d;
    return m;
  }, [allDashboards]);

  const selectedDashboards = draft.dashboardIds
    .map((id) => dashboardById[id])
    .filter(Boolean) as DashboardSummary[];

  const availableDashboards = useMemo(() => {
    const q = dashboardSearch.trim().toLowerCase();
    return allDashboards.filter((d) => {
      if (draft.dashboardIds.includes(d.id)) return false;
      if (!q) return true;
      return (
        d.label.toLowerCase().includes(q)
        || (d.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [allDashboards, draft.dashboardIds, dashboardSearch]);

  const filteredOrgs = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) =>
      o.name.toLowerCase().includes(q) ||
      (o.clientCode ?? "").toLowerCase().includes(q)
    );
  }, [orgs, orgSearch]);

  function addDashboard(id: string) {
    setDraft((d) => ({ ...d, dashboardIds: [...d.dashboardIds, id] }));
  }
  function removeDashboard(id: string) {
    setDraft((d) => ({ ...d, dashboardIds: d.dashboardIds.filter((x) => x !== id) }));
  }
  function moveDashboard(id: string, delta: -1 | 1) {
    setDraft((d) => {
      const idx = d.dashboardIds.indexOf(id);
      if (idx < 0) return d;
      const to = idx + delta;
      if (to < 0 || to >= d.dashboardIds.length) return d;
      const next = [...d.dashboardIds];
      [next[idx], next[to]] = [next[to], next[idx]];
      return { ...d, dashboardIds: next };
    });
  }
  function toggleOrg(id: string) {
    setDraft((d) => ({
      ...d,
      organizationIds: d.organizationIds.includes(id)
        ? d.organizationIds.filter((x) => x !== id)
        : [...d.organizationIds, id],
    }));
  }
  function addRecipient() {
    const email = newRecipient.trim();
    if (!email || !email.includes("@")) return;
    if (draft.recipients.includes(email)) { setNewRecipient(""); return; }
    setDraft((d) => ({ ...d, recipients: [...d.recipients, email] }));
    setNewRecipient("");
  }
  function removeRecipient(email: string) {
    setDraft((d) => ({ ...d, recipients: d.recipients.filter((x) => x !== email) }));
  }

  const canSave = draft.name.trim().length > 0 && draft.dashboardIds.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className="w-full max-w-3xl h-full sm:h-auto sm:max-h-[92vh] bg-white sm:rounded-xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 shrink-0">
          <h2 className="text-[15px] font-semibold text-slate-900">
            {report.id.startsWith("sr_") && !draft.lastSentAt && draft.recipients.length === 0 && draft.dashboardIds.length === 0
              ? "Nouveau rapport programmé"
              : "Modifier le rapport"}
          </h2>
          <button onClick={onCancel} className="h-8 w-8 rounded hover:bg-slate-100 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Name + desc */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-medium text-slate-600 mb-1">Nom *</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Rapport mensuel de facturation"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-slate-600 mb-1">Description</label>
              <Input
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Facultatif"
              />
            </div>
          </div>

          {/* Dashboards */}
          <section>
            <label className="block text-[11.5px] font-medium text-slate-600 mb-2">
              Dashboards inclus * <span className="text-slate-400 font-normal">(ordre = ordre dans le courriel)</span>
            </label>

            {selectedDashboards.length > 0 ? (
              <div className="space-y-1 mb-3">
                {selectedDashboards.map((d, i) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold tabular-nums text-blue-700 w-5 text-center">{i + 1}</span>
                    <LayoutDashboard className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium text-slate-900 truncate">{d.label}</div>
                      {d.description && <div className="text-[10.5px] text-slate-500 truncate">{d.description}</div>}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveDashboard(d.id, -1)}
                        disabled={i === 0}
                        className="h-6 w-6 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center"
                        title="Monter"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDashboard(d.id, 1)}
                        disabled={i === selectedDashboards.length - 1}
                        className="h-6 w-6 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center"
                        title="Descendre"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDashboard(d.id)}
                        className="h-6 w-6 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center"
                        title="Retirer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center text-[12px] text-slate-500">
                Aucun dashboard sélectionné — choisis-en au moins un ci-dessous.
              </div>
            )}

            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={dashboardSearch}
                onChange={(e) => setDashboardSearch(e.target.value)}
                placeholder={`Ajouter un dashboard… (${availableDashboards.length} disponibles)`}
                className="w-full rounded-md border border-slate-300 pl-7 pr-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="max-h-[220px] overflow-y-auto space-y-1 rounded-md border border-slate-200 bg-slate-50/30 p-1">
              {availableDashboards.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-slate-400">
                  {dashboardSearch ? "Aucun dashboard ne correspond." : "Tous les dashboards sont déjà inclus."}
                </div>
              ) : (
                availableDashboards.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => addDashboard(d.id)}
                    className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white hover:ring-1 hover:ring-blue-200 transition-all"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium text-slate-800 truncate">{d.label}</div>
                      {d.description && <div className="text-[10.5px] text-slate-500 truncate">{d.description}</div>}
                    </div>
                    <Plus className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Organizations */}
          <section>
            <label className="block text-[11.5px] font-medium text-slate-600 mb-2">
              Organisations ciblées <span className="text-slate-400 font-normal">(aucune cochée = rapport global, non associé à un client)</span>
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                placeholder="Rechercher une organisation…"
                className="w-full rounded-md border border-slate-300 pl-7 pr-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
              />
            </div>
            {orgsLoading ? (
              <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto rounded-md border border-slate-200">
                {filteredOrgs.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12px] text-slate-400">Aucune organisation trouvée.</div>
                ) : (
                  filteredOrgs.map((o) => {
                    const checked = draft.organizationIds.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggleOrg(o.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-left border-b border-slate-100 last:border-b-0 transition-colors",
                          checked ? "bg-blue-50/50" : "hover:bg-slate-50",
                        )}
                      >
                        <div className={cn(
                          "h-4 w-4 shrink-0 rounded border flex items-center justify-center",
                          checked ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white",
                        )}>
                          {checked && <Check className="h-3 w-3" />}
                        </div>
                        <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="flex-1 text-[12.5px] text-slate-800 truncate">{o.name}</span>
                        {o.clientCode && <span className="text-[10.5px] text-slate-400 tabular-nums">#{o.clientCode}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}
            <p className="mt-1.5 text-[10.5px] text-slate-500">
              {draft.organizationIds.length === 0
                ? "Global — le rapport n'apparaîtra dans aucun onglet Rapports d'organisation."
                : `Apparaît dans l'onglet Rapports de ${draft.organizationIds.length} organisation${draft.organizationIds.length > 1 ? "s" : ""}. Les dashboards y seront filtrés automatiquement par l'organisation courante.`}
            </p>
          </section>

          {/* Recipients */}
          <section>
            <label className="block text-[11.5px] font-medium text-slate-600 mb-2">Destinataires (courriels)</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="email"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
                placeholder="ajouter@exemple.com"
                className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
              />
              <Button variant="outline" size="sm" onClick={addRecipient} disabled={!newRecipient.trim() || !newRecipient.includes("@")}>
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </Button>
            </div>
            {draft.recipients.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">Aucun destinataire — l&apos;envoi sera désactivé.</p>
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                {draft.recipients.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-200 px-2 py-0.5 text-[11.5px]">
                    <Mail className="h-2.5 w-2.5" />
                    {email}
                    <button
                      type="button"
                      onClick={() => removeRecipient(email)}
                      className="ml-0.5 h-3.5 w-3.5 rounded hover:bg-violet-200 inline-flex items-center justify-center"
                      aria-label={`Retirer ${email}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Schedule / format / active */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11.5px] font-medium text-slate-600 mb-1">Fréquence</label>
              <Select value={draft.frequency} onValueChange={(v) => setDraft((d) => ({ ...d, frequency: v as ScheduledReport["frequency"] }))}>
                <SelectTrigger className="text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-slate-600 mb-1">Format</label>
              <Select value={draft.format} onValueChange={(v) => setDraft((d) => ({ ...d, format: v as ScheduledReport["format"] }))}>
                <SelectTrigger className="text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-slate-600 mb-1">État</label>
              <label className="flex items-center gap-2 h-[38px] px-3 rounded-md border border-slate-300 bg-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                />
                <span className="text-[12.5px] text-slate-700">{draft.isActive ? "Actif" : "Désactivé"}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-3 shrink-0 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Annuler</Button>
          <Button variant="primary" size="sm" onClick={() => onSave(draft)} disabled={!canSave}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
