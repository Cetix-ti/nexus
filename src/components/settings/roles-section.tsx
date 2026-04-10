"use client";

import { useState } from "react";
import { Check, Minus, Shield, Crown, UserCog, User, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Permission {
  key: string;
  label: string;
  description: string;
}

interface PermissionGroup {
  category: string;
  permissions: Permission[];
}

interface Role {
  key: string;
  label: string;
  description: string;
  icon: typeof Shield;
  color: string;
  userCount: number;
  isSystem: boolean;
}

const ROLES: Role[] = [
  {
    key: "super_admin",
    label: "Super Admin",
    description: "Accès total à toutes les fonctionnalités et organisations",
    icon: Crown,
    color: "#DC2626",
    userCount: 1,
    isSystem: true,
  },
  {
    key: "msp_admin",
    label: "Admin MSP",
    description: "Administration de la plateforme MSP",
    icon: Shield,
    color: "#7C3AED",
    userCount: 3,
    isSystem: true,
  },
  {
    key: "supervisor",
    label: "Superviseur",
    description: "Supervise une équipe de techniciens",
    icon: UserCog,
    color: "#2563EB",
    userCount: 5,
    isSystem: true,
  },
  {
    key: "technician",
    label: "Technicien",
    description: "Traite les tickets des clients",
    icon: User,
    color: "#10B981",
    userCount: 18,
    isSystem: true,
  },
  {
    key: "client_admin",
    label: "Admin Client",
    description: "Administre les utilisateurs d'une organisation cliente",
    icon: UserCog,
    color: "#F59E0B",
    userCount: 12,
    isSystem: true,
  },
  {
    key: "client_user",
    label: "Utilisateur Client",
    description: "Soumet et suit ses propres tickets",
    icon: User,
    color: "#06B6D4",
    userCount: 156,
    isSystem: true,
  },
  {
    key: "read_only",
    label: "Lecture seule",
    description: "Consulte sans modifier",
    icon: Eye,
    color: "#64748B",
    userCount: 4,
    isSystem: true,
  },
];

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    category: "Tickets",
    permissions: [
      { key: "tickets.view", label: "Voir les tickets", description: "Consulter la liste des tickets" },
      { key: "tickets.view_all", label: "Voir tous les tickets", description: "Voir les tickets de toutes les organisations" },
      { key: "tickets.create", label: "Créer un ticket", description: "Créer de nouveaux tickets" },
      { key: "tickets.update", label: "Modifier un ticket", description: "Modifier les détails d'un ticket" },
      { key: "tickets.delete", label: "Supprimer un ticket", description: "Supprimer des tickets" },
      { key: "tickets.assign", label: "Assigner un ticket", description: "Affecter des tickets à des techniciens" },
      { key: "tickets.merge", label: "Fusionner des tickets", description: "Fusionner plusieurs tickets" },
      { key: "tickets.bulk_actions", label: "Actions en lot", description: "Modifier plusieurs tickets simultanément" },
    ],
  },
  {
    category: "Organisations",
    permissions: [
      { key: "orgs.view", label: "Voir les organisations", description: "Consulter la liste des organisations" },
      { key: "orgs.create", label: "Créer une organisation", description: "Ajouter de nouvelles organisations" },
      { key: "orgs.update", label: "Modifier une organisation", description: "Modifier les détails d'une organisation" },
      { key: "orgs.delete", label: "Supprimer une organisation", description: "Supprimer des organisations" },
    ],
  },
  {
    category: "Utilisateurs",
    permissions: [
      { key: "users.view", label: "Voir les utilisateurs", description: "Consulter la liste des utilisateurs" },
      { key: "users.create", label: "Créer un utilisateur", description: "Inviter de nouveaux utilisateurs" },
      { key: "users.update", label: "Modifier un utilisateur", description: "Modifier les profils utilisateurs" },
      { key: "users.delete", label: "Supprimer un utilisateur", description: "Supprimer des utilisateurs" },
      { key: "users.assign_roles", label: "Assigner des rôles", description: "Modifier les rôles des utilisateurs" },
    ],
  },
  {
    category: "Configuration",
    permissions: [
      { key: "settings.general", label: "Paramètres généraux", description: "Modifier les paramètres globaux" },
      { key: "settings.sla", label: "Gérer les SLA", description: "Créer et modifier les politiques SLA" },
      { key: "settings.categories", label: "Gérer les catégories", description: "Créer et modifier les catégories" },
      { key: "settings.queues", label: "Gérer les files d'attente", description: "Créer et modifier les files" },
      { key: "settings.automations", label: "Gérer les automatisations", description: "Créer des règles d'automatisation" },
      { key: "settings.integrations", label: "Gérer les intégrations", description: "Configurer les intégrations externes" },
    ],
  },
  {
    category: "Rapports",
    permissions: [
      { key: "reports.view", label: "Voir les rapports", description: "Consulter les rapports et tableaux de bord" },
      { key: "reports.export", label: "Exporter des rapports", description: "Télécharger des rapports en PDF/CSV" },
      { key: "reports.create", label: "Créer des rapports", description: "Créer des rapports personnalisés" },
    ],
  },
];

// Permission matrix: which roles have which permissions
const PERMISSIONS_MATRIX: Record<string, Set<string>> = {
  super_admin: new Set([
    "tickets.view", "tickets.view_all", "tickets.create", "tickets.update", "tickets.delete", "tickets.assign", "tickets.merge", "tickets.bulk_actions",
    "orgs.view", "orgs.create", "orgs.update", "orgs.delete",
    "users.view", "users.create", "users.update", "users.delete", "users.assign_roles",
    "settings.general", "settings.sla", "settings.categories", "settings.queues", "settings.automations", "settings.integrations",
    "reports.view", "reports.export", "reports.create",
  ]),
  msp_admin: new Set([
    "tickets.view", "tickets.view_all", "tickets.create", "tickets.update", "tickets.delete", "tickets.assign", "tickets.merge", "tickets.bulk_actions",
    "orgs.view", "orgs.create", "orgs.update",
    "users.view", "users.create", "users.update", "users.assign_roles",
    "settings.general", "settings.sla", "settings.categories", "settings.queues", "settings.automations",
    "reports.view", "reports.export", "reports.create",
  ]),
  supervisor: new Set([
    "tickets.view", "tickets.view_all", "tickets.create", "tickets.update", "tickets.assign", "tickets.merge", "tickets.bulk_actions",
    "orgs.view",
    "users.view",
    "reports.view", "reports.export",
  ]),
  technician: new Set([
    "tickets.view", "tickets.view_all", "tickets.create", "tickets.update", "tickets.assign",
    "orgs.view",
    "users.view",
    "reports.view",
  ]),
  client_admin: new Set([
    "tickets.view", "tickets.create", "tickets.update",
    "users.view", "users.create", "users.update",
    "reports.view",
  ]),
  client_user: new Set([
    "tickets.view", "tickets.create",
  ]),
  read_only: new Set([
    "tickets.view", "tickets.view_all",
    "orgs.view",
    "users.view",
    "reports.view",
  ]),
};

export function RolesSection() {
  const [selectedRole, setSelectedRole] = useState<string>("technician");
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>(() => {
    const copy: Record<string, Set<string>> = {};
    Object.entries(PERMISSIONS_MATRIX).forEach(([k, v]) => {
      copy[k] = new Set(v);
    });
    return copy;
  });

  const role = ROLES.find((r) => r.key === selectedRole)!;
  const Icon = role.icon;

  function togglePermission(roleKey: string, permKey: string) {
    setMatrix((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleKey]);
      if (set.has(permKey)) set.delete(permKey);
      else set.add(permKey);
      next[roleKey] = set;
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
          Rôles & Permissions
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Gérez les rôles et leurs permissions d&apos;accès dans la plateforme
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {/* Roles list */}
        <Card>
          <CardContent className="p-2">
            <div className="space-y-1">
              {ROLES.map((r) => {
                const RIcon = r.icon;
                const isActive = selectedRole === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => setSelectedRole(r.key)}
                    className={`w-full flex items-center gap-3 rounded-lg p-3 text-left transition-all ${
                      isActive
                        ? "bg-blue-50 ring-1 ring-blue-200/60"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ring-1 ring-inset"
                      style={{
                        backgroundColor: r.color + "12",
                        color: r.color,
                        boxShadow: `inset 0 0 0 1px ${r.color}30`,
                      }}
                    >
                      <RIcon className="h-4 w-4" strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[13px] font-semibold ${
                            isActive ? "text-blue-700" : "text-slate-900"
                          }`}
                        >
                          {r.label}
                        </span>
                        {r.isSystem && (
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider">
                            Système
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {r.userCount} utilisateur{r.userCount > 1 ? "s" : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Permissions matrix */}
        <div className="space-y-4">
          {/* Selected role header */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-inset"
                  style={{
                    backgroundColor: role.color + "12",
                    color: role.color,
                    boxShadow: `inset 0 0 0 1px ${role.color}30`,
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.25} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-slate-900">
                      {role.label}
                    </h3>
                    {role.isSystem && (
                      <Badge variant="default">Rôle système</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    {role.description}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                    Permissions
                  </p>
                  <p className="text-[20px] font-semibold tabular-nums text-slate-900">
                    {matrix[role.key]?.size || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Permission groups */}
          {PERMISSION_GROUPS.map((group) => (
            <Card key={group.category}>
              <CardContent className="p-0">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40">
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">
                    {group.category}
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.permissions.map((perm) => {
                    const granted = matrix[role.key]?.has(perm.key);
                    return (
                      <div
                        key={perm.key}
                        className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/60 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-slate-800">
                            {perm.label}
                          </p>
                          <p className="text-[11.5px] text-slate-500 mt-0.5">
                            {perm.description}
                          </p>
                        </div>
                        <button
                          onClick={() => togglePermission(role.key, perm.key)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                            granted ? "bg-blue-600" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-flex items-center justify-center h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                              granted ? "translate-x-[18px]" : "translate-x-0.5"
                            } translate-y-0.5`}
                          >
                            {granted ? (
                              <Check className="h-2.5 w-2.5 text-blue-600" strokeWidth={3} />
                            ) : (
                              <Minus className="h-2.5 w-2.5 text-slate-400" strokeWidth={3} />
                            )}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
