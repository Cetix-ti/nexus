"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Affichage propre quand le portail refuse une section (flag désactivé / rôle). */
export function PortalAccessRestricted({ title }: { title: string }) {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Card>
        <div className="p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Lock className="h-5 w-5 text-slate-500" />
          </div>
          <h1 className="text-[17px] font-semibold text-slate-900">{title}</h1>
          <p className="mt-2 text-[13px] text-slate-600 leading-relaxed">
            Cette section n'est pas accessible avec vos permissions actuelles.
          </p>
          <p className="mt-1 text-[12px] text-slate-500">
            Si vous pensez y avoir droit, contactez votre administrateur.
          </p>
          <Link href="/portal" className="mt-5 inline-flex items-center text-[12.5px] text-blue-600 hover:text-blue-700">
            Retour au tableau de bord
          </Link>
        </div>
      </Card>
    </div>
  );
}
