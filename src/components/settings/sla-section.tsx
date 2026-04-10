"use client";

import { useEffect } from "react";
import { Clock, ShieldCheck, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SlaProfileEditor } from "@/components/sla/sla-profile-editor";
import { useSlaStore } from "@/stores/sla-store";

export function SLASection() {
  const globalProfile = useSlaStore((s) => s.globalProfile);
  const setGlobalPolicy = useSlaStore((s) => s.setGlobalPolicy);
  const loadAll = useSlaStore((s) => s.loadAll);
  const loaded = useSlaStore((s) => s.loaded);
  const orgOverridesCount = useSlaStore(
    (s) => Object.keys(s.orgOverrides).length
  );

  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
          SLA globaux par défaut
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Délais de 1ère réponse et de résolution appliqués à tous les tickets,
          sauf si une organisation cliente a ses propres SLA négociés.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
                <Clock className="h-4 w-4" strokeWidth={2.25} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Profil par défaut
                </p>
                <p className="text-[13px] font-medium text-slate-900">
                  Appliqué à toutes les organisations sans override
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60">
                <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Overrides par organisation
                </p>
                <p className="text-[20px] font-semibold tabular-nums text-slate-900">
                  {orgOverridesCount}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <SlaProfileEditor
        profile={globalProfile}
        onChange={(priority, policy) => setGlobalPolicy(priority, policy)}
      />

      <div className="rounded-lg bg-blue-50/40 border border-blue-200/60 px-3 py-2.5 text-[12px] text-blue-900 inline-flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Pour définir des SLA spécifiques à un client (ex. contrat Or/Argent
          négocié), ouvrez la fiche de l&apos;organisation → onglet « SLA ». Les
          valeurs y remplaceront les SLA globaux pour tous ses tickets.
        </span>
      </div>
    </div>
  );
}
