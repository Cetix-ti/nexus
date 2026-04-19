"use client";

// ============================================================================
// /intelligence/kb-proposed — File de review des articles KB proposés par l'IA.
//
// Pour chaque brouillon (DRAFT) dont `externalSource` commence par "ai:",
// l'admin peut :
//   - Approuver (→ PUBLISHED, visible pour les techs/clients)
//   - Rejeter (→ ARCHIVED, garde trace)
//   - Éditer (redirige vers /knowledge/[slug]/edit)
//
// Accessible SUPERVISOR+ uniquement.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Pencil,
  Tag,
  Clock,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProposedArticle {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  tags: string[];
  externalSource: string | null;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string } | null;
}

const SOURCE_LABEL: Record<string, string> = {
  "ai:kb_gen:kb-gaps": "KB Gaps (LLM)",
  "ai:kb_gen": "Brouillon IA depuis ticket",
  "ai:playbook": "Playbook (patterns récurrents)",
};

function labelForSource(s: string | null): string {
  if (!s) return "Origine inconnue";
  return SOURCE_LABEL[s] ?? s.replace(/^ai:/, "IA: ");
}

export default function KbProposedPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ProposedArticle[]>([]);
  const [bySource, setBySource] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/intelligence/kb-proposed");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setArticles(data.articles ?? []);
      setBySource(data.bySource ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    if (busyId) return;
    if (
      action === "reject" &&
      !confirm("Archiver cette proposition ? Elle ne sera plus visible pour les techs.")
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/intelligence/kb-proposed/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      // Retire de la liste — l'action change le statut DRAFT → PUBLISHED/ARCHIVED.
      setArticles((list) => list.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/intelligence"
            className="text-[12px] text-slate-500 hover:text-slate-700"
          >
            ← Intelligence IA
          </Link>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Articles KB proposés par l&apos;IA
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Approuve, édite ou archive les brouillons créés automatiquement.
            Un article approuvé devient visible pour les techs + portail client.
          </p>
        </div>
      </div>

      {Object.keys(bySource).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(bySource).map(([src, count]) => (
            <span
              key={src}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[11.5px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200"
            >
              <Brain className="h-3 w-3" />
              {labelForSource(src)}
              <span className="tabular-nums text-violet-500">· {count}</span>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-8 text-center">
          <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-[13px] text-slate-600">
            Aucun article IA en attente de review.
          </p>
          <p className="text-[11.5px] text-slate-500 mt-1">
            Les propositions apparaîtront ici après exécution de KB Gaps ou
            Playbook Miner (jobs journaliers).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => {
            const isExpanded = expanded.has(a.id);
            const isBusy = busyId === a.id;
            return (
              <div
                key={a.id}
                className="rounded-lg border border-slate-200 bg-white p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-medium text-violet-700">
                        <Brain className="h-2.5 w-2.5" />
                        {labelForSource(a.externalSource)}
                      </span>
                      {a.category && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500">
                          <Tag className="h-2.5 w-2.5" />
                          {a.category.name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-400">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(a.createdAt).toLocaleString("fr-CA", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <h3 className="text-[14px] font-semibold text-slate-900">
                      {a.title}
                    </h3>
                    {a.summary && (
                      <p className="text-[12.5px] text-slate-600 mt-0.5 leading-snug">
                        {a.summary}
                      </p>
                    )}
                    {a.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {a.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  className="text-[11.5px] text-slate-500 hover:text-slate-800 underline underline-offset-2"
                >
                  {isExpanded ? "Masquer le contenu" : "Voir le contenu complet"}
                </button>

                {isExpanded && (
                  <div
                    className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 text-[12.5px] text-slate-700 max-h-[400px] overflow-y-auto prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: a.body }}
                  />
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => router.push(`/knowledge/${a.slug}`)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Pencil className="h-3 w-3" />
                    Éditer
                  </button>
                  <button
                    type="button"
                    onClick={() => act(a.id, "reject")}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {isBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    Archiver
                  </button>
                  <button
                    type="button"
                    onClick={() => act(a.id, "approve")}
                    disabled={isBusy}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-50",
                      "bg-emerald-600 hover:bg-emerald-700",
                    )}
                  >
                    {isBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Approuver & publier
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
