"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Clock,
  AlertTriangle,
  MessageSquare,
  ArrowUp,
  Minus,
  ArrowDown,
  Zap,
  User,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG, type Ticket, type TicketPriority } from "@/lib/mock-data";
import { useOrgLogosStore } from "@/stores/org-logos-store";
import { useAgentAvatarsStore } from "@/stores/agent-avatars-store";
import { useTicketsStore } from "@/stores/tickets-store";

interface TicketCardProps {
  ticket: Ticket;
  onClick?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const PRIORITY_ICONS: Record<TicketPriority, { Icon: typeof ArrowUp; tint: string }> = {
  critical: { Icon: Zap, tint: "text-red-500" },
  high: { Icon: ArrowUp, tint: "text-orange-500" },
  medium: { Icon: Minus, tint: "text-amber-500" },
  low: { Icon: ArrowDown, tint: "text-emerald-500" },
};

export function TicketCard({ ticket, onClick }: TicketCardProps) {
  const priority = PRIORITY_CONFIG[ticket.priority];
  const PriorityCfg = PRIORITY_ICONS[ticket.priority];
  const PriorityIcon = PriorityCfg.Icon;
  const orgLogo = useOrgLogosStore((s) => s.logos[ticket.organizationName]);
  // Always subscribe; nullify in the selector if no assignee (avoid conditional hook)
  const assigneeAvatar = useAgentAvatarsStore((s) =>
    ticket.assigneeName ? s.avatars[ticket.assigneeName] : null
  );
  const isNew =
    Date.now() - new Date(ticket.createdAt).getTime() < 60 * 60 * 1000;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-[14px] bg-white",
        "border border-slate-200/70",
        "shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        "hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.1)] hover:border-slate-300/80 hover:-translate-y-[2px]",
        "transition-all duration-200 ease-out",
      )}
    >
      {/* Priority accent bar */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ backgroundColor: priority.color }}
      />

      <div className="pl-4 pr-3.5 py-3">
        {/* Row 1: ticket number + badges */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Numéro = vrai <Link> → permet Cmd/Ctrl+clic et clic
                milieu pour ouvrir le ticket dans un nouvel onglet
                directement (sans passer par la quickview). Le card
                lui-même ouvre toujours la quickview au clic normal. */}
            <Link
              href={`/tickets/${ticket.id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-[10px] font-medium text-slate-400 tracking-wide hover:text-blue-700 hover:underline"
            >
              {ticket.number}
            </Link>
            {isNew && (
              <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-px">
                <span className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[8.5px] font-semibold text-blue-600 uppercase tracking-wider">
                  Nouveau
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {ticket.slaBreached && (
              <span className="flex items-center gap-0.5 rounded-md bg-red-50 px-1.5 py-0.5 ring-1 ring-inset ring-red-200/80">
                <AlertTriangle className="h-2.5 w-2.5 text-red-500" strokeWidth={2.5} />
                <span className="text-[8.5px] font-bold uppercase tracking-wider text-red-600">
                  SLA
                </span>
              </span>
            )}
            <PriorityIcon
              className={cn("h-3 w-3", PriorityCfg.tint)}
              strokeWidth={2.5}
            />
          </div>
        </div>

        {/* Row 2: Subject */}
        <h4 className="text-[13px] font-semibold leading-[1.35] text-slate-900 line-clamp-2 group-hover:text-blue-700 transition-colors mb-2.5">
          {ticket.subject}
        </h4>

        {/* Row 3: Requester with org logo */}
        <div className="flex items-center gap-2 mb-2.5">
          {orgLogo ? (
            <img
              src={orgLogo}
              alt={ticket.organizationName}
              title={ticket.organizationName}
              className="h-[18px] w-[18px] rounded object-contain bg-white ring-1 ring-slate-200/80 shrink-0"
            />
          ) : (
            <div
              className="h-[18px] w-[18px] rounded bg-slate-100 ring-1 ring-slate-200/80 flex items-center justify-center shrink-0"
              title={ticket.organizationName}
            >
              <span className="text-[7px] font-bold text-slate-500">
                {getInitials(ticket.organizationName)}
              </span>
            </div>
          )}
          <span className="text-[11.5px] text-slate-600 truncate leading-none">
            {ticket.requesterName}
          </span>
        </div>

        {/* Row 4: Footer meta + assignee */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="inline-flex items-center gap-0.5 text-[10px] tabular-nums">
              <Clock className="h-2.5 w-2.5" strokeWidth={2} />
              {formatDistanceToNow(new Date(ticket.createdAt), {
                addSuffix: false,
                locale: fr,
              })}
            </span>
            {ticket.comments?.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] tabular-nums">
                <MessageSquare className="h-2.5 w-2.5" strokeWidth={2} />
                {ticket.comments.length}
              </span>
            )}
          </div>

          {/* Assignee — clic direct ouvre un mini-picker (sans avoir à
              ouvrir la fiche complète). Inspiré de Freshservice. */}
          <InlineAssigneePicker ticket={ticket} assigneeAvatar={assigneeAvatar} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline assignee picker — avatar cliquable dans le coin inférieur droit
// de la carte. Au clic : popover avec la liste des agents (+ "Non assigné"
// en tête pour désassigner). PATCH direct, mise à jour optimiste du store.
// ---------------------------------------------------------------------------
function InlineAssigneePicker({
  ticket,
  assigneeAvatar,
}: {
  ticket: Ticket;
  assigneeAvatar: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const updateTicket = useTicketsStore((s) => s.updateTicket);
  // Position du popover en coordonnées viewport (calculée à l'ouverture).
  // On utilise un portal pour sortir le popover du colonne Kanban (qui a
  // overflow-y-auto et qui clippe / cache l'élément derrière le titre).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const recalc = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      // Popover : 224px de large (w-56). Aligné à droite du bouton
      // (même bord droit), placé JUSTE EN DESSOUS avec un petit gap de
      // 4px — l'utilisateur a cliqué sur le coin inférieur droit de la
      // tuile, le dropdown s'ouvre pile là, mouvement de souris quasi
      // nul. Si vraiment il n'y a pas assez d'espace en bas (bouton
      // collé au bas du viewport), on bascule vers le haut en secours
      // pour ne pas couper le dropdown.
      const POPOVER_WIDTH = 224;
      const POPOVER_HEIGHT_EST = 260;
      const GAP = 4;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < POPOVER_HEIGHT_EST && rect.top >= POPOVER_HEIGHT_EST;
      const top = flipUp
        ? rect.top - POPOVER_HEIGHT_EST - GAP
        : rect.bottom + GAP;
      const left = Math.max(
        8,
        Math.min(
          window.innerWidth - POPOVER_WIDTH - 8,
          rect.right - POPOVER_WIDTH,
        ),
      );
      setPos({ top: Math.max(8, top), left });
    };
    recalc();
    // Recalcule si on scroll ou resize pendant que le popover est ouvert.
    window.addEventListener("scroll", recalc, true);
    window.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("scroll", recalc, true);
      window.removeEventListener("resize", recalc);
    };
  }, [open]);

  useEffect(() => {
    if (!open || agents.length > 0) return;
    setLoading(true);
    // `includeAvatar=true` est crucial : par défaut /api/v1/users exclut
    // le champ avatar pour alléger la réponse. Sans ce paramètre, chaque
    // agent revient avec avatar=null et le dropdown tombe toujours sur
    // le fallback "initiales sur fond gris" — le symptôme rapporté par
    // l'utilisateur (pas de thumbnail).
    fetch(
      "/api/v1/users?role=TECHNICIAN,SUPERVISOR,MSP_ADMIN,SUPER_ADMIN&includeAvatar=true",
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Array<{ id: string; name: string; avatar: string | null }>) => {
        if (Array.isArray(arr)) setAgents(arr);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, agents.length]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const inPopover = popoverRef.current?.contains(target);
      const onButton = buttonRef.current?.contains(target);
      if (!inPopover && !onButton) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function assign(agent: { id: string; name: string } | null) {
    setOpen(false);
    // Mise à jour optimiste via le store (cover le Kanban + liste simultanément).
    // updateTicket fait déjà le PATCH + merge dans le state.
    await updateTicket(ticket.id, {
      assigneeId: agent?.id ?? null,
      assigneeName: agent?.name ?? null,
    } as Partial<Ticket>);
  }

  const filtered = query.trim()
    ? agents.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    : agents;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={(e) => {
          // Empêche le drag handler du Kanban de s'activer sur ce bouton.
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={ticket.assigneeName ? `Assigné à ${ticket.assigneeName}` : "Non assigné — cliquer pour assigner"}
        className={cn(
          "h-[22px] w-[22px] rounded-full flex items-center justify-center transition-all",
          ticket.assigneeName
            ? "ring-2 ring-white shadow-sm hover:ring-blue-400"
            : "border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50",
        )}
      >
        {ticket.assigneeName ? (
          assigneeAvatar ? (
            <img src={assigneeAvatar} alt={ticket.assigneeName} className="h-[22px] w-[22px] rounded-full object-cover" />
          ) : (
            <div className="h-[22px] w-[22px] rounded-full bg-slate-200 flex items-center justify-center">
              <span className="text-[8px] font-semibold text-slate-600">
                {getInitials(ticket.assigneeName)}
              </span>
            </div>
          )
        ) : (
          <User className="h-2.5 w-2.5 text-slate-300" strokeWidth={2} />
        )}
      </button>

      {/* Popover rendu via Portal pour s'échapper du overflow-y-auto de
          la colonne Kanban (qui clippait / cachait le menu derrière
          l'en-tête de colonne). Position fixed calculée depuis le rect
          du bouton, z-index très élevé pour passer au-dessus des cards,
          en-têtes de colonne et tout autre élément du Kanban. */}
      {open && mounted && pos &&
        createPortal(
          <div
            ref={popoverRef}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 224 }}
            className="z-[1000] rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            <div className="p-2 border-b border-slate-100">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un agent…"
                className="w-full h-7 rounded-md border border-slate-200 px-2 text-[12px] focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => assign(null)}
                className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[12px] hover:bg-slate-50"
              >
                <div className="h-5 w-5 rounded-full border border-dashed border-slate-300 flex items-center justify-center shrink-0">
                  <User className="h-2.5 w-2.5 text-slate-400" />
                </div>
                <span className="text-slate-600">Non assigné</span>
                {!ticket.assigneeName && <Check className="h-3 w-3 ml-auto text-blue-600" />}
              </button>
              {loading && (
                <p className="px-3 py-2 text-[11.5px] text-slate-400">Chargement…</p>
              )}
              {filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => assign({ id: a.id, name: a.name })}
                  className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[12px] hover:bg-slate-50"
                >
                  {a.avatar ? (
                    <img src={a.avatar} alt={a.name} className="h-5 w-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                      <span className="text-[8px] font-semibold text-slate-600">{getInitials(a.name)}</span>
                    </div>
                  )}
                  <span className="truncate">{a.name}</span>
                  {ticket.assigneeName === a.name && <Check className="h-3 w-3 ml-auto text-blue-600 shrink-0" />}
                </button>
              ))}
              {!loading && filtered.length === 0 && query && (
                <p className="px-3 py-2 text-[11.5px] text-slate-400">Aucun agent trouvé</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
