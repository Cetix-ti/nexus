"use client";

import { useState } from "react";
import Link from "next/link";
import { Monitor, Package, ExternalLink } from "lucide-react";
import { OrgAssetsTab } from "@/components/assets/org-assets-tab";
import { OrgAssetsEngagementsTab } from "@/components/assets/org-assets-engagements-tab";

/** Wrapper avec sous-onglets internes : Matériel / Logiciels (→ redirect) / Engagements. */
export function OrgAssetsTabWrapper({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [sub, setSub] = useState<"material" | "engagements">("material");

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
        <Link
          href={`/software?orgId=${organizationId}`}
          className="px-3 py-2 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 border-transparent text-slate-500 hover:text-slate-700"
        >
          <Package className="h-3.5 w-3.5" /> Logiciels
          <ExternalLink className="h-3 w-3 opacity-50" />
        </Link>
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
      {sub === "engagements" && (
        <OrgAssetsEngagementsTab organizationId={organizationId} />
      )}
    </div>
  );
}
