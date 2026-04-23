"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Shield, Repeat, Calendar, FileText, Key } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Renewal {
  id: string; type: "warranty" | "subscription" | "support_contract" | "contract" | "software_license";
  title: string; endDate: string; orgId: string | null; orgName: string | null; subjectName: string | null;
  url: string; color: string;
}

const TYPE_ICON: Record<Renewal["type"], typeof Shield> = {
  warranty: Shield, subscription: Repeat, support_contract: Calendar, contract: FileText, software_license: Key,
};
const TYPE_LABEL: Record<Renewal["type"], string> = {
  warranty: "Garantie", subscription: "Abonnement", support_contract: "Support", contract: "Contrat", software_license: "Licence",
};

function daysUntil(d: string) { return Math.floor((new Date(d).getTime() - Date.now()) / 86400_000); }
function urgencyClass(days: number) {
  if (days < 15) return "text-red-700";
  if (days < 60) return "text-amber-700";
  return "text-emerald-700";
}

/** Widget Aperçu org : renouvellements à venir 90j. */
export function RenewalsWidget({ organizationId }: { organizationId?: string }) {
  const [items, setItems] = useState<Renewal[] | null>(null);

  useEffect(() => {
    const url = `/api/v1/renewals?range=90d${organizationId ? `&orgId=${organizationId}` : ""}`;
    void fetch(url).then(async (r) => { if (r.ok) setItems(await r.json()); });
  }, [organizationId]);

  if (items === null) return null;
  const critical = items.filter((i) => daysUntil(i.endDate) < 30).length;

  return (
    <Card>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-amber-50 flex items-center justify-center"><CalendarClock className="h-4 w-4 text-amber-600" /></div>
            <div>
              <h3 className="text-[13.5px] font-semibold text-slate-900">Renouvellements à venir (90j)</h3>
              <p className="text-[11px] text-slate-500">{items.length} échéance{items.length > 1 ? "s" : ""}{critical > 0 ? ` · ${critical} critique${critical > 1 ? "s" : ""}` : ""}</p>
            </div>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="text-[12.5px] text-slate-500">Aucune échéance dans les 90 prochains jours.</p>
        ) : (
          <div className="space-y-1.5">
            {items.slice(0, 8).map((r) => {
              const days = daysUntil(r.endDate);
              const Icon = TYPE_ICON[r.type];
              return (
                <Link key={`${r.type}-${r.id}`} href={r.url} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: r.color }} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-slate-900 truncate">{r.title}</div>
                      <div className="text-[11px] text-slate-500">{TYPE_LABEL[r.type]}{r.orgName && !organizationId ? ` · ${r.orgName}` : ""}</div>
                    </div>
                  </div>
                  <div className={`shrink-0 text-[11px] font-medium ${urgencyClass(days)}`}>
                    {days < 1 ? "aujourd'hui" : `${days} j`}
                  </div>
                </Link>
              );
            })}
            {items.length > 8 && <div className="text-[11.5px] text-slate-500 pt-1">+{items.length - 8} autres</div>}
          </div>
        )}
      </div>
    </Card>
  );
}
