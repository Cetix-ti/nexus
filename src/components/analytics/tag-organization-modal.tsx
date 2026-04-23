"use client";

// Modal pour attribuer un widget ou un dashboard à une organisation.
// Réutilisable pour widgets et reports custom.

import { useEffect, useMemo, useState } from "react";
import { X, Search, Building2, Globe, Check } from "lucide-react";

interface OrgRow {
  id: string;
  name: string;
  slug?: string;
  clientCode?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Texte affiché en entête — "dashboard" ou "widget" par ex. */
  itemLabel: string;
  /** Nom de l'item courant pour le titre (ex: "Rapport mensuel") */
  itemName?: string;
  /** Org actuellement attribuée (undefined = global). */
  currentOrgId: string | undefined;
  /** Appelé avec l'orgId sélectionné ou null pour "global". */
  onSelect: (organizationId: string | null) => void;
}

export function TagOrganizationModal({ open, onClose, itemLabel, itemName, currentOrgId, onSelect }: Props) {
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setOrgs(null);
    const ctrl = new AbortController();
    fetch("/api/v1/organizations", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setOrgs(Array.isArray(d) ? d : []))
      .catch(() => setOrgs([]));
    return () => ctrl.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!orgs) return [];
    if (!search.trim()) return orgs;
    const s = search.toLowerCase();
    return orgs.filter((o) =>
      o.name.toLowerCase().includes(s)
      || (o.slug ?? "").toLowerCase().includes(s)
      || (o.clientCode ?? "").toLowerCase().includes(s)
    );
  }, [orgs, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50">
      <div className="relative w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[85vh] bg-white sm:rounded-xl shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900 inline-flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" /> Attribuer à une organisation
            </h2>
            <p className="text-[12px] text-slate-500 mt-0.5 truncate">
              {itemLabel}{itemName ? ` : ${itemName}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une organisation…"
              className="w-full rounded-md border border-slate-300 pl-7 pr-2 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => { onSelect(null); onClose(); }}
            className={`w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 ${currentOrgId == null ? "bg-blue-50/40" : ""}`}
          >
            <Globe className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-slate-900">Global (aucune organisation)</div>
              <div className="text-[11.5px] text-slate-500">Visible partout, non rattaché à un client en particulier.</div>
            </div>
            {currentOrgId == null && <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />}
          </button>

          {orgs === null ? (
            <div className="px-3 py-4 text-[12.5px] text-slate-500 text-center">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-[12.5px] text-slate-500 text-center">Aucune organisation trouvée.</div>
          ) : (
            filtered.map((o) => {
              const active = currentOrgId === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => { onSelect(o.id); onClose(); }}
                  className={`w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${active ? "bg-blue-50/40" : ""}`}
                >
                  <Building2 className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-slate-900 truncate">{o.name}</div>
                    {(o.clientCode || o.slug) && (
                      <div className="text-[11.5px] text-slate-500 truncate">
                        {o.clientCode ? `#${o.clientCode}` : ""}{o.clientCode && o.slug ? " · " : ""}{o.slug ?? ""}
                      </div>
                    )}
                  </div>
                  {active && <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
