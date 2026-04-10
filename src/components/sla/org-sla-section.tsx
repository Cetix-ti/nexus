"use client";

import { useEffect } from "react";
import { ShieldCheck, RotateCcw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SlaProfileEditor } from "./sla-profile-editor";
import { useSlaStore } from "@/stores/sla-store";

interface OrgSlaSectionProps {
  organizationId: string;
  organizationName: string;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow translate-y-0.5 transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function OrgSlaSection({
  organizationId,
  organizationName,
}: OrgSlaSectionProps) {
  const globalProfile = useSlaStore((s) => s.globalProfile);
  const override = useSlaStore((s) => s.orgOverrides[organizationId]);
  const enableOrgOverride = useSlaStore((s) => s.enableOrgOverride);
  const removeOrgOverride = useSlaStore((s) => s.removeOrgOverride);
  const setOrgPolicy = useSlaStore((s) => s.setOrgPolicy);
  const loadGlobal = useSlaStore((s) => s.loadAll);
  const loaded = useSlaStore((s) => s.loaded);

  // Load both global profile + this org's override on mount
  useEffect(() => {
    if (!loaded) loadGlobal();
    fetch(`/api/v1/sla/orgs/${organizationId}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((profile) => {
        if (profile && typeof profile === "object" && "low" in profile) {
          // Inject directly into the store cache without re-PUTting
          useSlaStore.setState((s) => ({
            orgOverrides: { ...s.orgOverrides, [organizationId]: profile },
          }));
        }
      })
      .catch(() => {});
  }, [organizationId, loaded, loadGlobal]);

  const hasOverride = !!override;
  const profile = override ?? globalProfile;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60 shrink-0">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                SLA spécifiques à {organizationName}
              </h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Définissez des délais négociés contractuellement pour ce client.
                Lorsqu&apos;activé, ces valeurs remplacent les SLA globaux pour
                tous ses tickets.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[12px] text-slate-600">
              {hasOverride ? "Override activé" : "SLA globaux"}
            </span>
            <Toggle
              checked={hasOverride}
              onChange={(v) =>
                v
                  ? enableOrgOverride(organizationId)
                  : removeOrgOverride(organizationId)
              }
            />
          </div>
        </div>

        <SlaProfileEditor
          profile={profile}
          disabled={!hasOverride}
          onChange={(priority, policy) =>
            setOrgPolicy(organizationId, priority, policy)
          }
        />

        {hasOverride ? (
          <div className="flex items-center justify-between rounded-lg bg-amber-50/60 border border-amber-200/60 px-3 py-2.5">
            <div className="text-[12px] text-amber-900 inline-flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Ce client utilise des SLA personnalisés. Les indicateurs de
                priorité (Faible, Moyenne, Élevée, Critique) sur ses tickets
                reflèteront ces valeurs.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => removeOrgOverride(organizationId)}
            >
              <RotateCcw className="h-3 w-3" />
              Revenir aux globaux
            </Button>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50/60 border border-slate-200/60 px-3 py-2.5 text-[12px] text-slate-600 inline-flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Activez l&apos;override pour éditer des SLA propres à ce client.
              Sans override, ses tickets utilisent les SLA globaux ci-dessus.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
