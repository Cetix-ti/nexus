"use client";

import { useState, useEffect } from "react";
import { useTicketsStore } from "@/stores/tickets-store";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft,
  Clock,
  Building2,
  User,
  Lock,
  Send,
  AlertTriangle,
  Zap,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RichTextEditor, type Attachment } from "@/components/ui/rich-text-editor";
import {
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/mock-data";
import { TicketBillingSection } from "@/components/billing/ticket-billing-section";
import { mockProjects } from "@/lib/projects/mock-data";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from "@/lib/projects/types";
import { FolderKanban } from "lucide-react";

const TICKET_PROJECT_LINKS: Record<string, string> = {
  "t-001": "prj_001",
  "t-002": "prj_002",
  "t-004": "prj_001",
  "t-005": "prj_004",
};

const ORG_ID_MAP: Record<string, string> = {
  "Acme Corp": "org_acme",
  "TechStart Inc": "org_techstart",
  "Global Finance": "org_global",
  "HealthCare Plus": "org_health",
  "MédiaCentre QC": "org_media",
  "Cetix": "org_cetix",
};

function getOrgId(name: string): string {
  return ORG_ID_MAP[name] || "org_acme";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const statusBadgeVariant: Record<TicketStatus, "primary" | "default" | "warning" | "success" | "danger"> = {
  new: "primary",
  open: "primary",
  in_progress: "warning",
  on_site: "primary",
  waiting_client: "default",
  resolved: "success",
  closed: "default",
};

const priorityBadgeVariant: Record<TicketPriority, "danger" | "warning" | "default" | "success"> = {
  critical: "danger",
  high: "warning",
  medium: "default",
  low: "success",
};

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function SidebarRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-500 whitespace-nowrap pt-0.5">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

interface LocalComment {
  id: string;
  kind: "comment";
  authorName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Si la page d'origine a passé ?back=/path, on l'utilise pour le bouton
  // « Retour », sinon on retombe sur la liste des tickets.
  const rawBack = searchParams?.get("back");
  // Sécurité : on n'autorise que les chemins internes (/...).
  const backHref = rawBack && rawBack.startsWith("/") ? rawBack : "/tickets";
  const backLabel =
    backHref === "/tickets"
      ? "Tickets"
      : backHref.startsWith("/organizations/")
      ? "Organisation"
      : "Retour";
  const [commentText, setCommentText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [localComments, setLocalComments] = useState<LocalComment[]>([]);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const tickets = useTicketsStore((s) => s.tickets);
  const loadAll = useTicketsStore((s) => s.loadAll);
  const loaded = useTicketsStore((s) => s.loaded);
  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);
  const ticket = tickets.find((t) => t.id === params.id);

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-gray-500">Ticket non trouvé.</p>
        <Button variant="outline" onClick={() => router.push("/tickets")}>
          Retour aux tickets
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[ticket.status];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];

  // Merge comments and activities into a unified timeline sorted by date
  const timeline = [
    ...ticket.activities.map((a) => ({ ...a, kind: "activity" as const })),
    ...ticket.comments.map((c) => ({
      id: c.id,
      kind: "comment" as const,
      authorName: c.authorName,
      content: c.content,
      isInternal: c.isInternal,
      createdAt: c.createdAt,
    })),
    ...localComments,
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  function stripHtml(html: string): string {
    if (typeof window === "undefined") return html;
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent?.trim() || "";
  }

  async function handleSendReply() {
    if (!stripHtml(commentText) || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket!.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText, isInternal }),
      });
      if (res.ok) {
        const data = await res.json();
        const newComment: LocalComment = {
          id: data.data?.id ?? `local-${Date.now()}`,
          kind: "comment",
          authorName: data.data?.authorName ?? "Moi",
          content: commentText,
          isInternal,
          createdAt: data.data?.createdAt ?? new Date().toISOString(),
        };
        setLocalComments((prev) => [...prev, newComment]);
        setCommentText("");
        setAttachments([]);
        setTimeout(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        }, 100);
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  }

  // SLA mock calculation
  const slaPercent = ticket.slaBreached ? 100 : ticket.dueAt ? Math.min(85, 45) : 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <button
          onClick={() => router.push(backHref)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
        <span className="text-sm font-mono text-gray-500">{ticket.number}</span>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 gap-0">
        {/* Left: Main content */}
        <div className="flex-1 overflow-y-auto border-r border-gray-200">
          <div className="p-6">
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="mt-0.5 font-mono text-sm text-gray-400">{ticket.number}</span>
                <Badge variant={statusBadgeVariant[ticket.status]}>
                  <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", statusCfg.dotClass)} />
                  {statusCfg.label}
                </Badge>
                <Badge variant={priorityBadgeVariant[ticket.priority]}>
                  <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", priorityCfg.dotClass)} />
                  {priorityCfg.label}
                </Badge>
                {ticket.slaBreached && (
                  <Badge variant="danger" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    SLA Breached
                  </Badge>
                )}
              </div>
              <h1 className="text-xl font-bold text-gray-900">{ticket.subject}</h1>
            </div>

            {/* Description */}
            <div className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wider">Description</h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {/* Billing */}
            <TicketBillingSection
              ticketId={ticket.id}
              ticketNumber={ticket.number}
              organizationId={getOrgId(ticket.organizationName)}
              organizationName={ticket.organizationName}
            />

            {/* Timeline */}
            <div className="mb-8">
              <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">Activity</h2>
              <div className="relative space-y-0">
                {/* Vertical line */}
                <div className="absolute left-[17px] top-2 bottom-2 w-px bg-gray-200" />

                {timeline.map((item) => (
                  <div key={item.id} className="relative flex gap-3 py-3">
                    {item.kind === "comment" ? (
                      <>
                        <Avatar className="relative z-10 h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="text-[10px]">
                            {getInitials(item.authorName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div
                            className={cn(
                              "rounded-lg border p-3",
                              item.isInternal
                                ? "border-amber-200 bg-amber-50"
                                : "border-gray-200 bg-white"
                            )}
                          >
                            <div className="mb-1.5 flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {item.authorName}
                              </span>
                              {item.isInternal && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                  <Lock className="h-2.5 w-2.5" />
                                  Internal
                                </span>
                              )}
                              <span className="text-xs text-gray-400">
                                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            <div
                              className="text-[13px] text-slate-700 leading-relaxed prose-sm [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:mt-2 [&_h3]:text-[14px] [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_a]:text-blue-600 [&_a]:underline [&_strong]:font-semibold [&_em]:italic"
                              dangerouslySetInnerHTML={{ __html: item.content }}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 border border-gray-200">
                          {"type" in item && item.type === "status_change" ? (
                            <Zap className="h-3.5 w-3.5 text-gray-500" />
                          ) : "type" in item && item.type === "assignment" ? (
                            <User className="h-3.5 w-3.5 text-gray-500" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 text-gray-500" />
                          )}
                        </div>
                        <div className="flex flex-1 items-center gap-2 pt-1.5">
                          <span className="text-sm text-gray-600">
                            <span className="font-medium text-gray-700">{item.authorName}</span>
                            {" "}
                            {item.content}
                            {"type" in item && item.type === "status_change" && "oldValue" in item && item.oldValue && "newValue" in item && item.newValue && (
                              <>
                                {" from "}
                                <Badge variant="outline" className="text-[10px] mx-0.5">
                                  {STATUS_CONFIG[item.oldValue as TicketStatus]?.label ?? item.oldValue}
                                </Badge>
                                {" to "}
                                <Badge variant="outline" className="text-[10px] mx-0.5">
                                  {STATUS_CONFIG[item.newValue as TicketStatus]?.label ?? item.newValue}
                                </Badge>
                              </>
                            )}
                            {"type" in item && item.type === "assignment" && "newValue" in item && item.newValue && (
                              <>
                                {" to "}
                                <span className="font-medium">{item.newValue}</span>
                              </>
                            )}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Add comment */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-700">Répondre au ticket</h3>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
                  <button
                    onClick={() => setIsInternal(false)}
                    className={cn(
                      "rounded-md px-3 py-1 text-[11.5px] font-medium transition-all",
                      !isInternal
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    Réponse publique
                  </button>
                  <button
                    onClick={() => setIsInternal(true)}
                    className={cn(
                      "rounded-md px-3 py-1 text-[11.5px] font-medium transition-all flex items-center gap-1",
                      isInternal
                        ? "bg-amber-50 text-amber-800 shadow-sm ring-1 ring-amber-200"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <Lock className="h-2.5 w-2.5" strokeWidth={2.5} />
                    Note interne
                  </button>
                </div>
              </div>
              <RichTextEditor
                value={commentText}
                onChange={setCommentText}
                placeholder={
                  isInternal
                    ? "Note visible uniquement par les techniciens..."
                    : "Écrivez votre réponse au client..."
                }
                variant={isInternal ? "internal" : "default"}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                minHeight="140px"
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] text-slate-400">
                  Astuce : <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px]">⌘ Enter</kbd> pour envoyer
                </p>
                <Button
                  variant="primary"
                  size="md"
                  disabled={!commentText.trim()}
                  loading={sending}
                  onClick={handleSendReply}
                >
                  <Send className="h-3.5 w-3.5" strokeWidth={2.25} />
                  {isInternal ? "Ajouter la note" : "Envoyer la réponse"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="w-full lg:w-80 flex-shrink-0 overflow-y-auto bg-gray-50/50">
          <div className="p-5 space-y-5">
            {/* Status & Priority */}
            <SidebarSection title="Détails">
              <SidebarRow label="Statut">
                <select
                  value={ticket.status}
                  onChange={async (e) => {
                    const newStatus = e.target.value;
                    await fetch(`/api/v1/tickets/${ticket!.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: newStatus.toUpperCase() }),
                    });
                    window.location.reload();
                  }}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="new">Nouveau</option>
                  <option value="open">Ouvert</option>
                  <option value="in_progress">En cours</option>
                  <option value="on_site">Sur place</option>
                  <option value="waiting_client">En attente client</option>
                  <option value="resolved">Résolu</option>
                  <option value="closed">Fermé</option>
                </select>
              </SidebarRow>
              <SidebarRow label="Priorité">
                <select
                  value={ticket.priority}
                  onChange={async (e) => {
                    const newPriority = e.target.value;
                    await fetch(`/api/v1/tickets/${ticket!.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ priority: newPriority.toUpperCase() }),
                    });
                    window.location.reload();
                  }}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="critical">Critique</option>
                  <option value="high">Élevée</option>
                  <option value="medium">Moyenne</option>
                  <option value="low">Faible</option>
                </select>
              </SidebarRow>
              <SidebarRow label="Urgence">
                <span className="text-sm text-gray-700 capitalize">{ticket.urgency}</span>
              </SidebarRow>
              <SidebarRow label="Impact">
                <span className="text-sm text-gray-700 capitalize">{ticket.impact}</span>
              </SidebarRow>
              <SidebarRow label="Type">
                <span className="text-sm text-gray-700 capitalize">{ticket.type}</span>
              </SidebarRow>
            </SidebarSection>

            {/* People */}
            <SidebarSection title="People">
              <SidebarRow label="Assigné à">
                {ticket.assigneeName ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[9px]">
                        {getInitials(ticket.assigneeName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-gray-700">{ticket.assigneeName}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Unassigned</span>
                )}
              </SidebarRow>
              <SidebarRow label="Requester">
                <div>
                  <p className="text-sm text-gray-700">{ticket.requesterName}</p>
                  <p className="text-xs text-gray-400">{ticket.requesterEmail}</p>
                </div>
              </SidebarRow>
            </SidebarSection>

            {/* Projet */}
            <SidebarSection title="Projet">
              {(() => {
                const linkedId = TICKET_PROJECT_LINKS[ticket.id];
                const project = linkedId ? mockProjects.find((p) => p.id === linkedId) : undefined;
                if (!project) {
                  return (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-400">Aucun projet</span>
                      <Button variant="outline" size="sm">
                        <FolderKanban className="h-3.5 w-3.5" />
                        Lier à un projet
                      </Button>
                    </div>
                  );
                }
                const colors = PROJECT_STATUS_COLORS[project.status];
                return (
                  <button
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className="group w-full text-left rounded-lg border border-gray-200 bg-white p-2.5 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <FolderKanban className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-mono text-[11px] text-gray-500">{project.code}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 mb-1.5 line-clamp-2">
                      {project.name}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1",
                        colors.bg,
                        colors.text,
                        colors.ring
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
                      {PROJECT_STATUS_LABELS[project.status]}
                    </span>
                  </button>
                );
              })()}
            </SidebarSection>

            {/* Organization */}
            <SidebarSection title="Organization">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">{ticket.organizationName}</span>
              </div>
            </SidebarSection>

            {/* Classification */}
            <SidebarSection title="Classification">
              <SidebarRow label="Catégorie">
                <span className="text-sm text-gray-700">{ticket.categoryName}</span>
              </SidebarRow>
              <SidebarRow label="File">
                <span className="text-sm text-gray-700">{ticket.queueName}</span>
              </SidebarRow>
              <SidebarRow label="Source">
                <span className="text-sm text-gray-700 capitalize">{ticket.source}</span>
              </SidebarRow>
            </SidebarSection>

            {/* SLA */}
            {ticket.dueAt && (
              <SidebarSection title="SLA">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Time remaining</span>
                    <span
                      className={cn(
                        "font-medium",
                        ticket.slaBreached ? "text-red-600" : ticket.isOverdue ? "text-amber-600" : "text-gray-700"
                      )}
                    >
                      {ticket.slaBreached
                        ? "Breached"
                        : formatDistanceToNow(new Date(ticket.dueAt), { addSuffix: false }) + " left"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        ticket.slaBreached ? "bg-red-500" : slaPercent > 75 ? "bg-amber-500" : "bg-blue-500"
                      )}
                      style={{ width: `${Math.min(100, slaPercent)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Due: {format(new Date(ticket.dueAt), "MMM d, yyyy 'at' HH:mm")}
                  </p>
                </div>
              </SidebarSection>
            )}

            {/* Tags */}
            {ticket.tags.length > 0 && (
              <SidebarSection title="Étiquettes">
                <div className="flex flex-wrap gap-1.5">
                  {ticket.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 border border-gray-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </SidebarSection>
            )}

            {/* Dates */}
            <SidebarSection title="Dates">
              <SidebarRow label="Créé le">
                <span className="text-xs text-gray-500">
                  {format(new Date(ticket.createdAt), "MMM d, yyyy HH:mm")}
                </span>
              </SidebarRow>
              <SidebarRow label="Modifié le">
                <span className="text-xs text-gray-500">
                  {format(new Date(ticket.updatedAt), "MMM d, yyyy HH:mm")}
                </span>
              </SidebarRow>
            </SidebarSection>

            {/* Related assets placeholder */}
            <SidebarSection title="Related Assets">
              <p className="text-xs text-gray-400">No assets linked to this ticket.</p>
            </SidebarSection>
          </div>
        </div>
      </div>
    </div>
  );
}
