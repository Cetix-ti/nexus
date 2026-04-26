"use client";

// ============================================================================
// OrgModulesSection — toggles d'activation des modules pour un client
// (Phase 10F). Stocké sur Organization.enabledModules. Drive l'affichage
// des sections du portail client.
//
// Édition réservée aux MSP_ADMIN+. Affichage lecture seule pour les autres.
// ============================================================================

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { usePermission } from "@/components/auth/permission-gate";

const MODULES = [
  { id: "monitoring", label: "Monitoring (Veeam, Bitdefender, etc.)", desc: "Alertes en temps réel des sources externes." },
  { id: "backups", label: "Sauvegardes", desc: "Historique et statut des sauvegardes Veeam." },
  { id: "security_center", label: "Centre de sécurité", desc: "Tableau de bord cybersécurité (incidents, vulnérabilités)." },
  { id: "kb", label: "Base de connaissances", desc: "Articles et procédures partagés." },
  { id: "assets", label: "Actifs / inventaire", desc: "Liste des équipements, garanties, fin de vie." },
  { id: "billing_reports", label: "Rapports de facturation", desc: "Rapports mensuels exportables au portail client." },
  { id: "tickets", label: "Tickets", desc: "Création/suivi de billets via le portail." },
] as const;

const ALL_IDS = MODULES.map((m) => m.id);

interface Props {
  organizationId: string;
  initialEnabledModules: string[];
}

export function OrgModulesSection({ organizationId, initialEnabledModules }: Props) {
  // Liste vide = tous activés (rétrocompat). On normalise pour l'UI :
  // si vide on coche tout par défaut.
  const initial =
    initialEnabledModules.length === 0
      ? new Set<string>(ALL_IDS)
      : new Set<string>(initialEnabledModules);
  const [enabled, setEnabled] = useState<Set<string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const { allowed: canEdit } = usePermission({ minRole: "MSP_ADMIN" });

  function toggle(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const dirty = (() => {
    const cur = enabled;
    if (cur.size !== initial.size) return true;
    for (const id of cur) if (!initial.has(id)) return true;
    return false;
  })();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Payload : si TOUS les modules sont cochés, on stocke [] (= tous
      // actifs). Sinon liste explicite.
      const list = Array.from(enabled);
      const payload =
        list.length === ALL_IDS.length ? [] : list;
      const r = await fetch(`/api/v1/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledModules: payload }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSavedAt(new Date().toLocaleTimeString("fr-CA"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Modules actifs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[12.5px] text-slate-500">
          Détermine les sections affichées dans le portail client. Les
          contacts gardent leurs permissions individuelles, mais une
          section désactivée ici reste cachée pour tous les contacts de
          ce client. Vide ou tout coché = comportement par défaut (tous
          les modules visibles).
        </p>
        <div className="divide-y divide-slate-100">
          {MODULES.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-slate-900">{m.label}</p>
                <p className="mt-0.5 text-[11.5px] text-slate-500 leading-relaxed">{m.desc}</p>
              </div>
              <Switch
                checked={enabled.has(m.id)}
                onCheckedChange={() => toggle(m.id)}
                disabled={!canEdit || saving}
              />
            </div>
          ))}
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
            {error}
          </div>
        )}
        {canEdit && (
          <div className="flex items-center justify-end gap-2 pt-2">
            {savedAt && !dirty && (
              <span className="text-[11px] text-emerald-600">Enregistré à {savedAt}</span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={save}
              disabled={saving || !dirty}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Enregistrer
            </Button>
          </div>
        )}
        {!canEdit && (
          <p className="text-[11.5px] italic text-slate-400 pt-2">
            Lecture seule — seul un admin MSP peut modifier les modules.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
