"use client";

// ============================================================================
// Modale légère de création de ticket depuis une colonne Kanban de projet.
//
// Pourquoi pas /tickets/new : l'agent peut avoir 5-10 tickets à créer en
// rafale dans le Kanban. Les redirections vers une page séparée cassent
// le flow. Cette modale :
//   - pré-remplit projectId, organizationId, status (colonne cliquée)
//   - demande uniquement les champs ESSENTIELS : sujet, priorité, description
//   - soumet via POST /api/v1/tickets (même endpoint que la page standard)
//   - appelle onCreated() au succès → le parent recharge le Kanban
//
// Les champs avancés (catégorie IA, assignee, SLA, etc.) sont gérés par
// le pipeline de triage automatique déclenché à la création. Le tech peut
// compléter depuis le ticket une fois créé.
// ============================================================================

import { useEffect, useState } from "react";
import { X, Save, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// La valeur de statut est passée telle quelle depuis le Kanban (souvent
// lowercase style mock-data : "new", "open", "in_progress", etc.). Le
// backend /api/v1/tickets normalise. On affiche un libellé humain via
// STATUS_LABELS avec fallback.
const STATUS_LABELS: Record<string, string> = {
  new: "Nouveau",
  open: "Ouvert",
  in_progress: "En cours",
  on_site: "Sur place",
  pending: "En attente",
  waiting_client: "Attente client",
  waiting_vendor: "Attente fournisseur",
  scheduled: "Planifié",
  resolved: "Résolu",
  closed: "Fermé",
  cancelled: "Annulé",
  // Valeurs uppercase Prisma aussi supportées (compat).
  NEW: "Nouveau",
  ASSIGNED: "Assigné",
  IN_PROGRESS: "En cours",
  WAITING: "En attente",
  ON_HOLD: "Suspendu",
  RESOLVED: "Résolu",
  CLOSED: "Fermé",
};

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  organizationId?: string;
  organizationName?: string;
  /** Statut initial = colonne Kanban d'où le "+" a été cliqué. */
  initialStatus: string;
  /** Callback déclenché après création réussie — parent recharge son Kanban. */
  onCreated?: (ticketId: string) => void;
}

export function QuickCreateTicketModal({
  open, onClose, projectId, projectName, organizationId, organizationName,
  initialStatus, onCreated,
}: Props) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [status, setStatus] = useState<string>(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Option pour enchaîner : crée le ticket puis réinitialise la modale
  // pour en saisir un autre dans la même colonne (utile pour un batch).
  const [createAnother, setCreateAnother] = useState(false);

  // Réinitialise le statut si le parent change la colonne cible entre 2
  // ouvertures (ex. ferme depuis "NEW", rouvre depuis "IN_PROGRESS").
  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);

  // Réinitialise les champs à chaque ouverture (sauf si createAnother a
  // été cochée à la précédente submission, auquel cas on préserve
  // priority/status pour un vrai batch).
  useEffect(() => {
    if (open) {
      setSubject("");
      setDescription("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!subject.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          description: description.trim() || null,
          priority,
          status,
          projectId,
          organizationId,
          organizationName,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const ticketId = json?.id ?? json?.data?.id;
      if (ticketId && onCreated) onCreated(ticketId);

      if (createAnother) {
        // On garde la modale ouverte, on vide juste sujet/description pour
        // enchaîner un autre ticket dans la même colonne.
        setSubject("");
        setDescription("");
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-xl my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
              Nouveau ticket
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              {projectName && <>Projet : <strong>{projectName}</strong></>}
              {organizationName && <> · {organizationName}</>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <Input
            label="Sujet *"
            placeholder="Ex: Configurer l'accès VPN pour l'utilisateur X"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            autoFocus
            required
          />

          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
              Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contexte, étapes attendues, critères d'acceptation…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                Priorité
              </label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Faible</SelectItem>
                  <SelectItem value="NORMAL">Normale</SelectItem>
                  <SelectItem value="HIGH">Haute</SelectItem>
                  <SelectItem value="URGENT">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
                Statut initial
              </label>
              <Select value={status} onValueChange={(v) => setStatus(v)}>
                <SelectTrigger>
                  <SelectValue>{STATUS_LABELS[status] ?? status}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* On liste uniquement les statuts mock-data (ceux utilisés
                      par le Kanban). L'utilisateur peut réassigner après
                      création via l'éditeur complet du ticket. */}
                  {["new", "open", "in_progress", "on_site", "pending",
                    "waiting_client", "waiting_vendor", "scheduled",
                    "resolved", "closed"].map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
            <label className="flex items-center gap-2 text-[12.5px] text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={createAnother}
                onChange={(e) => setCreateAnother(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              En créer un autre
            </label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting || !subject.trim()}
              >
                {submitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Plus className="h-4 w-4" />}
                Créer
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
