"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Building2, Upload, Save, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { EnrichPreviewModal } from "./enrich-preview-modal";

export interface EditOrgModalOrg {
  id: string;
  name: string;
  slug: string;
  plan: string;
  domain: string;
  isActive: boolean;
  isInternal?: boolean;
  clientCode?: string | null;
  website?: string | null;
  description?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  logo?: string | null;
  /** Alias reconnus par le décodeur de calendrier Outlook. */
  calendarAliases?: string[];
}

interface EditOrgModalProps {
  open: boolean;
  onClose: () => void;
  org: EditOrgModalOrg | null;
}

const PRIMARY_SWATCHES = [
  "#2563EB",
  "#7C3AED",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#0F172A",
];

const SECONDARY_SWATCHES = [
  "#94A3B8",
  "#64748B",
  "#A78BFA",
  "#34D399",
  "#FBBF24",
  "#F87171",
  "#F472B6",
  "#475569",
];

type Tab = "general" | "branding" | "contracts";

export function EditOrgModal({ open, onClose, org }: EditOrgModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("general");
  const [name, setName] = useState("");
  const [clientCode, setClientCode] = useState("");
  // Aliases utilisés par le décodeur de calendrier Outlook. Stockés en
  // array côté DB mais éditables via une chaîne CSV côté UI (plus
  // naturel pour saisir "LV, VDL").
  const [calendarAliases, setCalendarAliases] = useState("");
  // Patterns hostname (substring match) pour le résolveur du Centre de
  // sécurité. Stocké en array DB, édité en CSV côté UI.
  const [endpointPatterns, setEndpointPatterns] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [plan, setPlan] = useState("Standard");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  // Flag "traiter comme interne" — tous les tickets créés pour cette org
  // seront classés comme tickets internes (admin Cetix / Preventix).
  const [treatAsInternal, setTreatAsInternal] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(PRIMARY_SWATCHES[0]);
  const [secondaryColor, setSecondaryColor] = useState(SECONDARY_SWATCHES[0]);
  const [emailFooter, setEmailFooter] = useState("");
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [orgContracts, setOrgContracts] = useState<{ id: string; name: string; startDate: string | null; endDate: string | null; status: string }[]>([]);

  useEffect(() => {
    if (org) {
      setTab("general");
      setName(org.name || "");
      setClientCode(org.clientCode || "");
      setCalendarAliases(
        Array.isArray((org as { calendarAliases?: string[] }).calendarAliases)
          ? ((org as { calendarAliases?: string[] }).calendarAliases ?? []).join(", ")
          : "",
      );
      setEndpointPatterns(
        Array.isArray((org as { endpointPatterns?: string[] }).endpointPatterns)
          ? ((org as { endpointPatterns?: string[] }).endpointPatterns ?? []).join(", ")
          : "",
      );
      setSlug(org.slug || "");
      setDomain(org.domain || "");
      const orgDomains = (org as { domains?: string[] }).domains;
      setDomains(
        Array.isArray(orgDomains) && orgDomains.length > 0
          ? orgDomains
          : org.domain
          ? [org.domain]
          : []
      );
      setNewDomain("");
      setWebsite(org.website || "");
      setPhone(org.phone || "");
      setAddress(org.address || "");
      setCity(org.city || "");
      setProvince(org.province || "");
      setPostalCode(org.postalCode || "");
      setCountry(org.country || "");
      setLogo(org.logo || null);
      setPlan(org.plan || "Standard");
      setDescription(org.description || "");
      setActive(!!org.isActive);
      setTreatAsInternal(!!org.isInternal);
      setPrimaryColor(PRIMARY_SWATCHES[0]);
      setSecondaryColor(SECONDARY_SWATCHES[0]);
      setEmailFooter("");
    }
  }, [org]);

  // Fetch contracts when tab changes
  useEffect(() => {
    if (tab === "contracts" && org?.id) {
      fetch(`/api/v1/contracts?organizationId=${org.id}`)
        .then((r) => r.ok ? r.json() : [])
        .then((d) => setOrgContracts(Array.isArray(d) ? d : []))
        .catch(() => setOrgContracts([]));
    }
  }, [tab, org?.id]);

  if (!open || !org) return null;

  function reset() {
    setTab("general");
    setName("");
    setSlug("");
    setDomain("");
    setPlan("Standard");
    setDescription("");
    setActive(true);
    setPrimaryColor(PRIMARY_SWATCHES[0]);
    setSecondaryColor(SECONDARY_SWATCHES[0]);
    setEmailFooter("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org?.id) {
      handleClose();
      return;
    }
    try {
      await fetch(`/api/v1/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          domains,
          isActive: active,
          isInternal: treatAsInternal,
          clientCode: clientCode.trim().toUpperCase() || null,
          // Alias calendrier : on parse la chaîne CSV en array, normalise
          // casse/accents côté UI pour que "lv" et "LV" produisent la même
          // clé stockée, dédup, filtre les vides.
          calendarAliases: Array.from(
            new Set(
              calendarAliases
                .split(/[,;\s]+/)
                .map((a) => a.trim().toUpperCase())
                .filter((a) => a.length >= 2),
            ),
          ),
          // Patterns hostname pour le résolveur Sécurité — séparés par
          // virgules (et non par espaces, parce que les patterns peuvent
          // contenir des "-" comme "STATION-LAV").
          endpointPatterns: Array.from(
            new Set(
              endpointPatterns
                .split(/[,;\n]+/)
                .map((p) => p.trim().toUpperCase())
                .filter((p) => p.length >= 2),
            ),
          ),
          website: website || null,
          phone: phone || null,
          address: address || null,
          city: city || null,
          province: province || null,
          postalCode: postalCode || null,
          country: country || null,
          description: description || null,
        }),
      });
    } catch (err) {
      alert("Erreur : " + (err instanceof Error ? err.message : String(err)));
    }
    handleClose();
    router.refresh();
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !org?.id) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/v1/organizations/${org.id}/logo`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec");
      setLogo(data.url);
    } catch (err) {
      alert("Erreur upload logo : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  }

  async function handleLogoDelete() {
    if (!org?.id || !confirm("Supprimer le logo ?")) return;
    try {
      await fetch(`/api/v1/organizations/${org.id}/logo`, { method: "DELETE" });
      setLogo(null);
    } catch (err) {
      alert("Erreur : " + (err instanceof Error ? err.message : String(err)));
    }
  }

  const initials = (org.name || name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const TABS: { key: Tab; label: string }[] = [
    { key: "general", label: "Général" },
    { key: "branding", label: "Branding" },
    { key: "contracts", label: "Contrats" },
  ];

  const contractVariant = (s: "Actif" | "Expiré" | "Brouillon") =>
    s === "Actif" ? "success" : s === "Expiré" ? "danger" : "default";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-3xl my-8 rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm ring-1 ring-inset ring-blue-300/40">
              {initials}
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Modifier l&apos;organisation
              </h2>
              <p className="text-[12.5px] text-slate-500">{org.name}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-200 px-6 pt-3">
          {TABS.map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {tab === "general" && (
            <>
              <Input
                label="Nom de l'organisation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Code client
                  </label>
                  <input
                    value={clientCode}
                    onChange={(e) => setClientCode(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-mono text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="CTX, ACME, GLF..."
                    maxLength={12}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Code court (3-12 caractères) utilisé comme préfixe dans les
                    références : numéros de tickets, slugs, factures.
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Slug (auto)
                  </label>
                  <div className="flex rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
                    <span className="inline-flex items-center px-3 text-[13px] text-slate-500 border-r border-slate-200 bg-slate-100 rounded-l-lg">
                      /portal/
                    </span>
                    <input
                      value={(clientCode || slug).toLowerCase()}
                      readOnly
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13px] text-slate-700 focus:outline-none rounded-r-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Aliases pour le décodeur de calendrier Outlook. Utilisé
                  quand les agents tapent une abréviation différente du
                  clientCode officiel dans leurs titres (ex: "VG LV" pour
                  Louiseville alors que clientCode=VDL). */}
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Alias calendrier
                </label>
                <input
                  value={calendarAliases}
                  onChange={(e) => setCalendarAliases(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-mono text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="LV, VDL"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Codes courts (2-8 caractères) reconnus par le décodeur de
                  calendrier en plus du code client officiel. Séparer par
                  virgules. Exemple : « LV » pour que « VG LV » mappe à cette
                  organisation dans les événements Outlook.
                </p>
              </div>

              {/* Patterns hostname pour le résolveur Centre de sécurité. */}
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Patterns hostname (Centre de sécurité)
                </label>
                <input
                  value={endpointPatterns}
                  onChange={(e) => setEndpointPatterns(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-mono text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="STATION-LAV, LAB-INFO"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Substrings recherchés dans les noms d&apos;ordinateur des
                  alertes Wazuh / Bitdefender. Utile quand le poste ne suit
                  pas la convention <code>CODE-XXX</code>. Exemple : ajouter
                  « STATION-LAV » mappe automatiquement « STATION-LAV-36 »
                  à cette organisation. Séparer par virgules.
                </p>
              </div>

              {/* Logo + Website with auto-fill */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                      Logo
                    </label>
                    <div className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="logo" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-[10px] text-slate-400">Aucun</span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-1">
                      <label className="flex-1 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
                        {uploadingLogo ? "..." : "Téléverser"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleLogoUpload}
                          disabled={uploadingLogo}
                        />
                      </label>
                      {logo && (
                        <button
                          type="button"
                          onClick={handleLogoDelete}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-red-500 hover:bg-red-50"
                          title="Supprimer"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                      Site web de l&apos;entreprise
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        className="flex-1 h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        placeholder="https://cetix.ca"
                      />
                      <button
                        type="button"
                        onClick={() => setEnrichOpen(true)}
                        disabled={!website.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 px-3 py-2 text-[12.5px] font-medium text-white"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Auto-remplir
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Cliquez sur « Auto-remplir » pour extraire automatiquement
                      logo, description, téléphone et adresse depuis le site web.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Domaines
                  </label>
                  <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-2 min-h-[42px]">
                    {domains.length === 0 ? (
                      <span className="text-[12px] text-slate-400 px-1">
                        Aucun domaine
                      </span>
                    ) : (
                      domains.map((d, idx) => (
                        <span
                          key={d}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md pl-2 pr-1 py-0.5 text-[12px] font-medium ring-1 ring-inset",
                            idx === 0
                              ? "bg-blue-50 text-blue-700 ring-blue-200"
                              : "bg-slate-50 text-slate-600 ring-slate-200"
                          )}
                        >
                          {idx === 0 ? (
                            <span className="mr-0.5 rounded bg-blue-100 px-1 text-[9px] uppercase tracking-wider text-blue-700">
                              Principal
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setDomains((prev) => [d, ...prev.filter((x) => x !== d)])
                              }
                              className="mr-0.5 rounded bg-slate-100 px-1 text-[9px] uppercase tracking-wider text-slate-500 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                              title="Définir comme domaine principal"
                            >
                              Promouvoir
                            </button>
                          )}
                          {d}
                          <button
                            type="button"
                            onClick={() =>
                              setDomains((prev) =>
                                prev.filter((x) => x !== d)
                              )
                            }
                            className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-red-100 hover:text-red-600"
                            aria-label={`Retirer ${d}`}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      type="text"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const v = newDomain.trim().toLowerCase();
                          if (v && !domains.includes(v)) {
                            setDomains((p) => [...p, v]);
                            setNewDomain("");
                          }
                        }
                      }}
                      placeholder="ajouter un domaine + Entrée"
                      className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = newDomain.trim().toLowerCase();
                        if (v && !domains.includes(v)) {
                          setDomains((p) => [...p, v]);
                          setNewDomain("");
                        }
                      }}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      +
                    </button>
                  </div>
                  <p className="mt-1 text-[10.5px] text-slate-500">
                    Le premier domaine est utilisé comme domaine principal.
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                    Plan
                  </label>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Standard">Standard</SelectItem>
                      <SelectItem value="Premium">Premium</SelectItem>
                      <SelectItem value="Enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Brève description de l'organisation..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Téléphone principal"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 514 555-0100"
                />
                <Input
                  label="Adresse"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="1234 rue Saint-Denis"
                />
                <Input
                  label="Ville"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Montréal"
                />
                <Input
                  label="Province / État"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="QC"
                />
                <Input
                  label="Code postal"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="H2X 1K9"
                />
                <Input
                  label="Pays"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Canada"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-slate-900">
                    Organisation active
                  </p>
                  <p className="text-[12.5px] text-slate-500">
                    Désactiver suspend l&apos;accès au portail client
                  </p>
                </div>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
                <div className="flex-1 pr-3">
                  <p className="text-[13px] font-medium text-slate-900">
                    Traiter les tickets de cette compagnie comme des tickets internes
                  </p>
                  <p className="text-[12.5px] text-slate-500">
                    À activer pour Cetix (admin) ou toute filiale administrative
                    (ex: Preventix). Les tickets créés pour cette org seront exclus
                    des vues clients et apparaitront dans « Tickets internes ».
                  </p>
                </div>
                <Switch checked={treatAsInternal} onCheckedChange={setTreatAsInternal} />
              </div>
            </>
          )}

          {tab === "branding" && (
            <>
              <div>
                <label className="mb-2 block text-[13px] font-medium text-slate-700">
                  Couleur primaire
                </label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {PRIMARY_SWATCHES.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setPrimaryColor(c)}
                      className={cn(
                        "h-9 w-9 rounded-lg ring-1 ring-inset ring-slate-200 transition-transform",
                        primaryColor === c &&
                          "ring-2 ring-offset-2 ring-blue-600 scale-105"
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                  <span className="ml-2 text-[12px] font-mono text-slate-500">
                    {primaryColor}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[13px] font-medium text-slate-700">
                  Couleur secondaire
                </label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {SECONDARY_SWATCHES.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setSecondaryColor(c)}
                      className={cn(
                        "h-9 w-9 rounded-lg ring-1 ring-inset ring-slate-200 transition-transform",
                        secondaryColor === c &&
                          "ring-2 ring-offset-2 ring-blue-600 scale-105"
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                  <span className="ml-2 text-[12px] font-mono text-slate-500">
                    {secondaryColor}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Logo dans les emails
                </label>
                <div className="flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer">
                  <div className="text-center">
                    <Upload className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-1 text-[12px] text-slate-500">
                      PNG, max. 1 Mo
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Pied de page personnalisé
                </label>
                <textarea
                  value={emailFooter}
                  onChange={(e) => setEmailFooter(e.target.value)}
                  rows={4}
                  placeholder="Texte affiché au bas des emails sortants..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>
            </>
          )}

          {tab === "contracts" && (
            <div className="space-y-3">
              {orgContracts.length > 0 ? orgContracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center ring-1 ring-inset ring-blue-200/60">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-slate-900 truncate">{c.name}</p>
                      <p className="text-[12px] text-slate-500">
                        {c.startDate ? new Date(c.startDate).toLocaleDateString("fr-CA") : "—"} —{" "}
                        {c.endDate ? new Date(c.endDate).toLocaleDateString("fr-CA") : "—"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={contractVariant(c.status === "ACTIVE" ? "Actif" : c.status === "EXPIRED" ? "Expiré" : "Brouillon")}>{c.status === "ACTIVE" ? "Actif" : c.status === "EXPIRED" ? "Expiré" : c.status}</Badge>
                </div>
              )) : (
                <p className="text-center text-[13px] text-slate-400 py-6">Aucun contrat pour cette organisation</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              <Save className="h-4 w-4" strokeWidth={2.5} />
              Enregistrer
            </Button>
          </div>
        </form>
      </div>

      <EnrichPreviewModal
        open={enrichOpen}
        organizationId={org.id}
        organizationName={org.name}
        initialWebsite={website}
        currentValues={{
          logo,
          description,
          phone,
          address,
          city,
          province,
          postalCode,
          country,
          domain,
        }}
        onClose={() => setEnrichOpen(false)}
        onApplied={(applied) => {
          // Update local state so the edit modal reflects the enriched values
          if (applied.logo != null) setLogo(applied.logo as string);
          if (applied.description != null) setDescription(applied.description as string);
          if (applied.phone != null) setPhone(applied.phone as string);
          if (applied.address != null) setAddress(applied.address as string);
          if (applied.city != null) setCity(applied.city as string);
          if (applied.province != null) setProvince(applied.province as string);
          if (applied.postalCode != null) setPostalCode(applied.postalCode as string);
          if (applied.country != null) setCountry(applied.country as string);
          if (applied.website != null) setWebsite(applied.website as string);
          router.refresh();
        }}
      />
    </div>
  );
}
