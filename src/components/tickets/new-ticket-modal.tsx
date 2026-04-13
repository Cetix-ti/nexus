"use client";

import { useState, useEffect, useRef } from "react";
import { X, Plus, Check, ShieldCheck, UserPlus, Trash2, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTicketsStore } from "@/stores/tickets-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NewTicketModalProps {
  open: boolean;
  onClose: () => void;
}

interface ContactOption {
  name: string;
  email: string;
  isApprover?: boolean;
}

// Queues are loaded dynamically from the API

export function NewTicketModal({ open, onClose }: NewTicketModalProps) {
  const [organization, setOrganization] = useState<string>("");
  const [requester, setRequester] = useState<string>("");
  const [orgList, setOrgList] = useState<string[]>([]);
  const [requestersByOrg, setRequestersByOrg] = useState<
    Record<string, ContactOption[]>
  >({});
  const [techniciansList, setTechniciansList] = useState<string[]>([]);
  const [techniciansLoading, setTechniciansLoading] = useState(false);
  const [queuesList, setQueuesList] = useState<{ id: string; name: string }[]>([]);
  const [queuesLoading, setQueuesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/v1/organizations")
      .then((r) => r.json())
      .then((orgs: { name: string }[]) => {
        if (Array.isArray(orgs) && orgs.length > 0) {
          setOrgList(orgs.map((o) => o.name));
        }
      })
      .catch(() => {});
    // Fetch contacts and approvers in parallel, then merge
    Promise.all([
      fetch("/api/v1/contacts").then((r) => r.json()).catch(() => []),
      fetch("/api/v1/organizations").then((r) => r.json()).catch(() => []),
    ]).then(async ([contacts, orgs]) => {
      if (!Array.isArray(contacts)) return;
      // Fetch approvers for each org
      const approverEmails = new Set<string>();
      if (Array.isArray(orgs)) {
        const approverFetches = orgs.slice(0, 20).map((org: any) =>
          fetch(`/api/v1/approvers?organizationId=${org.id}`)
            .then((r) => r.ok ? r.json() : [])
            .catch(() => [])
        );
        const approverResults = await Promise.all(approverFetches);
        for (const list of approverResults) {
          if (Array.isArray(list)) {
            for (const a of list) {
              if (a.contactEmail) approverEmails.add(a.contactEmail.toLowerCase());
            }
          }
        }
      }
      const map: Record<string, ContactOption[]> = {};
      for (const c of contacts) {
        const orgName = c.organization || c.organizationName;
        if (!orgName) continue;
        if (!map[orgName]) map[orgName] = [];
        map[orgName].push({
          name: `${c.firstName} ${c.lastName}`,
          email: c.email,
          isApprover: approverEmails.has(c.email?.toLowerCase()),
        });
      }
      if (Object.keys(map).length > 0) setRequestersByOrg(map);
    }).catch(() => {});

    // Fetch technicians
    setTechniciansLoading(true);
    fetch("/api/v1/users?role=TECHNICIAN,SUPERVISOR,MSP_ADMIN,SUPER_ADMIN")
      .then((r) => r.json())
      .then((users: { name: string }[]) => {
        if (Array.isArray(users)) setTechniciansList(users.map((u) => u.name));
      })
      .catch(() => {})
      .finally(() => setTechniciansLoading(false));

    // Fetch queues
    setQueuesLoading(true);
    fetch("/api/v1/queues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setQueuesList(data);
      })
      .catch(() => {})
      .finally(() => setQueuesLoading(false));
  }, [open]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("incident");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("");
  const [aiCategory, setAiCategory] = useState<{ category: string; confidence: string; reasoning: string } | null>(null);
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [queue, setQueue] = useState("");
  const [assignee, setAssignee] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);

  if (!open) return null;

  function reset() {
    setOrganization("");
    setRequester("");
    setSubject("");
    setDescription("");
    setType("incident");
    setPriority("medium");
    setCategory("");
    setQueue("");
    setAssignee("");
    setRequireApproval(false);
    setSelectedApprovers([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;

    try {
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          description,
          organizationName: organization,
          requesterName: requester,
          type,
          priority,
          category,
          queue,
          assigneeName: assignee,
          requireApproval,
          approvers: requireApproval
            ? selectedApprovers.map((name) => {
                const contact = requesters.find((r) => r.name === name);
                return { name, email: contact?.email ?? "", contactId: "" };
              })
            : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Erreur HTTP ${res.status}`);
        return;
      }

      // Save AI category feedback if suggestion was used
      if (aiCategory?.category && category) {
        fetch("/api/v1/ai/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "feedback",
            subject,
            description,
            suggestedCategory: aiCategory.category,
            confirmedCategory: category,
          }),
        }).catch(() => {});
      }

      reset();
      onClose();
      useTicketsStore.getState().refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur de création");
    }
  }

  function toggleApprover(name: string) {
    setSelectedApprovers((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  const requesters: ContactOption[] = organization
    ? requestersByOrg[organization] || []
    : [];
  const availableApprovers = requesters.filter((r) => r.isApprover);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-3xl my-8 rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Plus className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Nouveau ticket
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Créez un ticket pour un client ou un utilisateur interne
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Subject */}
          <Input
            label="Sujet"
            placeholder="Ex: VPN ne se connecte plus depuis le poste de travail"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />

          {/* Description (texte enrichi + images intégrées) */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Description
            </label>
            <AdvancedRichEditor
              value={description}
              onChange={setDescription}
              placeholder="Décrivez le problème en détail. Vous pouvez coller des images directement."
              minHeight="160px"
            />
          </div>

          {/* Organization + Requester */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Organisation
              </label>
              <Select value={organization} onValueChange={(v) => { setOrganization(v); setRequester(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {orgList.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Demandeur
              </label>
              <RequesterSearch
                value={requester}
                onChange={setRequester}
                organizationName={organization}
              />
            </div>
          </div>

          {/* Type + Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Type
              </label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incident">Incident</SelectItem>
                  <SelectItem value="service_request">Demande de service</SelectItem>
                  <SelectItem value="problem">Problème</SelectItem>
                  <SelectItem value="change">Changement</SelectItem>
                  <SelectItem value="alert">Alerte monitoring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Priorité
              </label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critique</SelectItem>
                  <SelectItem value="high">Élevée</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="low">Faible</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category + Queue */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13px] font-medium text-slate-700">Catégorie</label>
                <button
                  type="button"
                  disabled={aiCategorizing || !subject}
                  onClick={async () => {
                    setAiCategorizing(true);
                    setAiCategory(null);
                    try {
                      const res = await fetch("/api/v1/ai/categorize", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ subject, description }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setAiCategory(data);
                        if (data.category) setCategory(data.category);
                      }
                    } catch { /* ignore */ }
                    finally { setAiCategorizing(false); }
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {aiCategorizing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Suggérer par IA
                </button>
              </div>
              {aiCategory && (
                <div className="mb-2 rounded-lg bg-violet-50 border border-violet-200/60 px-3 py-2 text-[11.5px]">
                  <span className="font-medium text-violet-700">{aiCategory.category}</span>
                  <span className="text-violet-500 ml-2">({aiCategory.confidence})</span>
                  {aiCategory.reasoning && (
                    <p className="text-violet-500 mt-0.5">{aiCategory.reasoning}</p>
                  )}
                </div>
              )}
              <CategoryCascade value={category} onChange={setCategory} />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                File d&apos;attente
              </label>
              <Select value={queue} onValueChange={setQueue} disabled={queuesLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={queuesLoading ? "Chargement..." : "Sélectionner..."} />
                </SelectTrigger>
                <SelectContent>
                  {queuesList.map((q) => (
                    <SelectItem key={q.id} value={q.name}>
                      {q.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Assigné à
            </label>
            <Select value={assignee} onValueChange={setAssignee} disabled={techniciansLoading}>
              <SelectTrigger>
                <SelectValue placeholder={techniciansLoading ? "Chargement..." : "Non assigné"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Non assigné</SelectItem>
                {techniciansList.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* APPROVERS */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60 shrink-0">
                  <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                </div>
                <div>
                  <h4 className="text-[13.5px] font-semibold text-slate-900">
                    Approbation requise
                  </h4>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">
                    Le ticket sera bloqué tant qu&apos;un ou plusieurs
                    approbateurs côté client n&apos;ont pas validé
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRequireApproval(!requireApproval);
                  if (!requireApproval && availableApprovers.length > 0) {
                    setSelectedApprovers([availableApprovers[0].name]);
                  } else {
                    setSelectedApprovers([]);
                  }
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors mt-1",
                  requireApproval ? "bg-blue-600" : "bg-slate-300"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow translate-y-0.5",
                    requireApproval ? "translate-x-[18px]" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>

            {requireApproval && (
              <div className="space-y-2">
                {!organization && (
                  <p className="text-[11.5px] text-slate-400 italic">
                    Sélectionnez d&apos;abord une organisation pour voir les
                    approbateurs disponibles
                  </p>
                )}
                {organization && availableApprovers.length === 0 && (
                  <p className="text-[11.5px] text-slate-400 italic">
                    Aucun approbateur défini pour cette organisation
                  </p>
                )}
                {organization && availableApprovers.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                      Sélectionnez les approbateurs ({selectedApprovers.length})
                    </p>
                    <div className="space-y-1.5">
                      {availableApprovers.map((a) => {
                        const isSelected = selectedApprovers.includes(a.name);
                        return (
                          <button
                            key={a.name}
                            type="button"
                            onClick={() => toggleApprover(a.name)}
                            className={cn(
                              "w-full flex items-center gap-3 rounded-lg border bg-white p-2.5 transition-all text-left",
                              isSelected
                                ? "border-blue-300 ring-1 ring-blue-200 shadow-sm"
                                : "border-slate-200 hover:border-slate-300"
                            )}
                          >
                            <div
                              className={cn(
                                "h-4 w-4 rounded shrink-0 border-2 flex items-center justify-center",
                                isSelected
                                  ? "bg-blue-600 border-blue-600"
                                  : "border-slate-300"
                              )}
                            >
                              {isSelected && (
                                <Check
                                  className="h-2.5 w-2.5 text-white"
                                  strokeWidth={3}
                                />
                              )}
                            </div>
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                              {a.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] font-medium text-slate-900">
                                {a.name}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {a.email}
                              </p>
                            </div>
                            <span className="inline-flex items-center rounded bg-violet-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200/60">
                              Approbateur
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10.5px] text-slate-400 mt-1">
                      💡 Vous pouvez gérer les approbateurs d&apos;une
                      organisation depuis sa page « Contacts ».
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Créer le ticket
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category cascade (up to 3 levels)
// ---------------------------------------------------------------------------

interface CatNode {
  id: string;
  name: string;
  parentId: string | null;
  children?: CatNode[];
}

function CategoryCascade({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [categories, setCategories] = useState<CatNode[]>([]);
  const [level1, setLevel1] = useState("");
  const [level2, setLevel2] = useState("");
  const [level3, setLevel3] = useState("");

  useEffect(() => {
    fetch("/api/v1/categories")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data);
        }
      })
      .catch(() => {});
  }, []);

  const roots = categories.filter((c) => !c.parentId);
  const level2Options = level1 ? categories.filter((c) => c.parentId === level1) : [];
  const level3Options = level2 ? categories.filter((c) => c.parentId === level2) : [];

  function handleLevel1(v: string) {
    setLevel1(v);
    setLevel2("");
    setLevel3("");
    const cat = categories.find((c) => c.id === v);
    onChange(cat?.name ?? v);
  }

  function handleLevel2(v: string) {
    setLevel2(v);
    setLevel3("");
    const cat = categories.find((c) => c.id === v);
    onChange(cat?.name ?? v);
  }

  function handleLevel3(v: string) {
    setLevel3(v);
    const cat = categories.find((c) => c.id === v);
    onChange(cat?.name ?? v);
  }

  return (
    <div className="space-y-2">
      <Select value={level1} onValueChange={handleLevel1}>
        <SelectTrigger><SelectValue placeholder="Catégorie..." /></SelectTrigger>
        <SelectContent>
          {roots.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {level2Options.length > 0 && (
        <Select value={level2} onValueChange={handleLevel2}>
          <SelectTrigger><SelectValue placeholder="Sous-catégorie..." /></SelectTrigger>
          <SelectContent>
            {level2Options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {level3Options.length > 0 && (
        <Select value={level3} onValueChange={handleLevel3}>
          <SelectTrigger><SelectValue placeholder="Élément..." /></SelectTrigger>
          <SelectContent>
            {level3Options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requester search with autocomplete
// ---------------------------------------------------------------------------

function RequesterSearch({
  value,
  onChange,
  organizationName,
}: {
  value: string;
  onChange: (v: string) => void;
  organizationName: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<{ name: string; email: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/v1/contacts/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = await res.json();
        let filtered = Array.isArray(data) ? data : [];
        // Filter by org if one is selected
        if (organizationName) {
          filtered = filtered.filter((c: any) => c.organizationName === organizationName);
        }
        setResults(filtered.map((c: any) => ({
          name: `${c.firstName} ${c.lastName}`,
          email: c.email,
        })));
        setOpen(true);
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, organizationName]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); }}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder="Taper un nom ou un courriel..."
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {searching && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-[210] mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.email}
              type="button"
              onClick={() => { onChange(r.name); setQuery(r.name); setOpen(false); }}
              className="flex flex-col w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <span className="text-[13px] font-medium text-slate-900">{r.name}</span>
              <span className="text-[11px] text-slate-400">{r.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
