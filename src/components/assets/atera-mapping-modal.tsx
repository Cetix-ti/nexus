"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Search, MapPin, Building2, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AteraCompany {
  externalId: string;
  externalName: string;
  city?: string;
  country?: string;
  isAlreadyMapped?: boolean;
}

interface Props {
  open: boolean;
  organizationName: string;
  onClose: () => void;
  onPick: (externalId: string, externalName: string) => void;
}

export function AteraMappingModal({ open, organizationName, onClose, onPick }: Props) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [companies, setCompanies] = useState<AteraCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected(null);
    setError(null);
    setLoading(true);
    fetch("/api/v1/integrations/atera/customers")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setCompanies(json.data);
        } else {
          setError(json.error || "Échec du chargement des entreprises Atera");
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return companies;
    return companies.filter((c) => c.externalName.toLowerCase().includes(q));
  }, [search, companies]);

  if (!open) return null;

  function confirm() {
    const c = companies.find((x) => x.externalId === selected);
    if (!c) return;
    onPick(c.externalId, c.externalName);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 ring-1 ring-inset ring-orange-200/60 shrink-0">
              <MapPin className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Mapper avec une entreprise Atera
              </h2>
              <p className="text-[12.5px] text-slate-500 truncate">
                Sélectionnez la entreprise Atera qui correspond à{" "}
                <strong>{organizationName}</strong> pour permettre la
                synchronisation des actifs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pt-4 shrink-0">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une entreprise Atera..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {loading ? (
            <div className="flex flex-col items-center py-12 text-[13px] text-slate-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement des entreprises Atera...
            </div>
          ) : error ? (
            <div className="text-center py-12 text-[13px] text-red-600">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-[13px] text-slate-500">
              {companies.length === 0
                ? "Aucune entreprise trouvée dans Atera"
                : `Aucune entreprise trouvée pour « ${search} »`}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((c) => {
                const isSelected = selected === c.externalId;
                return (
                  <li key={c.externalId}>
                    <button
                      type="button"
                      onClick={() => setSelected(c.externalId)}
                      disabled={c.isAlreadyMapped}
                      className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-200"
                          : c.isAlreadyMapped
                          ? "border-slate-200 bg-slate-50/50 opacity-60 cursor-not-allowed"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                      }`}
                    >
                      <div className="h-9 w-9 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 truncate">
                          {c.externalName}
                        </p>
                        <p className="text-[11.5px] text-slate-500 truncate">
                          {c.city ? `${c.city}, ` : ""}
                          {c.country || ""} · ID: {c.externalId}
                        </p>
                      </div>
                      {c.isAlreadyMapped && (
                        <span className="text-[10.5px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Déjà mappée
                        </span>
                      )}
                      {isSelected && (
                        <Check className="h-4 w-4 text-blue-600 shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={confirm} disabled={!selected}>
            Confirmer le mapping & synchroniser
          </Button>
        </div>
      </div>
    </div>
  );
}
