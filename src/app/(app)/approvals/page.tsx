"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Check, X, Building2, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/page-loader";

interface Request {
  id: string; targetType: string; targetId: string; action: string;
  justification: string | null; createdAt: string;
  organization: { id: string; name: string; slug: string } | null;
  requestedBy: { firstName: string; lastName: string } | null;
}

const TARGET_LABELS: Record<string, string> = {
  gpo_instance: "Déploiement GPO",
  script_publication: "Publication script",
  policy_document: "Politique",
};

export default function ApprovalsInboxPage() {
  const [items, setItems] = useState<Request[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/v1/approvals/inbox`);
    if (r.ok) setItems(await r.json());
  }
  useEffect(() => { void load(); }, []);

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setBusy(id);
    const note = decision === "REJECTED" ? prompt("Raison du rejet (optionnelle) :", "") : null;
    const r = await fetch(`/api/v1/approvals/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, decisionNote: note || null }),
    });
    setBusy(null);
    if (r.ok) await load();
  }

  if (items === null) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center"><ShieldCheck className="h-5 w-5 text-emerald-600" /></div>
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">Approbations en attente</h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Demandes sensibles (déploiement GPO, publication script, etc.) nécessitant une décision humaine.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-[13px] text-slate-500">
            Aucune demande d'approbation en attente.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <Card key={r.id}>
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-200 rounded px-1.5 py-0.5">
                        {TARGET_LABELS[r.targetType] ?? r.targetType}
                      </span>
                      <span className="text-[11.5px] text-slate-500">· {r.action}</span>
                    </div>
                    {r.organization && (
                      <p className="mt-1 text-[12.5px] text-slate-700 inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        <Link href={`/organisations/${r.organization.slug}`} className="hover:text-blue-700">{r.organization.name}</Link>
                      </p>
                    )}
                    {r.justification && <p className="mt-1 text-[12.5px] text-slate-600">{r.justification}</p>}
                    <p className="mt-1 text-[11px] text-slate-400 inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Demandé par {r.requestedBy ? `${r.requestedBy.firstName} ${r.requestedBy.lastName}` : "?"} · {new Date(r.createdAt).toLocaleString("fr-CA")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => decide(r.id, "REJECTED")} className="gap-1.5">
                    <X className="h-4 w-4" /> Rejeter
                  </Button>
                  <Button size="sm" disabled={busy === r.id} onClick={() => decide(r.id, "APPROVED")} className="gap-1.5">
                    <Check className="h-4 w-4" /> Approuver
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
