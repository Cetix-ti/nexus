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
  Pencil,
  Trash2,
  Play,
  Check,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  generatedTickets: Array<{ id: string; number: number; subject: string; status: string; priority: string; isInternal?: boolean }>;
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

  const [showEdit, setShowEdit] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);

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

  async function updateStatus(next: string) {
    await fetch(`/api/v1/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  async function deleteMeeting() {
    if (!confirm("Supprimer cette rencontre ? L'événement calendrier associé sera aussi supprimé. Les tickets internes générés restent intacts.")) return;
    const res = await fetch(`/api/v1/meetings/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/calendar");
    else alert("Suppression impossible");
  }

  async function removeParticipant(userId: string) {
    await fetch(`/api/v1/meetings/${id}/participants?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    load();
  }

  async function toggleAttended(userId: string, attended: boolean) {
    await fetch(`/api/v1/meetings/${id}/participants`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, attended }),
    });
    load();
  }

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
        <div className="flex items-center gap-2">
          <Badge variant={meeting.status === "completed" ? "success" : meeting.status === "in_progress" ? "warning" : meeting.status === "cancelled" ? "danger" : "primary"}>
            {meeting.status === "scheduled" ? "Planifiée" : meeting.status === "in_progress" ? "En cours" : meeting.status === "completed" ? "Terminée" : meeting.status === "cancelled" ? "Annulée" : meeting.status}
          </Badge>
          {meeting.status === "scheduled" && (
            <Button size="sm" variant="outline" onClick={() => updateStatus("in_progress")}>
              <Play className="h-3.5 w-3.5" />
              Commencer
            </Button>
          )}
          {meeting.status === "in_progress" && (
            <Button size="sm" variant="primary" onClick={() => updateStatus("completed")}>
              <Check className="h-3.5 w-3.5" />
              Terminer
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Modifier
          </Button>
          <Button size="sm" variant="ghost" onClick={deleteMeeting} className="text-red-600 hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
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
              <AgendaItemRow
                key={it.id}
                item={it}
                index={i}
                onToggle={() => toggleAgendaStatus(it)}
                onDelete={() => deleteAgendaItem(it)}
                onSaveNotes={async (notes: string) => {
                  await fetch(`/api/v1/meetings/${id}/agenda/${it.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notes }),
                  });
                  load();
                }}
                onRename={async (title: string) => {
                  await fetch(`/api/v1/meetings/${id}/agenda/${it.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title }),
                  });
                  load();
                }}
              />
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
                {meeting.generatedTickets.map((t) => {
                  // Tickets générés depuis une rencontre = toujours internes.
                  // Route vers /internal-tickets/ pour que la sidebar reste cohérente.
                  const href = t.isInternal ? `/internal-tickets/${t.id}` : `/tickets/${t.id}`;
                  const prefix = t.isInternal ? "INT" : "INC";
                  return (
                    <Link
                      key={t.id}
                      href={href}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50"
                    >
                      <span className="text-[11px] font-mono text-blue-600">{prefix}-{1000 + t.number}</span>
                      <span className="text-[12.5px] text-slate-700 truncate flex-1">{t.subject}</span>
                      <Badge variant="default" className="text-[9.5px]">{t.status}</Badge>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participants */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-semibold text-slate-700 flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-slate-500" />
              Participants
              <span className="text-[11px] text-slate-400 tabular-nums">
                ({meeting.participants.length})
              </span>
            </h2>
            <Button variant="outline" size="sm" onClick={() => setShowAddParticipant(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
          {meeting.participants.length === 0 ? (
            <p className="text-[12px] text-slate-400 italic py-2">Aucun participant.</p>
          ) : (
            <div className="space-y-1">
              {meeting.participants.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-slate-50 group">
                  <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                    {p.user.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.user.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-600">
                        {p.user.firstName[0]}{p.user.lastName[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-slate-900 truncate">
                      {p.user.firstName} {p.user.lastName}
                    </p>
                    <p className="text-[10.5px] text-slate-400">
                      {p.role === "organizer" ? "Organisateur" : p.role === "optional" ? "Optionnel" : "Participant"}
                    </p>
                  </div>
                  {meeting.status === "completed" && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!p.attended}
                        onChange={(e) => toggleAttended(p.user.id, e.target.checked)}
                      />
                      Présent
                    </label>
                  )}
                  {p.role !== "organizer" && (
                    <button
                      onClick={() => removeParticipant(p.user.id)}
                      className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                      title="Retirer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showEdit && (
        <EditMeetingModal
          meeting={meeting}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            load();
          }}
        />
      )}

      {showAddParticipant && (
        <AddParticipantModal
          meetingId={meeting.id}
          currentParticipantIds={meeting.participants.map((p) => p.user.id)}
          onClose={() => setShowAddParticipant(false)}
          onAdded={() => {
            setShowAddParticipant(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row d'un item d'agenda — supporte rename + notes repliables
// ---------------------------------------------------------------------------
function AgendaItemRow({
  item,
  index,
  onToggle,
  onDelete,
  onSaveNotes,
  onRename,
}: {
  item: AgendaItem;
  index: number;
  onToggle: () => void;
  onDelete: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
  onRename: (title: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const hasNotesChanges = notesDraft !== (item.notes ?? "");

  return (
    <div className="group rounded-lg hover:bg-slate-50 px-2 py-1.5">
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
            item.status === "done"
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 hover:border-slate-500",
          )}
        >
          {item.status === "done" && <CheckCircle2 className="h-3 w-3" />}
        </button>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && titleDraft.trim()) {
                    await onRename(titleDraft.trim());
                    setEditingTitle(false);
                  } else if (e.key === "Escape") {
                    setTitleDraft(item.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                className="h-7 text-[13px]"
              />
              <Button size="sm" variant="ghost" onClick={() => setEditingTitle(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full text-left"
            >
              <p className={cn("text-[13px] text-slate-900", item.status === "done" && "line-through text-slate-400")}>
                <span className="text-slate-400 tabular-nums mr-1.5">{index + 1}.</span>
                {item.title}
                {item.notes && <span className="ml-1.5 text-[10.5px] text-blue-600">· notes</span>}
                {item.durationMinutes && (
                  <span className="ml-1.5 text-[10.5px] text-slate-400">· {item.durationMinutes} min</span>
                )}
              </p>
            </button>
          )}
          <p className="text-[11px] text-slate-500 mt-0.5">
            Ajouté par <span className="font-medium">{item.addedBy.firstName} {item.addedBy.lastName}</span>
            {" · "}
            {new Date(item.createdAt).toLocaleDateString("fr-CA")}
          </p>
        </div>
        <button
          onClick={() => { setTitleDraft(item.title); setEditingTitle(true); }}
          className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          title="Renommer"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
          title="Supprimer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 ml-8 space-y-2">
          {item.description && (
            <p className="text-[12px] text-slate-600 whitespace-pre-wrap">{item.description}</p>
          )}
          <div>
            <label className="text-[10.5px] font-medium uppercase tracking-wider text-slate-500">
              Notes de l&apos;item
            </label>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              placeholder="Notes spécifiques à ce point…"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {hasNotesChanges && (
              <div className="mt-1 flex justify-end gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setNotesDraft(item.notes ?? "")}>
                  Annuler
                </Button>
                <Button size="sm" variant="primary" onClick={() => onSaveNotes(notesDraft)}>
                  Enregistrer
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit meeting modal (title / time / location / description)
// ---------------------------------------------------------------------------
function EditMeetingModal({
  meeting,
  onClose,
  onSaved,
}: {
  meeting: Meeting;
  onClose: () => void;
  onSaved: () => void;
}) {
  function splitIso(iso: string) {
    const d = new Date(iso);
    return {
      date: d.toISOString().slice(0, 10),
      time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    };
  }
  const s = splitIso(meeting.startsAt);
  const e = splitIso(meeting.endsAt);
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description ?? "");
  const [location, setLocation] = useState(meeting.location ?? "");
  const [startDate, setStartDate] = useState(s.date);
  const [startTime, setStartTime] = useState(s.time);
  const [endDate, setEndDate] = useState(e.date);
  const [endTime, setEndTime] = useState(e.time);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) return;
    const startsDate = new Date(`${startDate}T${startTime}:00`);
    const endsDate = new Date(`${endDate}T${endTime}:00`);
    if (endsDate <= startsDate) {
      setError("La fin doit être après le début.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/meetings/${meeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          location,
          startsAt: startsDate.toISOString(),
          endsAt: endsDate.toISOString(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `Erreur ${res.status}`);
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg my-4 rounded-2xl bg-white shadow-2xl"
        onClick={(evt) => evt.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Modifier la rencontre</h2>
        </div>
        <div className="p-5 space-y-3">
          <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" label="Début" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="time" label="Heure" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" label="Fin" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Input type="time" label="Heure" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <Input label="Emplacement" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bureau Cetix, Teams, Zoom…" />
          <div>
            <label className="text-[11px] font-medium text-slate-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!title.trim()}>
            <Save className="h-3.5 w-3.5" />
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add participant modal
// ---------------------------------------------------------------------------
function AddParticipantModal({
  meetingId,
  currentParticipantIds,
  onClose,
  onAdded,
}: {
  meetingId: string;
  currentParticipantIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [role, setRole] = useState<"attendee" | "optional" | "organizer">("attendee");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Array<{ id: string; name: string; firstName: string; lastName: string }>) => {
        setUsers(
          arr
            .filter((u) => !currentParticipantIds.includes(u.id))
            .map((u) => ({ id: u.id, name: u.name || `${u.firstName} ${u.lastName}` })),
        );
      })
      .catch(() => {});
  }, [currentParticipantIds]);

  async function submit() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/meetings/${meetingId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected), role }),
      });
      if (res.ok) onAdded();
      else alert("Ajout impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md my-4 rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Ajouter des participants</h2>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-slate-500">Rôle</label>
            <Select value={role} onValueChange={(v) => setRole(v as "attendee" | "optional" | "organizer")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="attendee">Participant</SelectItem>
                <SelectItem value="optional">Optionnel</SelectItem>
                <SelectItem value="organizer">Organisateur</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
            {users.length === 0 ? (
              <p className="p-3 text-[12px] text-slate-400 text-center">
                Tous les agents sont déjà participants.
              </p>
            ) : (
              users.map((u) => {
                const checked = selected.has(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.id)) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        });
                      }}
                    />
                    <span className="text-[12.5px] text-slate-700">{u.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={selected.size === 0}>
            <UserPlus className="h-3.5 w-3.5" />
            Ajouter ({selected.size})
          </Button>
        </div>
      </div>
    </div>
  );
}
