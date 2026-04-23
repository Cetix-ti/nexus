"use client";

import { useEffect, useState } from "react";
import { GitCommit } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { AiExplainButton } from "@/components/portal/ai-explain-button";
import { PortalAccessRestricted } from "@/components/portal/access-restricted";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface Row {
  id: string; title: string; summary: string | null; body: string;
  category: string; impact: string; changeDate: string; publishedAt: string | null;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  INFRASTRUCTURE:   { label: "Infrastructure",    color: "#3B82F6" },
  NETWORK_SECURITY: { label: "Réseau & sécurité", color: "#EF4444" },
  IDENTITY_ACCESS:  { label: "Identités & accès", color: "#F59E0B" },
  M365_CLOUD:       { label: "M365 & cloud",      color: "#06B6D4" },
  SOFTWARE:         { label: "Logiciels",         color: "#8B5CF6" },
  BACKUPS:          { label: "Sauvegardes",       color: "#10B981" },
  WORKSTATIONS:     { label: "Postes",            color: "#6366F1" },
  TELECOM_PRINT:    { label: "Téléphonie / Imp.", color: "#64748B" },
  CONTRACTS:        { label: "Contrats",          color: "#A855F7" },
  ORGANIZATIONAL:   { label: "Organisationnel",   color: "#94A3B8" },
  OTHER:            { label: "Autre",             color: "#94A3B8" },
};
const IMPACT_LABELS: Record<string, { label: string; color: string }> = {
  MINOR:      { label: "Mineur",     color: "bg-slate-100 text-slate-600 ring-slate-200" },
  MODERATE:   { label: "Modéré",     color: "bg-blue-50 text-blue-700 ring-blue-200" },
  MAJOR:      { label: "Majeur",     color: "bg-amber-50 text-amber-800 ring-amber-200" },
  STRUCTURAL: { label: "Structurant", color: "bg-red-50 text-red-700 ring-red-200" },
};

export default function PortalChangesPage() {
  const { permissions } = usePortalUser();
  const [items, setItems] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!permissions.canSeeChanges) return;
    void fetch("/api/portal/changes").then(async (r) => {
      if (r.ok) setItems(await r.json());
      else setItems([]);
    });
  }, [permissions.canSeeChanges]);

  if (!permissions.canSeeChanges) return <PortalAccessRestricted title="Journal des changements" />;
  if (items === null) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center"><GitCommit className="h-5 w-5 text-blue-600" /></div>
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">Journal des changements</h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Historique des évolutions importantes de votre environnement IT.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card><div className="p-10 text-center text-[13px] text-slate-500">Aucun changement partagé.</div></Card>
      ) : (
        <ol className="space-y-3">
          {items.map((r) => {
            const cat = CATEGORY_LABELS[r.category] ?? CATEGORY_LABELS.OTHER;
            const imp = IMPACT_LABELS[r.impact] ?? IMPACT_LABELS.MODERATE;
            return (
              <Card key={r.id}>
                <div className="p-4">
                  <button className="w-full text-left" onClick={() => setOpenId((id) => id === r.id ? null : r.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-medium" style={{ color: cat.color }}>{cat.label}</span>
                          <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${imp.color}`}>{imp.label}</span>
                          <span className="text-[11px] text-slate-500">{new Date(r.changeDate).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" })}</span>
                        </div>
                        <h3 className="mt-0.5 text-[14px] font-medium text-slate-900">{r.title}</h3>
                        {r.summary && <p className="mt-0.5 text-[12.5px] text-slate-600">{r.summary}</p>}
                      </div>
                    </div>
                  </button>
                  {openId === r.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      {r.body && <div className="prose prose-sm max-w-none text-[13px] text-slate-700" dangerouslySetInnerHTML={{ __html: r.body }} />}
                      <AiExplainButton kind="change" id={r.id} />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </ol>
      )}
    </div>
  );
}
