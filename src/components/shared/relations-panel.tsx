"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Link2, Plus, Trash2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentType, RelationType } from "@/lib/content/relations";

interface Relation {
  id: string;
  sourceType: string; sourceId: string;
  targetType: string; targetId: string;
  relationType: string;
  note: string | null;
  createdAt: string;
}

interface SearchResult {
  type: ContentType;
  id: string;
  title: string;
  url: string;
}

const TYPE_LABELS: Record<string, string> = {
  particularity: "Particularité",
  policy_document: "Politique",
  gpo: "GPO",
  script: "Script",
  software: "Logiciel",
  software_instance: "Logiciel",
  change: "Changement",
  asset: "Actif",
  contract: "Contrat",
  ticket: "Ticket",
  article: "Article KB",
};

function typeLabel(t: string) { return TYPE_LABELS[t] ?? t; }

function linkFor(type: string, id: string): string {
  switch (type) {
    case "particularity": return `/particularities/${id}`;
    case "policy_document": return `/policies/documents/${id}`;
    case "software": case "software_instance": return `/software/${id}`;
    case "change": return `/changes/${id}`;
    case "asset": return `/assets/${id}`;
    case "article": return `/knowledge/${id}`;
    default: return "#";
  }
}

interface Props {
  sourceType: ContentType;
  sourceId: string;
  /** Types d'objets proposables comme cible lors de l'ajout. */
  allowedTargetTypes?: ContentType[];
}

const DEFAULT_ALLOWED: ContentType[] = ["particularity", "software_instance", "policy_document", "change", "asset"];

export function RelationsPanel({ sourceType, sourceId, allowedTargetTypes = DEFAULT_ALLOWED }: Props) {
  const [relations, setRelations] = useState<{ outgoing: Relation[]; incoming: Relation[] }>({ outgoing: [], incoming: [] });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/content-relations?sourceType=${sourceType}&sourceId=${sourceId}`);
    if (r.ok) setRelations(await r.json());
  }, [sourceType, sourceId]);

  useEffect(() => { void load(); }, [load]);

  async function remove(id: string) {
    if (!confirm("Supprimer ce lien ?")) return;
    const r = await fetch(`/api/v1/content-relations/${id}`, { method: "DELETE" });
    if (r.ok) await load();
  }

  const all = [
    ...relations.outgoing.map((r) => ({ ...r, direction: "out" as const })),
    ...relations.incoming.map((r) => ({ ...r, direction: "in" as const })),
  ];

  return (
    <Card>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13.5px] font-semibold text-slate-900 inline-flex items-center gap-1.5">
            <Link2 className="h-4 w-4 text-slate-500" /> Relations
          </h3>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Lier
          </Button>
        </div>

        {adding && (
          <AddRelationForm
            sourceType={sourceType}
            sourceId={sourceId}
            allowedTypes={allowedTargetTypes}
            onCancel={() => setAdding(false)}
            onAdded={async () => { setAdding(false); await load(); }}
          />
        )}

        {all.length === 0 && !adding && (
          <p className="text-[12.5px] text-slate-500">Aucune relation. Cliquez « Lier » pour en ajouter.</p>
        )}

        {all.length > 0 && (
          <ul className="space-y-1">
            {all.map((r) => {
              const otherType = r.direction === "out" ? r.targetType : r.sourceType;
              const otherId = r.direction === "out" ? r.targetId : r.sourceId;
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                  <Link href={linkFor(otherType, otherId)} className="flex items-center gap-2 flex-1 min-w-0 text-[12.5px]">
                    <span className="text-[10.5px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200">{typeLabel(otherType)}</span>
                    <span className="text-slate-400">{r.direction === "out" ? "→" : "←"}</span>
                    <span className="text-[11.5px] text-slate-500 truncate">{r.relationType}</span>
                    {r.note && <span className="text-[11px] text-slate-400 truncate">— {r.note}</span>}
                  </Link>
                  <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600 shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function AddRelationForm({ sourceType, sourceId, allowedTypes, onCancel, onAdded }: {
  sourceType: ContentType; sourceId: string; allowedTypes: ContentType[];
  onCancel: () => void; onAdded: () => Promise<void>;
}) {
  const [targetType, setTargetType] = useState<ContentType>(allowedTypes[0] ?? "particularity");
  const [targetId, setTargetId] = useState("");
  const [relationType, setRelationType] = useState<RelationType>("related");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/v1/search?q=${encodeURIComponent(q.trim())}`);
      if (r.ok) {
        const d = await r.json();
        const filtered = d.hits
          .filter((h: any) => {
            if (targetType === "software_instance") return h.type === "software";
            return h.type === targetType;
          })
          .filter((h: any) => !(h.type === sourceType && h.id === sourceId));
        setResults(filtered.slice(0, 8));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, targetType, sourceType, sourceId]);

  async function submit() {
    setError(null);
    if (!targetId) { setError("Choisissez un objet à lier."); return; }
    setSaving(true);
    const r = await fetch(`/api/v1/content-relations`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType, sourceId, targetType, targetId, relationType, note: note || null }),
    });
    setSaving(false);
    if (!r.ok) { const err = await r.json().catch(() => ({})); setError(err.error ?? "Erreur"); return; }
    await onAdded();
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
      {error && <div className="rounded bg-red-50 text-red-700 text-[11.5px] px-2 py-1 ring-1 ring-red-200">{error}</div>}
      <div className="grid gap-2 md:grid-cols-2">
        <select value={targetType} onChange={(e) => { setTargetType(e.target.value as ContentType); setTargetId(""); setResults([]); }} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
          {allowedTypes.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
        <select value={relationType} onChange={(e) => setRelationType(e.target.value as RelationType)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12.5px]">
          <option value="related">Lié à</option>
          <option value="affects">Affecte</option>
          <option value="applies_to">S'applique à</option>
          <option value="installed_on">Installé sur</option>
          <option value="requires">Nécessite</option>
          <option value="modifies">Modifie</option>
          <option value="triggered_by">Déclenché par</option>
          <option value="governs">Régit</option>
          <option value="documented_by">Documenté par</option>
          <option value="supersedes">Remplace</option>
        </select>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un objet à lier…" className="pl-8 h-9 text-[12.5px]" />
      </div>
      {results.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
          {results.map((r) => (
            <button key={`${r.type}-${r.id}`} type="button"
              onClick={() => { setTargetId(r.id); setQ(r.title); setResults([]); }}
              className={`w-full text-left px-2.5 py-1.5 text-[12.5px] hover:bg-slate-50 ${targetId === r.id ? "bg-blue-50" : ""}`}>
              {r.title}
            </button>
          ))}
        </div>
      )}
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optionnelle)" className="h-9 text-[12.5px]" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button size="sm" disabled={!targetId || saving} onClick={submit}>{saving ? "Ajout…" : "Lier"}</Button>
      </div>
    </div>
  );
}
