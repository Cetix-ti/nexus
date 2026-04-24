"use client";

// ============================================================================
// UI Rôles & Permissions — connectée à l'API.
//
// Le composant liste les rôles SYSTÈME (7 valeurs UserRole) et CUSTOM
// (CustomRole), affiche la matrice de permissions du rôle sélectionné,
// et permet :
//   - de créer un rôle custom (clé, libellé, description, couleur, rôle parent),
//   - de supprimer un rôle custom,
//   - de cocher/décocher les permissions et sauvegarder.
//
// Les 3 capacités historiques (finances, billing, purchasing) sont dans
// la catégorie "Accès spéciaux" — même mécanisme que les autres perms.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, Minus, Shield, Crown, UserCog, User, Eye, Plus, Trash2,
  Save, Loader2, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PermissionGroup } from "@/lib/permissions/defs";

interface RoleRow {
  key: string;
  label: string;
  description: string;
  color: string;
  isSystem: boolean;
  parentRole: string | null;
  userCount: number;
  permissionCount: number;
}

// Mapping d'icônes par rôle système connu. Pour les customs, on utilise Shield.
const SYSTEM_ICONS: Record<string, typeof Shield> = {
  SUPER_ADMIN: Crown,
  MSP_ADMIN: Shield,
  SUPERVISOR: UserCog,
  TECHNICIAN: User,
  CLIENT_ADMIN: UserCog,
  CLIENT_USER: User,
  READ_ONLY: Eye,
};

function roleIcon(key: string) {
  return SYSTEM_ICONS[key] ?? Shield;
}

export function RolesSection() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [initialPerms, setInitialPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Initial load : rôles + catalogue de permissions.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [rolesRes, permsRes] = await Promise.all([
          fetch("/api/v1/roles"),
          fetch("/api/v1/permissions"),
        ]);
        if (!rolesRes.ok) throw new Error(`roles ${rolesRes.status}`);
        if (!permsRes.ok) throw new Error(`permissions ${permsRes.status}`);
        const rolesJson = await rolesRes.json();
        const permsJson = await permsRes.json();
        if (cancelled) return;
        setRoles(rolesJson.roles ?? []);
        setGroups(permsJson.groups ?? []);
        setSelectedRole((prev) => prev ?? rolesJson.roles?.[0]?.key ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Load permissions du rôle sélectionné.
  const loadRolePerms = useCallback(async (key: string) => {
    try {
      const res = await fetch(`/api/v1/roles/${encodeURIComponent(key)}/permissions`);
      if (!res.ok) return;
      const json = await res.json();
      const set = new Set<string>(json.permissions ?? []);
      setSelectedPerms(set);
      setInitialPerms(new Set(set));
    } catch {/* ignore */}
  }, []);
  useEffect(() => {
    if (selectedRole) loadRolePerms(selectedRole);
  }, [selectedRole, loadRolePerms]);

  const selected = useMemo(
    () => roles.find((r) => r.key === selectedRole) ?? null,
    [roles, selectedRole],
  );

  const hasChanges = useMemo(() => {
    if (selectedPerms.size !== initialPerms.size) return true;
    for (const p of selectedPerms) if (!initialPerms.has(p)) return true;
    return false;
  }, [selectedPerms, initialPerms]);

  function togglePerm(permKey: string) {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permKey)) next.delete(permKey);
      else next.add(permKey);
      return next;
    });
  }

  async function saveMatrix() {
    if (!selected) return;
    setSavingMatrix(true);
    try {
      const res = await fetch(`/api/v1/roles/${encodeURIComponent(selected.key)}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: Array.from(selectedPerms) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Échec : ${data.error ?? res.status}`);
        return;
      }
      setInitialPerms(new Set(selectedPerms));
      // Refresh role list pour actualiser permissionCount.
      const r = await fetch("/api/v1/roles");
      if (r.ok) {
        const j = await r.json();
        setRoles(j.roles ?? []);
      }
    } finally {
      setSavingMatrix(false);
    }
  }

  async function deleteRole(key: string) {
    if (!confirm(`Supprimer le rôle « ${key} » ?`)) return;
    const res = await fetch(`/api/v1/roles/${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Échec : ${data.error ?? res.status}`);
      return;
    }
    setRoles((prev) => prev.filter((r) => r.key !== key));
    if (selectedRole === key) setSelectedRole(roles[0]?.key ?? null);
  }

  async function createRole(input: {
    key: string; label: string; description?: string; color?: string; parentRole?: string;
  }) {
    const res = await fetch("/api/v1/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Échec : ${data.error ?? res.status}`);
      return;
    }
    const created = await res.json();
    setRoles((prev) => [...prev, created]);
    setSelectedRole(created.key);
    setShowCreate(false);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-[13px]">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des rôles…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Rôles & Permissions</h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Gérez les rôles et leurs accès. Les tags d&apos;accès spéciaux
            (finances, facturation, achats) sont dans la catégorie
            «&nbsp;Accès spéciaux&nbsp;» ci-dessous.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" /> Nouveau rôle
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {/* Liste des rôles */}
        <Card>
          <CardContent className="p-2">
            <div className="space-y-1">
              {roles.map((r) => {
                const Icon = roleIcon(r.key);
                const isActive = selectedRole === r.key;
                return (
                  <div key={r.key} className="group relative">
                    <button
                      onClick={() => setSelectedRole(r.key)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg p-3 text-left transition-all",
                        isActive ? "bg-blue-50 ring-1 ring-blue-200/60" : "hover:bg-slate-50",
                      )}
                    >
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ring-1 ring-inset"
                        style={{
                          backgroundColor: r.color + "12",
                          color: r.color,
                          boxShadow: `inset 0 0 0 1px ${r.color}30`,
                        }}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2.25} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "text-[13px] font-semibold truncate",
                            isActive ? "text-blue-700" : "text-slate-900",
                          )}>{r.label}</span>
                          {r.isSystem ? (
                            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Système</span>
                          ) : (
                            <span className="text-[9px] text-violet-500 uppercase tracking-wider">Custom</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {r.isSystem
                            ? `${r.userCount} utilisateur${r.userCount > 1 ? "s" : ""} · ${r.permissionCount} perms`
                            : `${r.permissionCount} perms`}
                        </p>
                      </div>
                    </button>
                    {!r.isSystem && (
                      <button
                        onClick={() => deleteRole(r.key)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-50 text-red-500"
                        title="Supprimer ce rôle custom"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Matrice du rôle sélectionné */}
        <div className="space-y-4">
          {!selected ? (
            <p className="text-[13px] text-slate-500">Sélectionnez un rôle pour voir ses permissions.</p>
          ) : (
            <>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-inset"
                      style={{
                        backgroundColor: selected.color + "12",
                        color: selected.color,
                        boxShadow: `inset 0 0 0 1px ${selected.color}30`,
                      }}
                    >
                      {(() => { const Icon = roleIcon(selected.key); return <Icon className="h-5 w-5" strokeWidth={2.25} />; })()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[16px] font-semibold text-slate-900">{selected.label}</h3>
                        {selected.isSystem
                          ? <Badge variant="default">Rôle système</Badge>
                          : <Badge variant="default">Rôle custom</Badge>}
                        {selected.parentRole && (
                          <Badge variant="default">Hérite&nbsp;: {selected.parentRole}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13px] text-slate-500">{selected.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Permissions</p>
                        <p className="text-[20px] font-semibold tabular-nums text-slate-900">{selectedPerms.size}</p>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={saveMatrix}
                        disabled={!hasChanges || savingMatrix}
                      >
                        {savingMatrix
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Save className="h-3.5 w-3.5" />}
                        Sauvegarder
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {groups.map((group) => (
                <Card key={group.category}>
                  <CardContent className="p-0">
                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40">
                      <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-600">
                        {group.category}
                      </h4>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.permissions.map((perm) => {
                        const granted = selectedPerms.has(perm.key);
                        return (
                          <div
                            key={perm.key}
                            className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/60 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-slate-800">{perm.label}</p>
                              <p className="text-[11.5px] text-slate-500 mt-0.5">{perm.description}</p>
                            </div>
                            <button
                              onClick={() => togglePerm(perm.key)}
                              className={cn(
                                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
                                granted ? "bg-blue-600" : "bg-slate-300",
                              )}
                            >
                              <span
                                className={cn(
                                  "pointer-events-none inline-flex items-center justify-center h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform",
                                  granted ? "translate-x-[18px]" : "translate-x-0.5",
                                  "translate-y-0.5",
                                )}
                              >
                                {granted
                                  ? <Check className="h-2.5 w-2.5 text-blue-600" strokeWidth={3} />
                                  : <Minus className="h-2.5 w-2.5 text-slate-400" strokeWidth={3} />}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onCreate={createRole}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale "Nouveau rôle"
// ---------------------------------------------------------------------------
function CreateRoleModal({
  onClose, onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { key: string; label: string; description?: string; color?: string; parentRole?: string }) => Promise<void> | void;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#64748B");
  const [parentRole, setParentRole] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!key.trim() || !label.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        key: key.trim(),
        label: label.trim(),
        description: description.trim() || undefined,
        color,
        parentRole: parentRole || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-xl my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">Nouveau rôle</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Clé *"
              placeholder="ex: comptable_senior"
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              required
            />
            <Input
              label="Libellé *"
              placeholder="Ex : Comptable senior"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="À quoi sert ce rôle ?"
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-slate-700 mb-1">Couleur</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-700 mb-1">Rôle parent (hiérarchie)</label>
              <Select value={parentRole || "__none__"} onValueChange={(v) => setParentRole(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="MSP_ADMIN">Admin MSP</SelectItem>
                  <SelectItem value="SUPERVISOR">Superviseur</SelectItem>
                  <SelectItem value="TECHNICIAN">Technicien</SelectItem>
                  <SelectItem value="CLIENT_ADMIN">Client admin</SelectItem>
                  <SelectItem value="CLIENT_USER">Utilisateur client</SelectItem>
                  <SelectItem value="READ_ONLY">Lecture seule</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11.5px] text-slate-500 leading-relaxed">
            La clé doit être unique, en minuscules, et ne contenir que
            lettres, chiffres et underscores. Après création, octroie
            les permissions depuis la matrice.
          </p>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" variant="primary" disabled={submitting || !key.trim() || !label.trim()}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Créer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
