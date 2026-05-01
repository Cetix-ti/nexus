"use client";

import { useEffect, useState } from "react";
import { Package, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/page-loader";
import { PortalAccessRestricted } from "@/components/portal/access-restricted";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface Installer { id: string; title: string; filename: string; sizeBytes: number }
interface Row {
  id: string; name: string; vendor: string | null; version: string | null;
  bodyOverride: string | null; tags: string[]; updatedAt: string;
  category: { name: string; icon: string; color: string } | null;
  template: { body: string } | null;
  installers: Installer[];
}

export default function PortalSoftwarePage() {
  const { permissions } = usePortalUser();
  const [items, setItems] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!permissions.canSeeSoftware) return;
    void fetch("/api/portal/software").then(async (r) => {
      if (r.ok) setItems(await r.json());
      else setItems([]);
    });
  }, [permissions.canSeeSoftware]);

  if (!permissions.canSeeSoftware) return <PortalAccessRestricted title="Logiciels" />;
  if (items === null) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 w-full space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center"><Package className="h-5 w-5 text-violet-600" /></div>
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900">Logiciels</h1>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Catalogue des logiciels utilisés et documentés par votre équipe Cetix.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card><div className="p-10 text-center text-[13px] text-slate-500">Aucun logiciel partagé.</div></Card>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <Card key={r.id}>
              <div className="p-4">
                <button className="w-full text-left" onClick={() => setOpenId((id) => id === r.id ? null : r.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.category && <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: r.category.color }}>{r.category.icon} {r.category.name}</span>}
                        <h3 className="text-[14px] font-medium text-slate-900">{r.name}</h3>
                        {r.version && <span className="text-[11px] text-slate-400">v{r.version}</span>}
                      </div>
                      {r.vendor && <p className="text-[12px] text-slate-500">{r.vendor}</p>}
                      {r.installers.length > 0 && (
                        <p className="mt-1 text-[11.5px] text-slate-500 inline-flex items-center gap-1"><Download className="h-3 w-3" /> {r.installers.length} fichier{r.installers.length > 1 ? "s" : ""} d'installation disponible{r.installers.length > 1 ? "s" : ""}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{new Date(r.updatedAt).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })}</span>
                  </div>
                </button>
                {openId === r.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <div className="prose prose-sm max-w-none text-[13px] text-slate-700" dangerouslySetInnerHTML={{ __html: r.bodyOverride || r.template?.body || "" }} />
                    {r.installers.length > 0 && (
                      <div className="pt-2">
                        <div className="text-[11px] font-semibold text-slate-600 mb-1">Pour télécharger</div>
                        <p className="text-[11.5px] text-slate-500">
                          Contactez votre agent Cetix pour obtenir un lien de téléchargement sécurisé avec code d'accès temporaire.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
