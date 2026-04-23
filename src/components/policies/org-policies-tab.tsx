"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Plus, ShieldCheck, FileCode2, Lock, KeyRound, Globe, Database, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SyncBadge } from "@/components/shared/sync-badge";

interface Capabilities {
  hasAD: boolean; hasAzureAD: boolean; hasEntra: boolean; hasM365: boolean;
  hasBackupsVeeam: boolean; hasKeePass: boolean;
}
interface GpoInstance {
  id: string; computedName: string; scope: string; status: string; syncState: "IN_SYNC" | "DRIFTED" | "DETACHED"; updatedAt: string;
  template: { id: string; nameStem: string } | null;
}
interface ScriptInstance {
  id: string; title: string; language: string; syncState: "IN_SYNC" | "DRIFTED" | "DETACHED";
}
interface PolicyDoc {
  id: string; title: string; subcategory: string; summary: string | null; updatedAt: string;
}

const SUBCATS: Array<{ key: string; label: string; icon: typeof Lock; requires?: (c: Capabilities) => boolean; clientExposable: boolean }> = [
  { key: "PWD_AD", label: "Mots de passe AD", icon: Lock, requires: (c) => c.hasAD, clientExposable: true },
  { key: "PWD_ENTRA", label: "Mots de passe Entra", icon: Lock, requires: (c) => c.hasEntra || c.hasAzureAD, clientExposable: true },
  { key: "PRIVILEGED_ACCESS", label: "Accès privilégiés", icon: KeyRound, clientExposable: false },
  { key: "M365_ROLES", label: "Rôles M365 / Entra", icon: Globe, requires: (c) => c.hasM365 || c.hasEntra, clientExposable: true },
  { key: "KEEPASS", label: "Coffre KeePass", icon: KeyRound, requires: (c) => c.hasKeePass, clientExposable: false },
  { key: "BACKUP_REPLICATION", label: "Sauvegardes & réplication", icon: Database, clientExposable: true },
  { key: "OTHER", label: "Autres politiques", icon: FileText, clientExposable: true },
];

export function OrgPoliciesTab({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [gpoInstances, setGpoInstances] = useState<GpoInstance[]>([]);
  const [scriptInstances, setScriptInstances] = useState<ScriptInstance[]>([]);
  const [docs, setDocs] = useState<PolicyDoc[]>([]);

  async function load() {
    const [rC, rG, rS, rD] = await Promise.all([
      fetch(`/api/v1/organizations/${organizationId}/capabilities`),
      fetch(`/api/v1/policies/gpo-instances?orgId=${organizationId}`),
      fetch(`/api/v1/policies/script-instances?orgId=${organizationId}`),
      fetch(`/api/v1/policies/documents?orgId=${organizationId}`),
    ]);
    if (rC.ok) setCaps(await rC.json());
    if (rG.ok) setGpoInstances(await rG.json());
    if (rS.ok) setScriptInstances(await rS.json());
    if (rD.ok) setDocs(await rD.json());
  }
  useEffect(() => { void load(); }, [organizationId]);

  const docsBySubcat = useMemo(() => {
    const map = new Map<string, PolicyDoc[]>();
    for (const d of docs) {
      if (!map.has(d.subcategory)) map.set(d.subcategory, []);
      map.get(d.subcategory)!.push(d);
    }
    return map;
  }, [docs]);

  if (!caps) return <Card><div className="p-6 text-[12.5px] text-slate-500">Chargement…</div></Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">Politiques</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Règles et configurations techniques en vigueur chez {organizationName}. Les sections s'affichent selon les capacités déclarées dans l'Aperçu.
          </p>
        </div>
      </div>

      {/* GPO — visible si hasAD */}
      {caps.hasAD ? (
        <Section title="Stratégies de groupes (GPO)" icon={ShieldCheck} accent="red" count={gpoInstances.length}
          action={<Link href={`/policies/new?kind=gpo-instance&orgId=${organizationId}`}><Button size="sm" className="gap-1.5 h-7"><Plus className="h-3.5 w-3.5" /> Ajouter</Button></Link>}>
          {gpoInstances.length === 0 ? (
            <EmptyMini text="Aucune GPO appliquée. Importez une GPO exportée ou appliquez un modèle." />
          ) : (
            <div className="grid gap-1.5">
              {gpoInstances.map((g) => (
                <Link key={g.id} href={`/policies/instances/gpo/${g.id}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 hover:border-slate-300">
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="text-[12px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{g.computedName}</code>
                    <StatusBadge status={g.status} />
                    {g.template && <SyncBadge state={g.syncState} />}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{new Date(g.updatedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      ) : (
        <HiddenSection reason="Cette organisation n'a pas d'Active Directory local (activez `hasAD` dans l'Aperçu pour afficher la section GPO)." />
      )}

      {/* Scripts */}
      <Section title="Scripts & automatisation" icon={FileCode2} accent="violet" count={scriptInstances.length}
        action={<Link href={`/policies/new?kind=script-instance&orgId=${organizationId}`}><Button size="sm" className="gap-1.5 h-7"><Plus className="h-3.5 w-3.5" /> Ajouter</Button></Link>}>
        {scriptInstances.length === 0 ? (
          <EmptyMini text="Aucun script attaché à ce client." />
        ) : (
          <div className="grid gap-1.5">
            {scriptInstances.map((s) => (
              <Link key={s.id} href={`/policies/instances/scripts/${s.id}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 hover:border-slate-300">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode2 className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-[12.5px] font-medium text-slate-900 truncate">{s.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{s.language}</span>
                  <SyncBadge state={s.syncState} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Sous-sections conditionnelles */}
      {SUBCATS.map((sc) => {
        if (sc.requires && !sc.requires(caps)) return null;
        const list = docsBySubcat.get(sc.key) ?? [];
        const Icon = sc.icon;
        return (
          <Section key={sc.key} title={sc.label} icon={Icon} accent="slate" count={list.length}
            action={<Link href={`/policies/new?kind=document&subcategory=${sc.key}&orgId=${organizationId}`}><Button size="sm" className="gap-1.5 h-7"><Plus className="h-3.5 w-3.5" /> Ajouter</Button></Link>}>
            {list.length === 0 ? (
              <EmptyMini text="Aucune fiche." />
            ) : (
              <div className="grid gap-1.5">
                {list.map((d) => (
                  <Link key={d.id} href={`/policies/documents/${d.id}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 hover:border-slate-300">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium text-slate-900 truncate">{d.title}</div>
                      {d.summary && <div className="text-[11.5px] text-slate-500 truncate">{d.summary}</div>}
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">{new Date(d.updatedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}</span>
                  </Link>
                ))}
              </div>
            )}
            {!sc.clientExposable && (
              <p className="mt-2 text-[11px] text-slate-500 italic">🔒 Cette sous-section reste interne aux agents, jamais exposée au portail client.</p>
            )}
          </Section>
        );
      })}
    </div>
  );
}

function Section({ title, icon: Icon, accent, count, action, children }: {
  title: string; icon: typeof ShieldCheck; accent: "red" | "violet" | "slate"; count: number; action: React.ReactNode; children: React.ReactNode;
}) {
  const color = accent === "red" ? "text-red-600 bg-red-50" : accent === "violet" ? "text-violet-600 bg-violet-50" : "text-slate-600 bg-slate-100";
  return (
    <Card>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-md flex items-center justify-center ${color}`}><Icon className="h-4 w-4" /></div>
            <div>
              <h3 className="text-[13.5px] font-semibold text-slate-900">{title}</h3>
              <p className="text-[11px] text-slate-500">{count} élément{count > 1 ? "s" : ""}</p>
            </div>
          </div>
          {action}
        </div>
        {children}
      </div>
    </Card>
  );
}

function HiddenSection({ reason }: { reason: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-[11.5px] text-slate-500">
      {reason}
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <div className="text-[12px] text-slate-500 px-2 py-1">{text}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    DRAFT: { label: "Brouillon", color: "bg-slate-100 text-slate-700 ring-slate-200" },
    PENDING_APPROVAL: { label: "En attente", color: "bg-amber-50 text-amber-800 ring-amber-200" },
    APPROVED: { label: "Approuvée", color: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    DEPLOYED: { label: "Déployée", color: "bg-blue-50 text-blue-700 ring-blue-200" },
    ARCHIVED: { label: "Archivée", color: "bg-slate-50 text-slate-500 ring-slate-200" },
  };
  const m = map[status] ?? map.DRAFT;
  return <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${m.color}`}>{m.label}</span>;
}
