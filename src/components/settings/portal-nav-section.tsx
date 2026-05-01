"use client";

// ============================================================================
// PortalNavSection — onglets visibles globalement dans le portail client.
//
// Permet à l'admin MSP de masquer/montrer chaque tab globalement, en plus
// des permissions par-org/par-contact. Contrôle stocké dans
// `tenant_settings` sous la clé `portal.nav`. Lu côté portail au mount du
// layout via /api/v1/portal/nav-settings.
//
// V1 par défaut : home, tickets, approvals, assets, reports, contacts ON.
// Le reste OFF (testés au cas par cas avant ouverture client).
// ============================================================================

import { useEffect, useState } from "react";
import { Loader2, Save, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PortalNavTabs {
  home: boolean;
  tickets: boolean;
  approvals: boolean;
  approvers: boolean;
  assets: boolean;
  projects: boolean;
  reports: boolean;
  finances: boolean;
  contacts: boolean;
  particularities: boolean;
  policies: boolean;
  software: boolean;
  changes: boolean;
  renewals: boolean;
  budget: boolean;
}

const TABS_META: Array<{
  key: keyof PortalNavTabs;
  label: string;
  description: string;
  group: "v1" | "v2" | "experimental";
}> = [
  // V1 — onglets stables, défauts ON
  { key: "home", label: "Accueil", description: "Page d'atterrissage du portail.", group: "v1" },
  { key: "tickets", label: "Billets", description: "Création et suivi des demandes par les clients.", group: "v1" },
  { key: "approvals", label: "Approbations", description: "Workflow d'approbation des billets soumis.", group: "v1" },
  { key: "approvers", label: "Approbateurs (admin)", description: "Gestion de la cascade d'approbateurs (visible aux admins portail uniquement).", group: "v1" },
  { key: "assets", label: "Actifs", description: "Inventaire des actifs visibles par le client.", group: "v1" },
  { key: "reports", label: "Rapports", description: "Rapports mensuels publiés au client.", group: "v1" },
  { key: "contacts", label: "Contacts", description: "Annuaire des contacts de l'organisation.", group: "v1" },
  // V2 — onglets en cours de validation, défauts OFF
  { key: "projects", label: "Projets", description: "Suivi des projets en cours.", group: "v2" },
  { key: "finances", label: "Finances", description: "Vue financière (factures, crédits, banque d'heures).", group: "v2" },
  { key: "particularities", label: "Particularités", description: "Particularités techniques de l'organisation.", group: "v2" },
  { key: "policies", label: "Politiques", description: "Politiques et standards techniques (GPO, scripts).", group: "v2" },
  { key: "software", label: "Logiciels", description: "Catalogue des logiciels installés.", group: "v2" },
  { key: "changes", label: "Changements", description: "Historique des changements appliqués.", group: "v2" },
  { key: "renewals", label: "Échéances", description: "Renouvellements à venir (garanties, abonnements, contrats).", group: "v2" },
  // Expérimental — pas encore prêt
  { key: "budget", label: "Budget TI", description: "Suivi budgétaire annuel — en développement.", group: "experimental" },
];

const GROUP_LABELS: Record<typeof TABS_META[number]["group"], string> = {
  v1: "Stable — V1",
  v2: "En validation — à activer au cas par cas",
  experimental: "Expérimental",
};

export function PortalNavSection() {
  const [tabs, setTabs] = useState<PortalNavTabs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/portal/nav-settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setTabs(d.tabs as PortalNavTabs))
      .catch((e) => setError(`Erreur ${e}`))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: keyof PortalNavTabs) {
    setTabs((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev));
  }

  async function save() {
    if (!tabs) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/settings/portal-nav", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabs }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${r.status}`);
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }
  if (!tabs) {
    return (
      <Card>
        <CardContent className="p-6 text-[13px] text-red-700">{error ?? "Erreur de chargement"}</CardContent>
      </Card>
    );
  }

  const groups: Array<typeof TABS_META[number]["group"]> = ["v1", "v2", "experimental"];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[15px] flex items-center gap-2">
            <Eye className="h-4 w-4 text-cyan-600" />
            Onglets visibles dans le portail client
          </CardTitle>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Contrôle global de la visibilité des onglets du portail. Une tab masquée ici n&apos;apparaît JAMAIS dans le menu, peu importe les permissions de l&apos;utilisateur ou son rôle (ADMIN/STANDARD).
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {groups.map((g) => (
            <div key={g}>
              <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                {GROUP_LABELS[g]}
              </h4>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {TABS_META.filter((t) => t.group === g).map((t) => (
                  <div key={t.key} className="flex items-start justify-between gap-3 p-3">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      {tabs[t.key] ? (
                        <Eye className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-900">{t.label}</p>
                        <p className="text-[11.5px] text-slate-500">{t.description}</p>
                      </div>
                    </div>
                    <Toggle checked={tabs[t.key]} onChange={() => toggle(t.key)} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            {savedFlash ? (
              <span className="text-[12.5px] text-emerald-700 font-medium">✓ Sauvegardé</span>
            ) : error ? (
              <span className="text-[12.5px] text-red-700">{error}</span>
            ) : (
              <span className="text-[12px] text-slate-400">Effet immédiat sur tous les portails clients après sauvegarde.</span>
            )}
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Sauvegarder
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-emerald-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        } translate-y-0.5`}
      />
    </button>
  );
}
