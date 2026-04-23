"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Send, Check, X, Download, RefreshCw, Plus, Edit3, Trash2,
  TrendingUp, AlertCircle, Archive, Clock, XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BudgetStatus = "DRAFT" | "PROPOSED" | "APPROVED" | "EXECUTING" | "CLOSED" | "REJECTED";
type LineStatus = "PLANNED" | "COMMITTED" | "INVOICED" | "PAID" | "CANCELLED";
type Visibility = "INTERNAL" | "CLIENT_ADMIN" | "CLIENT_ALL";
type Category =
  | "SUBSCRIPTIONS" | "LICENSES" | "HARDWARE" | "OBSOLESCENCE"
  | "WARRANTIES" | "SUPPORT" | "EXTERNAL_SERVICES" | "PROJECTS"
  | "TRAINING" | "TELECOM" | "CONTINGENCY" | "OTHER";

interface BudgetLine {
  id: string;
  category: Category;
  source: string;
  sourceRefType: string | null;
  sourceRefId: string | null;
  label: string;
  vendor: string | null;
  plannedMonth: number | null;
  plannedAmount: string | number;
  committedAmount: string | number | null;
  actualAmount: string | number | null;
  currency: string;
  status: LineStatus;
  visibility: Visibility;
  dueDate: string | null;
  notes: string | null;
}

interface BudgetFull {
  id: string;
  organizationId: string;
  organization: { id: string; name: string; slug: string };
  fiscalYear: number;
  title: string;
  summary: string | null;
  status: BudgetStatus;
  currency: string;
  targetAmount: string | number | null;
  contingencyPct: number;
  internalNotes: string | null;
  visibility: Visibility;
  proposedAt: string | null;
  approvedAt: string | null;
  closedAt: string | null;
  approvalId: string | null;
  lines: BudgetLine[];
  comments: Array<{ id: string; body: string; source: string; authorName: string | null; createdAt: string }>;
  versions: Array<{ id: string; version: number; statusAtSnapshot: BudgetStatus; note: string | null; createdAt: string }>;
}

const CATEGORY_LABELS: Record<Category, string> = {
  SUBSCRIPTIONS: "Abonnements",
  LICENSES: "Licences",
  HARDWARE: "Matériel",
  OBSOLESCENCE: "Désuétude / remplacements",
  WARRANTIES: "Garanties",
  SUPPORT: "Contrats de support",
  EXTERNAL_SERVICES: "Services externes",
  PROJECTS: "Projets",
  TRAINING: "Formations",
  TELECOM: "Télécom",
  CONTINGENCY: "Contingence",
  OTHER: "Autre",
};

const STATUS_META: Record<BudgetStatus, { label: string; color: string }> = {
  DRAFT: { label: "Brouillon", color: "bg-slate-100 text-slate-700 ring-slate-200" },
  PROPOSED: { label: "Proposé au client", color: "bg-amber-50 text-amber-700 ring-amber-200" },
  APPROVED: { label: "Approuvé", color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  EXECUTING: { label: "En exécution", color: "bg-blue-50 text-blue-700 ring-blue-200" },
  CLOSED: { label: "Fermé", color: "bg-slate-50 text-slate-600 ring-slate-200" },
  REJECTED: { label: "Rejeté", color: "bg-red-50 text-red-700 ring-red-200" },
};

const LINE_STATUS_META: Record<LineStatus, { label: string; color: string }> = {
  PLANNED: { label: "Prévu", color: "bg-slate-100 text-slate-700" },
  COMMITTED: { label: "Engagé", color: "bg-amber-50 text-amber-700" },
  INVOICED: { label: "Facturé", color: "bg-blue-50 text-blue-700" },
  PAID: { label: "Payé", color: "bg-emerald-50 text-emerald-700" },
  CANCELLED: { label: "Annulé", color: "bg-slate-50 text-slate-500" },
};

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}
function fmt(v: number | null | undefined, currency = "CAD"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  try { return new Intl.NumberFormat("fr-CA", { style: "currency", currency, maximumFractionDigits: 0 }).format(v); }
  catch { return `${Math.round(v)} ${currency}`; }
}

export function BudgetDetail({ budgetId }: { budgetId: string }) {
  const router = useRouter();
  const [budget, setBudget] = useState<BudgetFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    const r = await fetch(`/api/v1/budgets/${budgetId}`);
    if (r.ok) setBudget(await r.json());
    else setError(`HTTP ${r.status}`);
  }

  useEffect(() => { void load(); }, [budgetId]);

  const groupedLines = useMemo(() => {
    if (!budget) return {} as Record<Category, BudgetLine[]>;
    const g = {} as Record<Category, BudgetLine[]>;
    for (const l of budget.lines) {
      if (!g[l.category]) g[l.category] = [];
      g[l.category].push(l);
    }
    return g;
  }, [budget]);

  const totals = useMemo(() => {
    if (!budget) return { planned: 0, committed: 0, actual: 0 };
    let planned = 0, committed = 0, actual = 0;
    for (const l of budget.lines) {
      planned += num(l.plannedAmount);
      committed += num(l.committedAmount);
      actual += num(l.actualAmount);
    }
    return { planned, committed, actual };
  }, [budget]);

  async function runIngest() {
    setBusy(true); setError(null);
    const r = await fetch(`/api/v1/budgets/${budgetId}/ingest`, { method: "POST" });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b?.error || `HTTP ${r.status}`); }
    setBusy(false);
    await load();
  }

  async function propose() {
    if (!confirm("Proposer ce budget au client ? Une demande d'approbation sera créée.")) return;
    setBusy(true); setError(null);
    const r = await fetch(`/api/v1/budgets/${budgetId}/propose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b?.error || `HTTP ${r.status}`); }
    setBusy(false);
    await load();
  }

  async function decide(decision: "APPROVED" | "REJECTED") {
    const note = prompt(decision === "APPROVED" ? "Note d'approbation (optionnel)" : "Raison du rejet");
    if (decision === "REJECTED" && note === null) return;
    setBusy(true); setError(null);
    const r = await fetch(`/api/v1/budgets/${budgetId}/approve`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, decisionNote: note || null }),
    });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b?.error || `HTTP ${r.status}`); }
    setBusy(false);
    await load();
  }

  async function startExecution() {
    setBusy(true);
    const r = await fetch(`/api/v1/budgets/${budgetId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "EXECUTING" }),
    });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b?.error || `HTTP ${r.status}`); }
    setBusy(false);
    await load();
  }

  async function closeBudget() {
    if (!confirm("Clôturer définitivement ce budget ?")) return;
    setBusy(true);
    const r = await fetch(`/api/v1/budgets/${budgetId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b?.error || `HTTP ${r.status}`); }
    setBusy(false);
    await load();
  }

  if (error && !budget) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!budget) return <div className="p-6 text-sm text-slate-500">Chargement…</div>;

  const statusMeta = STATUS_META[budget.status];
  const isDraft = budget.status === "DRAFT";
  const isProposed = budget.status === "PROPOSED";
  const isApproved = budget.status === "APPROVED";
  const isExecuting = budget.status === "EXECUTING";
  const canEditLines = isDraft || isExecuting;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-2 text-[13px] text-slate-500">
        <Link href={`/organisations/${budget.organization.slug}`} className="inline-flex items-center gap-1 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {budget.organization.name}
        </Link>
        <span>›</span>
        <span className="text-slate-700">Budget {budget.fiscalYear}</span>
      </div>

      <Card>
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-semibold text-slate-900">{budget.title}</h1>
                <span className={`text-[11px] rounded px-2 py-0.5 ring-1 ring-inset ${statusMeta.color}`}>
                  {statusMeta.label}
                </span>
              </div>
              {budget.summary && <p className="text-[13px] text-slate-600 mt-1">{budget.summary}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isDraft && (
                <>
                  <Button size="sm" variant="outline" onClick={runIngest} disabled={busy}>
                    <RefreshCw className="h-4 w-4 mr-1.5" /> Ré-ingérer
                  </Button>
                  <Button size="sm" onClick={propose} disabled={busy || budget.lines.length === 0}>
                    <Send className="h-4 w-4 mr-1.5" /> Proposer au client
                  </Button>
                </>
              )}
              {isProposed && (
                <>
                  <Button size="sm" variant="outline" onClick={() => decide("REJECTED")} disabled={busy}>
                    <X className="h-4 w-4 mr-1.5" /> Rejeter
                  </Button>
                  <Button size="sm" onClick={() => decide("APPROVED")} disabled={busy}>
                    <Check className="h-4 w-4 mr-1.5" /> Approuver
                  </Button>
                </>
              )}
              {isApproved && (
                <Button size="sm" onClick={startExecution} disabled={busy}>
                  <TrendingUp className="h-4 w-4 mr-1.5" /> Démarrer exécution
                </Button>
              )}
              {isExecuting && (
                <Button size="sm" variant="outline" onClick={closeBudget} disabled={busy}>
                  <Archive className="h-4 w-4 mr-1.5" /> Clôturer
                </Button>
              )}
              <a href={`/api/v1/budgets/${budget.id}/pdf`} target="_blank" rel="noopener">
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-1.5" /> PDF
                </Button>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <KPI label="Prévu" value={fmt(totals.planned, budget.currency)} />
            <KPI label="Engagé" value={fmt(totals.committed, budget.currency)} tone="amber" />
            <KPI label="Réalisé" value={fmt(totals.actual, budget.currency)} tone="emerald" />
            <KPI label="Cible" value={budget.targetAmount != null ? fmt(num(budget.targetAmount), budget.currency) : "—"} tone="slate" />
          </div>
        </div>
      </Card>

      {error && (
        <Card><div className="p-3 text-[13px] text-red-700 bg-red-50 border border-red-100 rounded">{error}</div></Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-900">Lignes budgétaires</h2>
        {canEditLines && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Ajouter une ligne
          </Button>
        )}
      </div>

      {adding && (
        <LineForm
          budgetId={budget.id}
          currency={budget.currency}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); void load(); }}
        />
      )}

      {budget.lines.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-sm text-slate-500">
            Aucune ligne. Utilisez &laquo;&nbsp;Ré-ingérer&nbsp;&raquo; pour importer les renouvellements connus, ou ajoutez manuellement.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {(Object.keys(groupedLines) as Category[])
            .sort((a, b) => a.localeCompare(b))
            .map((cat) => (
              <CategoryGroup
                key={cat}
                category={cat}
                lines={groupedLines[cat]}
                canEdit={canEditLines}
                currency={budget.currency}
                editLineId={editLineId}
                onEdit={(id) => setEditLineId(id)}
                onCancelEdit={() => setEditLineId(null)}
                onSaved={() => { setEditLineId(null); void load(); }}
              />
            ))}
        </div>
      )}

      {budget.comments.length > 0 && (
        <Card>
          <div className="p-4 space-y-2">
            <h3 className="text-[13px] font-semibold text-slate-900">Commentaires</h3>
            <div className="space-y-2">
              {budget.comments.map((c) => (
                <div key={c.id} className="rounded border border-slate-200 p-2.5 text-[13px]">
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                    <span className={`rounded px-1.5 py-0.5 ${c.source === "portal" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}>
                      {c.source === "portal" ? "Client" : "Cetix"}
                    </span>
                    <span>{c.authorName}</span>
                    <span>·</span>
                    <span>{new Date(c.createdAt).toLocaleString("fr-CA")}</span>
                  </div>
                  <div className="text-slate-800 whitespace-pre-wrap">{c.body}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "amber" | "emerald" | "slate" }) {
  const cls = tone === "amber" ? "text-amber-700" : tone === "emerald" ? "text-emerald-700" : tone === "slate" ? "text-slate-600" : "text-slate-900";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-base sm:text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function CategoryGroup({
  category, lines, canEdit, currency, editLineId, onEdit, onCancelEdit, onSaved,
}: {
  category: Category;
  lines: BudgetLine[];
  canEdit: boolean;
  currency: string;
  editLineId: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaved: () => void;
}) {
  const total = lines.reduce((s, l) => s + num(l.plannedAmount), 0);
  return (
    <Card>
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-semibold text-slate-900">{CATEGORY_LABELS[category]}</h3>
          <div className="text-[12px] text-slate-600">
            {lines.length} ligne{lines.length > 1 ? "s" : ""} · <span className="font-medium text-slate-900">{fmt(total, currency)}</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {lines.map((l) => editLineId === l.id ? (
            <div key={l.id} className="py-2">
              <LineForm
                budgetId="" /* unused for edit */
                lineId={l.id}
                initial={l}
                currency={currency}
                onClose={onCancelEdit}
                onSaved={onSaved}
              />
            </div>
          ) : (
            <LineRow key={l.id} line={l} canEdit={canEdit} onEdit={() => onEdit(l.id)} onDeleted={onSaved} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function LineRow({ line, canEdit, onEdit, onDeleted }: { line: BudgetLine; canEdit: boolean; onEdit: () => void; onDeleted: () => void }) {
  const statusMeta = LINE_STATUS_META[line.status];
  async function del() {
    if (!confirm("Supprimer cette ligne ?")) return;
    const r = await fetch(`/api/v1/budget-lines/${line.id}`, { method: "DELETE" });
    if (r.ok) onDeleted();
    else alert(`Erreur HTTP ${r.status}`);
  }
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-[13px]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-900">{line.label}</span>
          {line.vendor && <span className="text-[11.5px] text-slate-500">· {line.vendor}</span>}
          <span className={`text-[10.5px] rounded px-1.5 py-0.5 ${statusMeta.color}`}>{statusMeta.label}</span>
          {line.source !== "MANUAL" && (
            <span className="text-[10.5px] rounded px-1.5 py-0.5 bg-violet-50 text-violet-700">Auto</span>
          )}
          {line.visibility === "INTERNAL" && (
            <span className="text-[10.5px] rounded px-1.5 py-0.5 bg-slate-100 text-slate-600">Interne</span>
          )}
        </div>
        {line.dueDate && (
          <div className="text-[11.5px] text-slate-500 mt-0.5">
            Échéance : {new Date(line.dueDate).toLocaleDateString("fr-CA")}
          </div>
        )}
        {line.notes && <div className="text-[11.5px] text-slate-500 mt-0.5">{line.notes}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className="font-medium text-slate-900">{fmt(num(line.plannedAmount), line.currency)}</div>
        {num(line.actualAmount) > 0 && (
          <div className="text-[11px] text-emerald-700">Réalisé : {fmt(num(line.actualAmount), line.currency)}</div>
        )}
        {canEdit && (
          <div className="flex items-center gap-1 mt-1 justify-end">
            <button onClick={onEdit} className="p-1 text-slate-500 hover:text-slate-800" title="Éditer">
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button onClick={del} className="p-1 text-slate-500 hover:text-red-600" title="Supprimer">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LineForm({
  budgetId, lineId, initial, currency, onClose, onSaved,
}: {
  budgetId: string;
  lineId?: string;
  initial?: Partial<BudgetLine>;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<Category>((initial?.category as Category) ?? "SUBSCRIPTIONS");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [plannedAmount, setPlannedAmount] = useState<string>(initial?.plannedAmount ? String(initial.plannedAmount) : "");
  const [committedAmount, setCommittedAmount] = useState<string>(initial?.committedAmount ? String(initial.committedAmount) : "");
  const [actualAmount, setActualAmount] = useState<string>(initial?.actualAmount ? String(initial.actualAmount) : "");
  const [plannedMonth, setPlannedMonth] = useState<string>(initial?.plannedMonth ? String(initial.plannedMonth) : "");
  const [status, setStatus] = useState<LineStatus>((initial?.status as LineStatus) ?? "PLANNED");
  const [visibility, setVisibility] = useState<Visibility>((initial?.visibility as Visibility) ?? "CLIENT_ADMIN");
  const [dueDate, setDueDate] = useState<string>(initial?.dueDate ? initial.dueDate.slice(0, 10) : "");
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null); setSaving(true);
    const payload: Record<string, unknown> = {
      category, label, vendor: vendor || null,
      plannedAmount: plannedAmount ? Number(plannedAmount) : 0,
      committedAmount: committedAmount ? Number(committedAmount) : null,
      actualAmount: actualAmount ? Number(actualAmount) : null,
      plannedMonth: plannedMonth ? Number(plannedMonth) : null,
      status, visibility,
      dueDate: dueDate || null,
      notes: notes || null,
      currency,
    };
    const url = lineId ? `/api/v1/budget-lines/${lineId}` : `/api/v1/budgets/${budgetId}/lines`;
    const r = await fetch(url, {
      method: lineId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setErr(b?.error || `HTTP ${r.status}`);
      return;
    }
    onSaved();
  }

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-slate-600">Catégorie</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-[13px]">
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) =>
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            )}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-slate-600">Statut</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as LineStatus)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-[13px]">
            {(Object.keys(LINE_STATUS_META) as LineStatus[]).map((s) =>
              <option key={s} value={s}>{LINE_STATUS_META[s].label}</option>
            )}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] text-slate-600">Libellé</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: Pentest annuel, Renouvellement M365 E3…" />
        </div>
        <div>
          <label className="text-[11px] text-slate-600">Fournisseur</label>
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="ex: Microsoft" />
        </div>
        <div>
          <label className="text-[11px] text-slate-600">Échéance</label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-slate-600">Prévu ({currency})</label>
          <Input type="number" value={plannedAmount} onChange={(e) => setPlannedAmount(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="text-[11px] text-slate-600">Mois (1-12)</label>
          <Input type="number" min={1} max={12} value={plannedMonth} onChange={(e) => setPlannedMonth(e.target.value)} placeholder="—" />
        </div>
        <div>
          <label className="text-[11px] text-slate-600">Engagé ({currency})</label>
          <Input type="number" value={committedAmount} onChange={(e) => setCommittedAmount(e.target.value)} placeholder="—" />
        </div>
        <div>
          <label className="text-[11px] text-slate-600">Réalisé ({currency})</label>
          <Input type="number" value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} placeholder="—" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] text-slate-600">Visibilité client</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}
            className="w-full rounded border border-slate-300 px-2 py-1 text-[13px]">
            <option value="INTERNAL">Interne (caché au portail)</option>
            <option value="CLIENT_ADMIN">Visible admin client</option>
            <option value="CLIENT_ALL">Visible tous contacts portail</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] text-slate-600">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full rounded border border-slate-300 px-2 py-1 text-[13px]" />
        </div>
      </div>
      {err && <div className="text-[12px] text-red-700">{err}</div>}
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
        <Button size="sm" onClick={save} disabled={saving || !label.trim()}>
          {saving ? "…" : (lineId ? "Enregistrer" : "Ajouter")}
        </Button>
      </div>
    </div>
  );
}
