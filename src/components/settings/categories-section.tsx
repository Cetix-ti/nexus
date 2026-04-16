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
}

const initialCategories: Category[] = [
  {
    id: "c1",
    name: "Matériel",
    description: "Problèmes liés au matériel informatique",
    color: "#3B82F6",
    ticketCount: 142,
    subcategories: [
      { id: "s1", name: "Postes de travail", ticketCount: 48 },
      { id: "s2", name: "Imprimantes", ticketCount: 32 },
      { id: "s3", name: "Périphériques", ticketCount: 28 },
      { id: "s4", name: "Mobile", ticketCount: 34 },
    ],
  },
  {
    id: "c2",
    name: "Logiciels",
    description: "Installation, mise à jour et bugs logiciels",
    color: "#8B5CF6",
    ticketCount: 198,
    subcategories: [
      { id: "s5", name: "Microsoft Office", ticketCount: 67 },
      { id: "s6", name: "Navigateurs", ticketCount: 24 },
      { id: "s7", name: "Antivirus", ticketCount: 18 },
      { id: "s8", name: "Applications métier", ticketCount: 89 },
    ],
  },
  {
    id: "c3",
    name: "Réseau & VPN",
    description: "Connectivité, VPN, WiFi",
    color: "#10B981",
    ticketCount: 87,
    subcategories: [
      { id: "s9", name: "VPN", ticketCount: 34 },
      { id: "s10", name: "WiFi", ticketCount: 28 },
      { id: "s11", name: "Pare-feu", ticketCount: 25 },
    ],
  },
  {
    id: "c4",
    name: "Compte & Accès",
    description: "Mots de passe, MFA, droits d'accès",
    color: "#F59E0B",
    ticketCount: 124,
    subcategories: [
      { id: "s12", name: "Réinitialisation MDP", ticketCount: 56 },
      { id: "s13", name: "MFA", ticketCount: 23 },
      { id: "s14", name: "Permissions", ticketCount: 45 },
    ],
  },
  {
    id: "c5",
    name: "Email",
    description: "Outlook, Exchange, courriels",
    color: "#EF4444",
    ticketCount: 76,
    subcategories: [
      { id: "s15", name: "Configuration", ticketCount: 18 },
      { id: "s16", name: "Spam", ticketCount: 31 },
      { id: "s17", name: "Synchronisation", ticketCount: 27 },
    ],
  },
  {
    id: "c6",
    name: "Sécurité",
    description: "Incidents de sécurité et menaces",
    color: "#DC2626",
    ticketCount: 42,
    subcategories: [
      { id: "s18", name: "Phishing", ticketCount: 19 },
      { id: "s19", name: "Malware", ticketCount: 12 },
      { id: "s20", name: "Audit", ticketCount: 11 },
    ],
  },
];

export function CategoriesSection() {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  // AI taxonomy audit
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

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
            };
          });
          if (mapped.length > 0) setCategories(mapped);
        }
      })
      .catch(() => {});
  }, []);
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
    };
    setCategories((prev) => [...prev, newCat]);
    setEditingId(newCat.id);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
            Catégories
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Organisez vos tickets par catégories et sous-catégories
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-violet-200/60 bg-white px-3 py-2.5 space-y-1.5"
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
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10.5px] text-violet-700/70 mt-3 italic">
                  💡 Applique les suggestions manuellement via les boutons + / ✎ ci-dessous.
                  L'IA n'altère pas la hiérarchie automatiquement.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {categories.map((cat) => {
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
