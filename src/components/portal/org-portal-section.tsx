"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Eye,
  Pencil,
  Loader2,
  Save,
  Lock,
  UserCog,
  CheckCircle2,
  XCircle,
  X,
  Search,
  Crown,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePortalImpersonation } from "@/stores/portal-impersonation-store";
import { OrgApproversSection } from "@/components/approvers/org-approvers-section";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortalConfig {
  portalEnabled: boolean;
  portalAuthProviders: string[];
  portalDefaultRole: string | null;
}

interface PortalContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  isActive: boolean;
  portalEnabled: boolean;
  portalStatus: string | null;
  lastPortalLoginAt: string | null;
  hasPassword: boolean;
  portalAccess: {
    portalRole: string;
    canManageContacts: boolean;
    canManageAssets: boolean;
    canSeeAllOrgTickets: boolean;
    canSeeAllOrgAssets: boolean;
  } | null;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Gestionnaire",
  STANDARD: "Utilisateur standard",
  VIEWER: "Utilisateur standard",
};

const ROLE_VARIANTS: Record<string, "primary" | "warning" | "default"> = {
  ADMIN: "primary",
  MANAGER: "warning",
  STANDARD: "default",
  VIEWER: "default",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  permanent_departure: "Départ permanent",
  partial_departure: "Départ partiel",
  temporary_departure: "Départ temporaire",
};

const STATUS_VARIANTS: Record<string, "success" | "default" | "danger" | "warning"> = {
  active: "success",
  inactive: "default",
  permanent_departure: "danger",
  partial_departure: "warning",
  temporary_departure: "warning",
};

interface Props {
  organizationId: string;
  organizationName: string;
}

export function OrgPortalSection({ organizationId, organizationName }: Props) {
  const router = useRouter();
  const startImpersonation = usePortalImpersonation((s) => s.startImpersonation);
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [contacts, setContacts] = useState<PortalContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingContact, setEditingContact] = useState<PortalContact | null>(null);
  const [impersonateSearch, setImpersonateSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [showAdminPicker, setShowAdminPicker] = useState(false);
  const [showApproverPicker, setShowApproverPicker] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/organizations/${organizationId}/portal`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/v1/organizations/${organizationId}/portal/contacts`).then((r) => r.ok ? r.json() : []),
    ])
      .then(([cfg, cts]) => {
        if (cfg) setConfig(cfg);
        if (Array.isArray(cts)) setContacts(cts);
      })
      .finally(() => setLoading(false));
  }, [organizationId]);

  async function saveConfig(patch: Partial<PortalConfig>) {
    setSaving(true);
    const res = await fetch(`/api/v1/organizations/${organizationId}/portal`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) setConfig(await res.json());
    setSaving(false);
  }

  async function updateContactRole(contact: PortalContact, role: string) {
    await fetch(`/api/v1/organizations/${organizationId}/portal/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalRole: role, portalEnabled: true }),
    });
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contact.id
          ? { ...c, portalAccess: { ...(c.portalAccess ?? {} as any), portalRole: role } }
          : c,
      ),
    );
  }

  function handleImpersonate(contact: PortalContact) {
    const role = (contact.portalAccess?.portalRole?.toLowerCase() || "standard") as string;
    const isAdmin = role === "admin";
    const isManager = role === "manager" || isAdmin;
    startImpersonation({
      userId: contact.id,
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
      organizationId,
      organizationName,
      role: isAdmin ? "admin" : isManager ? "manager" : "viewer",
      permissions: {
        portalRole: isAdmin ? "admin" : isManager ? "manager" : "viewer",
        canAccessPortal: true,
        canSeeOwnTickets: true,
        canSeeAllOrganizationTickets: isManager,
        canCreateTickets: true,
        canSeeProjects: isManager,
        canSeeProjectDetails: isManager,
        canSeeProjectTasks: isAdmin,
        canSeeProjectLinkedTickets: isAdmin,
        canSeeReports: isManager,
        canSeeBillingReports: isAdmin,
        canSeeTimeReports: isAdmin,
        canSeeHourBankBalance: isAdmin,
        canSeeDocuments: isManager,
        canSeeTeamMembers: isManager,
      },
      startedByName: "Admin",
      startedAt: new Date().toISOString(),
    });
    router.push("/portal");
  }

  const admins = contacts.filter((c) =>
    c.portalAccess?.portalRole === "ADMIN" || c.portalAccess?.portalRole === "MANAGER",
  );
  const impersonateFiltered = impersonateSearch
    ? contacts.filter((c) =>
        `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(impersonateSearch.toLowerCase()),
      )
    : contacts.slice(0, 5);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* 1. ADMINS — always visible */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60">
              <Crown className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">Administrateurs du portail</h3>
              <p className="text-[12px] text-slate-500">Gèrent les utilisateurs, actifs et voient tous les billets</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAdminPicker((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> Ajouter un administrateur
          </button>
          {showAdminPicker && (
            <QuickContactPicker
              contacts={contacts.filter((c) => !admins.some((a) => a.id === c.id))}
              onSelect={(c) => { updateContactRole(c, "ADMIN"); setShowAdminPicker(false); }}
              onClose={() => setShowAdminPicker(false)}
              placeholder="Rechercher un contact à promouvoir administrateur..."
            />
          )}
          {admins.length > 0 ? (
            <div className="space-y-2">
              {admins.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-2.5">
                  <div>
                    <span className="text-[13px] font-medium text-slate-900">{c.firstName} {c.lastName}</span>
                    <span className="text-[12px] text-slate-400 ml-2">{c.email}</span>
                  </div>
                  <Badge variant={ROLE_VARIANTS[c.portalAccess?.portalRole ?? ""] ?? "default"} className="text-[10px]">
                    {ROLE_LABELS[c.portalAccess?.portalRole ?? ""] ?? "Standard"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-slate-400 py-3 text-center">
              Aucun administrateur. Changez le rôle d&apos;un contact dans le tableau ci-dessous.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. APPROVERS — always visible */}
      <OrgApproversSection organizationId={organizationId} organizationName={organizationName} />

      {/* 3. PORTAL CONFIG */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-slate-900">Portail client</h3>
                <p className="text-[12px] text-slate-500">Tous les contacts sont utilisateurs standard par défaut</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => saveConfig({ portalEnabled: !config?.portalEnabled })}
              className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors", config?.portalEnabled ? "bg-blue-600" : "bg-slate-300")}
            >
              <span className={cn("pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow translate-y-0.5 transition-transform", config?.portalEnabled ? "translate-x-[22px]" : "translate-x-0.5")} />
            </button>
          </div>
          {config?.portalEnabled && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Méthodes de connexion</label>
              <div className="flex flex-wrap gap-2">
                {["local", "microsoft", "google"].map((provider) => {
                  const active = config.portalAuthProviders.includes(provider);
                  const labels: Record<string, string> = { local: "Compte local", microsoft: "Microsoft", google: "Google" };
                  return (
                    <button key={provider} type="button"
                      onClick={() => saveConfig({ portalAuthProviders: active ? config.portalAuthProviders.filter((p) => p !== provider) : [...config.portalAuthProviders, provider] })}
                      className={cn("rounded-lg px-3 py-1.5 text-[12px] font-medium ring-1 ring-inset transition-colors", active ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100")}
                    >{labels[provider]}</button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. QUICK IMPERSONATE */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 ring-1 ring-inset ring-emerald-200/60">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">Visualiser le portail</h3>
              <p className="text-[12px] text-slate-500">Voir le portail sous l&apos;identité d&apos;un contact</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input type="text" value={impersonateSearch} onChange={(e) => setImpersonateSearch(e.target.value)}
              placeholder="Rechercher un contact..." className="h-9 w-full pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-[12px] placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <div className="space-y-1">
            {impersonateFiltered.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <span className="text-[12.5px] font-medium text-slate-900">{c.firstName} {c.lastName}</span>
                  <span className="text-[11px] text-slate-400 ml-2">{c.email}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleImpersonate(c)} className="h-7 text-[11px]">
                  <Eye className="h-3 w-3" /> Visualiser
                </Button>
              </div>
            ))}
            {impersonateFiltered.length === 0 && <p className="text-[12px] text-slate-400 py-4 text-center">Aucun contact trouvé</p>}
          </div>
        </CardContent>
      </Card>

      {/* 5. ALL CONTACTS TABLE */}
      <Card className="overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <h3 className="text-[14px] font-semibold text-slate-900 flex items-center gap-2">
            <UserCog className="h-4 w-4 text-slate-500" /> Contacts et rôles
            <span className="text-[11px] font-normal text-slate-400">{contacts.length}</span>
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Rechercher un contact..."
              className="h-8 w-full pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-[12px] placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
                <th className="px-4 py-3 font-medium text-slate-500">Contact</th>
                <th className="px-4 py-3 font-medium text-slate-500">Courriel</th>
                <th className="px-4 py-3 font-medium text-slate-500">Statut</th>
                <th className="px-4 py-3 font-medium text-slate-500">Rôle</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts
                .filter((c) => {
                  if (!contactSearch) return true;
                  const q = contactSearch.toLowerCase();
                  return `${c.firstName} ${c.lastName} ${c.email} ${c.jobTitle ?? ""}`.toLowerCase().includes(q);
                })
                .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"))
                .map((c) => {
                const role = c.portalAccess?.portalRole ?? "STANDARD";
                const status = c.portalStatus ?? (c.isActive ? "active" : "inactive");
                return (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-900">{c.firstName} {c.lastName}</span>
                      {c.jobTitle && <p className="text-[11px] text-slate-400">{c.jobTitle}</p>}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-600">{c.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[status] ?? "default"} className="text-[10.5px]">{STATUS_LABELS[status] ?? status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Select value={role} onValueChange={(v) => updateContactRole(c, v)}>
                        <SelectTrigger className="h-7 w-40 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STANDARD">Utilisateur standard</SelectItem>
                          <SelectItem value="MANAGER">Gestionnaire</SelectItem>
                          <SelectItem value="ADMIN">Administrateur</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditingContact(c)} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {contacts.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-[13px] text-slate-400">Aucun contact.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editingContact && (
        <EditContactPortalModal
          contact={editingContact}
          organizationId={organizationId}
          onClose={() => setEditingContact(null)}
          onSaved={(updated) => { setContacts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))); setEditingContact(null); }}
        />
      )}
    </div>
  );
}

function EditContactPortalModal({ contact, organizationId, onClose, onSaved }: {
  contact: PortalContact; organizationId: string; onClose: () => void; onSaved: (updated: any) => void;
}) {
  const [role, setRole] = useState(contact.portalAccess?.portalRole ?? "STANDARD");
  const [status, setStatus] = useState(contact.portalStatus ?? (contact.isActive ? "active" : "inactive"));
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const body: any = { portalRole: role, portalStatus: status, portalEnabled: true };
    if (password.length >= 6) body.password = password;
    const res = await fetch(`/api/v1/organizations/${organizationId}/portal/contacts/${contact.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) {
      onSaved({ ...contact, portalEnabled: true, portalStatus: status, hasPassword: password.length >= 6 || contact.hasPassword, portalAccess: { ...(contact.portalAccess ?? {}), portalRole: role } });
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-slate-900">{contact.firstName} {contact.lastName}</h2>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Rôle portail</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="STANDARD">Utilisateur standard</SelectItem>
                <SelectItem value="MANAGER">Gestionnaire</SelectItem>
                <SelectItem value="ADMIN">Administrateur</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Statut</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
                <SelectItem value="temporary_departure">Départ temporaire</SelectItem>
                <SelectItem value="partial_departure">Départ partiel</SelectItem>
                <SelectItem value="permanent_departure">Départ permanent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input label="Mot de passe portail (local)" type="password" placeholder={contact.hasPassword ? "Garder l'existant" : "Min. 6 caractères"} value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Button variant="outline" size="sm" onClick={onClose}>Annuler</Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickContactPicker({
  contacts,
  onSelect,
  onClose,
  placeholder,
}: {
  contacts: PortalContact[];
  onSelect: (c: PortalContact) => void;
  onClose: () => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const filtered = contacts
    .filter((c) => {
      if (!q) return true;
      return `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"))
    .slice(0, 8);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-3 space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="h-8 w-full pl-8 pr-3 rounded-md border border-slate-200 bg-white text-[12px] placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
      <div className="space-y-0.5 max-h-40 overflow-y-auto">
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="flex items-center justify-between w-full rounded-md px-2.5 py-1.5 text-left hover:bg-white transition-colors"
          >
            <div>
              <span className="text-[12px] font-medium text-slate-900">{c.firstName} {c.lastName}</span>
              <span className="text-[11px] text-slate-400 ml-2">{c.email}</span>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-[11px] text-slate-400 py-2 text-center">Aucun contact trouvé</p>
        )}
      </div>
      <button type="button" onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-700">
        Fermer
      </button>
    </div>
  );
}
