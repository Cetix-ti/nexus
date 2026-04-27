"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Shield, Repeat, Calendar, Trash2, Plus, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RenewalsWidget } from "@/components/assets/renewals-widget";
import { EngagementFormModal } from "@/components/assets/engagement-form-modal";

interface Row {
  id: string; vendor: string | null; startDate: string; endDate: string;
  assetId?: string;
  asset?: { id: string; name: string } | null;
  coverageLevel?: string; plan?: string | null; autoRenew?: boolean;
  billingCycle?: string; amount?: number | null; currency?: string; tier?: string;
}

type Kind = "warranty" | "subscription" | "support";

const KIND_LABEL: Record<Kind, string> = {
  warranty: "garantie",
  subscription: "abonnement",
  support: "contrat de support",
};

function daysUntil(d: string) { return Math.floor((new Date(d).getTime() - Date.now()) / 86400_000); }
function urgency(days: number) {
  if (days < 0) return "bg-slate-100 text-slate-600 ring-slate-200";
  if (days < 30) return "bg-red-50 text-red-700 ring-red-200";
  if (days < 90) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}
function fmtDate(d: string) { return new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }); }

export function OrgAssetsEngagementsTab({ organizationId }: { organizationId: string }) {
  const [kind, setKind] = useState<Kind | "renewals">("renewals");
  const [warranties, setWarranties] = useState<Row[]>([]);
  const [subscriptions, setSubscriptions] = useState<Row[]>([]);
  const [support, setSupport] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const [rW, rS, rC] = await Promise.all([
      fetch(`/api/v1/asset-warranties?orgId=${organizationId}`),
      fetch(`/api/v1/asset-subscriptions?orgId=${organizationId}`),
      fetch(`/api/v1/asset-support-contracts?orgId=${organizationId}`),
    ]);
    if (rW.ok) setWarranties(await rW.json());
    if (rS.ok) setSubscriptions(await rS.json());
    if (rC.ok) setSupport(await rC.json());
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto -mx-6 px-6 sm:-mx-0 sm:px-0">
        {[
          { k: "renewals" as const, label: "Renouvellements", icon: Calendar },
          { k: "warranty" as const, label: "Garanties", icon: Shield, count: warranties.length },
          { k: "subscription" as const, label: "Abonnements", icon: Repeat, count: subscriptions.length },
          { k: "support" as const, label: "Contrats de support", icon: Calendar, count: support.length },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.k} onClick={() => setKind(t.k)}
              className={`px-3 py-2 text-[12.5px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${
                kind === t.k ? "border-blue-500 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}>
              <Icon className="h-3.5 w-3.5" />
              {t.label} {"count" in t && <span className="text-slate-400">({t.count})</span>}
            </button>
          );
        })}
      </div>

      {kind === "renewals" && (
        <RenewalsWidget organizationId={organizationId} />
      )}

      {kind === "warranty" && (
        <ListRows
          rows={warranties}
          label="Garantie"
          onReload={load}
          kind="warranty"
          organizationId={organizationId}
        />
      )}
      {kind === "subscription" && (
        <ListRows
          rows={subscriptions}
          label="Abonnement"
          onReload={load}
          kind="subscription"
          organizationId={organizationId}
        />
      )}
      {kind === "support" && (
        <ListRows
          rows={support}
          label="Support"
          onReload={load}
          kind="support"
          organizationId={organizationId}
        />
      )}
    </div>
  );
}

function ListRows({ rows, label, kind, organizationId, onReload }: {
  rows: Row[];
  label: string;
  kind: "warranty" | "subscription" | "support";
  organizationId: string;
  onReload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  async function remove(id: string) {
    if (!confirm("Supprimer ?")) return;
    const path = kind === "warranty" ? "asset-warranties" : kind === "subscription" ? "asset-subscriptions" : "asset-support-contracts";
    const r = await fetch(`/api/v1/${path}/${id}`, { method: "DELETE" });
    if (r.ok) await onReload();
  }

  return (
    <>
      <div className="flex items-center justify-end mb-2">
        <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-[13px] text-slate-500">
            Aucun engagement de type « {label} » pour le moment. Cliquez sur
            « Ajouter » pour en créer un, rattaché à un actif de l&apos;org.
          </div>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {rows.map((r) => {
              const days = daysUntil(r.endDate);
              return (
                <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-slate-900">{r.vendor ?? label}</span>
                      {r.asset && (
                        <Link href={`/assets/${r.asset.id}`} className="text-[11.5px] text-blue-600 hover:underline">{r.asset.name}</Link>
                      )}
                      {r.autoRenew && <span className="text-[10px] bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 rounded px-1.5 py-0.5">Auto-renouvellement</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] rounded px-1.5 py-0.5 ring-1 ring-inset ${urgency(days)}`}>
                        {days < 0 ? "Expiré" : days < 1 ? "Aujourd'hui" : `Dans ${days} j`}
                      </span>
                      <span className="text-[11px] text-slate-500">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</span>
                      {r.amount !== undefined && r.amount !== null && <span className="text-[11px] text-slate-500">· {r.amount} {r.currency ?? ""}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setEditing(r)} title="Modifier">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => remove(r.id)} title="Supprimer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {(adding || editing) && (
        <EngagementFormModal
          open
          kind={kind}
          organizationId={organizationId}
          existing={editing ? {
            id: editing.id,
            assetId: editing.asset?.id ?? editing.assetId ?? "",
            vendor: editing.vendor,
            startDate: editing.startDate,
            endDate: editing.endDate,
            coverageLevel: editing.coverageLevel,
            plan: editing.plan,
            autoRenew: editing.autoRenew,
            billingCycle: editing.billingCycle,
            amount: editing.amount,
            currency: editing.currency,
            tier: editing.tier,
          } : null}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { void onReload(); }}
        />
      )}
    </>
  );
}
// Note : `KIND_LABEL` exporte le libellé canonique par kind (utilisé
// par d'autres composants si besoin — pour l'instant, conservé en
// case d'extension).
void KIND_LABEL;
