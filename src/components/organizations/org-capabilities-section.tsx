"use client";

import { useEffect, useState } from "react";
import { Server, Cloud, Shield, HardDrive, Globe, Lock, Phone, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface MainCaps {
  hasAD: boolean;
  hasAzureAD: boolean;
  hasEntra: boolean;
  hasM365: boolean;
  hasExchangeOnPrem: boolean;
  hasVPN: boolean;
  hasRDS: boolean;
  hasHyperV: boolean;
  hasVMware: boolean;
  hasOnPremServers: boolean;
  hasBackupsVeeam: boolean;
  hasSOC: boolean;
  hasMDM: boolean;
  hasKeePass: boolean;
  allowEnglishUI: boolean;
}

type ExtrasValue = boolean | string | string[];
type Extras = Record<string, ExtrasValue>;

type FieldDef = {
  boolKey?: keyof MainCaps;
  extrasKey?: string;
  label: string;
  hint?: string;
  withText?: { extrasKey: string; placeholder: string };
  withSelect?: { extrasKey: string; options: string[]; placeholder?: string };
  withMultiSelect?: {
    extrasKey: string;
    options: string[];
    providerKey?: string;
    providerPlaceholder?: string;
  };
};

const GROUPS: Array<{
  title: string;
  icon: typeof Server;
  color: string;
  fields: FieldDef[];
}> = [
  {
    title: "Active Directory & identités",
    icon: Shield,
    color: "text-red-600 bg-red-50",
    fields: [
      { boolKey: "hasAD", label: "AD local", hint: "Active Directory on-prem" },
      { boolKey: "hasAzureAD", label: "Azure AD (legacy)" },
      { boolKey: "hasEntra", label: "Microsoft Entra" },
      { extrasKey: "mfa", label: "Authentification multi-facteurs (MFA)" },
    ],
  },
  {
    title: "Microsoft 365 & messagerie",
    icon: Cloud,
    color: "text-blue-600 bg-blue-50",
    fields: [
      { boolKey: "hasM365", label: "Microsoft 365" },
      { boolKey: "hasExchangeOnPrem", label: "Exchange on-prem" },
    ],
  },
  {
    title: "Infrastructure",
    icon: Server,
    color: "text-slate-600 bg-slate-100",
    fields: [
      { boolKey: "hasOnPremServers", label: "Serveurs on-prem" },
      { boolKey: "hasHyperV", label: "Hyper-V" },
      { boolKey: "hasVMware", label: "VMware" },
      { boolKey: "hasRDS", label: "Bureau à distance (RDS)" },
      { boolKey: "hasVPN", label: "VPN" },
    ],
  },
  {
    title: "Sécurité & gouvernance",
    icon: Lock,
    color: "text-violet-600 bg-violet-50",
    fields: [
      { boolKey: "hasSOC", label: "SOC / SIEM" },
      { boolKey: "hasMDM", label: "MDM (Intune, etc.)" },
      { boolKey: "hasKeePass", label: "Gestionnaire de mots de passe" },
      { extrasKey: "darkWebMonitoringCetix", label: "Surveillance du dark web (Cetix)" },
      { extrasKey: "darkWebMonitoringOther", label: "Surveillance du dark web (autre fournisseur)" },
      { extrasKey: "backupsImmutable", label: "Sauvegardes immuables" },
      { extrasKey: "wazuh", label: "Wazuh" },
      { extrasKey: "vulnScanCetix", label: "Analyse de vulnérabilités en continu (Cetix)" },
      { extrasKey: "vulnScanOther", label: "Analyse de vulnérabilités en continu (autre fournisseur)" },
      {
        extrasKey: "ngfw",
        label: "Pare-feu nouvelle génération (NGFW)",
        withText: { extrasKey: "ngfwProduct", placeholder: "Fabricant / produit…" },
      },
      {
        extrasKey: "edr",
        label: "EDR",
        withText: { extrasKey: "edrProduct", placeholder: "Nom du produit EDR…" },
      },
      {
        extrasKey: "xdr",
        label: "XDR",
        withText: { extrasKey: "xdrProduct", placeholder: "Nom du produit XDR…" },
      },
      {
        extrasKey: "antiMalware",
        label: "Anti-malware",
        withText: { extrasKey: "antiMalwareProduct", placeholder: "Nom du produit…" },
      },
      {
        extrasKey: "antispam",
        label: "Antispam",
        withText: { extrasKey: "antispamProduct", placeholder: "Nom du produit…" },
      },
      {
        extrasKey: "backupsRestoreTests",
        label: "Tests de restauration des sauvegardes",
        withSelect: {
          extrasKey: "backupsRestoreTestsFrequency",
          placeholder: "Fréquence…",
          options: ["Hebdomadaire", "Mensuelle", "Trimestrielle", "Semestrielle", "Annuelle", "Ad hoc"],
        },
      },
    ],
  },
  {
    title: "Sauvegardes",
    icon: HardDrive,
    color: "text-amber-600 bg-amber-50",
    fields: [
      { boolKey: "hasBackupsVeeam", label: "Veeam" },
      { extrasKey: "backupsOffsiteCetixOnPrem", label: "Hors site chez Cetix (on-premise)" },
      { extrasKey: "backupsOffsiteCetixCloud", label: "Hors site chez Cetix (cloud)" },
      {
        extrasKey: "backupsM365",
        label: "Sauvegardes Microsoft 365",
        withMultiSelect: {
          extrasKey: "backupsM365Services",
          options: ["Exchange / Outlook", "SharePoint", "OneDrive", "Teams", "Calendriers & contacts"],
          providerKey: "backupsM365Provider",
          providerPlaceholder: "Fournisseur de sauvegarde M365…",
        },
      },
      { extrasKey: "backupsCloud", label: "Sauvegardes infonuagiques (serveurs / actifs on-premise)" },
    ],
  },
  {
    title: "Surveillance & supervision",
    icon: Eye,
    color: "text-cyan-600 bg-cyan-50",
    fields: [
      { extrasKey: "infraMonitoringCetix", label: "Surveillance des infrastructures (Cetix)" },
      { extrasKey: "infraMonitoringOther", label: "Surveillance des infrastructures (autre fournisseur)" },
      { extrasKey: "rmmCetix", label: "RMM / Surveillance des appareils (Cetix)" },
      { extrasKey: "rmmOther", label: "RMM / Surveillance des appareils (autre fournisseur)" },
    ],
  },
  {
    title: "Téléphonie",
    icon: Phone,
    color: "text-teal-600 bg-teal-50",
    fields: [
      { extrasKey: "voipCloud", label: "Téléphonie cloud" },
      { extrasKey: "voipOnPrem", label: "Téléphonie on-premise" },
    ],
  },
  {
    title: "Préférences",
    icon: Globe,
    color: "text-emerald-600 bg-emerald-50",
    fields: [
      {
        boolKey: "allowEnglishUI",
        label: "Autoriser l'interface anglaise sur postes / logiciels",
        hint: "Peut être surchargé par logiciel",
      },
    ],
  },
];

export function OrgCapabilitiesSection({ organizationId }: { organizationId: string }) {
  const [caps, setCaps] = useState<MainCaps | null>(null);
  const [extras, setExtras] = useState<Extras>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch(`/api/v1/organizations/${organizationId}/capabilities`);
    if (r.ok) {
      const data = await r.json() as MainCaps & { extras?: Extras };
      setCaps(data);
      setExtras((data.extras as Extras) ?? {});
    }
    setDirty(false);
  }
  useEffect(() => { void load(); }, [organizationId]);

  function toggleMain(key: keyof MainCaps) {
    setCaps((c) => (c ? { ...c, [key]: !c[key] } : c));
    setDirty(true);
  }

  function toggleExtras(key: string) {
    setExtras((e) => ({ ...e, [key]: !e[key] }));
    setDirty(true);
  }

  function setExtrasValue(key: string, value: ExtrasValue) {
    setExtras((e) => ({ ...e, [key]: value }));
    setDirty(true);
  }

  function toggleMultiItem(listKey: string, item: string) {
    setExtras((e) => {
      const cur = (e[listKey] as string[]) ?? [];
      const next = cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
      return { ...e, [listKey]: next };
    });
    setDirty(true);
  }

  async function save() {
    if (!caps || !dirty) return;
    setSaving(true);
    const r = await fetch(`/api/v1/organizations/${organizationId}/capabilities`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...caps, extras }),
    });
    setSaving(false);
    if (r.ok) await load();
  }

  if (!caps) {
    return <Card><div className="p-5 text-[12.5px] text-slate-500">Chargement…</div></Card>;
  }

  function isEnabled(f: FieldDef): boolean {
    if (f.boolKey) return !!caps![f.boolKey];
    if (f.extrasKey) return !!extras[f.extrasKey];
    return false;
  }

  function handleToggle(f: FieldDef) {
    if (f.boolKey) toggleMain(f.boolKey);
    else if (f.extrasKey) toggleExtras(f.extrasKey);
  }

  const allFields = GROUPS.flatMap((g) => g.fields);
  const total = allFields.length;
  const active = allFields.filter((f) => isEnabled(f)).length;

  return (
    <Card>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900">Environnement technique</h3>
            <p className="mt-0.5 text-[11.5px] text-slate-500">
              {active}/{total} capacités activées. Contrôle l'affichage conditionnel des sections Politiques / Logiciels / Actifs.
            </p>
          </div>
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            {saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.title} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center ${g.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <h4 className="text-[12.5px] font-semibold text-slate-900">{g.title}</h4>
                </div>
                <div className="space-y-2">
                  {g.fields.map((f, fi) => {
                    const enabled = isEnabled(f);
                    const key = f.boolKey ?? f.extrasKey ?? String(fi);
                    return (
                      <div key={key}>
                        <label className="flex items-start gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handleToggle(f)}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] text-slate-700 group-hover:text-slate-900">{f.label}</div>
                            {f.hint && <div className="text-[11px] text-slate-500">{f.hint}</div>}
                          </div>
                        </label>

                        {enabled && f.withText && (
                          <div className="ml-5 mt-1">
                            <input
                              type="text"
                              value={(extras[f.withText.extrasKey] as string) ?? ""}
                              onChange={(e) => setExtrasValue(f.withText!.extrasKey, e.target.value)}
                              placeholder={f.withText.placeholder}
                              className="w-full rounded border border-slate-200 px-2 py-1 text-[12px] text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400/30"
                            />
                          </div>
                        )}

                        {enabled && f.withSelect && (
                          <div className="ml-5 mt-1">
                            <select
                              value={(extras[f.withSelect.extrasKey] as string) ?? ""}
                              onChange={(e) => setExtrasValue(f.withSelect!.extrasKey, e.target.value)}
                              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400/30"
                            >
                              <option value="">{f.withSelect.placeholder ?? "Sélectionner…"}</option>
                              {f.withSelect.options.map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {enabled && f.withMultiSelect && (
                          <div className="ml-5 mt-1.5 space-y-1">
                            {f.withMultiSelect.options.map((o) => {
                              const ms = f.withMultiSelect!;
                              const checked = ((extras[ms.extrasKey] as string[]) ?? []).includes(o);
                              return (
                                <label key={o} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleMultiItem(ms.extrasKey, o)}
                                    className="h-3 w-3 shrink-0"
                                  />
                                  <span className="text-[11.5px] text-slate-600">{o}</span>
                                </label>
                              );
                            })}
                            {f.withMultiSelect.providerKey && (
                              <input
                                type="text"
                                value={(extras[f.withMultiSelect.providerKey] as string) ?? ""}
                                onChange={(e) =>
                                  setExtrasValue(f.withMultiSelect!.providerKey!, e.target.value)
                                }
                                placeholder={f.withMultiSelect.providerPlaceholder ?? "Fournisseur…"}
                                className="w-full rounded border border-slate-200 px-2 py-1 text-[12px] text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400/30 mt-1"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
