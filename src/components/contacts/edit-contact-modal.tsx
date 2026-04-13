"use client";

import { useEffect, useState } from "react";
import { X, UserCog, Upload, Save, Star, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import {
  DEFAULT_VIEWER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  type ClientPortalPermissions,
} from "@/lib/projects/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface EditContactModalContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  jobTitle: string;
  isVIP: boolean;
}

interface EditContactModalProps {
  open: boolean;
  onClose: () => void;
  contact: EditContactModalContact | null;
}

function splitName(name: string): { first: string; last: string } {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function initials(name: string): string {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function EditContactModal({
  open,
  onClose,
  contact,
}: EditContactModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [site, setSite] = useState("");
  const [vip, setVip] = useState(false);
  const [notes, setNotes] = useState("");
  const [emailPref, setEmailPref] = useState(true);
  const [smsPref, setSmsPref] = useState(false);
  const [phonePref, setPhonePref] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Organizations fetched from API
  const [organizations, setOrganizations] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/v1/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; name: string }[]) => {
        if (Array.isArray(data)) setOrganizations(data.map((o) => o.name));
      })
      .catch(() => setOrganizations([]));
  }, []);

  // Portal access
  type PortalPerms = Omit<ClientPortalPermissions, "contactId" | "organizationId">;
  const [portalPerms, setPortalPerms] = useState<PortalPerms>({ ...DEFAULT_VIEWER_PERMISSIONS });
  const [showGranular, setShowGranular] = useState(false);

  function setPortalRole(role: ClientPortalPermissions["portalRole"]) {
    if (role === "admin") setPortalPerms({ ...DEFAULT_ADMIN_PERMISSIONS });
    else if (role === "manager") setPortalPerms({ ...DEFAULT_MANAGER_PERMISSIONS });
    else setPortalPerms({ ...DEFAULT_VIEWER_PERMISSIONS });
  }

  function togglePerm<K extends keyof PortalPerms>(key: K, value: PortalPerms[K]) {
    setPortalPerms((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (contact) {
      const { first, last } = splitName(contact.name);
      setFirstName(first);
      setLastName(last);
      setEmail(contact.email || "");
      setPhone(contact.phone || "");
      setJobTitle(contact.jobTitle || "");
      setOrganization(contact.organization || "");
      setSite("");
      setVip(!!contact.isVIP);
      setNotes("");
      setEmailPref(true);
      setSmsPref(false);
      setPhonePref(true);
    }
  }, [contact]);

  if (!open || !contact) return null;

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setJobTitle("");
    setOrganization("");
    setSite("");
    setVip(false);
    setNotes("");
    setEmailPref(true);
    setSmsPref(false);
    setPhonePref(true);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    try {
      const res = await fetch(`/api/v1/contacts/${contact?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          jobTitle,
          isVIP: vip,
          notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err.error || `Erreur ${res.status}`;
        setSaveError(`Échec de la mise à jour : ${message}`);
        return;
      }
    } catch (err) {
      setSaveError("Erreur réseau — impossible de contacter le serveur.");
      return;
    }
    handleClose();
  }

  const fullName = `${firstName} ${lastName}`.trim() || contact.name;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-2xl my-8 rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <UserCog className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Modifier le contact
              </h2>
              <p className="text-[12.5px] text-slate-500">{contact.name}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white text-lg font-semibold shadow-sm ring-2 ring-white">
              {initials(fullName)}
              {vip && (
                <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-amber-400 ring-2 ring-white flex items-center justify-center">
                  <Star className="h-3 w-3 text-white fill-white" />
                </span>
              )}
            </div>
            <div>
              <Button type="button" variant="outline" size="sm">
                <Upload className="h-4 w-4" />
                Changer la photo
              </Button>
              <p className="mt-1.5 text-[12px] text-slate-500">
                PNG ou JPG, max. 2 Mo
              </p>
            </div>
          </div>

          {/* Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Input
              label="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>

          {/* Email + phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {/* Job */}
          <Input
            label="Titre du poste"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />

          {/* Org + site */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Organisation
              </label>
              <Select value={organization} onValueChange={setOrganization}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Site
              </label>
              <Select value={site} onValueChange={setSite}>
                <SelectTrigger>
                  <SelectValue placeholder="Optionnel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="siege">Siège social</SelectItem>
                  <SelectItem value="succursale">Succursale</SelectItem>
                  <SelectItem value="entrepot">Entrepôt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* VIP */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-slate-900">
                Contact VIP
              </p>
              <p className="text-[12.5px] text-slate-500">
                Priorité élevée et notifications dédiées
              </p>
            </div>
            <Switch checked={vip} onCheckedChange={setVip} />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notes internes sur le contact..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>

          {/* Comm preferences */}
          <div>
            <p className="mb-2 text-[13px] font-semibold text-slate-900">
              Préférences de communication
            </p>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[13px] text-slate-700">Email</span>
                <Switch checked={emailPref} onCheckedChange={setEmailPref} />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[13px] text-slate-700">SMS</span>
                <Switch checked={smsPref} onCheckedChange={setSmsPref} />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[13px] text-slate-700">Téléphone</span>
                <Switch checked={phonePref} onCheckedChange={setPhonePref} />
              </div>
            </div>
          </div>

          {/* Portal access */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
                <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-slate-900">Accès au portail client</p>
                <p className="text-[12px] text-slate-500">Permissions pour le portail self-service</p>
              </div>
              <Switch
                checked={portalPerms.canAccessPortal}
                onCheckedChange={(v) => togglePerm("canAccessPortal", v)}
              />
            </div>

            {portalPerms.canAccessPortal && (
              <div className="px-4 py-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Rôle dans le portail
                  </label>
                  <Select
                    value={portalPerms.portalRole}
                    onValueChange={(v) => setPortalRole(v as ClientPortalPermissions["portalRole"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Lecture seule</SelectItem>
                      <SelectItem value="manager">Gestionnaire client</SelectItem>
                      <SelectItem value="admin">Administrateur client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowGranular((s) => !s)}
                    className="flex w-full items-center justify-between rounded-lg bg-slate-50 hover:bg-slate-100 px-3 py-2 text-[12.5px] font-medium text-slate-700 transition-colors"
                  >
                    <span>Permissions détaillées</span>
                    {showGranular ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {showGranular && (
                    <div className="mt-2 rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {[
                        { key: "canSeeAllOrganizationTickets", label: "Voir tous les billets de l'organisation" },
                        { key: "canCreateTickets", label: "Créer des billets" },
                        { key: "canSeeProjects", label: "Voir les projets" },
                        { key: "canSeeProjectDetails", label: "Voir les détails des projets" },
                        { key: "canSeeReports", label: "Voir les rapports" },
                        { key: "canSeeBillingReports", label: "Voir les rapports de facturation" },
                        { key: "canSeeHourBankBalance", label: "Voir le solde de la banque d'heures" },
                        { key: "canSeeTeamMembers", label: "Voir les membres de l'équipe" },
                      ].map((p) => (
                        <div key={p.key} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-[12.5px] text-slate-700">{p.label}</span>
                          <Switch
                            checked={portalPerms[p.key as keyof PortalPerms] as boolean}
                            onCheckedChange={(v) => togglePerm(p.key as keyof PortalPerms, v as never)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Save error */}
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {saveError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              <Save className="h-4 w-4" strokeWidth={2.5} />
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
