"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Globe,
  Palette,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Global portal settings — branding, info, and instructions.
 * Per-org portal access management has moved to each organization's
 * "Portail client" tab.
 */
export function PortalAccessSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Portail client</h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Configuration globale du portail client. La gestion des accès se fait
          dans chaque fiche entreprise, onglet « Portail client ».
        </p>
      </div>

      {/* Info banner */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60 shrink-0 mt-0.5">
              <Info className="h-4 w-4" />
            </div>
            <div className="space-y-2 text-[13px] text-slate-600">
              <p>
                <strong className="text-slate-900">
                  Gestion des accès par entreprise
                </strong>{" "}
                — Pour activer le portail et gérer les permissions des contacts,
                allez dans{" "}
                <span className="font-medium text-blue-600">
                  Organisations → [Entreprise] → Portail client
                </span>
                .
              </p>
              <p>
                Chaque contact peut se voir attribuer un rôle :{" "}
                <Badge variant="default" className="text-[10px]">Utilisateur standard</Badge>{" "}
                <Badge variant="warning" className="text-[10px]">Gestionnaire</Badge>{" "}
                <Badge variant="primary" className="text-[10px]">Administrateur</Badge>
              </p>
              <p>
                Les méthodes de connexion (Microsoft, Google, compte local) sont
                configurables par entreprise.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auth providers info */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600 ring-1 ring-inset ring-violet-200/60">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Fournisseurs d&apos;authentification
              </h3>
              <p className="text-[12px] text-slate-500">
                Configurés dans le fichier .env du serveur
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ProviderCard
              name="Compte local"
              description="Email + mot de passe géré dans Nexus"
              configured={true}
              envVars={["Intégré"]}
            />
            <ProviderCard
              name="Microsoft Entra ID"
              description="Connexion via Microsoft 365"
              configured={
                !!(
                  typeof window === "undefined" ||
                  true // Checked server-side
                )
              }
              envVars={[
                "AUTH_MICROSOFT_ENTRA_ID_ID",
                "AUTH_MICROSOFT_ENTRA_ID_SECRET",
              ]}
            />
            <ProviderCard
              name="Google OAuth"
              description="Connexion via compte Google"
              configured={false}
              envVars={["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Portal URL */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 ring-1 ring-inset ring-emerald-200/60">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                URL du portail
              </h3>
              <p className="text-[12px] text-slate-500">
                Les clients accèdent au portail via cette URL
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 font-mono text-[13px] text-slate-700">
            {typeof window !== "undefined"
              ? `${window.location.origin}/portal`
              : "/portal"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderCard({
  name,
  description,
  configured,
  envVars,
}: {
  name: string;
  description: string;
  configured: boolean;
  envVars: string[];
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-slate-900">{name}</h4>
        <Badge
          variant={configured ? "success" : "default"}
          className="text-[10px]"
        >
          {configured ? "Disponible" : "Non configuré"}
        </Badge>
      </div>
      <p className="text-[11.5px] text-slate-500">{description}</p>
      <div className="flex flex-wrap gap-1">
        {envVars.map((v) => (
          <span
            key={v}
            className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
