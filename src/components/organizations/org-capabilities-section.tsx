"use client";

import { useEffect, useState } from "react";
import { Server, Cloud, Shield, HardDrive, Globe, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Capabilities {
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

const GROUPS: Array<{
  title: string;
  icon: typeof Server;
  color: string;
  fields: Array<{ key: keyof Capabilities; label: string; hint?: string }>;
}> = [
  {
    title: "Active Directory & identités",
    icon: Shield,
    color: "text-red-600 bg-red-50",
    fields: [
      { key: "hasAD", label: "AD local", hint: "Active Directory on-prem" },
      { key: "hasAzureAD", label: "Azure AD (legacy)" },
      { key: "hasEntra", label: "Microsoft Entra" },
    ],
  },
  {
    title: "Microsoft 365 & messagerie",
    icon: Cloud,
    color: "text-blue-600 bg-blue-50",
    fields: [
      { key: "hasM365", label: "Microsoft 365" },
      { key: "hasExchangeOnPrem", label: "Exchange on-prem" },
    ],
  },
  {
    title: "Infrastructure",
    icon: Server,
    color: "text-slate-600 bg-slate-100",
    fields: [
      { key: "hasOnPremServers", label: "Serveurs on-prem" },
      { key: "hasHyperV", label: "Hyper-V" },
      { key: "hasVMware", label: "VMware" },
      { key: "hasRDS", label: "Bureau à distance (RDS)" },
      { key: "hasVPN", label: "VPN" },
    ],
  },
  {
    title: "Sécurité & gouvernance",
    icon: Lock,
    color: "text-violet-600 bg-violet-50",
    fields: [
      { key: "hasSOC", label: "SOC / Wazuh / Bitdefender" },
      { key: "hasMDM", label: "MDM (Intune, etc.)" },
      { key: "hasKeePass", label: "KeePass / gestionnaire de mots de passe" },
    ],
  },
  {
    title: "Sauvegardes",
    icon: HardDrive,
    color: "text-amber-600 bg-amber-50",
    fields: [
      { key: "hasBackupsVeeam", label: "Veeam" },
    ],
  },
  {
    title: "Préférences",
    icon: Globe,
    color: "text-emerald-600 bg-emerald-50",
    fields: [
      { key: "allowEnglishUI", label: "Autoriser l'interface anglaise sur postes / logiciels", hint: "Peut être surchargé par logiciel" },
    ],
  },
];

export function OrgCapabilitiesSection({ organizationId }: { organizationId: string }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch(`/api/v1/organizations/${organizationId}/capabilities`);
    if (r.ok) setCaps(await r.json());
    setDirty(false);
  }
  useEffect(() => { void load(); }, [organizationId]);

  function toggle(key: keyof Capabilities) {
    setCaps((c) => (c ? { ...c, [key]: !c[key] } : c));
    setDirty(true);
  }

  async function save() {
    if (!caps || !dirty) return;
    setSaving(true);
    const r = await fetch(`/api/v1/organizations/${organizationId}/capabilities`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(caps),
    });
    setSaving(false);
    if (r.ok) await load();
  }

  if (!caps) {
    return <Card><div className="p-5 text-[12.5px] text-slate-500">Chargement…</div></Card>;
  }

  const total = GROUPS.flatMap((g) => g.fields).length;
  const active = GROUPS.flatMap((g) => g.fields).filter((f) => caps[f.key]).length;

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
                <div className="space-y-1.5">
                  {g.fields.map((f) => (
                    <label key={f.key} className="flex items-start gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={caps[f.key]}
                        onChange={() => toggle(f.key)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] text-slate-700 group-hover:text-slate-900">{f.label}</div>
                        {f.hint && <div className="text-[11px] text-slate-500">{f.hint}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
