"use client";

// ============================================================================
// KB Audit Drawer — lance l'audit IA de la base de connaissances et affiche
// les suggestions par catégorie (structure) et par article.
//
// Chaque suggestion automatisable a un bouton "Appliquer" qui mute la DB via
// les endpoints /api/v1/kb/categories/[id] et /api/v1/kb/articles/[id].
// Les suggestions non automatisables (merge/split/needs_rewrite) sont
// informatives — needs_rewrite ouvre le dialog de reformulation.
// ============================================================================

import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  Sparkles,
  FolderTree,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Tag,
  Archive,
  Pencil,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StructureSuggestion {
  action: string;
  categoryId?: string;
  categoryIds?: string[];
  path?: string;
  proposedPath?: string;
  proposedName?: string;
  proposedParentId?: string | null;
  reason: string;
}

interface ArticleSuggestion {
  action: string;
  articleId: string;
  articleTitle: string;
  proposedCategoryId?: string;
  proposedCategoryPath?: string;
  proposedTitle?: string;
  proposedTags?: string[];
  reason: string;
}

interface AuditReport {
  summary: string;
  structureSuggestions: StructureSuggestion[];
  articleSuggestions: ArticleSuggestion[];
  stats: {
    totalCategories: number;
    totalArticles: number;
    orphanArticles: number;
    staleCandidates: number;
  };
  generatedAt: string;
}

interface ArticleMeta {
  id: string;
  title: string;
  tags: string[];
}

const STRUCTURE_LABELS: Record<string, string> = {
  add_category: "Ajouter une catégorie",
  rename_category: "Renommer",
  rehome_category: "Déplacer",
  merge_categories: "Fusionner",
  split_category: "Scinder",
};

const ARTICLE_LABELS: Record<string, string> = {
  rehome_article: "Reclasser",
  rename_article: "Renommer",
  add_tags: "Ajouter des tags",
  mark_stale: "Marquer obsolète",
  needs_rewrite: "Reformulation nécessaire",
};

const ARTICLE_ICONS: Record<string, React.ReactNode> = {
  rehome_article: <FolderTree className="h-3 w-3" />,
  rename_article: <Pencil className="h-3 w-3" />,
  add_tags: <Tag className="h-3 w-3" />,
  mark_stale: <Archive className="h-3 w-3" />,
  needs_rewrite: <Sparkles className="h-3 w-3" />,
};

// Type de status pour chaque suggestion (clé = "s-idx" ou "a-idx")
type StatusMap = Record<string, "pending" | "applying" | "applied" | "dismissed" | "error">;

export function KbAuditDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMap>({});
  const [errorMsgs, setErrorMsgs] = useState<Record<string, string>>({});
  const [articleTagsCache, setArticleTagsCache] = useState<Record<string, string[]>>({});

  // Charge les tags existants des articles suggérés — nécessaire pour merger
  // (et non remplacer) lors d'un add_tags.
  useEffect(() => {
    if (!report) return;
    const ids = Array.from(
      new Set(
        report.articleSuggestions
          .filter((s) => s.action === "add_tags")
          .map((s) => s.articleId),
      ),
    );
    if (ids.length === 0) return;
    (async () => {
      try {
        const res = await fetch("/api/v1/kb/articles");
        if (!res.ok) return;
        const all = (await res.json()) as ArticleMeta[];
        const cache: Record<string, string[]> = {};
        for (const a of all) cache[a.id] = a.tags ?? [];
        setArticleTagsCache(cache);
      } catch {
        /* non-blocking */
      }
    })();
  }, [report]);

  async function runAudit() {
    setLoading(true);
    setError(null);
    setReport(null);
    setStatus({});
    setErrorMsgs({});
    try {
      const res = await fetch("/api/v1/ai/kb-audit", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setReport(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function setOne(key: string, val: StatusMap[string]) {
    setStatus((prev) => ({ ...prev, [key]: val }));
  }

  async function apply(
    key: string,
    work: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setOne(key, "applying");
    try {
      const result = await work();
      if (result.ok) {
        setOne(key, "applied");
      } else {
        setOne(key, "error");
        setErrorMsgs((p) => ({ ...p, [key]: result.error || "Erreur" }));
      }
    } catch (err) {
      setOne(key, "error");
      setErrorMsgs((p) => ({
        ...p,
        [key]: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  // --- Structure actions --------------------------------------------------
  function applyStructure(key: string, s: StructureSuggestion) {
    if (s.action === "rename_category" && s.categoryId && s.proposedName) {
      apply(key, async () => {
        const res = await fetch(`/api/v1/kb/categories/${s.categoryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: s.proposedName }),
        });
        return { ok: res.ok, error: !res.ok ? `HTTP ${res.status}` : undefined };
      });
    } else if (s.action === "rehome_category" && s.categoryId) {
      apply(key, async () => {
        const res = await fetch(`/api/v1/kb/categories/${s.categoryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: s.proposedParentId ?? null }),
        });
        return { ok: res.ok, error: !res.ok ? `HTTP ${res.status}` : undefined };
      });
    } else if (s.action === "add_category") {
      // Crée avec juste le nom (extrait du proposedPath) + description basée sur reason
      const name =
        s.proposedName ||
        (s.proposedPath ? s.proposedPath.split(">").pop()?.trim() : "") ||
        "";
      if (!name) return;
      apply(key, async () => {
        const res = await fetch(`/api/v1/kb/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            parentId: s.proposedParentId ?? null,
            description: s.reason.slice(0, 200),
          }),
        });
        return { ok: res.ok, error: !res.ok ? `HTTP ${res.status}` : undefined };
      });
    }
  }

  // --- Article actions -----------------------------------------------------
  function applyArticle(key: string, s: ArticleSuggestion) {
    if (s.action === "rename_article" && s.proposedTitle) {
      apply(key, async () => {
        const res = await fetch(`/api/v1/kb/articles/${s.articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: s.proposedTitle }),
        });
        return { ok: res.ok, error: !res.ok ? `HTTP ${res.status}` : undefined };
      });
    } else if (s.action === "rehome_article" && s.proposedCategoryId) {
      apply(key, async () => {
        const res = await fetch(`/api/v1/kb/articles/${s.articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: s.proposedCategoryId }),
        });
        return { ok: res.ok, error: !res.ok ? `HTTP ${res.status}` : undefined };
      });
    } else if (s.action === "add_tags" && s.proposedTags?.length) {
      const existing = articleTagsCache[s.articleId] ?? [];
      const merged = Array.from(new Set([...existing, ...s.proposedTags]));
      apply(key, async () => {
        const res = await fetch(`/api/v1/kb/articles/${s.articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: merged }),
        });
        return { ok: res.ok, error: !res.ok ? `HTTP ${res.status}` : undefined };
      });
    } else if (s.action === "mark_stale") {
      apply(key, async () => {
        const res = await fetch(`/api/v1/kb/articles/${s.articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ARCHIVED" }),
        });
        return { ok: res.ok, error: !res.ok ? `HTTP ${res.status}` : undefined };
      });
    }
    // needs_rewrite → pas auto-applicable (Feature B dialog depuis l'article).
  }

  function dismiss(key: string) {
    setOne(key, "dismissed");
  }

  if (!open) return null;

  const hasApplyStructure = (s: StructureSuggestion): boolean => {
    if (s.action === "rename_category" && s.categoryId && s.proposedName)
      return true;
    if (s.action === "rehome_category" && s.categoryId) return true;
    if (s.action === "add_category" && (s.proposedName || s.proposedPath))
      return true;
    return false;
  };

  const hasApplyArticle = (s: ArticleSuggestion): boolean => {
    if (s.action === "rename_article" && s.proposedTitle) return true;
    if (s.action === "rehome_article" && s.proposedCategoryId) return true;
    if (s.action === "add_tags" && (s.proposedTags?.length ?? 0) > 0) return true;
    if (s.action === "mark_stale") return true;
    return false; // needs_rewrite = manuel
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay — caché sur mobile (<sm) pour que le drawer prenne toute la
          largeur. Sur tablette+, clic = fermer. */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="hidden sm:block flex-1 bg-slate-900/40"
      />
      <div className="w-full sm:max-w-2xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h2 className="text-[15px] font-semibold text-slate-900">
              Audit IA de la base de connaissances
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!report && !loading && !error && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-[13px] text-slate-700">
                L'IA analyse la structure des catégories et le contenu des
                articles pour proposer :
              </p>
              <ul className="text-[12.5px] text-slate-600 space-y-0.5 list-disc list-inside">
                <li>Restructuration (catégories à ajouter, fusionner, renommer)</li>
                <li>Articles mal classés (déplacement)</li>
                <li>Titres vagues à reformuler</li>
                <li>Tags manquants (2-4 par article)</li>
                <li>Articles obsolètes (publiés sans vues depuis 6+ mois)</li>
                <li>Articles mal rédigés (reformulation nécessaire)</li>
              </ul>
              <p className="text-[11.5px] text-slate-500 italic">
                Les actions automatisables ont un bouton « Appliquer ». Les
                suggestions complexes (fusion, scission) restent manuelles.
              </p>
              <Button variant="primary" size="md" onClick={runAudit}>
                <Sparkles className="h-4 w-4" />
                Lancer l'audit
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-2 py-12 text-[13px] text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
              Audit en cours (1-3 min avec Ollama local)…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
              <Button
                variant="outline"
                size="sm"
                className="ml-3"
                onClick={runAudit}
              >
                Réessayer
              </Button>
            </div>
          )}

          {report && (
            <>
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <p className="text-[12.5px] text-slate-800 leading-relaxed">
                  {report.summary || "(Pas de résumé)"}
                </p>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Catégories" value={report.stats.totalCategories} />
                  <Stat label="Articles" value={report.stats.totalArticles} />
                  <Stat
                    label="Orphelins"
                    value={report.stats.orphanArticles}
                    tone={report.stats.orphanArticles > 0 ? "amber" : "emerald"}
                  />
                  <Stat
                    label="Obsolètes ?"
                    value={report.stats.staleCandidates}
                    tone={
                      report.stats.staleCandidates > 0 ? "amber" : "emerald"
                    }
                  />
                </div>
              </div>

              <StructureSection
                suggestions={report.structureSuggestions}
                status={status}
                errorMsgs={errorMsgs}
                hasApply={hasApplyStructure}
                onApply={applyStructure}
                onDismiss={(idx) => dismiss(`s-${idx}`)}
              />

              <ArticleSection
                suggestions={report.articleSuggestions}
                status={status}
                errorMsgs={errorMsgs}
                hasApply={hasApplyArticle}
                onApply={applyArticle}
                onDismiss={(idx) => dismiss(`a-${idx}`)}
              />

              {report.structureSuggestions.length === 0 &&
                report.articleSuggestions.length === 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 flex items-center gap-2 text-[13px] text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    L'IA n'a pas identifié de restructuration nécessaire. La KB
                    est cohérente.
                  </div>
                )}

              <div className="pt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={runAudit}>
                  <Sparkles className="h-3 w-3" />
                  Relancer l'audit
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "amber" | "emerald";
}) {
  const toneClass = {
    slate: "text-slate-900",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
  }[tone];
  return (
    <div className="rounded-md bg-white border border-slate-200 px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={cn("text-[17px] font-bold tabular-nums", toneClass)}>
        {value}
      </p>
    </div>
  );
}

function ActionButtons({
  skey,
  status,
  canApply,
  onApply,
  onDismiss,
  errorMsg,
}: {
  skey: string;
  status: StatusMap[string] | undefined;
  canApply: boolean;
  onApply: () => void;
  onDismiss: () => void;
  errorMsg?: string;
}) {
  if (status === "dismissed") return <span className="text-[10.5px] text-slate-400">Ignoré</span>;
  if (status === "applied")
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-700 font-medium">
        <Check className="h-3 w-3" />
        Appliqué
      </span>
    );
  if (status === "applying")
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-violet-700">
        <Loader2 className="h-3 w-3 animate-spin" />
        En cours…
      </span>
    );
  return (
    <div className="flex items-center gap-1.5">
      {errorMsg && (
        <span className="text-[10px] text-red-600" title={errorMsg}>
          Erreur
        </span>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="text-[10.5px] text-slate-400 hover:text-slate-700"
      >
        Ignorer
      </button>
      {canApply && (
        <Button
          size="sm"
          variant="primary"
          onClick={onApply}
          className="h-6 text-[10.5px] px-2"
        >
          Appliquer
        </Button>
      )}
    </div>
  );
  void skey;
}

function StructureSection({
  suggestions,
  status,
  errorMsgs,
  hasApply,
  onApply,
  onDismiss,
}: {
  suggestions: StructureSuggestion[];
  status: StatusMap;
  errorMsgs: Record<string, string>;
  hasApply: (s: StructureSuggestion) => boolean;
  onApply: (key: string, s: StructureSuggestion) => void;
  onDismiss: (idx: number) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-slate-800 flex items-center gap-1.5 mb-2">
        <FolderTree className="h-3.5 w-3.5 text-blue-500" />
        Structure ({suggestions.length})
      </h3>
      <div className="space-y-1.5">
        {suggestions.map((s, i) => {
          const key = `s-${i}`;
          const st = status[key];
          if (st === "dismissed") return null;
          return (
            <div
              key={i}
              className="rounded-md border border-slate-200 bg-white p-2.5 space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10.5px] font-medium">
                  {STRUCTURE_LABELS[s.action] ?? s.action}
                </span>
                <ActionButtons
                  skey={key}
                  status={st}
                  canApply={hasApply(s)}
                  onApply={() => onApply(key, s)}
                  onDismiss={() => onDismiss(i)}
                  errorMsg={errorMsgs[key]}
                />
              </div>
              <div className="text-[12px] text-slate-700 font-mono">
                {s.path && <span>{s.path}</span>}
                {(s.proposedPath || s.proposedName) && (
                  <>
                    <ArrowRight className="h-3 w-3 inline mx-1 text-slate-400" />
                    <span className="text-emerald-700">
                      {s.proposedPath || s.proposedName}
                    </span>
                  </>
                )}
              </div>
              <p className="text-[11.5px] text-slate-600 italic">{s.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArticleSection({
  suggestions,
  status,
  errorMsgs,
  hasApply,
  onApply,
  onDismiss,
}: {
  suggestions: ArticleSuggestion[];
  status: StatusMap;
  errorMsgs: Record<string, string>;
  hasApply: (s: ArticleSuggestion) => boolean;
  onApply: (key: string, s: ArticleSuggestion) => void;
  onDismiss: (idx: number) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-slate-800 flex items-center gap-1.5 mb-2">
        <FileText className="h-3.5 w-3.5 text-indigo-500" />
        Articles ({suggestions.length})
      </h3>
      <div className="space-y-1.5">
        {suggestions.map((s, i) => {
          const key = `a-${i}`;
          const st = status[key];
          if (st === "dismissed") return null;
          return (
            <div
              key={i}
              className="rounded-md border border-slate-200 bg-white p-2.5 space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-indigo-100 text-indigo-700 px-1.5 py-0.5 text-[10.5px] font-medium">
                  {ARTICLE_ICONS[s.action]}
                  {ARTICLE_LABELS[s.action] ?? s.action}
                </span>
                <ActionButtons
                  skey={key}
                  status={st}
                  canApply={hasApply(s)}
                  onApply={() => onApply(key, s)}
                  onDismiss={() => onDismiss(i)}
                  errorMsg={errorMsgs[key]}
                />
              </div>
              <p className="text-[12px] font-medium text-slate-800 truncate">
                {s.articleTitle}
              </p>
              {s.proposedTitle && (
                <p className="text-[11.5px]">
                  <span className="text-slate-500">Nouveau titre :</span>{" "}
                  <span className="text-emerald-700">{s.proposedTitle}</span>
                </p>
              )}
              {s.proposedCategoryPath && (
                <p className="text-[11.5px]">
                  <span className="text-slate-500">Déplacer vers :</span>{" "}
                  <span className="text-emerald-700 font-mono">
                    {s.proposedCategoryPath}
                  </span>
                </p>
              )}
              {s.proposedTags && s.proposedTags.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10.5px] text-slate-500">
                    Tags suggérés :
                  </span>
                  {s.proposedTags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[10.5px] font-medium"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11.5px] text-slate-600 italic flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                {s.reason}
              </p>
              {s.action === "needs_rewrite" && (
                <p className="text-[10.5px] text-slate-500">
                  <Pencil className="h-2.5 w-2.5 inline" /> Ouvre l'article
                  dans l'éditeur et utilise « Reformuler avec l'IA ».
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
