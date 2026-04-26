"use client";

// ============================================================================
// UserOrgScopeSection — Édite la liste des organisations accessibles à un
// agent. Empty list = accès complet (default). 1+ orgs = restreint.
//
// Source de vérité : table UserOrganizationScope. API GET/PUT
// /api/v1/users/[id]/org-scopes.
//
// Self-contained : charge sa propre liste, persiste à son propre bouton.
// Permet de modifier le périmètre d'un agent sans avoir à submit l'ensemble
// du formulaire utilisateur.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Loader2, Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
}

interface ScopeRow {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  permission: string;
}

interface Props {
  userId: string;
  /** Rôle système — un SUPER_ADMIN ne peut pas être restreint. */
  userRole: string;
}

export function UserOrgScopeSection({ userId, userRole }: Props) {
  const isSuperAdmin = userRole === "SUPER_ADMIN";
  const [allOrgs, setAllOrgs] = useState<OrgRow[]>([]);
  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch("/api/v1/organizations").then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/v1/users/${userId}/org-scopes`).then((r) =>
        r.ok ? r.json() : { data: [] },
      ),
    ])
      .then(([orgs, scopesRes]) => {
        if (cancelled) return;
        const orgList: OrgRow[] = Array.isArray(orgs)
          ? orgs.map((o: { id: string; name: string; slug?: string }) => ({
              id: o.id,
              name: o.name,
              slug: o.slug ?? "",
            }))
          : [];
        orgList.sort((a, b) => a.name.localeCompare(b.name, "fr-CA"));
        setAllOrgs(orgList);
        const scopeList: ScopeRow[] = Array.isArray(scopesRes?.data)
          ? scopesRes.data
          : [];
        setScopes(scopeList);
        setSelectedIds(new Set(scopeList.map((s) => s.organizationId)));
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les organisations");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isSuperAdmin]);

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOrgs;
    return allOrgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q),
    );
  }, [allOrgs, search]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/users/${userId}/org-scopes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationIds: Array.from(selectedIds),
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `Erreur HTTP ${r.status}`);
      }
      const data = await r.json();
      setScopes(Array.isArray(data?.data) ? data.data : []);
      setSavedAt(new Date().toLocaleTimeString("fr-CA"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleClearAll() {
    setSelectedIds(new Set());
  }

  if (isSuperAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-[12px] text-amber-900 leading-relaxed">
        <strong>Super admin</strong> — accès complet à toutes les organisations
        par définition. Le scoping ne s&apos;applique pas à ce rôle.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-[12px] text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Chargement des organisations…
      </div>
    );
  }

  const isFullAccess = selectedIds.size === 0;
  const dirty = (() => {
    const current = new Set(scopes.map((s) => s.organizationId));
    if (current.size !== selectedIds.size) return true;
    for (const id of selectedIds) if (!current.has(id)) return true;
    return false;
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-slate-700 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-blue-600" />
            Organisations accessibles
          </p>
          <p className="text-[11.5px] text-slate-500 mt-0.5 leading-relaxed">
            {isFullAccess
              ? "Aucune restriction — l’agent voit toutes les organisations (par défaut)."
              : `Restreint à ${selectedIds.size} organisation${selectedIds.size > 1 ? "s" : ""} sélectionnée${selectedIds.size > 1 ? "s" : ""}.`}
          </p>
        </div>
        {!isFullAccess && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-[11.5px] text-slate-500 hover:text-blue-600 underline-offset-2 hover:underline whitespace-nowrap"
          >
            Tout réinitialiser (accès complet)
          </button>
        )}
      </div>

      <Input
        type="search"
        placeholder="Rechercher une organisation…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="text-[13px]"
      />

      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        {filteredOrgs.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] text-slate-400">
            Aucune organisation
          </div>
        ) : (
          filteredOrgs.map((o) => {
            const checked = selectedIds.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                  checked
                    ? "bg-blue-50/60 hover:bg-blue-50"
                    : "hover:bg-slate-50",
                )}
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                    checked
                      ? "bg-blue-600 border-blue-600"
                      : "border-slate-300 bg-white",
                  )}
                >
                  {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-slate-800 truncate">
                    {o.name}
                  </p>
                  {o.slug && (
                    <p className="text-[10.5px] text-slate-400 truncate">{o.slug}</p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {savedAt && !dirty && (
          <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            Enregistré à {savedAt}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="gap-1.5"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Enregistrement…
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              Enregistrer le périmètre
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
