"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  X,
  ExternalLink,
  Clock,
  Building2,
  User,
  Tag as TagIcon,
  AlertTriangle,
  Send,
  Lock,
  ChevronRight,
  Calendar,
  Zap,
  ArrowUp,
  Minus,
  ArrowDown,
  MessageSquare,
  Paperclip,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor, type Attachment } from "@/components/ui/rich-text-editor";
import { Switch } from "@/components/ui/switch";
import { OrgLogo } from "@/components/organizations/org-logo";
import {
  bumpHourBankUsage,
  type WorkTypeOption,
  type RateTierOption,
} from "@/components/billing/client-billing-overrides-section";
import { useAgentAvatarsStore } from "@/stores/agent-avatars-store";
import {
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  TYPE_CONFIG,
  type Ticket,
  type TicketStatus,
  type TicketPriority,
  type TicketType,
  ACTIVE_TICKET_STATUSES,
} from "@/lib/mock-data";

interface TicketQuickViewModalProps {
  ticket: Ticket | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (ticketId: string, status: TicketStatus) => void;
}

const STATUS_LABELS_FR: Record<TicketStatus, string> = {
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
  deleted: "Supprimé",
};

const PRIORITY_LABELS_FR: Record<TicketPriority, string> = {
  critical: "Critique",
  high: "Élevée",
  medium: "Moyenne",
  low: "Faible",
};

const PRIORITY_ICONS: Record<
  TicketPriority,
  { Icon: typeof ArrowUp; tint: string; bg: string }
> = {
  critical: { Icon: Zap, tint: "text-red-600", bg: "bg-red-50" },
  high: { Icon: ArrowUp, tint: "text-orange-600", bg: "bg-orange-50" },
  medium: { Icon: Minus, tint: "text-amber-600", bg: "bg-amber-50" },
  low: { Icon: ArrowDown, tint: "text-emerald-600", bg: "bg-emerald-50" },
};

const statusBadgeVariant: Record<
  TicketStatus,
  "primary" | "default" | "warning" | "success" | "danger"
> = {
  new: "primary",
  open: "primary",
  in_progress: "warning",
  on_site: "primary",
  pending: "warning",
  waiting_client: "default",
  waiting_vendor: "default",
  scheduled: "primary",
  resolved: "success",
  closed: "default",
  cancelled: "default",
  deleted: "danger",
};

const priorityBadgeVariant: Record<
  TicketPriority,
  "danger" | "warning" | "default" | "success"
> = {
  critical: "danger",
  high: "warning",
  medium: "default",
  low: "success",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarGradient(name: string): string {
  const gradients = [
    "from-blue-500 to-blue-700",
    "from-violet-500 to-violet-700",
    "from-emerald-500 to-emerald-700",
    "from-amber-500 to-amber-700",
    "from-rose-500 to-rose-700",
    "from-cyan-500 to-cyan-700",
    "from-fuchsia-500 to-fuchsia-700",
    "from-indigo-500 to-indigo-700",
  ];
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

interface LocalComment {
  id: string;
  authorName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export function TicketQuickViewModal({
  ticket,
  open,
  onClose,
  onStatusChange,
}: TicketQuickViewModalProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const sessUser = session?.user as
    | { id?: string; firstName?: string; lastName?: string; email?: string }
    | undefined;
  const currentUserId = sessUser?.id ?? "";
  const currentUserName = sessUser
    ? `${sessUser.firstName ?? ""} ${sessUser.lastName ?? ""}`.trim() ||
      sessUser.email?.split("@")[0] ||
      "Utilisateur"
    : "Utilisateur";

  const avatars = useAgentAvatarsStore((s) => s.avatars);
  const loadAvatars = useAgentAvatarsStore((s) => s.load);
  useEffect(() => { loadAvatars(); }, [loadAvatars]);

  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [localComments, setLocalComments] = useState<LocalComment[]>([]);
  // Le store liste les tickets sans `descriptionHtml` (payload trop lourd).
  // Quand la modale s'ouvre on fetch le HTML sanitizé pour préserver la mise
  // en page des courriels entrants (gras, images inline, listes, etc.).
  const [descriptionHtml, setDescriptionHtml] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !ticket?.id) { setDescriptionHtml(null); return; }
    let cancelled = false;
    fetch(`/api/v1/tickets/${ticket.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const html = (d.data ?? d)?.descriptionHtml;
        if (typeof html === "string" && html.trim()) setDescriptionHtml(html);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, ticket?.id]);
  const [localStatus, setLocalStatus] = useState<TicketStatus | undefined>(
    ticket?.status
  );
  const [localPriority, setLocalPriority] = useState<TicketPriority | undefined>(
    ticket?.priority
  );

  // Quick time-entry state
  const [timeOpen, setTimeOpen] = useState(false);
  // Types de travail + paliers tarifaires — chargés DEPUIS L'API (DB).
  // L'ancien `loadWorkTypes` (localStorage) renvoyait des IDs factices
  // (`wt_onsite`, `wt_remote`…) en fallback ; quand on les POSTait, la
  // contrainte FK `time_entries_work_type_id_fkey` pétait. Source de
  // vérité unique = la DB, comme dans AddTimeModal.
  const ticketOrgId = (ticket as unknown as { organizationId?: string })?.organizationId ?? "";
  const [workTypes, setWorkTypes] = useState<WorkTypeOption[]>([]);
  const [workTypeId, setWorkTypeId] = useState<string>("");
  const [rateTiers, setRateTiers] = useState<RateTierOption[]>([]);
  const [rateTierId, setRateTierId] = useState<string>("");
  // Sélecteur d'agent — saisie au nom d'un collègue. Liste fetchée à
  // l'ouverture du formulaire (via /api/v1/users), agentId initialisé
  // à l'utilisateur courant.
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [agentId, setAgentId] = useState<string>("");
  useEffect(() => {
    if (!timeOpen || !ticketOrgId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/v1/organizations/${encodeURIComponent(ticketOrgId)}/work-types`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/v1/organizations/${encodeURIComponent(ticketOrgId)}/rate-tiers`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([wtJson, rtJson]) => {
      if (cancelled) return;
      const wtRows = Array.isArray(wtJson?.data) ? wtJson.data : [];
      const wtMapped: WorkTypeOption[] = wtRows.map((w: { id: string; label: string; timeType: WorkTypeOption["timeType"] }) => ({
        id: w.id, label: w.label, timeType: w.timeType,
      }));
      setWorkTypes(wtMapped);
      setWorkTypeId((prev) => (wtMapped.find((w) => w.id === prev) ? prev : wtMapped[0]?.id ?? ""));

      const rtRows = Array.isArray(rtJson?.data) ? rtJson.data : [];
      const rtMapped: RateTierOption[] = rtRows.map((t: { id: string; label: string; hourlyRate: number }) => ({
        id: t.id, label: t.label, hourlyRate: t.hourlyRate,
      }));
      setRateTiers(rtMapped);
      setRateTierId((prev) => (rtMapped.find((t) => t.id === prev) ? prev : rtMapped[0]?.id ?? ""));
    });
    // Fetch agents staff (excluant clients) pour le sélecteur d'agent.
    fetch("/api/v1/users", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (cancelled) return;
      const rows: Array<{ id: string; firstName: string; lastName: string; isActive: boolean }> =
        Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
      const mapped = rows
        .filter((u) => u.isActive !== false)
        .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
      setAgents(mapped);
      setAgentId((prev) => prev || currentUserId || mapped[0]?.id || "");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [timeOpen, ticketOrgId, currentUserId]);
  const selectedWorkType = workTypes.find((w) => w.id === workTypeId) ?? workTypes[0];
  const timeType = selectedWorkType?.timeType ?? "remote_work";
  const [isAfterHours, setIsAfterHours] = useState(false);
  const [isWeekend, setIsWeekend] = useState(false);
  const [forceNonBillable, setForceNonBillable] = useState(false);
  const [hasTravelBilled, setHasTravelBilled] = useState(false);
  const [travelConflicts, setTravelConflicts] = useState<Array<{
    id: string;
    ticketId: string;
    ticketNumber: number | null;
    ticketSubject: string | null;
    agentName: string | null;
  }>>([]);
  const [timeMinutes, setTimeMinutes] = useState<number>(30);
  // Représentation textuelle du champ Durée (HH:MM ou décimale d'heures).
  // Cf. add-time-modal.tsx pour le rationnel : éviter de forcer l'agent
  // à calculer en minutes pures.
  const [timeText, setTimeText] = useState<string>(() => {
    const h = Math.floor(30 / 60);
    const m = Math.round(30 % 60);
    return `${h}:${String(m).padStart(2, "0")}`;
  });
  // Date de la saisie — par défaut aujourd'hui.
  const [timeDate, setTimeDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  // Heure de début — arrondie au 15 min inférieur le plus proche.
  const [timeStart, setTimeStart] = useState(() => {
    const d = new Date();
    const m = Math.floor(d.getMinutes() / 15) * 15;
    return `${String(d.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });
  const [timeDescription, setTimeDescription] = useState("");
  const [timeSaving, setTimeSaving] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [timeSaved, setTimeSaved] = useState(false);

  // Détection de déplacements déjà facturés pour ce client à la date saisie.
  // Fetch déclenché à l'ouverture du form et au changement de date.
  useEffect(() => {
    if (!timeOpen || !ticketOrgId || !timeDate) { setTravelConflicts([]); return; }
    // Clear immédiat pour que l'avertissement ne reste pas affiché pendant
    // les 100-300 ms du refetch quand l'utilisateur change la date.
    setTravelConflicts([]);
    const ctrl = new AbortController();
    fetch(`/api/v1/time-entries/travel-conflicts?orgId=${ticketOrgId}&date=${timeDate}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setTravelConflicts(d?.conflicts ?? []))
      .catch(() => { /* silent */ });
    return () => ctrl.abort();
  }, [timeOpen, ticketOrgId, timeDate]);

  // Reset state when the modal switches to a DIFFERENT ticket.
  //
  // Important : on dépend UNIQUEMENT de `ticket?.id`. Avant on écoutait
  // aussi `ticket?.status` et `ticket?.priority`, mais le parent (Kanban)
  // peut muter ces champs à chaud (drag d'un ticket dans une autre colonne,
  // changement de priorité depuis le modal lui-même, etc.). À chaque
  // re-render du ticket, on réinitialisait `timeOpen=false` / `timeMinutes=30`
  // → l'utilisateur cliquait "Saisir du temps", tapait une durée, puis
  // pendant la saisie le form disparaissait ou les valeurs se remettaient
  // à zéro. La saisie "ne s'enregistrait pas" parce que le formulaire
  // n'existait déjà plus au moment du submit. On reset donc seulement
  // quand on change vraiment de ticket.
  //
  // Les sous-updates de status/priority sont par ailleurs gérés via
  // useEffect distinct ci-dessous pour garder localStatus/localPriority
  // en sync sans tuer le reste du state.
  useEffect(() => {
    setReplyText("");
    setIsInternal(false);
    setAttachments([]);
    setSendError(null);
    setLocalComments([]);
    setTimeOpen(false);
    setTimeMinutes(30);
    setTimeText("0:30");
    setTimeDescription("");
    setTimeError(null);
    setTimeSaved(false);
    setIsAfterHours(false);
    setIsWeekend(false);
    setForceNonBillable(false);
    // Reset des types de travail / paliers — ils seront rechargés depuis
    // l'API quand l'utilisateur ouvrira la zone de saisie de temps.
    setWorkTypes([]);
    setWorkTypeId("");
    setRateTiers([]);
    setRateTierId("");
    setLocalStatus(ticket?.status);
    setLocalPriority(ticket?.priority);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  // Sync localStatus/localPriority avec le ticket si le parent les met
  // à jour pendant que le modal est ouvert (ex: update optimiste après
  // drag dans la Kanban). Ne réinitialise PAS le reste du formulaire.
  useEffect(() => {
    if (ticket?.status) setLocalStatus(ticket.status);
  }, [ticket?.status]);
  useEffect(() => {
    if (ticket?.priority) setLocalPriority(ticket.priority);
  }, [ticket?.priority]);

  // Close on escape
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open || !ticket) return null;

  const status = localStatus || ticket.status;
  const priority = localPriority || ticket.priority;
  const statusCfg = STATUS_CONFIG[status];
  const priorityCfg = PRIORITY_CONFIG[priority];
  const PriorityIcon = PRIORITY_ICONS[priority].Icon;

  function stripHtml(html: string): string {
    if (typeof window === "undefined") return html;
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent?.trim() || "";
  }

  async function handleSendReply() {
    if (!stripHtml(replyText) || sending || !ticket) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText, isInternal }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(errBody || `Erreur ${res.status}`);
      }
      const created = await res.json();
      setLocalComments((prev) => [
        ...prev,
        {
          id: created.id ?? `local-${Date.now()}`,
          authorName: created.authorName ?? currentUserName,
          content: created.content ?? replyText,
          isInternal: created.isInternal ?? isInternal,
          createdAt: created.createdAt ?? new Date().toISOString(),
        },
      ]);
      setReplyText("");
      setAttachments([]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur lors de l\u2019envoi";
      setSendError(message);
    } finally {
      setSending(false);
    }
  }

  async function handleSaveTimeEntry() {
    if (!ticket || timeSaving) return;
    const orgId = (ticket as unknown as { organizationId?: string }).organizationId;
    if (!orgId) {
      setTimeError("Organisation introuvable pour ce ticket");
      return;
    }
    if (!Number.isFinite(timeMinutes) || timeMinutes <= 0) {
      setTimeError("Durée invalide");
      return;
    }
    setTimeSaving(true);
    setTimeError(null);
    try {
      const startedAt = new Date(`${timeDate}T${timeStart}:00`);
      const endedAt = new Date(startedAt.getTime() + timeMinutes * 60_000);
      const res = await fetch("/api/v1/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          organizationId: orgId,
          timeType,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMinutes: Math.round(timeMinutes),
          description: timeDescription.trim() || undefined,
          isOnsite: timeType === "onsite_work",
          hasTravelBilled,
          isAfterHours,
          isWeekend,
          // Flag manuel "Forcer non-facturable". Le serveur le persiste
          // ET le moteur de billing l'utilise pour produire le bon
          // coverageStatus + reason. (Le coverageStatus envoyé par le
          // client est IGNORÉ — c'est le moteur qui décide.)
          ...(forceNonBillable ? { forceNonBillable: true } : {}),
          // Type de prestation choisi (axe « quoi »).
          ...(selectedWorkType?.id ? { workTypeId: selectedWorkType.id } : {}),
          // Palier tarifaire choisi (axe « combien »). Drive le taux
          // horaire côté serveur via resolveDecisionForEntry().
          ...(rateTierId ? { rateTierId } : {}),
          // Agent attribué — si différent de l'utilisateur courant, on
          // l'envoie au serveur (sinon il prend l'auteur de la requête
          // par défaut). Permet de saisir au nom d'un collègue.
          ...(agentId && agentId !== currentUserId ? { agentId } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      setTimeSaved(true);
      // Déduit les heures de la banque du client si applicable.
      bumpHourBankUsage(orgId, Math.round(timeMinutes), {
        forceNonBillable,
        workTypeId: selectedWorkType?.id ?? null,
      });
      setTimeDescription("");
      setTimeMinutes(30);
    setTimeText("0:30");
      setTimeout(() => {
        setTimeSaved(false);
        setTimeOpen(false);
      }, 1500);
    } catch (e) {
      setTimeError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setTimeSaving(false);
    }
  }

  async function handleStatusChange(newStatus: TicketStatus) {
    const previousStatus = localStatus;
    setLocalStatus(newStatus);
    onStatusChange?.(ticket!.id, newStatus);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        throw new Error(`Erreur ${res.status}`);
      }
    } catch {
      // Revert on failure
      setLocalStatus(previousStatus);
    }
  }

  async function handlePriorityChange(newPriority: TicketPriority) {
    const previousPriority = localPriority;
    setLocalPriority(newPriority);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (!res.ok) {
        throw new Error(`Erreur ${res.status}`);
      }
    } catch {
      // Revert on failure
      setLocalPriority(previousPriority);
    }
  }

  // Combine existing + local comments
  const allComments = [
    ...ticket.comments.map((c) => ({
      id: c.id,
      authorName: c.authorName,
      content: c.content,
      isInternal: c.isInternal,
      createdAt: c.createdAt,
    })),
    ...localComments,
  ].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[11px] font-semibold text-slate-400 tabular-nums">
                #{ticket.number}
              </span>
              <ChevronRight className="h-3 w-3 text-slate-300" />
              <span className="text-[11.5px] text-slate-500 truncate">
                {ticket.organizationName}
              </span>
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-900 leading-tight pr-4">
              {ticket.subject}
            </h2>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Badge variant={statusBadgeVariant[status]}>
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    statusCfg.dotClass
                  )}
                />
                {STATUS_LABELS_FR[status]}
              </Badge>
              <Badge variant={priorityBadgeVariant[priority]}>
                <PriorityIcon
                  className="h-2.5 w-2.5"
                  strokeWidth={2.75}
                />
                {PRIORITY_LABELS_FR[priority]}
              </Badge>
              <Badge variant="default">
                {TYPE_CONFIG[ticket.type as TicketType]?.label ?? ticket.type}
              </Badge>
              {ticket.slaBreached && (
                <Badge variant="danger">
                  <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />
                  SLA dépassé
                </Badge>
              )}
              {ticket.isOverdue && !ticket.slaBreached && (
                <Badge variant="warning">
                  <Clock className="h-2.5 w-2.5" strokeWidth={2.5} />
                  En retard
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Navigue d'abord, puis ferme la modale. Un simple
                // <Link onClick={onClose}> démonte l'anchor avant que la
                // navigation s'exécute (React 19) → rien ne se passe.
                router.push(`/tickets/${ticket.id}`);
                onClose();
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
              Page complète
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — 2 columns */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] divide-x divide-slate-100">
            {/* Left: main content */}
            <div className="p-6 space-y-5 min-w-0">
              {/* Description */}
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-4">
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Description
                </h3>
                {descriptionHtml ? (
                  <div
                    className="text-[13px] text-slate-700 leading-relaxed prose prose-sm prose-slate max-w-none break-words [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:break-all [&_strong]:font-semibold [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
                    dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                  />
                ) : ticket.description.includes("<") ? (
                  <div
                    className="text-[13px] text-slate-700 leading-relaxed prose prose-sm prose-slate max-w-none break-words [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_strong]:font-semibold [&_img]:max-w-full [&_img]:rounded-lg"
                    dangerouslySetInnerHTML={{ __html: ticket.description }}
                  />
                ) : (
                  <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {ticket.description}
                  </p>
                )}
              </div>

              {/* Conversation */}
              {allComments.length > 0 && (
                <div>
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-3">
                    Conversation ({allComments.length})
                  </h3>
                  <div className="space-y-3">
                    {allComments.map((c) => {
                      const authorAvatar =
                        (c as unknown as { authorAvatar?: string | null }).authorAvatar
                        ?? avatars[c.authorName];
                      return (
                      <div key={c.id} className="flex gap-3">
                        {authorAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={authorAvatar}
                            alt={c.authorName}
                            className="h-8 w-8 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm"
                          />
                        ) : (
                          <div
                            className={cn(
                              "h-8 w-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold shrink-0 ring-2 ring-white shadow-sm",
                              getAvatarGradient(c.authorName)
                            )}
                          >
                            {getInitials(c.authorName)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              "rounded-lg border p-3",
                              c.isInternal
                                ? "border-amber-200 bg-amber-50/40"
                                : "border-slate-200 bg-white"
                            )}
                          >
                            <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                              <span className="text-[12.5px] font-semibold text-slate-900">
                                {c.authorName}
                              </span>
                              {c.isInternal && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700 uppercase tracking-wider">
                                  <Lock className="h-2 w-2" />
                                  Interne
                                </span>
                              )}
                              <span className="text-[10.5px] text-slate-400 tabular-nums">
                                {formatDistanceToNow(new Date(c.createdAt), {
                                  addSuffix: true,
                                  locale: fr,
                                })}
                              </span>
                            </div>
                            <div
                              className="text-[12.5px] text-slate-700 leading-relaxed [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-[13px] [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_a]:text-blue-600 [&_a]:underline [&_strong]:font-semibold [&_em]:italic"
                              dangerouslySetInnerHTML={{ __html: c.content }}
                            />
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reply form */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                    Répondre
                  </h3>
                  <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-0.5 ring-1 ring-inset ring-slate-200/60">
                    <button
                      onClick={() => setIsInternal(false)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                        !isInternal
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                          : "text-slate-500"
                      )}
                    >
                      Public
                    </button>
                    <button
                      onClick={() => setIsInternal(true)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1",
                        isInternal
                          ? "bg-amber-50 text-amber-800 shadow-sm ring-1 ring-amber-200"
                          : "text-slate-500"
                      )}
                    >
                      <Lock className="h-2.5 w-2.5" strokeWidth={2.5} />
                      Interne
                    </button>
                  </div>
                </div>
                <RichTextEditor
                  value={replyText}
                  onChange={setReplyText}
                  placeholder={
                    isInternal
                      ? "Note visible uniquement par les techniciens..."
                      : "Écrivez votre réponse au client..."
                  }
                  variant={isInternal ? "internal" : "default"}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  minHeight="120px"
                />
                {sendError && (
                  <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {sendError}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!stripHtml(replyText)}
                    loading={sending}
                    onClick={handleSendReply}
                  >
                    <Send className="h-3 w-3" strokeWidth={2.25} />
                    {isInternal ? "Ajouter la note" : "Envoyer"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Right: sidebar */}
            <div className="p-5 space-y-4 bg-slate-50/40 min-w-0">
              {/* Quick actions */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Statut
                </h3>
                <Select
                  value={status}
                  onValueChange={(v) => handleStatusChange(v as TicketStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Set actif uniquement — voir ACTIVE_TICKET_STATUSES
                        dans mock-data.ts. Si le ticket porte encore un
                        ancien statut (FS import), on l'affiche en extra
                        avec le suffixe "(legacy)" pour ne pas le perdre. */}
                    {ACTIVE_TICKET_STATUSES.map((k) => (
                      <SelectItem key={k} value={k}>
                        {STATUS_LABELS_FR[k]}
                      </SelectItem>
                    ))}
                    {!ACTIVE_TICKET_STATUSES.includes(status) &&
                      status !== "deleted" && (
                        <SelectItem value={status}>
                          {STATUS_LABELS_FR[status]} (legacy)
                        </SelectItem>
                      )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Priorité
                </h3>
                <Select
                  value={priority}
                  onValueChange={(v) => handlePriorityChange(v as TicketPriority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS_FR).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ticket?.prioritySource === "AI" && (
                  <div
                    className="mt-1.5 flex items-center gap-1 text-[11px] text-violet-700 bg-violet-50 border border-violet-100 rounded px-2 py-1"
                    title="Priorité définie automatiquement par l'IA"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Priorité définie par l&apos;IA</span>
                  </div>
                )}
              </div>

              {/* Assignee */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Assigné à
                </h3>
                {ticket.assigneeName ? (
                  <div className="flex items-center gap-2">
                    {avatars[ticket.assigneeName] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatars[ticket.assigneeName]!}
                        alt={ticket.assigneeName}
                        className="h-7 w-7 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className={cn(
                          "h-7 w-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-semibold shrink-0",
                          getAvatarGradient(ticket.assigneeName)
                        )}
                      >
                        {getInitials(ticket.assigneeName)}
                      </div>
                    )}
                    <span className="text-[12.5px] text-slate-700 truncate">
                      {ticket.assigneeName}
                    </span>
                  </div>
                ) : (
                  <span className="text-[12px] italic text-slate-400">
                    Non assigné
                  </span>
                )}
              </div>

              {/* Requester */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Demandeur
                </h3>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-[10px] font-semibold shrink-0">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-slate-700 truncate">
                      {ticket.requesterName}
                    </p>
                    <p className="text-[10.5px] text-slate-400 truncate">
                      {ticket.requesterEmail}
                    </p>
                  </div>
                </div>
              </div>

              {/* Organization */}
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  Organisation
                </h3>
                <div className="flex items-center gap-2 min-w-0">
                  <OrgLogo name={ticket.organizationName} size={28} rounded="md" />
                  <span className="text-[12.5px] text-slate-700 truncate">
                    {ticket.organizationName}
                  </span>
                </div>
              </div>

              {/* Category & Queue */}
              <div className="grid grid-cols-1 gap-3 pt-3 border-t border-slate-200">
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Catégorie
                  </h4>
                  <p className="mt-0.5 text-[12px] text-slate-700">
                    {ticket.categoryName}
                  </p>
                </div>
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    File d&apos;attente
                  </h4>
                  <p className="mt-0.5 text-[12px] text-slate-700">
                    {ticket.queueName}
                  </p>
                </div>
              </div>

              {/* Tags */}
              {ticket.tags && ticket.tags.length > 0 && (
                <div className="pt-3 border-t border-slate-200">
                  <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                    <TagIcon className="inline h-2.5 w-2.5 mr-1" />
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {ticket.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-[11.5px]">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span className="text-slate-500">Créé le</span>
                  <span className="ml-auto text-slate-700 tabular-nums">
                    {format(new Date(ticket.createdAt), "d MMM, HH:mm", {
                      locale: fr,
                    })}
                  </span>
                </div>
                {ticket.dueAt && (
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <Clock className="h-3 w-3 text-slate-400" />
                    <span className="text-slate-500">Échéance</span>
                    <span
                      className={cn(
                        "ml-auto tabular-nums",
                        ticket.isOverdue
                          ? "text-red-600 font-semibold"
                          : "text-slate-700"
                      )}
                    >
                      {format(new Date(ticket.dueAt), "d MMM, HH:mm", {
                        locale: fr,
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick time entry */}
              <div className="pt-3 border-t border-slate-200">
                {!timeOpen ? (
                  <button
                    type="button"
                    onClick={() => setTimeOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Saisir du temps
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                        <Clock className="inline h-2.5 w-2.5 mr-1" />
                        Saisie de temps
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setTimeOpen(false);
                          setTimeError(null);
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-700"
                      >
                        Annuler
                      </button>
                    </div>

                    {workTypes.length === 0 ? (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        Aucun type de travail configuré pour ce client.
                        Configure-les dans Organisations → Facturation → Types
                        de travail.
                      </p>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">Type de travail</label>
                        <Select
                          value={workTypeId}
                          onValueChange={setWorkTypeId}
                        >
                          <SelectTrigger className="h-8 text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {workTypes.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                {w.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Palier tarifaire — masqué si l'org n'en a aucun.
                        Aucun prix affiché : confidentialité côté ticket. */}
                    {rateTiers.length > 0 && (
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">Palier tarifaire</label>
                        <Select value={rateTierId} onValueChange={setRateTierId}>
                          <SelectTrigger className="h-8 text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {rateTiers.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Sélecteur d'agent — saisie au nom d'un collègue.
                        Masqué quand un seul agent est dispo (UX inutile). */}
                    {agents.length > 1 && (
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">Agent</label>
                        <Select value={agentId} onValueChange={setAgentId}>
                          <SelectTrigger className="h-8 text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {agents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}{a.id === currentUserId ? " (moi)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">Date</label>
                        <input
                          type="date"
                          value={timeDate}
                          onChange={(e) => setTimeDate(e.target.value)}
                          max={new Date().toISOString().slice(0, 10)}
                          className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">Heure de début</label>
                        <select
                          value={timeStart}
                          onChange={(e) => setTimeStart(e.target.value)}
                          className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] tabular-nums text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          {Array.from({ length: 65 }, (_, i) => {
                            const h = Math.floor((i * 15 + 6 * 60) / 60);
                            const m = (i * 15 + 6 * 60) % 60;
                            if (h > 22) return null;
                            const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                            return <option key={val} value={val}>{val}</option>;
                          })}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Durée</label>
                      <input
                        type="text"
                        value={timeText}
                        placeholder="1:15 ou 1,25"
                        onChange={(e) => {
                          const txt = e.target.value;
                          setTimeText(txt);
                          // Live-parse : HH:MM ou décimale d'heures (« , » ou « . »).
                          const s = txt.trim().replace(",", ".");
                          if (!s) return;
                          let mins: number | null = null;
                          if (s.includes(":")) {
                            const [hStr, mStr = "0"] = s.split(":");
                            const h = parseInt(hStr, 10);
                            const m = parseInt(mStr, 10);
                            if (!Number.isNaN(h) && !Number.isNaN(m) && h >= 0 && m >= 0 && m < 60) {
                              mins = h * 60 + m;
                            }
                          } else {
                            const v = parseFloat(s);
                            if (!Number.isNaN(v) && v >= 0) mins = Math.round(v * 60);
                          }
                          if (mins != null && mins > 0 && mins <= 24 * 60) setTimeMinutes(mins);
                        }}
                        onBlur={() => {
                          // Reformatte vers HH:MM canonique au blur.
                          if (timeMinutes > 0) {
                            const h = Math.floor(timeMinutes / 60);
                            const m = Math.round(timeMinutes % 60);
                            setTimeText(`${h}:${String(m).padStart(2, "0")}`);
                          }
                        }}
                        className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px] tabular-nums text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <p className="mt-1 text-[10px] text-slate-500 leading-snug">
                        Ex : <strong>1:15</strong> (1 h 15 min) ou <strong>1,25</strong> (heures décimales).
                      </p>
                      <div className="mt-1.5 flex items-center gap-1">
                        {[15, 30, 45].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setTimeMinutes(m);
                              setTimeText(`0:${String(m).padStart(2, "0")}`);
                            }}
                            className={cn(
                              "h-6 px-1.5 rounded text-[10.5px] font-medium transition-colors",
                              timeMinutes === m
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                          >
                            {m}min
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea
                      value={timeDescription}
                      onChange={(e) => setTimeDescription(e.target.value)}
                      placeholder="Description de l'intervention (optionnel)"
                      rows={2}
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />

                    {/* Horaire — Jour par défaut, Soir/Weekend cohabitent */}
                    <div className="rounded-md border border-slate-200 bg-slate-50/50 p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-500">
                          Horaire
                        </span>
                        {!isAfterHours && !isWeekend && (
                          <span className="text-[9.5px] font-medium text-blue-700 bg-blue-50 rounded px-1.5 py-0.5">
                            Jour (par défaut)
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <label className="flex items-center justify-between gap-2 px-1">
                          <span className="text-[11.5px] text-slate-700">De soir</span>
                          <Switch checked={isAfterHours} onCheckedChange={setIsAfterHours} />
                        </label>
                        <label className="flex items-center justify-between gap-2 px-1">
                          <span className="text-[11.5px] text-slate-700">Weekend</span>
                          <Switch checked={isWeekend} onCheckedChange={setIsWeekend} />
                        </label>
                      </div>
                      <div className="mt-1 border-t border-slate-200 pt-1 space-y-0.5">
                        <label className="flex items-center justify-between gap-2 px-1">
                          <span className="text-[11.5px] text-slate-700">Facturer un déplacement</span>
                          <Switch checked={hasTravelBilled} onCheckedChange={setHasTravelBilled} />
                        </label>
                        <label className="flex items-center justify-between gap-2 px-1">
                          <span className="text-[11.5px] text-slate-700">Forcer non-facturable</span>
                          <Switch checked={forceNonBillable} onCheckedChange={setForceNonBillable} />
                        </label>
                      </div>
                    </div>

                    {travelConflicts.length > 0 && hasTravelBilled && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px]">
                        <div className="font-semibold text-amber-900 mb-0.5">
                          ⚠️ Déplacement déjà facturé ce jour-là pour ce client
                        </div>
                        <ul className="text-amber-900 space-y-0.5">
                          {travelConflicts.map((c) => (
                            <li key={c.id}>
                              <span className="font-medium">{c.agentName ?? "Technicien inconnu"}</span>
                              {" · Ticket "}
                              {c.ticketNumber != null ? `#${c.ticketNumber}` : c.ticketId.slice(0, 8)}
                              {c.ticketSubject ? ` — ${c.ticketSubject}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {timeError ? (
                      <p className="text-[11px] text-red-600">{timeError}</p>
                    ) : null}
                    {timeSaved ? (
                      <p className="text-[11px] text-emerald-600 font-medium">
                        Saisie enregistrée ✓
                      </p>
                    ) : null}

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="w-full"
                      onClick={handleSaveTimeEntry}
                      loading={timeSaving}
                      disabled={timeSaving || timeSaved || !selectedWorkType}
                    >
                      Enregistrer
                    </Button>
                  </div>
                )}
              </div>

              {/* Mini meta */}
              <div className="pt-3 border-t border-slate-200 flex items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {allComments.length}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  0
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
