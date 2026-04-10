"use client";

import { useState, useEffect } from "react";
import { X, ShieldCheck, Mail, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PORTAL_ROLE_LABELS,
  DEFAULT_VIEWER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  type ClientPortalPermissions,
} from "@/lib/projects/types";

export interface PortalAccessUser {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: ClientPortalPermissions["portalRole"];
  canSeeAllTickets?: boolean;
  canSeeProjects?: boolean;
  canSeeReports?: boolean;
  canSeeTeam?: boolean;
  lastLogin?: string;
}

interface EditPortalAccessModalProps {
  open: boolean;
  user: PortalAccessUser | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<PortalAccessUser> & {
    permissions?: Omit<ClientPortalPermissions, "contactId" | "organizationId">;
  }) => void;
}

type PermKey = keyof Omit<ClientPortalPermissions, "contactId" | "organizationId" | "portalRole">;

interface PermDef {
  key: PermKey;
  label: string;
  description: string;
  category: "Accès" | "Tickets" | "Projets" | "Rapports" | "Documents" | "Équipe";
}

const PERMISSIONS: PermDef[] = [
  { key: "canAccessPortal", label: "Accès au portail", description: "Permet à l'utilisateur de se connecter au portail client", category: "Accès" },
  { key: "canSeeOwnTickets", label: "Voir ses propres billets", description: "Voir les billets dont il est le demandeur", category: "Tickets" },
  { key: "canSeeAllOrganizationTickets", label: "Voir tous les billets de l'organisation", description: "Voir l'ensemble des billets de son entreprise", category: "Tickets" },
  { key: "canCreateTickets", label: "Créer des billets", description: "Soumettre de nouveaux billets via le portail", category: "Tickets" },
  { key: "canSeeProjects", label: "Voir les projets", description: "Voir la liste des projets visibles client", category: "Projets" },
  { key: "canSeeProjectDetails", label: "Voir les détails des projets", description: "Accéder aux phases, jalons et tâches", category: "Projets" },
  { key: "canSeeProjectTasks", label: "Voir les tâches", description: "Voir le détail des tâches visibles client", category: "Projets" },
  { key: "canSeeProjectLinkedTickets", label: "Voir les billets liés aux projets", description: "Voir les billets associés à un projet", category: "Projets" },
  { key: "canSeeReports", label: "Voir les rapports", description: "Accès à la section rapports du portail", category: "Rapports" },
  { key: "canSeeBillingReports", label: "Voir les rapports de facturation", description: "Voir les montants facturables et préfacturation", category: "Rapports" },
  { key: "canSeeTimeReports", label: "Voir les rapports de temps", description: "Voir les heures consommées par projet/billet", category: "Rapports" },
  { key: "canSeeHourBankBalance", label: "Voir le solde de la banque d'heures", description: "Voir les heures restantes de la banque", category: "Rapports" },
  { key: "canSeeDocuments", label: "Voir les documents", description: "Accéder aux documents partagés (à venir)", category: "Documents" },
  { key: "canSeeTeamMembers", label: "Voir les membres de l'équipe Cetix", description: "Voir les techniciens MSP assignés", category: "Équipe" },
];

const CATEGORIES: PermDef["category"][] = [
  "Accès",
  "Tickets",
  "Projets",
  "Rapports",
  "Documents",
  "Équipe",
];

function buildPermissionsFromUser(user: PortalAccessUser | null): Omit<ClientPortalPermissions, "contactId" | "organizationId"> {
  if (!user) return DEFAULT_VIEWER_PERMISSIONS;
  // If user has explicit perm flags, use them; otherwise use the role default
  const base =
    user.role === "admin"
      ? DEFAULT_ADMIN_PERMISSIONS
      : user.role === "manager"
      ? DEFAULT_MANAGER_PERMISSIONS
      : DEFAULT_VIEWER_PERMISSIONS;
  return {
    ...base,
    canSeeAllOrganizationTickets:
      user.canSeeAllTickets ?? base.canSeeAllOrganizationTickets,
    canSeeProjects: user.canSeeProjects ?? base.canSeeProjects,
    canSeeReports: user.canSeeReports ?? base.canSeeReports,
    canSeeTeamMembers: user.canSeeTeam ?? base.canSeeTeamMembers,
  };
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
        checked ? "bg-blue-600" : "bg-slate-300",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform translate-y-0.5",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function EditPortalAccessModal({
  open,
  user,
  onClose,
  onSave,
}: EditPortalAccessModalProps) {
  const [role, setRole] = useState<ClientPortalPermissions["portalRole"]>("viewer");
  const [permissions, setPermissions] = useState<
    Omit<ClientPortalPermissions, "contactId" | "organizationId">
  >(DEFAULT_VIEWER_PERMISSIONS);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Detect "create mode" — when name/email are empty
  const isCreateMode = !!user && (!user.name || !user.email);

  useEffect(() => {
    if (user) {
      setRole(user.role);
      setPermissions(buildPermissionsFromUser(user));
      setName(user.name || "");
      setEmail(user.email || "");
    }
  }, [user?.id]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open || !user) return null;

  function handleRoleChange(newRole: string) {
    const r = newRole as ClientPortalPermissions["portalRole"];
    setRole(r);
    // Apply preset
    const preset =
      r === "admin"
        ? DEFAULT_ADMIN_PERMISSIONS
        : r === "manager"
        ? DEFAULT_MANAGER_PERMISSIONS
        : DEFAULT_VIEWER_PERMISSIONS;
    setPermissions({ ...preset, portalRole: r });
  }

  function togglePerm(key: PermKey) {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function handleSave() {
    if (!user) return;
    if (isCreateMode && (!name.trim() || !email.trim())) {
      return; // can't create without name + email
    }
    onSave(user.id, {
      name: name || user.name,
      email: email || user.email,
      role,
      canSeeAllTickets: permissions.canSeeAllOrganizationTickets,
      canSeeProjects: permissions.canSeeProjects,
      canSeeReports: permissions.canSeeReports,
      canSeeTeam: permissions.canSeeTeamMembers,
      permissions: { ...permissions, portalRole: role },
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60 shrink-0">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {isCreateMode
                  ? "Ajouter un utilisateur au portail"
                  : "Permissions portail"}
              </h2>
              <p className="text-[12.5px] text-slate-500 truncate">
                {isCreateMode
                  ? `Nouvel accès pour ${user.organization}`
                  : `${user.name} — ${user.organization}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* User card */}
          {isCreateMode ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Nom complet
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Marie Tremblay"
                    className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Adresse courriel
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="marie@acme.com"
                    className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
              <p className="text-[11px] text-blue-900 inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Organisation : <strong>{user.organization}</strong>
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[12px] font-semibold ring-2 ring-white shadow-sm shrink-0">
                  {getInitials(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-slate-900 truncate">
                    {user.name}
                  </p>
                  <div className="mt-0.5 flex items-center gap-3 text-[11.5px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {user.email}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {user.organization}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Role selector */}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Rôle dans le portail
            </label>
            <Select value={role} onValueChange={handleRoleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PORTAL_ROLE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[11.5px] text-slate-500">
              Le choix d&apos;un rôle applique automatiquement un ensemble de
              permissions par défaut. Vous pouvez ajuster chaque permission
              individuellement ci-dessous.
            </p>
          </div>

          {/* Granular permissions by category */}
          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const perms = PERMISSIONS.filter((p) => p.category === cat);
              if (perms.length === 0) return null;
              return (
                <div
                  key={cat}
                  className="rounded-xl border border-slate-200/80 bg-white"
                >
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/40 rounded-t-xl">
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600">
                      {cat}
                    </h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {perms.map((perm) => {
                      const isChecked = permissions[perm.key] as boolean;
                      const isAccess = perm.key === "canAccessPortal";
                      return (
                        <div
                          key={perm.key}
                          className="flex items-center justify-between gap-4 px-4 py-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-slate-800">
                              {perm.label}
                            </p>
                            <p className="text-[11.5px] text-slate-500 mt-0.5">
                              {perm.description}
                            </p>
                          </div>
                          <Toggle
                            checked={isChecked}
                            onChange={() => togglePerm(perm.key)}
                            disabled={!permissions.canAccessPortal && !isAccess}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {isCreateMode ? "Ajouter" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
