"use client";

// ============================================================================
// /intelligence/kb-gaps — Dashboard actionnable des lacunes KB.
//
// Alimenté par le job `kb-gaps-detector`. Pour chaque catégorie où l'IA se
// plante régulièrement sans article KB aligné, propose de rédiger un
// brouillon d'article via LLM (POLICY_KB_GEN, gpt-4o-mini). Un clic crée
// un Article DRAFT pré-rempli.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  BookOpen,
  TicketIcon,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KbGapRow {
  categoryId: string;
  categoryName?: string;
  categoryPath?: string;
  impactedTickets: number;
  disagreementRate: number;
  kbCoverage: number;
  priority: number;
  sampleTickets: Array<{ id: string; number: number; subject: string }>;
}

export default function KbGapsPage() {
  const router = useRouter();
  const [gaps, setGaps] = useState<KbGapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/intelligence/kb-gaps");
      if (!res.ok) {
        setError(res.status === 403 ? "Accès réservé aux admins" : "Erreur");
        return;
      }
      const data = (await res.json()) as { gaps: KbGapRow[] };
      setGaps(data.gaps ?? []);
    } catch {
      setError("Connexion impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDraft = async (categoryId: string) => {
    setBusyId(categoryId);
    try {
      const res = await fetch(
        `/api/v1/intelligence/kb-gaps/${categoryId}/draft`,
        { method: "POST" },
      );
      if (res.ok) {
        const { articleId } = (await res.json()) as { articleId: string };
        router.push(`/knowledge/${articleId}`);
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error ?? "Génération échouée");
      }
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <BookOpen className="h-6 w-6 text-indigo-500" />
          Articles KB à écrire
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Catégories où l&apos;IA se plante régulièrement ET où aucun article
          n&apos;est aligné. Cliquer sur <em>Rédiger brouillon</em> génère un
          article DRAFT via gpt-4o-mini à partir des tickets échantillons.
        </p>
      </header>

      {gaps.length === 0 ? (
        <p className="py-12 text-center text-sm italic text-slate-400">
          Aucune lacune détectée pour l&apos;instant. Le job tourne
          quotidiennement.
        </p>
      ) : (
        <ul className="space-y-2">
          {gaps.map((g) => (
            <li
              key={g.categoryId}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <PriorityBadge priority={g.priority} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {g.categoryPath ?? g.categoryName ?? g.categoryId}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{g.impactedTickets} tickets impactés</span>
                    <span className="text-slate-300">·</span>
                    <span>
                      erreurs IA {Math.round(g.disagreementRate * 100)}%
                    </span>
                    {g.kbCoverage < 0.3 && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-rose-500">aucun article aligné</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === g.categoryId}
                  onClick={() => handleDraft(g.categoryId)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busyId === g.categoryId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Rédiger brouillon
                </button>
              </div>
              {g.sampleTickets.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    Tickets échantillons :
                  </span>
                  {g.sampleTickets.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tickets/${t.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <TicketIcon className="h-2.5 w-2.5" />
                      TK-{t.number}
                      <span className="max-w-[220px] truncate">
                        {t.subject}
                      </span>
                      <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                    </Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: number }) {
  const level =
    priority >= 15 ? "high" : priority >= 5 ? "medium" : "low";
  const map = {
    high: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  } as const;
  return (
    <span
      className={cn(
        "shrink-0 rounded px-2 py-1 text-xs font-semibold tabular-nums",
        map[level],
      )}
      title="Score de priorité composite : tickets × erreurs × manque KB"
    >
      {Math.round(priority)}
    </span>
  );
}
