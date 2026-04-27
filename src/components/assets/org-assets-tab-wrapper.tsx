"use client";

import { useState } from "react";
import { Monitor, Package } from "lucide-react";
import { OrgAssetsTab } from "@/components/assets/org-assets-tab";
import { OrgAssetsEngagementsTab } from "@/components/assets/org-assets-engagements-tab";
import { OrgSoftwareTab } from "@/components/software/org-software-tab";

/**
 * Wrapper avec 3 sous-onglets internes : Matériel / Logiciels / Engagements.
 *
 * Le sous-onglet "Logiciels" rend `OrgSoftwareTab` inline (pas de
 * redirect vers /software) — l'utilisateur reste dans le contexte de
 * l'organisation. Le composant `OrgSoftwareTab` consomme déjà les mêmes
 * endpoints que la page standalone (`/api/v1/software/instances?orgId=…`),
 * donc l'éditrion / création / suppression depuis ici est strictement
 * équivalente à la page dédiée.
 */
export function OrgAssetsTabWrapper({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [sub, setSub] = useState<"material" | "software" | "engagements">("material");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto -mx-6 px-6 sm:-mx-0 sm:px-0">
        <button
          onClick={() => setSub("material")}
          className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${
            sub === "material" ? "border-blue-500 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Monitor className="h-3.5 w-3.5" /> Matériel & inventaire
        </button>
        <button
          onClick={() => setSub("software")}
          className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${
            sub === "software" ? "border-blue-500 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Package className="h-3.5 w-3.5" /> Logiciels
        </button>
        <button
          onClick={() => setSub("engagements")}
          className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 ${
            sub === "engagements" ? "border-blue-500 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Garanties · Abonnements · Support · Renouvellements
        </button>
      </div>

      {sub === "material" && (
        <OrgAssetsTab organizationId={organizationId} organizationName={organizationName} />
      )}
      {sub === "software" && (
        <OrgSoftwareTab organizationId={organizationId} organizationName={organizationName} />
      )}
      {sub === "engagements" && (
        <OrgAssetsEngagementsTab organizationId={organizationId} />
      )}
    </div>
  );
}
