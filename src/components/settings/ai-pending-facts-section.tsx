"use client";

// ============================================================================
// Settings > Intelligence IA > Faits en attente (global)
//
// Vue centralisée pour qu'un SUPERVISOR+ passe en revue les faits IA proposés
// dans TOUTES les organisations d'un coup. Apparaît typiquement après un
// bulk-extract-facts : sans ça, il faudrait visiter chaque org une par une.
//
// Actions :
//   - Valider un fait (verify) → devient utilisable en contexte IA
//   - Rejeter (reject) → tombstone pour éviter la re-extraction
//
// Le filtre "org:…" permet de focaliser la revue sur un client spécifique.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Loader2,
  CheckCircle2,
  XCircle,
  Filter,
  Building2,
  RefreshCw,
  Ticket,
  Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PendingFact {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string | null;
  category: string;
  content: string;
  source: string | null;
  sourceTicket: { id: string; number: number; subject: string } | null;
  createdAt: string;
}

interface PendingFactsPayload {
  total: number;
  truncated: boolean;
  byOrg: Array<{ orgId: string; orgName: string; count: number }>;
  facts: PendingFact[];
}

const CATEGORY_LABEL: Record<string, string> = {
  convention: "Convention",
  quirk: "Quirk",
  preference: "Préférence",
  incident_pattern: "Pattern d'incident",
  procedure: "Procédure",
  client: "Client",
  pattern: "Pattern",
};

const CATEGORY_COLOR: Record<string, string> = {
  convention: "bg-blue-100 text-blue-700",
  quirk: "bg-amber-100 text-amber-700",
  preference: "bg-violet-100 text-violet-700",
  incident_pattern: "bg-red-100 text-red-700",
  procedure: "bg-emerald-100 text-emerald-700",
  client: "bg-slate-100 text-slate-700",
  pattern: "bg-indigo-100 text-indigo-700",
};

export function AiPendingFactsSection() {
  const [data, setData] = useState<PendingFactsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/ai/pending-facts");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const payload = await res.json();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function removeFacts(ids: Set<string>) {
    setData((prev) => {
      if (!prev) return prev;
      const remaining = prev.facts.filter((f) => !ids.has(f.id));
      const byOrg: Record<
        string,
        { orgId: string; orgName: string; count: number }
      > = {};
      for (const f of remaining) {
        if (!byOrg[f.orgId]) {
          byOrg[f.orgId] = { orgId: f.orgId, orgName: f.orgName, count: 0 };
        }
        byOrg[f.orgId].count += 1;
      }
      return {
        ...prev,
        total: remaining.length,
        byOrg: Object.values(byOrg).sort((a, b) => b.count - a.count),
        facts: remaining,
      };
    });
  }

  async function handleAction(id: string, action: "verify" | "reject") {
    setActing((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/v1/ai/memory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      removeFacts(new Set([id]));
      setSelected((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setActing((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
    }
  }

  async function handleBatch(action: "verify" | "reject") {
    if (selected.size === 0) return;
    const label = action === "verify" ? "valider" : "rejeter";
    if (!confirm(`${label[0].toUpperCase() + label.slice(1)} ${selected.size} fait(s) sélectionné(s) ?`))
      return;
    setBatchRunning(true);
    try {
      const ids = Array.from(selected);
      const res = await fetch("/api/v1/ai/memory/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      removeFacts(selected);
      setSelected(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBatchRunning(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(f: PendingFact) {
    setEditingId(f.id);
    setEditDraft(f.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit(id: string) {
    const content = editDraft.trim();
    if (content.length < 5) {
      alert("Le contenu doit avoir au moins 5 caractères.");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/v1/ai/memory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          facts: prev.facts.map((f) =>
            f.id === id ? { ...f, content } : f,
          ),
        };
      });
      cancelEdit();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSavingEdit(false);
    }
  }

  function selectAllVisible(ids: string[]) {
    setSelected((s) => {
      const allAlready = ids.every((id) => s.has(id));
      const next = new Set(s);
      if (allAlready) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  const visibleFacts =
    data && orgFilter !== "all"
      ? data.facts.filter((f) => f.orgId === orgFilter)
      : data?.facts ?? [];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-700 flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 text-indigo-500" />
              Faits en attente de validation — global
            </h3>
            <p className="text-[11.5px] text-slate-500 mt-0.5">
              Revue centralisée des faits proposés par l'IA dans toutes les
              organisations. Un fait validé devient utilisable en contexte IA
              (triage, response-assist, escalade).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="shrink-0"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Rafraîchir
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center gap-2 text-[12.5px] text-slate-500 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        )}

        {data && data.total === 0 && (
          <p className="text-[12.5px] text-slate-500 italic py-4 text-center">
            Aucun fait en attente — tout est validé ou rejeté.
          </p>
        )}

        {data && data.total > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-[12px] text-slate-600">
                <Filter className="h-3 w-3 text-slate-400" />
                <span>Filtrer par org :</span>
              </div>
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger className="h-7 w-full sm:w-64 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    Toutes ({data.total} faits)
                  </SelectItem>
                  {data.byOrg.map((o) => (
                    <SelectItem key={o.orgId} value={o.orgId}>
                      {o.orgName} ({o.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {data.truncated && (
                <span className="text-[10.5px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                  Liste tronquée à 500 — valide/rejette pour en voir plus
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 py-1 border-t border-slate-200 pt-2">
              <label className="flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={
                    visibleFacts.length > 0 &&
                    visibleFacts.every((f) => selected.has(f.id))
                  }
                  onChange={() =>
                    selectAllVisible(visibleFacts.map((f) => f.id))
                  }
                />
                Tout sélectionner ({visibleFacts.length})
              </label>
              {selected.size > 0 && (
                <>
                  <span className="text-[11px] text-slate-500">
                    {selected.size} sélectionné(s)
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBatch("reject")}
                      disabled={batchRunning}
                      className="h-7 text-[11px] text-red-700 hover:bg-red-50"
                    >
                      {batchRunning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      Rejeter {selected.size}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleBatch("verify")}
                      disabled={batchRunning}
                      className="h-7 text-[11px]"
                    >
                      {batchRunning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Valider {selected.size}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {visibleFacts.map((f) => {
                const isActing = acting[f.id] ?? false;
                const isSelected = selected.has(f.id);
                return (
                  <div
                    key={f.id}
                    className={`rounded-md border p-2.5 space-y-1.5 ${
                      isSelected
                        ? "border-indigo-300 bg-indigo-50/60"
                        : "border-slate-200 bg-slate-50/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300 shrink-0"
                        checked={isSelected}
                        onChange={() => toggleSelect(f.id)}
                      />
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                          CATEGORY_COLOR[f.category] ??
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {CATEGORY_LABEL[f.category] ?? f.category}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                        <Building2 className="h-3 w-3 text-slate-400" />
                        {f.orgSlug ? (
                          <a
                            href={`/organizations/${f.orgSlug}?tab=ai`}
                            className="hover:text-indigo-700 hover:underline"
                          >
                            {f.orgName}
                          </a>
                        ) : (
                          <span>{f.orgName}</span>
                        )}
                      </span>
                      <span className="text-[10.5px] text-slate-400 ml-auto">
                        {new Date(f.createdAt).toLocaleDateString("fr-CA", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </div>
                    {editingId === f.id ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          className="w-full min-h-[60px] text-[12.5px] rounded-md border border-slate-300 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                          maxLength={2000}
                          autoFocus
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={savingEdit}
                            className="h-6 text-[11px]"
                          >
                            Annuler
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => saveEdit(f.id)}
                            disabled={savingEdit || editDraft.trim().length < 5}
                            className="h-6 text-[11px]"
                          >
                            {savingEdit ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            Enregistrer
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[12.5px] text-slate-800 leading-relaxed">
                        {f.content}
                      </p>
                    )}
                    {f.sourceTicket && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Ticket className="h-3 w-3 text-slate-400" />
                        <span>Source :</span>
                        <a
                          href={`/tickets/${f.sourceTicket.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline truncate"
                          title={f.sourceTicket.subject}
                        >
                          #{f.sourceTicket.number} — {f.sourceTicket.subject}
                        </a>
                      </div>
                    )}
                    {editingId !== f.id && (
                      <div className="flex items-center gap-1.5 justify-end pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(f)}
                          disabled={isActing}
                          className="h-7 text-[11px] text-slate-600"
                          title="Corriger la formulation avant validation"
                        >
                          <Pencil className="h-3 w-3" />
                          Éditer
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(f.id, "reject")}
                          disabled={isActing}
                          className="h-7 text-[11px] text-red-700 hover:bg-red-50"
                        >
                          {isActing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          Rejeter
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleAction(f.id, "verify")}
                          disabled={isActing}
                          className="h-7 text-[11px]"
                        >
                          {isActing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Valider
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {visibleFacts.length === 0 && (
                <p className="text-[12px] text-slate-500 italic text-center py-3">
                  Aucun fait pour cette organisation.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
