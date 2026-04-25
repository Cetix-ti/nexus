"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ShieldCheck, Library, Building2, FileCode2, FileText, Upload, Plus, Search, KeyRound, Globe, Lock, Database, Users, Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/page-loader";
import { NomenclatureSection } from "@/components/policies/nomenclature-section";
import { ImportScriptFromInstanceModal } from "@/components/policies/import-script-from-instance-modal";

type Tab = "gpo" | "scripts" | "documents" | "ad_groups";

interface GpoRow { id: string; nameStem: string; nameOverride: string | null; scope: "COMPUTER" | "USER" | "MIXED"; schemaVersion: number; updatedAt: string; category: { name: string; icon: string; color: string } | null; _count: { instances: number } }
interface ScriptRow { id: string; title: string; language: string; schemaVersion: number; updatedAt: string; category: { name: string; icon: string; color: string } | null; _count: { instances: number; publications: number } }
interface DocRow { id: string; title: string; subcategory: string; visibility: string; updatedAt: string; organization: { name: string; slug: string }; category: { name: string; icon: string; color: string } | null }

const SCOPE_PREFIX = { COMPUTER: "c_", USER: "u_", MIXED: "cu_" } as const;
const SUBCAT_LABELS: Record<string, { label: string; icon: typeof KeyRound }> = {
  GPO: { label: "GPO", icon: ShieldCheck },
  SCRIPT: { label: "Script", icon: FileCode2 },
  PWD_AD: { label: "Politique mot de passe AD", icon: Lock },
  PWD_ENTRA: { label: "Politique mot de passe Entra", icon: Lock },
  PRIVILEGED_ACCESS: { label: "Accès privilégiés", icon: KeyRound },
  M365_ROLES: { label: "Rôles M365/Entra", icon: Globe },
  KEEPASS: { label: "Coffre KeePass", icon: KeyRound },
  BACKUP_REPLICATION: { label: "Sauvegardes & réplication", icon: Database },
  OTHER: { label: "Autre", icon: FileText },
};

function Content() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "gpo");
  const [q, setQ] = useState("");
  const [gpo, setGpo] = useState<GpoRow[] | null>(null);
  const [scripts, setScripts] = useState<ScriptRow[] | null>(null);
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function load() {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("search", q.trim());
    const [rG, rS, rD] = await Promise.all([
      fetch(`/api/v1/policies/gpo?${sp.toString()}`),
      fetch(`/api/v1/policies/scripts?${sp.toString()}`),
      fetch(`/api/v1/policies/documents?${sp.toString()}`),
    ]);
    if (rG.ok) setGpo(await rG.json());
    if (rS.ok) setScripts(await rS.json());
    if (rD.ok) setDocs(await rD.json());
  }
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold text-slate-900">Politiques</h1>
            <p className="mt-0.5 text-[12.5px] text-slate-500">GPO, scripts, politiques de mots de passe, accès privilégiés, rôles M365, coffres, sauvegardes.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/policies/new?kind=gpo-import"><Button size="sm" variant="outline" className="gap-1.5"><Upload className="h-4 w-4" /> Importer GPO</Button></Link>
          {tab === "scripts" && (
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
              <Sparkles className="h-4 w-4" /> Importer depuis client (IA)
            </Button>
          )}
          <Link href="/policies/new"><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nouveau</Button></Link>
        </div>
      </div>

      <ImportScriptFromInstanceModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onCreated={({ templateId, organizationName }) => {
          alert(`Template créé + déploiement chez ${organizationName}.`);
          router.push(`/policies/scripts/${templateId}`);
        }}
      />

      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto -mx-6 px-6 sm:-mx-0 sm:px-0">
        {[
          { k: "gpo" as const, label: "Stratégies de groupes (GPO)", icon: ShieldCheck, count: gpo?.length },
          { k: "scripts" as const, label: "Scripts & automatisation", icon: FileCode2, count: scripts?.length },
          { k: "documents" as const, label: "Autres politiques", icon: FileText, count: docs?.length },
          { k: "ad_groups" as const, label: "Groupes Active Directory", icon: Users, count: undefined },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${
                tab === t.k ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count !== undefined && <span className="text-slate-400">({t.count})</span>}
            </button>
          );
        })}
      </div>

      {tab !== "ad_groups" && (
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="pl-8" />
        </div>
      )}

      {tab === "gpo" && <NomenclatureSection kind="gpo" />}
      {tab === "scripts" && <NomenclatureSection kind="scripts" />}
      {tab === "ad_groups" && <NomenclatureSection kind="ad_groups" defaultOpen />}

      {tab === "gpo" && (
        gpo === null ? <PageLoader />
        : gpo.length === 0 ? <EmptyCard text="Aucune GPO dans le catalogue. Importez une GPO exportée ou créez-en une manuellement." />
        : (
          <Card>
            <div className="divide-y divide-slate-100">
              {gpo.map((t) => (
                <Link key={t.id} href={`/policies/gpo/${t.id}`} className="block px-4 py-3 hover:bg-slate-50/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-[12px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{SCOPE_PREFIX[t.scope]}{t.nameStem}</code>
                        {t.category && <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: t.category.color }}><span>{t.category.icon}</span>{t.category.name}</span>}
                        <span className="text-[11px] text-slate-400">v{t.schemaVersion}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-500">{t._count.instances} instance(s)</div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )
      )}

      {tab === "scripts" && (
        scripts === null ? <PageLoader />
        : scripts.length === 0 ? <EmptyCard text="Aucun script." />
        : (
          <Card>
            <div className="divide-y divide-slate-100">
              {scripts.map((s) => (
                <Link key={s.id} href={`/policies/scripts/${s.id}`} className="block px-4 py-3 hover:bg-slate-50/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="h-3.5 w-3.5 text-slate-400" />
                        <h3 className="text-[13.5px] font-medium text-slate-900">{s.title}</h3>
                        <span className="text-[11px] uppercase tracking-wide text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{s.language}</span>
                        {s.category && <span className="text-[11px]" style={{ color: s.category.color }}>{s.category.icon} {s.category.name}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-500 text-right">
                      <div>{s._count.instances} variante(s)</div>
                      <div>{s._count.publications} publication(s)</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )
      )}

      {tab === "documents" && (
        docs === null ? <PageLoader />
        : docs.length === 0 ? <EmptyCard text="Aucune fiche de politique (mot de passe, accès, rôles, sauvegardes…)." />
        : (
          <Card>
            <div className="divide-y divide-slate-100">
              {docs.map((d) => {
                const meta = SUBCAT_LABELS[d.subcategory] ?? SUBCAT_LABELS.OTHER;
                const Icon = meta.icon;
                return (
                  <Link key={d.id} href={`/policies/documents/${d.id}`} className="block px-4 py-3 hover:bg-slate-50/60">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-slate-400" />
                          <h3 className="text-[13.5px] font-medium text-slate-900 truncate">{d.title}</h3>
                          <span className="text-[11px] text-slate-500">{meta.label}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-slate-500">
                          <Building2 className="h-3 w-3" /> {d.organization.name}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        )
      )}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <Card><div className="p-10 text-center text-[13px] text-slate-500">{text}</div></Card>;
}

export default function PoliciesListPage() {
  return <Suspense fallback={<PageLoader />}><Content /></Suspense>;
}
