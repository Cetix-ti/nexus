"use client";

// ============================================================================
// OrgAiConsentPanel — panneau de consent IA par organisation (Loi 25).
//
// Quatre toggles :
//   1. aiEnabled             : master switch IA
//   2. cloudProvidersAllowed : autorise fallback cloud (sinon Ollama-only)
//   3. learningEnabled       : autorise extraction de faits + patterns
//   4. clientContentEnabled  : autorise génération contenu client-facing
//
// + bouton "Exporter mes données IA" et "Anonymiser mes données IA" (droit
// d'accès + droit à l'oubli Loi 25).
//
// Accessible SUPERVISOR+ MSP et CLIENT_ADMIN de l'org.
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import {
  Shield,
  Cloud,
  Brain,
  FileText,
  Loader2,
  AlertTriangle,
  Download,
  Trash2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Consent {
  aiEnabled: boolean;
  cloudProvidersAllowed: boolean;
  learningEnabled: boolean;
  clientContentEnabled: boolean;
  isExplicit: boolean;
  notes?: string | null;
  updatedAt?: string;
  updatedBy?: string | null;
}

interface Props {
  organizationId: string;
  organizationSlug: string;
  clientCode?: string | null;
}

export function OrgAiConsentPanel({
  organizationId,
  clientCode,
}: Props) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai-consent`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConsent(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(field: keyof Consent, value: boolean) {
    if (!consent) return;
    setSaving(field);
    setError(null);
    // Optimiste
    setConsent({ ...consent, [field]: value, isExplicit: true });
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai-consent`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setConsent(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      // Rollback visuel
      setConsent({ ...consent, [field]: !value });
    } finally {
      setSaving(null);
    }
  }

  async function exportData() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/ai/data-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nexus-ai-export-${clientCode ?? organizationId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setExporting(false);
    }
  }

  async function anonymizeData() {
    const expected = `DELETE_${clientCode ?? organizationId}`;
    const input = prompt(
      `Pour confirmer l'anonymisation des données IA de cette organisation, tapez exactement :\n\n${expected}\n\nLes champs identifiants (user, ticket, contenu) seront retirés. Les stats agrégées restent. Le consent IA sera aussi révoqué (aiEnabled=false).`,
    );
    if (input !== expected) {
      setError("Confirmation annulée ou incorrecte.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/ai/data-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, confirm: expected }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      alert(
        `Anonymisation terminée.\n\n${JSON.stringify(data.rowsAnonymized, null, 2)}\n\nLe consent IA a été révoqué. Réactive aiEnabled quand tu veux reprendre.`,
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement du consent…
      </div>
    );
  }

  if (!consent) {
    return (
      <div className="text-[13px] text-red-700">{error ?? "Erreur inconnue"}</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-900 flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-500" />
            Consent IA (Loi 25)
          </h3>
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            {consent.isExplicit
              ? "Configuration explicite enregistrée."
              : "Défauts appliqués — tout autorisé. Configure pour documenter le consent."}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <ConsentToggle
          label="IA activée"
          description="Master switch. Si désactivé, aucune feature IA ne tourne sur cette org."
          icon={<Shield className="h-4 w-4 text-indigo-600" />}
          value={consent.aiEnabled}
          saving={saving === "aiEnabled"}
          onChange={(v) => toggle("aiEnabled", v)}
          master
        />
        <ConsentToggle
          label="Providers cloud (OpenAI, Anthropic)"
          description="Si désactivé, Ollama local uniquement. Perd la qualité cloud mais garantit que les données ne sortent pas du serveur."
          icon={<Cloud className="h-4 w-4 text-emerald-600" />}
          value={consent.cloudProvidersAllowed}
          saving={saving === "cloudProvidersAllowed"}
          onChange={(v) => toggle("cloudProvidersAllowed", v)}
          disabled={!consent.aiEnabled}
        />
        <ConsentToggle
          label="Apprentissage sur les données client"
          description="Extraction de faits, patterns, vocabulaire. Si désactivé, l'IA n'apprend PAS des tickets de cette org."
          icon={<Brain className="h-4 w-4 text-violet-600" />}
          value={consent.learningEnabled}
          saving={saving === "learningEnabled"}
          onChange={(v) => toggle("learningEnabled", v)}
          disabled={!consent.aiEnabled}
        />
        <ConsentToggle
          label="Génération de contenu client-facing"
          description="Rapports mensuels, brouillons de réponse, notes de résolution. Désactive si le client refuse que l'IA produise directement du texte qui lui est destiné."
          icon={<FileText className="h-4 w-4 text-blue-600" />}
          value={consent.clientContentEnabled}
          saving={saving === "clientContentEnabled"}
          onChange={(v) => toggle("clientContentEnabled", v)}
          disabled={!consent.aiEnabled}
        />
      </div>

      {consent.updatedAt && (
        <p className="text-[10.5px] text-slate-400">
          Dernière modification :{" "}
          {new Date(consent.updatedAt).toLocaleString("fr-CA")}
          {consent.updatedBy ? ` par ${consent.updatedBy}` : ""}
        </p>
      )}

      <div className="pt-3 border-t border-slate-200 space-y-2">
        <h4 className="text-[12.5px] font-semibold text-slate-700">
          Droits Loi 25
        </h4>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportData}
            disabled={exporting}
            className="gap-1.5"
          >
            {exporting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Exporter les données IA (JSON)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={anonymizeData}
            disabled={deleting}
            className="gap-1.5 text-red-700 border-red-200 hover:bg-red-50"
          >
            {deleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Anonymiser toutes les données IA
          </Button>
        </div>
        <p className="text-[10.5px] text-slate-500 italic">
          <AlertTriangle className="h-3 w-3 inline text-amber-500 mr-0.5" />
          L&apos;anonymisation retire les champs identifiants mais conserve
          les stats agrégées. Elle révoque aussi le consent (IA désactivée).
          Réversible pour le consent, irréversible pour les données.
        </p>
      </div>
    </div>
  );
}

function ConsentToggle({
  label,
  description,
  icon,
  value,
  saving,
  onChange,
  disabled,
  master,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  value: boolean;
  saving: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  master?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors",
        disabled
          ? "border-slate-100 bg-slate-50/40 opacity-60"
          : master && !value
            ? "border-red-200 bg-red-50/40"
            : value
              ? "border-slate-200 bg-white"
              : "border-amber-200 bg-amber-50/30",
      )}
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-slate-800">{label}</p>
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
            {description}
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => !disabled && !saving && onChange(!value)}
        disabled={disabled || saving}
        className={cn(
          "relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors",
          disabled
            ? "cursor-not-allowed bg-slate-200"
            : value
              ? "bg-emerald-500"
              : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            value ? "translate-x-6" : "translate-x-1",
          )}
        />
        {saving && (
          <Loader2 className="absolute right-0.5 h-3 w-3 animate-spin text-white" />
        )}
        {!saving && value && (
          <Check className="absolute left-1.5 h-3 w-3 text-white" />
        )}
      </button>
    </div>
  );
}
