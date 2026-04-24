"use client";

// ============================================================================
// Widget "Sous-tâches" — sidebar ticket. Décomposition cochable d'un ticket.
// Pas de temps propre : le temps reste au niveau du ticket parent. Quand
// toutes les cases sont cochées, signal visuel au tech qu'il peut fermer.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { CheckSquare, Square, Plus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Subtask {
  id: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  sortOrder: number;
}

export function TicketSubtasksWidget({ ticketId }: { ticketId: string }) {
  const [rows, setRows] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/v1/tickets/${ticketId}/subtasks`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setRows(d.data ?? []))
      .finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!newTitle.trim()) return;
    setAdding(true);
    await fetch(`/api/v1/tickets/${ticketId}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setAdding(false);
    setNewTitle("");
    load();
  }

  async function toggle(r: Subtask) {
    // Optimistic UI : flip immédiatement, rollback si l'API échoue.
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)));
    const res = await fetch(`/api/v1/tickets/${ticketId}/subtasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtaskId: r.id, done: !r.done }),
    });
    if (!res.ok) load();
  }

  async function remove(r: Subtask) {
    if (!confirm(`Supprimer la sous-tâche « ${r.title} » ?`)) return;
    await fetch(`/api/v1/tickets/${ticketId}/subtasks?subtaskId=${r.id}`, {
      method: "DELETE",
    });
    load();
  }

  const done = rows.filter((r) => r.done).length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-2 overflow-hidden">
      <p className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
        <CheckSquare className="h-3.5 w-3.5 text-slate-500" />
        Sous-tâches
        {rows.length > 0 && (
          <span className="ml-auto text-[10.5px] font-normal text-slate-400 tabular-nums">
            {done}/{rows.length}
          </span>
        )}
      </p>

      {loading ? (
        <p className="text-[11.5px] text-slate-400 italic">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-[11.5px] text-slate-400 italic">Aucune sous-tâche.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="group flex items-start gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => toggle(r)}
                className="shrink-0 mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors"
                title={r.done ? "Marquer non fait" : "Marquer fait"}
              >
                {r.done ? (
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
              </button>
              <span
                className={cn(
                  "flex-1 min-w-0 text-[12px] leading-snug",
                  r.done ? "text-slate-400 line-through" : "text-slate-700",
                )}
              >
                {r.title}
              </span>
              <button
                type="button"
                onClick={() => remove(r)}
                className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                title="Supprimer"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); add(); }}
        className="flex items-center gap-1.5 pt-1 border-t border-slate-100"
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Nouvelle sous-tâche..."
          className="flex-1 min-w-0 h-7 rounded border border-slate-200 bg-white px-2 text-[12px] placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          className="inline-flex items-center justify-center h-7 w-7 rounded text-slate-400 hover:bg-slate-100 hover:text-blue-600 disabled:opacity-40"
          title="Ajouter"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      </form>
    </div>
  );
}
