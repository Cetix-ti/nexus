"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Sparkles,
  CheckCircle2,
  Loader2,
  Clock,
  MapPin,
  Users,
  Save,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AgendaItem {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: string;
  durationMinutes: number | null;
  order: number;
  addedBy: { id: string; firstName: string; lastName: string; avatar: string | null };
  createdAt: string;
}
interface Participant {
  id: string;
  role: string;
  attended: boolean | null;
  user: { id: string; firstName: string; lastName: string; avatar: string | null; email: string };
}
interface Meeting {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  location: string | null;
  notes: string | null;
  notesUpdatedAt: string | null;
  status: string;
  createdBy: { id: string; firstName: string; lastName: string; avatar: string | null };
  agenda: AgendaItem[];
  participants: Participant[];
  generatedTickets: Array<{ id: string; number: number; subject: string; status: string; priority: string }>;
}

interface Suggestion {
  subject: string;
  description: string;
  priority: string;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MeetingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  // AI suggestions
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionSource, setSuggestionSource] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [creatingTickets, setCreatingTickets] = useState(false);

  function load() {
    setLoading(true);
    fetch(`/api/v1/meetings/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m) {
          setMeeting(m);
          setNotesDraft(m.notes ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await fetch(`/api/v1/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      load();
    } finally {
      setSavingNotes(false);
    }
  }

  async function addAgendaItem() {
    if (!newItemTitle.trim()) return;
    setAddingItem(true);
    try {
      const res = await fetch(`/api/v1/meetings/${id}/agenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newItemTitle.trim() }),
      });
      if (res.ok) {
        setNewItemTitle("");
        load();
      }
    } finally {
      setAddingItem(false);
    }
  }

  async function toggleAgendaStatus(item: AgendaItem) {
    const next = item.status === "done" ? "pending" : "done";
    await fetch(`/api/v1/meetings/${id}/agenda/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  async function deleteAgendaItem(item: AgendaItem) {
    if (!confirm(`Supprimer le point « ${item.title} » ?`)) return;
    await fetch(`/api/v1/meetings/${id}/agenda/${item.id}`, { method: "DELETE" });
    load();
  }

  async function generateSuggestions() {
    setLoadingAi(true);
    setSuggestions([]);
    try {
      const res = await fetch(`/api/v1/meetings/${id}/ai-suggest-tickets`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setSuggestionSource(data.source ?? null);
        setSelectedSuggestions(new Set((data.suggestions ?? []).map((_: unknown, i: number) => i)));
      }
    } finally {
      setLoadingAi(false);
    }
  }

  async function createSelectedTickets() {
    const picks = suggestions.filter((_, i) => selectedSuggestions.has(i));
    if (picks.length === 0) return;
    setCreatingTickets(true);
    try {
      const res = await fetch(`/api/v1/meetings/${id}/create-tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickets: picks }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`${data.count} ticket(s) interne(s) créé(s)`);
        setSuggestions([]);
        setSelectedSuggestions(new Set());
        load();
      }
    } finally {
      setCreatingTickets(false);
    }
  }

  const duration = useMemo(() => {
    if (!meeting) return 0;
    return Math.round((new Date(meeting.endsAt).getTime() - new Date(meeting.startsAt).getTime()) / 60_000);
  }, [meeting]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }
  if (!meeting) {
    return <div className="p-6 text-center text-slate-500">Rencontre introuvable</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Top nav */}
      <div className="flex items-center gap-3">
        <Link href="/calendar" className="flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          Calendrier
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">{meeting.title}</h1>
          <div className="mt-1 flex items-center gap-4 text-[12.5px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {new Date(meeting.startsAt).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })}
              {" — "}
              {new Date(meeting.endsAt).toLocaleString("fr-CA", { timeStyle: "short" })}
              {" "}
              <span className="text-slate-400">({duration} min)</span>
            </span>
            {meeting.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {meeting.location}
              </span>
            )}
            {meeting.participants.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {meeting.participants.length} participant{meeting.participants.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <Badge variant={meeting.status === "completed" ? "success" : meeting.status === "in_progress" ? "warning" : "primary"}>
          {meeting.status === "scheduled" ? "Planifiée" : meeting.status === "in_progress" ? "En cours" : meeting.status === "completed" ? "Terminée" : meeting.status}
        </Badge>
      </div>

      {/* Description */}
      {meeting.description && (
        <Card>
          <CardContent className="p-4 text-[13px] text-slate-700 whitespace-pre-wrap">
            {meeting.description}
          </CardContent>
        </Card>
      )}

      {/* Agenda */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-slate-700">
              Ordre du jour
              <span className="ml-2 text-[11px] text-slate-400 tabular-nums">
                ({meeting.agenda.length} point{meeting.agenda.length > 1 ? "s" : ""})
              </span>
            </h2>
          </div>

          <div className="space-y-1.5">
            {meeting.agenda.length === 0 && (
              <p className="text-[12px] text-slate-400 italic py-2">Aucun point à l&apos;ordre du jour.</p>
            )}
            {meeting.agenda.map((it, i) => (
              <div key={it.id} className="flex items-start gap-2.5 group rounded-lg hover:bg-slate-50 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => toggleAgendaStatus(it)}
                  className={cn(
                    "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                    it.status === "done"
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-300 hover:border-slate-500",
                  )}
                >
                  {it.status === "done" && <CheckCircle2 className="h-3 w-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[13px] text-slate-900", it.status === "done" && "line-through text-slate-400")}>
                    <span className="text-slate-400 tabular-nums mr-1.5">{i + 1}.</span>
                    {it.title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ajouté par <span className="font-medium">{it.addedBy.firstName} {it.addedBy.lastName}</span>
                    {" · "}
                    {new Date(it.createdAt).toLocaleDateString("fr-CA")}
                  </p>
                </div>
                <button
                  onClick={() => deleteAgendaItem(it)}
                  className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                  title="Supprimer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add item */}
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addAgendaItem(); }}
              placeholder="Ajouter un point à l'ordre du jour..."
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={addAgendaItem} loading={addingItem} disabled={!newItemTitle.trim()}>
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes de réunion */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-slate-700">Notes de rencontre</h2>
            <Button
              variant={notesDraft !== (meeting.notes ?? "") ? "primary" : "outline"}
              size="sm"
              onClick={saveNotes}
              loading={savingNotes}
              disabled={notesDraft === (meeting.notes ?? "")}
            >
              <Save className="h-3.5 w-3.5" />
              Enregistrer
            </Button>
          </div>
          <AdvancedRichEditor
            value={notesDraft}
            onChange={setNotesDraft}
            placeholder="Prends des notes pendant la rencontre..."
            minHeight="220px"
          />
          {meeting.notesUpdatedAt && (
            <p className="mt-2 text-[11px] text-slate-400">
              Dernière sauvegarde : {new Date(meeting.notesUpdatedAt).toLocaleString("fr-CA")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Suggestions IA */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-slate-700 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              Suggestions d&apos;actions à partir de la rencontre
            </h2>
            <Button variant="outline" size="sm" onClick={generateSuggestions} loading={loadingAi}>
              <Sparkles className="h-3.5 w-3.5" />
              Analyser
            </Button>
          </div>

          {suggestions.length === 0 && !loadingAi && (
            <p className="text-[12px] text-slate-400 italic py-2">
              Clique sur &quot;Analyser&quot; pour suggérer des tickets / tâches à créer à partir des notes et de l&apos;ordre du jour.
            </p>
          )}

          {suggestions.length > 0 && (
            <>
              <p className="text-[11px] text-slate-400 mb-2">
                {suggestionSource === "openai" ? "Analysé par IA" : "Détecté par heuristique"} — {suggestions.length} action{suggestions.length > 1 ? "s" : ""} proposée{suggestions.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <label key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSuggestions.has(i)}
                      onChange={() => {
                        setSelectedSuggestions((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-slate-900">{s.subject}</p>
                        <Badge variant={s.priority === "high" || s.priority === "critical" ? "danger" : s.priority === "medium" ? "warning" : "default"} className="text-[9.5px]">
                          {s.priority}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-slate-500">{s.rationale}</p>
                      {s.description && (
                        <p className="mt-1 text-[11px] text-slate-600 whitespace-pre-wrap">{s.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setSuggestions([]); setSelectedSuggestions(new Set()); }}>
                  Abandonner
                </Button>
                <Button variant="primary" size="sm" onClick={createSelectedTickets} loading={creatingTickets} disabled={selectedSuggestions.size === 0}>
                  <Plus className="h-3.5 w-3.5" />
                  Créer {selectedSuggestions.size} ticket{selectedSuggestions.size > 1 ? "s" : ""} interne{selectedSuggestions.size > 1 ? "s" : ""}
                </Button>
              </div>
            </>
          )}

          {/* Tickets déjà générés */}
          {meeting.generatedTickets.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Tickets internes générés ({meeting.generatedTickets.length})
              </h3>
              <div className="space-y-1">
                {meeting.generatedTickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tickets/${t.id}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50"
                  >
                    <span className="text-[11px] font-mono text-blue-600">INC-{1000 + t.number}</span>
                    <span className="text-[12.5px] text-slate-700 truncate flex-1">{t.subject}</span>
                    <Badge variant="default" className="text-[9.5px]">{t.status}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
