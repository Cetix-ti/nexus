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
  X,
  Bell,
  BellOff,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RichTextEditor, type Attachment } from "@/components/ui/rich-text-editor";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { LinkAssetModal } from "@/components/tickets/link-asset-modal";
import { LinkProjectModal } from "@/components/tickets/link-project-modal";
import {
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/mock-data";
import { TicketBillingSection } from "@/components/billing/ticket-billing-section";
import { FolderKanban } from "lucide-react";

function getOrgId(ticket: { organizationId?: string; organizationName: string }): string {
  if (ticket.organizationId) return ticket.organizationId;
  // Derive a slug-based ID from the name as fallback
  return "org_" + ticket.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
}

/**
 * Render a ticket description as HTML.
 * If the description already contains HTML tags, return it as-is.
 * Otherwise escape it and convert newlines to <br> so plain-text imported
 * descriptions render with line breaks and stay safe from XSS.
 */
function renderDescription(description: string | null | undefined): string {
  if (!description || !description.trim()) {
    return '<p class="text-slate-400 italic">Aucune description.</p>';
  }
  const hasHtml = /<[a-z][\s\S]*>/i.test(description);
  if (hasHtml) return description;
  // Plain text: escape + preserve line breaks + auto-link URLs
  const escaped = description
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // Convert URLs to clickable links
  const withLinks = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  // Split into paragraphs on double newlines, keep single newlines as <br>
  const paragraphs = withLinks
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return paragraphs;
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
  pending: "warning",
  waiting_client: "default",
  waiting_vendor: "default",
  scheduled: "primary",
  resolved: "success",
  closed: "default",
  cancelled: "default",
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
      <span className="text-xs text-gray-500 whitespace-nowrap pt-0.5 shrink-0">{label}</span>
      <div className="text-right min-w-0 flex-1">{children}</div>
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
  const [collaborators, setCollaborators] = useState<{ id: string; userId: string; role: string; user: { id: string; name: string; avatar: string | null } }[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; avatar: string | null }[]>([]);
  const [reminder, setReminder] = useState<{ id: string; remindAt: string; note: string | null } | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDate, setReminderDate] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [reminderSaving, setReminderSaving] = useState(false);
  const [editingSubject, setEditingSubject] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [projects, setProjects] = useState<{ id: string; code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  // Category selection at 3 levels — local state so React re-renders reliably
  const [catLevel1, setCatLevel1] = useState<string>("");
  const [catLevel2, setCatLevel2] = useState<string>("");
  const [catLevel3, setCatLevel3] = useState<string>("");
  const [linkedAssets, setLinkedAssets] = useState<{ id: string; name: string; type: string; externalSource: string | null }[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [linkedProjectName, setLinkedProjectName] = useState<string | null>(null);
  const [userSignature, setUserSignature] = useState<{ signature: string | null; signatureHtml: string | null }>({ signature: null, signatureHtml: null });
  const [appendSignature, setAppendSignature] = useState(true);
  const [requesterPhone, setRequesterPhone] = useState<string | null>(null);
  const [timelineTab, setTimelineTab] = useState<"messages" | "notes" | "activity">("messages");

  const tickets = useTicketsStore((s) => s.tickets);
  const loadAll = useTicketsStore((s) => s.loadAll);
  const loaded = useTicketsStore((s) => s.loaded);
  const updateTicket = useTicketsStore((s) => s.updateTicket);
  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);
  const ticket = tickets.find((t) => t.id === params.id);

  // Direct API patch for fields not in the Zustand Ticket type
  async function patchTicketField(patch: Record<string, unknown>) {
    if (!ticket) return;
    await fetch(`/api/v1/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  // Load collaborators and users list
  useEffect(() => {
    if (!ticket) return;
    const controller = new AbortController();
    const { signal } = controller;

    fetch(`/api/v1/tickets/${ticket.id}/collaborators`, { signal })
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((d) => { if (!signal.aborted) setCollaborators(d.data || []); })
      .catch(() => {});
    fetch("/api/v1/users?role=TECHNICIAN,SUPERVISOR,MSP_ADMIN,SUPER_ADMIN", { signal })
      .then((r) => r.json())
      .then((users: any[]) => {
        if (!signal.aborted && Array.isArray(users)) setAllUsers(users.map((u) => ({ id: u.id, name: u.name, avatar: u.avatar })));
      })
      .catch(() => {});

    // Load existing reminder
    fetch(`/api/v1/tickets/${ticket.id}/reminder`, { signal })
      .then((r) => r.ok ? r.json() : null)
      .then((r) => { if (!signal.aborted && r) setReminder(r); })
      .catch(() => {});
    // Load projects for linking
    fetch("/api/v1/projects?active=true", { signal })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => {
        if (signal.aborted) return;
        const list = Array.isArray(d)
          ? d.map((p: any) => ({ id: p.id, code: p.code, name: p.name }))
          : d.data?.map((p: any) => ({ id: p.id, code: p.code, name: p.name })) || [];
        setProjects(list);
        // Resolve current linked project name if any
        if (ticket?.projectId) {
          const cur = list.find((p: any) => p.id === ticket.projectId);
          if (cur) setLinkedProjectName(`${cur.code} — ${cur.name}`);
        }
      })
      .catch(() => {});
    // Load categories for classification
    fetch("/api/v1/categories", { signal })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => {
        if (!signal.aborted && Array.isArray(d)) {
          const cats = d.map((c: any) => ({ id: c.id, name: c.name, parentId: c.parentId }));
          setCategories(cats);
          // Reconstruct 3-level selection from the ticket's current categoryId
          const currentId = (ticket as any).categoryId;
          if (currentId) {
            const chain: string[] = [];
            let cursor = cats.find((c) => c.id === currentId);
            while (cursor) {
              chain.unshift(cursor.id);
              cursor = cursor.parentId ? cats.find((c) => c.id === cursor!.parentId) : undefined;
              if (chain.length > 5) break; // safety
            }
            setCatLevel1(chain[0] || "");
            setCatLevel2(chain[1] || "");
            setCatLevel3(chain[2] || "");
          }
        }
      })
      .catch(() => {});
    // Load linked assets
    fetch(`/api/v1/tickets/${ticket.id}/assets`, { signal })
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((d) => { if (!signal.aborted) setLinkedAssets(d.data || []); })
      .catch(() => {});
    // Load current user's signature
    fetch("/api/v1/me", { signal })
      .then((r) => r.ok ? r.json() : null)
      .then((me) => {
        if (!signal.aborted && me) {
          setUserSignature({ signature: me.signature ?? null, signatureHtml: me.signatureHtml ?? null });
        }
      })
      .catch(() => {});
    // Load requester phone — resolve by email, scoped to this org
    if (ticket?.requesterEmail) {
      fetch(`/api/v1/contacts/search?q=${encodeURIComponent(ticket.requesterEmail)}`, { signal })
        .then((r) => r.ok ? r.json() : [])
        .then((d) => {
          if (signal.aborted) return;
          const list = Array.isArray(d) ? d : [];
          const match = list.find((c: any) => c.email?.toLowerCase() === ticket.requesterEmail.toLowerCase());
          if (match?.phone) setRequesterPhone(match.phone);
        })
        .catch(() => {});
    }

    return () => controller.abort();
  }, [ticket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLinkAsset(asset: any) {
    if (!ticket) return;
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Échec de la liaison : ${err.error || `HTTP ${res.status}`}`);
        return;
      }
      setLinkedAssets((prev) => [...prev, {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        externalSource: asset.externalSource ?? null,
      }]);
    } catch (e) {
      alert(`Erreur réseau : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleUnlinkAsset(assetId: string) {
    if (!ticket) return;
    await fetch(`/api/v1/tickets/${ticket.id}/assets?assetId=${encodeURIComponent(assetId)}`, {
      method: "DELETE",
    });
    setLinkedAssets((prev) => prev.filter((a) => a.id !== assetId));
  }

  async function handleSetReminder() {
    if (!ticket || !reminderDate) return;
    setReminderSaving(true);
    try {
      const res = await fetch(`/api/v1/tickets/${ticket.id}/reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remindAt: reminderDate, note: reminderNote || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setReminder(data);
        setReminderOpen(false);
        setReminderDate("");
        setReminderNote("");
      }
    } catch {}
    setReminderSaving(false);
  }

  async function handleDeleteReminder() {
    if (!ticket) return;
    await fetch(`/api/v1/tickets/${ticket.id}/reminder`, { method: "DELETE" });
    setReminder(null);
  }

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
      // Build final content with optional signature
      let finalContent = commentText;
      const hasSig = userSignature.signatureHtml || userSignature.signature;
      if (appendSignature && hasSig) {
        const escapeHtml = (s: string) =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const sigHtml = userSignature.signatureHtml
          ?? `<p>${escapeHtml(userSignature.signature ?? "").replace(/\n/g, "<br>")}</p>`;
        // Separator
        finalContent = `${commentText}<br><br>--<br>${sigHtml}`;
      }
      const res = await fetch(`/api/v1/tickets/${ticket!.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: finalContent, isInternal }),
      });
      if (res.ok) {
        const data = await res.json();
        const newComment: LocalComment = {
          id: data.data?.id ?? `local-${Date.now()}`,
          kind: "comment",
          authorName: data.data?.authorName ?? "Moi",
          content: finalContent,
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
    } catch (err) { console.error("Failed to post comment", err); }
    finally { setSending(false); }
  }

  // SLA calculation based on elapsed time vs due date
  const slaPercent = (() => {
    if (ticket.slaBreached) return 100;
    if (!ticket.dueAt) return 0;
    const created = new Date(ticket.createdAt).getTime();
    const due = new Date(ticket.dueAt).getTime();
    const now = Date.now();
    const total = due - created;
    if (total <= 0) return 100;
    return Math.min(100, Math.round(((now - created) / total) * 100));
  })();

  return (
    <div className="flex flex-col gap-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
        <span className="text-sm font-mono text-gray-500">{ticket.number}</span>

        <div className="flex-1" />

        {/* Reminder button */}
        <div className="relative">
          {reminder ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setReminderOpen(!reminderOpen)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200/60 hover:bg-amber-100 transition-colors"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Rappel : {new Date(reminder.remindAt).toLocaleDateString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </button>
              <button
                onClick={handleDeleteReminder}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-amber-500 hover:bg-amber-100 hover:text-amber-700 transition-colors"
                title="Supprimer le rappel"
              >
                <BellOff className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setReminderOpen(!reminderOpen)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <Bell className="h-3.5 w-3.5" />
              Rappel
            </button>
          )}

          {/* Reminder popover */}
          {reminderOpen && (
            <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-4 space-y-3">
              <h4 className="text-[13px] font-semibold text-slate-900">Configurer un rappel</h4>
              <div>
                <label className="text-[12px] text-slate-500 mb-1 block">Date et heure</label>
                <input
                  type="datetime-local"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full h-9 rounded-lg border border-slate-200 px-3 text-[13px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-[12px] text-slate-500 mb-1 block">Note (optionnel)</label>
                <textarea
                  value={reminderNote}
                  onChange={(e) => setReminderNote(e.target.value)}
                  rows={2}
                  placeholder="Ex: Relancer le client..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setReminderOpen(false)}
                  className="px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSetReminder}
                  disabled={!reminderDate || reminderSaving}
                  className="px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {reminderSaving ? "..." : reminder ? "Modifier" : "Définir le rappel"}
                </button>
              </div>
            </div>
          )}
        </div>
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
                    SLA dépassé
                  </Badge>
                )}
              </div>
              {editingSubject ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={subjectDraft}
                    onChange={(e) => setSubjectDraft(e.target.value)}
                    autoFocus
                    className="flex-1 text-xl font-bold text-gray-900 border border-blue-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        await updateTicket(ticket!.id, { subject: subjectDraft });
                        ticket.subject = subjectDraft;
                        setEditingSubject(false);
                      }
                      if (e.key === "Escape") setEditingSubject(false);
                    }}
                  />
                  <button
                    onClick={async () => {
                      await updateTicket(ticket!.id, { subject: subjectDraft });
                      ticket.subject = subjectDraft;
                      setEditingSubject(false);
                    }}
                    className="px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <h1
                  className="text-xl font-bold text-gray-900 cursor-pointer hover:text-blue-700 transition-colors"
                  onClick={() => { setEditingSubject(true); setSubjectDraft(ticket.subject); }}
                  title="Cliquer pour modifier le titre"
                >
                  {ticket.subject}
                </h1>
              )}
            </div>

            {/* Description */}
            <div className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Description</h2>
                {!editingDescription && (
                  <button
                    onClick={() => { setEditingDescription(true); setDescriptionDraft(ticket.description); }}
                    className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Modifier
                  </button>
                )}
              </div>
              {editingDescription ? (
                <div className="space-y-3">
                  <AdvancedRichEditor
                    value={descriptionDraft}
                    onChange={setDescriptionDraft}
                    placeholder="Description du ticket..."
                    minHeight="200px"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingDescription(false)}
                      className="px-3 py-1.5 text-[12px] font-medium text-slate-600 rounded-lg hover:bg-slate-100"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={async () => {
                        await updateTicket(ticket!.id, { description: descriptionDraft });
                        ticket.description = descriptionDraft;
                        setEditingDescription(false);
                      }}
                      className="px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="tiptap text-sm text-gray-700 leading-relaxed prose prose-sm prose-slate max-w-none [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_a]:text-blue-600 [&_a]:underline [&_strong]:font-semibold [&_em]:italic [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_pre]:bg-slate-100 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-xs [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_img]:max-w-full [&_img]:rounded-lg"
                  dangerouslySetInnerHTML={{ __html: renderDescription(ticket.description) }}
                />
              )}
            </div>

            {/* Billing */}
            <div id="ticket-billing">
            <TicketBillingSection
              ticketId={ticket.id}
              ticketNumber={ticket.number}
              organizationId={getOrgId(ticket)}
              organizationName={ticket.organizationName}
            />
            </div>

            {/* Timeline with tabs — separate messages (public) from notes (internal) from activity */}
            <div className="mb-8">
              <div className="mb-4 flex items-center justify-between">
                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/60 p-1">
                  <button
                    onClick={() => setTimelineTab("messages")}
                    className={cn(
                      "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
                      timelineTab === "messages" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    Messages
                    <span className="ml-1.5 text-[10.5px] text-slate-400 tabular-nums">
                      {timeline.filter((i) => i.kind === "comment" && !(i as any).isInternal).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setTimelineTab("notes")}
                    className={cn(
                      "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
                      timelineTab === "notes" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    Notes internes
                    <span className="ml-1.5 text-[10.5px] text-slate-400 tabular-nums">
                      {timeline.filter((i) => i.kind === "comment" && (i as any).isInternal).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setTimelineTab("activity")}
                    className={cn(
                      "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
                      timelineTab === "activity" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    Activité
                    <span className="ml-1.5 text-[10.5px] text-slate-400 tabular-nums">
                      {timeline.filter((i) => i.kind === "activity").length}
                    </span>
                  </button>
                </div>
              </div>
              {(() => {
                const filteredTimeline = timeline.filter((item) => {
                  if (timelineTab === "messages") return item.kind === "comment" && !(item as any).isInternal;
                  if (timelineTab === "notes") return item.kind === "comment" && (item as any).isInternal;
                  return item.kind === "activity";
                });
                if (filteredTimeline.length === 0) {
                  return (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
                      <p className="text-[13px] text-slate-400">
                        {timelineTab === "messages" && "Aucun message public pour le moment."}
                        {timelineTab === "notes" && "Aucune note interne pour le moment."}
                        {timelineTab === "activity" && "Aucune activité enregistrée."}
                      </p>
                    </div>
                  );
                }
                return (
              <div className="relative space-y-0">
                {/* Vertical line */}
                <div className="absolute left-[17px] top-2 bottom-2 w-px bg-gray-200" />

                {filteredTimeline.map((item) => (
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
                                  Interne
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
                );
              })()}
            </div>

            {/* Add comment */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-700">Répondre au ticket</h3>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
                  <button
                    onClick={() => { setIsInternal(false); setTimelineTab("messages"); }}
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
                    onClick={() => { setIsInternal(true); setTimelineTab("notes"); }}
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
                <div className="flex items-center gap-3">
                  {(userSignature.signature || userSignature.signatureHtml) && (
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={appendSignature}
                        onChange={(e) => setAppendSignature(e.target.checked)}
                        className="h-3 w-3 rounded border-slate-300"
                      />
                      Inclure ma signature
                    </label>
                  )}
                </div>
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

        {/* Right: Sidebar — on mobile, appears BEFORE main content via order; collapsible on small screens */}
        <div className="w-full lg:w-80 flex-shrink-0 overflow-y-auto bg-gray-50/50 order-first lg:order-none">
          <div className="p-5 space-y-5">
            {/* Status & Priority */}
            <SidebarSection title="Détails">
              <SidebarRow label="Statut">
                <select
                  value={ticket.status}
                  onChange={async (e) => {
                    const newStatus = e.target.value;
                    try {
                      await updateTicket(ticket!.id, { status: newStatus as TicketStatus });
                    } catch {
                      console.error("Erreur lors de la mise à jour du statut");
                    }
                  }}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="new">Nouveau</option>
                  <option value="open">Ouvert</option>
                  <option value="in_progress">En cours</option>
                  <option value="on_site">Sur place</option>
                  <option value="pending">En attente</option>
                  <option value="waiting_client">En attente client</option>
                  <option value="waiting_vendor">Attente fournisseur</option>
                  <option value="scheduled">Planifié</option>
                  <option value="resolved">Résolu</option>
                  <option value="closed">Fermé</option>
                  <option value="cancelled">Annulé</option>
                </select>
              </SidebarRow>
              <SidebarRow label="Priorité">
                <select
                  value={ticket.priority}
                  onChange={async (e) => {
                    const newPriority = e.target.value;
                    try {
                      await updateTicket(ticket!.id, { priority: newPriority as TicketPriority });
                    } catch {
                      console.error("Erreur lors de la mise à jour de la priorité");
                    }
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
                <select
                  value={ticket.urgency}
                  onChange={async (e) => {
                    try {
                      await updateTicket(ticket!.id, { urgency: e.target.value as any });
                    } catch {
                      console.error("Erreur lors de la mise à jour de l'urgence");
                    }
                  }}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="critical">Critique</option>
                  <option value="high">Élevée</option>
                  <option value="medium">Moyenne</option>
                  <option value="low">Faible</option>
                </select>
              </SidebarRow>
              <SidebarRow label="Impact">
                <select
                  value={ticket.impact}
                  onChange={async (e) => {
                    try {
                      await updateTicket(ticket!.id, { impact: e.target.value as any });
                    } catch {
                      console.error("Erreur lors de la mise à jour de l'impact");
                    }
                  }}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="critical">Critique</option>
                  <option value="high">Élevée</option>
                  <option value="medium">Moyenne</option>
                  <option value="low">Faible</option>
                </select>
              </SidebarRow>
              <SidebarRow label="Type">
                <select
                  value={ticket.type}
                  onChange={async (e) => {
                    try {
                      await updateTicket(ticket!.id, { type: e.target.value as any });
                    } catch {
                      console.error("Erreur lors de la mise à jour du type");
                    }
                  }}
                  className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="incident">Incident</option>
                  <option value="service_request">Demande de service</option>
                  <option value="problem">Problème</option>
                  <option value="change">Changement</option>
                  <option value="alert">Alerte</option>
                </select>
              </SidebarRow>
            </SidebarSection>

            {/* People */}
            <SidebarSection title="Personnes">
              <SidebarRow label="Assigné à">
                <select
                  value={(ticket as any).assigneeId || ""}
                  onChange={async (e) => {
                    const assigneeId = e.target.value || null;
                    await updateTicket(ticket!.id, { assigneeId });
                    const u = allUsers.find((u) => u.id === assigneeId);
                    ticket.assigneeName = u?.name || null;
                    (ticket as any).assigneeId = assigneeId;
                  }}
                  className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Non assigné</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </SidebarRow>
              <SidebarRow label="Demandeur">
                <div className="text-left">
                  <p className="text-[12.5px] font-semibold text-gray-900 truncate" title={ticket.requesterName}>
                    {ticket.requesterName}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate" title={ticket.requesterEmail}>
                    {ticket.requesterEmail}
                  </p>
                  {requesterPhone && (
                    <p className="text-[11px] text-gray-500 tabular-nums">
                      {requesterPhone}
                    </p>
                  )}
                </div>
              </SidebarRow>
            </SidebarSection>

            {/* Collaborateurs */}
            <SidebarSection title="Collaborateurs">
              {collaborators.length > 0 ? (
                <div className="space-y-2">
                  {collaborators.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px]">
                            {getInitials(c.user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-gray-700 truncate">{c.user.name}</span>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch(`/api/v1/tickets/${ticket.id}/collaborators?collaboratorId=${c.id}`, { method: "DELETE" });
                          setCollaborators((prev) => prev.filter((x) => x.id !== c.id));
                        }}
                        className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Aucun collaborateur</p>
              )}
              <div className="mt-2">
                <select
                  className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 focus:border-blue-500 focus:outline-none"
                  value=""
                  onChange={async (e) => {
                    const userId = e.target.value;
                    if (!userId) return;
                    try {
                      const res = await fetch(`/api/v1/tickets/${ticket.id}/collaborators`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setCollaborators((prev) => [...prev, data.data]);
                      }
                    } catch {}
                  }}
                >
                  <option value="">+ Ajouter un collaborateur</option>
                  {allUsers
                    .filter((u) => !collaborators.some((c) => c.userId === u.id) && u.id !== (ticket as any).assigneeId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </div>
            </SidebarSection>

            {/* Projet */}
            <SidebarSection title="Projet">
              {ticket.projectId ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <button
                      onClick={() => router.push(`/projects/${ticket.projectId}`)}
                      className="group flex items-center gap-2 text-[12.5px] font-medium text-gray-900 hover:text-blue-700 transition-colors min-w-0 flex-1"
                    >
                      <FolderKanban className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span className="truncate text-left">{linkedProjectName ?? "Voir le projet"}</span>
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm("Délier ce ticket du projet ?")) return;
                        await patchTicketField({ projectId: null });
                        ticket.projectId = undefined;
                        setLinkedProjectName(null);
                      }}
                      className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                      title="Délier du projet"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => setShowProjectPicker(true)}
                    className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                  >
                    Changer de projet
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowProjectPicker(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50/50 hover:bg-blue-50/40 hover:border-blue-300 transition-colors px-3 py-2 text-[12px] font-medium text-slate-600 hover:text-blue-700 w-full justify-center"
                >
                  <FolderKanban className="h-3.5 w-3.5" />
                  Lier à un projet
                </button>
              )}
            </SidebarSection>

            {/* Organization */}
            <SidebarSection title="Organisation">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-700">{ticket.organizationName}</span>
              </div>
            </SidebarSection>

            {/* Classification */}
            <SidebarSection title="Classification">
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Catégorie</label>
                  <select
                    value={catLevel1}
                    onChange={async (e) => {
                      const id = e.target.value;
                      setCatLevel1(id);
                      setCatLevel2("");
                      setCatLevel3("");
                      const finalId = id || null;
                      await patchTicketField({ categoryId: finalId });
                      const cat = categories.find((c) => c.id === finalId);
                      (ticket as any).categoryName = cat?.name || "—";
                      (ticket as any).categoryId = finalId;
                    }}
                    className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Aucune catégorie</option>
                    {categories.filter((c) => !c.parentId).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {catLevel1 && categories.some((c) => c.parentId === catLevel1) && (
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Sous-catégorie</label>
                    <select
                      value={catLevel2}
                      onChange={async (e) => {
                        const id = e.target.value;
                        setCatLevel2(id);
                        setCatLevel3("");
                        const finalId = id || catLevel1;
                        await patchTicketField({ categoryId: finalId });
                        const cat = categories.find((c) => c.id === finalId);
                        (ticket as any).categoryName = cat?.name || "—";
                        (ticket as any).categoryId = finalId;
                      }}
                      className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">— Aucune —</option>
                      {categories.filter((c) => c.parentId === catLevel1).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {catLevel2 && categories.some((c) => c.parentId === catLevel2) && (
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Sous-catégorie 2</label>
                    <select
                      value={catLevel3}
                      onChange={async (e) => {
                        const id = e.target.value;
                        setCatLevel3(id);
                        const finalId = id || catLevel2;
                        await patchTicketField({ categoryId: finalId });
                        const cat = categories.find((c) => c.id === finalId);
                        (ticket as any).categoryName = cat?.name || "—";
                        (ticket as any).categoryId = finalId;
                      }}
                      className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">— Aucune —</option>
                      {categories.filter((c) => c.parentId === catLevel2).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
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
                    <span className="text-gray-500">Temps restant</span>
                    <span
                      className={cn(
                        "font-medium",
                        ticket.slaBreached ? "text-red-600" : ticket.isOverdue ? "text-amber-600" : "text-gray-700"
                      )}
                    >
                      {ticket.slaBreached
                        ? "Dépassé"
                        : formatDistanceToNow(new Date(ticket.dueAt), { addSuffix: false }) + " restant"}
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
                    Échéance : {format(new Date(ticket.dueAt), "d MMM yyyy 'à' HH:mm")}
                  </p>
                  <button
                    onClick={async () => {
                      if (!confirm("Désactiver le SLA pour ce ticket ?")) return;
                      await patchTicketField({ dueAt: null, slaPolicyId: null });
                      ticket.dueAt = null;
                    }}
                    className="w-full mt-1 text-[11px] text-red-600 hover:text-red-700 font-medium hover:bg-red-50 rounded-md py-1 transition-colors"
                  >
                    Désactiver le SLA
                  </button>
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

            {/* Related assets */}
            <SidebarSection title="Actifs liés">
              {linkedAssets.length > 0 ? (
                <div className="space-y-1.5">
                  {linkedAssets.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 group">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-slate-800 font-mono truncate">{a.name}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">{a.type}{a.externalSource ? ` · ${a.externalSource}` : ""}</p>
                      </div>
                      <button
                        onClick={() => handleUnlinkAsset(a.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="Délier"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Aucun actif lié.</p>
              )}

              <button
                onClick={() => setShowAssetPicker(true)}
                className="mt-2 text-[11px] font-medium text-blue-600 hover:text-blue-700"
              >
                + Lier un actif
              </button>
            </SidebarSection>
          </div>
        </div>
      </div>

      {/* Asset linking modal */}
      <LinkAssetModal
        open={showAssetPicker}
        onClose={() => setShowAssetPicker(false)}
        ticketOrgId={(ticket as any)?.organizationId || null}
        alreadyLinkedIds={linkedAssets.map((a) => a.id)}
        onLink={async (asset) => {
          await handleLinkAsset(asset);
          setShowAssetPicker(false);
        }}
      />

      {/* Project linking modal */}
      <LinkProjectModal
        open={showProjectPicker}
        onClose={() => setShowProjectPicker(false)}
        ticketOrgId={(ticket as any)?.organizationId || null}
        ticketOrgName={ticket?.organizationName || null}
        currentProjectId={ticket?.projectId || null}
        onLink={async (project) => {
          await patchTicketField({ projectId: project.id });
          if (ticket) {
            ticket.projectId = project.id;
            setLinkedProjectName(`${project.code} — ${project.name}`);
          }
          setShowProjectPicker(false);
        }}
      />
    </div>
  );
}
