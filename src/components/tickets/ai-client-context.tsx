"use client";

// ============================================================================
// Widget "Conventions client" — affiché sur la fiche ticket.
//
// Montre les faits VALIDÉS connus sur le client courant (conventions,
// quirks, préférences, patterns d'incidents). Le technicien voit ce
// savoir AVANT de traiter le ticket → évite de poser des questions
// déjà répondues, aligne sa réponse avec les particularités connues.
//
// Boucle vertueuse : si le tech découvre quelque chose de nouveau sur
// le client pendant ce ticket, il peut l'ajouter directement via le
// bouton "+ Ajouter" (visible aux SUPERVISOR+) — le prochain tech sur
// un ticket similaire verra l'info.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Loader2,
  Plus,
  ExternalLink,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MemoryRow {
  id: string;
  category: string;
  content: string;
  source: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  convention: "Convention",
  quirk: "Particularité",
  preference: "Préférence",
  incident_pattern: "Pattern",
  procedure: "Procédure",
};

const CATEGORY_COLOR: Record<string, string> = {
  convention: "bg-blue-100 text-blue-700",
  quirk: "bg-amber-100 text-amber-700",
  preference: "bg-violet-100 text-violet-700",
  incident_pattern: "bg-red-100 text-red-700",
  procedure: "bg-emerald-100 text-emerald-700",
};

interface Props {
  organizationId: string | null;
  /** Slug URL — pour le lien vers la page org si l'admin veut gérer. */
  organizationSlug?: string | null;
}

export function AiClientContext({ organizationId, organizationSlug }: Props) {
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("convention");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Filtre "verified" par défaut — seuls les faits validés affichés
      // ici. Les pendants restent invisibles aux techs pour éviter le
      // bruit ; seul l'admin les voit dans l'onglet Intelligence IA.
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai-memory?status=verified`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addFact() {
    if (!organizationId || !newContent.trim()) return;
    setAdding(true);
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
    } finally {
      setAdding(false);
    }
  }

  // Pas d'org = pas de widget. Tickets sans client (ex: internes) n'affichent rien.
  if (!organizationId) return null;

  const shown = expanded ? memories : memories.slice(0, 5);
  const hasMore = memories.length > 5;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-slate-700" />
          <h3 className="text-[12px] font-semibold text-slate-800">
            Conventions client
          </h3>
          {memories.length > 0 && (
            <span className="text-[10px] text-slate-400 tabular-nums">
              {memories.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setAddOpen((o) => !o)}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            title="Ajouter un fait"
          >
            <Plus className="h-3 w-3" />
          </button>
          {organizationSlug && (
            <Link
              href={`/organisations/${organizationSlug}?tab=ai`}
              className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              title="Gérer la mémoire IA de ce client"
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {loading && (
        <p className="text-[11px] text-slate-400 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Chargement…
        </p>
      )}

      {error && <p className="text-[10.5px] text-red-600">{error}</p>}

      {!loading && memories.length === 0 && !addOpen && (
        <p className="text-[11px] text-slate-400 italic">
          Aucun fait validé pour ce client. L'IA en extraira automatiquement
          depuis les tickets résolus — ou ajoute-en un manuellement.
        </p>
      )}

      {addOpen && (
        <div className="space-y-1.5 rounded-md border border-blue-200 bg-blue-50/40 p-2">
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger className="h-7 text-[11.5px]">
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
            placeholder="Ex. Le serveur FS2 doit être arrêté gracieusement avant tout patch."
            className="h-7 text-[11.5px]"
          />
          <div className="flex items-center justify-end gap-1">
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
              onClick={addFact}
              disabled={adding || !newContent.trim()}
            >
              {adding ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Ajouter
            </Button>
          </div>
        </div>
      )}

      {!loading && memories.length > 0 && (
        <ul className="space-y-1.5">
          {shown.map((m) => (
            <li
              key={m.id}
              className="rounded-md bg-slate-50/70 px-2 py-1.5 text-[11.5px]"
            >
              <div className="flex items-start justify-between gap-1.5">
                <span
                  className={cn(
                    "inline-flex rounded-full px-1.5 py-0.5 text-[9.5px] font-medium shrink-0 mt-0.5",
                    CATEGORY_COLOR[m.category] ?? "bg-slate-100 text-slate-700",
                  )}
                >
                  {CATEGORY_LABEL[m.category] ?? m.category}
                </span>
                <p className="flex-1 text-slate-800 leading-snug">{m.content}</p>
                {m.source?.startsWith("manual") ? (
                  <span
                    className="inline-flex items-center text-slate-400 shrink-0 mt-0.5"
                    title="Ajouté manuellement par un humain"
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center text-violet-500 shrink-0 mt-0.5"
                    title="Extrait par IA puis validé"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] text-slate-500 hover:text-slate-900 inline-flex items-center gap-0.5"
        >
          <Clock className="h-2.5 w-2.5" />
          {expanded
            ? "Afficher seulement les 5 premiers"
            : `Voir les ${memories.length - 5} autres`}
        </button>
      )}
    </div>
  );
}
