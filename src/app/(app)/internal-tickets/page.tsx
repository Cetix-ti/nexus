"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Briefcase, Loader2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import type { Ticket } from "@/lib/mock-data";

export default function InternalTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/v1/tickets?internal=true&limit=200")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Ticket[]) => setTickets(Array.isArray(arr) ? arr : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = tickets;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.subject.toLowerCase().includes(q) || t.number.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((t) => t.status === statusFilter);
    }
    return list;
  }, [tickets, search, statusFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
            Tickets internes
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Activités administratives et projets Cetix (séparés des tickets clients).
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nouveau ticket interne
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search className="h-3.5 w-3.5" />}
            className="flex-1"
          />
          <div className="flex items-center gap-1 text-[11.5px]">
            {["all", "new", "open", "in_progress", "resolved"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 h-8 rounded-md font-medium transition-colors ${statusFilter === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {s === "all" ? "Tous" : s === "new" ? "Nouveau" : s === "open" ? "Ouvert" : s === "in_progress" ? "En cours" : "Résolu"}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Briefcase className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <h3 className="text-[15px] font-semibold text-slate-900">Aucun ticket interne</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Les tickets internes sont créés depuis les rencontres (ordre du jour → IA) ou manuellement.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">#</th>
                <th className="px-4 py-2.5 text-left">Sujet</th>
                <th className="px-4 py-2.5 text-left">Statut</th>
                <th className="px-4 py-2.5 text-left">Priorité</th>
                <th className="px-4 py-2.5 text-left">Assigné</th>
                <th className="px-4 py-2.5 text-left">Créé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 text-[12px] font-mono text-blue-600">
                    <Link href={`/tickets/${t.id}`}>{t.number}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/tickets/${t.id}`} className="text-[13px] text-slate-900 font-medium hover:underline">
                      {t.subject}
                    </Link>
                    {t.meetingId && (
                      <div className="mt-0.5 text-[10.5px] text-slate-400">
                        <Link href={`/calendar/meetings/${t.meetingId}`} className="hover:underline">
                          ← issu d&apos;une rencontre
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="default">{t.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-600">{t.priority}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-600">{t.assigneeName ?? "—"}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 tabular-nums">
                    {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true, locale: fr })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showCreate && (
        <CreateInternalTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={(newTicket) => {
            setShowCreate(false);
            router.push(`/tickets/${newTicket.id}`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Création de ticket interne
// ---------------------------------------------------------------------------
function CreateInternalTicketModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: { id: string }) => void;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!subject.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          description,
          priority,
          type: "service_request",
          isInternal: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `Erreur ${res.status}`);
        return;
      }
      const created = await res.json();
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">
            Nouveau ticket interne
          </h2>
        </div>
        <div className="p-5 space-y-3">
          <Input
            label="Sujet"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex: Mettre à jour la page de tarifs"
            autoFocus
          />
          <div>
            <label className="text-[11px] font-medium text-slate-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Détails, contexte…"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-500">Priorité</label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Faible</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="high">Élevée</SelectItem>
                <SelectItem value="critical">Critique</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && (
            <p className="text-[12px] text-red-600">{error}</p>
          )}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={saving}
            disabled={!subject.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            Créer
          </Button>
        </div>
      </div>
    </div>
  );
}
