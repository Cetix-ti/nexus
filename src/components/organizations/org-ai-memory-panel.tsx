"use client";

// ============================================================================
// AiMemory Panel — gestion des faits connus d'une organisation.
//
// Montre la liste des faits extraits par l'IA (auto) ou ajoutés manuellement
// par un admin, avec actions : valider, rejeter, supprimer. Les faits
// validés / non rejetés apparaissent dans le contexte des features IA
// (risk-analysis, monthly-report, sales-suggest) pour ce client.
//
// Ajout manuel possible (SUPERVISOR+) — utile quand l'IA n'a pas détecté
// un savoir connu des techs (ex: une convention interne client).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Plus,
  Clock,
  Sparkles,
  User,
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
import { cn } from "@/lib/utils";

interface AiMemoryRow {
  id: string;
  category: string;
  content: string;
  source: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  convention: "Convention",
  quirk: "Particularité",
  preference: "Préférence",
  incident_pattern: "Pattern d'incident",
  procedure: "Procédure",
  client: "Client",
  pattern: "Pattern",
};

export function OrgAiMemoryPanel({
  organizationId,
}: {
  organizationId: string;
}) {
  const [memories, setMemories] = useState<AiMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "verified" | "rejected">(
    "all",
  );
  const [extractLoading, setExtractLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("convention");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai-memory?status=${filter}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [organizationId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function runExtract() {
    setExtractLoading(true);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/extract-facts`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setExtractLoading(false);
    }
  }

  async function addManual() {
    if (!newContent.trim()) return;
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai-memory`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: newCategory, content: newContent }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setNewContent("");
      setAddOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  }

  async function action(id: string, act: "verify" | "reject") {
    try {
      await fetch(`/api/v1/ai/memory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      await load();
    } catch {
      /* ignore */
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce fait définitivement ?")) return;
    try {
      await fetch(`/api/v1/ai/memory/${id}`, { method: "DELETE" });
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-slate-700" />
          <h2 className="text-[14px] font-semibold text-slate-900">
            Faits connus (mémoire IA)
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="verified">Validés</SelectItem>
              <SelectItem value="rejected">Rejetés</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={runExtract}
            disabled={extractLoading}
          >
            {extractLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 text-violet-500" />
            )}
            Extraire
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddOpen((o) => !o)}
          >
            <Plus className="h-3 w-3" />
            Ajouter
          </Button>
        </div>
      </div>

      <p className="text-[11.5px] text-slate-500 mb-2">
        Les faits validés enrichissent le contexte des analyses IA pour ce
        client. Ceux rejetés sont ignorés mais gardés pour éviter la
        ré-extraction. Ceux en attente apparaissent marqués « non vérifié »
        dans les prompts.
      </p>

      {addOpen && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 mb-3 space-y-2">
          <div className="flex items-center gap-2">
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="convention">Convention</SelectItem>
                <SelectItem value="quirk">Particularité</SelectItem>
                <SelectItem value="preference">Préférence</SelectItem>
                <SelectItem value="incident_pattern">Pattern d'incident</SelectItem>
                <SelectItem value="procedure">Procédure</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Ex. Le serveur FS2 doit être redémarré manuellement après patch."
              className="flex-1"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setNewContent("");
                setAddOpen(false);
              }}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={addManual}
              disabled={!newContent.trim()}
            >
              Ajouter
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[12px] text-red-600 mb-2">{error}</p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-[12px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Chargement…
        </div>
      )}

      {!loading && memories.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 text-[12.5px] text-slate-500 text-center">
          Aucun fait dans cette catégorie.
          {filter === "all" && (
            <>
              <br />
              Lance « Extraire » pour analyser les tickets résolus récents.
            </>
          )}
        </div>
      )}

      {!loading && memories.length > 0 && (
        <div className="space-y-1.5">
          {memories.map((m) => {
            const isVerified = !!m.verifiedAt;
            const isRejected = !!m.rejectedAt;
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-md border px-3 py-2",
                  isVerified
                    ? "border-emerald-200 bg-emerald-50/40"
                    : isRejected
                      ? "border-slate-200 bg-slate-50/40 opacity-60"
                      : "border-amber-200 bg-amber-50/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          isVerified
                            ? "bg-emerald-100 text-emerald-700"
                            : isRejected
                              ? "bg-slate-200 text-slate-600"
                              : "bg-amber-100 text-amber-700",
                        )}
                      >
                        {CATEGORY_LABEL[m.category] ?? m.category}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                        {m.source?.startsWith("manual") ? (
                          <User className="h-2.5 w-2.5" />
                        ) : (
                          <Sparkles className="h-2.5 w-2.5" />
                        )}
                        {m.source?.startsWith("manual")
                          ? "Manuel"
                          : m.source?.startsWith("extracted")
                            ? "Extrait"
                            : m.source ?? "—"}
                      </span>
                      {isVerified && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-medium">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Validé
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
                          <XCircle className="h-2.5 w-2.5" />
                          Rejeté
                        </span>
                      )}
                      {!isVerified && !isRejected && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700">
                          <Clock className="h-2.5 w-2.5" />
                          En attente
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-slate-800">{m.content}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Créé {new Date(m.createdAt).toLocaleDateString("fr-CA")}
                      {m.verifiedAt && (
                        <>
                          {" "}
                          · Validé{" "}
                          {new Date(m.verifiedAt).toLocaleDateString("fr-CA")}
                        </>
                      )}
                      {m.rejectedAt && (
                        <>
                          {" "}
                          · Rejeté{" "}
                          {new Date(m.rejectedAt).toLocaleDateString("fr-CA")}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-0.5">
                    {!isVerified && (
                      <button
                        type="button"
                        onClick={() => action(m.id, "verify")}
                        className="h-6 w-6 inline-flex items-center justify-center rounded text-emerald-700 hover:bg-emerald-100"
                        title="Valider"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                      </button>
                    )}
                    {!isRejected && (
                      <button
                        type="button"
                        onClick={() => action(m.id, "reject")}
                        className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        title="Rejeter"
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      className="h-6 w-6 inline-flex items-center justify-center rounded text-red-500 hover:bg-red-50"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
