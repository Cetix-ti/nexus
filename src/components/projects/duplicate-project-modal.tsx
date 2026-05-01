"use client";

// ============================================================================
// DuplicateProjectModal — modale "Dupliquer ce projet vers un autre client".
//
// Permet de recréer rapidement un projet similaire pour un autre client.
// Le serveur clone : project + phases + milestones + tasks + tickets
// (au choix). Pas de comments / time entries / activity log (cloisonnement
// client A → B). L'agent est mis comme manager du nouveau projet ;
// dates/dépenses reset.
// ============================================================================

import { useEffect, useState } from "react";
import { Loader2, Copy, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OrgOption { id: string; name: string; clientCode: string | null }

export function DuplicateProjectModal({
  open, onClose, sourceProjectId, sourceProjectName,
}: {
  open: boolean;
  onClose: () => void;
  sourceProjectId: string;
  sourceProjectName: string;
}) {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [targetOrgId, setTargetOrgId] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [includeTickets, setIncludeTickets] = useState(true);
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includePhases, setIncludePhases] = useState(true);
  const [includeMilestones, setIncludeMilestones] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(`${sourceProjectName} (copie)`);
    fetch("/api/v1/organizations?active=true&take=500")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
        setOrgs(
          list
            .filter((o: { id?: string; name?: string }) => o.id && o.name)
            .map((o: { id: string; name: string; clientCode?: string | null }) => ({
              id: o.id,
              name: o.name,
              clientCode: o.clientCode ?? null,
            }))
            .sort((a: OrgOption, b: OrgOption) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {});
  }, [open, sourceProjectName]);

  if (!open) return null;

  async function submit() {
    if (!targetOrgId || !name.trim()) {
      setError("Sélectionnez l'organisation cible et un nom.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/projects/${sourceProjectId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetOrganizationId: targetOrgId,
          name: name.trim(),
          includeTickets,
          includeTasks,
          includePhases,
          includeMilestones,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${r.status}`);
      }
      const d = await r.json();
      window.location.href = `/projects/${d.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm overflow-y-auto p-4">
      <div className="w-full max-w-lg mt-12">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                  <Copy className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900">Dupliquer le projet</h3>
                  <p className="text-[12px] text-slate-500">
                    À partir de <span className="font-medium text-slate-700">« {sourceProjectName} »</span>
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={submitting}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">
                  Organisation cible
                </label>
                <select
                  value={targetOrgId}
                  onChange={(e) => setTargetOrgId(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-700"
                >
                  <option value="">— Choisir une organisation —</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.clientCode ? ` (${o.clientCode})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-slate-700 mb-1">
                  Nom du nouveau projet
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex. Déploiement M365 — Ville de XYZ"
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                  Éléments à cloner
                </p>
                <Cb checked={includePhases} onChange={setIncludePhases} label="Phases (squelette, statut reset)" />
                <Cb checked={includeMilestones} onChange={setIncludeMilestones} label="Jalons (dates conservées, statut reset)" />
                <Cb checked={includeTasks} onChange={setIncludeTasks} label="Tâches (squelette, statut/dates/heures reset)" />
                <Cb checked={includeTickets} onChange={setIncludeTickets} label="Tickets liés (subject + description, statut NEW)" />
                <p className="mt-2 text-[10.5px] text-slate-500 italic">
                  Les commentaires, saisies de temps, journaux d&apos;activité et membres de l&apos;équipe ne sont JAMAIS clonés (cloisonnement client A → B).
                </p>
              </div>

              {error && (
                <div className="rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-[12px] text-red-800">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                  Annuler
                </Button>
                <Button size="sm" onClick={submit} disabled={submitting || !targetOrgId || !name.trim()}>
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                  Dupliquer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Cb({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
      />
      <span className="text-[12.5px] text-slate-700">{label}</span>
    </label>
  );
}
