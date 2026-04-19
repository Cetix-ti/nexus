"use client";

// ============================================================================
// Checklist d'intervention (Phase 2 #17) — affichée sur la fiche ticket
// pour aider le tech à ne rien manquer sur un type de problème connu.
//
// Auto-fetch au mount par catégorie. Si aucune checklist n'est disponible
// OU si la catégorie vient juste d'être assignée, affiche un bouton
// "Générer" qui construit la checklist à partir des tickets résolus.
//
// Les coches sont LOCALES (persistées en localStorage par ticket) — pas
// de sauvegarde côté serveur. La checklist sert d'aide-mémoire, pas de
// contrat contractuel.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Sparkles,
  Stethoscope,
  Eye,
  Wrench,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ChecklistItem {
  label: string;
  step: "diagnostic" | "verification" | "action";
}
interface Checklist {
  categoryId: string;
  categoryName: string;
  items: ChecklistItem[];
  sampleCount: number;
  generatedAt: string;
}

const STEP_CONFIG: Record<
  ChecklistItem["step"],
  { label: string; icon: typeof Stethoscope; color: string }
> = {
  diagnostic: {
    label: "Diagnostic",
    icon: Stethoscope,
    color: "text-amber-700",
  },
  verification: {
    label: "Vérification",
    icon: Eye,
    color: "text-blue-700",
  },
  action: { label: "Action", icon: Wrench, color: "text-emerald-700" },
};

export function AiInterventionChecklist({
  ticketId,
  categoryId,
}: {
  ticketId: string;
  categoryId: string | null | undefined;
}) {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [fetched, setFetched] = useState(false);

  const storageKey = `ticket:${ticketId}:checklist-checked`;

  // Charge les coches locales (survivent aux reloads mais pas aux devices).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setCheckedItems(new Set(arr));
      }
    } catch {
      /* storage indispo */
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(checkedItems)),
      );
    } catch {
      /* storage indispo */
    }
  }, [checkedItems, storageKey]);

  const fetchChecklist = useCallback(async () => {
    if (!categoryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/categories/${categoryId}/checklist`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChecklist(data.checklist ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [categoryId]);

  useEffect(() => {
    if (categoryId && !fetched) fetchChecklist();
  }, [categoryId, fetched, fetchChecklist]);

  async function generate() {
    if (!categoryId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/categories/${categoryId}/checklist`,
        {
          method: "POST",
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setChecklist(data.checklist ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setGenerating(false);
    }
  }

  function toggle(i: number) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // Catégorie non assignée → ne rien afficher (pas de contexte utile).
  if (!categoryId) return null;

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-[11.5px] text-slate-500 flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        Chargement de la checklist…
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-700">
            <Sparkles className="h-3 w-3 text-violet-500" />
            Checklist d'intervention
          </div>
          <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Générer
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Aucune checklist pour cette catégorie. L'IA peut en construire une
          à partir des tickets résolus similaires.
        </p>
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  const done = checkedItems.size;
  const total = checklist.items.length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-violet-500 shrink-0" />
            <p className="text-[11.5px] font-semibold text-slate-800 truncate">
              Checklist — {checklist.categoryName}
            </p>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {done}/{total} cochés · basée sur {checklist.sampleCount} tickets
            résolus · générée le{" "}
            {new Date(checklist.generatedAt).toLocaleDateString("fr-CA")}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            title="Régénérer"
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            title={collapsed ? "Afficher" : "Réduire"}
          >
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <ul className="space-y-1 pt-0.5">
          {checklist.items.map((item, i) => {
            const checked = checkedItems.has(i);
            const cfg = STEP_CONFIG[item.step];
            const Icon = cfg.icon;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-md px-1.5 py-1 text-[12px] cursor-pointer",
                  checked ? "opacity-50" : "hover:bg-slate-50",
                )}
                onClick={() => toggle(i)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(i)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className={cn("h-3 w-3 shrink-0", cfg.color)} />
                    <span
                      className={cn(
                        "text-[10.5px] font-semibold uppercase tracking-wider",
                        cfg.color,
                      )}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-[12px] text-slate-800",
                      checked && "line-through",
                    )}
                  >
                    {item.label}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
