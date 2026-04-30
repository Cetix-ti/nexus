"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  FolderTree,
  Sparkles,
  Loader2,
  PlusCircle,
  ArrowRight,
  Type,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface AuditSuggestion {
  kind: "add" | "rehome" | "rename";
  path: string;
  proposedPath?: string;
  reason: string;
}
interface AuditReport {
  summary: string;
  suggestions: AuditSuggestion[];
  generatedAt: string;
}

/** Raw category tel que retourné par /api/v1/categories. Réutilisé pour
 *  résoudre les paths en ids lors de l'application d'une suggestion. */
interface ApiCategory {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  scope: "CLIENT" | "INTERNAL";
}

type ScopeTab = "CLIENT" | "INTERNAL";

/** Parse un chemin "Niveau1 > Niveau2 > Niveau3" en segments trimés. */
function parsePath(path: string): string[] {
  return path.split(">").map((s) => s.trim()).filter(Boolean);
}

/** Trouve une catégorie par segments de chemin (case-insensitive).
 *  Renvoie les catégories successives de la racine jusqu'au leaf. */
function resolvePath(
  all: ApiCategory[],
  segments: string[],
): ApiCategory[] | null {
  const chain: ApiCategory[] = [];
  let parentId: string | null = null;
  for (const seg of segments) {
    const match = all.find(
      (c) =>
        (c.parentId ?? null) === parentId &&
        c.name.toLowerCase() === seg.toLowerCase(),
    );
    if (!match) return null;
    chain.push(match);
    parentId = match.id;
  }
  return chain;
}

interface ItemCategory {
  id: string;
  name: string;
  ticketCount: number;
}

interface Subcategory {
  id: string;
  name: string;
  ticketCount: number;
  itemCategories?: ItemCategory[];
}

interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  ticketCount: number;
  subcategories: Subcategory[];
  scope: ScopeTab;
}

// Avant : 6 catégories de demo en dur. Remplacées dès le mount par un fetch
// `/api/v1/categories`. On part d'un état vide pour ne pas afficher de
// fausses données pendant le 1er render.
const initialCategories: Category[] = [];

export function CategoriesSection() {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  // Raw liste retournée par l'API (plate) — gardée en parallèle de l'arbre
  // formaté pour que l'application des suggestions d'audit puisse résoudre
  // path → id rapidement sans re-requêter.
  const [rawCategories, setRawCategories] = useState<ApiCategory[]>([]);
  // AI taxonomy audit
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  // Application des suggestions
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set());
  const [applyError, setApplyError] = useState<string | null>(null);
  // Nonce pour déclencher un reload des catégories après une apply.
  const [reloadNonce, setReloadNonce] = useState(0);
  // Onglet de scope actif : sépare la vue Clients ↔ Interne. Le reste de
  // la page se filtre sur cet état (rendu, ajout, suggestions appliquées).
  const [activeScope, setActiveScope] = useState<ScopeTab>("CLIENT");
  // Sync depuis N8N (data table freshservice_ticket_categories) — wipe
  // total puis reconstruction de l'arbre. UI gating : confirm + busy.
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function syncFromN8n() {
    if (
      !window.confirm(
        "Cette action va SUPPRIMER toutes les catégories existantes (clients + internes) et les remplacer par celles de la data table N8N.\n\nLes tickets historiques perdront leur catégorie.\n\nContinuer ?",
      )
    ) {
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/v1/admin/categories/sync", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSyncResult(
        `${data.categoriesCreated} catégories créées · ${data.ticketsCleared} tickets décatégorisés · ${data.rootsCreated.length} racines`,
      );
      setReloadNonce((n) => n + 1);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function runAudit() {
    setAuditLoading(true);
    setAuditError(null);
    setAuditReport(null);
    try {
      const res = await fetch("/api/v1/ai/audit-categories", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const report: AuditReport = await res.json();
      setAuditReport(report);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuditLoading(false);
    }
  }

  // Load from API
  useEffect(() => {
    fetch("/api/v1/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setRawCategories(data as ApiCategory[]);
          const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4"];
          // Build tree: roots → subcategories
          const roots = data.filter((c: any) => !c.parentId);
          const mapped: Category[] = roots.map((r: any, i: number) => {
            const subs = data
              .filter((c: any) => c.parentId === r.id)
              .map((s: any) => ({
                id: s.id,
                name: s.name,
                ticketCount: 0,
                itemCategories: data
                  .filter((c: any) => c.parentId === s.id)
                  .map((ic: any) => ({ id: ic.id, name: ic.name, ticketCount: 0 })),
              }));
            return {
              id: r.id,
              name: r.name,
              description: r.description || "",
              color: COLORS[i % COLORS.length],
              ticketCount: 0,
              subcategories: subs,
              scope: r.scope === "INTERNAL" ? "INTERNAL" : "CLIENT",
            };
          });
          setCategories(mapped);
        }
      })
      .catch(() => {});
    // reloadNonce fait re-runner le fetch après une apply ou un CRUD manuel.
  }, [reloadNonce]);

  // --- Application d'une suggestion d'audit ---------------------------
  // Chaque kind nécessite une logique différente. On reconstitue les ids
  // via resolvePath sur rawCategories ; si le chemin n'existe pas (ou
  // n'existe plus après un précédent apply), on affiche une erreur claire.
  async function applySuggestion(suggestion: AuditSuggestion, idx: number) {
    setApplyError(null);
    setApplyingIdx(idx);
    try {
      if (suggestion.kind === "add") {
        // Crée chaque segment manquant à partir de la racine jusqu'au leaf.
        const target = suggestion.proposedPath ?? suggestion.path;
        const segments = parsePath(target);
        if (segments.length === 0) throw new Error("Chemin invalide");
        let parentId: string | null = null;
        let current = rawCategories;
        for (const seg of segments) {
          const existing = current.find(
            (c) =>
              (c.parentId ?? null) === parentId &&
              c.name.toLowerCase() === seg.toLowerCase(),
          );
          if (existing) {
            parentId = existing.id;
            continue;
          }
          const res = await fetch("/api/v1/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: seg, parentId }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
          }
          const created = (await res.json()) as ApiCategory;
          current = [...current, created];
          parentId = created.id;
        }
      } else if (suggestion.kind === "rename") {
        if (!suggestion.proposedPath) throw new Error("proposedPath manquant");
        const fromSegments = parsePath(suggestion.path);
        const toSegments = parsePath(suggestion.proposedPath);
        const chain = resolvePath(rawCategories, fromSegments);
        if (!chain || chain.length === 0) throw new Error("Catégorie introuvable à " + suggestion.path);
        const target = chain[chain.length - 1];
        const newName = toSegments[toSegments.length - 1];
        if (!newName) throw new Error("Nouveau nom invalide");
        const res = await fetch(`/api/v1/categories/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
      } else if (suggestion.kind === "rehome") {
        if (!suggestion.proposedPath) throw new Error("proposedPath manquant");
        const fromSegments = parsePath(suggestion.path);
        const toSegments = parsePath(suggestion.proposedPath);
        const chain = resolvePath(rawCategories, fromSegments);
        if (!chain || chain.length === 0) throw new Error("Catégorie introuvable à " + suggestion.path);
        const target = chain[chain.length - 1];
        // Nouveau parent = tous sauf le dernier segment du proposedPath.
        // Le nom final de la catégorie devient le DERNIER segment (au cas
        // où rehome inclut aussi un rename implicite).
        const newParentSegs = toSegments.slice(0, -1);
        const newName = toSegments[toSegments.length - 1];
        let newParentId: string | null = null;
        if (newParentSegs.length > 0) {
          const pChain = resolvePath(rawCategories, newParentSegs);
          if (!pChain) throw new Error("Nouveau parent introuvable : " + newParentSegs.join(" > "));
          newParentId = pChain[pChain.length - 1].id;
        }
        const patch: Record<string, unknown> = { parentId: newParentId };
        if (newName && newName.toLowerCase() !== target.name.toLowerCase()) {
          patch.name = newName;
        }
        const res = await fetch(`/api/v1/categories/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
      }
      setAppliedIdx((prev) => {
        const next = new Set(prev);
        next.add(idx);
        return next;
      });
      setReloadNonce((n) => n + 1);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyingIdx(null);
    }
  }
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["c1"]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function deleteCategory(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  function deleteSub(catId: string, subId: string) {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, subcategories: c.subcategories.filter((s) => s.id !== subId) }
          : c
      )
    );
  }

  function addSubcategory(catId: string) {
    if (!newName.trim()) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? {
              ...c,
              subcategories: [
                ...c.subcategories,
                {
                  id: `s${Date.now()}`,
                  name: newName.trim(),
                  ticketCount: 0,
                },
              ],
            }
          : c
      )
    );
    setNewName("");
    setCreatingFor(null);
  }

  function addCategory() {
    const newCat: Category = {
      id: `c${Date.now()}`,
      name: "Nouvelle catégorie",
      description: "Description de la catégorie",
      color: "#64748B",
      ticketCount: 0,
      subcategories: [],
      scope: activeScope,
    };
    setCategories((prev) => [...prev, newCat]);
    setEditingId(newCat.id);
  }

  // Vue filtrée par l'onglet actif. Le reste du rendu consomme `visibleCategories`
  // au lieu de `categories` directement, pour que la page entière (audit,
  // édition, expansion) se comporte comme deux univers indépendants.
  const visibleCategories = categories.filter((c) => c.scope === activeScope);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
            Catégories
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Organisez vos tickets par catégories et sous-catégories. Les
            tickets clients et internes ont des arbres distincts — un même
            label peut exister dans les deux.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={syncFromN8n}
            disabled={syncing}
            title="Wipe + import depuis N8N (freshservice_ticket_categories)"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderTree className="h-3.5 w-3.5" />
            )}
            {syncing ? "Synchro…" : "Synchroniser depuis N8N"}
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={runAudit}
            disabled={auditLoading}
            className="text-violet-700 border-violet-200 hover:bg-violet-50"
          >
            {auditLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {auditLoading ? "Analyse…" : "Audit IA"}
          </Button>
          <Button variant="primary" size="md" onClick={addCategory}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Nouvelle catégorie
          </Button>
        </div>
      </div>

      {/* Onglet scope : sépare l'arbre clients de l'arbre interne. La
          racine choisie ici dirige aussi addCategory + l'audit IA. */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {([
          { key: "CLIENT" as ScopeTab, label: "Tickets clients" },
          { key: "INTERNAL" as ScopeTab, label: "Tickets internes" },
        ]).map((t) => {
          const count = categories.filter((c) => c.scope === t.key).length;
          const active = activeScope === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveScope(t.key)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[11px] text-slate-400">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Feedback de sync — succès / erreur, message éphémère. */}
      {syncResult && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="p-3 text-[12.5px] text-emerald-800 flex items-center justify-between gap-3">
            <span>Synchronisation terminée — {syncResult}</span>
            <button onClick={() => setSyncResult(null)} className="text-emerald-600 hover:text-emerald-900">
              <X className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>
      )}
      {syncError && (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="p-3 text-[12.5px] text-red-800 flex items-center justify-between gap-3">
            <span>Échec synchronisation : {syncError}</span>
            <button onClick={() => setSyncError(null)} className="text-red-600 hover:text-red-900">
              <X className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Rapport d'audit IA — apparaît après un clic "Audit IA".
          L'utilisateur ne peut pas appliquer les changements en un clic
          (risque trop élevé pour l'arborescence) ; chaque suggestion est
          à évaluer et implémenter manuellement via les boutons + / ✎. */}
      {auditError && (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="p-4 text-[12.5px] text-red-800">
            Échec de l'audit : {auditError}
          </CardContent>
        </Card>
      )}
      {auditReport && (
        <Card className="border-violet-200/80 bg-violet-50/40">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700 ring-1 ring-inset ring-violet-200/80 shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-violet-900">
                    Rapport d'audit IA
                  </h3>
                  <p className="text-[11.5px] text-violet-700/85 mt-0.5">
                    {new Date(auditReport.generatedAt).toLocaleString("fr-CA", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAuditReport(null)}
                className="text-violet-400 hover:text-violet-700"
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {auditReport.summary && (
              <p className="text-[13px] text-violet-900/90 leading-relaxed mb-4">
                {auditReport.summary}
              </p>
            )}

            {auditReport.suggestions.length === 0 ? (
              <p className="text-[12.5px] text-violet-700/85 italic">
                Aucune suggestion — la taxonomie est cohérente avec l'usage actuel.
              </p>
            ) : (
              <div className="space-y-2">
                {auditReport.suggestions.map((s, i) => {
                  const KindIcon =
                    s.kind === "add" ? PlusCircle : s.kind === "rehome" ? ArrowRight : Type;
                  const kindLabel =
                    s.kind === "add"
                      ? "Ajouter"
                      : s.kind === "rehome"
                        ? "Déplacer"
                        : "Renommer";
                  const kindColor =
                    s.kind === "add"
                      ? "bg-emerald-100 text-emerald-800 ring-emerald-200/70"
                      : s.kind === "rehome"
                        ? "bg-amber-100 text-amber-800 ring-amber-200/70"
                        : "bg-sky-100 text-sky-800 ring-sky-200/70";
                  const isApplied = appliedIdx.has(i);
                  const isApplying = applyingIdx === i;
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${isApplied ? "border-emerald-200 bg-emerald-50/40" : "border-violet-200/60 bg-white"}`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset shrink-0 ${kindColor}`}
                        >
                          <KindIcon className="h-3 w-3" />
                          {kindLabel}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-medium text-slate-900 break-words">
                            <code className="bg-slate-100 px-1 rounded">{s.path}</code>
                            {s.proposedPath && (
                              <>
                                {" "}
                                <ArrowRight className="inline h-3 w-3 mx-0.5 text-slate-400" />{" "}
                                <code className="bg-slate-100 px-1 rounded">{s.proposedPath}</code>
                              </>
                            )}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-slate-600 leading-snug">
                            {s.reason}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={isApplied ? "outline" : "primary"}
                          disabled={isApplying || isApplied}
                          onClick={() => applySuggestion(s, i)}
                          className="shrink-0"
                        >
                          {isApplied ? (
                            <>✓ Appliqué</>
                          ) : isApplying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Appliquer"
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {applyError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-[11.5px] px-3 py-2">
                    <strong>Erreur lors de l&apos;application :</strong> {applyError}
                  </div>
                )}
                <p className="text-[10.5px] text-violet-700/70 mt-3 italic">
                  💡 Chaque « Appliquer » exécute réellement la modification
                  (création, renommage ou déplacement) via l&apos;API catégories.
                  Les tickets liés gardent leur référence et reflètent le
                  changement instantanément.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {visibleCategories.length === 0 && (
              <div className="p-8 text-center text-[13px] text-slate-500 italic">
                Aucune catégorie {activeScope === "CLIENT" ? "client" : "interne"}.
                Cliquez « Nouvelle catégorie » pour en créer une, ou « Synchroniser
                depuis N8N » pour importer depuis Freshservice.
              </div>
            )}
            {visibleCategories.map((cat) => {
              const isOpen = expanded.has(cat.id);
              return (
                <div key={cat.id}>
                  {/* Category row */}
                  <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/70 transition-colors group">
                    <button
                      onClick={() => toggleExpand(cat.id)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
                      ) : (
                        <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
                      )}
                    </button>
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ring-1 ring-inset"
                      style={{
                        backgroundColor: cat.color + "15",
                        color: cat.color,
                        boxShadow: `inset 0 0 0 1px ${cat.color}30`,
                      }}
                    >
                      <FolderTree className="h-4 w-4" strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold text-slate-900">
                          {cat.name}
                        </h3>
                        <Badge variant="default">
                          {cat.ticketCount} tickets
                        </Badge>
                        <Badge variant="outline">
                          {cat.subcategories.length} sous-cat.
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[12px] text-slate-500">
                        {cat.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingId(cat.id)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 transition-colors"
                        title="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCategory(cat.id)}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Subcategories */}
                  {isOpen && (
                    <div className="bg-slate-50/40 border-t border-slate-100 px-5 py-3 pl-[60px]">
                      <div className="space-y-1">
                        {cat.subcategories.map((sub) => (
                          <div
                            key={sub.id}
                            className="flex items-center gap-3 py-1.5 px-3 rounded-md hover:bg-white transition-colors group/sub"
                          >
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="flex-1 text-[13px] text-slate-700">
                              {sub.name}
                            </span>
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              {sub.ticketCount} tickets
                            </span>
                            <button
                              onClick={() => deleteSub(cat.id, sub.id)}
                              className="opacity-0 group-hover/sub:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}

                        {creatingFor === cat.id ? (
                          <div className="flex items-center gap-2 pt-2">
                            <Input
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              placeholder="Nom de la sous-catégorie"
                              className="h-8 text-[13px]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") addSubcategory(cat.id);
                                if (e.key === "Escape") {
                                  setCreatingFor(null);
                                  setNewName("");
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => addSubcategory(cat.id)}
                            >
                              Ajouter
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setCreatingFor(null);
                                setNewName("");
                              }}
                            >
                              Annuler
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setCreatingFor(cat.id)}
                            className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
                          >
                            <Plus className="h-3 w-3" strokeWidth={2.5} />
                            Ajouter une sous-catégorie
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {editingId && (
        <div className="text-[12px] text-slate-500 italic">
          Mode édition activé pour la catégorie sélectionnée (à implémenter)
        </div>
      )}
    </div>
  );
}
