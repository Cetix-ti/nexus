"use client";

import { useState, useEffect } from "react";
import { X, Plus, Check, ShieldCheck, UserPlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

const FALLBACK_ORGS = [
  "Cetix",
  "Acme Corp",
  "TechStart Inc",
  "Global Finance",
  "HealthCare Plus",
  "MédiaCentre QC",
];

interface ContactOption {
  name: string;
  email: string;
  isApprover?: boolean;
}

const FALLBACK_REQUESTERS_BY_ORG: Record<string, ContactOption[]> = {
  Cetix: [
    { name: "Jean-Philippe Côté", email: "jp.cote@cetix.ca", isApprover: true },
    { name: "Marie Tremblay", email: "marie@cetix.ca" },
    { name: "Alexandre Dubois", email: "alex.dubois@cetix.ca" },
  ],
  "Acme Corp": [
    { name: "Robert Martin", email: "robert.martin@acme.com", isApprover: true },
    { name: "Sophie Lavoie", email: "sophie.lavoie@acme.com", isApprover: true },
    { name: "David Bergeron", email: "david.bergeron@acme.com" },
  ],
  "TechStart Inc": [
    { name: "Émilie Roy", email: "emilie.roy@techstart.io", isApprover: true },
    { name: "Pierre Tremblay", email: "pierre.t@techstart.io" },
  ],
  "Global Finance": [
    { name: "Catherine Lemieux", email: "c.lemieux@globalfinance.ca", isApprover: true },
    { name: "Marc Bouchard", email: "m.bouchard@globalfinance.ca", isApprover: true },
  ],
  "HealthCare Plus": [
    { name: "Annie Desrosiers", email: "annie.d@healthcareplus.ca", isApprover: true },
    { name: "François Gagnon", email: "f.gagnon@healthcareplus.ca" },
  ],
  "MédiaCentre QC": [
    { name: "Isabelle Côté", email: "isabelle.c@mediacentre.qc.ca", isApprover: true },
    { name: "Lucas Bergeron", email: "lucas.b@mediacentre.qc.ca" },
  ],
};

const TECHNICIANS = [
  "Marie Tremblay",
  "Alexandre Dubois",
  "Sophie Lavoie",
  "Lucas Bergeron",
];

const CATEGORIES = [
  "Matériel",
  "Logiciels",
  "Réseau & VPN",
  "Compte & Accès",
  "Email",
  "Sécurité",
];

const QUEUES = [
  "Support général",
  "Réseau & Infrastructure",
  "Sécurité",
  "Infrastructure Cloud",
  "Demandes de service",
  "Projets",
];

export function NewTicketModal({ open, onClose }: NewTicketModalProps) {
  const [organization, setOrganization] = useState<string>("");
  const [requester, setRequester] = useState<string>("");
  const [orgList, setOrgList] = useState<string[]>([]);
  const [requestersByOrg, setRequestersByOrg] = useState<
    Record<string, ContactOption[]>
  >({});
  // Fallbacks gardés en cas de besoin offline / dev — non affichés.
  void FALLBACK_ORGS;
  void FALLBACK_REQUESTERS_BY_ORG;

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
    fetch("/api/v1/contacts")
      .then((r) => r.json())
      .then((contacts: { firstName: string; lastName: string; email: string; organization: string }[]) => {
        if (!Array.isArray(contacts)) return;
        const map: Record<string, ContactOption[]> = {};
        for (const c of contacts) {
          if (!map[c.organization]) map[c.organization] = [];
          map[c.organization].push({
            name: `${c.firstName} ${c.lastName}`,
            email: c.email,
          });
        }
        if (Object.keys(map).length > 0) setRequestersByOrg(map);
      })
      .catch(() => {});
  }, [open]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("incident");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("");
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log("New ticket:", {
      subject,
      description,
      organization,
      requester,
      type,
      priority,
      category,
      queue,
      assignee,
      requireApproval,
      approvers: selectedApprovers,
    });
    reset();
    onClose();
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
              <Select value={requester} onValueChange={setRequester} disabled={!organization}>
                <SelectTrigger>
                  <SelectValue placeholder={organization ? "Sélectionner..." : "Choisir une organisation"} />
                </SelectTrigger>
                <SelectContent>
                  {requesters.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <SelectItem value="request">Demande de service</SelectItem>
                  <SelectItem value="problem">Problème</SelectItem>
                  <SelectItem value="change">Changement</SelectItem>
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
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Catégorie
              </label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                File d&apos;attente
              </label>
              <Select value={queue} onValueChange={setQueue}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {QUEUES.map((q) => (
                    <SelectItem key={q} value={q}>
                      {q}
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
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Non assigné" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Non assigné</SelectItem>
                {TECHNICIANS.map((t) => (
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
