"use client";

// ============================================================================
// ScheduledReportsSection — Gestion des planifications de rapports mensuels
// pour une organisation. Affichée dans la fiche org → Rapports mensuels.
//
// SUPERVISOR+ peut créer / activer / désactiver / supprimer.
// Les autres utilisateurs voient la liste read-only.
// ============================================================================

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Loader2,
  Mail,
  Plus,
  Power,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ScheduleRow {
  id: string;
  name: string;
  cadence: "monthly_first_day_8am" | "weekly_monday_8am";
  variant: "WITH_RATES" | "HOURS_ONLY";
  recipients: string[];
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  consecutiveFailures: number;
  lastErrorMessage: string | null;
}

const CADENCE_LABELS: Record<ScheduleRow["cadence"], string> = {
  monthly_first_day_8am: "1er du mois — 8h00",
  weekly_monday_8am: "Chaque lundi — 8h00",
};

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  organizationId: string;
  /** Si true, l'utilisateur peut créer/modifier (SUPERVISOR+). */
  canEdit: boolean;
}

export function ScheduledReportsSection({ organizationId, canEdit }: Props) {
  const [items, setItems] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/v1/scheduled-reports?organizationId=${encodeURIComponent(organizationId)}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setItems(Array.isArray(d?.data) ? d.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function toggleActive(id: string, next: boolean) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/v1/scheduled-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette planification ? Aucun rapport futur ne sera envoyé.")) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/v1/scheduled-reports/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-blue-600" />
            Planifications d&apos;envoi automatique
          </CardTitle>
          {canEdit && !showNew && (
            <Button variant="outline" size="sm" onClick={() => setShowNew(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nouvelle planification
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[12px] text-slate-500">
          Le rapport mensuel est généré et envoyé automatiquement par email aux
          destinataires choisis. Le worker tourne toutes les 15 minutes via
          systemd timer.
        </p>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
            {error}
          </div>
        )}

        {showNew && (
          <NewScheduleForm
            organizationId={organizationId}
            onSaved={() => {
              setShowNew(false);
              reload();
            }}
            onCancel={() => setShowNew(false)}
          />
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-slate-500 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Chargement…
          </div>
        ) : items.length === 0 ? (
          <p className="text-[12px] italic text-slate-400 py-2">
            Aucune planification configurée pour ce client.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((s) => (
              <div key={s.id} className="py-3 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-slate-900">{s.name}</span>
                    {s.isActive ? (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
                        Inactive
                      </span>
                    )}
                    {s.consecutiveFailures > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
                        title={s.lastErrorMessage ?? "Échecs consécutifs"}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {s.consecutiveFailures} échec{s.consecutiveFailures > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11.5px] text-slate-500 flex flex-wrap gap-x-3">
                    <span>{CADENCE_LABELS[s.cadence]}</span>
                    <span>·</span>
                    <span>
                      {s.variant === "WITH_RATES" ? "Avec tarifs $" : "Heures seulement"}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {s.recipients.length} destinataire
                      {s.recipients.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Dernier envoi : {fmtDateTime(s.lastRunAt)} · Prochain : {fmtDateTime(s.nextRunAt)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 truncate" title={s.recipients.join(", ")}>
                    {s.recipients.join(", ")}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleActive(s.id, !s.isActive)}
                      disabled={busyId === s.id}
                      className={cn(
                        "h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors",
                        s.isActive
                          ? "text-emerald-700 hover:bg-emerald-50"
                          : "text-slate-500 hover:bg-slate-100",
                      )}
                      title={s.isActive ? "Désactiver" : "Activer"}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      disabled={busyId === s.id}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewScheduleForm({
  organizationId,
  onSaved,
  onCancel,
}: {
  organizationId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("Rapport mensuel client");
  const [cadence, setCadence] = useState<ScheduleRow["cadence"]>("monthly_first_day_8am");
  const [variant, setVariant] = useState<ScheduleRow["variant"]>("WITH_RATES");
  const [recipientsText, setRecipientsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const recipients = recipientsText
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (recipients.length === 0) {
        throw new Error("Au moins un destinataire est requis.");
      }
      const r = await fetch("/api/v1/scheduled-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          organizationId,
          cadence,
          variant,
          recipients,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-blue-200/80 bg-blue-50/30 p-3 space-y-3"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11.5px] font-medium text-slate-700 mb-1">
            Étiquette
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Rapport mensuel HVAC — comptabilité"
            required
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-slate-700 mb-1">
            Cadence
          </label>
          <Select value={cadence} onValueChange={(v) => setCadence(v as ScheduleRow["cadence"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly_first_day_8am">1er du mois — 8h00</SelectItem>
              <SelectItem value="weekly_monday_8am">Chaque lundi — 8h00</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="block text-[11.5px] font-medium text-slate-700 mb-1">
          Variante PDF
        </label>
        <Select value={variant} onValueChange={(v) => setVariant(v as ScheduleRow["variant"])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WITH_RATES">Avec tarifs $ (montants visibles)</SelectItem>
            <SelectItem value="HOURS_ONLY">Heures seulement (sans montants)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-[11.5px] font-medium text-slate-700 mb-1">
          Destinataires (emails séparés par virgule, espace ou retour ligne)
        </label>
        <textarea
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          rows={2}
          placeholder="comptabilite@hvac.ca, gestionnaire@hvac.ca"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
          required
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={submitting} className="gap-1.5">
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Créer la planification
        </Button>
      </div>
    </form>
  );
}
