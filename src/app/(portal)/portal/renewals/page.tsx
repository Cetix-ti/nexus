"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Shield, Repeat, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { PortalAccessRestricted } from "@/components/portal/access-restricted";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface Row {
  id: string; type: "warranty" | "subscription" | "support_contract";
  title: string; endDate: string; subjectName: string | null;
  amount?: number | null; currency?: string | null; autoRenew?: boolean;
}

const TYPE_ICON = { warranty: Shield, subscription: Repeat, support_contract: Calendar };
const TYPE_LABEL = { warranty: "Garantie", subscription: "Abonnement", support_contract: "Contrat de support" };

function daysUntil(d: string) { return Math.floor((new Date(d).getTime() - Date.now()) / 86400_000); }
function urgencyClass(days: number) {
  if (days < 15) return "bg-red-50 text-red-700 ring-red-200";
  if (days < 60) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export default function PortalRenewalsPage() {
  const { permissions } = usePortalUser();
  const isAdmin = permissions.portalRole === "admin";
  const [items, setItems] = useState<Row[] | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    void fetch("/api/portal/renewals?range=180d").then(async (r) => {
      if (r.ok) setItems(await r.json());
      else setItems([]);
    });
  }, [isAdmin]);
  if (!isAdmin) return <PortalAccessRestricted title="Échéances à venir" />;
  if (items === null) return <PageLoader />;

  const critical = items.filter((i) => daysUntil(i.endDate) < 30).length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center"><CalendarClock className="h-5 w-5 text-amber-600" /></div>
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">Échéances à venir</h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Garanties, abonnements et contrats de support qui expirent dans les 6 prochains mois.
            {critical > 0 && <span className="ml-1 text-red-700 font-medium">{critical} dans moins de 30 jours.</span>}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card><div className="p-10 text-center text-[13px] text-slate-500">Aucune échéance dans la période.</div></Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {items.map((r) => {
              const days = daysUntil(r.endDate);
              const Icon = TYPE_ICON[r.type];
              return (
                <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Icon className="h-4 w-4 text-slate-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium text-slate-900">{r.title}</div>
                      <div className="text-[11.5px] text-slate-500">
                        {TYPE_LABEL[r.type]}
                        {r.autoRenew && " · auto-renouvellement"}
                        {r.amount !== undefined && r.amount !== null && ` · ${r.amount} ${r.currency ?? ""}`}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-flex text-[11px] rounded px-1.5 py-0.5 ring-1 ring-inset ${urgencyClass(days)}`}>
                      {days < 1 ? "Aujourd'hui" : `Dans ${days} j`}
                    </span>
                    <div className="mt-0.5 text-[11px] text-slate-400">{new Date(r.endDate).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" })}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
