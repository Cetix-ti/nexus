"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Lock, Globe, Database, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { AiExplainButton } from "@/components/portal/ai-explain-button";
import { PortalAccessRestricted } from "@/components/portal/access-restricted";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface Row {
  id: string; title: string; summary: string | null; body: string;
  subcategory: string; tags: string[]; updatedAt: string;
  category: { name: string; icon: string; color: string } | null;
}

const LABELS: Record<string, { label: string; icon: typeof Lock }> = {
  PWD_AD: { label: "Politique mot de passe AD", icon: Lock },
  PWD_ENTRA: { label: "Politique mot de passe Entra", icon: Lock },
  M365_ROLES: { label: "Rôles M365 / Entra", icon: Globe },
  BACKUP_REPLICATION: { label: "Sauvegardes & réplication", icon: Database },
  OTHER: { label: "Autre politique", icon: FileText },
};

export default function PortalPoliciesPage() {
  const { permissions } = usePortalUser();
  const [items, setItems] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!permissions.canSeePolicies) return;
    void fetch("/api/portal/policies").then(async (r) => {
      if (r.ok) setItems(await r.json());
      else setItems([]);
    });
  }, [permissions.canSeePolicies]);

  if (!permissions.canSeePolicies) return <PortalAccessRestricted title="Politiques & règles" />;
  if (items === null) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 w-full space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center"><ShieldCheck className="h-5 w-5 text-red-600" /></div>
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">Politiques & règles</h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Documents partagés par votre équipe Cetix : mots de passe, rôles M365, sauvegardes, etc.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card><div className="p-10 text-center text-[13px] text-slate-500">Aucune politique partagée.</div></Card>
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const meta = LABELS[r.subcategory] ?? LABELS.OTHER;
            const Icon = meta.icon;
            return (
              <Card key={r.id}>
                <div className="p-4">
                  <button className="w-full text-left" onClick={() => setOpenId((id) => id === r.id ? null : r.id)}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[11.5px] text-slate-500">{meta.label}</span>
                        </div>
                        <h3 className="mt-0.5 text-[14px] font-medium text-slate-900">{r.title}</h3>
                        {r.summary && <p className="mt-0.5 text-[12.5px] text-slate-600">{r.summary}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400">{new Date(r.updatedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}</span>
                    </div>
                  </button>
                  {openId === r.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      <div className="prose prose-sm max-w-none text-[13px] text-slate-700" dangerouslySetInnerHTML={{ __html: r.body }} />
                      <AiExplainButton kind="policy_document" id={r.id} />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
