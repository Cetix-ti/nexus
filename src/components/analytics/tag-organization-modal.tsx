"use client";

// Modal pour attribuer un dashboard à une ou plusieurs organisations.
// Mode multi par défaut : l'utilisateur peut sélectionner plusieurs orgs
// et cliquer "Appliquer" pour valider. L'option "Global" décoche toutes
// les orgs (= visible partout).

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
  /** Orgs actuellement attribuées. Array vide = global (aucune org). */
  currentOrgIds: string[];
  /** Appelé avec la liste finale d'orgIds à l'application. Array vide = global. */
  onSave: (organizationIds: string[]) => void;
}

export function TagOrganizationModal({ open, onClose, itemLabel, itemName, currentOrgIds, onSave }: Props) {
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(currentOrgIds));

  useEffect(() => {
    if (open) setSelected(new Set(currentOrgIds));
  }, [open, currentOrgIds]);

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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearAll() { setSelected(new Set()); }
  function apply() {
    onSave(Array.from(selected));
    onClose();
  }

  if (!open) return null;

  const isGlobal = selected.size === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50">
      <div className="relative w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[85vh] bg-white sm:rounded-xl shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900 inline-flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" /> Attribuer à des organisations
            </h2>
            <p className="text-[12px] text-slate-500 mt-0.5 truncate">
              {itemLabel}{itemName ? ` : ${itemName}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-100" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-100 shrink-0 space-y-2">
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
          <div className="flex items-center gap-2 text-[11px] text-slate-600 flex-wrap">
            <span>{selected.size} sélectionnée{selected.size !== 1 ? "s" : ""}</span>
            {selected.size > 0 && (
              <button onClick={clearAll} className="text-slate-600 hover:text-slate-900 underline">
                Tout désélectionner (rendre global)
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div
            className={`flex items-start gap-2 px-3 py-2.5 border-b border-slate-100 ${isGlobal ? "bg-blue-50/40" : "bg-slate-50/40"}`}
          >
            <Globe className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-slate-900">
                {isGlobal ? "Global (visible partout)" : `Attribué à ${selected.size} organisation${selected.size > 1 ? "s" : ""}`}
              </div>
              <div className="text-[11.5px] text-slate-500">
                {isGlobal
                  ? "Aucune organisation cochée — le dashboard reste visible partout."
                  : "Le dashboard apparaît dans l'onglet Rapports de chaque organisation cochée."}
              </div>
            </div>
          </div>

          {orgs === null ? (
            <div className="px-3 py-4 text-[12.5px] text-slate-500 text-center">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-[12.5px] text-slate-500 text-center">Aucune organisation trouvée.</div>
          ) : (
            filtered.map((o) => {
              const checked = selected.has(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() => toggle(o.id)}
                  className={`w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${checked ? "bg-blue-50/40" : ""}`}
                >
                  <div className={`h-4 w-4 shrink-0 mt-0.5 rounded border ${checked ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"} flex items-center justify-center`}>
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <Building2 className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-slate-900 truncate">{o.name}</div>
                    {(o.clientCode || o.slug) && (
                      <div className="text-[11.5px] text-slate-500 truncate">
                        {o.clientCode ? `#${o.clientCode}` : ""}{o.clientCode && o.slug ? " · " : ""}{o.slug ?? ""}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-3 shrink-0 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[13px] rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={apply} className="text-[13px] rounded bg-slate-900 text-white px-3 py-1.5 hover:bg-slate-800">
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
