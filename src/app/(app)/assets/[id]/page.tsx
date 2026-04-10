"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Server,
  MapPin,
  Building2,
  Calendar,
  Shield,
  Network,
  Hash,
  FileText,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface RelatedTicket {
  id: string;
  number: number;
  subject: string;
  status: string;
  date: string;
}

interface AssetDetail {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  statusTone: "success" | "default" | "warning" | "danger";
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  purchaseDate: string | null;
  warranty: string | null;
  ip: string | null;
  mac: string | null;
  notes: string | null;
  organization: { id: string; name: string } | null;
  site: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  relatedTickets: RelatedTicket[];
}

const TICKET_STATUS_MAP: Record<
  string,
  { label: string; variant: "success" | "primary" | "warning" | "default" }
> = {
  NEW: { label: "Nouveau", variant: "primary" },
  OPEN: { label: "Ouvert", variant: "primary" },
  IN_PROGRESS: { label: "En cours", variant: "warning" },
  ON_SITE: { label: "Sur site", variant: "warning" },
  PENDING: { label: "En attente", variant: "warning" },
  WAITING_CLIENT: { label: "Attente client", variant: "warning" },
  WAITING_VENDOR: { label: "Attente fournisseur", variant: "warning" },
  RESOLVED: { label: "Résolu", variant: "success" },
  CLOSED: { label: "Fermé", variant: "default" },
  CANCELLED: { label: "Annulé", variant: "default" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/v1/assets/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setAsset(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Erreur de chargement");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !asset) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
        <p className="text-[14px] font-medium text-slate-700">
          Actif introuvable
        </p>
        <p className="mt-1 text-[12.5px] text-slate-500">{error}</p>
        <Link href="/assets" className="mt-3">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Retour aux actifs
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Back + Header */}
      <div>
        <Link
          href="/assets"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux actifs
        </Link>

        <div className="mt-2 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50">
              <Server className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">
                  {asset.name}
                </h1>
                <Badge variant="primary">{asset.typeLabel}</Badge>
                <Badge variant={asset.statusTone}>{asset.statusLabel}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-neutral-500">
                {[asset.manufacturer, asset.model].filter(Boolean).join(" ") ||
                  "—"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="md">
            <Pencil className="h-4 w-4" />
            Modifier
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-neutral-400" />
                Informations générales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Fabricant" value={asset.manufacturer} />
                <Field label="Modèle" value={asset.model} />
                <Field
                  label="Numéro de série"
                  value={
                    asset.serial ? (
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                        {asset.serial}
                      </code>
                    ) : null
                  }
                />
                <Field label="Type" value={asset.typeLabel} />
                <Field
                  label="Date d'achat"
                  value={fmtDate(asset.purchaseDate)}
                />
                <Field
                  label="Garantie"
                  value={
                    <span className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-neutral-400" />
                      {fmtDate(asset.warranty)}
                    </span>
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-neutral-400" />
                Réseau
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Adresse IP" value={asset.ip} />
                <Field label="Adresse MAC" value={asset.mac} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5 text-neutral-400" />
                Tickets liés ({asset.relatedTickets.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {asset.relatedTickets.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-neutral-400">
                  Aucun ticket associé
                </p>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {asset.relatedTickets.map((t) => {
                    const cfg =
                      TICKET_STATUS_MAP[t.status] ?? {
                        label: t.status,
                        variant: "default" as const,
                      };
                    return (
                      <Link
                        key={t.id}
                        href={`/tickets/${t.id}`}
                        className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-neutral-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[11px] text-neutral-400">
                            #{t.number}
                          </p>
                          <p className="truncate text-sm font-medium text-neutral-900">
                            {t.subject}
                          </p>
                        </div>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        <span className="text-xs text-neutral-400">
                          {fmtDate(t.date)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {asset.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-neutral-700">
                  {asset.notes}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-neutral-400" />
                Organisation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {asset.organization ? (
                <Link
                  href={`/organizations/${asset.organization.id}`}
                  className="block text-sm font-medium text-blue-700 hover:underline"
                >
                  {asset.organization.name}
                </Link>
              ) : (
                <p className="text-sm text-neutral-400">—</p>
              )}
              {asset.site ? (
                <p className="flex items-center gap-1.5 text-sm text-neutral-600">
                  <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                  {asset.site.name}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-neutral-400" />
                Historique
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Field label="Créé le" value={fmtDate(asset.createdAt)} />
              <Field label="Modifié le" value={fmtDate(asset.updatedAt)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-neutral-400">{label}</p>
      <p className="mt-1 text-sm text-neutral-900">
        {value || <span className="text-neutral-300">—</span>}
      </p>
    </div>
  );
}
