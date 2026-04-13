"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Loader2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EnrichmentResult {
  source: string;
  name?: string;
  description?: string;
  logo?: string;
  phones: string[];
  emails: string[];
  address?: {
    street?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    country?: string;
  };
  socialLinks: {
    linkedin?: string;
    facebook?: string;
    twitter?: string;
    instagram?: string;
    youtube?: string;
  };
  warnings: string[];
}

interface Props {
  open: boolean;
  organizationId: string;
  organizationName: string;
  currentValues: {
    logo?: string | null;
    description?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    country?: string | null;
    domain?: string | null;
  };
  initialWebsite?: string;
  onClose: () => void;
  onApplied: (applied: Record<string, string | boolean>) => void;
}

interface FieldChoice {
  key: string;
  label: string;
  newValue: string;
  currentValue: string | null | undefined;
  selected: boolean;
}

export function EnrichPreviewModal({
  open,
  organizationId,
  organizationName,
  currentValues,
  initialWebsite,
  onClose,
  onApplied,
}: Props) {
  const [website, setWebsite] = useState(initialWebsite || "");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<FieldChoice[]>([]);

  useEffect(() => {
    if (open) {
      setWebsite(initialWebsite || "");
      setResult(null);
      setError(null);
      setChoices([]);
    }
  }, [open, initialWebsite]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  async function runEnrichment() {
    if (!website.trim()) {
      setError("Veuillez saisir une URL de site web");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = website.startsWith("http") ? website : `https://${website}`;
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/enrich`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website: url }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Échec de l'enrichissement");
      }
      const data: EnrichmentResult = json.data;
      setResult(data);
      buildChoices(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function buildChoices(data: EnrichmentResult) {
    const c: FieldChoice[] = [];

    if (data.logo) {
      c.push({
        key: "logo",
        label: "Logo",
        newValue: data.logo,
        currentValue: currentValues.logo,
        selected: !currentValues.logo,
      });
    }
    if (data.description) {
      c.push({
        key: "description",
        label: "Description",
        newValue: data.description,
        currentValue: currentValues.description,
        selected: !currentValues.description,
      });
    }
    if (data.phones.length > 0) {
      c.push({
        key: "phone",
        label: "Téléphone principal",
        newValue: data.phones[0],
        currentValue: currentValues.phone,
        selected: !currentValues.phone,
      });
    }
    if (data.address?.street) {
      c.push({
        key: "address",
        label: "Adresse",
        newValue: data.address.street,
        currentValue: currentValues.address,
        selected: !currentValues.address,
      });
    }
    if (data.address?.city) {
      c.push({
        key: "city",
        label: "Ville",
        newValue: data.address.city,
        currentValue: currentValues.city,
        selected: !currentValues.city,
      });
    }
    if (data.address?.province) {
      c.push({
        key: "province",
        label: "Province / État",
        newValue: data.address.province,
        currentValue: currentValues.province,
        selected: !currentValues.province,
      });
    }
    if (data.address?.postalCode) {
      c.push({
        key: "postalCode",
        label: "Code postal",
        newValue: data.address.postalCode,
        currentValue: currentValues.postalCode,
        selected: !currentValues.postalCode,
      });
    }
    if (data.address?.country) {
      c.push({
        key: "country",
        label: "Pays",
        newValue: data.address.country,
        currentValue: currentValues.country,
        selected: !currentValues.country,
      });
    }
    setChoices(c);
  }

  function toggleChoice(key: string) {
    setChoices((prev) =>
      prev.map((c) => (c.key === key ? { ...c, selected: !c.selected } : c))
    );
  }

  async function applySelected() {
    setApplying(true);
    try {
      const patch: any = { website };
      for (const c of choices) {
        if (c.selected) {
          patch[c.key] = c.newValue;
          if (c.key === "logo") patch.logoOverridden = false;
        }
      }
      const res = await fetch(`/api/v1/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Échec de la sauvegarde");
      }
      onApplied(patch);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60">
              <Sparkles className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Auto-remplir depuis le site web
              </h2>
              <p className="text-[12.5px] text-slate-500">
                {organizationName}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* URL input */}
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">
              URL du site web
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://cetix.ca"
                className="flex-1 h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                onKeyDown={(e) => {
                  if (e.key === "Enter") runEnrichment();
                }}
              />
              <Button
                variant="primary"
                onClick={runEnrichment}
                disabled={loading || !website.trim()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Analyser
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <>
              {result.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-[12px] text-amber-900">
                  {result.warnings.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}

              {choices.length === 0 ? (
                <div className="text-center py-12 text-[13px] text-slate-500">
                  Aucune donnée extraite du site.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                    Cochez les champs à appliquer
                  </p>
                  {choices.map((c) => (
                    <label
                      key={c.key}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 cursor-pointer hover:bg-slate-50/60"
                    >
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => toggleChoice(c.key)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900">
                          {c.label}
                        </p>
                        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                          <div>
                            <p className="text-slate-400 mb-0.5">Actuel</p>
                            <p className="text-slate-600 truncate">
                              {c.currentValue || (
                                <em className="text-slate-300">vide</em>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-emerald-600 mb-0.5">Nouveau</p>
                            {c.key === "logo" ? (
                              <img
                                src={c.newValue}
                                alt="logo"
                                className="h-12 w-12 rounded object-contain border border-slate-200 bg-white"
                              />
                            ) : (
                              <p className="text-slate-900 font-medium truncate">
                                {c.newValue}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Social links readonly preview */}
              {Object.values(result.socialLinks).some(Boolean) && (
                <div className="rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Réseaux sociaux détectés
                  </p>
                  <div className="space-y-1 text-[12px]">
                    {Object.entries(result.socialLinks).map(([k, v]) =>
                      v ? (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-slate-500 w-20 capitalize">{k}</span>
                          <a
                            href={v}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline truncate"
                          >
                            {v}
                          </a>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={applySelected}
            disabled={!result || choices.filter((c) => c.selected).length === 0 || applying}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Appliquer la sélection
          </Button>
        </div>
      </div>
    </div>
  );
}
