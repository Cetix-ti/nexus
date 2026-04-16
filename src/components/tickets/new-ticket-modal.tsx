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
  contactId?: string;
}

// Approbateur officiel d'une organisation (modèle OrgApprover). Distinct
// d'un "Contact" — un approbateur est souvent aussi contact, mais peut
// avoir des champs/métadonnées propres (rôle, scope, etc.). On fetch
// cette liste à part pour l'organisation sélectionnée (pas besoin de
// pré-charger les 20 premières orgs comme avant).
interface ApproverOption {
  id: string;
  contactId: string | null;
  name: string;
  email: string;
}

// Queues are loaded dynamically from the API

export function NewTicketModal({ open, onClose }: NewTicketModalProps) {
  const [organization, setOrganization] = useState<string>("");
  const [requester, setRequester] = useState<string>("");
  const [orgList, setOrgList] = useState<string[]>([]);
  const [orgIdByName, setOrgIdByName] = useState<Record<string, string>>({});
  const [requestersByOrg, setRequestersByOrg] = useState<
    Record<string, ContactOption[]>
  >({});
  // Approbateurs de l'organisation sélectionnée. Rechargés quand on
  // change d'organisation — évite de pré-fetch 20+ orgs au démarrage.
  const [orgApprovers, setOrgApprovers] = useState<ApproverOption[]>([]);
  const [orgApproversLoading, setOrgApproversLoading] = useState(false);
  const [techniciansList, setTechniciansList] = useState<string[]>([]);
  const [techniciansLoading, setTechniciansLoading] = useState(false);
  const [queuesList, setQueuesList] = useState<{ id: string; name: string }[]>([]);
  const [queuesLoading, setQueuesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Charge la liste des orgs + un index id/name pour retrouver l'id à
    // partir du nom au moment du fetch approvers (car l'autocomplete
    // travaille sur le nom).
    fetch("/api/v1/organizations")
      .then((r) => r.json())
      .then((orgs: { id: string; name: string }[]) => {
        if (Array.isArray(orgs) && orgs.length > 0) {
          setOrgList(orgs.map((o) => o.name));
          setOrgIdByName(
            Object.fromEntries(orgs.map((o) => [o.name, o.id])),
          );
        }
      })
      .catch(() => {});

    // Contacts : pour peupler le dropdown Demandeur. Plus besoin de
    // matcher les approbateurs ici — ils sont fetch à part pour l'org
    // sélectionnée (cf. second useEffect).
    fetch("/api/v1/contacts")
      .then((r) => r.json())
      .then((contacts) => {
        if (!Array.isArray(contacts)) return;
        const map: Record<string, ContactOption[]> = {};
        for (const c of contacts) {
          const orgName = c.organization || c.organizationName;
          if (!orgName) continue;
          if (!map[orgName]) map[orgName] = [];
          map[orgName].push({
            name: `${c.firstName} ${c.lastName}`,
            email: c.email,
            contactId: c.id,
          });
        }
        if (Object.keys(map).length > 0) setRequestersByOrg(map);
      })
      .catch(() => {});

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

  // Recharge les approbateurs quand l'organisation change. On fetch
  // directement `/api/v1/approvers?organizationId=X` pour avoir la
  // vraie liste (OrgApprover) — pas un match fuzzy entre contacts +
  // approbateurs comme avant, qui ratait tout ce qui n'était pas dans
  // les 20 premières orgs ou dont l'email ne matchait pas pile un
  // Contact existant.
  useEffect(() => {
    if (!open) return;
    const orgName = organization.trim();
    if (!orgName) {
      setOrgApprovers([]);
      return;
    }
    const orgId = orgIdByName[orgName];
    if (!orgId) {
      setOrgApprovers([]);
      return;
    }
    setOrgApproversLoading(true);
    fetch(`/api/v1/approvers?organizationId=${orgId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (arr: Array<{
          id: string;
          contactId: string | null;
          contactName: string;
          contactEmail: string;
        }>) => {
          if (!Array.isArray(arr)) { setOrgApprovers([]); return; }
          setOrgApprovers(
            arr.map((a) => ({
              id: a.id,
              contactId: a.contactId,
              name: a.contactName,
              email: a.contactEmail,
            })),
          );
        },
      )
      .catch(() => setOrgApprovers([]))
      .finally(() => setOrgApproversLoading(false));
  }, [open, organization, orgIdByName]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("incident");
  // Défaut LOW : laisse l'IA d'auto-prioritisation remonter à MEDIUM/HIGH/
  // CRITICAL si elle détecte un signal fort. Évite que tous les tickets
  // soient classés MEDIUM par défaut et polluent les vues priorité.
  const [priority, setPriority] = useState("low");
  const [category, setCategory] = useState("");
  const [aiCategory, setAiCategory] = useState<{
    categoryLevel1: string;
    categoryLevel2?: string;
    categoryLevel3?: string;
    category: string;
    confidence: string;
    reasoning: string;
  } | null>(null);
  const [aiCategorizing, setAiCategorizing] = useState(false);
  // Seed pour le CategoryCascade — incrémente le stamp pour déclencher
  // l'application de la suggestion IA dans les 3 dropdowns.
  const [catSeed, setCatSeed] = useState<{
    l1: string; l2?: string; l3?: string; stamp: number;
  } | null>(null);
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
      // AdvancedRichEditor fournit du HTML dans `description`. On envoie
      // le HTML dans `descriptionHtml` (source de vérité pour le rendu
      // riche + images inline) ET une version plain text dans
      // `description` (fallback pour recherche, vues listes, et
      // envois notifications texte).
      const plainText = (description || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          description: plainText,
          descriptionHtml: description || null,
          organizationName: organization,
          requesterName: requester,
          type,
          priority,
          category,
          queue,
          assigneeName: assignee,
          requireApproval,
          // On passe le vrai contactId de l'OrgApprover (pas une chaîne
          // vide) pour que le serveur puisse créer une TicketApproval
          // traçable côté client (jointure vers Contact possible plus
          // tard). selectedApprovers contient les NOMS ; on les résout
          // depuis la liste orgApprovers chargée pour l'org courante.
          approvers: requireApproval
            ? selectedApprovers.map((name) => {
                const a = orgApprovers.find((x) => x.name === name);
                return {
                  name,
                  email: a?.email ?? "",
                  contactId: a?.contactId ?? "",
                };
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
  // Approbateurs = liste OrgApprover fetchée pour l'org sélectionnée.
  // Plus fiable que l'ancienne heuristique "contact dont l'email est
  // dans la liste d'approbateurs".
  const availableApprovers = orgApprovers;

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
                        // Déclenche le seed du CategoryCascade pour que
                        // les 3 dropdowns se remplissent automatiquement
                        // (level1/2/3) avec la suggestion IA.
                        if (data.categoryLevel1) {
                          setCatSeed({
                            l1: data.categoryLevel1,
                            l2: data.categoryLevel2 || undefined,
                            l3: data.categoryLevel3 || undefined,
                            stamp: Date.now(),
                          });
                          setCategory(data.category || data.categoryLevel1);
                        }
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
              {aiCategory && aiCategory.categoryLevel1 && (
                <div className="mb-2 rounded-lg bg-violet-50 border border-violet-200/60 px-3 py-2 text-[11.5px]">
                  <span className="font-medium text-violet-700">
                    {[
                      aiCategory.categoryLevel1,
                      aiCategory.categoryLevel2,
                      aiCategory.categoryLevel3,
                    ]
                      .filter(Boolean)
                      .join(" › ")}
                  </span>
                  <span className="text-violet-500 ml-2">({aiCategory.confidence})</span>
                  {aiCategory.reasoning && (
                    <p className="text-violet-500 mt-0.5">{aiCategory.reasoning}</p>
                  )}
                </div>
              )}
              <CategoryCascade value={category} onChange={setCategory} seed={catSeed} />
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
                {organization && orgApproversLoading && (
                  <p className="text-[11.5px] text-slate-400 italic inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Chargement des approbateurs…
                  </p>
                )}
                {organization && !orgApproversLoading && availableApprovers.length === 0 && (
                  <p className="text-[11.5px] text-slate-400 italic">
                    Aucun approbateur défini pour cette organisation. Ajoutez-en
                    un depuis la fiche de l&apos;organisation (onglet Contacts).
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

function CategoryCascade({
  value,
  onChange,
  seed,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Quand défini, les 3 niveaux internes du cascade sont pré-remplis
   *  à partir des noms fournis (insensible à la casse). Utilisé pour
   *  appliquer une suggestion IA. L'effet ne se déclenche qu'au CHANGE
   *  de `seed.stamp` — évite des loops si le parent re-render. */
  seed?: {
    l1: string;
    l2?: string;
    l3?: string;
    stamp: number;
  } | null;
}) {
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

  // Applique un seed (ex: suggestion IA) : résout chaque nom vers un id
  // en descendant la hiérarchie. S'arrête au plus profond qui matche.
  const lastSeedStamp = useRef<number | null>(null);
  useEffect(() => {
    if (!seed || categories.length === 0) return;
    if (lastSeedStamp.current === seed.stamp) return;
    lastSeedStamp.current = seed.stamp;

    const norm = (s: string) => s.trim().toLowerCase();
    const byNameAt = (parentId: string | null, name: string) =>
      categories.find(
        (c) => (c.parentId ?? null) === parentId && norm(c.name) === norm(name),
      );

    const cat1 = seed.l1 ? byNameAt(null, seed.l1) : undefined;
    if (!cat1) return;
    setLevel1(cat1.id);
    if (seed.l2) {
      const cat2 = byNameAt(cat1.id, seed.l2);
      setLevel2(cat2?.id ?? "");
      if (cat2 && seed.l3) {
        const cat3 = byNameAt(cat2.id, seed.l3);
        setLevel3(cat3?.id ?? "");
        if (cat3) {
          onChange(cat3.name);
          return;
        }
      } else {
        setLevel3("");
      }
      if (cat2) {
        onChange(cat2.name);
        return;
      }
    } else {
      setLevel2("");
      setLevel3("");
    }
    onChange(cat1.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.stamp, categories]);

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
